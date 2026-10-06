const express = require('express');
const router = express.Router();

// Solo docentes
router.use((req, res, next) => {
    if (!req.session.user || req.session.user.rol !== 'docente') {
        return res.status(403).json({ error: 'Acceso no autorizado' });
    }
    next();
});

// Vista principal de tutor
router.get('/view', (req, res) => {
    res.render('tutor', { user: req.session.user });
});

// Obtener el id de tutores del docente logueado (por cedula)
async function getTutorId(req) {
    const db = req.db;
    const { cedula, school_id } = req.session.user;
    const [rows] = await db.query(
        'SELECT id FROM tutores WHERE cedula = ? AND school_id = ? AND estado = 1',
        [cedula, school_id]
    );
    return rows.length > 0 ? rows[0].id : null;
}

// Cursos de los que el docente es tutor (materias + asignacion_tutores)
async function getMisCursos(req, tutorId) {
    const db = req.db;
    const { school_id } = req.session.user;
    const anio = req.session.user.anio_lectivo || '2026-2027';

    const [porMaterias] = await db.query(
        `SELECT curso, paralelo, IFNULL(especialidad, '') AS especialidad, COUNT(*) AS total_materias
         FROM materias
         WHERE tutor_id = ? AND school_id = ? AND anio_lectivo = ?
         GROUP BY curso, paralelo, especialidad`,
        [tutorId, school_id, anio]
    );

    const [porAsignacion] = await db.query(
        `SELECT curso, paralelo, IFNULL(especialidad, '') AS especialidad
         FROM asignacion_tutores
         WHERE tutor_id = ? AND school_id = ? AND anio_lectivo = ?`,
        [tutorId, school_id, anio]
    );

    const cursos = new Map();
    porMaterias.forEach(m => {
        cursos.set(`${m.curso}|${m.paralelo}|${m.especialidad}`, {
            curso: m.curso, paralelo: m.paralelo, especialidad: m.especialidad,
            total_materias: parseInt(m.total_materias)
        });
    });
    porAsignacion.forEach(a => {
        const key = `${a.curso}|${a.paralelo}|${a.especialidad}`;
        if (!cursos.has(key)) {
            cursos.set(key, { curso: a.curso, paralelo: a.paralelo, especialidad: a.especialidad, total_materias: 0 });
        }
    });
    return Array.from(cursos.values()).sort((a, b) =>
        a.curso.localeCompare(b.curso) || a.paralelo.localeCompare(b.paralelo)
    );
}

// Verificar que un curso pertenece al tutor
async function esCursoDelTutor(req, tutorId, curso, paralelo, especialidad) {
    const cursos = await getMisCursos(req, tutorId);
    const esp = (especialidad || '').trim();
    return cursos.some(c => c.curso === curso && c.paralelo === paralelo && c.especialidad === esp);
}

// Lista de cursos del tutor
router.get('/mis-cursos', async (req, res) => {
    try {
        const tutorId = await getTutorId(req);
        if (!tutorId) return res.json([]);
        res.json(await getMisCursos(req, tutorId));
    } catch (err) {
        console.error('Error al listar cursos del tutor:', err);
        res.status(500).json({ error: err.message });
    }
});

// Estudiantes de un curso del tutor
router.get('/estudiantes', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const { curso, paralelo, especialidad } = req.query;
        if (!curso || !paralelo) return res.json([]);

        const tutorId = await getTutorId(req);
        if (!tutorId) return res.status(403).json({ error: 'No es tutor de ningun curso' });

        if (!(await esCursoDelTutor(req, tutorId, curso, paralelo, especialidad))) {
            return res.status(403).json({ error: 'Este curso no le pertenece como tutor' });
        }

        const esp = (especialidad || '').trim();
        const [rows] = await db.query(
            `SELECT id, numero_matricula, cedula, nombres_apellidos, sexo, fecha_nacimiento, edad,
                    email, tipo_sangre, discapacidad, discapacidad_tipo,
                    pais, provincia, ciudad, parroquia, direccion,
                    representante, cedula_representante, parentesco_representante,
                    telefono_representante, email_representante, lugar_trabajo_representante,
                    anio_lectivo, curso, paralelo, especialidad, activo
             FROM estudiantes
             WHERE school_id = ? AND activo = 1 AND curso = ? AND paralelo = ?
               AND IFNULL(especialidad, '') = IFNULL(?, '')
             ORDER BY nombres_apellidos`,
            [schoolId, curso, paralelo, esp]
        );
        res.json(rows);
    } catch (err) {
        console.error('Error al listar estudiantes del tutor:', err);
        res.status(500).json({ error: err.message });
    }
});

