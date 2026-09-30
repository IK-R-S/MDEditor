import './styles/app.css';
import './styles/markdown.css';
import './styles/hljs.css';
import markdownCss from './styles/markdown.css?inline';
import hljsCss from './styles/hljs.css?inline';
import themesCss from './styles/themes.css?inline';
import guideText from './guide.md?raw';
import { bridge, isTauri, MARKDOWN_EXTENSIONS, IMAGE_EXTENSIONS } from './bridge.js';
import { createEditor, commands, ALERTS, headingsOf } from './editor.js';
import { KATEX_VERSION, onAssetsLoaded } from './markdown.js';
import { Preview, PreviewFind } from './preview.js';
import { LiveEdit } from './live.js';
import { DOC_FONTS, EDITOR_FONTS, THEMES } from './appearance.js';
import { icon, setIconPack, ICON_PACKS, h, showMenu, closeAllMenus, isMenuOpen, modal, alertDialog, confirmDialog, field, toast, debounce, isModalOpen } from './ui.js';
import { dirname, basename, stripExt, extname, join, relative, resolveLocal, isAbsolute } from './paths.js';

const $ = (id) => document.getElementById(id);
const GUIDE = '::guia::';
const GUIDE_NAME = 'Guia de Markdown';

// ------------------------------------------------------------------ preferências
const SETTINGS_KEY = 'mdeditor.settings';
const RECENT_KEY = 'mdeditor.recent';
const DEFAULTS = {
  theme: 'system',
  zoom: 1,
  lineNumbers: false,
  wrap: true,
  spellcheck: false,
  wide: false,
  syncScroll: true,
  sidebar: true,
  sidebarTab: 'outline',
  sidebarWidth: 250,
  splitRatio: 0.5,
  editorFont: 'cascadia',
  docFont: 'system',
  iconPack: 'lucide',
  defaultMode: 'live',
  lastEditMode: 'split',
};

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}
const settings = loadSettings();
// Migração de preferências antigas.
if (!settings.v) {
  settings.v = 2;
  if (settings.defaultMode === 'view') settings.defaultMode = 'live';
  if (settings.editorFont === 'mono') settings.editorFont = 'cascadia';
  if (settings.editorFont === 'sans') settings.editorFont = 'system';
}
if (!EDITOR_FONTS[settings.editorFont]) settings.editorFont = 'cascadia';
if (!DOC_FONTS[settings.docFont]) settings.docFont = 'system';
if (!THEMES[settings.theme]) settings.theme = 'system';
if (!ICON_PACKS[settings.iconPack]) settings.iconPack = 'lucide';
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* armazenamento indisponível */
  }
}

function recentFiles() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}
function setRecent(list) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 15)));
  } catch {
    /* ignora */
  }
}
function addRecent(path) {
  if (!path) return;
  setRecent([path, ...recentFiles().filter((p) => p.toLowerCase() !== path.toLowerCase())]);
}
function removeRecent(path) {
  setRecent(recentFiles().filter((p) => p !== path));
}

// ------------------------------------------------------------------ estado
const state = {
  hasDoc: false,
  path: null,
  name: 'Sem título',
  encoding: 'utf-8',
  bom: false,
  eol: 'lf',
  savedContent: '',
  savedDoc: null,
  dirty: false,
  metaDirty: false,
  mtime: null,
  mode: null,
  history: [],
  filesDir: null,
  externalPending: false,
  missing: false,
};

let editor;
let preview;
let finder;
let live;

const mq = window.matchMedia('(prefers-color-scheme: dark)');
const resolvedTheme = () => (settings.theme === 'system' ? (mq.matches ? 'dark' : 'light') : THEMES[settings.theme]?.scheme || 'light');
const pageModeLocked = () => !!live?.session;

/** Modos em que só a página renderizada aparece (somente leitura ou edição na página). */
const pageMode = (m = state.mode) => m === 'view' || m === 'live';
const displayName = () => (state.path ? basename(state.path) : state.name);

// ------------------------------------------------------------------ aparência
function applyTheme() {
  const t = resolvedTheme();
  const changed = document.documentElement.dataset.theme !== t;
  document.documentElement.dataset.theme = t;
  if (THEMES[settings.theme]?.swatch) document.documentElement.dataset.palette = settings.theme;
  else delete document.documentElement.dataset.palette;
  bridge.window.setTheme(settings.theme === 'system' ? null : t);
  if (changed && preview) preview.resetDiagrams();
}
mq.addEventListener('change', () => settings.theme === 'system' && applyTheme());

function applyAppearance() {
  const root = document.documentElement.style;
  root.setProperty('--zoom', settings.zoom);
  root.setProperty('--sidebar-w', `${settings.sidebarWidth}px`);
  root.setProperty('--split-a', settings.splitRatio);
  root.setProperty('--split-b', 1 - settings.splitRatio);
  document.body.classList.toggle('wide', settings.wide);
  document.body.classList.toggle('sidebar-hidden', !settings.sidebar);
  updateSidebarButton();
  const ef = EDITOR_FONTS[settings.editorFont] || EDITOR_FONTS.cascadia;
  root.setProperty('--editor-font', ef.css);
  root.setProperty('--md-font', (DOC_FONTS[settings.docFont] || DOC_FONTS.system).css);
  document.body.classList.toggle('font-sans', !ef.mono);
  document.body.classList.toggle('line-numbers', settings.lineNumbers);
  editor?.setOptions({ lineNumbers: settings.lineNumbers, wrap: settings.wrap, spellcheck: settings.spellcheck });
  editor?.requestMeasure();
  const z = $('st-zoom');
  if (z) {
    z.textContent = `${Math.round(settings.zoom * 100)}%`;
    z.hidden = Math.abs(settings.zoom - 1) < 0.01;
  }
}

/** O ícone do botão reflete o estado: painel aberto → "fechar", fechado → "abrir". */
function updateSidebarButton() {
  const btn = $('btn-sidebar');
  if (!btn) return;
  const name = settings.sidebar ? 'PanelLeftClose' : 'PanelLeftOpen';
  btn.title = `${settings.sidebar ? 'Ocultar' : 'Mostrar'} barra lateral (Ctrl+Shift+B)`;
  const cur = btn.querySelector('svg.icon');
  if (cur?.dataset.icon !== name) {
    if (cur) cur.replaceWith(icon(name, 16));
    else btn.append(icon(name, 16));
  }
}

function setSetting(key, value) {
  settings[key] = value;
  saveSettings();
  if (key === 'theme') applyTheme();
  if (key === 'iconPack') setIconPack(value);
  applyAppearance();
}

function setZoom(z) {
  setSetting('zoom', Math.round(Math.min(2.5, Math.max(0.5, z)) * 10) / 10);
}

// Outras janelas mudaram as preferências.
window.addEventListener('storage', (e) => {
  if (e.key !== SETTINGS_KEY) return;
  const next = loadSettings();
  if (next.iconPack !== settings.iconPack) setIconPack((settings.iconPack = next.iconPack));
  for (const k of ['theme', 'zoom', 'lineNumbers', 'wrap', 'spellcheck', 'editorFont', 'docFont', 'wide', 'syncScroll', 'defaultMode']) settings[k] = next[k];
  applyTheme();
  applyAppearance();
});

// ------------------------------------------------------------------ título e status
function updateTitle() {
  const name = state.hasDoc ? displayName() : 'MDEditor';
  $('doc-name').textContent = name;
  $('crumbs').title = state.path || '';
  const dir = state.path ? basename(dirname(state.path)) : '';
  $('crumb-dir').textContent = dir;
  $('crumb-dir').hidden = !dir;
  $('crumb-sep').hidden = !dir;
  document.body.classList.toggle('dirty', state.dirty);
  bridge.window.setTitle(state.hasDoc ? `${state.dirty ? '● ' : ''}${name} — MDEditor` : 'MDEditor');
}

const ENCODINGS = [
  { id: 'utf-8', bom: false, label: 'UTF-8' },
  { id: 'utf-8', bom: true, label: 'UTF-8 com BOM' },
  { id: 'utf-16le', bom: true, label: 'UTF-16 LE' },
  { id: 'utf-16be', bom: true, label: 'UTF-16 BE' },
  { id: 'windows-1252', bom: false, label: 'Windows-1252 (ANSI)' },
];
const encodingLabel = () =>
  (ENCODINGS.find((e) => e.id === state.encoding && (e.id !== 'utf-8' || e.bom === state.bom)) || ENCODINGS[0]).label;

function updateStatus() {
  $('st-words').hidden = !state.hasDoc;
  updateCursor();
}

function updateCursor() {
  const pos = $('st-pos');
  if (!state.hasDoc || pageMode() || !editor) {
    pos.hidden = true;
    return;
  }
  const c = editor.cursorInfo();
  pos.hidden = false;
  pos.textContent = `Ln ${c.line}, Col ${c.col}${c.selected ? ` · ${c.selected} sel.` : ''}`;
}

