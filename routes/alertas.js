const express = require('express');
const router = express.Router();


router.get('/view', (req, res) => {
    const db = req.db;
    res.render('alertas', { user: req.session.user });
});

router.get('/list', async (req, res) => {
    const db = req.db;
    const user = req.session.user;
    try {
        let query = `
            SELECT MIN(g.id) as id, g.nombre_grupo, g.materia_id, m.nombre_materia, m.curso, m.paralelo, m.especialidad, m.docente_id,
                   t.nombre AS tutor_nombre, t.telefono AS tutor_telefono,
                   COUNT(g.estudiante_id) as total_estudiantes
            FROM grupos g
            INNER JOIN materias m ON g.materia_id = m.id
            LEFT JOIN tutores t ON m.tutor_id = t.id
            WHERE g.school_id = ?
        `;
        const params = [user.school_id];
        if (user.rol === 'docente') {
            query += ' AND m.docente_id = ?';
            params.push(user.id);
        }
        query += ' GROUP BY g.nombre_grupo, g.materia_id, m.nombre_materia, m.curso, m.paralelo, m.especialidad, m.docente_id, t.nombre, t.telefono ORDER BY m.nombre_materia';
        const [materias] = await db.query(query, params);
        res.json(materias);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/inasistencia/:grupo_id', async (req, res) => {
    const db = req.db;
    const { grupo_id } = req.params;
    const { porcentaje_min } = req.query;
    const umbral = parseFloat(porcentaje_min) || 20;
    try {
        const [grupoInfo] = await db.query(
            'SELECT nombre_grupo, materia_id FROM grupos WHERE id = ? LIMIT 1',
            [grupo_id]
        );
        if (grupoInfo.length === 0) return res.json([]);
        const { nombre_grupo, materia_id } = grupoInfo[0];

        const [rows] = await db.query(`
            SELECT g.id as grupo_id, g.nombre_grupo, e.cedula, e.nombres_apellidos, e.discapacidad,
                   e.representante, e.telefono_representante, u.nombre as profesor, m.nombre_materia,
                   t.nombre AS tutor_nombre, t.telefono AS tutor_telefono,
                   COUNT(a.id) as total_clases,
                   SUM(CASE WHEN a.estado = 'presente' OR j.id IS NOT NULL THEN 1 ELSE 0 END) as asistencias,
                   SUM(CASE WHEN a.estado = 'ausente' AND j.id IS NULL THEN 1 ELSE 0 END) as ausencias,
                   ROUND(SUM(CASE WHEN a.estado = 'ausente' AND j.id IS NULL THEN 1 ELSE 0 END) * 100.0 / COUNT(a.id), 1) as pct_ausencia
            FROM grupos g
            INNER JOIN estudiantes e ON g.estudiante_id = e.id AND e.activo = 1
            INNER JOIN asistencias a ON a.grupo_id = g.id
            INNER JOIN materias m ON g.materia_id = m.id
            LEFT JOIN usuarios u ON m.docente_id = u.id
            LEFT JOIN tutores t ON m.tutor_id = t.id
            LEFT JOIN justificaciones j ON j.asistencia_id = a.id
            WHERE g.nombre_grupo = ? AND g.materia_id = ?
            GROUP BY g.id, g.nombre_grupo, e.id, e.cedula, e.nombres_apellidos, e.discapacidad,
                     u.nombre, m.nombre_materia, t.nombre, t.telefono
            HAVING pct_ausencia >= ?
            ORDER BY pct_ausencia DESC
        `, [nombre_grupo, materia_id, umbral]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

async function calcularNotasGrupo(db, nombre_grupo, materia_id, trimestre) {
    const [pcts] = await db.query('SELECT concepto, porcentaje FROM configuracion_porcentajes');
    const pctMap = {};
    pcts.forEach(p => { pctMap[p.concepto] = parseFloat(p.porcentaje); });
    const pctTareas = pctMap['promedio_tareas'] || 70;
    const pctProyecto = pctMap['proyecto'] || 15;
    const pctExamen = pctMap['examen'] || 15;

    let trimestreVal = parseInt(trimestre) || 0;
    if (!trimestreVal) {
        const [maxT] = await db.query(
            'SELECT MAX(n.trimestre) as max_t FROM notas n INNER JOIN grupos g ON n.grupo_id = g.id WHERE g.nombre_grupo = ? AND g.materia_id = ?',
            [nombre_grupo, materia_id]
        );
        trimestreVal = maxT.length > 0 && maxT[0].max_t ? maxT[0].max_t : 1;
    }

    const [estudiantes] = await db.query(`
        SELECT g.id as grupo_id, g.nombre_grupo, e.cedula, e.nombres_apellidos, e.discapacidad,
               e.representante, e.telefono_representante, u.nombre as profesor, m.nombre_materia,
               t.nombre AS tutor_nombre, t.telefono AS tutor_telefono
        FROM grupos g
        INNER JOIN estudiantes e ON g.estudiante_id = e.id AND e.activo = 1
        INNER JOIN materias m ON g.materia_id = m.id
        LEFT JOIN usuarios u ON m.docente_id = u.id
        LEFT JOIN tutores t ON m.tutor_id = t.id
        WHERE g.nombre_grupo = ? AND g.materia_id = ?
        ORDER BY e.nombres_apellidos
    `, [nombre_grupo, materia_id]);

    const grupoIds = estudiantes.map(e => e.grupo_id);
    let todasLasNotas = [];
    if (grupoIds.length > 0) {
        const placeholders = grupoIds.map(() => '?').join(',');
        [todasLasNotas] = await db.query(
            `SELECT grupo_id, nota, tipo, indice FROM notas WHERE grupo_id IN (${placeholders}) AND trimestre = ?`,
            [...grupoIds, trimestreVal]
        );
    }

    const notasPorGrupo = {};
    todasLasNotas.forEach(n => {
        if (!notasPorGrupo[n.grupo_id]) notasPorGrupo[n.grupo_id] = [];
        notasPorGrupo[n.grupo_id].push(n);
    });

    const notasFinales = [];
    const detalleEstudiantes = [];

    for (const est of estudiantes) {
        const notas = notasPorGrupo[est.grupo_id] || [];
        const tareas = notas.filter(n => n.tipo === 'tarea').map(n => parseFloat(n.nota) || 0);
        const proyectos = notas.filter(n => n.tipo === 'proyecto');
        const examenes = notas.filter(n => n.tipo === 'examen');

        let promTareas = 0;
        if (tareas.length > 0) promTareas = tareas.reduce((a, b) => a + b, 0) / tareas.length;

        let proyFinal = 0;
        if (proyectos.length > 0) {
            const notaP = parseFloat(proyectos.find(p => p.indice === 0)?.nota) || 0;
            const dr = parseFloat(proyectos.find(p => p.indice === 1)?.nota) || 0;
            const pr = parseFloat(proyectos.find(p => p.indice === 2)?.nota) || 0;
            proyFinal = Math.max(notaP, (notaP + dr + pr) / 3);
        }

        let exaFinal = 0;
        if (examenes.length > 0) {
            const notaE = parseFloat(examenes.find(e => e.indice === 0)?.nota) || 0;
            const dre = parseFloat(examenes.find(e => e.indice === 1)?.nota) || 0;
            const er = parseFloat(examenes.find(e => e.indice === 2)?.nota) || 0;
            exaFinal = Math.max(notaE, (notaE + dre + er) / 3);
        }

        const notaFinal = (promTareas * pctTareas + proyFinal * pctProyecto + exaFinal * pctExamen) / 100;
        const tieneNotas = tareas.length > 0 || proyectos.length > 0 || examenes.length > 0;

        if (tieneNotas) notasFinales.push(notaFinal);

        detalleEstudiantes.push({
            cedula: est.cedula,
            nombres_apellidos: est.nombres_apellidos,
            discapacidad: est.discapacidad,
            nombre_grupo: est.nombre_grupo,
            nombre_materia: est.nombre_materia || '',
            representante: est.representante || '',
            telefono_representante: est.telefono_representante || '',
            profesor: est.profesor || '',
            tutor_nombre: est.tutor_nombre || '',
            tutor_telefono: est.tutor_telefono || '',
            prom_tareas: promTareas.toFixed(2),
            proyecto_final: proyFinal.toFixed(2),
            examen_final: exaFinal.toFixed(2),
            nota_final: notaFinal.toFixed(2),
            tiene_notas: tieneNotas
        });
    }

    const promedioClase = notasFinales.length > 0
        ? notasFinales.reduce((a, b) => a + b, 0) / notasFinales.length
        : 0;

    return { promedioClase, estudiantes: detalleEstudiantes.filter(e => e.tiene_notas) };
}

router.get('/rendimiento/:grupo_id', async (req, res) => {
    const db = req.db;
    const { grupo_id } = req.params;
    const { trimestre } = req.query;
    try {
        const [grupoInfo] = await db.query(
            'SELECT nombre_grupo, materia_id FROM grupos WHERE id = ? LIMIT 1',
            [grupo_id]
        );
        if (grupoInfo.length === 0) return res.json({ promedio_clase: '0.00', estudiantes: [] });
        const { nombre_grupo, materia_id } = grupoInfo[0];
        const result = await calcularNotasGrupo(db, nombre_grupo, materia_id, trimestre);
        res.json({ promedio_clase: result.promedioClase.toFixed(2), estudiantes: result.estudiantes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/promedio/:grupo_id', async (req, res) => {
    const db = req.db;
    const { grupo_id } = req.params;
    try {
        const [grupoInfo] = await db.query(
            'SELECT nombre_grupo, materia_id FROM grupos WHERE id = ? LIMIT 1',
            [grupo_id]
        );
        if (grupoInfo.length === 0) return res.json({ promedio_clase: '0.00' });
        const { nombre_grupo, materia_id } = grupoInfo[0];
        const result = await calcularNotasGrupo(db, nombre_grupo, materia_id);
        res.json({ promedio_clase: result.promedioClase.toFixed(2) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
