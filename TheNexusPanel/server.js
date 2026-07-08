require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const path = require('path');

const { authMiddleware } = require('./src/middleware/auth');

const app = express();
const PORT = process.env.PORT || 3450;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'nxp_session_secret',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 3600000 },
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use(authMiddleware);

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/profile', require('./src/routes/profile'));
app.use('/api/orders', require('./src/routes/orders'));
app.use('/api/cart', require('./src/routes/cart'));
app.use('/', require('./src/routes/pages'));

app.listen(PORT, '127.0.0.1', () => {
  console.log('TheNexusPanel running on http://127.0.0.1:' + PORT);
});
