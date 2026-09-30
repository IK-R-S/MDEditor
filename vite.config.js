import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const katexVersion = JSON.parse(readFileSync(new URL('./node_modules/katex/package.json', import.meta.url))).version;

/**
 * O plugin @vscode/markdown-it-katex traz a própria cópia do KaTeX (~250 KB).
 * Nós passamos a instância via opções, então a importação interna vira um módulo vazio.
 */
const katexDedupe = {
  name: 'mdeditor-katex-dedupe',
  enforce: 'pre',
  resolveId(source, importer) {
    if (source === 'katex' && importer && importer.replace(/\\/g, '/').includes('@vscode/markdown-it-katex')) {
      return '\0katex-stub';
    }
    return null;
  },
  load(id) {
    if (id === '\0katex-stub') return 'export default {};';
    return null;
  },
};

/**
 * O WebView2 (Chromium) sempre usa WOFF2. Remove as alternativas WOFF/TTF das fontes
 * do KaTeX e do Fontsource para que não sejam copiadas para o app (~1,5 MB a menos).
 */
const woff2Only = {
  name: 'mdeditor-woff2-only',
  enforce: 'pre',
  transform(code, id) {
    const file = id.split('?')[0].replace(/\\/g, '/');
    if (!file.endsWith('.css') || !/node_modules\/(katex|@fontsource)\//.test(file)) return null;
    return code.replace(/,\s*url\([^)]*\.(?:woff|ttf)\)\s*format\((['"])(?:woff|truetype)\1\)/g, '');
  },
};

export default defineConfig({
  clearScreen: false,
  plugins: [katexDedupe, woff2Only],
  define: {
    __KATEX_VERSION__: JSON.stringify(katexVersion),
  },
  server: { port: 1420, strictPort: true },
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    modulePreload: { polyfill: false },
  },
});
