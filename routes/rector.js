const express = require('express');
const router = express.Router();

// Vista principal de rector
router.get('/view', (req, res) => {
    res.render('rector', { user: req.session.user });
});

// ========== MATERIAS ==========

// Listar materias de la escuela
router.get('/materias', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const [rows] = await db.query(`
            SELECT m.*, u.nombre AS docente_nombre, u.telefono AS docente_telefono,
                   t.nombre AS tutor_nombre, t.telefono AS tutor_telefono
            FROM materias m
            LEFT JOIN usuarios u ON m.docente_id = u.id
            LEFT JOIN tutores t ON m.tutor_id = t.id
            WHERE m.school_id = ?
            ORDER BY m.curso, m.paralelo, m.nombre_materia
        `, [schoolId]);
        res.json(rows);
    } catch (err) {
        console.error('Error al listar materias:', err);
        res.status(500).json({ error: err.message });
    }
});

// Crear materia
router.post('/materias', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const { nombre_materia, curso, paralelo, especialidad } = req.body;

        const [result] = await db.query(
            'INSERT INTO materias (nombre_materia, curso, paralelo, especialidad, school_id) VALUES (?, ?, ?, ?, ?)',
            [nombre_materia, curso, paralelo, especialidad || null, schoolId]
        );
        res.json({ message: 'Materia creada exitosamente', id: result.insertId });
    } catch (err) {
        console.error('Error al crear materia:', err);
        res.status(500).json({ error: err.message });
    }
});

// Editar materia
router.put('/materias/:id', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const { id } = req.params;
        const { nombre_materia, curso, paralelo, especialidad } = req.body;

        await db.query(
            'UPDATE materias SET nombre_materia = ?, curso = ?, paralelo = ?, especialidad = ? WHERE id = ? AND school_id = ?',
            [nombre_materia, curso, paralelo, especialidad || null, id, schoolId]
        );
        res.json({ message: 'Materia actualizada exitosamente' });
    } catch (err) {
        console.error('Error al editar materia:', err);
        res.status(500).json({ error: err.message });
    }
});

// Eliminar materia
router.delete('/materias/:id', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const { id } = req.params;
        await db.query('DELETE FROM materias WHERE id = ? AND school_id = ?', [id, schoolId]);
        res.json({ message: 'Materia eliminada exitosamente' });
    } catch (err) {
        console.error('Error al eliminar materia:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========== ASIGNACION DOCENTE → MATERIA ==========

// Listar docentes de la escuela
router.get('/docentes', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const [rows] = await db.query(
            'SELECT id, cedula, nombre, telefono FROM usuarios WHERE rol = ? AND school_id = ? AND estado = 1 ORDER BY nombre',
            ['docente', schoolId]
        );
        res.json(rows);
    } catch (err) {
        console.error('Error al listar docentes:', err);
        res.status(500).json({ error: err.message });
    }
});

// Crear docente
router.post('/docentes', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const { cedula, nombre, telefono, password } = req.body;
        if (!cedula || !nombre || !password) {
            return res.status(400).json({ error: 'Cedula, nombre y password son requeridos' });
        }
        const [existing] = await db.query('SELECT id FROM usuarios WHERE cedula = ?', [cedula]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Ya existe un usuario con esa cedula' });
        }
        const [result] = await db.query(
            'INSERT INTO usuarios (cedula, nombre, telefono, password, rol, school_id, estado) VALUES (?, ?, ?, ?, ?, ?, 1)',
            [cedula, nombre, telefono || null, password, 'docente', schoolId]
        );
        res.json({ message: 'Docente creado exitosamente', id: result.insertId });
    } catch (err) {
        console.error('Error al crear docente:', err);
        res.status(500).json({ error: err.message });
    }
});

// Editar docente
router.put('/docentes/:id', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const { id } = req.params;
        const { cedula, nombre, telefono, password } = req.body;
        if (password) {
            await db.query(
                'UPDATE usuarios SET cedula = ?, nombre = ?, telefono = ?, password = ? WHERE id = ? AND school_id = ? AND rol = ?',
                [cedula, nombre, telefono || null, password, id, schoolId, 'docente']
            );
        } else {
            await db.query(
                'UPDATE usuarios SET cedula = ?, nombre = ?, telefono = ? WHERE id = ? AND school_id = ? AND rol = ?',
                [cedula, nombre, telefono || null, id, schoolId, 'docente']
            );
        }
        res.json({ message: 'Docente actualizado exitosamente' });
    } catch (err) {
        console.error('Error al editar docente:', err);
        res.status(500).json({ error: err.message });
    }
});

