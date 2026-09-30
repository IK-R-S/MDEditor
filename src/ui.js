// Componentes de interface: ícones, menus suspensos, diálogos e notificações.
import {
  createElement,
  Undo2, Redo2, Heading, Bold, Italic, Strikethrough, Highlighter, Code, List, ListOrdered, ListTodo,
  TextQuote, Link, Image, Table, SquareCode, Minus, Sigma, Workflow, MessageSquareWarning, Footprints,
  Smile, Ellipsis, Search, Eye, Columns2, PenLine, FileText, FolderOpen, Save, PanelLeft, Sun, Moon,
  Monitor, Printer, FileDown, Copy, Check, X, ChevronRight, ChevronDown, Folder, File, ArrowUp, ListTree,
  Files, Superscript, Subscript, Keyboard, ChevronsDownUp, IndentIncrease, IndentDecrease, RemoveFormatting,
  CalendarClock, BookOpen, Settings, Underline, FilePlus, ArrowLeft, RefreshCw, ExternalLink, Plus,
  TriangleAlert, Info, Lightbulb, CircleAlert, OctagonAlert, Hash, Pilcrow, Maximize, WrapText, Type,
  CircleCheck, FolderUp, AppWindow, Replace, CornerDownLeft, Braces, BookA,
  GripVertical, ArrowDown, Trash2, CodeXml, BookOpenText, Palette, Baseline, PanelLeftClose, PanelLeftOpen,
} from 'lucide';

const ICONS = {
  Undo2, Redo2, Heading, Bold, Italic, Strikethrough, Highlighter, Code, List, ListOrdered, ListTodo,
  TextQuote, Link, Image, Table, SquareCode, Minus, Sigma, Workflow, MessageSquareWarning, Footprints,
  Smile, Ellipsis, Search, Eye, Columns2, PenLine, FileText, FolderOpen, Save, PanelLeft, Sun, Moon,
  Monitor, Printer, FileDown, Copy, Check, X, ChevronRight, ChevronDown, Folder, File, ArrowUp, ListTree,
  Files, Superscript, Subscript, Keyboard, ChevronsDownUp, IndentIncrease, IndentDecrease, RemoveFormatting,
  CalendarClock, BookOpen, Settings, Underline, FilePlus, ArrowLeft, RefreshCw, ExternalLink, Plus,
  TriangleAlert, Info, Lightbulb, CircleAlert, OctagonAlert, Hash, Pilcrow, Maximize, WrapText, Type,
  CircleCheck, FolderUp, AppWindow, Replace, CornerDownLeft, Braces, BookA,
  GripVertical, ArrowDown, Trash2, CodeXml, BookOpenText, Palette, Baseline, Code2: CodeXml, PanelLeftClose, PanelLeftOpen,
};

// Pacotes de ícones: Lucide vem embutido; os demais são carregados sob demanda
// (gerados por scripts/gen-icons.mjs). Ícone ausente num pacote usa o Lucide.
export const ICON_PACKS = {
  lucide: { label: 'Lucide' },
  'phosphor-thin': { label: 'Phosphor Thin', load: () => import('./icons/phosphor-thin.js') },
  'phosphor-light': { label: 'Phosphor Light', load: () => import('./icons/phosphor-light.js') },
  phosphor: { label: 'Phosphor Regular', load: () => import('./icons/phosphor.js') },
  'phosphor-bold': { label: 'Phosphor Bold', load: () => import('./icons/phosphor-bold.js') },
  tabler: { label: 'Tabler', load: () => import('./icons/tabler.js') },
  heroicons: { label: 'Heroicons', load: () => import('./icons/heroicons.js') },
  iconoir: { label: 'Iconoir', load: () => import('./icons/iconoir.js') },
  remix: { label: 'Remix Icon', load: () => import('./icons/remix.js') },
  fluent: { label: 'Fluent (Windows 11)', load: () => import('./icons/fluent.js') },
};

let pack = null;

// Variantes de estado: se o pacote não tem, usa o ícone genérico do próprio pacote
// (em vez de misturar com o Lucide).
const PACK_ALIASES = { PanelLeftClose: 'PanelLeft', PanelLeftOpen: 'PanelLeft' };

/** Troca o pacote de ícones e atualiza os ícones já exibidos. */
export async function setIconPack(name) {
  const def = ICON_PACKS[name];
  pack = def?.load ? (await def.load()).default : null;
  for (const el of document.querySelectorAll('svg.icon[data-icon]')) {
    el.replaceWith(icon(el.dataset.icon, +el.getAttribute('width') || 16));
  }
}

const svgTemplate = document.createElement('template');

