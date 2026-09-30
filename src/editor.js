// Editor de Markdown (CodeMirror 6) e todos os comandos de formatação.
import { EditorState, EditorSelection, Compartment, Prec } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightSpecialChars,
  placeholder,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentMore, indentLess, undo, redo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting, HighlightStyle, indentUnit, bracketMatching } from '@codemirror/language';
import { search, searchKeymap, highlightSelectionMatches, openSearchPanel, gotoLine } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { tags as t } from '@lezer/highlight';
import emojiData from 'markdown-it-emoji/lib/data/full.mjs';
import { slugify } from './markdown.js';

// ------------------------------------------------------------------ aparência
const highlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.5em', fontWeight: '700', color: 'var(--cm-heading)' },
  { tag: t.heading2, fontSize: '1.32em', fontWeight: '700', color: 'var(--cm-heading)' },
  { tag: t.heading3, fontSize: '1.16em', fontWeight: '700', color: 'var(--cm-heading)' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: '700', color: 'var(--cm-heading)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--cm-link)' },
  { tag: t.url, color: 'var(--cm-url)', textDecoration: 'underline' },
  { tag: t.monospace, color: 'var(--cm-code)' },
  { tag: t.quote, color: 'var(--cm-quote)', fontStyle: 'italic' },
  { tag: t.processingInstruction, color: 'var(--cm-mark)' },
  { tag: t.contentSeparator, color: 'var(--cm-mark)', fontWeight: '700' },
  { tag: t.labelName, color: 'var(--cm-label)' },
  { tag: t.comment, color: 'var(--hl-comment)', fontStyle: 'italic' },
  { tag: [t.escape, t.character], color: 'var(--cm-escape)' },
  { tag: t.atom, color: 'var(--cm-atom)' },
  // Código dentro de blocos cercados
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword], color: 'var(--hl-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--hl-string)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--hl-number)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--hl-function)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--hl-type)' },
  { tag: t.propertyName, color: 'var(--hl-property)' },
  { tag: t.tagName, color: 'var(--hl-tag)' },
  { tag: t.attributeName, color: 'var(--hl-attr)' },
  { tag: t.meta, color: 'var(--hl-meta)' },
  { tag: t.invalid, color: 'var(--hl-invalid)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--editor-bg)', color: 'var(--text)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--editor-font)', lineHeight: '1.7', fontSize: 'var(--editor-font-size)' },
  '.cm-content': { padding: '28px 0 45vh', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0 32px' },
  '.cm-gutters': { backgroundColor: 'var(--editor-bg)', color: 'var(--text-faint)', border: 'none', paddingLeft: '8px' },
  '.cm-activeLine': { backgroundColor: 'var(--editor-active-line)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'var(--selection) !important' },
  '.cm-selectionMatch': { backgroundColor: 'var(--selection-match)' },
  '.cm-searchMatch': { backgroundColor: 'var(--search-match)', outline: '1px solid var(--search-match-border)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--search-current)' },
  '.cm-panels': { backgroundColor: 'var(--chrome)', color: 'var(--text)', fontFamily: 'var(--ui-font)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--border)' },
  '.cm-tooltip': { backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: 'var(--shadow)' },
  '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--ui-font)', maxHeight: '260px' },
  '.cm-tooltip-autocomplete > ul > li': { padding: '4px 10px !important' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--accent)', color: 'var(--accent-text)' },
  '.cm-placeholder': { color: 'var(--text-faint)', fontStyle: 'italic' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--chip)', border: 'none', color: 'var(--text-muted)' },
});

const phrases = EditorState.phrases.of({
  Find: 'Localizar',
  Replace: 'Substituir',
  next: 'próximo',
  previous: 'anterior',
  all: 'todos',
  'match case': 'maiúsc./minúsc.',
  'by word': 'palavra inteira',
  regexp: 'expressão regular',
  replace: 'substituir',
  'replace all': 'substituir tudo',
  close: 'fechar',
  'current match': 'ocorrência atual',
  'replaced $ matches': '$ ocorrências substituídas',
  'replaced match on line $': 'ocorrência substituída na linha $',
  'on line': 'na linha',
  'Go to line': 'Ir para a linha',
  go: 'ir',
});