// Eliminar docente (desactivar)
router.delete('/docentes/:id', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const { id } = req.params;
        await db.query(
            'UPDATE usuarios SET estado = 0 WHERE id = ? AND school_id = ? AND rol = ?',
            [id, schoolId, 'docente']
        );
        res.json({ message: 'Docente desactivado exitosamente' });
    } catch (err) {
        console.error('Error al eliminar docente:', err);
        res.status(500).json({ error: err.message });
    }
});

// Asignar docente y tutor a materia
router.put('/materias/:id/asignar', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const { id } = req.params;
        const { docente_id, tutor_id } = req.body;

        await db.query(
            'UPDATE materias SET docente_id = ?, tutor_id = ? WHERE id = ? AND school_id = ?',
            [docente_id || null, tutor_id || null, id, schoolId]
        );
        res.json({ message: 'Asignacion actualizada exitosamente' });
    } catch (err) {
        console.error('Error al asignar:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========== ASIGNACION ALUMNOS → MATERIA ==========

// Estudiantes disponibles para una materia (filtrados por curso, paralelo, especialidad)
router.get('/materias/:id/estudiantes-disponibles', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const { id } = req.params;

        const [matRows] = await db.query(
            'SELECT curso, paralelo, especialidad FROM materias WHERE id = ? AND school_id = ?',
            [id, schoolId]
        );
        if (matRows.length === 0) return res.json([]);
        const mat = matRows[0];

        const [rows] = await db.query(`
            SELECT e.* FROM estudiantes e
            WHERE e.school_id = ? AND e.activo = 1
            AND e.id NOT IN (
                SELECT g.estudiante_id FROM grupos g WHERE g.materia_id = ?
            )
            AND e.curso = ? AND e.paralelo = ?
            ${mat.especialidad ? 'AND e.especialidad = ?' : ''}
            ORDER BY e.nombres_apellidos
        `, mat.especialidad ? [schoolId, id, mat.curso, mat.paralelo, mat.especialidad] : [schoolId, id, mat.curso, mat.paralelo]);
        res.json(rows);
    } catch (err) {
        console.error('Error al listar disponibles:', err);
        res.status(500).json({ error: err.message });
    }
});

// Estudiantes asignados a una materia
router.get('/materias/:id/estudiantes-asignados', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const { id } = req.params;

        const [rows] = await db.query(`
            SELECT e.*, g.id AS grupo_id FROM estudiantes e
            INNER JOIN grupos g ON e.id = g.estudiante_id
            WHERE g.materia_id = ? AND e.school_id = ?
            ORDER BY e.nombres_apellidos
        `, [id, schoolId]);
        res.json(rows);
    } catch (err) {
        console.error('Error al listar asignados:', err);
        res.status(500).json({ error: err.message });
    }
});

// Asignar alumnos a materia (masivo)
router.post('/materias/:id/asignar-alumnos', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const { id } = req.params;
        const { estudiante_ids } = req.body;

        // Obtener nombre_grupo de la materia
        const [matRows] = await db.query(
            'SELECT nombre_materia, curso, paralelo FROM materias WHERE id = ? AND school_id = ?',
            [id, schoolId]
        );
        if (matRows.length === 0) {
            return res.status(404).json({ error: 'Materia no encontrada' });
        }
        const m = matRows[0];
        const nombreGrupo = `${m.nombre_materia} - ${m.curso} ${m.paralelo}`;

        let asignados = 0;
        for (const eid of estudiante_ids) {
            try {
                await db.query(
                    'INSERT IGNORE INTO grupos (nombre_grupo, materia_id, estudiante_id, school_id) VALUES (?, ?, ?, ?)',
                    [nombreGrupo, id, eid, schoolId]
                );
                asignados++;
            } catch (e) { /* skip duplicates */ }
        }
        res.json({ message: `${asignados} estudiantes asignados exitosamente` });
    } catch (err) {
        console.error('Error al asignar alumnos:', err);
        res.status(500).json({ error: err.message });
    }
});

