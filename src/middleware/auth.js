const jwt = require('jsonwebtoken');
const tokens = require('../services/tokens');

function validateJwtSecret() {
  if (!process.env.JWT_SECRET) {
    console.error('[AUTH] FATAL: JWT_SECRET environment variable is not set');
    process.exit(1);
  }
  if (process.env.JWT_SECRET === 'change-me-to-a-random-64-char-string' || process.env.JWT_SECRET === 'replace-with-64-char-random-hex-string') {
    console.warn('[AUTH] WARNING: JWT_SECRET is set to the insecure default value from .env.example');
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
validateJwtSecret();

async function authMiddleware(req, res, next) {
  const cookieToken = req.cookies?.token;
  if (cookieToken) {
    try {
      req.user = jwt.verify(cookieToken, process.env.JWT_SECRET);
      return next();
    } catch (err) {
      console.warn('[AUTH] Invalid cookie token:', err.message);
    }
  }

  const bearerToken = (req.headers.authorization || '').replace('Bearer ', '');
  if (bearerToken) {
    try {
      const tokenData = await tokens.validate(bearerToken);
      if (tokenData) {
        req.user = { id: tokenData.userId, username: tokenData.userId, role: tokenData.scope === 'admin' ? 'admin' : 'user', scope: tokenData.scope, via: 'token' };
        if (tokenData.scope === 'read' && !['GET', 'HEAD'].includes(req.method)) {
          return res.status(403).json({ error: 'Read-only token cannot perform this action' });
        }
        return next();
      }
    } catch (err) {
      console.warn('[AUTH] Invalid bearer token:', err.message);
    }
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

module.exports = { authMiddleware, adminOnly };
