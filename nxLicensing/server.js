require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const licenseRoutes = require('./src/routes/license');
const authRoutes = require('./src/routes/auth');
const profileRoutes = require('./src/routes/profile');
const users = require('./src/services/users');

users.initDefaultUser(
  process.env.ADMIN_USER || 'admin',
  process.env.ADMIN_PASS || 'admin123',
  process.env.ADMIN_EMAIL || 'admin@xus.me'
);

const app = express();
const PORT = process.env.PORT || 3444;

app.use(express.json());
app.use(cookieParser());

app.use('/api', licenseRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

if (process.env.SERVE_DASHBOARD === 'true') {
  app.use(express.static('public'));
}

app.listen(PORT, '127.0.0.1', () => {
  console.log('nxLicensing running on http://127.0.0.1:' + PORT);
});