function updateStats(text) {
  const words = (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
  const minutes = Math.max(1, Math.round(words / 200));
  const fmt = (n) => n.toLocaleString('pt-BR');
  $('st-words').textContent = `${fmt(words)} palavra${words === 1 ? '' : 's'}`;
  $('st-words').title = `${fmt(text.length)} caracteres · ${fmt(editor.view.state.doc.lines)} linhas · ~${minutes} min de leitura · ${encodingLabel()} · ${state.eol === 'crlf' ? 'CRLF' : 'LF'}`;
}

// ------------------------------------------------------------------ modos de exibição
function setMode(mode, { sync = true, focus = true } = {}) {
  if (!state.hasDoc) return;
  const prev = state.mode;
  let line = null;
  if (sync && prev && prev !== mode) line = pageMode(prev) ? preview.topLine() : editor.topLine();
  state.mode = mode;
  if (!pageMode(mode)) setSetting('lastEditMode', mode);
  if (mode !== 'live') live?.finish();
  if (mode !== 'edit' && previewStale && state.hasDoc && prev) {
    state.mode = mode;
    renderNow();
  }
  document.body.dataset.mode = mode;
  for (const b of document.querySelectorAll('#mode-switch button')) {
    const on = b.dataset.mode === mode || (b.dataset.mode === 'source' && !pageMode(mode));
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  }
  if (!pageMode(mode)) closeFind();
  editor.requestMeasure();
  if (line != null) {
    requestAnimationFrame(() => {
      if (pageMode(mode) || mode === 'split') preview.scrollToLine(line);
      if (!pageMode(mode)) {
        if (line === Infinity) editor.view.scrollDOM.scrollTop = editor.view.scrollDOM.scrollHeight;
        else editor.scrollToLine(line);
      }
    });
  }
  if (focus) {
    if (!pageMode(mode)) setTimeout(() => editor.focus(), 0);
    else $('preview-pane').focus({ preventScroll: true });
  }
  updateStatus();
  updateOutlineActive();
}

function toggleEditView() {
  if (!state.hasDoc) return;
  setMode(state.mode === 'live' ? 'view' : 'live');
}

function ensureDoc() {
  if (!state.hasDoc) loadDocument({ content: '', name: 'Sem título' }, 'live');
}

function ensureEditable() {
  if (!state.hasDoc) {
    loadDocument({ content: '', name: 'Sem título' }, 'split');
    return;
  }
  if (pageMode()) setMode(settings.lastEditMode || 'split');
}

function edit(name, ...args) {
  ensureEditable();
  editor.run(name, ...args);
}

// ------------------------------------------------------------------ renderização
const scheduleRender = debounce(
  () => renderNow(),
  () => {
    const n = editor.view.state.doc.length;
    return n < 50_000 ? 110 : n < 300_000 ? 300 : 700;
  },
);

let previewStale = true;

/**
 * Atualiza a visualização, o sumário e as estatísticas.
 * No modo "somente editor" a visualização fica oculta: não é renderizada (o sumário vem do
 * próprio texto) e só é atualizada quando volta a aparecer ou com `force`.
 */
function renderNow({ force = false } = {}) {
  scheduleRender.cancel();
  const text = editor.getValue();
  if (state.mode === 'edit' && !force) {
    previewStale = true;
    updateOutline(headingsOf(text).map((hd) => ({ ...hd, id: hd.slug })));
  } else {
    preview.render(text);
    previewStale = false;
    updateOutline();
  }
  updateStats(text);
  if (state.mode === 'split' && settings.syncScroll) syncPreviewToEditor();
}

function onDocChange() {
  // Comparação estrutural do documento do CodeMirror: sem montar a string inteira a cada tecla.
  const dirty = state.metaDirty || !state.savedDoc || !editor.view.state.doc.eq(state.savedDoc);
  if (dirty !== state.dirty) {
    state.dirty = dirty;
    updateTitle();
  }
  scheduleRender();
}

// ------------------------------------------------------------------ rolagem sincronizada
let ignoreEditorScrollUntil = 0;
let ignorePreviewScrollUntil = 0;

function syncPreviewToEditor() {
  const sd = editor.view.scrollDOM;
  const line = sd.scrollTop + sd.clientHeight >= sd.scrollHeight - 2 && sd.scrollTop > 0 ? Infinity : editor.topLine();
  ignorePreviewScrollUntil = performance.now() + 120;
  preview.scrollToLine(line);
}

function onEditorScroll() {
  if (state.mode === 'edit') updateOutlineActive();
  if (state.mode !== 'split' || !settings.syncScroll) return;
  if (performance.now() < ignoreEditorScrollUntil) return;
  requestAnimationFrame(syncPreviewToEditor);
}

function onPreviewScroll() {
  if (state.mode !== 'edit') updateOutlineActive();
  if (state.mode !== 'split' || !settings.syncScroll) return;
  if (performance.now() < ignorePreviewScrollUntil) return;
  requestAnimationFrame(() => {
    const line = preview.topLine();
    ignoreEditorScrollUntil = performance.now() + 120;
    if (line === Infinity) editor.view.scrollDOM.scrollTop = editor.view.scrollDOM.scrollHeight;
    else editor.scrollToLine(line);
  });
}

// ------------------------------------------------------------------ documentos
function loadDocument(data, mode) {
  live?.discard();
  state.path = data.path ?? null;
  state.name = data.name || (data.path ? basename(data.path) : 'Sem título');
  state.encoding = data.encoding || 'utf-8';
  state.bom = !!data.bom;
  state.eol = data.eol || 'lf';
  state.mtime = data.mtime ?? null;
  state.externalPending = false;
  state.missing = false;
  hideBanner();
  const text = (data.content || '').replace(/\r\n?/g, '\n');
  state.savedContent = text;
  state.metaDirty = false;
  state.dirty = false;
  state.hasDoc = true;
  document.body.classList.remove('no-doc');
  editor.setValue(text);
  state.savedDoc = editor.view.state.doc;
  state.mode = null;
  setMode(mode || settings.defaultMode, { sync: false, focus: !pageMode(mode) });
  renderNow();
  $('preview-pane').scrollTop = 0;
  editor.view.scrollDOM.scrollTop = 0;
  if (state.path) {
    state.filesDir = dirname(state.path);
    refreshFiles();
  }
  updateTitle();
  updateStatus();
  updateBackButton();
  try {
    sessionStorage.setItem('mdeditor.doc', JSON.stringify({ path: state.path || (state.name === GUIDE_NAME ? GUIDE : null) }));
  } catch {
    /* ignora */
  }
}

async function confirmDiscard() {
  live?.finish();
  if (!state.dirty) return true;
  const r = await modal({
    title: 'Salvar alterações?',
    body: `O documento "${displayName()}" tem alterações que não foram salvas.`,
    buttons: [
      { label: 'Cancelar', value: 'cancel' },
      { label: 'Não salvar', value: 'discard' },
      { label: 'Salvar', value: 'save', primary: true },
    ],
  });
  if (!r || r.value === 'cancel') return false;
  if (r.value === 'save') return save();
  return true;
}

async function openFile(path, { mode = null, newWindow = false, fromHistory = false, anchor = null } = {}) {
  if (newWindow) {
    await bridge.openWindow(path, mode);
    return true;
  }
  if (!(await confirmDiscard())) return false;
  let data;
  try {
    data = await bridge.readFile(path);
  } catch (e) {
    await alertDialog('Não foi possível abrir o arquivo', String(e?.message || e));
    removeRecent(path);
    return false;
  }
  if (!fromHistory && state.hasDoc && state.path && state.path !== data.path) {
    state.history.push({ path: state.path, line: state.mode === 'edit' ? editor.topLine() : preview.topLine() });
  }
  loadDocument(data, mode || (state.hasDoc && state.mode ? state.mode : settings.defaultMode));
  addRecent(data.path);
  if (anchor) requestAnimationFrame(() => preview.scrollToId(anchor, false));
  return true;
}

async function openDialog() {
  const paths = await bridge.pickMarkdownFiles();
  if (!paths.length) return;
  const [first, ...rest] = paths;
  await openFile(first);
  for (const p of rest) await bridge.openWindow(p);
}

async function newDocument() {
  if (!(await confirmDiscard())) return;
  loadDocument({ content: '', name: 'Sem título' }, settings.lastEditMode || 'split');
  editor.focus();
}

async function openGuide() {
  if (state.hasDoc && (state.dirty || state.path || editor.getValue().trim())) {
    await bridge.openWindow(GUIDE, 'view');
    return;
  }
  loadDocument({ content: guideText, name: GUIDE_NAME }, 'view');
}

async function goBack() {
  const prev = state.history.pop();
  updateBackButton();
  if (!prev) return;
  if (await openFile(prev.path, { fromHistory: true })) {
    requestAnimationFrame(() => (state.mode === 'edit' ? editor.scrollToLine(prev.line) : preview.scrollToLine(prev.line)));
  }
  updateBackButton();
}

function updateBackButton() {
  $('btn-back').hidden = !state.history.length;
}

function suggestName() {
  const m = editor.getValue().match(/^\s{0,3}#{1,6}\s+(.+)$/m);
  const base = (m ? m[1] : state.name === GUIDE_NAME ? 'Guia de Markdown' : 'Sem título')
    .replace(/[*_`~[\]()!#]/g, '')
    .replace(/[<>:"/\\|?*]/g, '')
    .trim()
    .slice(0, 80);
  return `${base || 'documento'}.md`;
}

async function save({ as = false } = {}) {
  if (!state.hasDoc) return false;
  live?.finish();
  let path = state.path;
  if (!path || as) {
    const dir = state.path ? dirname(state.path) : state.filesDir;
    const suggested = state.path && !as ? state.path : dir ? join(dir, state.path ? basename(state.path) : suggestName()) : suggestName();
    path = await bridge.saveDialog(suggested, 'md');
    if (!path) return false;
    if (!/\.[^\\/.]+$/.test(basename(path))) path += '.md';
  }
  const content = editor.getValue();
  const out = state.eol === 'crlf' ? content.replace(/\n/g, '\r\n') : content;
  try {
    const r = await bridge.writeFile(path, out, state.encoding, state.bom);
    if (r.encoding !== state.encoding) toast('O texto tem caracteres fora do Windows-1252; salvo em UTF-8.');
    state.mtime = r.mtime;
    state.encoding = r.encoding;
    state.bom = r.bom;
  } catch (e) {
    await alertDialog('Erro ao salvar', String(e?.message || e));
    return false;
  }
  const moved = path !== state.path;
  state.path = path;
  state.name = basename(path);
  state.savedContent = content;
  state.savedDoc = editor.view.state.doc;
  state.metaDirty = false;
  state.dirty = false;
  state.missing = false;
  state.externalPending = false;
  hideBanner();
  addRecent(path);
  updateTitle();
  updateStatus();
  if (moved) {
    state.filesDir = dirname(path);
    refreshFiles();
    renderNow();
    try {
      sessionStorage.setItem('mdeditor.doc', JSON.stringify({ path }));
    } catch {
      /* ignora */
    }
  }
  toast('Documento salvo');
  return true;
}

async function reloadFromDisk(force = false) {
  if (!state.path) return;
  if (!force && state.dirty && !(await confirmDialog('Recarregar do disco', 'Descartar as alterações não salvas e recarregar o arquivo do disco?', 'Recarregar', { danger: true }))) return;
  await reloadKeepingPosition();
}

async function reloadKeepingPosition() {
  let data;
  try {
    data = await bridge.readFile(state.path);
  } catch (e) {
    toast(String(e?.message || e), 'error');
    return;
  }
  const line = state.mode === 'edit' ? editor.topLine() : preview.topLine();
  const text = data.content.replace(/\r\n?/g, '\n');
  if (text !== editor.getValue()) editor.setValue(text, { reset: false });
  state.savedContent = text;
  state.savedDoc = editor.view.state.doc;
  state.encoding = data.encoding;
  state.bom = data.bom;
  state.eol = data.eol;
  state.mtime = data.mtime;
  state.dirty = false;
  state.metaDirty = false;
  state.externalPending = false;
  hideBanner();
  renderNow();
  updateTitle();
  updateStatus();
  requestAnimationFrame(() => {
    if (state.mode !== 'edit') preview.scrollToLine(line);
    if (!pageMode() && line !== Infinity) editor.scrollToLine(line);
  });
}

// Detecta alterações feitas por outros programas.
let checking = false;
async function checkExternal() {
  if (!isTauri || !state.path || checking || document.visibilityState !== 'visible') return;
  checking = true;
  try {
    const m = await bridge.mtime(state.path);
    if (m == null) {
      if (!state.missing) {
        state.missing = true;
        showBanner('warning', 'O arquivo foi movido, renomeado ou excluído do disco.', [
          { label: 'Salvar novamente', action: () => save() },
          { label: 'Salvar como…', action: () => save({ as: true }) },
        ]);
      }
      return;
    }
    if (state.missing) {
      state.missing = false;
      hideBanner();
    }
    if (state.mtime != null && m !== state.mtime) {
      if (!state.dirty) {
        await reloadKeepingPosition();
        toast('Documento atualizado a partir do disco');
      } else if (!state.externalPending) {
        state.externalPending = true;
        showBanner('info', 'Este arquivo foi alterado por outro programa.', [
          { label: 'Recarregar do disco', action: () => reloadFromDisk(true) },
          {
            label: 'Manter minha versão',
            action: () => {
              state.mtime = m;
              state.externalPending = false;
              hideBanner();
            },
          },
        ]);
      }
    }
  } catch {
    /* ignora */
  } finally {
    checking = false;
  }
}

function showBanner(kind, text, actions = []) {
  const b = $('banner');
  b.className = kind;
  b.replaceChildren(
    icon(kind === 'warning' ? 'TriangleAlert' : 'Info', 16),
    h('span', { class: 'banner-text', text }),
    ...actions.map((a) => h('button', { class: 'btn small', type: 'button', text: a.label, onclick: a.action })),
    h('button', { class: 'icon-btn', type: 'button', title: 'Fechar aviso', onclick: hideBanner }, icon('X', 14)),
  );
  b.hidden = false;
}
function hideBanner() {
  $('banner').hidden = true;
}

// ------------------------------------------------------------------ imagens e arquivos
function linkPathFor(absPath) {
  if (state.path) return relative(dirname(state.path), absPath);
  return absPath.replace(/\\/g, '/');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

async function pasteImages(files) {
  if (!isTauri) return toast('Colar imagens requer o aplicativo instalado.');
  if (!state.path) {
    const ok = await confirmDialog(
      'Salvar documento',
      'Para colar imagens, o documento precisa estar salvo: as imagens são gravadas na pasta "imagens" ao lado dele. Deseja salvar agora?',
      'Salvar',
    );
    if (!ok || !(await save())) return;
  }
  const dir = dirname(state.path);
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const parts = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg').replace(/[^a-z0-9]/gi, '');
    const rel = `imagens/imagem-${stamp}${files.length > 1 ? `-${i + 1}` : ''}.${ext}`;
    try {
      await bridge.writeBinary(join(dir, rel), await fileToBase64(f));
      parts.push(`![imagem](${rel})`);
    } catch (e) {
      toast(String(e?.message || e), 'error');
    }
  }
  if (parts.length) {
    editor.run('insert', parts.join('\n\n'));
    toast(parts.length > 1 ? `${parts.length} imagens salvas em "imagens"` : 'Imagem salva na pasta "imagens"');
  }
}

async function handleDrop(paths) {
  const mds = paths.filter((p) => MARKDOWN_EXTENSIONS.includes(extname(p)) || extname(p) === 'txt');
  const imgs = paths.filter((p) => IMAGE_EXTENSIONS.includes(extname(p)));
  if (imgs.length && state.hasDoc && !pageMode()) {
    const text = imgs.map((p) => `![${stripExt(basename(p))}](${encodeURI(linkPathFor(p))})`).join('\n\n');
    editor.run('insert', text);
  }
  if (mds.length) {
    const [first, ...rest] = mds;
    if (state.dirty) await bridge.openWindow(first);
    else await openFile(first);
    for (const p of rest) await bridge.openWindow(p);
  }
  if (!mds.length && !(imgs.length && state.hasDoc && !pageMode())) {
    toast(imgs.length ? 'Entre no modo de edição para inserir imagens' : 'Tipo de arquivo não suportado');
  }
}

async function copyText(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Copiado para a área de transferência');
}

async function clipboardAction(kind) {
  ensureEditable();
  const v = editor.view;
  const r = v.state.selection.main;
  if (kind === 'paste') {
    try {
      const text = await navigator.clipboard.readText();
      editor.run('insert', text);
    } catch {
      toast('Use Ctrl+V para colar');
    }
    return;
  }
  const text = v.state.sliceDoc(r.from, r.to);
  if (!text) return;
  await copyText(text);
  if (kind === 'cut') v.dispatch({ changes: { from: r.from, to: r.to }, userEvent: 'delete.cut' });
  v.focus();
}

// ------------------------------------------------------------------ exportar e imprimir
function firstHeading() {
  return preview.headings()[0]?.text || '';
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const EXPORT_BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html{background:var(--md-bg)}
body{margin:0;background:var(--md-bg)}
.markdown-body{max-width:880px;margin:0 auto;padding:48px 32px 96px}
`;

async function exportHtml() {
  if (!state.hasDoc) return;
  renderNow({ force: true });
  const base = state.path ? stripExt(state.path) : join(state.filesDir || '', stripExt(suggestName()));
  const path = await bridge.saveDialog(`${base}.html`, 'html');
  if (!path) return;
  const clone = $('preview').cloneNode(true);
  clone.querySelectorAll('img[data-src]').forEach((img) => {
    img.setAttribute('src', img.dataset.src);
    img.removeAttribute('data-src');
  });
  clone.querySelectorAll('.code-copy').forEach((b) => b.remove());
  clone.querySelectorAll('[data-line]').forEach((el) => el.removeAttribute('data-line'));
  clone.querySelectorAll('input.task-list-item-checkbox').forEach((cb) => cb.setAttribute('disabled', ''));
  const title = firstHeading() || stripExt(displayName());
  const katex = clone.querySelector('.katex, .math-pending')
    ? `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.css">\n`
    : '';
  const html = `<!DOCTYPE html>
<html lang="pt-BR" data-theme="${resolvedTheme()}"${document.documentElement.dataset.palette ? ` data-palette="${document.documentElement.dataset.palette}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="MDEditor">
<title>${escapeHtml(title)}</title>
${katex}<style>
${EXPORT_BASE_CSS}
${markdownCss}
${hljsCss}
${themesCss}
:root { --md-font: ${(DOC_FONTS[settings.docFont] || DOC_FONTS.system).css}; }
</style>
</head>
<body>
<article class="markdown-body">
${clone.innerHTML}
</article>
</body>
</html>
`;
  try {
    await bridge.writeFile(path, html, 'utf-8', false);
    toast('Página HTML exportada');
  } catch (e) {
    alertDialog('Erro ao exportar', String(e?.message || e));
  }
}

function printDoc() {
  if (!state.hasDoc) return;
  renderNow({ force: true });
  document.body.classList.add('printing');
  const html = document.documentElement;
  const saved = { theme: html.dataset.theme, palette: html.dataset.palette };
  html.dataset.theme = 'light';
  delete html.dataset.palette;
  const done = () => {
    document.body.classList.remove('printing');
    html.dataset.theme = saved.theme;
    if (saved.palette) html.dataset.palette = saved.palette;
  };
  window.addEventListener('afterprint', done, { once: true });
  setTimeout(() => window.print(), 60);
}

// ------------------------------------------------------------------ diálogos
async function linkDialog() {
  ensureEditable();
  const v = editor.view;
  const r = v.state.selection.main;
  const sel = v.state.sliceDoc(r.from, r.to);
  const isUrl = /^(https?:\/\/|www\.)\S+$/i.test(sel.trim());
  const urlField = field('Endereço (URL ou caminho de arquivo)', 'url', isUrl ? sel.trim() : '', { placeholder: 'https://exemplo.com  ou  outro-arquivo.md#secao' });
  const body = h(
    'div',
    { class: 'form' },
    field('Texto exibido', 'text', isUrl ? '' : sel, { placeholder: 'Texto do link' }),
    urlField,
    field('Título ao passar o mouse (opcional)', 'title', ''),
    isTauri
      ? h('button', {
          class: 'btn small ghost',
          type: 'button',
          onclick: async () => {
            const [p] = await bridge.pickMarkdownFiles();
            if (p) urlField.querySelector('input').value = linkPathFor(p);
          },
        }, icon('FolderOpen', 14), 'Escolher arquivo…')
      : null,
  );
  const res = await modal({
    title: 'Inserir link',
    body,
    width: 480,
    buttons: [
      { label: 'Cancelar', value: 'cancel' },
      { label: 'Inserir', value: 'ok', primary: true },
    ],
  });
  if (res?.value !== 'ok') return editor.focus();
  commands.link(v, res.data);
}

async function imageDialog() {
  ensureEditable();
  const v = editor.view;
  const r = v.state.selection.main;
  const sel = v.state.sliceDoc(r.from, r.to);
  const urlField = field('Endereço da imagem (URL ou arquivo)', 'url', '', { placeholder: 'https://… ou imagens/foto.png' });
  const body = h(
    'div',
    { class: 'form' },
    urlField,
    field('Texto alternativo (descrição)', 'alt', sel),
    field('Título (opcional)', 'title', ''),
    isTauri
      ? h('button', {
          class: 'btn small ghost',
          type: 'button',
          onclick: async () => {
            const p = await bridge.pickImage(state.path ? dirname(state.path) : undefined);
            if (p) {
              urlField.querySelector('input').value = encodeURI(linkPathFor(p));
              const alt = body.querySelector('[name=alt]');
              if (!alt.value) alt.value = stripExt(basename(p));
            }
          },
        }, icon('Image', 14), 'Escolher imagem…')
      : null,
    h('p', { class: 'hint', text: 'Dica: cole uma imagem (Ctrl+V) ou arraste um arquivo de imagem para o editor.' }),
  );
  const res = await modal({
    title: 'Inserir imagem',
    body,
    width: 480,
    buttons: [
      { label: 'Cancelar', value: 'cancel' },
      { label: 'Inserir', value: 'ok', primary: true },
    ],
  });
  if (res?.value !== 'ok') return editor.focus();
  commands.image(v, res.data);
}

async function tableDialog() {
  ensureEditable();
  const body = h(
    'div',
    { class: 'form form-inline' },
    field('Colunas', 'cols', '3', { type: 'number', min: '1', max: '30' }),
    field('Linhas (sem o cabeçalho)', 'rows', '2', { type: 'number', min: '0', max: '200' }),
  );
  const res = await modal({
    title: 'Inserir tabela',
    body,
    width: 400,
    buttons: [
      { label: 'Cancelar', value: 'cancel' },
      { label: 'Inserir', value: 'ok', primary: true },
    ],
  });
  if (res?.value !== 'ok') return editor.focus();
  const cols = Math.max(1, Math.min(30, parseInt(res.data.cols, 10) || 3));
  const rows = Math.max(0, Math.min(200, parseInt(res.data.rows, 10) || 0));
  edit('table', rows, cols);
}

async function makeDefault() {
  try {
    await bridge.registerAssoc(true);
    const st = await bridge.assocStatus();
    if (st.isDefault) {
      toast('Pronto! Arquivos .md agora abrem no MDEditor');
    } else {
      await bridge.openDefaultAppsSettings();
      toast('Confirme o MDEditor para ".md" nas Configurações do Windows');
    }
    refreshAssocCard();
    return st;
  } catch (e) {
    alertDialog('Não foi possível registrar', String(e?.message || e));
  }
}

async function assocDialog() {
  const st = await bridge.assocStatus().catch(() => null);
  const ok = st?.isDefault;
  const body = h(
    'div',
    { class: 'assoc' },
    h(
      'div',
      { class: `assoc-status ${ok ? 'ok' : 'warn'}` },
      icon(ok ? 'CircleCheck' : 'Info', 22),
      h(
        'div',
        {},
        h('strong', { text: ok ? 'O MDEditor é o aplicativo padrão para arquivos .md' : 'O MDEditor ainda não é o aplicativo padrão para .md' }),
        h('div', { class: 'muted', text: st?.currentHandler ? `Configuração atual: ${st.currentHandler}` : 'Nenhum aplicativo padrão definido para .md.' }),
      ),
    ),
    h('p', { text: 'O MDEditor aparece em "Abrir com" para arquivos Markdown (.md, .markdown…). Para abrir todos com dois cliques, clique em "Definir como padrão". Se o Windows pedir confirmação, escolha MDEditor nas Configurações.' }),
    h('p', { class: 'muted', text: 'Alternativa manual: botão direito em um arquivo .md → Abrir com → Escolher outro aplicativo → MDEditor → Sempre.' }),
  );
  const buttons = [{ label: 'Fechar', value: 'close' }];
  if (state.path) buttons.push({ label: 'Janela "Abrir com"…', value: 'openwith' });
  buttons.push({ label: 'Configurações do Windows', value: 'settings' });
  if (!ok) buttons.push({ label: 'Definir como padrão', value: 'default', primary: true });
  const r = await modal({ title: 'Aplicativo padrão para Markdown', body, buttons, width: 560 });
  if (r?.value === 'default') await makeDefault();
  else if (r?.value === 'settings') await bridge.openDefaultAppsSettings();
  else if (r?.value === 'openwith') await bridge.openWithDialog(state.path);
}

async function aboutDialog() {
  const info = await bridge.appInfo().catch(() => ({ version: '1.0.0', exePath: '' }));
  const body = h(
    'div',
    { class: 'about' },
    h('img', { src: '/logo.png', alt: '', class: 'about-logo' }),
    h('div', {},
      h('h3', { text: 'MDEditor' }),
      h('div', { class: 'muted', text: `Versão ${info.version}` }),
      h('p', { text: 'Editor e visualizador de documentos Markdown para Windows.' }),
      h('p', { class: 'muted small', text: 'Construído com Tauri, CodeMirror, markdown-it, highlight.js, KaTeX e Mermaid.' }),
      info.exePath ? h('p', { class: 'muted small path', text: info.exePath }) : null,
    ),
  );
  await modal({ title: 'Sobre', body, width: 460, buttons: [{ label: 'OK', value: 'ok', primary: true }] });
}

const SHORTCUTS = [
  ['Arquivo', [
    ['Ctrl+N', 'Novo documento'], ['Ctrl+Shift+N', 'Nova janela'], ['Ctrl+O', 'Abrir'], ['Ctrl+S', 'Salvar'],
    ['Ctrl+Shift+S', 'Salvar como'], ['F5', 'Recarregar do disco'], ['Ctrl+P', 'Imprimir / PDF'], ['Ctrl+W', 'Fechar janela'],
  ]],
  ['Exibição', [
    ['Ctrl+E', 'Alternar visualizar / editar'], ['Ctrl+\\', 'Modo dividido'], ['Ctrl+Shift+E', 'Somente editor'],
    ['Ctrl+Shift+B', 'Barra lateral'], ['Ctrl+= / Ctrl+-', 'Zoom'], ['Ctrl+0', 'Zoom original'], ['F11', 'Tela cheia'],
    ['Alt+←', 'Voltar ao documento anterior'], ['Ctrl+F', 'Localizar'],
  ]],
  ['Formatação', [
    ['Ctrl+B', 'Negrito'], ['Ctrl+I', 'Itálico'], ['Ctrl+U', 'Sublinhado'], ['Ctrl+Shift+X', 'Tachado'],
    ['Ctrl+Shift+H', 'Realce'], ['Ctrl+`', 'Código'], ['Ctrl+1 … Ctrl+6', 'Título 1 a 6'], ['Ctrl+K', 'Link'],
    ['Ctrl+Shift+I', 'Imagem'], ['Ctrl+Shift+T', 'Tabela'], ['Ctrl+Alt+F', 'Formatar tabela'], ['Ctrl+Shift+K', 'Bloco de código'],
    ['Ctrl+Shift+M', 'Bloco de fórmula'], ['Ctrl+Shift+-', 'Linha horizontal'],
  ]],
  ['Listas e edição', [
    ['Ctrl+Shift+8', 'Lista com marcadores'], ['Ctrl+Shift+7', 'Lista numerada'], ['Ctrl+Shift+9', 'Lista de tarefas'],
    ['Ctrl+Shift+Q', 'Citação'], ['Tab / Shift+Tab', 'Recuar item da lista'], ['Ctrl+H', 'Substituir'],
    ['Ctrl+G', 'Ir para a linha'], ['Alt+↑ / Alt+↓', 'Mover linha'], ['Ctrl+D', 'Selecionar próxima ocorrência'], [':nome', 'Autocompletar emoji'],
  ]],
];

async function shortcutsDialog() {
  const body = h(
    'div',
    { class: 'shortcuts' },
    SHORTCUTS.map(([group, rows]) =>
      h('section', {}, h('h4', { text: group }), h('table', {}, rows.map(([k, d]) => h('tr', {}, h('td', {}, h('kbd', { text: k })), h('td', { text: d }))))),
    ),
  );
  await modal({ title: 'Atalhos de teclado', body, width: 760, className: 'wide', buttons: [{ label: 'Fechar', value: 'ok', primary: true }] });
}

// ------------------------------------------------------------------ menus
const CODE_LANGS = [
  ['', 'Sem linguagem'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'], ['python', 'Python'], ['java', 'Java'],
  ['csharp', 'C#'], ['cpp', 'C++'], ['c', 'C'], ['go', 'Go'], ['rust', 'Rust'], ['php', 'PHP'], ['ruby', 'Ruby'],
  ['kotlin', 'Kotlin'], ['swift', 'Swift'], ['sql', 'SQL'], ['html', 'HTML'], ['css', 'CSS'], ['json', 'JSON'],
  ['yaml', 'YAML'], ['xml', 'XML'], ['bash', 'Bash'], ['powershell', 'PowerShell'], ['bat', 'Batch (cmd)'],
  ['dockerfile', 'Dockerfile'], ['markdown', 'Markdown'], ['diff', 'Diff'], ['text', 'Texto simples'],
];

const headingItems = () => [
  ...[1, 2, 3, 4, 5, 6].map((n) => ({
    label: `Título ${n}`,
    shortcut: `Ctrl+${n}`,
    style: `font-size:${[1.3, 1.2, 1.1, 1, 0.95, 0.9][n - 1]}em;font-weight:700`,
    action: () => edit('heading', n),
  })),
  '-',
  { label: 'Texto normal', icon: 'Pilcrow', action: () => edit('heading', 0) },
];

const codeItems = () => CODE_LANGS.map(([id, label]) => ({ label, action: () => edit('codeBlock', id) }));

const mathItems = () => [
  { label: 'Fórmula na linha  $…$', icon: 'Sigma', action: () => edit('mathInline') },
  { label: 'Bloco de fórmula  $$…$$', icon: 'Sigma', shortcut: 'Ctrl+Shift+M', action: () => edit('mathBlock') },
];

const mermaidItems = () => [
  { label: 'Fluxograma', action: () => edit('mermaid', 'flowchart') },
  { label: 'Diagrama de sequência', action: () => edit('mermaid', 'sequence') },
  { label: 'Diagrama de classes', action: () => edit('mermaid', 'class') },
  { label: 'Gráfico de Gantt', action: () => edit('mermaid', 'gantt') },
  { label: 'Gráfico de pizza', action: () => edit('mermaid', 'pie') },
  { label: 'Mapa mental', action: () => edit('mermaid', 'mindmap') },
];

const ALERT_ICONS = { NOTE: 'Info', TIP: 'Lightbulb', IMPORTANT: 'MessageSquareWarning', WARNING: 'TriangleAlert', CAUTION: 'OctagonAlert' };
const alertItems = () => Object.entries(ALERTS).map(([type, label]) => ({ label, icon: ALERT_ICONS[type], action: () => edit('alert', type) }));

const EMOJIS =
  '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😎 🤓 🤔 🤨 😐 😴 😢 😭 😡 🤯 🥳 👍 👎 👏 🙌 🙏 💪 👀 👋 🤝 ✌️ 🎉 🎊 ✨ 🔥 💯 ✅ ❌ ⚠️ ❗ ❓ 💡 📌 📎 📝 📚 📖 🔗 📅 ⏰ ⏳ 🚀 🎯 🏆 ⭐ 🌟 ❤️ 💙 💚 💛 🧡 💜 🖤 👉 👈 👆 👇 ➡️ ⬅️ ⬆️ ⬇️ 🔒 🔑 🐛 🛠️ ⚙️ 💻 📱 🌐 ☕ 🍕 🎵 📷 📊 📈 📉 🗂️ 📁 🧪 🧠 💬 📣 🔔 🆕 🆗'.split(' ');

function emojiGrid() {
  const grid = h('div', { class: 'emoji-grid' });
  for (const e of EMOJIS) {
    grid.append(h('button', { type: 'button', class: 'emoji-btn', text: e, title: e, onclick: () => (closeAllMenus(), edit('emoji', e)) }));
  }
  return h('div', {}, grid, h('div', { class: 'menu-footnote', text: 'Dica: digite ":" e o nome (ex.: :rocket:) para autocompletar.' }));
}

function tableGrid() {
  const label = h('div', { class: 'grid-label', text: 'Inserir tabela' });
  const grid = h('div', { class: 'table-grid' });
  for (let r = 1; r <= 8; r++) for (let c = 1; c <= 8; c++) grid.append(h('div', { class: 'cell', dataset: { r, c } }));
  grid.addEventListener('mouseover', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    const R = +cell.dataset.r;
    const C = +cell.dataset.c;
    for (const x of grid.children) x.classList.toggle('on', +x.dataset.r <= R && +x.dataset.c <= C);
    label.textContent = `${C} coluna${C > 1 ? 's' : ''} × ${R} linha${R > 1 ? 's' : ''} + cabeçalho`;
  });
  grid.addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    closeAllMenus();
    edit('table', +cell.dataset.r, +cell.dataset.c);
  });
  return h('div', { class: 'table-picker' }, label, grid);
}

const tableItems = () => [
  { custom: tableGrid() },
  '-',
  { label: 'Tabela personalizada…', icon: 'Table', shortcut: 'Ctrl+Shift+T', action: tableDialog },
  { label: 'Formatar tabela (alinhar colunas)', icon: 'Columns2', shortcut: 'Ctrl+Alt+F', action: formatTableCmd },
];

function formatTableCmd() {
  ensureEditable();
  if (!commands.formatTable(editor.view)) toast('Posicione o cursor dentro de uma tabela Markdown');
}

const moreItems = () => [
  { label: 'Sublinhado', icon: 'Underline', shortcut: 'Ctrl+U', action: () => edit('underline') },
  { label: 'Sobrescrito', icon: 'Superscript', action: () => edit('sup') },
  { label: 'Subscrito', icon: 'Subscript', action: () => edit('sub') },
  { label: 'Tecla do teclado', icon: 'Keyboard', action: () => edit('kbd') },
  '-',
  { label: 'Seção recolhível (detalhes)', icon: 'ChevronsDownUp', action: () => edit('details') },
  { label: 'Lista de definição', icon: 'BookA', action: () => edit('deflist') },
  { label: 'Abreviação', icon: 'Type', action: () => edit('abbr') },
  { label: 'Comentário (oculto)', icon: 'Hash', action: () => edit('comment') },
  { label: 'Quebra de linha', icon: 'CornerDownLeft', action: () => edit('lineBreak') },
  '-',
  { label: 'Sumário (índice de títulos)', icon: 'ListTree', action: () => edit('toc') },
  { label: 'Data e hora', icon: 'CalendarClock', action: () => edit('datetime') },
  '-',
  { label: 'Escapar caracteres especiais', icon: 'Braces', action: () => edit('escape') },
  { label: 'Limpar formatação', icon: 'RemoveFormatting', action: () => edit('clearFormat') },
];

function recentItems() {
  const list = recentFiles();
  if (!list.length) return [{ label: 'Nenhum arquivo recente', disabled: true }];
  return [
    ...list.map((p) => ({ label: basename(p), title: p, icon: 'FileText', action: () => openFile(p) })),
    '-',
    { label: 'Limpar lista', action: () => setRecent([]) },
  ];
}

const MENUS = [
  ['Arquivo', 'a', () => [
    { label: 'Novo documento', icon: 'FilePlus', shortcut: 'Ctrl+N', action: newDocument },
    { label: 'Nova janela', icon: 'AppWindow', shortcut: 'Ctrl+Shift+N', action: () => bridge.openWindow() },
    { label: 'Abrir…', icon: 'FolderOpen', shortcut: 'Ctrl+O', action: openDialog },
    { label: 'Abrir recente', icon: 'Files', submenu: recentItems },
    '-',
    { label: 'Salvar', icon: 'Save', shortcut: 'Ctrl+S', action: () => save(), disabled: !state.hasDoc },
    { label: 'Salvar como…', shortcut: 'Ctrl+Shift+S', action: () => save({ as: true }), disabled: !state.hasDoc },
    { label: 'Recarregar do disco', icon: 'RefreshCw', shortcut: 'F5', action: () => reloadFromDisk(), disabled: !state.path },
    '-',
    { label: 'Exportar como HTML…', icon: 'FileDown', action: exportHtml, disabled: !state.hasDoc },
    { label: 'Imprimir / Salvar como PDF…', icon: 'Printer', shortcut: 'Ctrl+P', action: printDoc, disabled: !state.hasDoc },
    '-',
    { label: 'Mostrar no Explorador de Arquivos', icon: 'Folder', action: () => bridge.reveal(state.path), disabled: !state.path },
    { label: 'Copiar caminho do arquivo', icon: 'Copy', action: () => copyText(state.path), disabled: !state.path },
    '-',
    { label: 'Fechar janela', icon: 'X', shortcut: 'Ctrl+W', action: () => bridge.window.close() },
  ]],
  ['Editar', 'e', () => [
    { label: 'Desfazer', icon: 'Undo2', shortcut: 'Ctrl+Z', action: () => edit('undo') },
    { label: 'Refazer', icon: 'Redo2', shortcut: 'Ctrl+Y', action: () => edit('redo') },
    '-',
    { label: 'Recortar', shortcut: 'Ctrl+X', action: () => clipboardAction('cut') },
    { label: 'Copiar', icon: 'Copy', shortcut: 'Ctrl+C', action: () => clipboardAction('copy') },
    { label: 'Colar', shortcut: 'Ctrl+V', action: () => clipboardAction('paste') },
    { label: 'Selecionar tudo', shortcut: 'Ctrl+A', action: selectAll },
    '-',
    { label: 'Localizar…', icon: 'Search', shortcut: 'Ctrl+F', action: openFind },
    { label: 'Substituir…', icon: 'Replace', shortcut: 'Ctrl+H', action: () => (ensureEditable(), commands.find(editor.view)) },
    { label: 'Ir para a linha…', shortcut: 'Ctrl+G', action: () => (ensureEditable(), commands.gotoLine(editor.view)) },
    '-',
    { label: 'Aumentar recuo', icon: 'IndentIncrease', shortcut: 'Tab', action: () => edit('indent') },
    { label: 'Diminuir recuo', icon: 'IndentDecrease', shortcut: 'Shift+Tab', action: () => edit('outdent') },
  ]],
  ['Formatar', 'f', () => [
    { label: 'Negrito', icon: 'Bold', shortcut: 'Ctrl+B', action: () => edit('bold') },
    { label: 'Itálico', icon: 'Italic', shortcut: 'Ctrl+I', action: () => edit('italic') },
    { label: 'Sublinhado', icon: 'Underline', shortcut: 'Ctrl+U', action: () => edit('underline') },
    { label: 'Tachado', icon: 'Strikethrough', shortcut: 'Ctrl+Shift+X', action: () => edit('strike') },
    { label: 'Realce', icon: 'Highlighter', shortcut: 'Ctrl+Shift+H', action: () => edit('highlight') },
    { label: 'Código', icon: 'Code', shortcut: 'Ctrl+`', action: () => edit('code') },
    { label: 'Sobrescrito', icon: 'Superscript', action: () => edit('sup') },
    { label: 'Subscrito', icon: 'Subscript', action: () => edit('sub') },
    { label: 'Tecla do teclado', icon: 'Keyboard', action: () => edit('kbd') },
    '-',
    { label: 'Títulos', icon: 'Heading', submenu: headingItems },
    { label: 'Texto normal', icon: 'Pilcrow', action: () => edit('heading', 0) },
    '-',
    { label: 'Lista com marcadores', icon: 'List', shortcut: 'Ctrl+Shift+8', action: () => edit('bullet') },
    { label: 'Lista numerada', icon: 'ListOrdered', shortcut: 'Ctrl+Shift+7', action: () => edit('ordered') },
    { label: 'Lista de tarefas', icon: 'ListTodo', shortcut: 'Ctrl+Shift+9', action: () => edit('task') },
    { label: 'Citação', icon: 'TextQuote', shortcut: 'Ctrl+Shift+Q', action: () => edit('quote') },
    '-',
    { label: 'Formatar tabela', icon: 'Table', shortcut: 'Ctrl+Alt+F', action: formatTableCmd },
    { label: 'Escapar caracteres especiais', icon: 'Braces', action: () => edit('escape') },
    { label: 'Limpar formatação', icon: 'RemoveFormatting', action: () => edit('clearFormat') },
  ]],
  ['Inserir', 'i', () => [
    { label: 'Link…', icon: 'Link', shortcut: 'Ctrl+K', action: linkDialog },
    { label: 'Imagem…', icon: 'Image', shortcut: 'Ctrl+Shift+I', action: imageDialog },
    { label: 'Tabela', icon: 'Table', submenu: tableItems },
    { label: 'Bloco de código', icon: 'SquareCode', submenu: codeItems },
    { label: 'Linha horizontal', icon: 'Minus', shortcut: 'Ctrl+Shift+-', action: () => edit('hr') },
    '-',
    { label: 'Nota de rodapé', icon: 'Footprints', action: () => edit('footnote') },
    { label: 'Fórmula matemática', icon: 'Sigma', submenu: mathItems },
    { label: 'Diagrama (Mermaid)', icon: 'Workflow', submenu: mermaidItems },
    { label: 'Alerta / destaque', icon: 'MessageSquareWarning', submenu: alertItems },
    { label: 'Emoji', icon: 'Smile', submenu: () => [{ custom: emojiGrid() }] },
    '-',
    ...moreItems().slice(4),
  ]],
  ['Exibir', 'x', () => [
    { label: 'Somente leitura', icon: 'Eye', checked: state.mode === 'view', disabled: !state.hasDoc, action: () => setMode('view') },
    { label: 'Editar na página', icon: 'PenLine', shortcut: 'Ctrl+E', checked: state.mode === 'live', action: () => (ensureDoc(), setMode('live')) },
    { label: 'Dividido (editor + visualização)', icon: 'Columns2', shortcut: 'Ctrl+\\', checked: state.mode === 'split', action: () => (ensureEditable(), setMode('split')) },
    { label: 'Somente editor', icon: 'PenLine', shortcut: 'Ctrl+Shift+E', checked: state.mode === 'edit', action: () => (ensureEditable(), setMode('edit')) },
    '-',
    { label: 'Barra lateral', icon: 'PanelLeft', shortcut: 'Ctrl+Shift+B', checked: settings.sidebar, action: toggleSidebar },
    { label: 'Sumário do documento', icon: 'ListTree', action: () => showSidebarTab('outline') },
    { label: 'Arquivos da pasta', icon: 'Files', action: () => showSidebarTab('files') },
    '-',
    {
      label: 'Tema',
      icon: 'Palette',
      submenu: () =>
        Object.entries(THEMES).map(([id, t]) => ({
          label: t.label,
          checked: settings.theme === id,
          action: () => setSetting('theme', id),
        })),
    },
    {
      label: 'Ícones',
      icon: 'Smile',
      submenu: () =>
        Object.entries(ICON_PACKS).map(([id, p]) => ({
          label: p.label,
          checked: settings.iconPack === id,
          action: () => setSetting('iconPack', id),
        })),
    },
    {
      label: 'Fonte do documento',
      icon: 'Type',
      submenu: () =>
        Object.entries(DOC_FONTS).map(([id, f]) => ({
          label: f.label,
          style: `font-family:${f.css}`,
          checked: settings.docFont === id,
          action: () => setSetting('docFont', id),
        })),
    },
    {
      label: 'Fonte do editor',
      icon: 'CodeXml',
      submenu: () =>
        Object.entries(EDITOR_FONTS).map(([id, f]) => ({
          label: f.label,
          style: `font-family:${f.css}`,
          checked: settings.editorFont === id,
          action: () => setSetting('editorFont', id),
        })),
    },
    { label: 'Aumentar zoom', shortcut: 'Ctrl+=', action: () => setZoom(settings.zoom + 0.1) },
    { label: 'Diminuir zoom', shortcut: 'Ctrl+-', action: () => setZoom(settings.zoom - 0.1) },
    { label: 'Zoom original', shortcut: 'Ctrl+0', action: () => setZoom(1) },
    { label: 'Tela cheia', icon: 'Maximize', shortcut: 'F11', action: toggleFullscreen },
    '-',
    { label: 'Texto largo na visualização', checked: settings.wide, action: () => setSetting('wide', !settings.wide) },
    { label: 'Rolagem sincronizada', checked: settings.syncScroll, action: () => setSetting('syncScroll', !settings.syncScroll) },
    {
      label: 'Editor',
      icon: 'PenLine',
      submenu: () => [
        { label: 'Números de linha', checked: settings.lineNumbers, action: () => setSetting('lineNumbers', !settings.lineNumbers) },
        { label: 'Quebra automática de linha', icon: 'WrapText', checked: settings.wrap, action: () => setSetting('wrap', !settings.wrap) },
        { label: 'Verificação ortográfica', checked: settings.spellcheck, action: () => setSetting('spellcheck', !settings.spellcheck) },
      ],
    },
    {
      label: 'Ao abrir um arquivo',
      submenu: () => [
        { label: 'Editar na página', checked: settings.defaultMode === 'live', action: () => setSetting('defaultMode', 'live') },
        { label: 'Somente leitura', checked: settings.defaultMode === 'view', action: () => setSetting('defaultMode', 'view') },
        { label: 'Mostrar dividido', checked: settings.defaultMode === 'split', action: () => setSetting('defaultMode', 'split') },
        { label: 'Mostrar o editor', checked: settings.defaultMode === 'edit', action: () => setSetting('defaultMode', 'edit') },
      ],
    },
  ]],
  ['Ajuda', 'j', () => [
    { label: 'Guia de Markdown', icon: 'BookOpen', shortcut: 'F1', action: openGuide },
    { label: 'Atalhos de teclado', icon: 'Keyboard', shortcut: 'Ctrl+/', action: shortcutsDialog },
    '-',
    { label: 'Definir como aplicativo padrão para .md…', icon: 'CircleCheck', action: assocDialog },
    '-',
    { label: 'Sobre o MDEditor', icon: 'Info', action: aboutDialog },
  ]],
];

function mainMenuItems() {
  return [
    { label: 'Novo documento', icon: 'FilePlus', shortcut: 'Ctrl+N', action: newDocument },
    { label: 'Abrir…', icon: 'FolderOpen', shortcut: 'Ctrl+O', action: openDialog },
    { label: 'Salvar', icon: 'Save', shortcut: 'Ctrl+S', action: () => save(), disabled: !state.hasDoc },
    '-',
    ...MENUS.map(([label, , build]) => ({ label, submenu: build })),
    '-',
    { label: 'Codificação', submenu: encodingItems, disabled: !state.hasDoc },
    { label: 'Fim de linha', submenu: eolItems, disabled: !state.hasDoc },
  ];
}

/** Abre um menu acima do elemento (para itens na parte de baixo da tela). */
function showMenuAbove(items, el, opts = {}) {
  const r = el.getBoundingClientRect();
  const m = showMenu(items, { x: r.left, y: r.top }, opts);
  m.style.top = `${Math.max(6, r.top - m.getBoundingClientRect().height - 6)}px`;
  return m;
}

function openMainMenu() {
  const btn = $('btn-more');
  if (btn.classList.contains('active')) return closeAllMenus();
  btn.classList.add('active');
  const r = btn.getBoundingClientRect();
  const m = showMenu(mainMenuItems(), { x: r.right, y: r.bottom + 6 }, { onClose: () => btn.classList.remove('active') });
  m.style.left = `${Math.max(6, r.right - m.getBoundingClientRect().width)}px`;
}

function buildTopbar() {
  const iconBtn = (id, ic, title, onclick) => {
    const b = $(id);
    b.append(icon(ic, 16));
    b.title = title;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', onclick);
  };
  iconBtn('btn-sidebar', 'PanelLeftClose', 'Ocultar barra lateral (Ctrl+Shift+B)', toggleSidebar);
  iconBtn('btn-find', 'Search', 'Localizar (Ctrl+F)', () => openFind());
  iconBtn('btn-more', 'Ellipsis', 'Menu (F10)', openMainMenu);
  $('crumb-dir').addEventListener('click', () => showSidebarTab('files'));
}

// ------------------------------------------------------------------ barra de ferramentas
const insertItems = () => [
  { label: 'Tabela', icon: 'Table', submenu: tableItems },
  { label: 'Bloco de código', icon: 'SquareCode', submenu: codeItems },
  { label: 'Imagem…', icon: 'Image', shortcut: 'Ctrl+Shift+I', action: imageDialog },
  { label: 'Linha horizontal', icon: 'Minus', shortcut: 'Ctrl+Shift+-', action: () => edit('hr') },
  { label: 'Nota de rodapé', icon: 'Footprints', action: () => edit('footnote') },
  { label: 'Fórmula', icon: 'Sigma', submenu: mathItems },
  { label: 'Diagrama', icon: 'Workflow', submenu: mermaidItems },
  { label: 'Alerta', icon: 'MessageSquareWarning', submenu: alertItems },
  { label: 'Emoji', icon: 'Smile', submenu: () => [{ custom: emojiGrid() }] },
  '-',
  ...moreItems(),
];

const TOOLBAR = [
  { menu: headingItems, icon: 'Heading', title: 'Títulos' },
  ['bold', 'Bold', 'Negrito (Ctrl+B)'],
  ['italic', 'Italic', 'Itálico (Ctrl+I)'],
  ['strike', 'Strikethrough', 'Tachado (Ctrl+Shift+X)'],
  ['code', 'Code', 'Código (Ctrl+`)'],
  '|',
  ['bullet', 'List', 'Lista (Ctrl+Shift+8)'],
  ['ordered', 'ListOrdered', 'Lista numerada (Ctrl+Shift+7)'],
  ['task', 'ListTodo', 'Tarefas (Ctrl+Shift+9)'],
  ['quote', 'TextQuote', 'Citação (Ctrl+Shift+Q)'],
  '|',
  [linkDialog, 'Link', 'Link (Ctrl+K)'],
  { menu: insertItems, icon: 'Plus', title: 'Inserir' },
];

function buildToolbar() {
  const tb = $('toolbar');
  for (const item of TOOLBAR) {
    if (item === '|') {
      tb.append(h('span', { class: 'tb-sep' }));
      continue;
    }
    if (item === 'spacer') {
      tb.append(h('span', { class: 'tb-spacer' }));
      continue;
    }
    if (Array.isArray(item)) {
      const [action, ic, title] = item;
      const btn = h('button', { class: 'tb-btn', type: 'button', title, 'aria-label': title }, icon(ic, 16));
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => (typeof action === 'function' ? action() : edit(action)));
      tb.append(btn);
      continue;
    }
    const btn = h('button', { class: 'tb-btn', type: 'button', title: item.title, 'aria-label': item.title }, icon(item.icon, 16));
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) return closeAllMenus();
      ensureEditable();
      btn.classList.add('active');
      showMenuAbove(item.menu(), btn, { onClose: () => btn.classList.remove('active') });
    });
    tb.append(btn);
  }
}

