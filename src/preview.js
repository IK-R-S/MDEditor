// Visualização renderizada: atualização incremental, imagens locais, Mermaid,
// mapeamento de linhas (rolagem sincronizada) e busca no texto.
import morphdom from 'morphdom';
import { renderToFragment } from './markdown.js';
import { resolveLocal } from './paths.js';

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let mermaid = null;
let mermaidTheme = null;
let mermaidSeq = 0;
const mermaidCache = new Map(); // `${tema}\0${código}` -> { html, error }

export class Preview {
  /**
   * @param {HTMLElement} root  elemento .markdown-body
   * @param {HTMLElement} pane  contêiner com rolagem
   */
  constructor(root, pane, { toAssetUrl, getBaseDir, getTheme }) {
    this.root = root;
    this.pane = pane;
    this.toAssetUrl = toAssetUrl;
    this.getBaseDir = getBaseDir;
    this.getTheme = getTheme;
    this._lines = null;
    this.onRendered = null;
    const invalidate = () => (this._lines = null);
    new ResizeObserver(invalidate).observe(root);
    root.addEventListener('load', invalidate, true);
  }

  render(src) {
    // Durante a edição de um bloco na página, a atualização fica suspensa.
    if (this.locked) return;
    const tpl = document.createElement('div');
    tpl.append(renderToFragment(src));
    this._prepare(tpl);
    morphdom(this.root, tpl, {
      childrenOnly: true,
      onBeforeElUpdated: (from, to) => {
        // Preserva <details> abertos pelo usuário.
        if (from.tagName === 'DETAILS' && from.open !== to.hasAttribute('open') && from.dataset.userToggled) {
          if (from.open) to.setAttribute('open', '');
          else to.removeAttribute('open');
        }
        return !from.isEqualNode(to);
      },
    });
    this._lines = null;
    this._renderMermaid();
  }

  _prepare(tpl) {
    const base = this.getBaseDir();
    for (const img of tpl.querySelectorAll('img[src]')) {
      const src = img.getAttribute('src');
      const local = resolveLocal(src, base);
      if (local) {
        img.setAttribute('data-src', src);
        img.setAttribute('src', this.toAssetUrl(local));
      }
      img.setAttribute('loading', 'lazy');
    }
    for (const a of tpl.querySelectorAll('a[href^="#fn"]')) a.setAttribute('data-footnote', '');
    const theme = this.getTheme();
    for (const block of tpl.querySelectorAll('.mermaid-block')) {
      const cached = mermaidCache.get(theme + '\0' + decodeURIComponent(block.dataset.mermaid));
      if (cached) {
        block.innerHTML = cached.html;
        block.classList.add('rendered');
        if (cached.error) block.classList.add('error');
      }
    }
  }

