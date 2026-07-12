let tempToken = null;

document.addEventListener('DOMContentLoaded', async () => {
  const loginPage = document.getElementById('loginPage');
  const twoFactorPage = document.getElementById('twoFactorPage');
  const dashboardPage = document.getElementById('dashboardPage');
  const loginForm = document.getElementById('loginForm');
  const loginBtn = document.getElementById('loginBtn');
  const loginError = document.getElementById('loginError');
  const twoFactorForm = document.getElementById('twoFactorForm');
  const twoFactorBtn = document.getElementById('twoFactorBtn');
  const twoFactorError = document.getElementById('twoFactorError');
  const logoutBtn = document.getElementById('logoutBtn');
  const navToggle = document.getElementById('navToggle');
  const sideNav = document.getElementById('sideNav');
  const sideNavOverlay = document.getElementById('sideNavOverlay');
  const navItems = document.querySelectorAll('.side-nav-item');

  function closeSideNav() {
    sideNav.classList.remove('open');
    sideNavOverlay.classList.remove('active');
    navToggle.classList.remove('active');
    document.body.style.overflow = '';
  }

  function toggleSideNav() {
    sideNav.classList.toggle('open');
    sideNavOverlay.classList.toggle('active');
    navToggle.classList.toggle('active');
    document.body.style.overflow = sideNav.classList.contains('open') ? 'hidden' : '';
  }

  function showPage(page) {
    loginPage.style.display = page === 'login' ? 'flex' : 'none';
    twoFactorPage.style.display = page === '2fa' ? 'flex' : 'none';
    dashboardPage.style.display = page === 'dashboard' ? 'block' : 'none';
    const show = page === 'dashboard';
    navToggle.style.display = show ? 'flex' : 'none';
    if (!show) closeSideNav();
  }

  function switchView(view) {
    document.getElementById('viewDashboard').style.display = view === 'dashboard' ? 'block' : 'none';
    document.getElementById('viewProfile').style.display = view === 'profile' ? 'block' : 'none';
    document.getElementById('viewFiles').style.display = view === 'files' ? 'block' : 'none';
    document.getElementById('viewDatabases').style.display = view === 'databases' ? 'block' : 'none';
    document.getElementById('viewDocker').style.display = view === 'docker' ? 'block' : 'none';
    document.getElementById('viewFTP').style.display = view === 'ftp' ? 'block' : 'none';
    document.getElementById('viewTerminal').style.display = view === 'terminal' ? 'block' : 'none';
    document.getElementById('viewEmails').style.display = view === 'emails' ? 'block' : 'none';
    document.getElementById('viewUsers').style.display = view === 'users' ? 'block' : 'none';
    document.getElementById('viewDomains').style.display = view === 'domains' ? 'block' : 'none';
    document.getElementById('viewBackups').style.display = view === 'backups' ? 'block' : 'none';
    document.getElementById('viewVirusScanner').style.display = view === 'virusscanner' ? 'block' : 'none';
    document.getElementById('viewMimetypes').style.display = view === 'mimetypes' ? 'block' : 'none';
    document.getElementById('viewAudit').style.display = view === 'audit' ? 'block' : 'none';
    document.getElementById('viewServices').style.display = view === 'services' ? 'block' : 'none';
    document.getElementById('viewProcesses').style.display = view === 'processes' ? 'block' : 'none';
    document.getElementById('viewLogs').style.display = view === 'logs' ? 'block' : 'none';
    document.getElementById('viewCron').style.display = view === 'cron' ? 'block' : 'none';
    document.getElementById('viewFirewall').style.display = view === 'firewall' ? 'block' : 'none';
    document.getElementById('viewSSL').style.display = view === 'ssl' ? 'block' : 'none';
    document.getElementById('viewPhpFPM').style.display = view === 'phpfpm' ? 'block' : 'none';
    document.getElementById('viewUpdates').style.display = view === 'updates' ? 'block' : 'none';
    document.getElementById('viewSettings').style.display = view === 'settings' ? 'block' : 'none';
    navItems.forEach(i => i.classList.toggle('active', i.dataset.view === view));
    closeSideNav();
    if (view === 'dashboard' && window.initDashboard) window.initDashboard();
    if (view === 'profile' && window.initProfile) window.initProfile();
    if (view === 'files' && window.initFileManager) window.initFileManager();
    if (view === 'databases' && window.initDatabases) window.initDatabases();
    if (view === 'emails' && window.initEmails) window.initEmails();
    if (view === 'docker' && window.initDocker) window.initDocker();
    if (view === 'ftp' && window.initFTP) window.initFTP();
    if (view === 'terminal' && window.initTerminal) window.initTerminal();
    if (view === 'users' && window.initUsers) window.initUsers();
    if (view === 'domains' && window.initDomains) window.initDomains();
    if (view === 'backups' && window.initBackups) window.initBackups();
    if (view === 'virusscanner' && window.initVirusScanner) window.initVirusScanner();
    if (view === 'mimetypes' && window.initMimetypes) window.initMimetypes();
    if (view === 'audit' && window.initAudit) window.initAudit();
    if (view === 'services' && window.initServices) window.initServices();
    if (view === 'processes' && window.initProcesses) window.initProcesses();
    if (view === 'logs' && window.initLogs) window.initLogs();
    if (view === 'cron' && window.initCron) window.initCron();
    if (view === 'firewall' && window.initFirewall) window.initFirewall();
    if (view === 'ssl' && window.initSSL) window.initSSL();
    if (view === 'phpfpm' && window.initPhpFPM) window.initPhpFPM();
    if (view === 'updates' && window.initUpdates) window.initUpdates();
    if (view === 'settings' && window.initSettings) window.initSettings();
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => switchView(item.dataset.view));
  });

  function setNavUser(username, role) {
    const nameEl = document.querySelector('.snu-name');
    const roleEl = document.querySelector('.snu-role');
    if (nameEl) nameEl.textContent = username || 'admin';
    if (roleEl) roleEl.textContent = role === 'admin' ? 'Administrator' : 'User';
  }

  navToggle.addEventListener('click', toggleSideNav);
  sideNavOverlay.addEventListener('click', closeSideNav);

  logoutBtn.addEventListener('click', async () => {
    await API.logout();
    if (window.resetProfile) window.resetProfile();
    showPage('login');
    document.getElementById('loginPassword').value = '';
    document.getElementById('twoFactorCode').value = '';
    tempToken = null;
  });

  try {
    const user = await API.me();
    if (user.username) {
      setNavUser(user.username, user.role);
      showPage('dashboard');
      switchView('dashboard');
      if (window.initDashboard) window.initDashboard();
      return;
    }
  } catch {
    showPage('login');
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    loginError.classList.remove('show');
    loginBtn.classList.add('loading');
    loginBtn.disabled = true;

    try {
      const res = await API.login(username, password);
      if (res.twoFactorRequired) {
        tempToken = res.tempToken;
        showPage('2fa');
        document.getElementById('twoFactorCode').focus();
        return;
      }
      setNavUser(username, 'admin');
      showPage('dashboard');
      switchView('dashboard');
      if (window.initDashboard) window.initDashboard();
    } catch (err) {
      loginError.textContent = err.message || 'Invalid credentials';
      loginError.classList.add('show');
    } finally {
      loginBtn.classList.remove('loading');
      loginBtn.disabled = false;
    }
  });

  twoFactorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('twoFactorCode').value.trim();
    twoFactorError.classList.remove('show');
    twoFactorBtn.classList.add('loading');
    twoFactorBtn.disabled = true;

    try {
      const res = await API.login2FA(tempToken, code);
      tempToken = null;
      setNavUser(res.username || 'admin', 'admin');
      showPage('dashboard');
      switchView('dashboard');
      if (window.initDashboard) window.initDashboard();
    } catch (err) {
      twoFactorError.textContent = err.message || 'Invalid code';
      twoFactorError.classList.add('show');
      document.getElementById('twoFactorCode').value = '';
    } finally {
      twoFactorBtn.classList.remove('loading');
      twoFactorBtn.disabled = false;
    }
  });

  if (window.initParticles) window.initParticles();
});