// ------------------------------------------------------------------ utilitários
function selectedLines(state) {
  const seen = new Set();
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number;
    let b = state.doc.lineAt(r.to).number;
    // Seleção que termina no início de uma linha não inclui essa linha.
    if (b > a && state.doc.line(b).from === r.to) b--;
    for (let i = a; i <= b; i++) seen.add(i);
  }
  return [...seen].sort((x, y) => x - y).map((n) => state.doc.line(n));
}

function dispatchLineChanges(view, changes) {
  const cs = view.state.changes(changes);
  view.dispatch({
    changes: cs,
    selection: view.state.selection.map(cs, 1),
    scrollIntoView: true,
    userEvent: 'input.format',
  });
  view.focus();
}

function isWrapped(state, from, to, before, after) {
  if (from - before.length < 0) return false;
  if (state.sliceDoc(from - before.length, from) !== before || state.sliceDoc(to, to + after.length) !== after) return false;
  if (before.length === 1 && before === after) {
    // "*x*" dentro de "**x**" não é itálico, a menos que seja "***x***".
    const c = before;
    const b2 = state.sliceDoc(from - 2, from - 1);
    const a2 = state.sliceDoc(to + 1, to + 2);
    if (b2 === c && a2 === c) return state.sliceDoc(from - 3, from - 2) === c && state.sliceDoc(to + 2, to + 3) === c;
  }
  return true;
}

/** Envolve a seleção (ou a palavra sob o cursor) com marcadores; alterna se já estiver envolvida. */
export function wrapInline(view, before, after = before, ph = 'texto') {
  const { state } = view;
  const spec = state.changeByRange((range) => {
    let { from, to } = range;
    // Não inclui espaços nas bordas da seleção (ex.: duplo clique).
    const sel = state.sliceDoc(from, to);
    from += sel.length - sel.trimStart().length;
    to -= sel.length - sel.trimEnd().length;
    if (to < from) to = from;

    if (isWrapped(state, from, to, before, after)) {
      return {
        changes: [
          { from: from - before.length, to: from },
          { from: to, to: to + after.length },
        ],
        range: EditorSelection.range(from - before.length, to - before.length),
      };
    }
    const text = state.sliceDoc(from, to);
    if (text.length >= before.length + after.length && text.startsWith(before) && text.endsWith(after)) {
      const inner = text.slice(before.length, text.length - after.length);
      return { changes: { from, to, insert: inner }, range: EditorSelection.range(from, from + inner.length) };
    }
    if (from === to) {
      const word = state.wordAt(from);
      if (word && word.from < from && word.to > from) {
        return {
          changes: [
            { from: word.from, insert: before },
            { from: word.to, insert: after },
          ],
          range: EditorSelection.cursor(from + before.length),
        };
      }
      return {
        changes: { from, insert: before + ph + after },
        range: EditorSelection.range(from + before.length, from + before.length + ph.length),
      };
    }
    return {
      changes: [
        { from, insert: before },
        { from: to, insert: after },
      ],
      range: EditorSelection.range(from + before.length, to + before.length),
    };
  });
  view.dispatch(state.update(spec, { scrollIntoView: true, userEvent: 'input.format' }));
  view.focus();
}

/** Substitui a seleção principal por um texto, selecionando [a, b) dentro dele. */
export function insertInline(view, text, a = text.length, b = a) {
  const r = view.state.selection.main;
  view.dispatch({
    changes: { from: r.from, to: r.to, insert: text },
    selection: EditorSelection.range(r.from + a, r.from + b),
    scrollIntoView: true,
    userEvent: 'input',
  });
  view.focus();
}

/**
 * Insere um bloco em linhas próprias, garantindo linhas em branco ao redor.
 * `build(textoSelecionado)` devolve { text, anchor, head } (posições relativas ao texto, ou 'end').
 */
export function insertBlock(view, build) {
  const { state } = view;
  const r = state.selection.main;
  const lineA = state.doc.lineAt(r.from);
  const lineB = state.doc.lineAt(r.to);
  let from;
  let to;
  if (r.empty) {
    if (lineA.text.trim() === '') {
      from = lineA.from;
      to = lineA.to;
    } else {
      from = to = lineA.to;
    }
  } else {
    from = lineA.from;
    to = lineB.to;
  }
  const selected = r.empty ? '' : state.sliceDoc(from, to);
  const { text, anchor = text.length, head = anchor } = build(selected);
  const before = state.sliceDoc(Math.max(0, from - 2), from);
  const after = state.sliceDoc(to, Math.min(state.doc.length, to + 2));
  const prefix = from === 0 ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const suffix = to >= state.doc.length ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const insert = prefix + text + suffix;
  const base = from + prefix.length;
  const pos = (p) => (p === 'end' ? from + insert.length - (suffix === '\n\n' ? 1 : 0) : base + p);
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.range(pos(anchor), pos(head)),
    scrollIntoView: true,
    userEvent: 'input',
  });
  view.focus();
}

