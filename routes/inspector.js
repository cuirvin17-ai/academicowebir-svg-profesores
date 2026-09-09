const express = require('express');
const router = express.Router();

router.get('/view', (req, res) => {
    res.render('inspector');
});

// Vista de estudiantes para inspector
router.get('/estudiantes/view', (req, res) => {
    res.render('inspector_estudiantes', { user: req.session.user });
});

// Buscar estudiantes (cedula, nombre, curso, paralelo, especialidad)
router.get('/estudiantes/buscar', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const anio = req.session.user.anio_lectivo || '2026-2027';
        const { cedula, nombre, curso, paralelo, especialidad } = req.query;

        let query = 'SELECT * FROM estudiantes WHERE school_id = ? AND anio_lectivo = ?';
        const params = [schoolId, anio];

        if (cedula) {
            query += ' AND cedula LIKE ?';
            params.push(`%${cedula}%`);
        }
        if (nombre) {
            query += ' AND nombres_apellidos LIKE ?';
            params.push(`%${nombre}%`);
        }
        if (curso) {
            query += ' AND curso = ?';
            params.push(curso);
        }
        if (paralelo) {
            query += ' AND paralelo = ?';
            params.push(paralelo);
        }
        if (especialidad) {
            query += ' AND especialidad = ?';
            params.push(especialidad);
        }

        query += ' ORDER BY nombres_apellidos LIMIT 100';
        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Error al buscar estudiantes:', err);
        res.status(500).json({ error: err.message });
    }
});

// Obtener detalle completo de un estudiante
router.get('/estudiantes/:id', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const { id } = req.params;

        const [estudiantes] = await db.query(
            'SELECT * FROM estudiantes WHERE id = ? AND school_id = ?',
            [id, schoolId]
        );
        if (estudiantes.length === 0) return res.status(404).json({ error: 'Estudiante no encontrado' });
        const est = estudiantes[0];

        const [grupos] = await db.query(
            `SELECT g.nombre_grupo, m.nombre_materia, m.curso, m.paralelo, m.especialidad
             FROM grupos g INNER JOIN materias m ON g.materia_id = m.id
             WHERE g.estudiante_id = ? AND g.school_id = ? AND g.anio_lectivo = ?`,
            [id, schoolId, req.session.user.anio_lectivo || '2026-2027']
        );

        const [asistencias] = await db.query(
            `SELECT m.nombre_materia,
                    COUNT(a.id) as total,
                    SUM(CASE WHEN a.estado = 'presente' THEN 1 ELSE 0 END) as presentes,
                    SUM(CASE WHEN a.estado = 'ausente' THEN 1 ELSE 0 END) as ausentes
             FROM asistencias a
             INNER JOIN grupos g ON a.grupo_id = g.id
             INNER JOIN materias m ON g.materia_id = m.id
             WHERE g.estudiante_id = ? AND g.school_id = ?
             GROUP BY m.nombre_materia`,
            [id, schoolId]
        );

        const [notas] = await db.query(
            `SELECT m.nombre_materia, n.nota, n.tipo, n.trimestre, n.indice
             FROM notas n
             INNER JOIN grupos g ON n.grupo_id = g.id
             INNER JOIN materias m ON g.materia_id = m.id
             WHERE g.estudiante_id = ? AND g.school_id = ?
             ORDER BY m.nombre_materia, n.trimestre, n.tipo, n.indice`,
            [id, schoolId]
        );

        res.json({ estudiante: est, grupos, asistencias, notas });
    } catch (err) {
        console.error('Error al obtener detalle:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
