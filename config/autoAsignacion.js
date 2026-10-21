/**
 * Asignacion automatica de alumnos a materias
 * ---------------------------------------------
 * La matricula del alumno (curso + paralelo + especialidad + anio lectivo)
 * define a que materias pertenece. Al matricular, al editar o al sincronizar,
 * el alumno queda asignado a TODAS las materias de su curso/paralelo/especialidad.
 *
 * Reglas de seguridad:
 *  - Nunca se borra un grupo que tenga notas registradas.
 *  - Al cambiar de curso, las notas se MIGRAN al grupo nuevo (no se pierden).
 */

// Une el nombre del grupo como lo usa el resto del sistema
function nombreGrupo(materia, curso, paralelo) {
    const base = `${materia.nombre_materia} - ${curso} ${paralelo}`;
    return base;
}

/**
 * Asigna un estudiante a todas las materias de su curso/paralelo/especialidad.
 * Solo agrega: nunca borra nada. Devuelve el numero de asignaciones creadas.
 */
async function asignarEstudianteAMaterias(db, est) {
    const { estudiante_id, curso, paralelo, especialidad, anio_lectivo, school_id } = est;
    if (!estudiante_id || !curso || !paralelo) return 0;

    const esp = especialidad || '';
    const [materias] = await db.query(
        `SELECT id, nombre_materia FROM materias
         WHERE school_id = ? AND anio_lectivo = ? AND curso = ? AND paralelo = ?
           AND IFNULL(especialidad, '') = IFNULL(?, '')`,
        [school_id, anio_lectivo, curso, paralelo, esp]
    );
    if (materias.length === 0) return 0;

    let creadas = 0;
    for (const m of materias) {
        const [r] = await db.query(
            `INSERT IGNORE INTO grupos (nombre_grupo, materia_id, estudiante_id, school_id, anio_lectivo)
             VALUES (?, ?, ?, ?, ?)`,
            [nombreGrupo(m, curso, paralelo), m.id, estudiante_id, school_id, anio_lectivo]
        );
        creadas += r.affectedRows;
    }
    return creadas;
}

/**
 * Asigna varios alumnos a la vez (una sola sentencia INSERT ... SELECT).
 * Pensado para la importacion masiva desde Excel.
 */
async function asignarLoteAMaterias(db, estudiantesIds) {
    if (!estudiantesIds || estudiantesIds.length === 0) return 0;
    const ph = estudiantesIds.map(() => '?').join(',');
    const [r] = await db.query(
        `INSERT IGNORE INTO grupos (nombre_grupo, materia_id, estudiante_id, school_id, anio_lectivo)
         SELECT CONCAT(m.nombre_materia, ' - ', e.curso, ' ', e.paralelo),
                m.id, e.id, e.school_id, e.anio_lectivo
         FROM estudiantes e
         JOIN materias m
           ON m.school_id = e.school_id
          AND m.anio_lectivo = e.anio_lectivo
          AND m.curso = e.curso
          AND m.paralelo = e.paralelo
          AND IFNULL(m.especialidad, '') = IFNULL(e.especialidad, '')
         WHERE e.id IN (${ph}) AND e.activo = 1
           AND e.curso IS NOT NULL AND e.paralelo IS NOT NULL`,
        estudiantesIds
    );
    return r.affectedRows;
}

/**
 * Sincroniza todos los alumnos de una escuela/ano con sus materias.
 * - agrega las asignaciones que faltan
 * - opcionalmente quita los grupos "huerfanos" (alumno en materia de otro
 *   curso/especialidad) SOLO si no tienen notas registradas
 */
