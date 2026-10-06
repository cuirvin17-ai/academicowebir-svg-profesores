const http = require('http');
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

function json(opts, bodyStr) {
  return req(opts, bodyStr).then(r => {
    let j = null;
    try { j = JSON.parse(r.body); } catch (e) {}
    return { status: r.status, json: j, body: r.body };
  });
}

(async () => {
  try {
    const loginRes = await req({ method: 'POST', path: '/login', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(d) } }, d);
    const cookie = loginRes.headers['set-cookie'] ? loginRes.headers['set-cookie'][0].split(';')[0] : '';
    console.log('Login:', loginRes.status, cookie ? 'cookie OK' : 'SIN COOKIE');

    // 1) listar asignaciones (vacio)
    let r = await json({ method: 'GET', path: '/api/rector/asignacion-tutores', headers: { Cookie: cookie } });
    console.log('GET asignacion-tutores:', r.status, JSON.stringify(r.json));

    // 2) asignar tutor a curso Primero A Electromecanica (1 materia)
    r = await json({ method: 'POST', path: '/api/rector/asignacion-tutores', headers: { Cookie: cookie, 'Content-Type': 'application/json' } },
      JSON.stringify({ tutor_id: 1, curso: 'Primero', paralelo: 'A', especialidad: 'Electromecanica' }));
    console.log('POST asignar:', r.status, JSON.stringify(r.json));

    // 3) verificar que la materia quedo con tutor
    const mysql = require('mysql2/promise');
    const c = await mysql.createConnection({ host: 'localhost', user: 'root', password: 'Betoben1', database: 'gestion_academica' });
    const [m1] = await c.query("SELECT nombre_materia, curso, paralelo, especialidad, tutor_id FROM materias WHERE curso='Primero' AND paralelo='A' AND especialidad='Electromecanica'");
    console.log('materias con tutor:', JSON.stringify(m1));

    // 4) reasignar a otro tutor (upsert)
    r = await json({ method: 'POST', path: '/api/rector/asignacion-tutores', headers: { Cookie: cookie, 'Content-Type': 'application/json' } },
      JSON.stringify({ tutor_id: 2, curso: 'Primero', paralelo: 'A', especialidad: 'Electromecanica' }));
    console.log('POST reasignar:', r.status, JSON.stringify(r.json));
    const [m2] = await c.query("SELECT tutor_id FROM materias WHERE curso='Primero' AND paralelo='A' AND especialidad='Electromecanica'");
    console.log('tutor tras reasignar:', JSON.stringify(m2));

    // 5) GET lista
    r = await json({ method: 'GET', path: '/api/rector/asignacion-tutores', headers: { Cookie: cookie } });
    console.log('GET final:', r.status, JSON.stringify(r.json));

    // 6) DELETE
    const asigId = r.json[0] && r.json[0].id;
    r = await json({ method: 'DELETE', path: `/api/rector/asignacion-tutores/${asigId}`, headers: { Cookie: cookie } });
    console.log('DELETE:', r.status, JSON.stringify(r.json));
    const [m3] = await c.query("SELECT tutor_id FROM materias WHERE curso='Primero' AND paralelo='A' AND especialidad='Electromecanica'");
    console.log('tutor tras delete (esperado null):', JSON.stringify(m3));

    await c.close();
  } catch (e) {
    console.log('ERR', e.message);
  }
  process.exit(0);
})();