function buildModeSwitch() {
  const sw = $('mode-switch');
  const modes = [
    ['view', 'Eye', 'Somente leitura', 'Somente leitura (Ctrl+E alterna)'],
    ['live', 'PenLine', 'Editar na página', 'Editar na página — clique num bloco (Ctrl+E alterna)'],
    ['source', 'CodeXml', 'Markdown', 'Edição completa em Markdown (Ctrl+Shift+E · lado a lado: Ctrl+\\)'],
  ];
  for (const [mode, ic, label, title] of modes) {
    sw.append(
      h('button', { type: 'button', role: 'tab', dataset: { mode }, title, 'aria-label': label, onclick: () => {
        const target = mode === 'source' ? settings.lastEditMode || 'split' : mode;
        if (state.hasDoc) setMode(target);
        else (ensureEditable(), setMode(target));
      } }, icon(ic, 15)),
    );
  }
  $('btn-back').append(icon('ArrowLeft', 16));
  $('btn-back').addEventListener('click', goBack);
}

// ------------------------------------------------------------------ barra lateral
function toggleSidebar() {
  setSetting('sidebar', !settings.sidebar);
  if (settings.sidebar && settings.sidebarTab === 'files') refreshFiles();
}

function showSidebarTab(tab) {
  settings.sidebarTab = tab;
  if (!settings.sidebar) settings.sidebar = true;
  saveSettings();
  applyAppearance();
  for (const b of document.querySelectorAll('.sidebar-tabs button')) b.classList.toggle('active', b.dataset.tab === tab);
  $('outline').hidden = tab !== 'outline';
  $('files').hidden = tab !== 'files';
  if (tab === 'files') refreshFiles();
}

