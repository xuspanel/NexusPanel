const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const token = req.cookies?.nxp_token;
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
      return next();
    } catch {}
  }
  req.user = null;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  next();
}

module.exports = { authMiddleware, requireAuth };
