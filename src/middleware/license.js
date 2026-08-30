const licenseService = require('../services/license');

const ROUTE_FEATURE_MAP = [
  { prefix: '/api/docker', feature: 'docker' },
  { prefix: '/api/backups', feature: 'backups' },
  { prefix: '/api/git-deploy', feature: 'git_deploy' },
  { prefix: '/api/deploy', feature: 'git_deploy' },
];

function licenseMiddleware(req, res, next) {
  if (
    req.path === '/license-error.html' ||
    req.path.startsWith('/css/') ||
    req.path.startsWith('/js/') ||
    req.path.startsWith('/assets/') ||
    req.path === '/favicon.ico' ||
    req.path === '/api/license/status' ||
    req.path === '/health'
  ) {
    return next();
  }

  const isValid = licenseService.checkLicense();

  // HTML page requests redirect to error page if license is invalid
  if (req.headers.accept && req.headers.accept.includes('text/html') && !req.path.startsWith('/api/')) {
    if (!isValid) {
      return res.redirect('/license-error.html');
    }
    return next();
  }

  // API Requests
  if (req.path.startsWith('/api/')) {
    // 1. Global License Gate (HTTP 402)
    if (!isValid) {
      const status = licenseService.getLicenseStatus();
      return res.status(402).json({
        error: 'License required',
        code: 'LICENSE_REQUIRED',
        reason: status.reason || 'invalid',
        message: 'NexusPanel requires an active, valid license key. Visit https://nxl.xus.me for more information.'
      });
    }

    // 2. Granular Plan-Based Feature Gate (HTTP 403)
    for (const mapping of ROUTE_FEATURE_MAP) {
      if (req.path.startsWith(mapping.prefix)) {
        if (!licenseService.hasFeature(mapping.feature)) {
          const currentPlan = licenseService.getPlan() || 'Starter';
          return res.status(403).json({
            error: 'Plan upgrade required',
            code: 'FEATURE_RESTRICTED',
            required_feature: mapping.feature,
            current_plan: currentPlan,
            upgrade_url: 'https://nxp.xus.me'
          });
        }
      }
    }

    return next();
  }

  next();
}

module.exports = licenseMiddleware;
