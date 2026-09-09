const express = require('express');
const router = express.Router();

router.get('/view', (req, res) => {
    res.render('diagnostico', { user: req.session.user });
});

router.get('/materias', async (req, res) => {
    const db = req.db;
    const user = req.session.user;
    try {
        let query = `
            SELECT DISTINCT m.id, m.nombre_materia, m.curso, m.paralelo, m.especialidad, m.docente_id
            FROM materias m
            INNER JOIN grupos g ON m.id = g.materia_id
        `;
        const params = [];
        if (user.rol === 'docente') {
            query += ' WHERE m.docente_id = ?';
            params.push(user.id);
        }
        query += ' ORDER BY m.nombre_materia, m.curso, m.paralelo';
        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

router.get('/curso/:curso/paralelo/:paralelo/materia/:materia_id/diagnosticos', async (req, res) => {
    const db = req.db;
    const { curso, paralelo, materia_id } = req.params;
    try {
        const [rows] = await db.query(`
            SELECT pd.id, pd.estudiante_id, pd.destrezas, pd.total, pd.descripcion, pd.fecha,
                   e.cedula, e.nombres_apellidos
            FROM pruebas_diagnostico pd
            INNER JOIN estudiantes e ON pd.estudiante_id = e.id
            WHERE pd.curso = ? AND pd.paralelo = ? AND pd.materia_id = ?
            ORDER BY e.nombres_apellidos
        `, [curso, paralelo, materia_id]);
        res.json(rows);
    } catch (err) {
        res.json([]);
    }
});

router.post('/guardar', async (req, res) => {
    const db = req.db;
    const { diagnosticos } = req.body;
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        for (const diag of diagnosticos) {
            const total = diag.total || 0;
            let descripcion = '';
            if (total >= 9.00) {
                descripcion = 'Domina los aprendizajes';
            } else if (total >= 7.00) {
                descripcion = 'Alcanza los aprendizajes';
            } else if (total >= 4.01) {
                descripcion = 'Proximos a alcanzar los aprendizajes';
            } else {
                descripcion = 'No alcanza los aprendizajes';
            }

            const [existing] = await conn.query(
                'SELECT id FROM pruebas_diagnostico WHERE estudiante_id = ? AND materia_id = ? AND curso = ? AND paralelo = ?',
                [diag.estudiante_id, diag.materia_id, diag.curso, diag.paralelo]
            );

            if (existing.length > 0) {
                await conn.query(
                    'UPDATE pruebas_diagnostico SET destrezas = ?, total = ?, descripcion = ?, fecha = CURDATE() WHERE id = ?',
                    [JSON.stringify(diag.destrezas), total, descripcion, existing[0].id]
                );
            } else {
                await conn.query(
                    'INSERT INTO pruebas_diagnostico (estudiante_id, materia_id, curso, paralelo, destrezas, total, descripcion) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [diag.estudiante_id, diag.materia_id, diag.curso, diag.paralelo, JSON.stringify(diag.destrezas), total, descripcion]
                );
            }
        }

        await conn.commit();
        res.json({ message: 'Diagnosticos guardados exitosamente' });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
});

router.delete('/:id', async (req, res) => {
    const db = req.db;
    try {
        await db.query('DELETE FROM pruebas_diagnostico WHERE id = ?', [req.params.id]);
        res.json({ message: 'Diagnostico eliminado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
