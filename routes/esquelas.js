const express = require('express');
const router = express.Router();

router.get('/view', (req, res) => {
    res.render('esquelas', { user: req.session.user });
});

// Buscar estudiantes por cedula o nombre (con filtro opcional por curso/paralelo/especialidad)
router.get('/buscar-estudiante', async (req, res) => {
    const db = req.db;
    const { q, curso, paralelo, especialidad } = req.query;
    try {
        let sql = `SELECT id, cedula, nombres_apellidos, curso, paralelo, especialidad, discapacidad
                   FROM estudiantes
                   WHERE activo = 1`;
        const params = [];
        if (q) {
            sql += ' AND (cedula LIKE ? OR nombres_apellidos LIKE ?)';
            params.push(`%${q}%`, `%${q}%`);
        }
        if (curso) {
            sql += ' AND curso = ?';
            params.push(curso);
        }
        if (paralelo) {
            sql += ' AND paralelo = ?';
            params.push(paralelo);
        }
        if (especialidad) {
            sql += ' AND especialidad = ?';
            params.push(especialidad);
        }
        sql += ' ORDER BY nombres_apellidos LIMIT 20';
        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cursos, paralelos y especialidades existentes (para poblar los selectores)
router.get('/grupos', async (req, res) => {
    const db = req.db;
    try {
        const [rows] = await db.query(
            `SELECT DISTINCT curso, paralelo, especialidad
             FROM estudiantes
             WHERE activo = 1
             ORDER BY curso, paralelo, especialidad`
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Listar esquelas del año lectivo (filtros: estado, texto)
router.get('/', async (req, res) => {
    const db = req.db;
    const user = req.session.user;
    const { estado, q, curso, paralelo, especialidad } = req.query;
    try {
        let sql = `
            SELECT e.*, est.nombres_apellidos, est.cedula, est.curso, est.paralelo, est.especialidad
            FROM esquelas e
            INNER JOIN estudiantes est ON est.id = e.estudiante_id
            WHERE e.anio_lectivo = ?`;
        const params = [user.anio_lectivo || '2026-2027'];

        if (estado === 'pendiente') sql += ' AND e.fecha_llegada IS NULL';
        if (estado === 'atendida') sql += ' AND e.fecha_llegada IS NOT NULL';
        if (curso) {
            sql += ' AND est.curso = ?';
            params.push(curso);
        }
        if (paralelo) {
            sql += ' AND est.paralelo = ?';
            params.push(paralelo);
        }
        if (especialidad) {
            sql += ' AND est.especialidad = ?';
            params.push(especialidad);
        }
        if (q) {
            sql += ' AND (est.nombres_apellidos LIKE ? OR est.cedula LIKE ?)';
            params.push(`%${q}%`, `%${q}%`);
        }
        // Pendientes primero, luego las mas recientes
        sql += ' ORDER BY (e.fecha_llegada IS NOT NULL), e.fecha_envio DESC, e.id DESC';

        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Registrar una esquela (fecha en que fue enviada al estudiante)
router.post('/', async (req, res) => {
    const db = req.db;
    const user = req.session.user;
    const { estudiante_id, fecha_envio, motivo } = req.body;
    const fecha = fecha_envio || new Date().toISOString().split('T')[0];

    if (!estudiante_id) {
        return res.status(400).json({ error: 'Seleccione un estudiante' });
    }
    try {
        const [est] = await db.query('SELECT id FROM estudiantes WHERE id = ?', [estudiante_id]);
        if (est.length === 0) {
            return res.status(400).json({ error: 'Estudiante no encontrado' });
        }
        const [result] = await db.query(
            `INSERT INTO esquelas (estudiante_id, fecha_envio, motivo, registrado_por, school_id, anio_lectivo)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [estudiante_id, fecha, motivo || null, user.nombre, user.school_id || 1, user.anio_lectivo || '2026-2027']
        );
        res.json({ message: 'Esquela registrada', id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Registrar la fecha en que llego el padre de familia al llamado
router.put('/:id/llegada', async (req, res) => {
    const db = req.db;
    const { fecha_llegada } = req.body;
    const fecha = fecha_llegada || new Date().toISOString().split('T')[0];
    try {
        const [rows] = await db.query('SELECT id FROM esquelas WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Esquela no encontrada' });
        }
        await db.query('UPDATE esquelas SET fecha_llegada = ? WHERE id = ?', [fecha, req.params.id]);
        res.json({ message: 'Llegada del padre registrada' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Guardar la observación de la visita del representante
router.put('/:id/observacion', async (req, res) => {
    const db = req.db;
    const { observacion } = req.body;
    try {
        const [rows] = await db.query('SELECT id FROM esquelas WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Esquela no encontrada' });
        }
        await db.query('UPDATE esquelas SET observacion = ? WHERE id = ?',
            [observacion ? observacion.trim() : null, req.params.id]);
        res.json({ message: 'Observación guardada' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Corregir fecha de envio o motivo de una esquela
router.put('/:id', async (req, res) => {
    const db = req.db;
    const { fecha_envio, motivo } = req.body;
    try {
        const [rows] = await db.query('SELECT id FROM esquelas WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Esquela no encontrada' });
        }
        await db.query('UPDATE esquelas SET fecha_envio = ?, motivo = ? WHERE id = ?',
            [fecha_envio, motivo || null, req.params.id]);
        res.json({ message: 'Esquela actualizada' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar un registro de esquela (solo la tabla esquelas, nunca notas)
router.delete('/:id', async (req, res) => {
    const db = req.db;
    try {
        await db.query('DELETE FROM esquelas WHERE id = ?', [req.params.id]);
        res.json({ message: 'Esquela eliminada' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