function buildSidebar() {
  const nav = (ic, label, onclick) => h('button', { type: 'button', class: 'nav-item', onclick }, icon(ic, 15), h('span', { text: label }));
  const menuOf = (name) => MENUS.find(([l]) => l === name)[2];
  document.querySelector('.side-nav').append(
    nav('FilePlus', 'Novo documento', newDocument),
    nav('FolderOpen', 'Abrir…', openDialog),
    nav('Files', 'Recentes', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      showMenu(recentItems(), { x: r.right + 4, y: r.top });
    }),
    nav('BookOpen', 'Guia de Markdown', openGuide),
  );
  document.querySelector('.sidebar-tabs').append(
    h('button', { type: 'button', dataset: { tab: 'outline' }, onclick: () => showSidebarTab('outline') }, 'Sumário'),
    h('button', { type: 'button', dataset: { tab: 'files' }, onclick: () => showSidebarTab('files') }, 'Arquivos'),
  );
  document.querySelector('.side-footer').append(
    nav('Settings', 'Configurações', (e) => showMenuAbove(menuOf('Exibir')(), e.currentTarget)),
    nav('Info', 'Ajuda', (e) => showMenuAbove(menuOf('Ajuda')(), e.currentTarget)),
  );
  showSidebarTab(settings.sidebarTab);
}

