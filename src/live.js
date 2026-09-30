// Edição direta na visualização (estilo Notion): clique num bloco para editar
// o Markdown dele no lugar; "/" abre a lista de blocos; alças + e ⋮⋮ ao passar o mouse.
import { icon, h, showMenu } from './ui.js';

const CARET = '‸';

export const BLOCK_TYPES = [
  { label: 'Texto', icon: 'Pilcrow', tpl: CARET },
  { label: 'Título 1', icon: 'Heading', tpl: `# ${CARET}` },
  { label: 'Título 2', icon: 'Heading', tpl: `## ${CARET}` },
  { label: 'Título 3', icon: 'Heading', tpl: `### ${CARET}` },
  { label: 'Lista', icon: 'List', tpl: `- ${CARET}` },
  { label: 'Lista numerada', icon: 'ListOrdered', tpl: `1. ${CARET}` },
  { label: 'Lista de tarefas', icon: 'ListTodo', tpl: `- [ ] ${CARET}` },
  { label: 'Citação', icon: 'TextQuote', tpl: `> ${CARET}` },
  { label: 'Alerta', icon: 'MessageSquareWarning', tpl: `> [!NOTE]\n> ${CARET}` },
  { label: 'Bloco de código', icon: 'SquareCode', tpl: `\`\`\`\n${CARET}\n\`\`\`` },
  { label: 'Tabela', icon: 'Table', tpl: `| ${CARET}Coluna 1 | Coluna 2 | Coluna 3 |\n| -------- | -------- | -------- |\n|          |          |          |` },
  { label: 'Linha horizontal', icon: 'Minus', tpl: `---${CARET}` },
  { label: 'Fórmula', icon: 'Sigma', tpl: `$$\n${CARET}\n$$` },
  { label: 'Diagrama', icon: 'Workflow', tpl: `\`\`\`mermaid\nflowchart LR\n    A[${CARET}Início] --> B[Fim]\n\`\`\`` },
  { label: 'Imagem', icon: 'Image', tpl: `![${CARET}descrição](imagem.png)` },
  { label: 'Seção recolhível', icon: 'ChevronsDownUp', tpl: `<details>\n<summary>${CARET}Título</summary>\n\nConteúdo\n\n</details>` },
];

const LIST_LINE = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)(\[[ xX]\]\s+)?(.*)$/;
const QUOTE_LINE = /^(\s*>\s?)(.*)$/;

export class LiveEdit {
  /**
   * @param {object} o
   * @param {HTMLElement} o.root   o .markdown-body
   * @param {HTMLElement} o.pane   contêiner com rolagem
   * @param {import('./preview.js').Preview} o.preview
   * @param {() => import('@codemirror/view').EditorView} o.getView
   * @param {() => boolean} o.isOn
   * @param {() => void} o.render           renderiza imediatamente
   * @param {(line:number) => void} o.openSource
   */
  constructor(o) {
    Object.assign(this, o);
    this.session = null;
    this.hovered = null;
    this._buildHandle();
    this.pane.addEventListener('mousemove', (e) => this._onHover(e));
    this.pane.addEventListener('mouseleave', () => this._hideHandle());
    this.pane.addEventListener('scroll', () => this.hovered && this._placeHandle(this.hovered), { passive: true });
  }

  get view() {
    return this.getView();
  }

  // ------------------------------------------------------------ blocos
  topBlock(node) {
    let el = node?.nodeType === 1 ? node : node?.parentElement;
    while (el && el.parentElement !== this.root) el = el.parentElement;
    return el && el.dataset.lineEnd != null ? el : null;
  }

  blocks() {
    return [...this.root.children].filter((el) => el.dataset.lineEnd != null);
  }

  /** Faixa de texto [from, to) de um bloco, sem linhas em branco no final. */
  range(el) {
    const doc = this.view.state.doc;
    const start = Math.min(+el.dataset.line, doc.lines - 1);
    let last = Math.min(+el.dataset.lineEnd, doc.lines) - 1;
    while (last > start && !doc.line(last + 1).text.trim()) last--;
    const from = doc.line(start + 1).from;
    const to = doc.line(last + 1).to;
    return { from, to, line: start, lines: last - start + 1 };
  }

