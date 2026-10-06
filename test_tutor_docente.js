const http = require('http');
const mysql = require('mysql2/promise');

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
async function login(cedula, password) {
  const d = `cedula=${cedula}&password=${password}`;
  const r = await req({ method: 'POST', path: '/login', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(d) } }, d);
  return r.headers['set-cookie'] ? r.headers['set-cookie'][0].split(';')[0] : null;
}

(async () => {
  const db = await mysql.createConnection({ host: 'localhost', user: 'root', password: 'Betoben1', database: 'gestion_academica' });
  const cuenta = async () => {
    const [e] = await db.query('SELECT COUNT(*) n FROM estudiantes');
    const [m] = await db.query('SELECT COUNT(*) n FROM materias');
    const [g] = await db.query('SELECT COUNT(*) n FROM grupos');
    const [no] = await db.query('SELECT COUNT(*) n FROM notas');
    return `estudiantes=${e[0].n} materias=${m[0].n} grupos=${g[0].n} notas=${no[0].n}`;
  };
  const limpiar = async () => {
    await db.query("DELETE FROM grupos WHERE materia_id IN (SELECT id FROM materias WHERE nombre_materia LIKE 'ZZ Test Tutor%')");
    await db.query("DELETE FROM materias WHERE nombre_materia LIKE 'ZZ Test Tutor%'");
    await db.query("DELETE FROM estudiantes WHERE cedula='9999999992'");
  };

  await limpiar();
  const inicio = await cuenta();
  console.log('INICIO:', inicio);

  // Datos de prueba aislados: tutor_id=1 (Mgs. Erika Marquez, cedula 1400501010)
  await db.query("INSERT INTO materias (nombre_materia, curso, paralelo, tutor_id, school_id, anio_lectivo) VALUES ('ZZ Test Tutor 1','ZZTEST','A',1,1,'2026-2027'), ('ZZ Test Tutor 2','ZZTEST','A',1,1,'2026-2027')");
  const [st] = await db.query("INSERT INTO estudiantes (cedula, nombres_apellidos, sexo, curso, paralelo, anio_lectivo, numero_matricula, representante, ciudad, school_id, activo) VALUES ('9999999992','ALUMNO PRUEBA TUTOR','M','ZZTEST','A','2026-2027','MAT-26-9999','REPRESENTANTE PRUEBA','Sucua',1,1)");
  const sid = st.insertId;
  const [real] = await db.query("SELECT id FROM estudiantes WHERE curso='Primero' AND paralelo='A' AND activo=1 LIMIT 1");
  const realId = real[0].id;

  // 1) Login docente-tutor (Erika)
  const ckDoc = await login('1400501010', 'Erika123');
  if (!ckDoc) throw new Error('Fallo login docente');
  console.log('Login docente OK');

  let r = await json({ method: 'GET', path: '/api/tutor/mis-cursos', headers: { Cookie: ckDoc } });
  console.log('mis-cursos:', r.status, JSON.stringify(r.json));
  if (r.status !== 200 || r.json.length !== 1 || r.json[0].curso !== 'ZZTEST' || r.json[0].total_materias !== 2) throw new Error('Fallo mis-cursos');

  r = await json({ method: 'GET', path: '/api/tutor/estudiantes?curso=ZZTEST&paralelo=A&especialidad=', headers: { Cookie: ckDoc } });
  console.log('estudiantes:', r.status, '| total:', r.json.length);
  if (r.status !== 200 || r.json.length !== 1) throw new Error('Fallo estudiantes');

  r = await json({ method: 'GET', path: '/api/tutor/estudiantes?curso=Primero&paralelo=A&especialidad=Electromecanica', headers: { Cookie: ckDoc } });
  console.log('curso ajeno:', r.status, '(esperado 403)', JSON.stringify(r.json));
  if (r.status !== 403) throw new Error('Debio ser 403 curso ajeno');

  r = await json({ method: 'PUT', path: `/api/tutor/estudiantes/${realId}`, headers: { Cookie: ckDoc, 'Content-Type': 'application/json' } },
    JSON.stringify({ nombres_apellidos: 'HACK', pais: 'Ecuador' }));
  console.log('PUT estudiante ajeno:', r.status, '(esperado 403)');
  if (r.status !== 403) throw new Error('Debio ser 403 estudiante ajeno');

  // 2) PUT valido con intento de editar campos prohibidos
  r = await json({ method: 'PUT', path: `/api/tutor/estudiantes/${sid}`, headers: { Cookie: ckDoc, 'Content-Type': 'application/json' } },
    JSON.stringify({
      nombres_apellidos: 'ALUMNO EDITADO POR TUTOR',
      sexo: 'F', fecha_nacimiento: '2015-05-12', ciudad: 'Nueva Ciudad', direccion: 'Nueva Direccion 123',
      representante: 'REP EDITADO', telefono_representante: '0991112223', parentesco_representante: 'Madre',
      // intentos de edicion prohibida:
      cedula: 'HACKED', curso: 'Primero', paralelo: 'Z', anio_lectivo: '2025-2026', numero_matricula: 'HACK-MAT'
    }));
  console.log('PUT valido:', r.status, JSON.stringify(r.json));
  if (r.status !== 200) throw new Error('Fallo PUT valido');

  const [chk] = await db.query('SELECT cedula, nombres_apellidos, curso, paralelo, anio_lectivo, numero_matricula, sexo, fecha_nacimiento, edad, ciudad, representante FROM estudiantes WHERE id = ?', [sid]);
  const c = chk[0];
  console.log('tras PUT:', JSON.stringify(c));
  if (c.nombres_apellidos !== 'ALUMNO EDITADO POR TUTOR' || c.sexo !== 'F' || c.ciudad !== 'Nueva Ciudad') throw new Error('No actualizo campos editables');
  if (c.cedula !== '9999999992' || c.curso !== 'ZZTEST' || c.paralelo !== 'A' || c.anio_lectivo !== '2026-2027' || c.numero_matricula !== 'MAT-26-9999') throw new Error('MODIFICO CAMPOS PROHIBIDOS');
  console.log('cam prohibidos intactos: OK | edad calculada:', c.edad);

  // 3) Vista del tutor
  const vista = await req({ method: 'GET', path: '/api/tutor/view', headers: { Cookie: ckDoc } });
  console.log('vista /view:', vista.status);
  ['formEstudianteTutor', 'infoCedula', 'infoMatricula', 'campoRepresentanteTutor', 'campoDireccionTutor'].forEach(s =>
    console.log('  ', s, vista.body.includes(s) ? 'OK' : 'FALTA'));
  if (vista.status !== 200) throw new Error('Fallo vista tutor');

  // 4) Menu docente tiene el boton (oculto, JS lo muestra)
  const menu = await req({ method: 'GET', path: '/', headers: { Cookie: ckDoc } });
  console.log('menu docente btnTutorDocente:', menu.body.includes('btnTutorDocente') ? 'OK' : 'FALTA');

  // 5) Rector no puede usar /api/tutor
  const ckRec = await login('1400501070', 'rector123');
  r = await json({ method: 'GET', path: '/api/tutor/mis-cursos', headers: { Cookie: ckRec } });
  console.log('rector en /api/tutor:', r.status, '(esperado 403)');
  if (r.status !== 403) throw new Error('Debio ser 403 rol rector');

  // 6) Limpieza
  await limpiar();
  const fin = await cuenta();
  console.log('FIN:', fin, '| igual al inicio:', fin === inicio ? 'SI' : 'NO');
  if (fin !== inicio) throw new Error('Cambiaron los datos reales');

  console.log('TODAS LAS PRUEBAS OK');
  await db.close();
  process.exit(0);
})().catch(e => { console.log('ERROR:', e.message); process.exit(1); });
