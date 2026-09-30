// Gera src/icons/<pacote>.js contendo apenas os ícones usados pelo app.
// Uso: node scripts/gen-icons.mjs
import fs from 'node:fs';
import path from 'node:path';

const NM = path.resolve('node_modules');
const OUT = path.resolve('src/icons');
fs.mkdirSync(OUT, { recursive: true });

function indexDir(dir, strip = (n) => n) {
  const map = new Map();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.svg')) map.set(strip(e.name.slice(0, -4)), p);
    }
  };
  walk(dir);
  return map;
}

// Nome interno → candidatos em cada biblioteca (o primeiro existente vence).
const MAP = {
  Undo2: { ph: ['arrow-counter-clockwise'], tb: ['arrow-back-up'], he: ['arrow-uturn-left'], io: ['undo'], rx: ['arrow-go-back-line'], fl: ['arrow_undo'] },
  Redo2: { ph: ['arrow-clockwise'], tb: ['arrow-forward-up'], he: ['arrow-uturn-right'], io: ['redo'], rx: ['arrow-go-forward-line'], fl: ['arrow_redo'] },
  Heading: { ph: ['text-h'], tb: ['heading'], he: ['h1'], io: ['text-size', 'text'], rx: ['heading'], fl: ['text_header_1', 'text_header_2'] },
  Bold: { ph: ['text-b'], tb: ['bold'], he: ['bold'], io: ['bold'], rx: ['bold'], fl: ['text_bold'] },
  Italic: { ph: ['text-italic'], tb: ['italic'], he: ['italic'], io: ['italic'], rx: ['italic'], fl: ['text_italic'] },
  Strikethrough: { ph: ['text-strikethrough'], tb: ['strikethrough'], he: ['strikethrough'], io: ['strikethrough'], rx: ['strikethrough'], fl: ['text_strikethrough'] },
  Underline: { ph: ['text-underline'], tb: ['underline'], he: ['underline'], io: ['underline'], rx: ['underline'], fl: ['text_underline'] },
  Highlighter: { ph: ['highlighter-circle', 'highlighter', 'marker-circle'], tb: ['highlight'], he: ['paint-brush'], io: ['highlighter'], rx: ['mark-pen-line'], fl: ['highlight'] },
  Code: { ph: ['code-simple', 'code'], tb: ['code'], he: ['code-bracket'], io: ['code'], rx: ['code-line'], fl: ['code'] },
  Code2: { ph: ['code'], tb: ['code'], he: ['code-bracket'], io: ['code'], rx: ['code-s-slash-line'], fl: ['code'] },
  CodeXml: { ph: ['code'], tb: ['code'], he: ['code-bracket'], io: ['code'], rx: ['code-s-slash-line'], fl: ['code'] },
  List: { ph: ['list-bullets'], tb: ['list'], he: ['list-bullet'], io: ['list'], rx: ['list-unordered'], fl: ['text_bullet_list_ltr', 'text_bullet_list'] },
  ListOrdered: { ph: ['list-numbers'], tb: ['list-numbers'], he: ['numbered-list'], io: ['numbered-list-left'], rx: ['list-ordered', 'list-ordered-2'], fl: ['text_number_list_ltr'] },
  ListTodo: { ph: ['list-checks'], tb: ['list-check'], he: ['check-badge', 'clipboard-document-check'], io: ['task-list'], rx: ['list-check-2', 'list-check'], fl: ['task_list_ltr', 'task_list_square_ltr', 'checkbox_checked'] },
  TextQuote: { ph: ['quotes'], tb: ['quote'], he: ['chat-bubble-left-ellipsis'], io: ['quote', 'quote-message'], rx: ['double-quotes-l'], fl: ['text_quote'] },
  Link: { ph: ['link-simple', 'link'], tb: ['link'], he: ['link'], io: ['link'], rx: ['link'], fl: ['link'] },
  Image: { ph: ['image'], tb: ['photo'], he: ['photo'], io: ['media-image'], rx: ['image-line'], fl: ['image'] },
  Table: { ph: ['table'], tb: ['table'], he: ['table-cells'], io: ['table', 'table-2-columns'], rx: ['table-line', 'table-2'], fl: ['table'] },
  SquareCode: { ph: ['code-block'], tb: ['source-code'], he: ['code-bracket-square'], io: ['code-brackets-square'], rx: ['code-box-line'], fl: ['code_block'] },
  Minus: { ph: ['minus'], tb: ['minus'], he: ['minus'], io: ['minus'], rx: ['subtract-line'], fl: ['subtract'] },
  Sigma: { ph: ['sigma', 'function'], tb: ['sum', 'math-function'], he: ['variable'], io: ['sigma-function', 'math-book'], rx: ['functions'], fl: ['math_formula'] },
  Workflow: { ph: ['flow-arrow', 'tree-structure'], tb: ['sitemap', 'topology-star'], he: ['share'], io: ['git-fork', 'network'], rx: ['flow-chart'], fl: ['flowchart'] },
  MessageSquareWarning: { ph: ['warning-circle'], tb: ['message-report', 'alert-square'], he: ['chat-bubble-bottom-center-text'], io: ['chat-bubble-warning', 'warning-square'], rx: ['feedback-line', 'alert-line'], fl: ['chat_warning', 'warning'] },
  Footprints: { ph: ['footprints'], tb: ['shoe', 'notes'], he: ['document-text'], io: ['footprints', 'page'], rx: ['footprint-line', 'file-list-3-line'], fl: ['text_footnote', 'note'] },
  Smile: { ph: ['smiley'], tb: ['mood-smile'], he: ['face-smile'], io: ['emoji'], rx: ['emotion-happy-line'], fl: ['emoji'] },
  Ellipsis: { ph: ['dots-three'], tb: ['dots'], he: ['ellipsis-horizontal'], io: ['more-horiz'], rx: ['more-line'], fl: ['more_horizontal'] },
  Search: { ph: ['magnifying-glass'], tb: ['search'], he: ['magnifying-glass'], io: ['search'], rx: ['search-line'], fl: ['search'] },
  Eye: { ph: ['eye'], tb: ['eye'], he: ['eye'], io: ['eye'], rx: ['eye-line'], fl: ['eye'] },
  Columns2: { ph: ['columns'], tb: ['columns-2', 'columns'], he: ['view-columns'], io: ['view-columns-2'], rx: ['layout-column-line'], fl: ['split_vertical', 'column_double'] },
  PenLine: { ph: ['pencil-simple-line', 'pencil-simple'], tb: ['pencil'], he: ['pencil'], io: ['edit-pencil'], rx: ['pencil-line'], fl: ['edit'] },
  FileText: { ph: ['file-text'], tb: ['file-text'], he: ['document-text'], io: ['page'], rx: ['file-text-line'], fl: ['document_text'] },
  FolderOpen: { ph: ['folder-open'], tb: ['folder-open'], he: ['folder-open'], io: ['folder'], rx: ['folder-open-line'], fl: ['folder_open'] },
  Save: { ph: ['floppy-disk'], tb: ['device-floppy'], he: ['arrow-down-on-square'], io: ['floppy-disk'], rx: ['save-line'], fl: ['save'] },
  PanelLeft: { ph: ['sidebar-simple', 'sidebar'], tb: ['layout-sidebar'], he: ['bars-3'], io: ['sidebar-collapse'], rx: ['layout-left-line'], fl: ['panel_left'] },
  // Variantes de estado da barra lateral (só nas bibliotecas que têm as duas).
  PanelLeftClose: { tb: ['layout-sidebar-left-collapse'], io: ['sidebar-collapse'], rx: ['sidebar-fold-line'], fl: ['panel_left_contract'] },
  PanelLeftOpen: { tb: ['layout-sidebar-left-expand'], io: ['sidebar-expand'], rx: ['sidebar-unfold-line'], fl: ['panel_left_expand'] },
  Sun: { ph: ['sun'], tb: ['sun'], he: ['sun'], io: ['sun-light'], rx: ['sun-line'], fl: ['weather_sunny'] },
  Moon: { ph: ['moon'], tb: ['moon'], he: ['moon'], io: ['half-moon'], rx: ['moon-line'], fl: ['weather_moon'] },
  Monitor: { ph: ['monitor'], tb: ['device-desktop'], he: ['computer-desktop'], io: ['computer'], rx: ['computer-line'], fl: ['desktop'] },
  Printer: { ph: ['printer'], tb: ['printer'], he: ['printer'], io: ['printer'], rx: ['printer-line'], fl: ['print'] },
  FileDown: { ph: ['file-arrow-down'], tb: ['file-download'], he: ['arrow-down-tray'], io: ['download'], rx: ['file-download-line'], fl: ['arrow_download'] },
  Copy: { ph: ['copy'], tb: ['copy'], he: ['document-duplicate'], io: ['copy'], rx: ['file-copy-line'], fl: ['copy'] },
  Check: { ph: ['check'], tb: ['check'], he: ['check'], io: ['check'], rx: ['check-line'], fl: ['checkmark'] },
  X: { ph: ['x'], tb: ['x'], he: ['x-mark'], io: ['xmark'], rx: ['close-line'], fl: ['dismiss'] },
  ChevronRight: { ph: ['caret-right'], tb: ['chevron-right'], he: ['chevron-right'], io: ['nav-arrow-right'], rx: ['arrow-right-s-line'], fl: ['chevron_right'] },
  ChevronDown: { ph: ['caret-down'], tb: ['chevron-down'], he: ['chevron-down'], io: ['nav-arrow-down'], rx: ['arrow-down-s-line'], fl: ['chevron_down'] },
  ChevronsDownUp: { ph: ['arrows-in-line-vertical', 'caret-up-down'], tb: ['fold', 'arrows-vertical'], he: ['chevron-up-down'], io: ['collapse'], rx: ['contract-up-down-line'], fl: ['arrow_collapse_all', 'chevron_up_down'] },
  Folder: { ph: ['folder'], tb: ['folder'], he: ['folder'], io: ['folder'], rx: ['folder-line'], fl: ['folder'] },
  FolderUp: { ph: ['folder-simple-dashed', 'arrow-bend-left-up'], tb: ['folder-up'], he: ['folder-arrow-down'], io: ['folder'], rx: ['folder-upload-line'], fl: ['folder_arrow_up'] },
  File: { ph: ['file'], tb: ['file'], he: ['document'], io: ['empty-page'], rx: ['file-line'], fl: ['document'] },
  Files: { ph: ['files'], tb: ['files'], he: ['document-duplicate'], io: ['multiple-pages'], rx: ['file-copy-2-line'], fl: ['document_multiple'] },
  FilePlus: { ph: ['file-plus'], tb: ['file-plus'], he: ['document-plus'], io: ['page-plus'], rx: ['file-add-line'], fl: ['document_add'] },
  FileTextAlt: {},
  ArrowUp: { ph: ['arrow-up'], tb: ['arrow-up'], he: ['arrow-up'], io: ['arrow-up'], rx: ['arrow-up-line'], fl: ['arrow_up'] },
  ArrowDown: { ph: ['arrow-down'], tb: ['arrow-down'], he: ['arrow-down'], io: ['arrow-down'], rx: ['arrow-down-line'], fl: ['arrow_down'] },
  ArrowLeft: { ph: ['arrow-left'], tb: ['arrow-left'], he: ['arrow-left'], io: ['arrow-left'], rx: ['arrow-left-line'], fl: ['arrow_left'] },
  ListTree: { ph: ['tree-view', 'list-dashes'], tb: ['list-tree'], he: ['queue-list'], io: ['list'], rx: ['node-tree'], fl: ['text_bullet_list_tree'] },
  Superscript: { ph: ['text-superscript'], tb: ['superscript'], he: ['arrow-up-right'], io: ['superscript'], rx: ['superscript'], fl: ['text_superscript'] },
  Subscript: { ph: ['text-subscript'], tb: ['subscript'], he: ['arrow-down-right'], io: ['subscript'], rx: ['subscript'], fl: ['text_subscript'] },
  Keyboard: { ph: ['keyboard'], tb: ['keyboard'], he: ['command-line'], io: ['keyboard'], rx: ['keyboard-line'], fl: ['keyboard'] },
  IndentIncrease: { ph: ['text-indent'], tb: ['indent-increase'], he: ['bars-arrow-down'], io: ['indent-increase', 'align-right'], rx: ['indent-increase'], fl: ['text_indent_increase_ltr', 'text_indent_increase'] },
  IndentDecrease: { ph: ['text-outdent'], tb: ['indent-decrease'], he: ['bars-arrow-up'], io: ['indent-decrease', 'align-left'], rx: ['indent-decrease'], fl: ['text_indent_decrease_ltr', 'text_indent_decrease'] },
  RemoveFormatting: { ph: ['eraser'], tb: ['clear-formatting'], he: ['backspace'], io: ['erase'], rx: ['format-clear'], fl: ['text_clear_formatting'] },
  CalendarClock: { ph: ['calendar-dots', 'calendar-blank', 'calendar'], tb: ['calendar-time'], he: ['calendar-days'], io: ['calendar'], rx: ['calendar-line'], fl: ['calendar_clock'] },
  BookOpen: { ph: ['book-open'], tb: ['book-2', 'book'], he: ['book-open'], io: ['open-book'], rx: ['book-open-line'], fl: ['book_open'] },
  BookOpenText: { ph: ['book-open-text'], tb: ['book'], he: ['book-open'], io: ['open-book'], rx: ['book-read-line'], fl: ['book_open'] },
  BookA: { ph: ['book-bookmark'], tb: ['vocabulary', 'book'], he: ['book-open'], io: ['book'], rx: ['book-2-line'], fl: ['book_letter', 'book'] },
  Settings: { ph: ['gear-six', 'gear'], tb: ['settings'], he: ['cog-6-tooth'], io: ['settings'], rx: ['settings-3-line'], fl: ['settings'] },
  RefreshCw: { ph: ['arrows-clockwise'], tb: ['refresh'], he: ['arrow-path'], io: ['refresh-double', 'refresh'], rx: ['refresh-line'], fl: ['arrow_sync'] },
  ExternalLink: { ph: ['arrow-square-out'], tb: ['external-link'], he: ['arrow-top-right-on-square'], io: ['open-new-window'], rx: ['external-link-line'], fl: ['open'] },
  Plus: { ph: ['plus'], tb: ['plus'], he: ['plus'], io: ['plus'], rx: ['add-line'], fl: ['add'] },
  TriangleAlert: { ph: ['warning'], tb: ['alert-triangle'], he: ['exclamation-triangle'], io: ['warning-triangle'], rx: ['error-warning-line', 'alert-line'], fl: ['warning'] },
  Info: { ph: ['info'], tb: ['info-circle'], he: ['information-circle'], io: ['info-circle'], rx: ['information-line'], fl: ['info'] },
  Lightbulb: { ph: ['lightbulb'], tb: ['bulb'], he: ['light-bulb'], io: ['light-bulb'], rx: ['lightbulb-line'], fl: ['lightbulb'] },
  CircleAlert: { ph: ['warning-circle'], tb: ['alert-circle'], he: ['exclamation-circle'], io: ['warning-circle'], rx: ['error-warning-line'], fl: ['error_circle'] },
  OctagonAlert: { ph: ['warning-octagon'], tb: ['alert-octagon'], he: ['shield-exclamation'], io: ['warning-hexagon'], rx: ['spam-2-line', 'spam-line'], fl: ['warning_shield', 'shield_error', 'error_circle'] },
  Hash: { ph: ['hash'], tb: ['hash'], he: ['hashtag'], io: ['hashtag'], rx: ['hashtag'], fl: ['number_symbol'] },
  Pilcrow: { ph: ['paragraph'], tb: ['pilcrow'], he: ['bars-3-bottom-left'], io: ['text'], rx: ['paragraph'], fl: ['text_paragraph', 'text_t'] },
  Maximize: { ph: ['arrows-out'], tb: ['maximize'], he: ['arrows-pointing-out'], io: ['expand'], rx: ['fullscreen-line'], fl: ['full_screen_maximize'] },
  WrapText: { ph: ['arrow-u-down-left'], tb: ['text-wrap'], he: ['arrow-uturn-down'], io: ['long-arrow-down-left'], rx: ['text-wrap'], fl: ['text_wrap'] },
  Type: { ph: ['text-t', 'text-aa'], tb: ['typography'], he: ['language'], io: ['text'], rx: ['text'], fl: ['text_font', 'text_t'] },
  Baseline: { ph: ['text-a-underline'], tb: ['baseline'], he: ['language'], io: ['text'], rx: ['font-color'], fl: ['text_color'] },
  CircleCheck: { ph: ['check-circle'], tb: ['circle-check'], he: ['check-circle'], io: ['check-circle'], rx: ['checkbox-circle-line'], fl: ['checkmark_circle'] },
  AppWindow: { ph: ['app-window'], tb: ['app-window'], he: ['window'], io: ['app-window'], rx: ['window-line'], fl: ['window'] },
  Replace: { ph: ['swap'], tb: ['replace'], he: ['arrows-right-left'], io: ['repeat'], rx: ['find-replace-line'], fl: ['arrow_swap'] },
  CornerDownLeft: { ph: ['arrow-elbow-down-left'], tb: ['corner-down-left'], he: ['arrow-uturn-down'], io: ['long-arrow-down-left'], rx: ['corner-down-left-line'], fl: ['arrow_enter_left'] },
  Braces: { ph: ['brackets-curly'], tb: ['braces'], he: ['code-bracket'], io: ['code-brackets'], rx: ['braces-line'], fl: ['braces'] },
  GripVertical: { ph: ['dots-six-vertical'], tb: ['grip-vertical'], he: ['ellipsis-vertical'], io: ['more-vert'], rx: ['draggable'], fl: ['re_order_dots_vertical'] },
  Trash2: { ph: ['trash'], tb: ['trash'], he: ['trash'], io: ['trash'], rx: ['delete-bin-line'], fl: ['delete'] },
  Palette: { ph: ['palette'], tb: ['palette'], he: ['swatch'], io: ['palette'], rx: ['palette-line'], fl: ['color'] },
};
delete MAP.FileTextAlt;