  // ------------------------------------------------------------ cliques
  /** Chamado pelo clique na visualização. Devolve true se tratou o clique. */
  handleClick(e) {
    if (!this.isOn()) return false;
    if (e.target.closest('.live-block, .live-handle')) return true;
    if (e.target.closest('input.task-list-item-checkbox, .code-copy, summary')) return false;
    if (e.target.closest('a[href]') && (e.ctrlKey || e.metaKey)) return false;
    if (window.getSelection()?.toString()) return true; // o usuário está selecionando texto
    const block = this.topBlock(e.target);
    if (block) {
      e.preventDefault();
      this.edit(block, { x: e.clientX, y: e.clientY });
      return true;
    }
    // Clique em área vazia (abaixo do último bloco): novo bloco no fim.
    const blocks = this.blocks();
    const last = blocks[blocks.length - 1];
    if (!last || e.clientY > last.getBoundingClientRect().bottom) {
      this.insertAfter(last || null);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ sessão de edição
  edit(block, { x, y, caret } = {}) {
    if (this.session) {
      if (this.session.block === block) return;
      const line = +block.dataset.line;
      const editedLine = this.session.line;
      const delta = this.commit();
      const target = line > editedLine ? line + delta : line;
      const el = this.blocks().find((b) => +b.dataset.line === target);
      if (el) this.edit(el, { caret: 'end' });
      return;
    }
    const r = this.range(block);
    const original = this.view.state.sliceDoc(r.from, r.to);
    let pos = original.length;
    if (caret === 'start') pos = 0;
    else if (x != null) pos = this._caretFromPoint(block, original, x, y);
    this._open({ block, anchor: block, from: r.from, to: r.to, line: r.line, original, value: original, pos, replace: true });
  }

  insertAfter(block, value = '', pos = 0) {
    if (this.session) this.commit();
    const doc = this.view.state.doc;
    let at;
    if (block) {
      const el = this.blocks().find((b) => b.dataset.line === block.dataset.line) || block;
      at = this.range(el).to;
    } else at = doc.length;
    const anchor = block && block.isConnected ? block : null;
    const line = doc.lineAt(at).number - 1;
    this._open({ block: null, anchor, from: at, to: at, line, original: '', value, pos, replace: false });
  }

  _open(s) {
    this.preview.locked = true;
    this._hideHandle();
    const ta = h('textarea', {
      class: 'live-input',
      spellcheck: 'true',
      lang: 'pt-BR',
      rows: 1,
      placeholder: "Escreva, ou digite '/' para escolher um bloco…",
    });
    ta.value = s.value;
    const wrap = h('div', { class: 'live-block' }, ta);
    if (s.replace) s.block.replaceWith(wrap);
    else if (s.anchor) s.anchor.after(wrap);
    else this.root.append(wrap);
    s.wrap = wrap;
    s.ta = ta;
    this.session = s;
    ta.addEventListener('input', () => this._onInput());
    ta.addEventListener('keydown', (e) => this._onKey(e));
    ta.addEventListener('focusout', () =>
      setTimeout(() => {
        if (this.session?.ta !== ta) return;
        const a = document.activeElement;
        if (a === ta || a?.closest('.menu, .modal-backdrop')) return;
        this.commit();
      }, 0),
    );
    this._autosize();
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(s.pos, s.pos);
    const r = wrap.getBoundingClientRect();
    const pr = this.pane.getBoundingClientRect();
    if (r.bottom > pr.bottom - 20 || r.top < pr.top) wrap.scrollIntoView({ block: 'nearest' });
  }

  /** Grava o texto do bloco no documento. Devolve a diferença de linhas. */
  commit() {
    const s = this.session;
    if (!s) return 0;
    this.session = null;
    // Ignora itens de lista/citação vazios deixados no fim do bloco.
    const text = s.ta.value.replace(/\s+$/, '').replace(/(\n[ \t]*(?:[-*+]|\d{1,9}[.)]|>)[ \t]*(?:\[[ xX]\])?[ \t]*)+$/, '');
    let delta = 0;
    const view = this.view;
    if (s.replace) {
      if (text !== s.original) {
        if (text) {
          view.dispatch({ changes: { from: s.from, to: s.to, insert: text }, userEvent: 'input.live' });
          delta = text.split('\n').length - s.original.split('\n').length;
        } else {
          // Bloco apagado: remove também as linhas em branco seguintes.
          const doc = view.state.doc;
          let to = s.to;
          while (to < doc.length && doc.sliceString(to, to + 1) === '\n') to++;
          let from = s.from;
          if (to >= doc.length) while (from > 0 && doc.sliceString(from - 1, from) === '\n') from--;
          view.dispatch({ changes: { from, to }, userEvent: 'delete.live' });
          delta = -(s.original.split('\n').length + 1);
        }
      }
    } else if (text.trim()) {
      const doc = view.state.doc;
      const before = s.from === 0 ? '' : doc.sliceString(0, s.from).endsWith('\n\n') ? '' : doc.sliceString(0, s.from).endsWith('\n') ? '\n' : '\n\n';
      const afterText = doc.sliceString(s.from, s.from + 2);
      const after = s.from >= doc.length ? '\n' : afterText.startsWith('\n\n') ? '' : '\n';
      view.dispatch({ changes: { from: s.from, insert: before + text + after }, userEvent: 'input.live' });
      delta = (before + text + after).split('\n').length - 1;
    }
    this.preview.locked = false;
    s.wrap.remove();
    this.render();
    return delta;
  }

  cancel() {
    const s = this.session;
    if (!s) return;
    this.session = null;
    this.preview.locked = false;
    s.wrap.remove();
    this.render();
  }

  /** Abandona a edição sem gravar (ex.: outro documento foi aberto). */
  discard() {
    const s = this.session;
    this.session = null;
    this.preview.locked = false;
    s?.wrap.remove();
    this._hideHandle();
  }

  /** Encerra a edição atual (ex.: troca de modo). */
  finish() {
    if (this.session) this.commit();
    this._hideHandle();
  }

  _autosize() {
    const ta = this.session?.ta;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight + 2}px`;
  }

  _caretFromPoint(block, source, x, y) {
    try {
      const range = document.caretRangeFromPoint(x, y);
      if (!range || !block.contains(range.startContainer)) return source.length;
      const pre = document.createRange();
      pre.setStart(block, 0);
      pre.setEnd(range.startContainer, range.startOffset);
      const prefix = pre.toString();
      const needle = (prefix.match(/[\p{L}\p{N}]+[^\p{L}\p{N}]*$/u) || [''])[0].trimEnd();
      if (!needle) return prefix.length === 0 ? source.search(/[\p{L}\p{N}]/u) >= 0 ? source.search(/[\p{L}\p{N}]/u) : 0 : source.length;
      const ratio = prefix.length / Math.max(1, block.textContent.length);
      const approx = Math.floor(ratio * source.length);
      let best = -1;
      let bestDist = Infinity;
      for (let i = source.indexOf(needle); i >= 0; i = source.indexOf(needle, i + 1)) {
        const d = Math.abs(i - approx);
        if (d < bestDist) {
          best = i;
          bestDist = d;
        }
      }
      return best >= 0 ? best + needle.length : source.length;
    } catch {
      return source.length;
    }
  }

  // ------------------------------------------------------------ teclado
  _onInput() {
    this._autosize();
    const ta = this.session.ta;
    const pos = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf('\n', pos - 1) + 1;
    if (ta.value.slice(lineStart, pos) === '/' && (ta.value[pos] === undefined || ta.value[pos] === '\n')) this._slashMenu(lineStart);
  }

  _slashMenu(lineStart) {
    const ta = this.session.ta;
    const r = ta.getBoundingClientRect();
    showMenu(
      [
        { header: 'Blocos' },
        ...BLOCK_TYPES.map((b) => ({
          label: b.label,
          icon: b.icon,
          action: () => this._applyTemplate(b.tpl, lineStart, lineStart + 1),
        })),
      ],
      { x: r.left, y: r.top + 28 },
      { className: 'scroll' },
    );
  }

  _applyTemplate(tpl, from, to) {
    const ta = this.session?.ta;
    if (!ta) return;
    const caret = tpl.indexOf(CARET);
    const text = tpl.replace(CARET, '');
    ta.focus();
    ta.setRangeText(text, from, to, 'end');
    const p = from + (caret >= 0 ? caret : text.length);
    ta.setSelectionRange(p, p);
    this._autosize();
  }

  _wrap(before, after = before) {
    const ta = this.session.ta;
    const { selectionStart: a, selectionEnd: b, value } = ta;
    const sel = value.slice(a, b);
    if (value.slice(a - before.length, a) === before && value.slice(b, b + after.length) === after) {
      ta.setRangeText(sel, a - before.length, b + after.length, 'select');
    } else {
      ta.setRangeText(before + sel + after, a, b, 'end');
      ta.setSelectionRange(a + before.length, a + before.length + sel.length);
    }
    this._autosize();
  }

  _kind(value) {
    const first = value.split('\n')[0];
    if (/^\s*(```|~~~|\$\$|<)/.test(first) || first.includes('|')) return 'raw';
    if (LIST_LINE.test(first)) return 'list';
    if (/^\s*>/.test(first)) return 'quote';
    return 'text';
  }

  _onKey(e) {
    const s = this.session;
    const ta = s.ta;
    const { selectionStart: a, selectionEnd: b, value } = ta;
    const mod = e.ctrlKey || e.metaKey;
    e.stopPropagation();

    if (e.key === 'Escape') {
      e.preventDefault();
      this.commit();
      return;
    }
    if (mod && !e.shiftKey && ['b', 'i', 'k', '`'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      const k = e.key.toLowerCase();
      if (k === 'b') this._wrap('**');
      else if (k === 'i') this._wrap('*');
      else if (k === '`') this._wrap('`');
      else {
        const sel = value.slice(a, b) || 'link';
        ta.setRangeText(`[${sel}](https://)`, a, b, 'end');
        ta.setSelectionRange(a + sel.length + 3, a + sel.length + 11);
      }
      return;
    }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'x') {
      e.preventDefault();
      this._wrap('~~');
      return;
    }
    if (mod && e.key.toLowerCase() === 's') return; // deixa o Ctrl+S global salvar (o foco sai e confirma)
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      const block = s.block;
      const line = s.replace ? +block?.dataset.line : null;
      this.commit();
      const el = line != null ? this.blocks().find((x) => +x.dataset.line === line) : this.blocks().at(-1);
      this.insertAfter(el || null);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const ls = value.lastIndexOf('\n', a - 1) + 1;
      if (e.shiftKey) {
        const m = value.slice(ls).match(/^ {1,2}/);
        if (m) ta.setRangeText('', ls, ls + m[0].length, 'end');
      } else ta.setRangeText('  ', ls, ls, 'end');
      ta.setSelectionRange(Math.max(ls, a + (e.shiftKey ? -2 : 2)), Math.max(ls, a + (e.shiftKey ? -2 : 2)));
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && a === b) {
      const kind = this._kind(value);
      const ls = value.lastIndexOf('\n', a - 1) + 1;
      const le = value.indexOf('\n', a) === -1 ? value.length : value.indexOf('\n', a);
      const line = value.slice(ls, le);
      if (kind === 'list') {
        const m = line.match(LIST_LINE);
        if (m) {
          e.preventDefault();
          if (!m[5].trim() && a === le) {
            // Item vazio: sai da lista e começa um bloco novo.
            ta.setRangeText('', ls > 0 ? ls - 1 : ls, le, 'end');
            this._splitToNewBlock('');
            return;
          }
          const num = /\d/.test(m[2]) ? `${parseInt(m[2], 10) + 1}${m[2].slice(-1)}` : m[2];
          const insert = `\n${m[1]}${num}${m[3]}${m[4] ? '[ ] ' : ''}`;
          ta.setRangeText(insert, a, a, 'end');
          this._autosize();
          return;
        }
      }
      if (kind === 'quote') {
        const m = line.match(QUOTE_LINE);
        e.preventDefault();
        if (!m[2].trim() && a === le) {
          ta.setRangeText('', ls > 0 ? ls - 1 : ls, le, 'end');
          this._splitToNewBlock('');
          return;
        }
        ta.setRangeText(`\n${m[1]}`, a, a, 'end');
        this._autosize();
        return;
      }
      if (kind === 'text') {
        // Como no Notion: Enter cria um novo bloco (Shift+Enter quebra a linha).
        e.preventDefault();
        const after = value.slice(a);
        ta.value = value.slice(0, a);
        this._splitToNewBlock(after.replace(/^\s+/, ''));
        return;
      }
      return;
    }
    if (e.key === 'Backspace' && a === 0 && b === 0 && !value) {
      e.preventDefault();
      const prevLine = this._neighbor(-1);
      this.commit();
      const el = prevLine != null ? this.blocks().find((x) => +x.dataset.line === prevLine) : null;
      if (el) this.edit(el, { caret: 'end' });
      return;
    }
    const lineIndex = value.slice(0, a).split('\n').length - 1;
    const lineCount = value.split('\n').length;
    if (e.key === 'ArrowUp' && lineIndex === 0 && !e.shiftKey) {
      const prevLine = this._neighbor(-1);
      if (prevLine == null) return;
      e.preventDefault();
      this.commit();
      const el = this.blocks().find((x) => +x.dataset.line === prevLine);
      if (el) this.edit(el, { caret: 'end' });
      return;
    }
    if (e.key === 'ArrowDown' && lineIndex === lineCount - 1 && !e.shiftKey) {
      const nextLine = this._neighbor(1);
      if (nextLine == null) return;
      e.preventDefault();
      const delta = this.commit();
      const el = this.blocks().find((x) => +x.dataset.line === nextLine + delta);
      if (el) this.edit(el, { caret: 'start' });
    }
  }

  /** Linha de origem do bloco vizinho ao que está em edição. */
  _neighbor(dir) {
    const wrap = this.session?.wrap;
    if (!wrap) return null;
    let el = dir < 0 ? wrap.previousElementSibling : wrap.nextElementSibling;
    while (el && el.dataset.lineEnd == null) el = dir < 0 ? el.previousElementSibling : el.nextElementSibling;
    return el ? +el.dataset.line : null;
  }

  _splitToNewBlock(rest) {
    const s = this.session;
    const line = s.replace ? +s.block.dataset.line : null;
    const wasInsert = !s.replace;
    const from = s.from;
    this.commit();
    let el = null;
    if (line != null) el = this.blocks().find((x) => +x.dataset.line === line);
    else if (wasInsert) {
      // O bloco recém-criado começa logo depois da posição onde foi inserido.
      const lineNo = this.view.state.doc.lineAt(Math.min(from + 2, this.view.state.doc.length)).number - 1;
      el = this.blocks().find((x) => +x.dataset.line === lineNo) || this.blocks().at(-1);
    }
    this.insertAfter(el, rest, 0);
  }

  // ------------------------------------------------------------ alças (+ e ⋮⋮)
  _buildHandle() {
    this.handle = h(
      'div',
      { class: 'live-handle', hidden: true },
      h('button', { type: 'button', title: 'Adicionar bloco abaixo', onclick: () => this.hovered && this.insertAfter(this.hovered) }, icon('Plus', 15)),
      h('button', { type: 'button', class: 'live-grip', title: 'Clique para opções · segure e arraste para mover' }, icon('GripVertical', 15)),
    );
    this.handle.addEventListener('mousedown', (e) => e.preventDefault());
    this._setupGrip(this.handle.querySelector('.live-grip'));
    this.pane.append(this.handle);
  }

  // ------------------------------------------------------------ arrastar blocos
  /** Clique rápido abre o menu; segurar (ou arrastar) move o bloco. */
  _setupGrip(grip) {
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.hovered) return;
      e.preventDefault();
      const block = this.hovered;
      const start = { x: e.clientX, y: e.clientY };
      let timer = null;
      let started = false;
      grip.setPointerCapture(e.pointerId);
      const begin = (ev) => {
        if (started) return;
        started = true;
        clearTimeout(timer);
        this._dragStart(block, ev || e);
      };
      timer = setTimeout(() => begin(null), 280);
      const move = (ev) => {
        if (!started && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 4) begin(ev);
        if (started) this._dragMove(ev);
      };
      const up = (ev) => {
        clearTimeout(timer);
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        try {
          grip.releasePointerCapture(e.pointerId);
        } catch {
          /* já liberado */
        }
        if (started) this._dragEnd(ev.type === 'pointercancel');
        else this._blockMenu(block, grip);
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
  }

  _dragStart(block, e) {
    const r = block.getBoundingClientRect();
    const blocks = this.blocks();
    const d = (this.drag = {
      block,
      index: blocks.indexOf(block),
      target: null,
      offsetY: e.clientY - r.top,
      offsetX: e.clientX - r.left,
      height: r.height,
      slot: null,
      lastY: e.clientY,
    });
    this.handle.hidden = true;
    block.classList.remove('live-hover');
    document.body.classList.add('live-dragging');

    // "Desencaixe": o bloco se solta da página e flutua com sombra.
    const ghost = h('div', { class: 'markdown-body live-ghost' });
    ghost.style.cssText = `width:${r.width}px;left:${r.left}px;top:${r.top}px;font-size:${getComputedStyle(this.root).fontSize}`;
    ghost.append(block.cloneNode(true));
    document.body.append(ghost);
    d.ghost = ghost;
    requestAnimationFrame(() => ghost.classList.add('lifted'));

    // O lugar original se fecha suavemente.
    const cs = getComputedStyle(block);
    d.origin = { marginTop: cs.marginTop, marginBottom: cs.marginBottom };
    block.style.height = `${r.height}px`;
    block.classList.add('live-drag-origin');
    block.getBoundingClientRect();
    block.style.height = '0px';
    block.style.marginTop = '0px';
    block.style.marginBottom = '0px';

    this._escHandler = (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        this._dragEnd(true);
      }
    };
    document.addEventListener('keydown', this._escHandler, true);
    this._dragMove(e);
    this._autoScroll();
  }

  _dragMove(e) {
    const d = this.drag;
    if (!d) return;
    d.lastY = e.clientY;
    d.ghost.style.top = `${e.clientY - d.offsetY}px`;
    d.ghost.style.left = `${e.clientX - d.offsetX}px`;

    // Índice de inserção: antes do primeiro bloco cujo meio está abaixo do ponteiro.
    const blocks = this.blocks().filter((b) => b !== d.block);
    let target = blocks.length;
    for (let i = 0; i < blocks.length; i++) {
      const br = blocks[i].getBoundingClientRect();
      if (e.clientY < br.top + br.height / 2) {
        target = i;
        break;
      }
    }
    if (target === d.target) return;
    d.target = target;
    this._placeSlot(target < blocks.length ? blocks[target] : null);
  }

  /** Abre um espaço animado onde o bloco vai encaixar. */
  _placeSlot(beforeEl) {
    const d = this.drag;
    const old = d.slot;
    if (old) {
      old.style.height = '0px';
      old.style.marginBottom = '0px';
      old.classList.add('closing');
      setTimeout(() => old.remove(), 200);
    }
    const slot = h('div', { class: 'live-drop-slot' });
    if (beforeEl) beforeEl.before(slot);
    else this.root.append(slot);
    slot.getBoundingClientRect();
    slot.style.height = `${d.height}px`;
    slot.style.marginBottom = '1em';
    d.slot = slot;
  }

  _autoScroll() {
    const d = this.drag;
    if (!d) return;
    const pr = this.pane.getBoundingClientRect();
    const edge = 60;
    let dy = 0;
    if (d.lastY < pr.top + edge) dy = -Math.ceil((pr.top + edge - d.lastY) / 4);
    else if (d.lastY > pr.bottom - edge) dy = Math.ceil((d.lastY - (pr.bottom - edge)) / 4);
    if (dy) this.pane.scrollTop += dy;
    d.raf = requestAnimationFrame(() => this._autoScroll());
  }

  _dragEnd(cancel) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    cancelAnimationFrame(d.raf);
    document.removeEventListener('keydown', this._escHandler, true);
    document.body.classList.remove('live-dragging');

    // Sem mudança de posição (ou cancelado): volta para o lugar de origem.
    const noMove = cancel || d.target == null || d.target === d.index;
    const slot = d.slot;
    const restoreOrigin = () => {
      d.block.style.height = '';
      d.block.style.marginTop = '';
      d.block.style.marginBottom = '';
      d.block.classList.remove('live-drag-origin');
    };

    if (noMove) {
      if (slot) {
        slot.style.height = '0px';
        slot.style.marginBottom = '0px';
      }
      d.block.style.height = `${d.height}px`;
      d.block.style.marginTop = d.origin.marginTop;
      d.block.style.marginBottom = d.origin.marginBottom;
      const target = d.block.getBoundingClientRect();
      this._flyGhost(d.ghost, target, () => {
        slot?.remove();
        restoreOrigin();
      });
      return;
    }

    // "Encaixe": o bloco desliza até o espaço aberto e assenta.
    const target = slot.getBoundingClientRect();
    this._flyGhost(d.ghost, target, () => {
      const line = this._moveTo(d.block, d.target);
      slot.remove();
      restoreOrigin();
      this.render();
      const el = this.blocks().find((b) => +b.dataset.line === line);
      if (el) {
        el.classList.add('live-settle');
        setTimeout(() => el.classList.remove('live-settle'), 700);
      }
    });
  }

  _flyGhost(ghost, rect, done) {
    ghost.classList.add('landing');
    ghost.classList.remove('lifted');
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      ghost.remove();
      done();
    };
    ghost.addEventListener('transitionend', (ev) => ev.propertyName === 'top' && finish());
    setTimeout(finish, 320);
  }

  /** Move o texto do bloco para antes do bloco de índice `target` (sem contar ele mesmo). Devolve a nova linha inicial. */
  _moveTo(block, target) {
    const view = this.view;
    const doc = view.state.doc;
    const others = this.blocks().filter((b) => b !== block);
    const src = this.range(block);
    const text = doc.sliceString(src.from, src.to);

    // Remove o bloco e as linhas em branco que o separam do próximo.
    let delFrom = src.from;
    let delTo = src.to;
    while (delTo < doc.length && doc.sliceString(delTo, delTo + 1) === '\n') delTo++;
    if (delTo >= doc.length) while (delFrom > 0 && doc.sliceString(delFrom - 1, delFrom) === '\n') delFrom--;

    let insertAt;
    let insert;
    if (target < others.length) {
      insertAt = this.range(others[target]).from;
      insert = `${text}\n\n`;
    } else {
      insertAt = doc.length;
      const tail = doc.sliceString(Math.max(0, doc.length - 2), doc.length);
      insert = `${tail.endsWith('\n\n') ? '' : tail.endsWith('\n') ? '\n' : '\n\n'}${text}\n`;
    }
    const changes = view.state.changes(
      [
        { from: delFrom, to: delTo },
        { from: insertAt, insert },
      ].sort((a, b) => a.from - b.from),
    );
    view.dispatch({ changes, userEvent: 'move.live' });
    const newDoc = view.state.doc;
    const lead = insert.length - insert.trimStart().length;
    const at = Math.min(changes.mapPos(insertAt, -1) + lead, newDoc.length);
    return newDoc.lineAt(at).number - 1;
  }

  _onHover(e) {
    // Agrupa os movimentos do mouse por quadro de tela.
    this._hoverTarget = e.target;
    if (this._hoverQueued) return;
    this._hoverQueued = true;
    requestAnimationFrame(() => {
      this._hoverQueued = false;
      const target = this._hoverTarget;
      if (!this.isOn() || this.session || this.drag || !target?.closest) return;
      if (target.closest('.live-handle')) return;
      const block = this.topBlock(target);
      // Só reposiciona quando o bloco muda (a rolagem reposiciona por conta própria).
      if (!block || (block === this.hovered && !this.handle.hidden)) return;
      this.hovered?.classList.remove('live-hover');
      this.hovered = block;
      block.classList.add('live-hover');
      this._placeHandle(block);
    });
  }

  _placeHandle(block) {
    if (!block.isConnected) return this._hideHandle();
    const pr = this.pane.getBoundingClientRect();
    const br = block.getBoundingClientRect();
    const rr = this.root.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(block).lineHeight) || 24;
    const top = br.top - pr.top + this.pane.scrollTop + Math.max(0, Math.min(lh, br.height) / 2 - 12);
    this.handle.style.top = `${top}px`;
    this.handle.style.left = `${Math.max(2, rr.left - pr.left + parseFloat(getComputedStyle(this.root).paddingLeft) - 54)}px`;
    this.handle.hidden = false;
  }

  _hideHandle() {
    this.handle.hidden = true;
    this.hovered?.classList.remove('live-hover');
    this.hovered = null;
  }

  _replaceBlockText(block, fn) {
    const r = this.range(block);
    const text = this.view.state.sliceDoc(r.from, r.to);
    this.view.dispatch({ changes: { from: r.from, to: r.to, insert: fn(text) }, userEvent: 'input.live' });
    this.render();
  }

  _siblingBlock(block, dir) {
    let el = dir < 0 ? block.previousElementSibling : block.nextElementSibling;
    while (el && el.dataset.lineEnd == null) el = dir < 0 ? el.previousElementSibling : el.nextElementSibling;
    return el;
  }

  _move(block, dir) {
    const other = this._siblingBlock(block, dir);
    if (!other) return;
    const [first, second] = dir < 0 ? [other, block] : [block, other];
    const a = this.range(first);
    const b = this.range(second);
    const doc = this.view.state;
    const ta = doc.sliceDoc(a.from, a.to);
    const tb = doc.sliceDoc(b.from, b.to);
    const between = doc.sliceDoc(a.to, b.from);
    this.view.dispatch({ changes: { from: a.from, to: b.to, insert: tb + between + ta }, userEvent: 'input.live' });
    this.render();
  }

  _blockMenu(block, anchorEl) {
    const strip = (t) =>
      t
        .split('\n')
        .map((l) => l.replace(/^\s{0,3}#{1,6}\s+/, '').replace(/^\s*>\s?/, '').replace(/^\s*(?:[-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, ''))
        .join('\n');
    const lines = (t) => strip(t).split('\n').filter((l) => l.trim());
    const transform = [
      { label: 'Texto', icon: 'Pilcrow', fn: (t) => lines(t).join('\n') },
      { label: 'Título 1', icon: 'Heading', fn: (t) => `# ${lines(t).join(' ')}` },
      { label: 'Título 2', icon: 'Heading', fn: (t) => `## ${lines(t).join(' ')}` },
      { label: 'Título 3', icon: 'Heading', fn: (t) => `### ${lines(t).join(' ')}` },
      { label: 'Lista', icon: 'List', fn: (t) => lines(t).map((l) => `- ${l}`).join('\n') },
      { label: 'Lista numerada', icon: 'ListOrdered', fn: (t) => lines(t).map((l, i) => `${i + 1}. ${l}`).join('\n') },
      { label: 'Lista de tarefas', icon: 'ListTodo', fn: (t) => lines(t).map((l) => `- [ ] ${l}`).join('\n') },
      { label: 'Citação', icon: 'TextQuote', fn: (t) => lines(t).map((l) => `> ${l}`).join('\n') },
    ];
    const r = anchorEl.getBoundingClientRect();
    showMenu(
      [
        { label: 'Editar', icon: 'PenLine', action: () => this.edit(block) },
        { label: 'Adicionar bloco abaixo', icon: 'Plus', action: () => this.insertAfter(block) },
        { label: 'Transformar em', icon: 'RefreshCw', submenu: () => transform.map((x) => ({ label: x.label, icon: x.icon, action: () => this._replaceBlockText(block, x.fn) })) },
        '-',
        { label: 'Mover para cima', icon: 'ArrowUp', disabled: !this._siblingBlock(block, -1), action: () => this._move(block, -1) },
        { label: 'Mover para baixo', icon: 'ArrowDown', disabled: !this._siblingBlock(block, 1), action: () => this._move(block, 1) },
        { label: 'Duplicar', icon: 'Copy', action: () => this._replaceBlockText(block, (t) => `${t}\n\n${t}`) },
        '-',
        { label: 'Ver no Markdown', icon: 'Code', action: () => this.openSource(+block.dataset.line) },
        {
          label: 'Excluir',
          icon: 'Trash2',
          danger: true,
          action: () => {
            const range = this.range(block);
            const doc = this.view.state.doc;
            let to = range.to;
            while (to < doc.length && doc.sliceString(to, to + 1) === '\n') to++;
            let from = range.from;
            if (to >= doc.length) while (from > 0 && doc.sliceString(from - 1, from) === '\n') from--;
            this.view.dispatch({ changes: { from, to }, userEvent: 'delete.live' });
            this.render();
          },
        },
      ],
      { x: r.left, y: r.bottom + 4 },
    );
  }
}

