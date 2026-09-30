// Fontes embutidas (funcionam offline) e temas de cores.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-400-italic.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-400-italic.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-400-italic.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/lora/latin-400.css';
import '@fontsource/lora/latin-400-italic.css';
import '@fontsource/lora/latin-600.css';
import '@fontsource/lora/latin-700.css';
import '@fontsource/merriweather/latin-400.css';
import '@fontsource/merriweather/latin-400-italic.css';
import '@fontsource/merriweather/latin-700.css';
import '@fontsource/source-serif-4/latin-400.css';
import '@fontsource/source-serif-4/latin-400-italic.css';
import '@fontsource/source-serif-4/latin-600.css';
import '@fontsource/source-serif-4/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-400-italic.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/fira-code/latin-400.css';
import '@fontsource/fira-code/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-400-italic.css';
import '@fontsource/ibm-plex-mono/latin-700.css';
import './styles/themes.css';

const SYSTEM_SANS = "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif";
const SYSTEM_MONO = "'Cascadia Code', 'Cascadia Mono', Consolas, monospace";

export const DOC_FONTS = {
  system: { label: 'Sistema (Segoe UI)', css: SYSTEM_SANS },
  inter: { label: 'Inter', css: `'Inter', ${SYSTEM_SANS}` },
  plex: { label: 'IBM Plex Sans', css: `'IBM Plex Sans', ${SYSTEM_SANS}` },
  nunito: { label: 'Nunito', css: `'Nunito', ${SYSTEM_SANS}` },
  lora: { label: 'Lora (serifada)', css: "'Lora', Georgia, serif" },
  merriweather: { label: 'Merriweather (serifada)', css: "'Merriweather', Georgia, serif" },
  sourceserif: { label: 'Source Serif (serifada)', css: "'Source Serif 4', Georgia, serif" },
  georgia: { label: 'Georgia (serifada)', css: "Georgia, 'Times New Roman', serif" },
  jetbrains: { label: 'JetBrains Mono (máquina de escrever)', css: `'JetBrains Mono', ${SYSTEM_MONO}` },
};

export const EDITOR_FONTS = {
  cascadia: { label: 'Cascadia Code', css: SYSTEM_MONO, mono: true },
  jetbrains: { label: 'JetBrains Mono', css: `'JetBrains Mono', ${SYSTEM_MONO}`, mono: true },
  fira: { label: 'Fira Code', css: `'Fira Code', ${SYSTEM_MONO}`, mono: true },
  plexmono: { label: 'IBM Plex Mono', css: `'IBM Plex Mono', ${SYSTEM_MONO}`, mono: true },
  consolas: { label: 'Consolas', css: "Consolas, 'Courier New', monospace", mono: true },
  system: { label: 'Sistema (proporcional)', css: SYSTEM_SANS, mono: false },
  inter: { label: 'Inter (proporcional)', css: `'Inter', ${SYSTEM_SANS}`, mono: false },
};

/** Temas: `scheme` define claro/escuro (diagramas, barra de título); `palette` ativa as cores extras. */
export const THEMES = {
  system: { label: 'Seguir o Windows' },
  light: { label: 'Claro', scheme: 'light' },
  dark: { label: 'Escuro', scheme: 'dark' },
  sepia: { label: 'Sépia', scheme: 'light', swatch: '#f4ecd8' },
  solarized: { label: 'Solarizado', scheme: 'light', swatch: '#fdf6e3' },
  nord: { label: 'Nord', scheme: 'dark', swatch: '#2e3440' },
  dracula: { label: 'Dracula', scheme: 'dark', swatch: '#282a36' },
  graphite: { label: 'Grafite', scheme: 'dark', swatch: '#1c1c1e' },
};
