require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const MySQLSessionStore = require('express-mysql-session')(session);
const { getMasterPool, getPool } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

const poolInstance = getPool();
app.set('masterPool', poolInstance);

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const sessionStore = new MySQLSessionStore({}, poolInstance);
app.use(session({
    secret: 'gestion-academica-secret-key-2026',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000, sameSite: 'lax', httpOnly: true, secure: false }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ========== MIDDLEWARES ==========

function requireAuth(req, res, next) {
    if (req.session && req.session.user) return next();
    res.redirect('/login');
}

function injectDB(req, res, next) {
    req.db = getPool();
    next();
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.session.user || !roles.includes(req.session.user.rol)) {
            return res.status(403).send('Acceso no autorizado');
        }
        next();
    };
}

// ========== LOGIN ==========

app.get('/login', (req, res) => {
    if (req.session && req.session.user) {
        req.session.destroy();
        return res.redirect('/login');
    }
    res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
    const { cedula, password } = req.body;
    try {
        const db = getPool();
        const [rows] = await db.query(
            'SELECT * FROM usuarios WHERE cedula = ? AND password = ? AND estado = 1',
            [cedula, password]
        );
        if (rows.length === 0) {
            return res.render('login', { error: 'Cedula o contrasena incorrectos' });
        }
        const user = rows[0];

        let anioDefault = '2026-2027';
        try {
            const [anioRows] = await db.query(
                `SELECT anio FROM anio_lectivos WHERE school_id = ? AND activo_${user.rol} = 1 ORDER BY anio DESC LIMIT 1`,
                [user.school_id]
            );
            if (anioRows.length > 0) anioDefault = anioRows[0].anio;
        } catch (e) {}

        req.session.user = {
            id: user.id,
            cedula: user.cedula,
            nombre: user.nombre,
            rol: user.rol,
            school_id: user.school_id,
            anio_lectivo: anioDefault
        };

        req.session.save((err) => {
            if (err) console.error('Error guardando session:', err);
            res.redirect('/');
        });
    } catch (err) {
        console.error('Error en login:', err);
        res.render('login', { error: 'Error del servidor' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// ========== CAMBIO DE AÑO LECTIVO ==========

app.get('/api/years', requireAuth, async (req, res) => {
    try {
        const db = getPool();
        const rol = req.session.user.rol;
        const columna = `activo_${rol}`;
        const [rows] = await db.query(
            `SELECT anio FROM anio_lectivos WHERE school_id = ? AND ${columna} = 1 ORDER BY anio DESC`,
            [req.session.user.school_id]
        );
        const years = rows.map(r => r.anio);
        if (years.length === 0) years.push('2026-2027');
        res.json(years);
    } catch (err) {
        res.json(['2026-2027']);
    }
});

app.post('/api/change-year', requireAuth, (req, res) => {
    const { anio_lectivo } = req.body;
    if (!anio_lectivo) {
        return res.status(400).json({ error: 'Año lectivo requerido' });
    }
    req.session.user.anio_lectivo = anio_lectivo;
    req.session.save((err) => {
        if (err) return res.status(500).json({ error: 'Error guardando sesion' });
        res.json({ message: 'Año lectivo cambiado a ' + anio_lectivo, anio_lectivo });
    });
});

// ========== RUTAS ==========

const indexRoutes = require('./routes/index');
const estudiantesRoutes = require('./routes/estudiantes');
const materiasRoutes = require('./routes/materias');
const gruposRoutes = require('./routes/grupos');
const asistenciasRoutes = require('./routes/asistencias');
const notasRoutes = require('./routes/notas');
const reportesRoutes = require('./routes/reportes');
const boletinesRoutes = require('./routes/boletines');
const alertasRoutes = require('./routes/alertas');
const informesRoutes = require('./routes/informes');
const recursosRoutes = require('./routes/recursos');
const adminRoutes = require('./routes/admin');
const secretariaRoutes = require('./routes/secretaria');
const rectorRoutes = require('./routes/rector');
const inspectorRoutes = require('./routes/inspector');
const recuperacionRoutes = require('./routes/recuperacion');
const justificacionesRoutes = require('./routes/justificaciones');
const diagnosticoRoutes = require('./routes/diagnostico');
const anioLectivosRoutes = require('./routes/anio_lectivos');
const cursosRoutes = require('./routes/cursos');

// Admin/Usuarios: solo rector
app.use('/api/admin', requireAuth, requireRole('rector'), adminRoutes);

// Secretaria: solo secretaria
app.use('/api/secretaria', requireAuth, requireRole('secretaria'), injectDB, secretariaRoutes);
app.use('/api/cursos', requireAuth, requireRole('secretaria'), injectDB, cursosRoutes);

// Rector: solo rector
app.use('/api/rector', requireAuth, requireRole('rector'), injectDB, rectorRoutes);
app.use('/api/anio-lectivos', requireAuth, requireRole('rector'), injectDB, anioLectivosRoutes);

// Inspector: solo inspector
app.use('/api/inspector', requireAuth, requireRole('inspector'), injectDB, inspectorRoutes);

// Rutas compartidas: todos los roles autenticados
app.use('/', requireAuth, injectDB, indexRoutes);
app.use('/api/estudiantes', requireAuth, injectDB, estudiantesRoutes);
app.use('/api/materias', requireAuth, injectDB, materiasRoutes);
app.use('/api/grupos', requireAuth, injectDB, gruposRoutes);
app.use('/api/asistencias', requireAuth, injectDB, asistenciasRoutes);
app.use('/api/notas', requireAuth, injectDB, notasRoutes);
app.use('/api/reportes', requireAuth, injectDB, reportesRoutes);
app.use('/api/boletines', requireAuth, injectDB, boletinesRoutes);
app.use('/api/alertas', requireAuth, injectDB, alertasRoutes);
app.use('/api/informes', requireAuth, injectDB, informesRoutes);
app.use('/api/recursos', requireAuth, injectDB, recursosRoutes);
app.use('/api/recuperacion', requireAuth, injectDB, recuperacionRoutes);
app.use('/api/justificaciones', requireAuth, injectDB, justificacionesRoutes);
app.use('/api/diagnostico', requireAuth, injectDB, diagnosticoRoutes);

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

module.exports = app;
