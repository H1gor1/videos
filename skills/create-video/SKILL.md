---
name: create-video
description: Cria vídeos curtos verticais (Reels/Shorts) determinísticos usando o servidor MCP kinema-mcp (engines scene3d, kinetic e freeform, biblioteca de 99 estilos/prompts/efeitos e renderização HyperFrames + FFmpeg).
---

# Skill: Criação de Vídeos Curtos Verticais (`create-video`)

Use esta skill sempre que o usuário pedir para criar, roteirizar, animar, recriar ou renderizar um vídeo curto vertical (Reels, Shorts, TikTok) ou uma simulação estilo "Simulação 2030".

## Passo a Passo

### 1. Escolher o Engine
Chame `list_engines` e `get_engine_schema`:
- **`scene3d`**: Quando o vídeo envolve personagens 3D blocky/chibi, apresentador, simulação política/econômica, história em etapas ou múltiplos cenários low-poly.
- **`kinetic`**: Quando o vídeo é um ranking Top-N, lista rápida, estatística explosiva ou citação tipográfica.
- **`freeform`**: Quando o vídeo exige uma composição HTML/CSS/GSAP/Canvas customizada no contrato do HyperFrames.

### 2. Buscar Referências na Biblioteca
- Se houver um vídeo MP4 de referência, chame `breakdown_reference_video` para detectar cortes de cena via FFmpeg e gerar a ficha Rea-Video.
- Chame `search_library` filtrando por `type: "prompt"`, `type: "style"`, `type: "effect"` ou `type: "block"`.
- Leia o conteúdo completo do item escolhido com `get_library_item`.

### 3. Ler o Design Kit do Projeto, o Style Guide e Preparar Personagem
- **Obrigatório**: Antes de criar ou editar cenas, consulte o Design Kit do projeto chamando `get_design_kit` (com o `designKitId` do projeto, padrão `"simulacao-2030"`, ou liste todos os kits disponíveis com `list_design_kits`).
  - Respeite rigorosamente a paleta (`palette`), as fontes permitidas (`typography.allowedFonts`), as margens de safe area 9:16 (`safeArea`), o ritmo de cena (`pacing`) e as regras livres (`rules`) do Design Kit.
  - Para alternar toda a identidade visual de um vídeo sem editar cena por cena (ex: de `"simulacao-2030"` para `"editorial-minimal"`), chame `apply_design_kit`.
- Leia `kinema://docs/style-guide`.
- No modo `scene3d`, chame `list_characters` ou crie um personagem dedicado com `create_character` (ex: camisa vermelha, faixa presidencial `sash`, barba e cabelo `afro` em blocos, óculos).
- Consulte `list_templates` para ver os 11 cenários 3D e seus `propsSchema`:
  1. `red-carpet-confetti`
  2. `pulpit-plenary`
  3. `brazil-map-3d`
  4. `city-spending-cap`
  5. `timeline-3d`
  6. `bar-chart-3d`
  7. `street-protest`
  8. `classroom-office`
  9. `news-desk`
  10. `courtroom`
  11. `spotlight-close`

### 4. Construir o Projeto (`create_project` + `set_script` / `set_composition`)
- Crie o projeto com `create_project` informando `engine`, `styleId` e `promptId`.
- Preencha todas as cenas com `set_script` (ou `set_composition` no modo `freeform`).
- Aplique efeitos adicionais com `add_effect` (`scanlines`, `vignette`, `sparkles`, `glitch`) e estilos com `apply_style`.

### 5. Validar e Sintetizar Áudio
- Chame `validate_project` e resolva qualquer erro apontado.
- Chame `synthesize_audio` para gerar o TTS neural PT-BR (`pt-BR-AntonioNeural` / `pt-BR-FranciscaNeural`) com timestamps palavra a palavra e mixar com música + sidechain ducking + SFX.

### 6. Revisão Visual de Frames (`render_preview_frames`)
- Chame `render_preview_frames` para renderizar 1 frame PNG por cena.
- Analise visualmente as imagens retornadas: verifique se os títulos não cobrem o rosto do personagem, se as placas 3D estão legíveis e se as legendas amarelas estão bem posicionadas.
- Se necessário, ajuste com `update_scene` e rode `render_preview_frames` novamente.

### 7. Render Final (`render_video` + `get_output`)
- Chame `render_video` e aguarde a conclusão via `get_job_status`.
- Retorne os caminhos finais do arquivo `.mp4`, `.srt` e `.ass` obtidos em `get_output`.
