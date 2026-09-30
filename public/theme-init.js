// Aplica o tema antes da primeira pintura para evitar clarões.
(function () {
  var dark = { dark: 1, nord: 1, dracula: 1, graphite: 1 };
  var palettes = { sepia: 1, solarized: 1, nord: 1, dracula: 1, graphite: 1 };
  try {
    var s = JSON.parse(localStorage.getItem('mdeditor.settings') || '{}');
    var t = s.theme || 'system';
    var scheme = t === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : dark[t] ? 'dark' : 'light';
    document.documentElement.dataset.theme = scheme;
    if (palettes[t]) document.documentElement.dataset.palette = t;
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