// ------------------------------------------------------------------ títulos, listas, citações
const HEADING_RE = /^(\s{0,3})(#{1,6})(\s+|$)/;
const LIST_RE = /^(\s*)((?:[-*+]|\d{1,9}[.)])\s+)(\[[ xX]\]\s+)?/;
const QUOTE_RE = /^(\s*)> ?/;

export function setHeading(view, level) {
  const lines = selectedLines(view.state);
  const same = level > 0 && lines.every((l) => {
    const m = l.text.match(HEADING_RE);
    return m && m[2].length === level;
  });
  dispatchLineChanges(
    view,
    lines.map((l) => {
      const m = l.text.match(HEADING_RE);
      return {
        from: l.from,
        to: l.from + (m ? m[0].length : 0),
        insert: same || level === 0 ? '' : '#'.repeat(level) + ' ',
      };
    }),
  );
}

function listKind(text) {
  const m = text.match(LIST_RE);
  if (!m) return null;
  if (m[3]) return 'task';
  return /\d/.test(m[2]) ? 'ordered' : 'bullet';
}

export function toggleList(view, kind) {
  let lines = selectedLines(view.state);
  if (lines.length > 1) lines = lines.filter((l) => l.text.trim() !== '');
  if (!lines.length) return;
  const all = lines.every((l) => listKind(l.text) === kind);
  let n = 1;
  dispatchLineChanges(
    view,
    lines.map((l) => {
      const m = l.text.match(LIST_RE);
      const indent = m ? m[1] : l.text.match(/^\s*/)[0];
      let marker = '';
      if (!all) marker = kind === 'bullet' ? '- ' : kind === 'task' ? '- [ ] ' : `${n++}. `;
      return { from: l.from, to: l.from + (m ? m[0].length : indent.length), insert: indent + marker };
    }),
  );
}

export function toggleQuote(view) {
  const lines = selectedLines(view.state);
  const all = lines.every((l) => QUOTE_RE.test(l.text));
  dispatchLineChanges(
    view,
    lines.map((l) => {
      if (all) {
        const m = l.text.match(QUOTE_RE);
        return { from: l.from + m[1].length, to: l.from + m[0].length, insert: '' };
      }
      return { from: l.from, insert: '> ' };
    }),
  );
}

/** Tab/Shift+Tab em listas: aninha o item sob o anterior, respeitando a largura do marcador. */
function listIndent(view, dir) {
  const { state } = view;
  const lines = selectedLines(state);
  if (!lines.some((l) => LIST_RE.test(l.text))) return false;
  const changes = [];
  for (const l of lines) {
    const m = l.text.match(LIST_RE);
    const cur = m ? m[1].length : l.text.match(/^\s*/)[0].length;
    let target;
    if (dir > 0) {
      target = cur + 2;
      for (let n = l.number - 1; n >= 1; n--) {
        const text = state.doc.line(n).text;
        if (!text.trim()) continue;
        const pm = text.match(LIST_RE);
        if (!pm) break;
        if (pm[1].length === cur) {
          target = cur + pm[2].length;
          break;
        }
        if (pm[1].length < cur) break;
      }
    } else {
      if (cur === 0) continue;
      target = 0;
      for (let n = l.number - 1; n >= 1; n--) {
        const text = state.doc.line(n).text;
        if (!text.trim()) continue;
        const pm = text.match(LIST_RE);
        if (!pm) break;
        if (pm[1].length < cur) {
          target = pm[1].length;
          break;
        }
      }
    }
    changes.push({ from: l.from, to: l.from + cur, insert: ' '.repeat(target) });
  }
  if (changes.length) dispatchLineChanges(view, changes);
  return true;
}

export const indent = (view) => listIndent(view, 1) || indentMore(view);
export const outdent = (view) => listIndent(view, -1) || indentLess(view);