// Desasignar alumno de materia
router.delete('/materias/:id/desasignar-alumno/:eid', async (req, res) => {
    try {
        const db = req.db;
        const { id, eid } = req.params;
        await db.query('DELETE FROM grupos WHERE materia_id = ? AND estudiante_id = ?', [id, eid]);
        res.json({ message: 'Estudiante desasignado exitosamente' });
    } catch (err) {
        console.error('Error al desasignar:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========== TUTORES ==========

// Listar tutores
router.get('/tutores', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const [rows] = await db.query(
            'SELECT * FROM tutores WHERE school_id = ? ORDER BY nombre',
            [schoolId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Crear tutor
router.post('/tutores', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const { cedula, nombre, telefono, email } = req.body;
        if (!cedula || !nombre) {
            return res.status(400).json({ error: 'Cedula y nombre son requeridos' });
        }
        const [existing] = await db.query('SELECT id FROM tutores WHERE cedula = ?', [cedula]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Ya existe un tutor con esa cedula' });
        }
        const [result] = await db.query(
            'INSERT INTO tutores (cedula, nombre, telefono, email, school_id) VALUES (?, ?, ?, ?, ?)',
            [cedula, nombre, telefono || null, email || null, schoolId]
        );
        res.json({ message: 'Tutor creado exitosamente', id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Editar tutor
router.put('/tutores/:id', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const { id } = req.params;
        const { cedula, nombre, telefono, email } = req.body;
        await db.query(
            'UPDATE tutores SET cedula = ?, nombre = ?, telefono = ?, email = ? WHERE id = ? AND school_id = ?',
            [cedula, nombre, telefono || null, email || null, id, schoolId]
        );
        res.json({ message: 'Tutor actualizado exitosamente' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar tutor
router.delete('/tutores/:id', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const { id } = req.params;
        await db.query('DELETE FROM tutores WHERE id = ? AND school_id = ?', [id, schoolId]);
        res.json({ message: 'Tutor eliminado exitosamente' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== ASIGNACION TUTORES → CURSOS ==========

// Listar asignaciones de tutores
router.get('/asignacion-tutores', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const [rows] = await db.query(`
            SELECT at2.*, t.cedula, t.nombre AS tutor_nombre, t.telefono AS tutor_telefono
            FROM asignacion_tutores at2
            INNER JOIN tutores t ON at2.tutor_id = t.id
            WHERE at2.school_id = ?
            ORDER BY at2.curso, at2.paralelo
        `, [schoolId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Asignar tutor a curso
router.post('/asignacion-tutores', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const { tutor_id, curso, paralelo } = req.body;
        if (!tutor_id || !curso || !paralelo) {
            return res.status(400).json({ error: 'Tutor, curso y paralelo son requeridos' });
        }
        const [existing] = await db.query(
            'SELECT id FROM asignacion_tutores WHERE tutor_id = ? AND curso = ? AND paralelo = ? AND school_id = ?',
            [tutor_id, curso, paralelo, schoolId]
        );
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Este tutor ya esta asignado a este curso' });
        }
        await db.query(
            'INSERT INTO asignacion_tutores (tutor_id, curso, paralelo, school_id) VALUES (?, ?, ?, ?)',
            [tutor_id, curso, paralelo, schoolId]
        );
        res.json({ message: 'Tutor asignado exitosamente' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Desasignar tutor de curso
router.delete('/asignacion-tutores/:id', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const { id } = req.params;
        await db.query('DELETE FROM asignacion_tutores WHERE id = ? AND school_id = ?', [id, schoolId]);
        res.json({ message: 'Tutor desasignado exitosamente' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== SESIONES ACTIVAS ==========
router.get('/sesiones-activas', async (req, res) => {
    try {
        const db = req.db;
        const [sessions] = await db.query(
            'SELECT session_id, data, expires FROM sessions WHERE expires > UNIX_TIMESTAMP()'
        );
        const now = Math.floor(Date.now() / 1000);
        const users = sessions.map(s => {
            try {
                const parsed = JSON.parse(s.data);
                return {
                    session_id: s.session_id,
                    nombre: parsed.user?.nombre || 'Desconocido',
                    cedula: parsed.user?.cedula || '',
                    rol: parsed.user?.rol || '',
                    expires: s.expires,
                    minutos_restantes: Math.round((s.expires - now) / 60)
                };
            } catch { return null; }
        }).filter(Boolean);
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
