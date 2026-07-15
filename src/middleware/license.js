const licenseService = require('../services/license');

function licenseMiddleware(req, res, next) {
  if (req.path === '/license-error.html' || req.path.startsWith('/css/') || req.path.startsWith('/js/') || req.path === '/favicon.ico') {
    return next();
  }

  if (req.headers.accept && req.headers.accept.includes('text/html') && !req.path.startsWith('/api/')) {
    if (!licenseService.checkLicense()) {
      return res.redirect('/license-error.html');
    }
    return next();
  }

  if (req.path.startsWith('/api/')) {
    if (!licenseService.checkLicense()) {
      return res.status(402).json({
        error: 'License required',
        reason: licenseService.getLicenseStatus().reason || 'invalid',
        message: 'NexusPanel requires a valid license key. Visit https://nxl.xus.me for more information.',
      });
    }
    return next();
  }

  next();
}

module.exports = licenseMiddleware;
