# Decisão Arquitetural: Editor de Vídeo NLE, Canvas Visual (2D/3D) e Design Kits

Este documento registra a investigação técnica do editor do **OpenMotion Studio** (`/home/higorlino/openmotion/studio`, licenciado sob **Apache License 2.0**) e a decisão arquitetural adotada para integrá-lo ao **Kinema** (`/home/higorlino/.t3/projects/videos`).

---

## 1. Investigação: Embutir `packages/editor` (Opção 1) vs. Cópia Seletiva Adaptada (Opção 2)

Foram avaliadas as duas abordagens previstas para reutilizar o OpenMotion Studio:

### Opção 1: Embutir o pacote completo `studio/src` do OpenMotion (`packages/editor`)
- **Estrutura analisada**: `/home/higorlino/openmotion/studio/src/index.ts`, `App.tsx`, `components/EditorShell.tsx` e `hostMount.test.tsx`.
- **Obstáculos identificados**:
  1. **Volume e árvore de dependências privadas/acopladas**: `studio/src` contém **2.449 arquivos** e depende diretamente de 6 pacotes internos do ecossistema HyperFrames (`@hyperframes/core`, `@hyperframes/parsers`, `@hyperframes/player`, `@hyperframes/sdk`, `@hyperframes/shader-transitions`, `@hyperframes/studio-server`), além de `dockview-react`, `@base-ui/react`, 9 pacotes `@codemirror/*`, `@phosphor-icons/react`, `mediabunny`, `zustand`, Tailwind v4 e imports relativos para `../../../shared/*` do backend do OpenMotion.
  2. **Acoplamento ao modelo de persistência baseado em AST de arquivos HTML brutos**: Mesmo no modo `hostMount` (`hostMount.test.tsx`), `useTimelineEditing`, `useDomEditSession` e `useProjectFileWriter` exigem rotas de servidor `@hyperframes/studio-server` (`/api/projects/:id/files/*`, `/api/projects/:id/history/*`) que gravam mutações diretamente no HTML bruto via Acorn AST (`@hyperframes/core/gsap-parser-acorn`).
  3. **Conflito com os engines estruturados (`scene3d` e `kinetic`)**: No **Kinema**, a fonte da verdade de um projeto reside no `VideoService` (`data/projects/<id>/project.json`), onde `scene3d` e `kinetic` armazenam cenas, templates 3D, poses, câmeras, `overlays[]`, `objectOverrides` 3D e tokens do `DesignKit`, regenerando o `index.html` determinístico a cada chamada de `composeProject()`. Se o editor alterasse apenas o CSS inline do `index.html` gerado, todas as edições seriam perdidas na próxima síntese de áudio ou renderização MP4.

### Opção 2 (Escolhida): Cópia Seletiva e Adaptação dos Módulos do OpenMotion Studio para `apps/web`
- **Por que a Opção 2 foi escolhida**:
  1. **Persistência estruturada bidirecional via `VideoService` + SSE**: Ao copiar e adaptar os módulos de NLE Timeline, `snapEngine`, `DomEditOverlay`, `AudioWaveform`, `Shortcuts`, `LayersPanel`, `PropertyInspector` e `BrandKit*` diretamente sobre o OpenMotion Design System já presente em `apps/web/src/design-system/`, cada gesto visual (arraste/redimensionamento/rotação de overlay 2D, gizmo 3D `TransformControls`, corte/trim/movimento de clipe na timeline, ou troca de Design Kit) grava propriedades tipadas no schema Zod do projeto (`OverlayItem`, `scene.objectOverrides`, `scene.cameraOverride`, `kineticBlocks`, `freeform.html`, `designKitId`) via `VideoService` e emite eventos SSE (`/api/events`) para manter o agente MCP, a CLI e a UI em sincronia.
  2. **Zero dependências externas quebradiças**: Reutiliza apenas `react`, `three` (incluindo `TransformControls` e `OrbitControls` de `three/examples/jsm`), `gsap`, `zod` e os tokens/ícones do OpenMotion Design System.
  3. **Suporte unificado a 2D (DOM/Overlays) + 3D (Raycast & Gizmo Three.js)**: Permite combinar na mesma superfície de preview o overlay de edição 2D estilo Figma (com guias inteligentes de snapping e safe areas 9:16) e o gizmo 3D (`TransformControls`) para mover/rotacionar/escalar personagens, placas, prédios e câmera nos 11 cenários `scene3d`.

---

## 2. Módulos Copiados e Adaptados do OpenMotion (Apache-2.0)

| Módulo Origem (`/home/higorlino/openmotion/studio/src/`) | Destino em `/home/higorlino/.t3/projects/videos/` | Responsabilidade Adaptada |
| --- | --- | --- |
| `components/editor/snapEngine.ts` + `SnapGuideOverlay.tsx` | `apps/web/src/editor/snapEngine.ts` | Motor puro de snapping magnético a bordas, centros (360×640 / 720×1280), safe areas 9:16 e guias de equidistância entre elementos. |
| `player/components/audioWaveformPeaks.ts` + `AudioWaveform.tsx` | `apps/web/src/editor/AudioWaveform.tsx` | Decimação de picos e renderização Canvas 2D de waveforms de narração TTS e trilha musical nas pistas da timeline NLE. |
| `player/components/studioShortcuts.ts` + `studioCombo.ts` | `apps/web/src/editor/useNleShortcuts.ts` | Atalhos de teclado do editor NLE (`Espaço` Play/Pause, `J/K/L` shuttle, `S` dividir clipe no playhead, `Delete`/`Backspace` excluir, `Ctrl+Z`/`Ctrl+Shift+Z` Undo/Redo, setas para nudge). |
| `hooks/usePersistentEditHistory.ts` + `useEditHistoryActions.ts` | `apps/web/src/editor/useEditHistory.ts` | Pilha transacional de Undo/Redo para mutações do projeto (`scenes`, `overlays`, `objectOverrides`, `cameraOverride`, `kineticBlocks`, `freeform`). |
| `components/editor/DomEditOverlay.tsx` + `LayersPanel.tsx` + `PropertyPanel.tsx` | `apps/web/src/editor/NleEditorWorkspace.tsx` | Workspace completo NLE: Canvas central com seleção múltipla, drag/resize/rotate 2D, edição de texto inline, guias de alinhamento, safe areas 9:16, Raycast + Gizmo 3D (`TransformControls`), Painel de Camadas (z-order/visibilidade), Inspector de Propriedades, Biblioteca de Blocos/Mídia à esquerda e Timeline Multitrilha embaixo. |
| `motion/BrandKitPage.tsx`, `BrandKitDetail.tsx`, `BrandKitInspector.tsx`, `BrandKitLivePreview.tsx`, `i18n/brand-kit-ui.json` | `apps/web/src/design-kits/DesignKitsWorkspace.tsx` | Área completa de **Design Kits** em PT-BR com moodboard de referências (imagens/vídeos/links + breakdown Rea-Video), extração local de paleta via FFmpeg/Canvas, regras de tipografia/cores/safe-area/ritmo, preview ao vivo nos 3 engines e importação/exportação JSON. |