let outlineHeads = [];
let outlineSig = '';
function updateOutline(fromSource = null) {
  const heads = fromSource || preview.headings();
  outlineHeads = heads;
  const sig = heads.map((x) => `${x.level}|${x.text}|${x.line}`).join('\n');
  if (sig === outlineSig) return updateOutlineActive();
  outlineSig = sig;
  outlineActiveIdx = -1;
  const list = $('outline');
  list.replaceChildren();
  if (!heads.length) {
    list.append(h('div', { class: 'sidebar-empty', text: 'Nenhum título neste documento. Use # no início da linha para criar títulos.' }));
    return;
  }
  const min = Math.min(...heads.map((x) => x.level));
  heads.forEach((hd, i) =>
    list.append(
      h('button', { type: 'button', class: `outline-item lvl${hd.level}`, style: `--depth:${hd.level - min}`, title: hd.text, dataset: { index: i }, onclick: () => gotoHeading(i) }, hd.text || '(sem título)'),
    ),
  );
  updateOutlineActive();
}

function gotoHeading(i) {
  const hd = outlineHeads[i];
  if (!hd) return;
  if (state.mode !== 'edit') preview.scrollToId(hd.id);
  if (!pageMode() && hd.line != null) {
    ignoreEditorScrollUntil = performance.now() + 600;
    editor.revealLine(hd.line);
  }
}

