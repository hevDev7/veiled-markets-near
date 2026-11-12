// Prevent FOUC: apply saved theme before first paint
(function() {
  try {
    var stored = JSON.parse(localStorage.getItem('veiled-markets-ui') || '{}');
    var theme = (stored.state && stored.state.theme) || 'dark';
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
  } catch(e) {
    document.documentElement.classList.add('dark');
  }
})();