export function icon(name, size = 16) {
  let el;
  const svg = pack?.[name] ?? (PACK_ALIASES[name] && pack?.[PACK_ALIASES[name]]);
  if (svg) {
    svgTemplate.innerHTML = svg;
    el = svgTemplate.content.firstElementChild;
    el.setAttribute('width', size);
    el.setAttribute('height', size);
    el.setAttribute('aria-hidden', 'true');
  } else {
    const node = ICONS[name];
    if (!node) return document.createTextNode('');
    el = createElement(node, { width: size, height: size, 'stroke-width': 1.8, 'aria-hidden': 'true' });
  }
  el.classList.add('icon');
  el.dataset.icon = name;
  return el;
}

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// ------------------------------------------------------------------ menus suspensos
let openMenus = [];
let focusBeforeMenu = null;

export function closeAllMenus() {
  if (!openMenus.length) return;
  for (const m of openMenus) m.el.remove();
  const closed = openMenus;
  openMenus = [];
  for (const m of closed) m.onClose?.();
  // Devolve o foco (ex.: ao editor) se ele estava dentro do menu.
  const active = document.activeElement;
  if (focusBeforeMenu?.isConnected && (!active || active === document.body || !active.isConnected)) {
    focusBeforeMenu.focus({ preventScroll: true });
  }
  focusBeforeMenu = null;
}

function closeMenusFrom(level) {
  const keep = openMenus.slice(0, level);
  for (const m of openMenus.slice(level)) m.el.remove();
  openMenus = keep;
}

function place(el, x, y, { alignRight = false, flipX = null } = {}) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const r = el.getBoundingClientRect();
  let left = alignRight ? x - r.width : x;
  let top = y;
  if (left + r.width > vw - 6) left = flipX != null ? flipX - r.width : vw - r.width - 6;
  if (left < 6) left = 6;
  if (top + r.height > vh - 6) top = Math.max(6, vh - r.height - 6);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

/**
 * Abre um menu. `items`: { label, icon, shortcut, action, checked, disabled, submenu, danger } | '-' | { header }.
 * `at`: {x, y} ou um elemento âncora.
 */
export function showMenu(items, at, { level = 0, onClose, className = '', flipX = null } = {}) {
  if (level === 0 && !openMenus.length) {
    const active = document.activeElement;
    focusBeforeMenu = active && active !== document.body && !active.closest('.menu') ? active : null;
  }
  closeMenusFrom(level);
  const el = h('div', { class: `menu ${className}`, role: 'menu' });
  const buttons = [];
  for (const item of items) {
    if (!item) continue;
    if (item === '-') {
      el.append(h('div', { class: 'menu-sep' }));
      continue;
    }
    if (item.header) {
      el.append(h('div', { class: 'menu-header', text: item.header }));
      continue;
    }
    if (item.custom) {
      el.append(item.custom);
      continue;
    }
    const btn = h(
      'button',
      { class: `menu-item${item.danger ? ' danger' : ''}${item.checked ? ' checked' : ''}`, role: 'menuitem', disabled: item.disabled, type: 'button' },
      h('span', { class: 'menu-icon' }, item.checked ? icon('Check', 15) : item.icon ? icon(item.icon, 15) : null),
      h('span', { class: 'menu-label', style: item.style || null }, item.label),
      item.shortcut ? h('span', { class: 'menu-shortcut', text: item.shortcut }) : null,
      item.submenu ? h('span', { class: 'menu-arrow' }, icon('ChevronRight', 14)) : null,
    );
    if (item.title) btn.title = item.title;
    const openSub = () => {
      const r = btn.getBoundingClientRect();
      const subItems = typeof item.submenu === 'function' ? item.submenu() : item.submenu;
      showMenu(subItems, { x: r.right - 2, y: r.top - 5 }, { level: level + 1, flipX: r.left + 2 });
    };
    btn.addEventListener('mouseenter', () => {
      if (item.submenu && !item.disabled) openSub();
      else closeMenusFrom(level + 1);
      btn.focus({ preventScroll: true });
    });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (item.disabled) return;
      if (item.submenu) return openSub();
      closeAllMenus();
      item.action?.();
    });
    buttons.push(btn);
    el.append(btn);
  }
  el.addEventListener('keydown', (e) => {
    const idx = buttons.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const enabled = buttons.filter((b) => !b.disabled);
      const cur = enabled.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown' ? enabled[(cur + 1) % enabled.length] : enabled[(cur - 1 + enabled.length) % enabled.length];
      next?.focus();
    } else if (e.key === 'ArrowRight' && idx >= 0 && buttons[idx].querySelector('.menu-arrow')) {
      buttons[idx].click();
      openMenus[level + 1]?.el.querySelector('.menu-item:not([disabled])')?.focus();
    } else if (e.key === 'ArrowLeft' && level > 0) {
      closeMenusFrom(level);
      openMenus[level - 1]?.el.querySelector('.menu-item:focus, .menu-item')?.focus();
    }
  });
  document.body.append(el);
  if (at instanceof Element) {
    const r = at.getBoundingClientRect();
    place(el, r.left, r.bottom + 4);
  } else {
    place(el, at.x, at.y, { flipX: at.flipX ?? flipX });
  }
  openMenus[level] = { el, onClose };
  if (level === 0) requestAnimationFrame(() => buttons.find((b) => !b.disabled)?.focus({ preventScroll: true }));
  return el;
}

