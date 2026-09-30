// Ponte entre a interface e o backend Tauri.
// Fora do Tauri (ex.: `npm run dev` num navegador comum) usa implementações simuladas,
// o que permite testar a interface sem compilar o app.

export const isTauri = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;

let core, win, webview, dialog;
if (isTauri) {
  core = await import('@tauri-apps/api/core');
  const w = await import('@tauri-apps/api/window');
  const wv = await import('@tauri-apps/api/webview');
  dialog = await import('@tauri-apps/plugin-dialog');
  win = w.getCurrentWindow();
  webview = wv.getCurrentWebview();
}

export const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd', 'mkdn', 'mdwn', 'mdtxt', 'mdtext'];
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'];

const MD_FILTERS = [
  { name: 'Documentos Markdown', extensions: MARKDOWN_EXTENSIONS },
  { name: 'Texto', extensions: ['txt'] },
  { name: 'Todos os arquivos', extensions: ['*'] },
];

const invoke = (cmd, args) => core.invoke(cmd, args);

// ------------------------------------------------------------------ simulação (navegador)
const mockFiles = new Map();
const mock = {
  async launchInfo() {
    const p = new URLSearchParams(location.search).get('file');
    return { path: p || null, mode: null };
  },
  async readFile(path) {
    if (mockFiles.has(path)) return { path, content: mockFiles.get(path), encoding: 'utf-8', bom: false, eol: 'lf', mtime: 1 };
    const res = await fetch(path.startsWith('/') ? path : '/' + path);
    if (!res.ok) throw new Error(`Arquivo não encontrado: ${path}`);
    const content = await res.text();
    return { path, content, encoding: 'utf-8', bom: false, eol: content.includes('\r\n') ? 'crlf' : 'lf', mtime: 1 };
  },
  async writeFile(path, content) {
    mockFiles.set(path, content);
    return { mtime: Date.now(), encoding: 'utf-8', bom: false };
  },
};

// ------------------------------------------------------------------ API pública
export const bridge = {
  isTauri,

  launchInfo: () => (isTauri ? invoke('get_launch_info') : mock.launchInfo()),
  readFile: (path) => (isTauri ? invoke('read_text_file', { path }) : mock.readFile(path)),
  writeFile: (path, content, encoding = 'utf-8', bom = false) =>
    isTauri ? invoke('write_text_file', { path, content, encoding, bom }) : mock.writeFile(path, content),
  writeBinary: (path, base64) => (isTauri ? invoke('write_binary_file', { path, data: base64 }) : Promise.resolve()),
  mtime: (path) => (isTauri ? invoke('file_mtime', { path }) : Promise.resolve(1)),
  exists: (path) => (isTauri ? invoke('path_exists', { path }) : Promise.resolve(true)),
  listDir: (path) => (isTauri ? invoke('list_directory', { path }) : Promise.resolve([])),
  openWindow: (path = null, mode = null) =>
    isTauri ? invoke('open_window', { path, mode }) : (window.open(path ? `?file=${encodeURIComponent(path)}` : location.pathname), Promise.resolve()),
  openExternal: (target) => (isTauri ? invoke('open_external', { target }) : (window.open(target, '_blank'), Promise.resolve())),
  reveal: (path) => (isTauri ? invoke('reveal_in_explorer', { path }) : Promise.resolve()),
  assocStatus: () =>
    isTauri ? invoke('association_status') : Promise.resolve({ supported: false, registered: false, isDefault: false, currentHandler: null }),
  registerAssoc: (makeDefault) => (isTauri ? invoke('register_associations', { makeDefault }) : Promise.resolve()),
  openDefaultAppsSettings: () => (isTauri ? invoke('open_default_apps_settings') : Promise.resolve()),
  openWithDialog: (path) => (isTauri ? invoke('open_with_dialog', { path }) : Promise.resolve()),
  appInfo: () => (isTauri ? invoke('app_info') : Promise.resolve({ version: 'dev', exePath: '(navegador)' })),

  toAssetUrl: (path) => (isTauri ? core.convertFileSrc(path) : path),

  async pickMarkdownFiles() {
    if (!isTauri) {
      const p = prompt('Caminho do arquivo (modo navegador):', 'guia.md');
      return p ? [p] : [];
    }
    const r = await dialog.open({ multiple: true, directory: false, filters: MD_FILTERS, title: 'Abrir documento Markdown' });
    if (!r) return [];
    return Array.isArray(r) ? r : [r];
  },
  async pickImage(defaultPath) {
    if (!isTauri) return null;
    return dialog.open({
      multiple: false,
      directory: false,
      defaultPath,
      title: 'Escolher imagem',
      filters: [{ name: 'Imagens', extensions: IMAGE_EXTENSIONS }, { name: 'Todos os arquivos', extensions: ['*'] }],
    });
  },
  async saveDialog(defaultPath, kind = 'md') {
    if (!isTauri) return prompt('Salvar como (modo navegador):', defaultPath || 'documento.md');
    const filters =
      kind === 'html'
        ? [{ name: 'Página HTML', extensions: ['html', 'htm'] }]
        : [{ name: 'Documento Markdown', extensions: ['md', 'markdown'] }, { name: 'Texto', extensions: ['txt'] }];
    return dialog.save({ defaultPath, filters, title: kind === 'html' ? 'Exportar como HTML' : 'Salvar documento' });
  },

  window: {
    setTitle: (t) => (isTauri ? win.setTitle(t) : ((document.title = t), Promise.resolve())),
    show: async () => {
      if (!isTauri) return;
      await win.show();
      await win.setFocus();
    },
    destroy: () => (isTauri ? win.destroy() : Promise.resolve(window.close())),
    close: () => (isTauri ? win.close() : Promise.resolve(window.close())),
    setTheme: (t) => (isTauri ? win.setTheme(t).catch(() => {}) : Promise.resolve()),
    isFullscreen: () => (isTauri ? win.isFullscreen() : Promise.resolve(!!document.fullscreenElement)),
    setFullscreen: (v) =>
      isTauri ? win.setFullscreen(v) : v ? document.documentElement.requestFullscreen() : document.exitFullscreen(),
    onCloseRequested: (cb) => (isTauri ? win.onCloseRequested(cb) : Promise.resolve(() => {})),
    onDragDrop: (cb) => (isTauri ? webview.onDragDropEvent(cb) : Promise.resolve(() => {})),
  },
};
