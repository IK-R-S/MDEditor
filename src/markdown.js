// Pipeline de renderização Markdown → HTML seguro.
import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';
import mark from 'markdown-it-mark';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import ins from 'markdown-it-ins';
import { full as emoji } from 'markdown-it-emoji';
import deflist from 'markdown-it-deflist';
import abbr from 'markdown-it-abbr';
import anchor from 'markdown-it-anchor';
import frontMatter from 'markdown-it-front-matter';
import alerts from 'markdown-it-github-alerts';
import katexModule from '@vscode/markdown-it-katex';
import hljs from 'highlight.js/lib/core';
import DOMPurify from 'dompurify';

const katexPlugin = katexModule.default || katexModule;

// ------------------------------------------------------------------ recursos sob demanda
// KaTeX (~250 KB) e as linguagens do highlight.js só são carregados quando o documento
// realmente tem fórmulas ou blocos de código. Enquanto carregam, o conteúdo aparece como
// texto e a visualização é atualizada assim que ficam prontos.
const assetListeners = new Set();
let notifyQueued = false;
function notifyAssets() {
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => {
    notifyQueued = false;
    for (const cb of assetListeners) cb();
  });
}
/** Chamado quando um recurso sob demanda (KaTeX, linguagem de código) termina de carregar. */
export function onAssetsLoaded(cb) {
  assetListeners.add(cb);
}

let katexLib = null;
let katexLoading = null;
function loadKatex() {
  katexLoading ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')])
    .then(([m]) => {
      katexLib = m.default || m;
      notifyAssets();
    })
    .catch(() => {});
  return katexLoading;
}
const katexProxy = {
  renderToString(tex, opts = {}) {
    if (katexLib) return katexLib.renderToString(tex, opts);
    loadKatex();
    return `<span class="math-pending${opts.displayMode ? ' display' : ''}">${escapeHtml(tex)}</span>`;
  },
};

const HLJS_LANGS = import.meta.glob('/node_modules/highlight.js/es/languages/*.js');
const LANG_FILES = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', node: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', py: 'python', python3: 'python', rb: 'ruby',
  rs: 'rust', kt: 'kotlin', kts: 'kotlin', cs: 'csharp', 'c#': 'csharp', 'c++': 'cpp', cc: 'cpp', hpp: 'cpp',
  cxx: 'cpp', h: 'c', sh: 'bash', zsh: 'bash', ps: 'powershell', ps1: 'powershell', pwsh: 'powershell',
  bat: 'dos', cmd: 'dos', yml: 'yaml', html: 'xml', xhtml: 'xml', svg: 'xml', vue: 'xml', md: 'markdown',
  mkd: 'markdown', golang: 'go', docker: 'dockerfile', jsonc: 'json', json5: 'json', txt: 'plaintext',
  text: 'plaintext', plain: 'plaintext', make: 'makefile', mk: 'makefile', tex: 'latex', objc: 'objectivec',
  proto: 'protobuf', gql: 'graphql', toml: 'ini', patch: 'diff', console: 'shell', 'shell-session': 'shell',
  vb: 'vbnet', 'f#': 'fsharp', fs: 'fsharp', hs: 'haskell', ex: 'elixir', exs: 'elixir', erl: 'erlang',
  pl: 'perl', m: 'objectivec', sass: 'scss', styl: 'stylus', rlang: 'r', jl: 'julia', nim: 'nim', zig: 'zig',
};
const langLoading = new Set();
/** true se a linguagem já pode ser realçada; caso contrário começa a carregá-la. */
function ensureLanguage(lang) {
  if (hljs.getLanguage(lang)) return true;
  const file = LANG_FILES[lang] || lang;
  const loader = HLJS_LANGS[`/node_modules/highlight.js/es/languages/${file}.js`];
  if (!loader || langLoading.has(file)) return false;
  langLoading.add(file);
  loader()
    .then((m) => {
      hljs.registerLanguage(file, m.default);
      notifyAssets();
    })
    .catch(() => {});
  return false;
}

/** Slug no estilo do GitHub: minúsculas, mantém letras acentuadas, espaços viram hífen. */
export function slugify(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  breaks: false,
});

// Blocos de código: realce de sintaxe, rótulo da linguagem, botão copiar e Mermaid.
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  const info = token.info ? md.utils.unescapeAll(token.info).trim() : '';
  const lang = (info.split(/\s+/)[0] || '').toLowerCase();
  const line = token.map ? ` data-line="${token.map[0]}" data-line-end="${token.map[1]}"` : '';
  if (lang === 'mermaid') {
    return `<div class="mermaid-block"${line} data-mermaid="${encodeURIComponent(token.content)}"><pre class="mermaid-source">${escapeHtml(token.content)}</pre></div>\n`;
  }
  let body;
  if (lang && ensureLanguage(lang)) {
    try {
      body = hljs.highlight(token.content, { language: lang, ignoreIllegals: true }).value;
    } catch {
      body = escapeHtml(token.content);
    }
  } else {
    body = escapeHtml(token.content);
  }
  const label = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : '<span class="code-lang"></span>';
  return (
    `<div class="code-block"${line}><div class="code-header">${label}` +
    `<button type="button" class="code-copy" title="Copiar código">Copiar</button></div>` +
    `<pre><code class="hljs${lang ? ' language-' + escapeHtml(lang) : ''}">${body}</code></pre></div>\n`
  );
};

