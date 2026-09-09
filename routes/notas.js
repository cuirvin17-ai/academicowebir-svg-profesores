const express = require('express');
const router = express.Router();


// Renderizar vista de notas
router.get('/view', (req, res) => {
    const db = req.db;
    res.render('notas', { user: req.session.user });
});

// Obtener porcentajes configurados
router.get('/porcentajes', async (req, res) => {
    const db = req.db;
    try {
        const [rows] = await db.query('SELECT * FROM configuracion_porcentajes');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener TODOS los porcentajes por materia+curso+paralelo+especialidad
router.get('/porcentajes/config/all', async (req, res) => {
    const db = req.db;
    const user = req.session.user;
    try {
        const [rows] = await db.query(
            'SELECT * FROM configuracion_porcentajes_materia_curso WHERE school_id = ?',
            [user.school_id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener porcentajes por materia, curso, paralelo y especialidad
router.get('/porcentajes/config', async (req, res) => {
    const db = req.db;
    const user = req.session.user;
    const { materia_id, curso, paralelo, especialidad } = req.query;
    try {
        let query = 'SELECT * FROM configuracion_porcentajes_materia_curso WHERE materia_id = ? AND curso = ? AND paralelo = ? AND school_id = ?';
        let params = [materia_id, curso, paralelo, user.school_id];
        
        if (especialidad) {
            query += ' AND especialidad = ?';
            params.push(especialidad);
        } else {
            query += ' AND especialidad IS NULL';
        }
        
        const [rows] = await db.query(query, params);
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            const [global] = await db.query('SELECT * FROM configuracion_porcentajes');
            res.json({ global: true, porcentajes: global });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Guardar porcentajes por materia, curso, paralelo y especialidad
router.post('/porcentajes/config', async (req, res) => {
    const db = req.db;
    const user = req.session.user;
    const { materia_id, curso, paralelo, especialidad, promedio_tareas, proyecto, examen } = req.body;
    try {
        await db.query(
            `INSERT INTO configuracion_porcentajes_materia_curso 
             (materia_id, curso, paralelo, especialidad, promedio_tareas, proyecto, examen, school_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE 
                promedio_tareas = VALUES(promedio_tareas),
                proyecto = VALUES(proyecto),
                examen = VALUES(examen)`,
            [materia_id, curso, paralelo, especialidad || null, promedio_tareas, proyecto, examen, user.school_id]
        );
        res.json({ message: 'Porcentajes guardados' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener porcentajes de una materia específica (legacy)
router.get('/porcentajes/:materia_id', async (req, res) => {
    const db = req.db;
    const user = req.session.user;
    try {
        const [rows] = await db.query(
            'SELECT * FROM configuracion_porcentajes_materia WHERE materia_id = ? AND school_id = ?',
            [req.params.materia_id, user.school_id]
        );
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            const [global] = await db.query('SELECT * FROM configuracion_porcentajes');
            res.json({ global: true, porcentajes: global });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Guardar porcentajes para una materia específica (legacy)
router.post('/porcentajes/:materia_id', async (req, res) => {
    const db = req.db;
    const user = req.session.user;
    const { promedio_tareas, proyecto, examen } = req.body;
    try {
        await db.query(
            `INSERT INTO configuracion_porcentajes_materia (materia_id, promedio_tareas, proyecto, examen, school_id)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE 
                promedio_tareas = VALUES(promedio_tareas),
                proyecto = VALUES(proyecto),
                examen = VALUES(examen)`,
            [req.params.materia_id, promedio_tareas, proyecto, examen, user.school_id]
        );
        res.json({ message: 'Porcentajes guardados para esta materia' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar porcentajes globales
router.put('/porcentajes', async (req, res) => {
    const db = req.db;
    const { promedio_tareas, proyecto, examen } = req.body;
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('UPDATE configuracion_porcentajes SET porcentaje = ? WHERE concepto = ?', [promedio_tareas, 'promedio_tareas']);
        await conn.query('UPDATE configuracion_porcentajes SET porcentaje = ? WHERE concepto = ?', [proyecto, 'proyecto']);
        await conn.query('UPDATE configuracion_porcentajes SET porcentaje = ? WHERE concepto = ?', [examen, 'examen']);
        await conn.commit();
        res.json({ message: 'Porcentajes actualizados exitosamente' });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
});

// Obtener notas de un grupo por trimestre
router.get('/grupo/:grupo_id/trimestre/:trimestre', async (req, res) => {
    const db = req.db;
    const { grupo_id, trimestre } = req.params;
    try {
        const [rows] = await db.query(`
            SELECT n.id, n.tipo, n.nota, n.fecha_registro, n.comentario, n.indice,
                   e.id as estudiante_id, e.cedula, e.nombres_apellidos, e.discapacidad
            FROM notas n
            INNER JOIN grupos g ON n.grupo_id = g.id
            INNER JOIN estudiantes e ON g.estudiante_id = e.id
            WHERE n.grupo_id = ? AND n.trimestre = ?
            ORDER BY n.tipo, n.indice, n.fecha_registro
        `, [grupo_id, trimestre]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener todas las materias disponibles (filtradas por docente si es docente)
router.get('/materias', async (req, res) => {
    const db = req.db;
    const user = req.session.user;
    const anio = user.anio_lectivo || '2026-2027';
    try {
        let query = `
            SELECT DISTINCT m.id, m.nombre_materia, m.curso, m.paralelo, m.especialidad, m.docente_id
            FROM materias m
            INNER JOIN grupos g ON m.id = g.materia_id
            WHERE g.anio_lectivo = ?
        `;
        const params = [anio];
        if (user.rol === 'docente') {
            query += ' AND m.docente_id = ?';
            params.push(user.id);
        }
        query += ' ORDER BY m.nombre_materia, m.curso, m.paralelo';
        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener cursos únicos de los grupos (filtrados por docente si es docente)
router.get('/grupos', async (req, res) => {
    const db = req.db;
    const user = req.session.user;
    const anio = user.anio_lectivo || '2026-2027';
    try {
        let query = `
            SELECT DISTINCT m.curso, m.paralelo, m.especialidad,
                   COUNT(DISTINCT e.id) as total_estudiantes
            FROM grupos g
            INNER JOIN materias m ON g.materia_id = m.id
            INNER JOIN estudiantes e ON g.estudiante_id = e.id AND e.activo = 1
            WHERE g.anio_lectivo = ?
        `;
        const params = [anio];
        if (user.rol === 'docente') {
            query += ' AND m.docente_id = ?';
            params.push(user.id);
        }
        query += ' GROUP BY m.curso, m.paralelo, m.especialidad ORDER BY m.curso, m.paralelo';
        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener estudiantes por curso y materia (para notas)
router.get('/curso/:curso/paralelo/:paralelo/materia/:materia_id/estudiantes', async (req, res) => {
    const db = req.db;
    const { curso, paralelo, materia_id } = req.params;
    try {
        const [rows] = await db.query(`
            SELECT DISTINCT e.id, e.cedula, e.nombres_apellidos, e.discapacidad, e.activo, g.id as grupo_id
            FROM estudiantes e
            INNER JOIN grupos g ON e.id = g.estudiante_id
            INNER JOIN materias m ON g.materia_id = m.id
            WHERE m.curso = ? AND m.paralelo = ? AND m.id = ?
            ORDER BY e.nombres_apellidos
        `, [curso, paralelo, materia_id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Registrar notas de un estudiante para un trimestre
router.post('/grupo/:grupo_id/trimestre/:trimestre', async (req, res) => {
    const db = req.db;
    const { grupo_id, trimestre } = req.params;
    const { tipo, nota, fecha_registro } = req.body;
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query(
            'INSERT INTO notas (grupo_id, trimestre, tipo, nota, fecha_registro) VALUES (?, ?, ?, ?, ?)',
            [grupo_id, trimestre, tipo, nota, fecha_registro]
        );
        await conn.commit();
        res.json({ message: 'Nota registrada exitosamente' });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
});

// Crear nota vacía (solo comentario) y devolver ID
router.post('/crear-vacia', async (req, res) => {
    const db = req.db;
    const { grupo_id, trimestre, tipo, nota, indice } = req.body;
    try {
        const [result] = await db.query(
            'INSERT INTO notas (grupo_id, trimestre, tipo, nota, fecha_registro, indice) VALUES (?, ?, ?, ?, CURDATE(), ?)',
            [grupo_id, trimestre, tipo, nota || null, indice || 0]
        );
        res.json({ id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Registrar múltiples notas a la vez (DELETE + INSERT para limpiar y re-insertar)
router.post('/grupo/:grupo_id/trimestre/:trimestre/multiple', async (req, res) => {
    const db = req.db;
    const { grupo_id, trimestre } = req.params;
    const { notas } = req.body;
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        
        // Eliminar todas las notas existentes para este grupo en este trimestre
        await conn.query(
            'DELETE FROM notas WHERE grupo_id = ? AND trimestre = ?',
            [grupo_id, parseInt(trimestre)]
        );
        
        // Insertar solo las notas no nulas
        for (const item of notas) {
            if (item.nota !== null && item.nota !== undefined && item.nota !== '') {
                await conn.query(
                    'INSERT INTO notas (grupo_id, trimestre, tipo, nota, fecha_registro, comentario, indice) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [grupo_id, parseInt(trimestre), item.tipo, item.nota, item.fecha_registro, item.comentario || null, item.indice || 0]
                );
            }
        }
        
        // Calcular promedio DENTRO de la transacción
        await calcularPromedio(conn, grupo_id, parseInt(trimestre));
        
        await conn.commit();
        res.json({ message: 'Notas guardadas exitosamente' });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
});

// Función para calcular el promedio trimestral
async function calcularPromedio(conn, grupo_id, trimestre) {
    // Obtener materia_id, curso, paralelo, especialidad del grupo
    const [grupoInfo] = await conn.query(
        'SELECT g.materia_id, g.curso, g.paralelo, g.especialidad, m.nombre_materia FROM grupos g LEFT JOIN materias m ON g.materia_id = m.id WHERE g.id = ? LIMIT 1',
        [grupo_id]
    );
    
    let porcentajes = {};
    
    // Intentar obtener porcentajes específicos por materia+curso+paralelo+especialidad
    if (grupoInfo.length > 0 && grupoInfo[0].materia_id) {
        const g = grupoInfo[0];
        let query = 'SELECT promedio_tareas, proyecto, examen FROM configuracion_porcentajes_materia_curso WHERE materia_id = ? AND curso = ? AND paralelo = ?';
        let params = [g.materia_id, g.curso, g.paralelo];
        
        if (g.especialidad) {
            query += ' AND especialidad = ?';
            params.push(g.especialidad);
        } else {
            query += ' AND especialidad IS NULL';
        }
        
        const [configPct] = await conn.query(query, params);
        if (configPct.length > 0) {
            porcentajes = {
                promedio_tareas: parseFloat(configPct[0].promedio_tareas),
                proyecto: parseFloat(configPct[0].proyecto),
                examen: parseFloat(configPct[0].examen)
            };
        }
    }
    
    // Si no hay porcentajes específicos, usar los globales
    if (porcentajes.promedio_tareas === undefined) {
        const [pctRows] = await conn.query('SELECT concepto, porcentaje FROM configuracion_porcentajes');
        pctRows.forEach(row => {
            porcentajes[row.concepto] = parseFloat(row.porcentaje);
        });
    }

    const [tareaRows] = await conn.query(
        'SELECT AVG(nota) as promedio FROM notas WHERE grupo_id = ? AND trimestre = ? AND tipo = ?',
        [grupo_id, trimestre, 'tarea']
    );
    const promedioTareas = tareaRows[0].promedio ? parseFloat(tareaRows[0].promedio) : null;

    const [proyectoRows] = await conn.query(
        'SELECT AVG(nota) as nota FROM notas WHERE grupo_id = ? AND trimestre = ? AND tipo = ?',
        [grupo_id, trimestre, 'proyecto']
    );
    const notaProyecto = proyectoRows[0].nota ? parseFloat(proyectoRows[0].nota) : null;

    const [examenRows] = await conn.query(
        'SELECT AVG(nota) as nota FROM notas WHERE grupo_id = ? AND trimestre = ? AND tipo = ?',
        [grupo_id, trimestre, 'examen']
    );
    const notaExamen = examenRows[0].nota ? parseFloat(examenRows[0].nota) : null;

    const pctT = porcentajes.promedio_tareas ?? 0;
    const pctP = porcentajes.proyecto ?? 0;
    const pctE = porcentajes.examen ?? 0;
    const totalPct = pctT + pctP + pctE;

    // Calcular nota final solo con componentes que tienen porcentaje > 0
    let notaFinal = null;
    
    if (totalPct > 0) {
        let sumaPonderada = 0;
        let divisor = 0;
        
        if (pctT > 0 && promedioTareas !== null) {
            sumaPonderada += promedioTareas * (pctT / 100);
            divisor += pctT;
        }
        if (pctP > 0 && notaProyecto !== null) {
            sumaPonderada += notaProyecto * (pctP / 100);
            divisor += pctP;
        }
        if (pctE > 0 && notaExamen !== null) {
            sumaPonderada += notaExamen * (pctE / 100);
            divisor += pctE;
        }
        
        // Solo calcular si todos los componentes obligatorios (pct > 0) tienen nota
        const todosConNotas = 
            (pctT === 0 || promedioTareas !== null) &&
            (pctP === 0 || notaProyecto !== null) &&
            (pctE === 0 || notaExamen !== null);
        
        if (todosConNotas && divisor > 0) {
            notaFinal = divisor === 100 ? sumaPonderada : sumaPonderada * 100 / divisor;
        }
    }

    await conn.query(`
        INSERT INTO promedios_trimestrales (grupo_id, trimestre, promedio_tareas, nota_proyecto, nota_examen, nota_final)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
            promedio_tareas = VALUES(promedio_tareas),
            nota_proyecto = VALUES(nota_proyecto),
            nota_examen = VALUES(nota_examen),
            nota_final = VALUES(nota_final)
    `, [grupo_id, trimestre, promedioTareas, notaProyecto, notaExamen, notaFinal !== null ? parseFloat(notaFinal.toFixed(2)) : null]);
}

// Calcular promedios para todos los estudiantes de un grupo
router.post('/grupo/:grupo_id/trimestre/:trimestre/calcular', async (req, res) => {
    const db = req.db;
    const { grupo_id } = req.params;
    const trimestre = parseInt(req.params.trimestre);
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        
        // Obtener nombre_grupo y materia_id del grupo seleccionado
        const [grupoInfo] = await conn.query(
            'SELECT nombre_grupo, materia_id FROM grupos WHERE id = ? LIMIT 1',
            [grupo_id]
        );
        if (grupoInfo.length === 0) {
            await conn.rollback();
            return res.status(404).json({ error: 'Grupo no encontrado' });
        }
        
        // Obtener todos los IDs de grupos con el mismo nombre_grupo + materia_id
        const [grupoRows] = await conn.query(
            'SELECT id FROM grupos WHERE nombre_grupo = ? AND materia_id = ?',
            [grupoInfo[0].nombre_grupo, grupoInfo[0].materia_id]
        );
        
        // Calcular promedio para cada estudiante del grupo
        for (const row of grupoRows) {
            await calcularPromedio(conn, row.id, trimestre);
        }
        
        await conn.commit();
        res.json({ message: `Promedios calculados para ${grupoRows.length} estudiantes` });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
});

// Obtener promedios de un grupo
router.get('/grupo/:grupo_id/promedios', async (req, res) => {
    const db = req.db;
    const { grupo_id } = req.params;
    try {
        const [rows] = await db.query(`
            SELECT pt.id, pt.trimestre, pt.promedio_tareas, pt.nota_proyecto, 
                   pt.nota_examen, pt.nota_final, e.cedula, e.nombres_apellidos
            FROM promedios_trimestrales pt
            INNER JOIN grupos g ON pt.grupo_id = g.id
            INNER JOIN estudiantes e ON g.estudiante_id = e.id AND e.activo = 1
            WHERE pt.grupo_id = ?
            ORDER BY pt.trimestre, e.nombres_apellidos
        `, [grupo_id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar una nota
router.delete('/nota/:id', async (req, res) => {
    const db = req.db;
    try {
        await db.query('DELETE FROM notas WHERE id = ?', [req.params.id]);
        res.json({ message: 'Nota eliminada exitosamente' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Guardar comentario de una nota
router.put('/nota/:id/comentario', async (req, res) => {
    const db = req.db;
    const { comentario } = req.body;
    try {
        await db.query('UPDATE notas SET comentario = ? WHERE id = ?', [comentario || null, req.params.id]);
        res.json({ message: 'Comentario guardado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar tareas por índice (todas las tareas en esa posición de todos los estudiantes del grupo)
router.delete('/tarea-indice/:grupo_id/:trimestre/:indice', async (req, res) => {
    const db = req.db;
    const { grupo_id, trimestre, indice } = req.params;
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        
        // Obtener todos los grupo_id de los estudiantes del grupo
        const [grupoInfo] = await conn.query(
            'SELECT nombre_grupo, materia_id FROM grupos WHERE id = ? LIMIT 1',
            [grupo_id]
        );
        if (grupoInfo.length === 0) {
            await conn.rollback();
            return res.status(404).json({ error: 'Grupo no encontrado' });
        }
        
        const [estudiantes] = await conn.query(
            'SELECT g.id FROM grupos g WHERE g.nombre_grupo = ? AND g.materia_id = ?',
            [grupoInfo[0].nombre_grupo, grupoInfo[0].materia_id]
        );
        
        let eliminadas = 0;
        for (const est of estudiantes) {
            const [result] = await conn.query(
                'DELETE FROM notas WHERE grupo_id = ? AND trimestre = ? AND tipo = "tarea" AND indice = ?',
                [est.id, trimestre, indice]
            );
            eliminadas += result.affectedRows;
            
            // Reordenar índices superiores
            await conn.query(
                'UPDATE notas SET indice = indice - 1 WHERE grupo_id = ? AND trimestre = ? AND tipo = "tarea" AND indice > ?',
                [est.id, trimestre, indice]
            );
        }
        
        await conn.commit();
        res.json({ message: `Tarea eliminada: ${eliminadas} registros` });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
});

module.exports = router;

module.exports.calcularPromedio = calcularPromedio;