// ------------------------------------------------------------------ tabelas
function splitRow(text) {
  let s = text.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      cur += c + s[++i];
      continue;
    }
    if (c === '`') inCode = !inCode;
    if (c === '|' && !inCode) {
      cells.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|\p{Extended_Pictographic}/u;
function strWidth(s) {
  let w = 0;
  for (const ch of s) w += WIDE.test(ch) ? 2 : 1;
  return w;
}

export function buildTable(rows, cols, cellsData = null) {
  const data =
    cellsData ||
    [Array.from({ length: cols }, (_, i) => `Coluna ${i + 1}`), ...Array.from({ length: rows }, () => Array(cols).fill(''))];
  const ncols = Math.max(...data.map((r) => r.length));
  const widths = Array(ncols).fill(3);
  data.forEach((r) => r.forEach((c, j) => (widths[j] = Math.max(widths[j], strWidth(c)))));
  const line = (r) => '| ' + widths.map((w, j) => (r[j] || '') + ' '.repeat(w - strWidth(r[j] || ''))).join(' | ') + ' |';
  const sep = '| ' + widths.map((w) => '-'.repeat(w)).join(' | ') + ' |';
  return [line(data[0]), sep, ...data.slice(1).map(line)].join('\n');
}

export function insertTable(view, rows, cols) {
  insertBlock(view, (sel) => {
    // Dados colados do Excel (separados por tabulação) viram tabela.
    if (sel && sel.includes('\t')) {
      const data = sel.split('\n').filter((l) => l.trim()).map((l) => l.split('\t').map((c) => c.trim()));
      return { text: buildTable(0, 0, data), anchor: 'end' };
    }
    const text = buildTable(rows, cols);
    return { text, anchor: 2, head: 2 + 'Coluna 1'.length };
  });
}

/** Alinha as colunas da tabela sob o cursor. */
export function formatTable(view) {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  if (!line.text.includes('|')) return false;
  let start = line.number;
  let end = line.number;
  const isRow = (n) => {
    const tx = state.doc.line(n).text;
    return tx.includes('|') && tx.trim() !== '';
  };
  while (start > 1 && isRow(start - 1)) start--;
  while (end < state.doc.lines && isRow(end + 1)) end++;
  const rows = [];
  for (let i = start; i <= end; i++) rows.push(splitRow(state.doc.line(i).text));
  if (rows.length < 2 || !rows[1].every((c) => /^:?-+:?$/.test(c))) return false;
  const cols = Math.max(...rows.map((r) => r.length));
  const aligns = Array.from({ length: cols }, (_, j) => {
    const c = rows[1][j] || '---';
    const l = c.startsWith(':');
    const r = c.endsWith(':');
    return l && r ? 'center' : r ? 'right' : l ? 'left' : 'none';
  });
  const widths = Array(cols).fill(3);
  rows.forEach((r, i) => {
    if (i !== 1) r.forEach((c, j) => (widths[j] = Math.max(widths[j], strWidth(c))));
  });
  const out = rows.map((r, i) => {
    const cells = Array.from({ length: cols }, (_, j) => {
      const w = widths[j];
      const a = aligns[j];
      if (i === 1) {
        if (a === 'center') return ':' + '-'.repeat(w - 2) + ':';
        if (a === 'right') return '-'.repeat(w - 1) + ':';
        if (a === 'left') return ':' + '-'.repeat(w - 1);
        return '-'.repeat(w);
      }
      const c = r[j] || '';
      const pad = w - strWidth(c);
      if (a === 'right') return ' '.repeat(pad) + c;
      if (a === 'center') return ' '.repeat(pad >> 1) + c + ' '.repeat(pad - (pad >> 1));
      return c + ' '.repeat(pad);
    });
    return '| ' + cells.join(' | ') + ' |';
  });
  const from = state.doc.line(start).from;
  const to = state.doc.line(end).to;
  view.dispatch({ changes: { from, to, insert: out.join('\n') }, userEvent: 'input.format' });
  view.focus();
  return true;
}

// ------------------------------------------------------------------ outros blocos
const stripInline = (s) =>
  s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_`~=]/g, '')
    .trim();

export function headingsOf(doc) {
  const out = [];
  let fence = null;
  const all = doc.split('\n');
  for (let n = 0; n < all.length; n++) {
    const line = all[n];
    const f = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const m = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (m) out.push({ level: m[1].length, text: stripInline(m[2]), line: n });
  }
  const counts = {};
  for (const h of out) {
    let slug = slugify(h.text);
    if (counts[slug] != null) slug = `${slug}-${++counts[slug]}`;
    else counts[slug] = 0;
    h.slug = slug;
  }
  return out;
}

export function insertToc(view) {
  const heads = headingsOf(view.state.doc.toString());
  if (!heads.length) {
    insertBlock(view, () => ({ text: '<!-- Adicione títulos (#, ##, ...) para gerar o sumário -->', anchor: 'end' }));
    return;
  }
  const min = Math.min(...heads.map((h) => h.level));
  const text = heads.map((h) => `${'  '.repeat(h.level - min)}- [${h.text}](#${h.slug})`).join('\n');
  insertBlock(view, () => ({ text, anchor: 'end' }));
}

export function insertFootnote(view) {
  const { state } = view;
  const doc = state.doc.toString();
  const used = new Set([...doc.matchAll(/\[\^([^\]\s]+)\]/g)].map((m) => m[1]));
  let n = 1;
  while (used.has(String(n))) n++;
  const ref = `[^${n}]`;
  const def = `[^${n}]: `;
  const ph = 'Texto da nota de rodapé.';
  const r = state.selection.main;
  const end = state.doc.length;
  const tail = doc.endsWith('\n\n') ? '' : doc.endsWith('\n') ? '\n' : '\n\n';
  const start = end + ref.length + tail.length + def.length;
  view.dispatch({
    changes: [
      { from: r.to, insert: ref },
      { from: end, insert: tail + def + ph + '\n' },
    ],
    selection: EditorSelection.range(start, start + ph.length),
    scrollIntoView: true,
    userEvent: 'input',
  });
  view.focus();
}