// Chamado a cada evento de rolagem: agrupa por quadro e só mexe no DOM quando o título ativo muda.
let outlineActiveQueued = false;
let outlineActiveIdx = -1;
function updateOutlineActive() {
  if (outlineActiveQueued) return;
  outlineActiveQueued = true;
  requestAnimationFrame(() => {
    outlineActiveQueued = false;
    if (!outlineHeads.length || !state.hasDoc) return;
    const cur = state.mode === 'edit' ? editor.topLine() : preview.topLine();
    let idx = 0;
    if (cur === Infinity) idx = outlineHeads.length - 1;
    else outlineHeads.forEach((hd, i) => hd.line != null && hd.line <= cur + 1 && (idx = i));
    const items = $('outline').children;
    if (idx === outlineActiveIdx && items[idx]?.classList.contains('active')) return;
    items[outlineActiveIdx]?.classList.remove('active');
    items[idx]?.classList.add('active');
    items[idx]?.scrollIntoView({ block: 'nearest' });
    outlineActiveIdx = idx;
  });
}

async function refreshFiles() {
  const panel = $('files');
  if (panel.hidden) return;
  if (!state.filesDir) {
    panel.replaceChildren(h('div', { class: 'sidebar-empty', text: 'Abra ou salve um arquivo para navegar pelos documentos da pasta.' }));
    return;
  }
  const dir = state.filesDir;
  let entries = [];
  let error = null;
  try {
    entries = await bridge.listDir(dir);
  } catch (e) {
    error = String(e?.message || e);
  }
  if (dir !== state.filesDir) return;
  const parent = dirname(dir);
  const header = h(
    'div',
    { class: 'files-header' },
    h('button', { type: 'button', class: 'icon-btn', title: 'Pasta acima', disabled: !parent || parent === dir, onclick: () => ((state.filesDir = parent), refreshFiles()) }, icon('FolderUp', 15)),
    h('span', { class: 'files-dir', title: dir, text: basename(dir) || dir }),
    h('button', { type: 'button', class: 'icon-btn', title: 'Abrir no Explorador', onclick: () => bridge.reveal(state.path && dirname(state.path) === dir ? state.path : dir) }, icon('ExternalLink', 14)),
  );
  const list = h('div', { class: 'files-list' });
  if (error) list.append(h('div', { class: 'sidebar-empty', text: error }));
  else if (!entries.length) list.append(h('div', { class: 'sidebar-empty', text: 'Nenhum documento Markdown nesta pasta.' }));
  for (const e of entries) {
    const active = state.path && e.path.toLowerCase() === state.path.toLowerCase();
    const btn = h('button', { type: 'button', class: `file-item${e.isDir ? ' dir' : ''}${active ? ' active' : ''}`, title: e.path }, icon(e.isDir ? 'Folder' : 'FileText', 15), h('span', { text: e.name }));
    btn.addEventListener('click', (ev) => {
      if (e.isDir) {
        state.filesDir = e.path;
        refreshFiles();
      } else openFile(e.path, { newWindow: ev.ctrlKey });
    });
    btn.addEventListener('auxclick', (ev) => ev.button === 1 && !e.isDir && openFile(e.path, { newWindow: true }));
    btn.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      showMenu(
        e.isDir
          ? [{ label: 'Abrir pasta', icon: 'Folder', action: () => ((state.filesDir = e.path), refreshFiles()) }, { label: 'Mostrar no Explorador', icon: 'ExternalLink', action: () => bridge.reveal(e.path) }]
          : [
              { label: 'Abrir', icon: 'FileText', action: () => openFile(e.path) },
              { label: 'Abrir em nova janela', icon: 'AppWindow', action: () => openFile(e.path, { newWindow: true }) },
              { label: 'Editar em nova janela', icon: 'PenLine', action: () => openFile(e.path, { newWindow: true, mode: 'split' }) },
              '-',
              { label: 'Mostrar no Explorador', icon: 'ExternalLink', action: () => bridge.reveal(e.path) },
              { label: 'Copiar caminho', icon: 'Copy', action: () => copyText(e.path) },
            ],
        { x: ev.clientX, y: ev.clientY },
      );
    });
    list.append(btn);
  }
  panel.replaceChildren(header, list);
}