md.renderer.rules.code_block = (tokens, idx) => {
  const token = tokens[idx];
  const line = token.map ? ` data-line="${token.map[0]}" data-line-end="${token.map[1]}"` : '';
  return `<pre${line}><code>${escapeHtml(token.content)}</code></pre>\n`;
};

md.use(frontMatter, () => {});
md.renderer.rules.front_matter = (tokens, idx) => {
  const t = tokens[idx];
  const end = t.map ? t.map[1] : 1;
  return `<details class="front-matter" data-line="0" data-line-end="${end}"><summary>Metadados (YAML)</summary><pre><code>${escapeHtml(t.meta)}</code></pre></details>\n`;
};

md.use(footnote)
  .use(taskLists, { enabled: true, label: false })
  .use(mark)
  .use(sub)
  .use(sup)
  .use(ins)
  .use(emoji)
  .use(deflist)
  .use(abbr)
  .use(alerts, {
    titles: { note: 'Nota', tip: 'Dica', important: 'Importante', warning: 'Aviso', caution: 'Cuidado' },
  })
  .use(katexPlugin, { katex: katexProxy, enableFencedBlocks: true, output: 'html', throwOnError: false, strict: false })
  .use(anchor, { slugify, tabIndex: false });

// Número da linha de origem em cada bloco: base da rolagem sincronizada e do "editar aqui".
md.core.ruler.push('source_lines', (state) => {
  for (const token of state.tokens) {
    if (token.map && token.block && token.nesting >= 0 && token.type !== 'inline') {
      token.attrSet('data-line', String(token.map[0]));
      token.attrSet('data-line-end', String(token.map[1]));
    }
  }
});

// O plugin de alertas gera o HTML sem os atributos: acrescenta as linhas de origem.
const alertOpen = md.renderer.rules.alert_open;
md.renderer.rules.alert_open = (tokens, idx, ...rest) => {
  const t = tokens[idx];
  const html = alertOpen(tokens, idx, ...rest);
  return t.map ? html.replace('<div ', `<div data-line="${t.map[0]}" data-line-end="${t.map[1]}" `) : html;
};

// Blocos de fórmula ($$...$$) também precisam das linhas de origem.
for (const rule of ['math_block', 'math_block_eqno']) {
  const orig = md.renderer.rules[rule];
  if (!orig) continue;
  md.renderer.rules[rule] = (tokens, idx, ...rest) => {
    const t = tokens[idx];
    const html = orig(tokens, idx, ...rest);
    return t.map ? `<div class="math-wrap" data-line="${t.map[0]}" data-line-end="${t.map[1]}">${html}</div>\n` : html;
  };
}

// Detecta HTML bruto escrito no documento: só nesse caso a sanitização (a parte mais cara)
// é necessária. Roda logo após a análise inline, antes de plugins que geram HTML próprio
// (ex.: as caixas de seleção das listas de tarefas).
md.core.ruler.after('inline', 'detect_html', (state) => {
  state.env.hasHtml = state.tokens.some(
    (t) => t.type === 'html_block' || (t.type === 'inline' && t.children?.some((c) => c.type === 'html_inline')),
  );
});

// Links externos: abrir fora do app (o clique é interceptado pela visualização).
const defaultLinkOpen =
  md.renderer.rules.link_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet('href') || '';
  if (/^https?:/i.test(href)) tokens[idx].attrSet('title', tokens[idx].attrGet('title') || href);
  return defaultLinkOpen(tokens, idx, options, env, self);
};

// ------------------------------------------------------------------ sanitização
const WINDOWS_PATH = /^[a-zA-Z]:[\\/]/;
DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  // Mantém caminhos absolutos do Windows (ex.: D:/imagens/a.png) em src/href.
  if ((data.attrName === 'src' || data.attrName === 'href') && WINDOWS_PATH.test(data.attrValue)) {
    data.forceKeepAttr = true;
  }
});
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')) node.setAttribute('rel', 'noopener noreferrer');
});

const PURIFY_CONFIG = {
  ADD_ATTR: ['target', 'checked', 'data-line', 'data-line-end', 'data-mermaid', 'aria-hidden', 'align', 'start'],
  FORBID_TAGS: ['style', 'form', 'script', 'iframe', 'object', 'embed', 'base', 'meta', 'link'],
  FORBID_ATTR: ['formaction'],
};

/**
 * Renderiza Markdown num fragmento de DOM seguro.
 * Sem HTML bruto, a saída do markdown-it já é segura (texto escapado, links validados),
 * então pula a sanitização — que custa ~75% do tempo em documentos grandes.
 */
export function renderToFragment(src) {
  const env = {};
  const html = md.render(src, env);
  const tpl = document.createElement('template');
  // (Medido: sanitizar para string e analisar é mais rápido que RETURN_DOM_FRAGMENT.)
  tpl.innerHTML = env.hasHtml ? DOMPurify.sanitize(html, PURIFY_CONFIG) : html;
  return tpl.content;
}

/** Renderiza Markdown e devolve HTML já sanitizado (string). */
export function renderMarkdown(src) {
  const div = document.createElement('div');
  div.append(renderToFragment(src));
  return div.innerHTML;
}

export { md };

// eslint-disable-next-line no-undef
export const KATEX_VERSION = __KATEX_VERSION__;