const withPlaceholder = (sel, ph) => sel || ph;
const quoteLines = (text) =>
  text
    .split('\n')
    .map((l) => (l ? '> ' + l : '>'))
    .join('\n');

export const ALERTS = {
  NOTE: 'Nota',
  TIP: 'Dica',
  IMPORTANT: 'Importante',
  WARNING: 'Aviso',
  CAUTION: 'Cuidado',
};

function linkDestination(url) {
  const u = url.trim();
  return /[\s()<>]/.test(u) ? `<${u.replace(/[<>]/g, encodeURIComponent)}>` : u;
}

/** Conjunto de comandos usados pela barra de ferramentas, menus e atalhos. */
export const commands = {
  undo: (v) => (undo(v), v.focus()),
  redo: (v) => (redo(v), v.focus()),
  bold: (v) => wrapInline(v, '**', '**', 'texto em negrito'),
  italic: (v) => wrapInline(v, '*', '*', 'texto em itálico'),
  strike: (v) => wrapInline(v, '~~', '~~', 'texto tachado'),
  highlight: (v) => wrapInline(v, '==', '==', 'texto realçado'),
  underline: (v) => wrapInline(v, '++', '++', 'texto sublinhado'),
  code: (v) => wrapInline(v, '`', '`', 'código'),
  sup: (v) => wrapInline(v, '^', '^', 'sobrescrito'),
  sub: (v) => wrapInline(v, '~', '~', 'subscrito'),
  kbd: (v) => wrapInline(v, '<kbd>', '</kbd>', 'Ctrl'),
  mathInline: (v) => wrapInline(v, '$', '$', 'x^2'),
  comment: (v) => wrapInline(v, '<!-- ', ' -->', 'comentário'),
  heading: (v, level) => setHeading(v, level),
  bullet: (v) => toggleList(v, 'bullet'),
  ordered: (v) => toggleList(v, 'ordered'),
  task: (v) => toggleList(v, 'task'),
  quote: (v) => toggleQuote(v),
  indent: (v) => indent(v),
  outdent: (v) => outdent(v),
  codeBlock: (v, lang = '') =>
    insertBlock(v, (sel) => {
      const open = '```' + lang;
      const body = sel || '';
      return { text: `${open}\n${body}\n\`\`\``, anchor: open.length + 1, head: open.length + 1 + body.length };
    }),
  hr: (v) => insertBlock(v, () => ({ text: '---', anchor: 'end' })),
  table: (v, rows = 2, cols = 3) => insertTable(v, rows, cols),
  formatTable: (v) => formatTable(v),
  link: (v, { text = '', url = '', title = '' } = {}) => {
    const label = text || url || 'link';
    const md = `[${label}](${linkDestination(url || 'https://')}${title ? ` "${title}"` : ''})`;
    if (!url) insertInline(v, md, label.length + 3, md.length - 1);
    else insertInline(v, md);
  },
  image: (v, { alt = '', url = '', title = '' } = {}) => {
    const md = `![${alt}](${linkDestination(url || 'imagem.png')}${title ? ` "${title}"` : ''})`;
    if (!url) insertInline(v, md, alt.length + 4, md.length - 1);
    else insertInline(v, md);
  },
  mathBlock: (v) =>
    insertBlock(v, (sel) => {
      const body = withPlaceholder(sel, 'E = mc^2');
      return { text: `$$\n${body}\n$$`, anchor: 3, head: 3 + body.length };
    }),
  mermaid: (v, kind = 'flowchart') => {
    const samples = {
      flowchart: 'flowchart LR\n    A[Início] --> B{Decisão}\n    B -->|Sim| C[Resultado 1]\n    B -->|Não| D[Resultado 2]',
      sequence: 'sequenceDiagram\n    participant U as Usuário\n    participant S as Sistema\n    U->>S: Requisição\n    S-->>U: Resposta',
      gantt: 'gantt\n    title Cronograma\n    dateFormat YYYY-MM-DD\n    section Fase 1\n    Planejamento :a1, 2026-01-01, 7d\n    Execução     :after a1, 14d',
      pie: 'pie title Distribuição\n    "A" : 45\n    "B" : 30\n    "C" : 25',
      class: 'classDiagram\n    class Animal {\n        +String nome\n        +emitirSom()\n    }\n    Animal <|-- Cachorro',
      mindmap: 'mindmap\n  root((Ideia))\n    Tópico A\n      Detalhe\n    Tópico B',
    };
    insertBlock(v, () => {
      const body = samples[kind] || samples.flowchart;
      return { text: '```mermaid\n' + body + '\n```', anchor: 11, head: 11 + body.length };
    });
  },
  alert: (v, type = 'NOTE') =>
    insertBlock(v, (sel) => {
      const body = withPlaceholder(sel, 'Texto do alerta.');
      const head = `> [!${type}]\n`;
      return { text: head + quoteLines(body), anchor: head.length + 2, head: head.length + 2 + body.split('\n')[0].length };
    }),
  details: (v) =>
    insertBlock(v, (sel) => {
      const title = 'Clique para expandir';
      const text = `<details>\n<summary>${title}</summary>\n\n${withPlaceholder(sel, 'Conteúdo oculto.')}\n\n</details>`;
      return { text, anchor: 19, head: 19 + title.length };
    }),
  deflist: (v) =>
    insertBlock(v, (sel) => {
      const term = withPlaceholder(sel, 'Termo');
      return { text: `${term}\n: Definição do termo.`, anchor: term.length + 3, head: term.length + 3 + 'Definição do termo.'.length };
    }),
  abbr: (v) =>
    insertBlock(v, (sel) => {
      const a = withPlaceholder(sel.trim(), 'HTML');
      return { text: `*[${a}]: HyperText Markup Language`, anchor: a.length + 5, head: a.length + 5 + 'HyperText Markup Language'.length };
    }),
  footnote: (v) => insertFootnote(v),
  toc: (v) => insertToc(v),
  lineBreak: (v) => insertInline(v, '\\\n'),
  datetime: (v) => insertInline(v, new Date().toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })),
  emoji: (v, ch) => insertInline(v, ch),
  insert: (v, text) => insertInline(v, text),
  escape: (v) => {
    const r = v.state.selection.main;
    if (r.empty) return insertInline(v, '\\');
    const text = v.state.sliceDoc(r.from, r.to).replace(/([\\`*_{}[\]()#+\-!|<>~=^])/g, '\\$1');
    insertInline(v, text, 0, text.length);
  },
  clearFormat: (v) => {
    const { state } = v;
    let r = state.selection.main;
    if (r.empty) {
      const l = state.doc.lineAt(r.head);
      r = EditorSelection.range(l.from, l.to);
    }
    const text = state
      .sliceDoc(r.from, r.to)
      .split('\n')
      .map((line) =>
        line
          .replace(/^(\s*)(#{1,6}\s+|>\s?|(?:[-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?)/, '$1')
          .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
          .replace(/<\/?(kbd|u|mark|sup|sub|b|i|em|strong)>/gi, '')
          .replace(/(\*\*|__|~~|==|\+\+|\*|`|\^)/g, ''),
      )
      .join('\n');
    v.dispatch({ changes: { from: r.from, to: r.to, insert: text }, selection: EditorSelection.range(r.from, r.from + text.length), userEvent: 'input.format' });
    v.focus();
  },
  find: (v) => (openSearchPanel(v), true),
  gotoLine: (v) => gotoLine(v),
};

