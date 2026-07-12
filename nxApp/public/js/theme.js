(function () {
  var currentTheme = localStorage.getItem('nx-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);

  function updateToggle() {
    var icon = document.getElementById('themeToggleIcon');
    var label = document.getElementById('themeToggleLabel');
    if (currentTheme === 'dark') {
      if (icon) icon.textContent = '☀️';
      if (label) label.textContent = 'Light Mode';
    } else {
      if (icon) icon.textContent = '🌙';
      if (label) label.textContent = 'Dark Mode';
    }
  }

  window.toggleTheme = function () {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('nx-theme', currentTheme);
    updateToggle();
    if (window.reinitParticles) window.reinitParticles();
  };

  document.addEventListener('DOMContentLoaded', updateToggle);

  window.getParticleColor = function (opacity) {
    if (currentTheme === 'light') {
      return 'rgba(8, 145, 178, ' + (opacity * 0.55) + ')';
    }
    return 'rgba(6, 182, 212, ' + opacity + ')';
  };

  window.getTheme = function () { return currentTheme; };
})();