// ------------------------------------------------------------------ redimensionamento
function setupResizer(el, onMove) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
    const move = (ev) => onMove(ev);
    const up = () => {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
      saveSettings();
      editor.requestMeasure();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  });
}

function setupResizers() {
  setupResizer($('sidebar-resizer'), (ev) => {
    const left = $('app').getBoundingClientRect().left;
    settings.sidebarWidth = Math.round(Math.min(520, Math.max(170, ev.clientX - left)));
    document.documentElement.style.setProperty('--sidebar-w', `${settings.sidebarWidth}px`);
  });
  setupResizer($('split-resizer'), (ev) => {
    const a = $('editor-pane').getBoundingClientRect();
    const b = $('preview-pane').getBoundingClientRect();
    const ratio = Math.min(0.8, Math.max(0.2, (ev.clientX - a.left) / (a.width + b.width)));
    settings.splitRatio = ratio;
    document.documentElement.style.setProperty('--split-a', ratio);
    document.documentElement.style.setProperty('--split-b', 1 - ratio);
  });
  $('split-resizer').addEventListener('dblclick', () => {
    settings.splitRatio = 0.5;
    saveSettings();
    applyAppearance();
  });
}

// ------------------------------------------------------------------ visualização: cliques e menu
function toggleTask(checkbox) {
  const li = checkbox.closest('li[data-line]');
  if (!li) return;
  const n = +li.dataset.line + 1;
  const doc = editor.view.state.doc;
  if (n > doc.lines) return;
  const line = doc.line(n);
  const m = line.text.match(/^((?:\s*>)*\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/);
  if (!m) return;
  const pos = line.from + m[1].length + 1;
  editor.view.dispatch({ changes: { from: pos, to: pos + 1, insert: m[2] === ' ' ? 'x' : ' ' }, userEvent: 'input.toggle' });
}

async function followLink(href, { newWindow = false } = {}) {
  if (href.startsWith('#')) {
    let id = href.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      /* mantém */
    }
    if (!preview.scrollToId(id)) toast('Seção não encontrada neste documento');
    return;
  }
  if (/^(https?:|mailto:|tel:|ftp:)/i.test(href)) {
    bridge.openExternal(href).catch((e) => toast(String(e?.message || e), 'error'));
    return;
  }
  const base = state.path ? dirname(state.path) : null;
  const local = resolveLocal(href, base);
  if (!local) {
    toast(!base && !isAbsolute(href) ? 'Salve o documento para abrir links relativos' : `Link não suportado: ${href}`);
    return;
  }
  let anchor = null;
  const hashAt = href.indexOf('#');
  if (hashAt >= 0) {
    try {
      anchor = decodeURIComponent(href.slice(hashAt + 1));
    } catch {
      anchor = href.slice(hashAt + 1);
    }
  }
  if (!(await bridge.exists(local))) {
    toast(`Arquivo não encontrado: ${basename(local)}`, 'error');
    return;
  }
  if (MARKDOWN_EXTENSIONS.includes(extname(local))) {
    await openFile(local, { newWindow, anchor });
    return;
  }
  bridge.openExternal(local).catch((e) => alertDialog('Não foi possível abrir', String(e?.message || e)));
}

function selectAll() {
  if (pageMode() || !state.hasDoc) {
    const range = document.createRange();
    range.selectNodeContents($('preview'));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    editor.focus();
    editor.view.dispatch({ selection: { anchor: 0, head: editor.view.state.doc.length } });
  }
}

function editAtLine(line) {
  if (pageMode()) setMode(settings.lastEditMode || 'split', { sync: false });
  requestAnimationFrame(() => editor.revealLine(line));
}

function setupPreviewEvents() {
  const pane = $('preview-pane');
  const root = $('preview');
  pane.addEventListener('scroll', onPreviewScroll, { passive: true });
  pane.addEventListener('click', (e) => {
    if (e.target === pane && state.mode === 'live') live.handleClick(e);
  });
  root.addEventListener('click', (e) => {
    if (live.handleClick(e)) return;
    const copyBtn = e.target.closest('.code-copy');
    if (copyBtn) {
      const code = copyBtn.closest('.code-block')?.querySelector('code');
      copyText(code?.innerText || '');
      copyBtn.textContent = 'Copiado!';
      setTimeout(() => (copyBtn.textContent = 'Copiar'), 1500);
      return;
    }
    const cb = e.target.closest('input.task-list-item-checkbox');
    if (cb) {
      e.preventDefault();
      toggleTask(cb);
      return;
    }
    const a = e.target.closest('a[href]');
    if (a) {
      e.preventDefault();
      followLink(a.getAttribute('href'), { newWindow: e.ctrlKey || e.shiftKey });
    }
  });
  root.addEventListener('auxclick', (e) => {
    const a = e.target.closest('a[href]');
    if (a && e.button === 1) {
      e.preventDefault();
      followLink(a.getAttribute('href'), { newWindow: true });
    }
  });
  root.addEventListener('toggle', (e) => {
    if (e.target.tagName === 'DETAILS') e.target.dataset.userToggled = '1';
  }, true);
  root.addEventListener('dblclick', (e) => {
    if (!e.ctrlKey) return;
    const line = preview.lineOf(e.target);
    if (line != null) editAtLine(line);
  });
  pane.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.live-input')) return;
    e.preventDefault();
    if (!state.hasDoc) return;
    const sel = window.getSelection().toString();
    const a = e.target.closest('a[href]');
    const img = e.target.closest('img');
    const code = e.target.closest('.code-block');
    const line = preview.lineOf(e.target);
    const items = [];
    if (sel) items.push({ label: 'Copiar', icon: 'Copy', shortcut: 'Ctrl+C', action: () => copyText(sel) });
    items.push({ label: 'Selecionar tudo', shortcut: 'Ctrl+A', action: selectAll });
    if (a) {
      const href = a.getAttribute('href');
      items.push('-', { label: 'Abrir link', icon: 'ExternalLink', action: () => followLink(href) });
      if (!/^(https?:|mailto:|#)/i.test(href)) items.push({ label: 'Abrir em nova janela', icon: 'AppWindow', action: () => followLink(href, { newWindow: true }) });
      items.push({ label: 'Copiar endereço do link', icon: 'Link', action: () => copyText(href) });
    }
    if (img) items.push('-', { label: 'Copiar endereço da imagem', icon: 'Image', action: () => copyText(img.dataset.src || img.getAttribute('src')) });
    if (code) items.push('-', { label: 'Copiar código', icon: 'Copy', action: () => copyText(code.querySelector('code')?.innerText) });
    if (line != null) items.push('-', { label: 'Editar este trecho', icon: 'PenLine', shortcut: 'Ctrl+duplo clique', action: () => editAtLine(line) });
    items.push('-', { label: 'Localizar…', icon: 'Search', shortcut: 'Ctrl+F', action: openFind }, { label: 'Imprimir / PDF…', icon: 'Printer', shortcut: 'Ctrl+P', action: printDoc });
    showMenu(items, { x: e.clientX, y: e.clientY });
  });
}

// ------------------------------------------------------------------ localizar (visualização)
function buildFindbar() {
  const bar = $('findbar');
  const input = h('input', { type: 'text', placeholder: 'Localizar no documento', spellcheck: 'false', 'aria-label': 'Localizar' });
  const count = h('span', { class: 'find-count' });
  const caseBtn = h('button', { type: 'button', class: 'icon-btn find-case', title: 'Diferenciar maiúsculas e minúsculas', text: 'Aa' });
  let caseSensitive = false;
  const run = () => {
    const n = finder.search(input.value, { caseSensitive });
    count.textContent = input.value ? (n ? `${finder.index + 1} de ${n}` : 'Nenhum resultado') : '';
    bar.classList.toggle('no-results', !!input.value && !n);
  };
  const upd = () => (count.textContent = finder.ranges.length ? `${finder.index + 1} de ${finder.ranges.length}` : count.textContent);
  const debounced = debounce(run, 120);
  input.addEventListener('input', debounced);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!finder.ranges.length) run();
      else {
        e.shiftKey ? finder.prev() : finder.next();
        upd();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeFind();
    }
  });
  caseBtn.addEventListener('click', () => {
    caseSensitive = !caseSensitive;
    caseBtn.classList.toggle('active', caseSensitive);
    run();
  });
  bar.append(
    icon('Search', 15),
    input,
    count,
    caseBtn,
    h('button', { type: 'button', class: 'icon-btn', title: 'Anterior (Shift+Enter)', onclick: () => (finder.prev(), upd()) }, icon('ArrowUp', 15)),
    h('button', { type: 'button', class: 'icon-btn flip', title: 'Próximo (Enter)', onclick: () => (finder.next(), upd()) }, icon('ArrowUp', 15)),
    h('button', { type: 'button', class: 'icon-btn', title: 'Fechar (Esc)', onclick: closeFind }, icon('X', 15)),
  );
  bar._input = input;
  bar._run = run;
}