// ------------------------------------------------------------------ autocompletar
const emojiList = Object.entries(emojiData);

function emojiCompletion(context) {
  const word = context.matchBefore(/:[\w+-]+$/);
  if (!word || word.text.length < 3) return null;
  if (/\w/.test(context.state.sliceDoc(word.from - 1, word.from))) return null;
  const q = word.text.slice(1).toLowerCase();
  const starts = [];
  const contains = [];
  for (const [name, ch] of emojiList) {
    if (name.startsWith(q)) starts.push([name, ch]);
    else if (name.includes(q)) contains.push([name, ch]);
    if (starts.length > 40) break;
  }
  const options = [...starts, ...contains].slice(0, 50).map(([name, ch]) => ({
    label: `:${name}:`,
    displayLabel: `${ch}  :${name}:`,
    type: 'text',
  }));
  return options.length ? { from: word.from, options, filter: false } : null;
}

function anchorCompletion(context) {
  const m = context.matchBefore(/\]\(#[^\s)]*$/);
  if (!m) return null;
  const heads = headingsOf(context.state.doc.toString());
  return {
    from: m.from + 3,
    options: heads.map((h) => ({ label: h.slug, detail: `${'#'.repeat(h.level)} ${h.text}`, type: 'text' })),
    validFor: /^[^\s)]*$/,
  };
}

