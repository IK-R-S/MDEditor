// Manipulação de caminhos do Windows (sem depender do backend).

export const isAbsolute = (p) => /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\');

export function normalize(p) {
  const unc = p.startsWith('\\\\') || p.startsWith('//');
  const parts = p.replace(/\//g, '\\').split('\\');
  const out = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (out.length > (unc ? 2 : 1)) out.pop();
      continue;
    }
    out.push(part);
  }
  if (unc) return '\\\\' + out.join('\\');
  if (out.length === 1 && /^[a-zA-Z]:$/.test(out[0])) return out[0] + '\\';
  return out.join('\\');
}

export function dirname(p) {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  if (i < 0) return '';
  if (i === 2 && p[1] === ':') return p.slice(0, 3);
  return p.slice(0, i);
}

export function basename(p) {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  return i < 0 ? p : p.slice(i + 1);
}

export function stripExt(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

export function extname(p) {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i + 1).toLowerCase() : '';
}

export function join(base, rel) {
  if (!rel) return normalize(base);
  if (isAbsolute(rel)) return normalize(rel);
  // "/pasta/arquivo" = raiz da unidade do documento
  if (rel.startsWith('/') || rel.startsWith('\\')) {
    const drive = base.match(/^[a-zA-Z]:/);
    return normalize((drive ? drive[0] : '') + rel);
  }
  return normalize(base + '\\' + rel);
}

/** Caminho relativo de `fromDir` até `to`, com barras normais (para usar em links Markdown). */
export function relative(fromDir, to) {
  const a = normalize(fromDir).split('\\');
  const b = normalize(to).split('\\');
  if (a[0].toLowerCase() !== b[0].toLowerCase()) return b.join('/');
  let i = 0;
  while (i < a.length && i < b.length && a[i].toLowerCase() === b[i].toLowerCase()) i++;
  const up = a.slice(i).filter(Boolean).map(() => '..');
  return [...up, ...b.slice(i)].join('/') || '.';
}

const REMOTE = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/**
 * Resolve o destino de um link/imagem para um caminho local absoluto.
 * Devolve null para URLs remotas, âncoras, data: etc.
 */
export function resolveLocal(href, baseDir) {
  if (!href) return null;
  let h = href.trim();
  if (h.startsWith('#')) return null;
  if (/^file:\/\//i.test(h)) h = h.replace(/^file:\/\/\/?/i, '');
  else if (REMOTE.test(h)) return null;
  else {
    const s = h.match(SCHEME);
    if (s && s[1].length > 1) return null; // http:, mailto:, data: ... (1 letra = unidade do Windows)
  }
  h = h.split('#')[0].split('?')[0];
  try {
    h = decodeURIComponent(h);
  } catch {
    /* mantém como está */
  }
  if (!h) return null;
  if (isAbsolute(h)) return normalize(h);
  if (!baseDir) return null;
  return join(baseDir, h);
}
