# AGENTS.md — Guia para Agentes de IA (Videos Studio)

Este repositório é um estúdio completo (Pipeline + Interface Web + Servidor MCP + CLI) para criação de vídeos curtos verticais (Reels/Shorts, 9:16) determinísticos usando **Three.js**, **GSAP**, **HyperFrames** e **FFmpeg**.

## Fluxo Obrigatório para Agentes via MCP

Quando o usuário pedir para criar ou editar um vídeo curto vertical, siga exatamente estas etapas usando as tools do servidor MCP (`videos-studio-mcp`):

1. **Escolher o Engine (`list_engines` + `get_engine_schema`)**:
   - `scene3d` (**Flagship — Estilo "Simulação 2030"**): Personagens 3D blocky/chibi procedurais consistentes + 11 cenários low-poly (`red-carpet-confetti`, `pulpit-plenary`, `brazil-map-3d`, `city-spending-cap`, `timeline-3d`, `bar-chart-3d`, `street-protest`, `classroom-office`, `news-desk`, `courtroom`, `spotlight-close`) + movimentos de câmera (`dolly-in`, `orbit`, `pan`, `close-face`, `shake`, `static`) + overlays 2D (`title`, `badge`, `lower-third`, `role-banner`, `counter`, `watermark`, `progress-bar`, `effect`) + legendas word-by-word (`highlight-yellow`).
   - `kinetic`: Vídeos rápidos de tipografia cinética, listas Top-N, estatísticas e citações animadas.
   - `freeform`: Composição HTML/CSS/JS livre no contrato determinístico do HyperFrames (`window.__timelines["main"] = gsap.timeline({ paused: true })`).

2. **Consultar o Design Kit, o Guia de Estilo e a Biblioteca (`list_design_kits` + `get_design_kit` + `search_library` + `get_library_item`)**:
   - Sempre leia o Design Kit ativo do projeto com `get_design_kit` (ex: `"simulacao-2030"` ou `"editorial-minimal"`). Respeite sua paleta (`palette`), fontes permitidas (`typography.allowedFonts`), margens seguras (`safeArea`), ritmo (`pacing`) e regras livres (`rules`). Para trocar toda a identidade visual de um projeto sem editar cena por cena, chame `apply_design_kit`.
   - Leia o resource `videos://docs/style-guide`.
   - Pesquise na biblioteca local (>3.200 itens indexados) por um `prompt` viral (`awesome-opus5-5-videos`), um `style` cinematográfico (`lemo-opuscar` — 99 estilos), um `effect` (`pixelfx` — 244 efeitos), um `block` (`hyperframes` — ~450 blocos) ou uma `technique` (`remotion-skills` / `rea-video`).
   - Se o usuário fornecer um vídeo de referência para copiar/recriar, chame `breakdown_reference_video` primeiro.

3. **Configurar Personagem 3D (`list_characters` / `create_character` / `update_character`)**:
   - Para vídeos `scene3d`, escolha um personagem existente ou crie um novo personagem blocky com cabeça grande (`headScale: 1.38`), barba/cabelo em blocos, óculos e acessórios (`sash`, `tie`, `suit`, `hat`, `microphone`, `badge`).

4. **Criar Projeto e Definir Roteiro/Cenas (`create_project` + `set_script` / `set_composition`)**:
   - Crie o projeto passando `engine`, `promptId` e `styleId`.
   - Para `scene3d`, envie o plano de cenas completo via `set_script` alternando cenários 3D a cada 3,5–5,5 segundos, combinando a pose do personagem com a ação da cena e incluindo um título + badge amarelo (`⚠ NA NOSSA SIMULAÇÃO`) na primeira cena.
   - Para `freeform`, envie o HTML completo via `set_composition`.

5. **Validar (`validate_project`)**:
   - Corrija imediatamente qualquer erro ou aviso acionável antes de avançar.

6. **Sintetizar Áudio e Revisar Frames (`synthesize_audio` + `render_preview_frames`)**:
   - Chame `synthesize_audio` para gerar a narração TTS (Microsoft Edge Neural PT-BR com word boundaries ou eSpeak-NG offline fallback) e mixar a trilha musical com ducking sidechain e SFX.
   - Chame `render_preview_frames` para receber os PNGs dos frames-chave como imagens MCP. Inspecione visualmente cada frame (enquadramento, textos, personagem, legendas) e ajuste cenas com `update_scene` se algo estiver cortado ou sobreposto.

7. **Renderizar Vídeo Final (`render_video` + `get_job_status` + `get_output`)**:
   - Dispare `render_video` (com `wait: true` ou acompanhando via `get_job_status`) e informe ao usuário os caminhos finais do `.mp4`, `.srt` e `.ass`.