  async _renderMermaid() {
    const blocks = [...this.root.querySelectorAll('.mermaid-block:not(.rendered)')];
    if (!blocks.length) return;
    if (!mermaid) mermaid = (await import('mermaid')).default;
    const theme = this.getTheme();
    if (mermaidTheme !== theme) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: theme === 'dark' ? 'dark' : 'default',
        fontFamily: '"Segoe UI Variable Text", "Segoe UI", sans-serif',
      });
      mermaidTheme = theme;
    }
    for (const block of blocks) {
      const code = decodeURIComponent(block.dataset.mermaid);
      const key = theme + '\0' + code;
      let entry = mermaidCache.get(key);
      if (!entry) {
        const id = `mmd-${++mermaidSeq}`;
        try {
          const { svg } = await mermaid.render(id, code);
          entry = { html: svg, error: false };
        } catch (e) {
          document.getElementById(id)?.remove();
          document.getElementById('d' + id)?.remove();
          const msg = String(e?.message || e).split('\n').slice(0, 6).join('\n');
          entry = {
            html: `<div class="mermaid-error"><strong>Erro no diagrama Mermaid</strong><pre>${escapeHtml(msg)}</pre></div><pre class="mermaid-source">${escapeHtml(code)}</pre>`,
            error: true,
          };
        }
        mermaidCache.set(key, entry);
        if (mermaidCache.size > 80) mermaidCache.delete(mermaidCache.keys().next().value);
      }
      if (!block.isConnected || block.classList.contains('rendered')) continue;
      if (decodeURIComponent(block.dataset.mermaid) !== code) continue;
      block.innerHTML = entry.html;
      block.classList.add('rendered');
      if (entry.error) block.classList.add('error');
    }
    this._lines = null;
    this.onRendered?.();
  }

  /** Força nova renderização dos diagramas (ex.: troca de tema). */
  resetDiagrams() {
    for (const b of this.root.querySelectorAll('.mermaid-block.rendered')) {
      b.classList.remove('rendered', 'error');
      b.innerHTML = `<pre class="mermaid-source">${escapeHtml(decodeURIComponent(b.dataset.mermaid))}</pre>`;
    }
    this._renderMermaid();
  }

  headings() {
    return [...this.root.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((el) => ({
      el,
      level: +el.tagName[1],
      text: el.textContent.trim(),
      id: el.id,
      line: el.dataset.line != null ? +el.dataset.line : null,
    }));
  }

  // --------------------------------------------------------------- mapeamento de linhas
  _lineMap() {
    if (this._lines) return this._lines;
    const paneTop = this.pane.getBoundingClientRect().top - this.pane.scrollTop;
    const seen = new Set();
    const out = [];
    for (const el of this.root.querySelectorAll('[data-line]')) {
      const line = +el.dataset.line;
      if (seen.has(line)) continue;
      const r = el.getBoundingClientRect();
      if (!r.height && !r.width) continue;
      seen.add(line);
      out.push({ line, top: r.top - paneTop, height: r.height });
    }
    out.sort((a, b) => a.line - b.line);
    this._lines = out;
    return out;
  }

  /** Rola a visualização para a linha de origem (base 0, fracionária). */
  scrollToLine(line) {
    const pane = this.pane;
    if (line === Infinity) {
      pane.scrollTop = pane.scrollHeight;
      return;
    }
    const map = this._lineMap();
    if (!map.length || line <= 0) {
      pane.scrollTop = 0;
      return;
    }
    let prev = null;
    let next = null;
    for (const e of map) {
      if (e.line <= line) prev = e;
      else {
        next = e;
        break;
      }
    }
    let top;
    if (!prev) top = 0;
    else if (next) top = prev.top + ((next.top - prev.top) * (line - prev.line)) / (next.line - prev.line);
    else top = prev.top + prev.height * Math.min(1, line - prev.line);
    pane.scrollTop = Math.max(0, top - 16);
  }

  /** Linha de origem (base 0, fracionária) no topo da visualização. */
  topLine() {
    const pane = this.pane;
    if (pane.scrollTop <= 0) return 0;
    if (pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 2) return Infinity;
    const map = this._lineMap();
    if (!map.length) return 0;
    const y = pane.scrollTop + 16;
    let prev = null;
    let next = null;
    for (const e of map) {
      if (e.top <= y) prev = e;
      else if (prev && e.top > prev.top) {
        next = e;
        break;
      }
    }
    if (!prev) return 0;
    if (!next) return prev.line + Math.min(1, (y - prev.top) / Math.max(prev.height, 1));
    return prev.line + ((next.line - prev.line) * (y - prev.top)) / (next.top - prev.top);
  }

  /** Linha de origem do bloco que contém o elemento. */
  lineOf(node) {
    const el = node?.closest?.('[data-line]');
    return el ? +el.dataset.line : null;
  }

  scrollToId(id, smooth = true) {
    let el = null;
    try {
      el = this.root.querySelector('#' + CSS.escape(id)) || this.root.querySelector(`[name="${CSS.escape(id)}"]`);
    } catch {
      /* id inválido */
    }
    if (!el) {
      const slug = id.toLowerCase();
      el = [...this.root.querySelectorAll('[id]')].find((e) => e.id.toLowerCase() === slug);
    }
    if (!el) return false;
    const top = el.getBoundingClientRect().top - this.pane.getBoundingClientRect().top + this.pane.scrollTop - 12;
    this.pane.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1200);
    return true;
  }
}

// ------------------------------------------------------------------ busca na visualização
export class PreviewFind {
  constructor(root, pane) {
    this.root = root;
    this.pane = pane;
    this.ranges = [];
    this.index = -1;
    this.supported = typeof CSS !== 'undefined' && 'highlights' in CSS;
  }

  search(query, { caseSensitive = false } = {}) {
    this.clear();
    if (!query) return 0;
    const q = caseSensitive ? query : query.toLowerCase();
    const walker = document.createTreeWalker(this.root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement?.closest('.code-header, .katex-mathml') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = caseSensitive ? node.data : node.data.toLowerCase();
      let i = text.indexOf(q);
      while (i >= 0) {
        const r = new Range();
        r.setStart(node, i);
        r.setEnd(node, i + q.length);
        this.ranges.push(r);
        i = text.indexOf(q, i + q.length);
      }
    }
    if (this.supported && this.ranges.length) CSS.highlights.set('cm-find', new Highlight(...this.ranges));
    if (this.ranges.length) {
      // Começa na primeira ocorrência visível.
      const top = this.pane.getBoundingClientRect().top;
      const i = this.ranges.findIndex((r) => r.getBoundingClientRect().top >= top);
      this.go(i < 0 ? 0 : i);
    }
    return this.ranges.length;
  }

  go(i) {
    if (!this.ranges.length) return;
    this.index = (i + this.ranges.length) % this.ranges.length;
    const r = this.ranges[this.index];
    if (this.supported) CSS.highlights.set('cm-find-current', new Highlight(r));
    const rect = r.getBoundingClientRect();
    const pr = this.pane.getBoundingClientRect();
    if (rect.top < pr.top + 40 || rect.bottom > pr.bottom - 40) {
      this.pane.scrollTop += rect.top - pr.top - pr.height / 3;
    }
  }

  next() {
    this.go(this.index + 1);
  }

  prev() {
    this.go(this.index - 1);
  }

  clear() {
    this.ranges = [];
    this.index = -1;
    if (this.supported) {
      CSS.highlights.delete('cm-find');
      CSS.highlights.delete('cm-find-current');
    }
  }
}
