/**
 * check_anio.js — Diagnóstico de consistencia del AÑO LECTIVO (SOLO LECTURA)
 *
 * El año lectivo separa matrículas y notas de un año a otro:
 * un estudiante en 2026-2027 tiene materias con notas, y en 2027-2028
 * tendrá otras materias con otras notas.
 *
 * Este script revisa que las tablas estén alineadas:
 *   estudiantes <-> materias <-> grupos <-> notas/asistencias/promedios
 * y reporta huérfanos, años cruzados y matrículas sin grupos.
 *
 * NUNCA modifica datos: solo permite sentencias SELECT (hay un candado
 * explícito que bloquea cualquier otra sentencia).
 *
 * Uso:
 *   node check_anio.js                          # base local (.env)
 *   $env:DB_URL='mysql://...'; node check_anio.js   # producción (TiDB)
 *
 * Salida: 0 = todo consistente, 2 = se detectaron problemas.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
    const conn = process.env.DB_URL
        ? await mysql.createConnection({
            uri: process.env.DB_URL,
            ssl: { rejectUnauthorized: true },
            bigNumberStrings: true
        })
        : await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_DATABASE,
            bigNumberStrings: true
        });

    // ===== Candado de solo lectura: cualquier sentencia que no sea SELECT se rechaza =====
    async function q(sql, params = []) {
        if (!/^\s*(SELECT|WITH|SHOW|DESCRIBE|EXPLAIN)\b/i.test(sql)) {
            throw new Error('BLOQUEADO: check_anio.js es de solo lectura. Sentencia: ' + sql.slice(0, 80));
        }
        const [rows] = await conn.query(sql, params);
        return rows;
    }
    const count = async (sql, params = []) => Number((await q(sql, params))[0].n);

    const [{ db: dbName }] = await q('SELECT DATABASE() AS db');
    const esProd = /prod|tidb/i.test(process.env.DB_URL || '') ? 'PRODUCCIÓN (TiDB)' : 'local';
    let problemas = 0;
    let avisos = 0;

    const linea = (s = '') => console.log(s);
    const ok = msg => linea(`   [OK]    ${msg}`);
    const aviso = msg => { avisos++; linea(`   [AVISO] ${msg}`); };
    const mal = (msg, ejemplos = []) => {
        problemas++;
        linea(`   [PROBLEMA] ${msg}`);
        ejemplos.forEach(e => linea(`            ej. ${e}`));
    };

    const tieneColumna = async (tabla, col) =>
        (await count(
            'SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
            [tabla, col]
        )) > 0;

    const muestra = async (sql, params = [], campos) => {
        const rows = await q(sql + ' LIMIT 5', params);
        return rows.map(r => campos.map(c => r[c]).join(' | '));
    };

    linea('============================================================');
    linea(' CHECK_ANIO — Diagnóstico del AÑO LECTIVO (solo lectura)');
    linea(` Base: ${dbName}  [${esProd}]`);
    linea(` Fecha: ${new Date().toISOString()}`);
    linea('============================================================');

    // ---------------------------------------------------------------
    // 1) Años lectivos registrados y activos por rol
    // ---------------------------------------------------------------
    linea('');
    linea('1) AÑOS LECTIVOS REGISTRADOS');
    const tablaAnios = await count(
        "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'anio_lectivos'"
    );
    if (!tablaAnios) {
        aviso('No existe la tabla anio_lectivos (aún no se gestionan años múltiples).');
    } else {
        const anios = await q('SELECT * FROM anio_lectivos ORDER BY anio DESC');
        if (anios.length === 0) aviso('No hay años lectivos registrados.');
        anios.forEach(a => {
            const roles = ['docente', 'secretaria', 'inspector']
                .filter(r => a['activo_' + r] === 1 || a['activo_' + r] === true)
                .join(', ') || '—';
            linea(`   ${a.anio}  | activo general: ${a.activo ? 'SI' : 'no'} | roles activos: ${roles}`);
        });
    }

    // ---------------------------------------------------------------
    // 2) Cantidad de registros por tabla y año
    // ---------------------------------------------------------------
    linea('');
    linea('2) REGISTROS POR TABLA Y AÑO LECTIVO');
    const tablas = ['estudiantes', 'materias', 'grupos', 'notas', 'asistencias',
        'promedios_trimestrales', 'pruebas_diagnostico', 'asignacion_tutores'];
    const conteos = {};
    for (const t of tablas) {
        if (!(await tieneColumna(t, 'anio_lectivo'))) {
            linea(`   ${t.padEnd(26)} (sin columna anio_lectivo)`);
            continue;
        }
        const rows = await q(`SELECT anio_lectivo AS a, COUNT(*) AS n FROM \`${t}\` GROUP BY anio_lectivo ORDER BY a`);
        conteos[t] = {};
        const partes = rows.map(r => {
            const anio = r.a === null ? '(sin año)' : r.a;
            conteos[t][anio] = Number(r.n);
            return `${anio}: ${r.n}`;
        });
        linea(`   ${t.padEnd(26)} ${partes.join('  ') || '(vacía)'}`);
    }

    // Avisos de cobertura: años activos sin datos y viceversa
    if (tablaAnios) {
        const aniosConDatos = new Set(Object.values(conteos).flatMap(o => Object.keys(o)));
        const aniosReg = await q('SELECT anio FROM anio_lectivos');
        aniosReg.forEach(a => {
            if (!aniosConDatos.has(a.anio)) {
                aviso(`El año ${a.anio} está registrado pero todavía no tiene datos (estudiantes/materias/notas).`);
            }
        });
        aniosConDatos.forEach(anio => {
            if (anio !== '(sin año)' && !aniosReg.some(a => a.anio === anio)) {
                aviso(`Hay datos con año "${anio}" pero ese año no está registrado en anio_lectivos.`);
            }
        });
    }

    // ---------------------------------------------------------------
    // 3) Consistencia entre tablas
    // ---------------------------------------------------------------
    linea('');
    linea('3) CONSISTENCIA ENTRE TABLAS');

    // 3a. notas sin grupo (huérfanas)
    const notasHuerfanas = await count(
        'SELECT COUNT(*) AS n FROM notas no LEFT JOIN grupos g ON g.id = no.grupo_id WHERE g.id IS NULL'
    );
    if (notasHuerfanas === 0) ok('notas -> grupos: todas las notas pertenecen a un grupo existente.');
    else {
        const ej = await muestra(
            'SELECT no.id, no.grupo_id, no.trimestre, no.tipo, no.nota FROM notas no LEFT JOIN grupos g ON g.id = no.grupo_id WHERE g.id IS NULL',
            [], ['id', 'grupo_id', 'trimestre', 'tipo', 'nota']
        );
        mal(`${notasHuerfanas} notas huérfanas (grupo_id inexistente).`, ej);
    }

    // 3b. grupos -> estudiante: mismo año
    const gEst = await count(
        'SELECT COUNT(*) AS n FROM grupos g JOIN estudiantes e ON e.id = g.estudiante_id WHERE g.anio_lectivo <> e.anio_lectivo'
    );
    if (gEst === 0) ok('grupos <-> estudiantes: mismo año lectivo.');
    else {
        const ej = await muestra(
            'SELECT g.id, e.nombres_apellidos, e.anio_lectivo AS anio_est, g.anio_lectivo AS anio_grp ' +
            'FROM grupos g JOIN estudiantes e ON e.id = g.estudiante_id WHERE g.anio_lectivo <> e.anio_lectivo',
            [], ['id', 'nombres_apellidos', 'anio_est', 'anio_grp']
        );
        mal(`${gEst} grupos con año distinto al del estudiante.`, ej);
    }

    // 3c. grupos -> materia: mismo año
    const gMat = await count(
        'SELECT COUNT(*) AS n FROM grupos g JOIN materias m ON m.id = g.materia_id WHERE g.anio_lectivo <> m.anio_lectivo'
    );
    if (gMat === 0) ok('grupos <-> materias: mismo año lectivo.');
    else {
        const ej = await muestra(
            'SELECT g.id, m.nombre_materia, m.anio_lectivo AS anio_mat, g.anio_lectivo AS anio_grp ' +
            'FROM grupos g JOIN materias m ON m.id = g.materia_id WHERE g.anio_lectivo <> m.anio_lectivo',
            [], ['id', 'nombre_materia', 'anio_mat', 'anio_grp']
        );
        mal(`${gMat} grupos con año distinto al de la materia.`, ej);
    }

    // 3d. notas -> grupo: mismo año
    if (await tieneColumna('notas', 'anio_lectivo')) {
        const nGrp = await count(
            'SELECT COUNT(*) AS n FROM notas no JOIN grupos g ON g.id = no.grupo_id WHERE no.anio_lectivo <> g.anio_lectivo'
        );
        if (nGrp === 0) ok('notas <-> grupos: mismo año lectivo.');
        else {
            const ej = await muestra(
                'SELECT no.id, no.nota, no.anio_lectivo AS anio_nota, g.anio_lectivo AS anio_grp ' +
                'FROM notas no JOIN grupos g ON g.id = no.grupo_id WHERE no.anio_lectivo <> g.anio_lectivo',
                [], ['id', 'nota', 'anio_nota', 'anio_grp']
            );
            mal(`${nGrp} notas con año distinto al de su grupo.`, ej);
        }
    } else {
        linea('   [INFO]  notas no tiene columna anio_lectivo (se hereda del grupo).');
    }

    // 3e. promedios -> grupo: mismo año
    if (await tieneColumna('promedios_trimestrales', 'anio_lectivo')) {
        const pGrp = await count(
            'SELECT COUNT(*) AS n FROM promedios_trimestrales p JOIN grupos g ON g.id = p.grupo_id WHERE p.anio_lectivo <> g.anio_lectivo'
        );
        if (pGrp === 0) ok('promedios_trimestrales <-> grupos: mismo año lectivo.');
        else mal(`${pGrp} promedios con año distinto al de su grupo.`);
    }

    // 3f. asistencias -> grupo: mismo año
    if (await tieneColumna('asistencias', 'anio_lectivo')) {
        const aGrp = await count(
            'SELECT COUNT(*) AS n FROM asistencias a JOIN grupos g ON g.id = a.grupo_id WHERE a.anio_lectivo <> g.anio_lectivo'
        );
        if (aGrp === 0) ok('asistencias <-> grupos: mismo año lectivo.');
        else mal(`${aGrp} asistencias con año distinto al de su grupo.`);
    }

    // 3g. pruebas_diagnostico -> estudiante: mismo año
    if (await tieneColumna('pruebas_diagnostico', 'anio_lectivo')) {
        const pEst = await count(
            'SELECT COUNT(*) AS n FROM pruebas_diagnostico p JOIN estudiantes e ON e.id = p.estudiante_id WHERE p.anio_lectivo <> e.anio_lectivo'
        );
        if (pEst === 0) ok('pruebas_diagnostico <-> estudiantes: mismo año lectivo.');
        else mal(`${pEst} pruebas diagnósticas con año distinto al del estudiante.`);
    }

    // 3h. grupos huérfanos (materia o estudiante inexistente)
    const gOrphan = await count(
        'SELECT COUNT(*) AS n FROM grupos g LEFT JOIN estudiantes e ON e.id = g.estudiante_id LEFT JOIN materias m ON m.id = g.materia_id WHERE e.id IS NULL OR m.id IS NULL'
    );
    if (gOrphan === 0) ok('grupos: todos tienen estudiante y materia existentes.');
    else mal(`${gOrphan} grupos huérfanos (sin estudiante o sin materia).`);

    // ---------------------------------------------------------------
    // 4) Matrículas sin asignación de grupos
    // ---------------------------------------------------------------
    linea('');
    linea('4) MATRÍCULAS Y ASIGNACIONES');
    const sinGrupos = await count(
        'SELECT COUNT(*) AS n FROM estudiantes e WHERE e.activo = 1 AND NOT EXISTS (' +
        'SELECT 1 FROM grupos g WHERE g.estudiante_id = e.id AND g.anio_lectivo = e.anio_lectivo)'
    );
    if (sinGrupos === 0) ok('Todos los estudiantes activos tienen grupos (materias) en su año.');
    else {
        const ej = await muestra(
            'SELECT e.id, e.nombres_apellidos, e.curso, e.paralelo, e.anio_lectivo FROM estudiantes e ' +
            'WHERE e.activo = 1 AND NOT EXISTS (SELECT 1 FROM grupos g WHERE g.estudiante_id = e.id AND g.anio_lectivo = e.anio_lectivo)',
            [], ['id', 'nombres_apellidos', 'curso', 'paralelo', 'anio_lectivo']
        );
        aviso(`${sinGrupos} estudiantes activos sin grupos asignados en su año:`);
        ej.forEach(e => linea(`            ej. ${e}`));
    }

    const gruposSinNotas = await count(
        'SELECT COUNT(*) AS n FROM grupos g WHERE g.anio_lectivo = ? AND NOT EXISTS (SELECT 1 FROM notas no WHERE no.grupo_id = g.id)',
        [(await q('SELECT anio FROM anio_lectivos ORDER BY anio DESC LIMIT 1'))[0]?.anio || '2026-2027']
    );
    linea(`   [INFO]  Grupos sin ninguna nota en el año más reciente: ${gruposSinNotas} (normal al inicio del año).`);

    // ---------------------------------------------------------------
    // Resumen
    // ---------------------------------------------------------------
    linea('');
    linea('============================================================');
    linea(` RESUMEN: ${problemas} problema(s), ${avisos} aviso(s)`);
    if (problemas === 0) {
        linea(' RESULTADO: los datos del año lectivo están CONSISTENTES.');
    } else {
        linea(' RESULTADO: hay datos INCONSISTENTES (ver detalle arriba).');
        linea(' Este script NO modifica nada; revisá cada caso antes de actuar.');
    }
    linea('============================================================');

    await conn.end();
    process.exit(problemas > 0 ? 2 : 0);
})().catch(err => {
    console.error('ERROR:', err.message);
    process.exit(1);
});
