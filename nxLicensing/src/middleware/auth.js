const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const cookieToken = req.cookies?.nxlicensing_token;

  if (cookieToken) {
    try {
      const decoded = jwt.verify(cookieToken, process.env.JWT_SECRET);
      req.user = decoded;
      return next();
    } catch {}
  }

  const bearerToken = (req.headers.authorization || '').replace('Bearer ', '');
  if (bearerToken === process.env.ADMIN_API_KEY) {
    req.user = { username: 'api', role: 'admin' };
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

module.exports = { authMiddleware };
