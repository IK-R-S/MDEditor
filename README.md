<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="112" alt="Ícone do MDEditor">
</p>

<h1 align="center">MDEditor</h1>

<p align="center">
  Editor e visualizador de Markdown para Windows — <b>código aberto</b>, <b>100% offline</b> e <b>sem login</b>.<br>
  A experiência moderna do Notion e do Obsidian, direto nos seus arquivos <code>.md</code>.
</p>

---

## Por que o MDEditor?

- **Totalmente offline.** Nada de nuvem, conta ou telemetria. Fontes, ícones, fórmulas e diagramas vêm embutidos no app — ele funciona igual sem internet.
- **Sem login.** Instale e use. Seus documentos são arquivos `.md` comuns na sua máquina, legíveis por qualquer outro editor.
- **Recursos modernos.** Edição direta na página como no Notion, Markdown completo como no Obsidian, e uma interface limpa e minimalista.
- **Leve e rápido.** App nativo (Tauri + WebView2) com instalador de ~5 MB, carregamento sob demanda de tudo que é pesado e renderização otimizada para documentos grandes.
- **Integrado ao Windows.** Abre `.md` com dois cliques, aparece em "Abrir com" e pode ser o app padrão para Markdown.

## Recursos

### Três modos de trabalho

| Modo | Para quê |
| --- | --- |
| 👁 **Somente leitura** | Ler o documento formatado, sem risco de alterar nada. |
| ✏️ **Editar na página** | Estilo Notion: clique em qualquer bloco e edite ali mesmo. |
| `</>` **Markdown** | Edição completa do código-fonte, sozinho ou lado a lado com a visualização (rolagem sincronizada). |

### Edição na página (estilo Notion)

- Clique num parágrafo, título, lista, tabela ou diagrama para editá-lo no lugar.
- Digite `/` num bloco vazio para escolher entre 16 tipos de bloco.
- `Enter` cria um novo bloco; listas e citações continuam sozinhas.
- Alça **+** para adicionar blocos e **⋮⋮** para transformar, duplicar, excluir ou mover.
- **Arraste blocos** segurando a alça ⋮⋮ — com animação de desencaixe e encaixe.

### Markdown completo

Títulos, ênfase, tachado, realce, sublinhado, sobrescrito e subscrito · listas, listas numeradas e de tarefas (clicáveis) · citações e alertas no estilo GitHub (`> [!NOTE]`) · tabelas com alinhamento · blocos de código com realce para mais de 190 linguagens · fórmulas matemáticas (KaTeX) · diagramas (Mermaid: fluxogramas, sequência, Gantt, classes, mapas mentais…) · notas de rodapé · listas de definição · abreviações · emojis (`:rocket:`) · seções recolhíveis · front matter YAML · HTML embutido (com sanitização de segurança).

### Editor

- Barra de formatação flutuante e atalhos para tudo (`Ctrl+B`, `Ctrl+K`, `Ctrl+1…6`, `Ctrl+Shift+8`…).
- Tab/Shift+Tab inteligente em listas, formatação automática de tabelas, sumário gerado a partir dos títulos.
- Localizar e substituir, múltiplos cursores, autocompletar de emojis e de links para seções.
- Cole imagens com `Ctrl+V` — elas são salvas numa pasta ao lado do documento.

### Organização e navegação

- Sumário lateral que acompanha a leitura e lista dos arquivos da pasta.
- Links entre documentos `.md` (inclusive para seções), com botão voltar.
- Arrastar e soltar arquivos, arquivos recentes, várias janelas.
- Detecta alterações feitas por outros programas e recarrega automaticamente.

### Personalização

- **8 temas:** Claro, Escuro, Sépia, Solarizado, Nord, Dracula, Grafite ou seguir o Windows.
- **9 fontes para o documento** e **7 para o editor**, todas embutidas (Inter, Lora, Merriweather, JetBrains Mono, Fira Code…).
- **10 pacotes de ícones:** Lucide, Phosphor (Thin, Light, Regular, Bold), Tabler, Heroicons, Iconoir, Remix Icon e Fluent.
- Zoom, largura do texto, números de linha, quebra de linha e verificação ortográfica.

