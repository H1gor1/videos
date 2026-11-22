# Avisos de Terceiros (Third-Party Notices)

Este projeto inclui arquivos, componentes de edição NLE, motor de snapping, visualização de waveform, gerenciamento de Brand/Design Kits e padrões de sistema de design adaptados de projetos open source licenciados sob a **Apache License, Version 2.0** e **MIT License**.

---

## 1. OpenMotion / OpenDesign Design System & Studio NLE / Brand Kit UI

- **Origem**: `/home/higorlino/openmotion` (`packages/design-system` e `studio/src`)
- **Copyright**: Copyright OpenMotion / OpenDesign Contributors
- **Licença**: Apache License, Version 2.0 (`http://www.apache.org/licenses/LICENSE-2.0`)
- **Arquivos copiados e modificados em `apps/web/src/design-system/`**:
  - `tokens.css`, `base.css`, `ui.css`, `controls.css`, `studio.css`, `catalog.css`, `fonts.css`, `studio/*.css`
  - `fonts/` (Albert Sans Variable, IBM Plex Mono)
  - `icons.svg` (Remix Icon symbols)
  - `react/*` (`BrandLogo.tsx`, `DisclosureRow.tsx`, `GitHubMark.tsx`, `IconGlyph.tsx`, `MagnetIcon.tsx`, `PlatformIcon.tsx`, `PrimaryNavigationRail.tsx`, `ProgressBar.tsx`, `RemixIcons.tsx`, `TimelinePlayheadMark.tsx`)
- **Arquivos copiados e modificados em `apps/web/src/editor/` (a partir de `studio/src/components/editor/*`, `studio/src/components/nle/*`, `studio/src/player/components/*`, `studio/src/hooks/*`)**:
  - `apps/web/src/editor/snapEngine.ts` — copiado e adaptado de `studio/src/components/editor/snapEngine.ts` e `SnapGuideOverlay.tsx` (adicionado suporte a safe-areas 9:16 e coordenadas 720×1280).
  - `apps/web/src/editor/AudioWaveform.tsx` — copiado e adaptado de `studio/src/player/components/audioWaveformPeaks.ts` e `AudioWaveform.tsx` (adaptado para Web Audio API + picos determinísticos por cena/narração TTS).
  - `apps/web/src/editor/useEditHistory.ts` — adaptado de `studio/src/hooks/usePersistentEditHistory.ts` e `useEditHistoryActions.ts` (histórico Undo/Redo integrado ao `VideoService`).
  - `apps/web/src/editor/NleEditorWorkspace.tsx` — adaptado de `studio/src/components/EditorShell.tsx`, `studio/src/components/editor/DomEditOverlay.tsx`, `studio/src/components/editor/LayersPanel.tsx`, `studio/src/components/editor/PropertyPanel.tsx` e `studio/src/components/nle/TimelinePane.tsx` (integrado com persistência estruturada de `OverlayItem`, gizmo 3D `TransformControls` via Three.js, timeline multitrilha NLE e sincronização SSE).
- **Arquivos copiados e modificados em `apps/web/src/design-kits/` (a partir de `studio/src/motion/BrandKit*.tsx` e `studio/src/i18n/brand-kit-ui.json`)**:
  - `apps/web/src/design-kits/DesignKitsWorkspace.tsx` — adaptado de `BrandKitPage.tsx`, `BrandKitDetail.tsx`, `BrandKitInspector.tsx`, `BrandKitLivePreview.tsx`, `BrandCatalogGallery.tsx` e `BrandFilmstrip.tsx` (traduzido para PT-BR, integrado ao schema `DesignKit` do `@videos/core`, com moodboard de referências, ficha Rea-Video, extração local de paleta de cores e preview multi-engine ao vivo).
- **Declaração de Modificação (Apache-2.0 Section 4(b))**:
  Todos os arquivos listados acima foram modificados para operar sobre o modelo de domínio `VideoService` (`@videos/core`), suportando os engines `scene3d`, `kinetic` e `freeform`, gizmos 3D Three.js e interface em Português (PT-BR).

### Remix Icon (incluído em `icons.svg`)
- **Licença**: Apache License, Version 2.0
- **Copyright**: Remix Design (`https://remixicon.com`)

---

## 2. HyperFrames

- **Origem**: [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)
- **Licença**: Apache License, Version 2.0
- **Uso**: Contrato de composição HTML (`data-composition-id`, `data-start`, `data-duration`, `window.__timelines`), CLI de validação/renderização e metadados de blocos do registry local.

---

## 3. Three.js (`three` e `three/examples/jsm`)

- **Origem**: [mrdoob/three.js](https://github.com/mrdoob/three.js)
- **Licença**: MIT License
- **Uso**: Motor 3D WebGL, `RoundedBoxGeometry`, `OrbitControls` e `TransformControls` para edição 3D interativa com raycasting e gizmos no viewport.

---

## 4. Repositórios Indexados Localmente via `npm run library:sync` (Não Redistribuídos)

Os seguintes repositórios podem ser clonados localmente pelo usuário em `library/vendor/` (diretório ignorado pelo Git via `.gitignore`, nunca redistribuído no repositório):

1. **awesome-opus5-5-videos** (`https://github.com/yihui-dev/awesome-opus5-5-videos`) — Licença MIT.
2. **lemo-opuscar** (`https://github.com/lemomo-ai/lemo-opuscar`) — Sem licença explícita declarada; clonado apenas localmente para consulta pessoal e nunca redistribuído.
3. **pixelfx** (`https://github.com/patch-gg/pixelfx`) — Licença MIT.
4. **remotion-dev/skills** (`https://github.com/remotion-dev/skills`) — Licença MIT / Apache-2.0.
5. **rea-video** (`https://github.com/JuneYaooo/rea-video`) — Licença Apache License, Version 2.0.