export function isMenuOpen() {
  return openMenus.length > 0;
}

document.addEventListener(
  'pointerdown',
  (e) => {
    if (!openMenus.length) return;
    if (e.target.closest('.menu') || e.target.closest('.menubar-item.active')) return;
    closeAllMenus();
  },
  true,
);
window.addEventListener('blur', () => closeAllMenus());
window.addEventListener('resize', () => closeAllMenus());

// ------------------------------------------------------------------ diálogos
let modalDepth = 0;
export const isModalOpen = () => modalDepth > 0;

/**
 * Mostra um diálogo modal. Retorna uma Promise com o `value` do botão clicado
 * (ou null ao cancelar). Se `form` for true, resolve com { value, data } contendo os campos.
 */
export function modal({ title, body, buttons = [{ label: 'OK', value: 'ok', primary: true }], width = 440, className = '', onOpen }) {
  return new Promise((resolve) => {
    modalDepth++;
    const prevFocus = document.activeElement;
    const backdrop = h('div', { class: 'modal-backdrop' });
    const content = typeof body === 'string' ? h('p', { class: 'modal-text', text: body }) : body;
    const footer = h('div', { class: 'modal-footer' });
    const dialog = h(
      'div',
      { class: `modal ${className}`, role: 'dialog', 'aria-modal': 'true', style: `width:${width}px` },
      h('div', { class: 'modal-header' }, h('h2', { text: title }), h('button', { class: 'icon-btn modal-close', title: 'Fechar', type: 'button', onclick: () => finish(null) }, icon('X', 16))),
      h('div', { class: 'modal-body' }, content),
      footer,
    );
    const finish = (value) => {
      modalDepth--;
      backdrop.remove();
      document.removeEventListener('keydown', onKey, true);
      if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
      const data = {};
      dialog.querySelectorAll('[name]').forEach((f) => (data[f.name] = f.type === 'checkbox' ? f.checked : f.value));
      resolve(value === null ? null : { value, data });
    };
    for (const b of buttons) {
      footer.append(
        h('button', {
          class: `btn${b.primary ? ' primary' : ''}${b.danger ? ' danger' : ''}`,
          type: 'button',
          text: b.label,
          onclick: () => finish(b.value),
          dataset: b.primary ? { primary: '1' } : {},
        }),
      );
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(null);
      } else if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
        const primary = footer.querySelector('[data-primary]');
        if (primary) {
          e.preventDefault();
          e.stopPropagation();
          primary.click();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop) finish(null);
    });
    backdrop.append(dialog);
    document.body.append(backdrop);
    requestAnimationFrame(() => {
      const first = dialog.querySelector('input, select, textarea') || footer.querySelector('[data-primary]') || footer.querySelector('button');
      first?.focus();
      if (first?.select) first.select();
      onOpen?.(dialog);
    });
  });
}

export async function alertDialog(title, text) {
  await modal({ title, body: text, buttons: [{ label: 'OK', value: 'ok', primary: true }] });
}

export async function confirmDialog(title, text, okLabel = 'OK', { danger = false } = {}) {
  const r = await modal({
    title,
    body: text,
    buttons: [
      { label: 'Cancelar', value: 'cancel' },
      { label: okLabel, value: 'ok', primary: true, danger },
    ],
  });
  return r?.value === 'ok';
}

export function field(label, name, value = '', attrs = {}) {
  return h('label', { class: 'field' }, h('span', { text: label }), h('input', { name, value, type: 'text', autocomplete: 'off', spellcheck: 'false', ...attrs }));
}

// ------------------------------------------------------------------ notificações
let toastTimer;
export function toast(text, kind = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.textContent = text;
  el.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = kind), 2200);
}

export function debounce(fn, ms) {
  let t;
  const d = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), typeof ms === 'function' ? ms() : ms);
  };
  d.cancel = () => clearTimeout(t);
  return d;
}