const PACKS = {
  'phosphor-thin': { key: 'ph', dir: `${NM}/@phosphor-icons/core/assets/thin`, strip: (n) => n.replace(/-thin$/, ''), fill: true },
  'phosphor-light': { key: 'ph', dir: `${NM}/@phosphor-icons/core/assets/light`, strip: (n) => n.replace(/-light$/, ''), fill: true },
  phosphor: { key: 'ph', dir: `${NM}/@phosphor-icons/core/assets/regular`, fill: true },
  'phosphor-bold': { key: 'ph', dir: `${NM}/@phosphor-icons/core/assets/bold`, strip: (n) => n.replace(/-bold$/, ''), fill: true },
  tabler: { key: 'tb', dir: `${NM}/@tabler/icons/icons/outline` },
  heroicons: { key: 'he', dir: `${NM}/heroicons/24/outline` },
  iconoir: { key: 'io', dir: `${NM}/iconoir/icons/regular` },
  remix: { key: 'rx', dir: `${NM}/remixicon/icons`, fill: true },
  fluent: { key: 'fl', dir: `${NM}/@fluentui/svg-icons/icons`, strip: (n) => n, fluent: true, fill: true },
};

function clean(svg, fill) {
  svg = svg
    .replace(/<\?xml[^>]*>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const end = svg.indexOf('>');
  const open = svg.slice(0, end).replace(/\s(class|width|height|id|data-[\w-]+|aria-hidden)="[^"]*"/g, '');
  svg = open + svg.slice(end);
  if (fill) {
    svg = svg.replace(/fill="(?!none)[^"]*"/g, 'fill="currentColor"');
    if (!/^<svg[^>]*fill=/.test(svg)) svg = svg.replace('<svg', '<svg fill="currentColor"');
  }
  svg = svg.replace(/stroke="(?!none)(#[0-9a-fA-F]{3,6}|black)"/g, 'stroke="currentColor"');
  return svg;
}

const report = {};
for (const [pack, cfg] of Object.entries(PACKS)) {
  let idx;
  if (cfg.fluent) {
    idx = new Map();
    for (const f of fs.readdirSync(cfg.dir)) {
      const m = f.match(/^(.*)_20_regular\.svg$/);
      if (m) idx.set(m[1], path.join(cfg.dir, f));
    }
  } else idx = indexDir(cfg.dir, cfg.strip);
  const out = {};
  const missing = [];
  for (const [name, cands] of Object.entries(MAP)) {
    const file = (cands[cfg.key] || []).map((c) => idx.get(c)).find(Boolean);
    if (file) out[name] = clean(fs.readFileSync(file, 'utf8'), cfg.fill);
    else missing.push(name);
  }
  fs.writeFileSync(path.join(OUT, `${pack}.js`), `// Gerado por scripts/gen-icons.mjs — não editar.\nexport default ${JSON.stringify(out, null, 0)};\n`);
  report[pack] = missing;
}
console.log(JSON.stringify(report, null, 1));
