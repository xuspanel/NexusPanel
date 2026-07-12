const jwt = require('jsonwebtoken');
const tokens = require('../services/tokens');

function cookieMiddleware(req, res, next) {
  const cookieToken = req.cookies?.token;
  if (cookieToken) {
    try { req.user = jwt.verify(cookieToken, process.env.JWT_SECRET); } catch {}
  }
  if (!req.user) {
    const bearer = (req.headers.authorization || '').replace('Bearer ', '');
    if (bearer) {
      try { req.user = jwt.verify(bearer, process.env.JWT_SECRET); } catch {}
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/login');
  next();
}

async function authMiddleware(req, res, next) {
  const cookieToken = req.cookies?.token;
  if (cookieToken) {
    try { req.user = jwt.verify(cookieToken, process.env.JWT_SECRET); return next(); } catch {}
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
    } catch {}
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

module.exports = { authMiddleware, cookieMiddleware, requireAuth };
