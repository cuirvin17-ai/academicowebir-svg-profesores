const express = require('express');
const router = express.Router();


router.get('/view', (req, res) => {
    const db = req.db;
    res.render('informes');
});

router.get('/materias', async (req, res) => {
    const db = req.db;
    const user = req.session.user;
    try {
        let query = `
            SELECT MIN(g.id) as id, g.nombre_grupo, g.materia_id, m.nombre_materia, m.curso, m.paralelo, m.especialidad,
                   COUNT(g.estudiante_id) as total_estudiantes
            FROM grupos g
            INNER JOIN materias m ON g.materia_id = m.id
        `;
        const params = [];
        if (user.rol === 'docente') {
            query += ' WHERE m.docente_id = ?';
            params.push(user.id);
        }
        query += ' GROUP BY g.nombre_grupo, g.materia_id, m.nombre_materia, m.curso, m.paralelo, m.especialidad ORDER BY m.nombre_materia';
        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/acta/:grupo_id/trimestre/:trimestre', async (req, res) => {
    const db = req.db;
    const { grupo_id, trimestre } = req.params;
    try {
        const [grupoInfo] = await db.query(
            'SELECT nombre_grupo, materia_id FROM grupos WHERE id = ? LIMIT 1',
            [grupo_id]
        );
        if (grupoInfo.length === 0) return res.json({ error: 'Grupo no encontrado' });
        const { nombre_grupo, materia_id } = grupoInfo[0];

        const [materiaInfo] = await db.query('SELECT nombre_materia, curso, paralelo, especialidad FROM materias WHERE id = ?', [materia_id]);
        const materia = materiaInfo.length > 0 ? materiaInfo[0] : {};

        let pctTareas = 70, pctProyecto = 15, pctExamen = 15;
        const [configPctActa] = await db.query(
            'SELECT promedio_tareas, proyecto, examen FROM configuracion_porcentajes_materia_curso WHERE materia_id = ? AND curso = ? AND paralelo = ? AND (especialidad = ? OR (especialidad IS NULL AND ? IS NULL))',
            [materia_id, materia.curso, materia.paralelo, materia.especialidad, materia.especialidad]
        );
        if (configPctActa.length > 0) {
            pctTareas = parseFloat(configPctActa[0].promedio_tareas) ?? 70;
            pctProyecto = parseFloat(configPctActa[0].proyecto) ?? 15;
            pctExamen = parseFloat(configPctActa[0].examen) ?? 15;
        } else {
            const [pctsActa] = await db.query('SELECT concepto, porcentaje FROM configuracion_porcentajes');
            const pctMapActa = {};
            pctsActa.forEach(p => { pctMapActa[p.concepto] = parseFloat(p.porcentaje); });
            pctTareas = pctMapActa['promedio_tareas'] ?? 70;
            pctProyecto = pctMapActa['proyecto'] ?? 15;
            pctExamen = pctMapActa['examen'] ?? 15;
        }

        const [estudiantes] = await db.query(`
            SELECT g.id as grupo_id, e.cedula, e.nombres_apellidos, e.sexo, e.discapacidad,
                   e.curso, e.paralelo, e.especialidad
            FROM grupos g
            INNER JOIN estudiantes e ON g.estudiante_id = e.id AND e.activo = 1
            WHERE g.nombre_grupo = ? AND g.materia_id = ?
            ORDER BY e.nombres_apellidos
        `, [nombre_grupo, materia_id]);

        const resultado = [];
        for (const est of estudiantes) {
            const [notas] = await db.query(
                'SELECT nota, tipo, indice FROM notas WHERE grupo_id = ? AND trimestre = ?',
                [est.grupo_id, trimestre]
            );
            const tareas = notas.filter(n => n.tipo === 'tarea').map(n => parseFloat(n.nota) || 0);
            const proyectos = notas.filter(n => n.tipo === 'proyecto');
            const examenes = notas.filter(n => n.tipo === 'examen');

            let promTareas = 0;
            if (tareas.length > 0) promTareas = tareas.reduce((a, b) => a + b, 0) / tareas.length;

            let proyFinal = 0;
            if (proyectos.length > 0) {
                const notasP = proyectos.filter(p => p.indice === 0).map(p => parseFloat(p.nota) || 0);
                const drs = proyectos.filter(p => p.indice === 1).map(p => parseFloat(p.nota) || 0);
                const prs = proyectos.filter(p => p.indice === 2).map(p => parseFloat(p.nota) || 0);
                const notaP = notasP.length > 0 ? notasP[0] : 0;
                const dr = drs.length > 0 ? drs[0] : 0;
                const pr = prs.length > 0 ? prs[0] : 0;
                proyFinal = Math.max(notaP, (notaP + dr + pr) / 3);
            }

            let exaFinal = 0;
            if (examenes.length > 0) {
                const notasE = examenes.filter(e => e.indice === 0).map(e => parseFloat(e.nota) || 0);
                const dres = examenes.filter(e => e.indice === 1).map(e => parseFloat(e.nota) || 0);
                const ers = examenes.filter(e => e.indice === 2).map(e => parseFloat(e.nota) || 0);
                const notaE = notasE.length > 0 ? notasE[0] : 0;
                const dre = dres.length > 0 ? dres[0] : 0;
                const er = ers.length > 0 ? ers[0] : 0;
                exaFinal = Math.max(notaE, (notaE + dre + er) / 3);
            }

            const notaFinal = (promTareas * pctTareas + proyFinal * pctProyecto + exaFinal * pctExamen) / 100;

            const [asis] = await db.query(`
                SELECT COUNT(*) as total,
                       SUM(CASE WHEN estado = 'presente' THEN 1 ELSE 0 END) as asistencias
                FROM asistencias WHERE grupo_id = ?
            `, [est.grupo_id]);
            const totalClases = asis.length > 0 ? asis[0].total : 0;
            const asistencias = asis.length > 0 ? asis[0].asistencias : 0;
            const pctAsistencia = totalClases > 0 ? ((asistencias / totalClases) * 100).toFixed(1) : 0;

            resultado.push({
                cedula: est.cedula,
                nombres_apellidos: est.nombres_apellidos,
                sexo: est.sexo,
                discapacidad: est.discapacidad,
                prom_tareas: promTareas.toFixed(2),
                proyecto_final: proyFinal.toFixed(2),
                examen_final: exaFinal.toFixed(2),
                nota_final: notaFinal.toFixed(2),
                total_clases: totalClases,
                asistencias: asistencias,
                pct_asistencia: pctAsistencia
            });
        }

        res.json({
            materia: materia.nombre_materia,
            curso: materia.curso,
            paralelo: materia.paralelo,
            especialidad: materia.especialidad,
            nombre_grupo,
            trimestre,
            porcentajes: { tareas: pctTareas, proyecto: pctProyecto, examen: pctExamen },
            estudiantes: resultado
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/asignatura/:grupo_id/trimestre/:trimestre', async (req, res) => {
    const db = req.db;
    const { grupo_id, trimestre } = req.params;
    try {
        const [grupoInfo] = await db.query('SELECT materia_id FROM grupos WHERE id = ?', [grupo_id]);
        if (grupoInfo.length === 0) return res.status(404).json({ error: 'Grupo no encontrado' });
        const materia_id = grupoInfo[0].materia_id;

        const [materiaInfo] = await db.query('SELECT m.*, u.nombre as profesor FROM materias m LEFT JOIN usuarios u ON m.docente_id = u.id WHERE m.id = ?', [materia_id]);
        if (materiaInfo.length === 0) return res.status(404).json({ error: 'Materia no encontrada' });
        const materia = materiaInfo[0];

        let pctTareas = 70, pctProyecto = 15, pctExamen = 15;
        const [configPct1] = await db.query(
            'SELECT promedio_tareas, proyecto, examen FROM configuracion_porcentajes_materia_curso WHERE materia_id = ? AND curso = ? AND paralelo = ? AND (especialidad = ? OR (especialidad IS NULL AND ? IS NULL))',
            [materia_id, materia.curso, materia.paralelo, materia.especialidad, materia.especialidad]
        );
        if (configPct1.length > 0) {
            pctTareas = parseFloat(configPct1[0].promedio_tareas) ?? 70;
            pctProyecto = parseFloat(configPct1[0].proyecto) ?? 15;
            pctExamen = parseFloat(configPct1[0].examen) ?? 15;
        } else {
            const [pcts] = await db.query('SELECT concepto, porcentaje FROM configuracion_porcentajes');
            const pctMap = {};
            pcts.forEach(p => { pctMap[p.concepto] = parseFloat(p.porcentaje); });
            pctTareas = pctMap['promedio_tareas'] ?? 70;
            pctProyecto = pctMap['proyecto'] ?? 15;
            pctExamen = pctMap['examen'] ?? 15;
        }

        const trimestreUsado = parseInt(trimestre);

        const [estudiantes] = await db.query(`
            SELECT g.id as grupo_id, e.id as estudiante_id, e.cedula, e.nombres_apellidos, e.sexo, e.discapacidad
            FROM grupos g
            INNER JOIN estudiantes e ON g.estudiante_id = e.id AND e.activo = 1
            WHERE g.materia_id = ?
            ORDER BY e.nombres_apellidos
        `, [materia_id]);

        let dominan = 0, alcanzan = 0, proximos = 0, noAlcanzan = 0, sinExamen = 0;
        let promedioGeneral = 0;
        const listaEstudiantes = [];
        const estudiantesSinExamen = [];
        const estudiantesAnalisis = [];

        // Fetch ALL notas for this materia+trimestre in ONE query (evita N+1 secuencial)
        const grupoIds = [...new Set(estudiantes.map(e => e.grupo_id))];
        let todasNotas = [];
        if (grupoIds.length > 0) {
            [todasNotas] = await db.query(
                'SELECT grupo_id, nota, tipo, indice FROM notas WHERE grupo_id IN (?) AND trimestre = ?',
                [grupoIds, trimestreUsado]
            );
        }
        const notasPorGrupo = {};
        todasNotas.forEach(n => {
            if (!notasPorGrupo[n.grupo_id]) notasPorGrupo[n.grupo_id] = [];
            notasPorGrupo[n.grupo_id].push(n);
        });

        for (const est of estudiantes) {
            const notas = notasPorGrupo[est.grupo_id] || [];
            const tareas = notas.filter(n => n.tipo === 'tarea').map(n => parseFloat(n.nota) || 0);
            const proyectos = notas.filter(n => n.tipo === 'proyecto');
            const examenes = notas.filter(n => n.tipo === 'examen');

            let promTareas = 0;
            if (tareas.length > 0) promTareas = tareas.reduce((a, b) => a + b, 0) / tareas.length;

            let proyFinal = 0;
            if (proyectos.length > 0) {
                const notasP = proyectos.filter(p => p.indice === 0).map(p => parseFloat(p.nota) || 0);
                const drs = proyectos.filter(p => p.indice === 1).map(p => parseFloat(p.nota) || 0);
                const prs = proyectos.filter(p => p.indice === 2).map(p => parseFloat(p.nota) || 0);
                const notaP = notasP.length > 0 ? notasP[0] : 0;
                const dr = drs.length > 0 ? drs[0] : 0;
                const pr = prs.length > 0 ? prs[0] : 0;
                proyFinal = Math.max(notaP, (notaP + dr + pr) / 3);
            }

            let exaFinal = 0;
            if (examenes.length > 0) {
                const notasE = examenes.filter(e => e.indice === 0).map(e => parseFloat(e.nota) || 0);
                const dres = examenes.filter(e => e.indice === 1).map(e => parseFloat(e.nota) || 0);
                const ers = examenes.filter(e => e.indice === 2).map(e => parseFloat(e.nota) || 0);
                const notaE = notasE.length > 0 ? notasE[0] : 0;
                const dre = dres.length > 0 ? dres[0] : 0;
                const er = ers.length > 0 ? ers[0] : 0;
                exaFinal = Math.max(notaE, (notaE + dre + er) / 3);
            }

            const notaFinal = (promTareas * pctTareas + proyFinal * pctProyecto + exaFinal * pctExamen) / 100;

            const tieneNotas = tareas.length > 0 || proyectos.length > 0 || examenes.length > 0;

            if (pctExamen > 0) {
                if (!tieneNotas || examenes.length === 0) {
                    sinExamen++;
                    estudiantesSinExamen.push(est.nombres_apellidos);
                }
            }

            if (tieneNotas) {
                promedioGeneral += notaFinal;

                if (notaFinal >= 9) dominan++;
                else if (notaFinal >= 7) alcanzan++;
                else if (notaFinal >= 4.01) proximos++;
                else noAlcanzan++;

                if (notaFinal < 7) {
                    estudiantesAnalisis.push({
                        nombre: est.nombres_apellidos,
                        nota_final: notaFinal.toFixed(2)
                    });
                }
            }

            listaEstudiantes.push({
                nombre: est.nombres_apellidos,
                nota_final: notaFinal.toFixed(2)
            });
        }

        const total = estudiantes.length;
        const totalConNotas = dominan + alcanzan + proximos + noAlcanzan;
        promedioGeneral = totalConNotas > 0 ? (promedioGeneral / totalConNotas).toFixed(2) : 0;

        const dominanPct = totalConNotas > 0 ? ((dominan / totalConNotas) * 100).toFixed(1) : 0;
        const alcanzanPct = totalConNotas > 0 ? ((alcanzan / totalConNotas) * 100).toFixed(1) : 0;
        const proximosPct = totalConNotas > 0 ? ((proximos / totalConNotas) * 100).toFixed(1) : 0;
        const noAlcanzanPct = totalConNotas > 0 ? ((noAlcanzan / totalConNotas) * 100).toFixed(1) : 0;
        const sinExamenPct = total > 0 ? ((sinExamen / total) * 100).toFixed(1) : 0;

        res.json({
            materia: materia.nombre_materia,
            curso: materia.curso,
            paralelo: materia.paralelo,
            especialidad: materia.especialidad,
            profesor: materia.profesor,
            trimestre: trimestreUsado,
            total_alumnos: total,
            promedio_general: promedioGeneral,
            resultados: {
                dominan: { n: dominan, pct: dominanPct },
                alcanzan: { n: alcanzan, pct: alcanzanPct },
                proximos: { n: proximos, pct: proximosPct },
                noAlcanzan: { n: noAlcanzan, pct: noAlcanzanPct },
                sinExamen: { n: sinExamen, pct: sinExamenPct }
            },
            estudiantes_analisis: estudiantesAnalisis,
            estudiantes_sin_examen: estudiantesSinExamen,
            lista_estudiantes: listaEstudiantes
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/final/:grupo_id', async (req, res) => {
    const db = req.db;
    const { grupo_id } = req.params;
    try {
        const [grupoInfo] = await db.query('SELECT materia_id FROM grupos WHERE id = ?', [grupo_id]);
        if (grupoInfo.length === 0) return res.status(404).json({ error: 'Grupo no encontrado' });
        const materia_id = grupoInfo[0].materia_id;

        const [materiaInfo] = await db.query('SELECT m.*, u.nombre as profesor FROM materias m LEFT JOIN usuarios u ON m.docente_id = u.id WHERE m.id = ?', [materia_id]);
        if (materiaInfo.length === 0) return res.status(404).json({ error: 'Materia no encontrada' });
        const materia = materiaInfo[0];

        let pctTareas = 70, pctProyecto = 15, pctExamen = 15;
        const [configPct2] = await db.query(
            'SELECT promedio_tareas, proyecto, examen FROM configuracion_porcentajes_materia_curso WHERE materia_id = ? AND curso = ? AND paralelo = ? AND (especialidad = ? OR (especialidad IS NULL AND ? IS NULL))',
            [materia_id, materia.curso, materia.paralelo, materia.especialidad, materia.especialidad]
        );
        if (configPct2.length > 0) {
            pctTareas = parseFloat(configPct2[0].promedio_tareas) ?? 70;
            pctProyecto = parseFloat(configPct2[0].proyecto) ?? 15;
            pctExamen = parseFloat(configPct2[0].examen) ?? 15;
        } else {
            const [pcts] = await db.query('SELECT concepto, porcentaje FROM configuracion_porcentajes');
            const pctMap = {};
            pcts.forEach(p => { pctMap[p.concepto] = parseFloat(p.porcentaje); });
            pctTareas = pctMap['promedio_tareas'] ?? 70;
            pctProyecto = pctMap['proyecto'] ?? 15;
            pctExamen = pctMap['examen'] ?? 15;
        }

        const [estudiantes] = await db.query(`
            SELECT g.id as grupo_id, e.id as estudiante_id, e.cedula, e.nombres_apellidos, e.sexo, e.discapacidad
            FROM grupos g
            INNER JOIN estudiantes e ON g.estudiante_id = e.id AND e.activo = 1
            WHERE g.materia_id = ?
            ORDER BY e.nombres_apellidos
        `, [materia_id]);

        let dominan = 0, alcanzan = 0, proximos = 0, noAlcanzan = 0, sinNotas = 0;
        let promedioGeneral = 0;
        const estudiantesAnalisis = [];
        const estudiantesSinNotas = [];
        const listaPromocion = [];

        // Fetch ALL notas (3 trimestres) for this materia in ONE query (evita N+1 secuencial)
        const grupoIds = [...new Set(estudiantes.map(e => e.grupo_id))];
        let todasNotas = [];
        if (grupoIds.length > 0) {
            [todasNotas] = await db.query(
                'SELECT grupo_id, nota, tipo, indice, trimestre FROM notas WHERE grupo_id IN (?)',
                [grupoIds]
            );
        }
        const notasPorGrupo = {};
        todasNotas.forEach(n => {
            if (!notasPorGrupo[n.grupo_id]) notasPorGrupo[n.grupo_id] = [];
            notasPorGrupo[n.grupo_id].push(n);
        });

        for (const est of estudiantes) {
            const notas = notasPorGrupo[est.grupo_id] || [];

            const tieneNotas = notas.length > 0;
            if (!tieneNotas) {
                sinNotas++;
                estudiantesSinNotas.push(est.nombres_apellidos);
                listaPromocion.push({ nombre: est.nombres_apellidos, estado: 'perdida' });
                continue;
            }

            const promediosTrimestrales = [];
            for (let t = 1; t <= 3; t++) {
                const notasT = notas.filter(n => n.trimestre === t);
                if (notasT.length === 0) continue;

                const tareas = notasT.filter(n => n.tipo === 'tarea').map(n => parseFloat(n.nota) || 0);
                const proyectos = notasT.filter(n => n.tipo === 'proyecto');
                const examenes = notasT.filter(n => n.tipo === 'examen');

                let promTareas = tareas.length > 0 ? tareas.reduce((a, b) => a + b, 0) / tareas.length : 0;

                let proyFinal = 0;
                if (proyectos.length > 0) {
                    const notaP = proyectos.filter(p => p.indice === 0).map(p => parseFloat(p.nota) || 0);
                    const drs = proyectos.filter(p => p.indice === 1).map(p => parseFloat(p.nota) || 0);
                    const prs = proyectos.filter(p => p.indice === 2).map(p => parseFloat(p.nota) || 0);
                    const nP = notaP.length > 0 ? notaP[0] : 0;
                    const dr = drs.length > 0 ? drs[0] : 0;
                    const pr = prs.length > 0 ? prs[0] : 0;
                    proyFinal = Math.max(nP, (nP + dr + pr) / 3);
                }

                let exaFinal = 0;
                if (examenes.length > 0) {
                    const notasE = examenes.filter(e => e.indice === 0).map(e => parseFloat(e.nota) || 0);
                    const dres = examenes.filter(e => e.indice === 1).map(e => parseFloat(e.nota) || 0);
                    const ers = examenes.filter(e => e.indice === 2).map(e => parseFloat(e.nota) || 0);
                    const nE = notasE.length > 0 ? notasE[0] : 0;
                    const dre = dres.length > 0 ? dres[0] : 0;
                    const er = ers.length > 0 ? ers[0] : 0;
                    exaFinal = Math.max(nE, (nE + dre + er) / 3);
                }

                const notaTrim = (promTareas * pctTareas + proyFinal * pctProyecto + exaFinal * pctExamen) / 100;
                promediosTrimestrales.push(notaTrim);
            }

            const notaFinalAnual = promediosTrimestrales.length > 0
                ? promediosTrimestrales.reduce((a, b) => a + b, 0) / promediosTrimestrales.length
                : 0;

            promedioGeneral += notaFinalAnual;

            if (notaFinalAnual >= 9) dominan++;
            else if (notaFinalAnual >= 7) alcanzan++;
            else if (notaFinalAnual >= 4.01) proximos++;
            else noAlcanzan++;

            if (notaFinalAnual < 7) {
                estudiantesAnalisis.push({ nombre: est.nombres_apellidos, nota_final: notaFinalAnual.toFixed(2) });
            }

            let estado = 'promovido';
            if (notaFinalAnual < 4) estado = 'perdida';
            else if (notaFinalAnual < 7) estado = 'supletorio';

            listaPromocion.push({ nombre: est.nombres_apellidos, nota_final: notaFinalAnual.toFixed(2), estado });
        }

        const total = estudiantes.length;
        const totalConNotas = dominan + alcanzan + proximos + noAlcanzan;
        promedioGeneral = totalConNotas > 0 ? (promedioGeneral / totalConNotas).toFixed(2) : 0;

        const dominanPct = totalConNotas > 0 ? ((dominan / totalConNotas) * 100).toFixed(1) : 0;
        const alcanzanPct = totalConNotas > 0 ? ((alcanzan / totalConNotas) * 100).toFixed(1) : 0;
        const proximosPct = totalConNotas > 0 ? ((proximos / totalConNotas) * 100).toFixed(1) : 0;
        const noAlcanzanPct = totalConNotas > 0 ? ((noAlcanzan / totalConNotas) * 100).toFixed(1) : 0;
        const sinNotasPct = total > 0 ? ((sinNotas / total) * 100).toFixed(1) : 0;

        const promovidos = listaPromocion.filter(e => e.estado === 'promovido');
        const supletorios = listaPromocion.filter(e => e.estado === 'supletorio');
        const perdidas = listaPromocion.filter(e => e.estado === 'perdida');

        res.json({
            materia: materia.nombre_materia,
            curso: materia.curso,
            paralelo: materia.paralelo,
            especialidad: materia.especialidad,
            profesor: materia.profesor,
            total_alumnos: total,
            promedio_general: promedioGeneral,
            resultados: {
                dominan: { n: dominan, pct: dominanPct },
                alcanzan: { n: alcanzan, pct: alcanzanPct },
                proximos: { n: proximos, pct: proximosPct },
                noAlcanzan: { n: noAlcanzan, pct: noAlcanzanPct },
                sinNotas: { n: sinNotas, pct: sinNotasPct }
            },
            promocion: {
                promovidos: { n: promovidos.length, pct: total > 0 ? ((promovidos.length / total) * 100).toFixed(1) : 0 },
                supletorios: { n: supletorios.length, pct: total > 0 ? ((supletorios.length / total) * 100).toFixed(1) : 0 },
                perdidas: { n: perdidas.length, pct: total > 0 ? ((perdidas.length / total) * 100).toFixed(1) : 0 }
            },
            lista_promocion: listaPromocion,
            estudiantes_analisis: estudiantesAnalisis,
            estudiantes_sin_notas: estudiantesSinNotas
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