// Editar estudiante (SOLO datos personales, ubicacion y representante)
// PROHIBIDO: cedula, numero_matricula, anio_lectivo, curso, paralelo, especialidad
router.put('/estudiantes/:id', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const { id } = req.params;

        const tutorId = await getTutorId(req);
        if (!tutorId) return res.status(403).json({ error: 'No es tutor de ningun curso' });

        const [estRows] = await db.query(
            'SELECT id, curso, paralelo, especialidad FROM estudiantes WHERE id = ? AND school_id = ?',
            [id, schoolId]
        );
        if (estRows.length === 0) {
            return res.status(404).json({ error: 'Estudiante no encontrado' });
        }
        const est = estRows[0];

        if (!(await esCursoDelTutor(req, tutorId, est.curso, est.paralelo, est.especialidad))) {
            return res.status(403).json({ error: 'Este estudiante no pertenece a su curso' });
        }

        const b = req.body;
        let edad = null;
        if (b.fecha_nacimiento) {
            const hoy = new Date();
            const nac = new Date(b.fecha_nacimiento);
            edad = hoy.getFullYear() - nac.getFullYear();
            const m = hoy.getMonth() - nac.getMonth();
            if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
        }

        await db.query(
            `UPDATE estudiantes SET
                nombres_apellidos = ?, sexo = ?, fecha_nacimiento = ?, edad = ?, email = ?,
                tipo_sangre = ?, discapacidad = ?, discapacidad_tipo = ?,
                pais = ?, provincia = ?, ciudad = ?, parroquia = ?, direccion = ?,
                representante = ?, cedula_representante = ?, parentesco_representante = ?,
                telefono_representante = ?, email_representante = ?, lugar_trabajo_representante = ?
             WHERE id = ? AND school_id = ?`,
            [
                b.nombres_apellidos, b.sexo, b.fecha_nacimiento || null, edad, b.email || null,
                b.tipo_sangre || null, b.discapacidad || 'NO', b.discapacidad_tipo || null,
                b.pais || null, b.provincia || null, b.ciudad || null, b.parroquia || null, b.direccion || null,
                b.representante || null, b.cedula_representante || null, b.parentesco_representante || null,
                b.telefono_representante || null, b.email_representante || null, b.lugar_trabajo_representante || null,
                id, schoolId
            ]
        );
        res.json({ message: 'Estudiante actualizado exitosamente' });
    } catch (err) {
        console.error('Error al editar estudiante (tutor):', err);
        res.status(500).json({ error: err.message });
    }
});

// ========== FALTAS Y COMENTARIOS DE ASISTENCIA ==========