async function sincronizarAsignaciones(db, opciones) {
    const { school_id, anio_lectivo, limpiarHuerfanos = true } = opciones;

    // 1) Agregar las asignaciones faltantes
    const [faltantes] = await db.query(
        `SELECT e.id AS estudiante_id, e.curso, e.paralelo, e.especialidad,
                e.anio_lectivo, e.school_id, m.id AS materia_id, m.nombre_materia
         FROM estudiantes e
         JOIN materias m
           ON m.school_id = e.school_id
          AND m.anio_lectivo = e.anio_lectivo
          AND m.curso = e.curso
          AND m.paralelo = e.paralelo
          AND IFNULL(m.especialidad, '') = IFNULL(e.especialidad, '')
         LEFT JOIN grupos g
           ON g.materia_id = m.id AND g.estudiante_id = e.id
         WHERE e.school_id = ? AND e.anio_lectivo = ? AND e.activo = 1
           AND e.curso IS NOT NULL AND e.paralelo IS NOT NULL
           AND g.id IS NULL`,
        [school_id, anio_lectivo]
    );

    let agregados = 0;
    for (const f of faltantes) {
        const [r] = await db.query(
            `INSERT IGNORE INTO grupos (nombre_grupo, materia_id, estudiante_id, school_id, anio_lectivo)
             VALUES (?, ?, ?, ?, ?)`,
            [nombreGrupo(f, f.curso, f.paralelo), f.materia_id, f.estudiante_id, f.school_id, f.anio_lectivo]
        );
        agregados += r.affectedRows;
    }

    let huerfanosEliminados = 0;
    let huerfanosConservados = 0;
    if (limpiarHuerfanos) {
        // Grupos cuya materia no corresponde al curso/especialidad del alumno
        const [huerfanos] = await db.query(
            `SELECT g.id AS grupo_id, COUNT(n.id) AS notas
             FROM grupos g
             JOIN estudiantes e ON e.id = g.estudiante_id
             JOIN materias m ON m.id = g.materia_id
             LEFT JOIN notas n ON n.grupo_id = g.id
             WHERE e.school_id = ? AND e.anio_lectivo = ? AND m.anio_lectivo = ?
               AND NOT (m.curso = e.curso AND m.paralelo = e.paralelo
                        AND IFNULL(m.especialidad, '') = IFNULL(e.especialidad, ''))
             GROUP BY g.id`,
            [school_id, anio_lectivo, anio_lectivo]
        );
        for (const h of huerfanos) {
            if (h.notas > 0) { huerfanosConservados++; continue; } // no se borra nada con notas
            await db.query('DELETE FROM grupos WHERE id = ?', [h.grupo_id]);
            huerfanosEliminados++;
        }
    }

    return { agregados, huerfanosEliminados, huerfanosConservados };
}

/**
 * Reasigna un alumno que cambio de curso/paralelo/especialidad.
 * - agrega las materias nuevas
 * - migra las notas al grupo nuevo cuando la misma materia existe en el curso nuevo
 * - elimina el grupo viejo solo si sus notas fueron migradas (o si no tenia notas)
 */
async function reasignarEstudiante(db, est) {
    const { estudiante_id, school_id, anio_lectivo, curso, paralelo, especialidad } = est;
    if (!curso || !paralelo) return 0;

    const esp = especialidad || '';

    // Materias del curso nuevo para este alumno
    const [nuevasMaterias] = await db.query(
        `SELECT id, nombre_materia FROM materias
         WHERE school_id = ? AND anio_lectivo = ? AND curso = ? AND paralelo = ?
           AND IFNULL(especialidad, '') = IFNULL(?, '')`,
        [school_id, anio_lectivo, curso, paralelo, esp]
    );

    // Grupos actuales del alumno que ya no corresponden a su curso
    const [viejos] = await db.query(
        `SELECT g.id AS grupo_id, g.materia_id, g.nombre_grupo, m.nombre_materia
         FROM grupos g
         JOIN materias m ON m.id = g.materia_id
         WHERE g.estudiante_id = ? AND g.school_id = ? AND g.anio_lectivo = ?
           AND NOT (m.curso = ? AND m.paralelo = ?
                    AND IFNULL(m.especialidad, '') = IFNULL(?, ''))`,
        [estudiante_id, school_id, anio_lectivo, curso, paralelo, esp]
    );

    let notasMigradas = 0;
    for (const v of viejos) {
        // Busca la misma materia (mismo nombre) en el curso nuevo
        const destino = nuevasMaterias.find(m => m.nombre_materia === v.nombre_materia);
        if (!destino) continue; // la materia no existe en el curso nuevo: se deja el grupo intacto

        // Grupo destino (crear si no existe)
        const [existente] = await db.query(
            'SELECT id FROM grupos WHERE materia_id = ? AND estudiante_id = ?',
            [destino.id, estudiante_id]
        );
        let grupoDestinoId;
        if (existente.length > 0) {
            grupoDestinoId = existente[0].id;
        } else {
            const [ins] = await db.query(
                `INSERT INTO grupos (nombre_grupo, materia_id, estudiante_id, school_id, anio_lectivo)
                 VALUES (?, ?, ?, ?, ?)`,
                [`${destino.nombre_materia} - ${curso} ${paralelo}`, destino.id, estudiante_id, school_id, anio_lectivo]
            );
            grupoDestinoId = ins.insertId;
        }

        // Mover las notas del grupo viejo al nuevo (no se pierde ninguna)
        const [mov] = await db.query(
            'UPDATE notas SET grupo_id = ? WHERE grupo_id = ?',
            [grupoDestinoId, v.grupo_id]
        );
        notasMigradas += mov.affectedRows;

        await db.query('DELETE FROM grupos WHERE id = ?', [v.grupo_id]);
    }

    const agregados = await asignarEstudianteAMaterias(db, est);
    return { agregados, notasMigradas };
}

module.exports = {
    asignarEstudianteAMaterias,
    asignarLoteAMaterias,
    sincronizarAsignaciones,
    reasignarEstudiante
};