function openFind() {
  if (!state.hasDoc) return;
  if (!pageMode()) {
    commands.find(editor.view);
    return;
  }
  const bar = $('findbar');
  bar.hidden = false;
  const sel = window.getSelection().toString().trim();
  if (sel && !sel.includes('\n')) bar._input.value = sel;
  bar._input.focus();
  bar._input.select();
  if (bar._input.value) bar._run();
}

function closeFind() {
  const bar = $('findbar');
  if (bar.hidden) return;
  bar.hidden = true;
  finder?.clear();
  $('preview-pane').focus({ preventScroll: true });
}

// ------------------------------------------------------------------ teclado
async function toggleFullscreen() {
  const fs = await bridge.window.isFullscreen();
  await bridge.window.setFullscreen(!fs);
}

const GLOBAL_KEYS = {
  'Ctrl+N': newDocument,
  'Ctrl+Shift+N': () => bridge.openWindow(),
  'Ctrl+O': openDialog,
  'Ctrl+S': () => save(),
  'Ctrl+Shift+S': () => save({ as: true }),
  'Ctrl+W': () => bridge.window.close(),
  'Ctrl+P': printDoc,
  'Ctrl+E': toggleEditView,
  'Ctrl+\\': () => (ensureEditable(), setMode('split')),
  'Ctrl+Shift+E': () => (ensureEditable(), setMode('edit')),
  'Ctrl+Shift+R': () => (ensureDoc(), setMode('view')),
  'Ctrl+Shift+B': toggleSidebar,
  F11: toggleFullscreen,
  'Ctrl+=': () => setZoom(settings.zoom + 0.1),
  'Ctrl++': () => setZoom(settings.zoom + 0.1),
  'Ctrl+Shift++': () => setZoom(settings.zoom + 0.1),
  'Ctrl+-': () => setZoom(settings.zoom - 0.1),
  'Ctrl+0': () => setZoom(1),
  F5: () => reloadFromDisk(),
  'Ctrl+R': () => reloadFromDisk(),
  'Ctrl+U': () => !pageMode() && state.hasDoc && edit('underline'),
  'Ctrl+J': () => {},
  F1: openGuide,
  'Ctrl+/': shortcutsDialog,
  'Alt+ArrowLeft': goBack,
  'Ctrl+F': openFind,
};


function comboOf(e) {
  let k = e.key;
  if (k.length === 1) k = k.toUpperCase();
  return `${e.ctrlKey || e.metaKey ? 'Ctrl+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.altKey ? 'Alt+' : ''}${k}`;
}

function setupKeyboard() {
  window.addEventListener(
    'keydown',
    (e) => {
      if (isModalOpen()) return;
      if (e.key === 'Escape') {
        if (isMenuOpen()) {
          e.preventDefault();
          closeAllMenus();
        }
        return;
      }
      if (e.key === 'F10') {
        e.preventDefault();
        openMainMenu();
        return;
      }
      const combo = comboOf(e);
      const inEditor = !!e.target.closest?.('.cm-editor');
      // Dentro do editor, Ctrl+F abre a busca do próprio editor.
      if (combo === 'Ctrl+F' && inEditor) return;
      if (combo === 'Ctrl+A' && pageMode() && !e.target.closest?.('input, textarea')) {
        e.preventDefault();
        selectAll();
        return;
      }
      const fn = GLOBAL_KEYS[combo];
      if (fn) {
        e.preventDefault();
        e.stopPropagation();
        fn();
      }
    },
    true,
  );
  window.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(settings.zoom + (e.deltaY < 0 ? 0.1 : -0.1));
    },
    { passive: false },
  );
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('.cm-content, input, textarea')) e.preventDefault();
  });
}

// ------------------------------------------------------------------ arrastar e soltar
function setupDragDrop() {
  const overlay = $('drop-overlay');
  bridge.window.onDragDrop((event) => {
    const p = event.payload;
    if (p.type === 'enter') {
      const paths = p.paths || [];
      const hasMd = paths.some((x) => MARKDOWN_EXTENSIONS.includes(extname(x)) || extname(x) === 'txt');
      const hasImg = paths.some((x) => IMAGE_EXTENSIONS.includes(extname(x)));
      overlay.querySelector('span').textContent = hasMd ? 'Solte para abrir o documento' : hasImg ? 'Solte para inserir a imagem' : 'Solte o arquivo aqui';
      overlay.classList.add('show');
    } else if (p.type === 'leave') {
      overlay.classList.remove('show');
    } else if (p.type === 'drop') {
      overlay.classList.remove('show');
      handleDrop(p.paths || []);
    }
  });
  // No navegador (modo de desenvolvimento) evita abrir o arquivo como página.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
}

// ------------------------------------------------------------------ barra de status
const encodingItems = () =>
  ENCODINGS.map((enc) => ({
    label: enc.label,
    checked: enc.label === encodingLabel(),
    action: () => {
      state.encoding = enc.id;
      state.bom = enc.bom;
      state.metaDirty = true;
      onDocChange();
      updateStats(editor.getValue());
    },
  }));

const eolItems = () =>
  [['lf', 'LF (padrão moderno)'], ['crlf', 'CRLF (Windows)']].map(([id, label]) => ({
    label,
    checked: state.eol === id,
    action: () => {
      if (state.eol === id) return;
      state.eol = id;
      state.metaDirty = true;
      onDocChange();
      updateStats(editor.getValue());
    },
  }));

// ------------------------------------------------------------------ tela inicial
function actionButton(ic, label, shortcut, onclick) {
  return h('button', { type: 'button', class: 'welcome-action', onclick }, icon(ic, 16), h('span', { class: 'wa-label', text: label }), h('kbd', { text: shortcut }));
}

async function refreshAssocCard() {
  const card = $('welcome-assoc');
  if (!card) return;
  if (!isTauri) {
    card.replaceChildren();
    return;
  }
  const st = await bridge.assocStatus().catch(() => null);
  if (!st) return;
  card.replaceChildren(
    st.isDefault
      ? h('div', { class: 'assoc-card ok' }, icon('CircleCheck', 18), h('span', { text: 'Arquivos .md abrem no MDEditor com dois cliques.' }))
      : h(
          'div',
          { class: 'assoc-card' },
          icon('Info', 18),
          h('span', { text: 'Abra todos os arquivos .md com dois cliques no MDEditor.' }),
          h('button', { type: 'button', class: 'btn small primary', text: 'Definir como padrão', onclick: makeDefault }),
        ),
  );
}

function showWelcome() {
  state.hasDoc = false;
  state.mode = null;
  document.body.classList.add('no-doc');
  document.body.dataset.mode = 'none';
  const recent = recentFiles().slice(0, 8);
  $('welcome').replaceChildren(
    h(
      'div',
      { class: 'welcome-inner' },
      h('h1', { text: 'MDEditor' }),
      h('p', { class: 'welcome-sub', text: 'Visualize e edite documentos Markdown.' }),
      h(
        'div',
        { class: 'welcome-actions' },
        actionButton('FolderOpen', 'Abrir arquivo…', 'Ctrl+O', openDialog),
        actionButton('FilePlus', 'Novo documento', 'Ctrl+N', newDocument),
        actionButton('BookOpen', 'Guia de Markdown', 'F1', openGuide),
      ),
      recent.length
        ? h(
            'div',
            { class: 'welcome-recent' },
            h('h3', { text: 'Recentes' }),
            ...recent.map((p) =>
              h('button', { type: 'button', class: 'recent-item', title: p, onclick: () => openFile(p) }, icon('FileText', 16), h('span', { class: 'ri-name', text: basename(p) }), h('span', { class: 'ri-dir', text: dirname(p) })),
            ),
          )
        : null,
      h('div', { id: 'welcome-assoc' }),
      h('p', { class: 'welcome-hint', text: 'Dica: arraste arquivos .md para esta janela para abri-los.' }),
    ),
  );
  updateTitle();
  updateStatus();
  refreshAssocCard();
}

// ------------------------------------------------------------------ fechamento da janela
function setupCloseHandler() {
  bridge.window.onCloseRequested(async (event) => {
    live?.finish();
    if (!state.dirty) return;
    event.preventDefault();
    if (await confirmDiscard()) {
      state.dirty = false;
      await bridge.window.destroy();
    }
  });
}

// ------------------------------------------------------------------ inicialização
async function init() {
  applyTheme();
  await setIconPack(settings.iconPack);
  buildTopbar();
  buildModeSwitch();
  buildToolbar();
  buildFindbar();

  editor = createEditor($('editor'), {
    options: { lineNumbers: settings.lineNumbers, wrap: settings.wrap, spellcheck: settings.spellcheck },
    onChange: onDocChange,
    onSelection: updateCursor,
    onScroll: onEditorScroll,
    onPasteImages: pasteImages,
    actions: { link: linkDialog, image: imageDialog, table: tableDialog },
  });
  preview = new Preview($('preview'), $('preview-pane'), {
    toAssetUrl: bridge.toAssetUrl,
    getBaseDir: () => (state.path ? dirname(state.path) : null),
    getTheme: resolvedTheme,
  });
  onAssetsLoaded(() => state.hasDoc && !pageModeLocked() && renderNow());
  preview.onRendered = () => state.mode === 'split' && settings.syncScroll && syncPreviewToEditor();
  finder = new PreviewFind($('preview'), $('preview-pane'));
  live = new LiveEdit({
    root: $('preview'),
    pane: $('preview-pane'),
    preview,
    getView: () => editor.view,
    isOn: () => state.mode === 'live',
    render: () => renderNow(),
    openSource: (line) => editAtLine(line),
  });

  applyAppearance();
  buildSidebar();
  setupResizers();
  setupPreviewEvents();
  setupKeyboard();
  setupDragDrop();
  setupCloseHandler();
  setInterval(checkExternal, 2000);
  window.addEventListener('focus', () => {
    checkExternal();
    if (!state.hasDoc) refreshAssocCard();
  });

  let info = {};
  try {
    info = await bridge.launchInfo();
  } catch {
    /* sem informação */
  }
  let session = null;
  try {
    session = JSON.parse(sessionStorage.getItem('mdeditor.doc') || 'null');
  } catch {
    /* ignora */
  }
  const path = session?.path ?? info.path;
  if (path === GUIDE) loadDocument({ content: guideText, name: GUIDE_NAME }, 'view');
  else if (path) {
    if (!(await openFile(path, { mode: info.mode || null }))) showWelcome();
  } else showWelcome();

  await bridge.window.show();
}

init().catch((e) => {
  console.error(e);
  bridge.window.show();
  alertDialog('Erro ao iniciar', String(e?.stack || e));
});
