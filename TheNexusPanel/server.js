process.on('uncaughtException', function(err) { console.error('UNCAUGHT EXCEPTION:', err.message, err.stack); });
process.on('unhandledRejection', function(reason) { console.error('UNHANDLED REJECTION:', reason); });

require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3450;

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(session({
  secret: process.env.JWT_SECRET || 'nxp-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, sameSite: 'strict', maxAge: 8 * 60 * 60 * 1000 },
}));

app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0, index: false }));

const { requireAuth, cookieMiddleware } = require('./src/middleware/auth');
app.use(cookieMiddleware);

const pagesRoutes = require('./src/routes/pages');
const cartRoutes = require('./src/routes/cart');
const ordersRoutes = require('./src/routes/orders');
const profileRoutes = require('./src/routes/profile');
const authRoutes = require('./src/routes/auth');

app.use('/', pagesRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/auth', profileRoutes);

app.get('/{*path}', (req, res) => {
  res.render('home', { user: req.user, title: 'NexusPanel — VPS Control Center', page: 'home' });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).render('home', { user: req.user, title: 'Error — NexusPanel', page: 'home', error: err.message });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`TheNexusPanel running on http://127.0.0.1:${PORT}`);
});