### Arquivos

- Preserva a codificação (UTF-8, UTF-8 com BOM, UTF-16, Windows-1252) e o fim de linha (LF/CRLF) do arquivo original.
- Exporta para HTML e imprime/salva como PDF.

## Desempenho

O MDEditor foi otimizado para abrir rápido e continuar ágil em documentos grandes:

- Apenas ~470 KB de JavaScript no carregamento inicial.
- KaTeX, diagramas e cada linguagem de código só são carregados quando o documento precisa deles.
- A sanitização de HTML (a etapa mais cara) só roda quando o documento contém HTML bruto.
- Atualização incremental da visualização (só o que mudou é redesenhado).
- A visualização oculta não é recalculada enquanto você edita no modo Markdown.

## Instalação

Baixe o instalador `MDEditor_x.y.z_x64-setup.exe` na página de [Releases](../../releases) e execute. A instalação é por usuário e **não pede permissão de administrador**.

Depois de instalar, dê dois cliques em qualquer arquivo `.md`. Se o Windows perguntar, escolha **MDEditor** e marque **Sempre**. Também é possível definir o app padrão em *Ajuda › Definir como aplicativo padrão para .md*.

Requisitos: Windows 10 ou 11 (64 bits) com WebView2 — já presente no Windows 11 e instalado automaticamente se faltar.

## Compilar a partir do código

Pré-requisitos: [Node.js](https://nodejs.org) 20+, [Rust](https://rustup.rs) (toolchain MSVC) e as Ferramentas de Build do Visual Studio (C++).

```bash
npm install
```

```bash
npm run tauri dev
```

```bash
npm run tauri build
```

O instalador é gerado em `src-tauri/target/release/bundle/nsis/`.

Para testar só a interface no navegador (com um backend simulado):

```bash
npm run dev
```

Os pacotes de ícones em `src/icons/` são gerados a partir das bibliotecas originais:

```bash
node scripts/gen-icons.mjs
```

## Estrutura do projeto

```
src/
  main.js         controlador da aplicação (modos, menus, arquivos, atalhos)
  editor.js       editor CodeMirror 6 e todos os comandos de formatação
  live.js         edição na página (blocos, comando "/", arrastar e soltar)
  markdown.js     renderização Markdown (markdown-it + plugins), sanitização
  preview.js      visualização, diagramas, rolagem sincronizada, busca
  appearance.js   temas e fontes
  ui.js           ícones, menus, diálogos
  bridge.js       ponte com o backend nativo
src-tauri/
  src/main.rs     backend: arquivos, janelas, instância única
  src/assoc.rs    associação de arquivos .md no Windows
scripts/
  gen-icons.mjs   gera os pacotes de ícones
```

## Tecnologias

[Tauri 2](https://tauri.app) · [CodeMirror 6](https://codemirror.net) · [markdown-it](https://github.com/markdown-it/markdown-it) · [KaTeX](https://katex.org) · [Mermaid](https://mermaid.js.org) · [highlight.js](https://highlightjs.org) · [DOMPurify](https://github.com/cure53/DOMPurify) · [morphdom](https://github.com/patrick-steele-idem/morphdom) · fontes via [Fontsource](https://fontsource.org) · ícones [Lucide](https://lucide.dev), [Phosphor](https://phosphoricons.com), [Tabler](https://tabler.io/icons), [Heroicons](https://heroicons.com), [Iconoir](https://iconoir.com), [Remix Icon](https://remixicon.com) e [Fluent UI](https://github.com/microsoft/fluentui-system-icons).

## Contribuindo

Sugestões, relatos de bugs e pull requests são bem-vindos. Abra uma [issue](../../issues) descrevendo o problema ou a ideia.

## Licença

Projeto de código aberto. Veja o arquivo [LICENSE](LICENSE).