// Faltas/atrasos de los estudiantes del curso en todas sus materias
router.get('/faltas', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const { curso, paralelo, especialidad, desde, hasta, estado } = req.query;
        if (!curso || !paralelo) return res.json([]);

        const tutorId = await getTutorId(req);
        if (!tutorId) return res.status(403).json({ error: 'No es tutor de ningun curso' });
        if (!(await esCursoDelTutor(req, tutorId, curso, paralelo, especialidad))) {
            return res.status(403).json({ error: 'Este curso no le pertenece como tutor' });
        }

        const esp = (especialidad || '').trim();
        let sql = `
            SELECT a.id, a.fecha, a.estado, a.comentario,
                   e.id AS estudiante_id, e.nombres_apellidos, e.cedula,
                   m.nombre_materia, IFNULL(u.nombre, 'Sin docente') AS docente
            FROM asistencias a
            INNER JOIN grupos g ON a.grupo_id = g.id
            INNER JOIN materias m ON g.materia_id = m.id
            INNER JOIN estudiantes e ON g.estudiante_id = e.id
            LEFT JOIN usuarios u ON m.docente_id = u.id
            WHERE g.school_id = ? AND m.curso = ? AND m.paralelo = ?
              AND IFNULL(m.especialidad, '') = IFNULL(?, '')
        `;
        const params = [schoolId, curso, paralelo, esp];

        if (estado === 'ausente' || estado === 'atraso') {
            sql += ' AND a.estado = ?';
            params.push(estado);
        } else {
            sql += " AND a.estado IN ('ausente', 'atraso')";
        }
        if (desde) { sql += ' AND a.fecha >= ?'; params.push(desde); }
        if (hasta) { sql += ' AND a.fecha <= ?'; params.push(hasta); }
        sql += ' ORDER BY a.fecha DESC, e.nombres_apellidos';

        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error('Error al listar faltas:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========== HISTORIAL DE COMPORTAMIENTO ==========

// Registros de comportamiento de los estudiantes del curso
router.get('/comportamiento', async (req, res) => {
    try {
        const db = req.db;
        const schoolId = req.session.user.school_id;
        const { curso, paralelo, especialidad } = req.query;
        if (!curso || !paralelo) return res.json([]);

        const tutorId = await getTutorId(req);
        if (!tutorId) return res.status(403).json({ error: 'No es tutor de ningun curso' });
        if (!(await esCursoDelTutor(req, tutorId, curso, paralelo, especialidad))) {
            return res.status(403).json({ error: 'Este curso no le pertenece como tutor' });
        }

        const esp = (especialidad || '').trim();
        const [rows] = await db.query(
            `SELECT hc.id, hc.fecha, hc.tipo, hc.descripcion, hc.created_at,
                    e.id AS estudiante_id, e.nombres_apellidos, e.cedula,
                    u.nombre AS registrado_por
             FROM historial_comportamiento hc
             INNER JOIN estudiantes e ON hc.estudiante_id = e.id
             LEFT JOIN usuarios u ON hc.usuario_id = u.id
             WHERE hc.school_id = ? AND e.curso = ? AND e.paralelo = ?
               AND IFNULL(e.especialidad, '') = IFNULL(?, '')
             ORDER BY hc.fecha DESC, hc.id DESC`,
            [schoolId, curso, paralelo, esp]
        );
        res.json(rows);
    } catch (err) {
        console.error('Error al listar comportamiento:', err);
        res.status(500).json({ error: err.message });
    }
});

// Registrar un nuevo comportamiento
router.post('/comportamiento', async (req, res) => {
    try {
        const db = req.db;
        const user = req.session.user;
        const { estudiante_id, fecha, tipo, descripcion } = req.body;

        if (!estudiante_id || !fecha || !descripcion || !descripcion.trim()) {
            return res.status(400).json({ error: 'Estudiante, fecha y descripcion son requeridos' });
        }
        const tipoValido = ['observacion', 'positivo', 'negativo'].includes(tipo) ? tipo : 'observacion';

        const tutorId = await getTutorId(req);
        if (!tutorId) return res.status(403).json({ error: 'No es tutor de ningun curso' });

        const [estRows] = await db.query(
            'SELECT id, curso, paralelo, especialidad FROM estudiantes WHERE id = ? AND school_id = ?',
            [estudiante_id, user.school_id]
        );
        if (estRows.length === 0) return res.status(404).json({ error: 'Estudiante no encontrado' });
        const est = estRows[0];

        if (!(await esCursoDelTutor(req, tutorId, est.curso, est.paralelo, est.especialidad))) {
            return res.status(403).json({ error: 'Este estudiante no pertenece a su curso' });
        }

        await db.query(
            `INSERT INTO historial_comportamiento
                (estudiante_id, tutor_id, usuario_id, fecha, tipo, descripcion, school_id, anio_lectivo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [estudiante_id, tutorId, user.id, fecha, tipoValido, descripcion.trim(), user.school_id, user.anio_lectivo || '2026-2027']
        );
        res.json({ message: 'Registro de comportamiento guardado' });
    } catch (err) {
        console.error('Error al registrar comportamiento:', err);
        res.status(500).json({ error: err.message });
    }
});

// Eliminar un registro de comportamiento
router.delete('/comportamiento/:id', async (req, res) => {
    try {
        const db = req.db;
        const user = req.session.user;
        const { id } = req.params;

        const tutorId = await getTutorId(req);
        if (!tutorId) return res.status(403).json({ error: 'No es tutor de ningun curso' });

        const [rows] = await db.query(
            `SELECT hc.id, hc.estudiante_id, e.curso, e.paralelo, e.especialidad
             FROM historial_comportamiento hc
             INNER JOIN estudiantes e ON hc.estudiante_id = e.id
             WHERE hc.id = ? AND hc.school_id = ?`,
            [id, user.school_id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Registro no encontrado' });
        const reg = rows[0];

        if (!(await esCursoDelTutor(req, tutorId, reg.curso, reg.paralelo, reg.especialidad))) {
            return res.status(403).json({ error: 'Este registro no pertenece a su curso' });
        }

        await db.query('DELETE FROM historial_comportamiento WHERE id = ?', [id]);
        res.json({ message: 'Registro eliminado' });
    } catch (err) {
        console.error('Error al eliminar comportamiento:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