// ------------------------------------------------------------------ criação do editor
export function createEditor(parent, opts = {}) {
  const lineNumbersC = new Compartment();
  const wrapC = new Compartment();
  const spellC = new Compartment();
  const options = { lineNumbers: false, wrap: true, spellcheck: false, ...opts.options };

  const formatKeymap = [
    { key: 'Mod-b', run: (v) => (commands.bold(v), true) },
    { key: 'Mod-i', run: (v) => (commands.italic(v), true) },
    { key: 'Mod-u', run: (v) => (commands.underline(v), true) },
    { key: 'Mod-Shift-x', run: (v) => (commands.strike(v), true) },
    { key: 'Mod-Shift-h', run: (v) => (commands.highlight(v), true) },
    { key: 'Mod-`', run: (v) => (commands.code(v), true) },
    { key: 'Mod-k', run: () => (opts.actions?.link?.(), true) },
    { key: 'Mod-Shift-i', run: () => (opts.actions?.image?.(), true) },
    { key: 'Mod-Shift-k', run: (v) => (commands.codeBlock(v), true) },
    { key: 'Mod-Shift-t', run: () => (opts.actions?.table?.(), true) },
    { key: 'Mod-Shift-7', run: (v) => (commands.ordered(v), true) },
    { key: 'Mod-Shift-8', run: (v) => (commands.bullet(v), true) },
    { key: 'Mod-Shift-9', run: (v) => (commands.task(v), true) },
    { key: 'Mod-Shift-q', run: (v) => (commands.quote(v), true) },
    { key: 'Mod-Shift--', run: (v) => (commands.hr(v), true) },
    { key: 'Mod-Shift-m', run: (v) => (commands.mathBlock(v), true) },
    { key: 'Mod-Alt-f', run: (v) => (commands.formatTable(v), true) },
    { key: 'Mod-h', run: (v) => (openSearchPanel(v), true) },
    { key: 'Mod-g', run: gotoLine },
    { key: 'Tab', run: (v) => listIndent(v, 1) || indentMore(v) },
    { key: 'Shift-Tab', run: (v) => listIndent(v, -1) || indentLess(v) },
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ key: `Mod-${n}`, run: (v) => (setHeading(v, n), true) })),
  ];

  const handlers = EditorView.domEventHandlers({
    paste(event, view) {
      const dt = event.clipboardData;
      if (!dt) return false;
      const images = [...dt.files].filter((f) => f.type.startsWith('image/'));
      if (images.length && opts.onPasteImages) {
        event.preventDefault();
        opts.onPasteImages(images);
        return true;
      }
      // Colar uma URL sobre um texto selecionado cria um link.
      const text = dt.getData('text/plain');
      const r = view.state.selection.main;
      if (!r.empty && /^https?:\/\/\S+$/i.test(text.trim()) && !view.state.sliceDoc(r.from, r.to).includes('\n')) {
        event.preventDefault();
        const label = view.state.sliceDoc(r.from, r.to);
        insertInline(view, `[${label}](${text.trim()})`);
        return true;
      }
      return false;
    },
  });

  const extensions = () => [
    lineNumbersC.of(options.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
    wrapC.of(options.wrap ? EditorView.lineWrapping : []),
    spellC.of(EditorView.contentAttributes.of({ spellcheck: options.spellcheck ? 'true' : 'false', lang: 'pt-BR', autocorrect: 'off', autocapitalize: 'off' })),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    bracketMatching(),
    closeBrackets(),
    EditorState.languageData.of(() => [{ closeBrackets: { brackets: ['(', '[', '{'] } }]),
    indentUnit.of('  '),
    EditorState.tabSize.of(4),
    markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
    syntaxHighlighting(highlight),
    search({ top: true }),
    autocompletion({ override: [emojiCompletion, anchorCompletion], icons: false }),
    placeholder('Comece a escrever em Markdown…'),
    phrases,
    theme,
    handlers,
    Prec.high(keymap.of(formatKeymap)),
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) opts.onChange?.(u);
      if (u.selectionSet || u.docChanged) opts.onSelection?.(u.state);
      if (u.focusChanged && u.view.hasFocus) opts.onFocus?.();
    }),
  ];

  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: '', extensions: extensions() }),
  });

  view.scrollDOM.addEventListener('scroll', () => opts.onScroll?.(), { passive: true });

  const api = {
    view,
    getValue: () => view.state.doc.toString(),
    /** Troca o conteúdo. `reset` apaga o histórico de desfazer (novo documento). */
    setValue(text, { reset = true } = {}) {
      if (reset) {
        view.setState(EditorState.create({ doc: text, extensions: extensions() }));
      } else {
        const head = Math.min(view.state.selection.main.head, text.length);
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
          selection: EditorSelection.cursor(head),
          userEvent: 'reload',
        });
      }
    },
    focus: () => view.focus(),
    setOptions(o) {
      Object.assign(options, o);
      view.dispatch({
        effects: [
          lineNumbersC.reconfigure(options.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
          wrapC.reconfigure(options.wrap ? EditorView.lineWrapping : []),
          spellC.reconfigure(
            EditorView.contentAttributes.of({ spellcheck: options.spellcheck ? 'true' : 'false', lang: 'pt-BR', autocorrect: 'off', autocapitalize: 'off' }),
          ),
        ],
      });
    },
    /** Linha (base 0, fracionária) no topo da área visível. */
    topLine() {
      const top = view.scrollDOM.scrollTop - view.documentPadding.top;
      if (top <= 0) return 0;
      const block = view.lineBlockAtHeight(top);
      const line = view.state.doc.lineAt(block.from).number - 1;
      return line + Math.min(1, Math.max(0, (top - block.top) / Math.max(1, block.height)));
    },
    /** Rola para que a linha (base 0, fracionária) fique no topo. */
    scrollToLine(line) {
      const n = Math.max(1, Math.min(view.state.doc.lines, Math.floor(line) + 1));
      const block = view.lineBlockAt(view.state.doc.line(n).from);
      view.scrollDOM.scrollTop = block.top + (line - Math.floor(line)) * block.height + view.documentPadding.top;
    },
    /** Move o cursor para a linha (base 0) e a centraliza. */
    revealLine(line) {
      const n = Math.max(1, Math.min(view.state.doc.lines, line + 1));
      const pos = view.state.doc.line(n).from;
      view.dispatch({ selection: EditorSelection.cursor(pos), effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 60 }) });
      view.focus();
    },
    cursorInfo() {
      const r = view.state.selection.main;
      const line = view.state.doc.lineAt(r.head);
      return { line: line.number, col: r.head - line.from + 1, selected: Math.abs(r.to - r.from), selections: view.state.selection.ranges.length };
    },
    requestMeasure: () => view.requestMeasure(),
    run(name, ...args) {
      const fn = commands[name];
      if (fn) fn(view, ...args);
    },
  };
  return api;
}
