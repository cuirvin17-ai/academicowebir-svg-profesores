const http = require('http');
const mysql = require('mysql2/promise');
const d = 'cedula=1400501070&password=rector123';

function req(opts, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: 'localhost', port: 3000, ...opts, headers: { ...opts.headers } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}
function json(opts, body) {
  if (body) opts.headers = { ...opts.headers, 'Content-Length': Buffer.byteLength(body) };
  return req(opts, body).then(r => {
    let j = null; try { j = JSON.parse(r.body); } catch (e) {}
    return { status: r.status, json: j, body: r.body };
  });
}

(async () => {
  const db = await mysql.createConnection({ host: 'localhost', user: 'root', password: 'Betoben1', database: 'gestion_academica' });
  const cuenta = async () => {
    const [g] = await db.query('SELECT COUNT(*) n FROM grupos');
    const [n] = await db.query('SELECT COUNT(*) n FROM notas');
    const [a] = await db.query('SELECT COUNT(*) n FROM asistencias');
    return `grupos=${g[0].n} notas=${n[0].n} asistencias=${a[0].n}`;
  };
  const limpiar = async () => {
    await db.query("DELETE FROM grupos WHERE estudiante_id IN (SELECT id FROM estudiantes WHERE cedula='9999999991')");
    await db.query("DELETE FROM estudiantes WHERE cedula='9999999991'");
    await db.query("DELETE FROM materias WHERE nombre_materia LIKE 'ZZ Test Rapido%'");
  };

  await limpiar();
  const inicio = await cuenta();
  console.log('INICIO:', inicio);

  // Datos de prueba aislados (curso ZZTEST no existe en datos reales)
  await db.query("INSERT INTO materias (nombre_materia, curso, paralelo, school_id) VALUES ('ZZ Test Rapido 1','ZZTEST','A',1), ('ZZ Test Rapido 2','ZZTEST','A',1)");
  const [st] = await db.query("INSERT INTO estudiantes (cedula, nombres_apellidos, sexo, curso, paralelo, anio_lectivo, school_id, activo) VALUES ('9999999991','ALUMNO PRUEBA RAPIDA','M','ZZTEST','A','2026-2027',1,1)");
  const sid = st.insertId;

  const loginRes = await req({ method: 'POST', path: '/login', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(d) } }, d);
  const cookie = loginRes.headers['set-cookie'][0].split(';')[0];

  // 1) GET inicial
  let r = await json({ method: 'GET', path: '/api/rector/asignacion-curso?curso=ZZTEST&paralelo=A', headers: { Cookie: cookie } });
  console.log('GET inicial:', r.status, '| materias:', r.json.total_materias, '| alumnos:', r.json.alumnos.length, '| asignadas:', r.json.alumnos[0].materias_asignadas);
  if (r.status !== 200 || r.json.total_materias !== 2 || r.json.alumnos[0].materias_asignadas !== 0) throw new Error('Fallo GET inicial');

  // 2) POST asignar a todas las materias
  r = await json({ method: 'POST', path: '/api/rector/asignacion-curso', headers: { Cookie: cookie, 'Content-Type': 'application/json' } },
    JSON.stringify({ curso: 'ZZTEST', paralelo: 'A', especialidad: '', estudiante_ids: [sid] }));
  console.log('POST asignar:', r.status, JSON.stringify(r.json));
  if (r.status !== 200 || r.json.registros !== 2) throw new Error('Fallo POST');

  // 3) verificar completo
  r = await json({ method: 'GET', path: '/api/rector/asignacion-curso?curso=ZZTEST&paralelo=A', headers: { Cookie: cookie } });
  console.log('GET tras POST:', r.json.alumnos[0].materias_asignadas, '(esperado 2)');
  if (r.json.alumnos[0].materias_asignadas !== 2) throw new Error('Fallo verificacion POST');

  // 4) POST duplicado no debe duplicar
  r = await json({ method: 'POST', path: '/api/rector/asignacion-curso', headers: { Cookie: cookie, 'Content-Type': 'application/json' } },
    JSON.stringify({ curso: 'ZZTEST', paralelo: 'A', especialidad: '', estudiante_ids: [sid] }));
  console.log('POST duplicado:', r.status, '| registros:', r.json.registros, '(esperado 0)');
  if (r.json.registros !== 0) throw new Error('Fallo duplicado');

  // 5) DELETE quitar de todas
  r = await json({ method: 'DELETE', path: '/api/rector/asignacion-curso', headers: { Cookie: cookie, 'Content-Type': 'application/json' } },
    JSON.stringify({ curso: 'ZZTEST', paralelo: 'A', especialidad: '', estudiante_ids: [sid] }));
  console.log('DELETE quitar:', r.status, JSON.stringify(r.json));
  if (r.status !== 200 || r.json.registros !== 2) throw new Error('Fallo DELETE');

  // 6) verificar en 0
  r = await json({ method: 'GET', path: '/api/rector/asignacion-curso?curso=ZZTEST&paralelo=A', headers: { Cookie: cookie } });
  console.log('GET tras DELETE:', r.json.alumnos[0].materias_asignadas, '(esperado 0)');
  if (r.json.alumnos[0].materias_asignadas !== 0) throw new Error('Fallo verificacion DELETE');

  // 7) limpieza y verificar datos reales intactos
  await limpiar();
  const fin = await cuenta();
  console.log('FIN:', fin, '| igual al inicio:', fin === inicio ? 'SI' : 'NO');
  if (fin !== inicio) throw new Error('Los datos reales cambiaron!');

  console.log('TODAS LAS PRUEBAS OK');
  await db.close();
  process.exit(0);
})().catch(e => { console.log('ERROR:', e.message); process.exit(1); });
