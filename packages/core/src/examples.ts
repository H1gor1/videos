import { ProjectSchema, type Project } from './schemas.ts';

export function createSimulacaoDemoProject(id = 'simulacao-demo'): Project {
  const now = new Date().toISOString();
  return ProjectSchema.parse({
    id,
    title: 'SIMULAÇÃO 2030 · EP.1 — O Plano Industrial',
    topic: 'E se um analista assumisse a presidência em 2030 com um plano de industrialização e reforma fiscal?',
    tone: 'jornalístico-didático',
    targetDuration: 26,
    seriesId: 'simulacao-2030',
    episodeNumber: 1,
    engine: 'scene3d',
    styleId: 'simulacao-lowpoly-3d',
    effectIds: ['vignette'],
    status: 'scripted',
    voice: {
      provider: 'edge',
      voiceId: 'pt-BR-AntonioNeural',
      rate: 1.12,
      pitch: '+0Hz',
    },
    captionStyle: {
      enabled: true,
      style: 'highlight-yellow',
      wordsPerGroup: 3,
      positionY: 83,
      fontSize: 32,
      highlightColor: '#f5c518',
      textColor: '#ffffff',
      burnIn: true,
    },
    renderSettings: {
      width: 720,
      height: 1280,
      fps: 30,
      crf: 21,
      workers: 2,
      renderer: 'hyperframes',
      embedCaptions: true,
      musicTrack: 'upbeat-simulation',
      musicVolume: 0.16,
      duckingThreshold: 0.03,
      sfxVolume: 0.32,
    },
    scenes: [
      {
        id: 'scene-1-abertura',
        order: 0,
        narration: 'Na nossa simulação de dois mil e trinta, Marco chega à presidência.',
        duration: 4.0,
        template: 'red-carpet-confetti',
        templateProps: {
          wallColor: '#5d5753',
          floorColor: '#c9c2b8',
          carpetColor: '#c1121f',
          confettiCount: 55,
          spotlightBeam: true,
        },
        characterId: 'presidente-sim',
        secondaryCharacterIds: [],
        pose: 'celebrating',
        camera: 'dolly-in',
        transition: 'cut',
        overlays: [
          {
            type: 'title',
            subtitle: 'SIMULAÇÃO 2030 · EP. 1',
            text: 'SIMULAÇÃO 2030',
            highlightWord: '2030',
            position: 'top',
            boxed: false,
          },
          {
            type: 'badge',
            text: 'NA NOSSA SIMULAÇÃO',
            icon: '⚠',
            color: '#f5c518',
          },
          {
            type: 'lower-third',
            name: 'MARCO SILVA',
            subtitle: 'ECONOMISTA · RECIFE',
          },
        ],
        highlightWords: ['simulação', 'presidência'],
        sfx: 'cheer',
      },
      {
        id: 'scene-2-plenario',
        order: 1,
        narration: 'Antes ele virou deputado federal e articulou duzentos e cinquenta e sete votos.',
        duration: 4.2,
        template: 'pulpit-plenary',
        templateProps: {
          partyLabel: 'SIM 2030',
          partyColor: '#c1121f',
          screenTitle: 'MUDAR A CONSTITUIÇÃO',
          screenNumber: '257',
          screenSub: 'VOTOS NECESSÁRIOS DE 513',
          showHemicycle: true,
        },
        characterId: 'marco-silva',
        secondaryCharacterIds: [],
        pose: 'talking',
        camera: 'dolly-in',
        transition: 'whip',
        overlays: [
          {
            type: 'counter',
            label: 'VOTOS NO CONGRESSO',
            from: 0,
            to: 257,
            prefix: '',
            suffix: '',
            sublabel: 'VOTOS NECESSÁRIOS DE 513',
          },
        ],
        highlightWords: ['deputado', 'votos'],
        sfx: 'whoosh',
      },
      {
        id: 'scene-3-mapa',
        order: 2,
        narration: 'Para ele, exportar só minério e soja funciona como analgésico, mas não resolve.',
        duration: 4.2,
        template: 'brazil-map-3d',
        templateProps: {
          mapColor: '#52b788',
          bgColor: '#023e8a',
          markers: [
            { label: 'MINÉRIO', x: 0.45, y: 0.15, color: '#f5c518' },
            { label: 'SOJA', x: -0.15, y: -0.25, color: '#e63946' },
            { label: 'INDÚSTRIA', x: 0.25, y: -0.55, color: '#00b4d8' },
          ],
          showPill: true,
          showRoutes: true,
        },
        characterId: 'marco-silva',
        secondaryCharacterIds: [],
        pose: 'pointing',
        camera: 'orbit',
        transition: 'cut',
        overlays: [
          {
            type: 'title',
            text: 'O MODELO VIROU UM ANALGÉSICO',
            highlightWord: 'ANALGÉSICO',
            position: 'top',
            boxed: true,
          },
        ],
        highlightWords: ['minério', 'analgésico', 'resolve'],
        sfx: 'ding',
      },
      {
        id: 'scene-4-teto',
        order: 3,
        narration: 'O primeiro passo seria puxar a alavanca do teto para liberar hospital e escola.',
        duration: 4.0,
        template: 'city-spending-cap',
        templateProps: {
          beamLabel: 'TETO DE GASTOS',
          buildings: [
            { label: 'HOSPITAL', color: '#e63946', height: 1.0 },
            { label: 'ESCOLA', color: '#1d3557', height: 0.92 },
            { label: 'POSTO', color: '#2a9d8f', height: 0.85 },
          ],
          leverPulled: true,
        },
        characterId: 'marco-silva',
        secondaryCharacterIds: [],
        pose: 'pulling-lever',
        camera: 'pan',
        transition: 'cut',
        overlays: [],
        highlightWords: ['alavanca', 'teto', 'escola'],
        sfx: 'lever',
      },
      {
        id: 'scene-5-recursos',
        order: 4,
        narration: 'Com lítio, nióbio e terras raras processados aqui, o país dobra sua indústria.',
        duration: 4.0,
        template: 'timeline-3d',
        templateProps: {
          milestones: [
            { label: 'LÍTIO', tag: 'BRASIL', color: '#f4a261' },
            { label: 'NIÓBIO', tag: 'BRASIL', color: '#e9c46a' },
            { label: 'TERRAS RARAS', tag: 'BRASIL', color: '#e76f51' },
          ],
          mode: 'barrels',
        },
        characterId: 'marco-silva',
        secondaryCharacterIds: [],
        pose: 'pointing',
        camera: 'dolly-in',
        transition: 'whip',
        overlays: [
          {
            type: 'role-banner',
            title: 'SOBERANIA INDUSTRIAL',
            subtitle: 'REFINO NACIONAL DE MINERAIS CRÍTICOS',
            variant: 'yellow',
          },
        ],
        highlightWords: ['lítio', 'nióbio', 'indústria'],
        sfx: 'coin',
      },
      {
        id: 'scene-6-grafico',
        order: 5,
        narration: 'Em quatro anos, economia, emprego e aprovação crescem juntos na simulação.',
        duration: 3.8,
        template: 'bar-chart-3d',
        templateProps: {
          bars: [
            { label: 'ECONOMIA', value: 84, color: '#52b788', topBadge: 'INVESTIMENTO' },
            { label: 'CONGRESSO', value: 72, color: '#f5c518', topBadge: 'EMPREGO' },
            { label: 'APROVAÇÃO', value: 91, color: '#48cae4', topBadge: 'VIDAS' },
          ],
          gridColor: '#1d4ed8',
        },
        characterId: 'marco-silva',
        secondaryCharacterIds: [],
        pose: 'celebrating',
        camera: 'dolly-in',
        transition: 'zoom',
        overlays: [],
        highlightWords: ['economia', 'emprego', 'aprovação'],
        sfx: 'ding',
      },
      {
        id: 'scene-7-final',
        order: 6,
        narration: 'Na tua opinião, esse plano funcionaria em dois mil e trinta? Comenta aí!',
        duration: 3.8,
        template: 'street-protest',
        templateProps: {
          signText: 'COMENTA AÍ',
          crowdSize: 28,
          showFlags: true,
          bgColor: '#6a040f',
        },
        characterId: 'marco-silva',
        secondaryCharacterIds: [],
        pose: 'waving',
        camera: 'close-face',
        transition: 'cut',
        overlays: [
          {
            type: 'watermark',
            handle: '@simulacao2030',
            position: 'top-right',
          },
          {
            type: 'progress-bar',
            color: '#f5c518',
          },
        ],
        highlightWords: ['opinião', '2030', 'Comenta'],
        sfx: 'cheer',
      },
    ],
    kineticBlocks: [],
    totalDuration: 28.0,
    createdAt: now,
    updatedAt: now,
  });
}

export function createKineticTop5Project(id = 'kinetic-top5'): Project {
  const now = new Date().toISOString();
  return ProjectSchema.parse({
    id,
    title: 'TOP 5 TECNOLOGIAS QUE VÃO MUDAR 2030',
    topic: 'Ranking acelerado das 5 tecnologias que mais vão transformar o trabalho até 2030',
    tone: 'dinâmico-viral',
    targetDuration: 22,
    engine: 'kinetic',
    styleId: 'kinetic-swiss-bold',
    effectIds: ['scanlines'],
    status: 'scripted',
    voice: {
      provider: 'edge',
      voiceId: 'pt-BR-FranciscaNeural',
      rate: 1.15,
      pitch: '+0Hz',
    },
    captionStyle: {
      enabled: true,
      style: 'highlight-yellow',
      wordsPerGroup: 3,
      positionY: 83,
      fontSize: 30,
      highlightColor: '#f5c518',
      textColor: '#ffffff',
      burnIn: true,
    },
    renderSettings: {
      width: 720,
      height: 1280,
      fps: 30,
      crf: 21,
      workers: 2,
      renderer: 'hyperframes',
      embedCaptions: true,
      musicTrack: 'cyber-pulse',
      musicVolume: 0.16,
      duckingThreshold: 0.03,
      sfxVolume: 0.3,
    },
    scenes: [],
    kineticBlocks: [
      {
        id: 'kb-intro',
        order: 0,
        narration: 'Cinco tecnologias que vão redesenhar o mercado até dois mil e trinta.',
        duration: 3.6,
        layout: 'hero-stat',
        headline: 'TOP 5 TECH 2030',
        subheadline: 'CONTAGEM REGRESSIVA · #5 AO #1',
        highlightWord: '2030',
        badge: 'RANKING OFICIAL',
        items: [],
        accentColor: '#f5c518',
        bgStyle: 'dark-grid',
        transition: 'zoom',
        sfx: 'whoosh',
      },
      {
        id: 'kb-5',
        order: 1,
        narration: 'Número cinco: computação espacial com óculos leves substituindo telas físicas.',
        duration: 3.6,
        layout: 'top-list-item',
        headline: 'COMPUTAÇÃO ESPACIAL',
        subheadline: 'ÓCULOS LEVES E GÊMEOS DIGITAIS 3D',
        highlightWord: 'ESPACIAL',
        rankNumber: 5,
        items: ['Interfaces Gestuais e Neurais', 'Projetos Industriais em Holograma'],
        accentColor: '#a855f7',
        bgStyle: 'radial-glow',
        transition: 'whip',
        sfx: 'pop',
      },
      {
        id: 'kb-4',
        order: 2,
        narration: 'Número quatro: biotecnologia programável desenhando terapias em poucos dias.',
        duration: 3.6,
        layout: 'top-list-item',
        headline: 'BIOTECNOLOGIA PROGRAMÁVEL',
        subheadline: 'FÁRMACOS E TERAPIAS GERADOS POR IA',
        highlightWord: 'PROGRAMÁVEL',
        rankNumber: 4,
        items: ['Síntese de Proteínas Sob Medida', 'Diagnóstico Preditivo Contínuo'],
        accentColor: '#22c55e',
        bgStyle: 'dark-grid',
        transition: 'whip',
        sfx: 'pop',
      },
      {
        id: 'kb-3',
        order: 3,
        narration: 'Número três: baterias de estado sólido com mais de mil quilômetros de autonomia.',
        duration: 3.8,
        layout: 'top-list-item',
        headline: 'BATERIAS DE ESTADO SÓLIDO',
        subheadline: 'AUTONOMIA DE 1.200 KM E RECARGA EM 8 MIN',
        highlightWord: 'SÓLIDO',
        rankNumber: 3,
        items: ['Densidade Energética Dobrada', 'Frotas Elétricas sem Risco Térmico'],
        accentColor: '#38bdf8',
        bgStyle: 'neon-cyber',
        transition: 'whip',
        sfx: 'pop',
      },
      {
        id: 'kb-2',
        order: 4,
        narration: 'Número dois: robótica humanoide autônoma operando fábricas vinte e quatro horas.',
        duration: 3.8,
        layout: 'top-list-item',
        headline: 'ROBÓTICA HUMANOIDE AUTÔNOMA',
        subheadline: 'MANUFATURA E LOGÍSTICA CONTÍNUA 24H',
        highlightWord: 'AUTÔNOMA',
        rankNumber: 2,
        items: ['Aprendizado Físico por Imitação', 'Custo Operacional Abaixo de US$ 4/h'],
        accentColor: '#f97316',
        bgStyle: 'dark-grid',
        transition: 'whip',
        sfx: 'pop',
      },
      {
        id: 'kb-1',
        order: 5,
        narration: 'Em primeiro lugar: agentes de inteligência artificial operando sistemas inteiros.',
        duration: 4.0,
        layout: 'counter-explosion',
        headline: 'AGENTES DE IA AUTÔNOMOS',
        subheadline: 'IMPACTO ESTIMADO NA PRODUTIVIDADE GLOBAL',
        highlightWord: 'AUTÔNOMOS',
        rankNumber: 1,
        statValue: 340,
        statPrefix: '+',
        statSuffix: '%',
        items: ['Orquestração Multi-Agente via MCP', 'Código, Vídeo e Dados em Tempo Real'],
        accentColor: '#f5c518',
        bgStyle: 'crimson-burst',
        transition: 'zoom',
        sfx: 'ding',
      },
    ],
    totalDuration: 22.4,
    createdAt: now,
    updatedAt: now,
  });
}

export function createFreeformDemoProject(id = 'freeform-demo'): Project {
  const now = new Date().toISOString();
  const duration = 12;
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=720, height=1280" />
  <script src="assets/vendor/gsap.min.js"></script>
  <script src="assets/vendor/three.min.js"></script>
  <style>
    @font-face {
      font-family: "Anton";
      src: url("assets/fonts/anton-latin-400-normal.woff2") format("woff2");
      font-weight: 400 900;
      font-style: normal;
    }
    @font-face {
      font-family: "Inter";
      src: url("assets/fonts/inter-latin-800-normal.woff2") format("woff2");
      font-weight: 400 900;
      font-style: normal;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 720px;
      height: 1280px;
      overflow: hidden;
      background: #070b14;
      font-family: "Inter", "Arial Black", sans-serif;
      color: #f8fafc;
      user-select: none;
    }
    #root {
      position: relative;
      width: 720px;
      height: 1280px;
      overflow: hidden;
      background: radial-gradient(circle at 50% 35%, #16213e 0%, #070b14 78%);
    }
    #three-bg {
      position: absolute;
      inset: 0;
      width: 720px;
      height: 1280px;
      display: block;
      z-index: 1;
    }
    .cyber-grid {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(56, 189, 248, 0.08) 1px, transparent 1px),
        linear-gradient(90deg, rgba(56, 189, 248, 0.08) 1px, transparent 1px);
      background-size: 48px 48px;
      z-index: 2;
      pointer-events: none;
    }
    .hud-header {
      position: absolute;
      top: 44px;
      left: 44px;
      right: 44px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 18;
    }
    .hud-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(15, 23, 42, 0.85);
      border: 1.5px solid rgba(56, 189, 248, 0.45);
      padding: 8px 16px;
      border-radius: 999px;
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.1em;
      color: #38bdf8;
    }
    .hud-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #f5c518;
      box-shadow: 0 0 10px #f5c518;
    }
    .act-layer {
      position: absolute;
      inset: 0;
      z-index: 10;
      padding: 124px 48px 260px 48px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      pointer-events: none;
    }
    .act-badge {
      display: inline-block;
      align-self: flex-start;
      background: #f5c518;
      color: #090d16;
      font-family: "Anton", sans-serif;
      font-size: 22px;
      padding: 4px 16px;
      border-radius: 8px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      box-shadow: 0 8px 24px rgba(245, 197, 24, 0.35);
    }
    .kinetic-title {
      margin-top: 14px;
      font-family: "Anton", sans-serif;
      font-size: 72px;
      line-height: 1.06;
      text-transform: uppercase;
      letter-spacing: 0.01em;
      text-shadow: 0 10px 30px rgba(0, 0, 0, 0.75);
    }
    .kinetic-line {
      display: block;
      white-space: nowrap;
    }
    .ch {
      display: inline-block;
      will-change: transform, opacity;
    }
    .hl-gold { color: #f5c518; }
    .hl-cyan { color: #38bdf8; }
    .hl-purple { color: #c084fc; }
    .glass-card {
      background: rgba(15, 23, 42, 0.82);
      border: 2px solid rgba(245, 197, 24, 0.65);
      border-radius: 22px;
      padding: 24px 28px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.65);
    }
    .telemetry-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      margin-top: 14px;
    }
    .telemetry-box {
      background: rgba(30, 41, 59, 0.85);
      border: 1px solid rgba(148, 163, 184, 0.25);
      border-radius: 14px;
      padding: 14px;
      text-align: center;
    }
    .telemetry-val {
      font-family: "Anton", sans-serif;
      font-size: 36px;
      color: #f5c518;
      line-height: 1.05;
    }
    .telemetry-lbl {
      font-size: 12px;
      font-weight: 800;
      color: #94a3b8;
      letter-spacing: 0.08em;
      margin-top: 4px;
    }
    /* Ato 2: PixelFX Arcane Canvas */
    .pixelfx-stage {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      background: rgba(12, 10, 26, 0.88);
      border: 2px solid #c084fc;
      border-radius: 24px;
      padding: 20px;
      box-shadow: 0 22px 55px rgba(168, 85, 247, 0.28);
    }
    #pixelfx-canvas {
      width: 520px;
      height: 360px;
      image-rendering: pixelated;
      border-radius: 14px;
      background: radial-gradient(circle at 50% 60%, #1e1136 0%, #090514 85%);
      border: 1px solid rgba(192, 132, 252, 0.35);
    }
    .pixelfx-caption {
      margin-top: 12px;
      font-size: 16px;
      font-weight: 800;
      color: #e9d5ff;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    /* Ato 3: HyperFrames Bar Chart Race Block */
    .race-wrap {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .race-row {
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: 16px;
      padding: 14px 18px;
    }
    .race-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 18px;
      font-weight: 800;
      margin-bottom: 8px;
    }
    .race-track {
      height: 20px;
      background: rgba(2, 6, 23, 0.95);
      border-radius: 99px;
      overflow: hidden;
    }
    .race-fill {
      height: 100%;
      width: 0%;
      border-radius: 99px;
    }
    /* Cortina de transição Whip / Glitch entre atos */
    #act-transition-flash {
      position: absolute;
      inset: 0;
      background: linear-gradient(110deg, transparent 15%, rgba(56, 189, 248, 0.55) 45%, rgba(245, 197, 24, 0.75) 55%, transparent 85%);
      transform: translateX(-120%);
      z-index: 28;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div
    id="root"
    data-composition-id="main"
    data-root="true"
    data-start="0"
    data-duration="${duration}"
    data-width="720"
    data-height="1280"
    data-fps="30"
  >
    <canvas id="three-bg" width="720" height="1280"></canvas>
    <div class="cyber-grid"></div>

    <div class="hud-header">
      <div class="hud-pill"><span class="hud-dot"></span><span>FREEFORM · HYPERFRAMES</span></div>
      <div class="hud-pill" id="hud-timecode">T = 0.00s</div>
    </div>

    <!-- ATO 1 (0s - 4s): Three.js Low-Poly Core + Tipografia Cinética GSAP Stagger -->
    <div id="act-1" class="act-layer">
      <div>
        <div class="act-badge" id="a1-badge">ATO 01 · MOTOR 3D &amp; GSAP STAGGER</div>
        <h1 class="kinetic-title">
          <span class="kinetic-line" id="a1-line1"></span>
          <span class="kinetic-line hl-gold" id="a1-line2"></span>
          <span class="kinetic-line hl-cyan" id="a1-line3"></span>
        </h1>
      </div>
      <div class="glass-card" id="a1-card">
        <div style="font-size:20px;font-weight:800;color:#e2e8f0;">
          Geometria Three.js low-poly e partículas 3D sincronizadas com <span class="hl-gold">window.__seek(t)</span>
        </div>
        <div class="telemetry-grid">
          <div class="telemetry-box">
            <div class="telemetry-val">30 FPS</div>
            <div class="telemetry-lbl">FRAME LOCK</div>
          </div>
          <div class="telemetry-box">
            <div class="telemetry-val">100%</div>
            <div class="telemetry-lbl">DETERMINÍSTICO</div>
          </div>
          <div class="telemetry-box">
            <div class="telemetry-val">WEBGL</div>
            <div class="telemetry-lbl">LOW-POLY 3D</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ATO 2 (4s - 8s): Efeito PixelFX (Rune Circle + Portal Dithered Canvas) -->
    <div id="act-2" class="act-layer" style="opacity:0;">
      <div>
        <div class="act-badge" id="a2-badge" style="background:#c084fc;color:#090514;">ATO 02 · BIBLIOTECA PIXELFX (244 EFEITOS)</div>
        <h1 class="kinetic-title">
          <span class="kinetic-line" id="a2-line1"></span>
          <span class="kinetic-line hl-purple" id="a2-line2"></span>
        </h1>
      </div>
      <div class="pixelfx-stage" id="a2-stage">
        <canvas id="pixelfx-canvas" width="160" height="112"></canvas>
        <div class="pixelfx-caption">PIXELFX: RUNE-CIRCLE + ARCANE PORTAL (BAYER 4×4 DITHER)</div>
      </div>
    </div>

    <!-- ATO 3 (8s - 12s): Bloco HyperFrames Bar Chart Race & Ecossistema -->
    <div id="act-3" class="act-layer" style="opacity:0;">
      <div>
        <div class="act-badge" id="a3-badge" style="background:#38bdf8;color:#090d16;">ATO 03 · HYPERFRAMES DATA BLOCK</div>
        <h1 class="kinetic-title">
          <span class="kinetic-line" id="a3-line1"></span>
          <span class="kinetic-line hl-gold" id="a3-line2"></span>
        </h1>
      </div>
      <div class="glass-card" id="a3-card" style="border-color:#38bdf8;">
        <div class="race-wrap">
          <div class="race-row" id="r-row-1">
            <div class="race-head"><span>#1 SCENE3D · SIMULAÇÃO 2030</span><span class="hl-gold" id="r-val-1">0 pts</span></div>
            <div class="race-track"><div class="race-fill" id="r-fill-1" style="background:linear-gradient(90deg,#f5c518,#f97316);"></div></div>
          </div>
          <div class="race-row" id="r-row-2">
            <div class="race-head"><span>#2 HYPERFRAMES · 450+ BLOCOS</span><span class="hl-cyan" id="r-val-2">0 pts</span></div>
            <div class="race-track"><div class="race-fill" id="r-fill-2" style="background:linear-gradient(90deg,#38bdf8,#6366f1);"></div></div>
          </div>
          <div class="race-row" id="r-row-3">
            <div class="race-head"><span>#3 PIXELFX &amp; LEMO-OPUSCAR</span><span class="hl-purple" id="r-val-3">0 pts</span></div>
            <div class="race-track"><div class="race-fill" id="r-fill-3" style="background:linear-gradient(90deg,#c084fc,#ec4899);"></div></div>
          </div>
        </div>
      </div>
    </div>

    <div id="act-transition-flash"></div>
  </div>

  <script>
    (function() {
      const DURATION = ${duration};

      // 1. Subdivide linhas de título em spans por caractere para stagger cinético GSAP
      function splitChars(elId, text, cls) {
        const el = document.getElementById(elId);
        if (!el) return;
        el.innerHTML = text
          .split("")
          .map(function(ch) {
            return '<span class="ch ' + cls + '">' + (ch === " " ? "&nbsp;" : ch) + "</span>";
          })
          .join("");
      }

      splitChars("a1-line1", "VÍDEO COMO", "a1-ch");
      splitChars("a1-line2", "CÓDIGO 3D", "a1-ch");
      splitChars("a1-line3", "DETERMINÍSTICO", "a1-ch");

      splitChars("a2-line1", "PIXELFX VFX", "a2-ch");
      splitChars("a2-line2", "ARCANE ENGINE", "a2-ch");

      splitChars("a3-line1", "HYPERFRAMES", "a3-ch");
      splitChars("a3-line2", "+3.200 BLOCOS", "a3-ch");

      // 2. Cena Three.js 3D (Cristal Low-Poly + Anéis Giroscópicos + Satélites + Campo de Partículas)
      const threeCanvas = document.getElementById("three-bg");
      const renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setSize(720, 1280, false);
      renderer.setPixelRatio(1);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, 720 / 1280, 0.1, 100);

      const ambient = new THREE.AmbientLight("#ffffff", 1.1);
      scene.add(ambient);
      const keyLight = new THREE.DirectionalLight("#f5c518", 2.2);
      keyLight.position.set(5, 8, 6);
      scene.add(keyLight);
      const cyanLight = new THREE.DirectionalLight("#38bdf8", 1.8);
      cyanLight.position.set(-6, -4, 5);
      scene.add(cyanLight);

      const coreGroup = new THREE.Group();
      coreGroup.position.set(0, 0.15, 0);
      scene.add(coreGroup);

      // Cristal central low-poly
      const crystalMat = new THREE.MeshStandardMaterial({
        color: "#38bdf8",
        roughness: 0.25,
        metalness: 0.35,
        flatShading: true,
      });
      const crystal = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), crystalMat);
      coreGroup.add(crystal);

      // Wireframe externo dourado
      const wireMesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.42, 1),
        new THREE.MeshBasicMaterial({ color: "#f5c518", wireframe: true, transparent: true, opacity: 0.55 })
      );
      coreGroup.add(wireMesh);

      // 2 Anéis giroscópicos low-poly
      const ring1 = new THREE.Mesh(
        new THREE.TorusGeometry(2.05, 0.045, 10, 48),
        new THREE.MeshStandardMaterial({ color: "#f5c518", roughness: 0.3, metalness: 0.6 })
      );
      const ring2 = new THREE.Mesh(
        new THREE.TorusGeometry(2.45, 0.035, 10, 48),
        new THREE.MeshStandardMaterial({ color: "#c084fc", roughness: 0.3, metalness: 0.6 })
      );
      ring2.rotation.x = Math.PI / 3;
      coreGroup.add(ring1, ring2);

      // 12 Satélites low-poly em órbita
      const satellites = [];
      for (let i = 0; i < 12; i++) {
        const sat = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.18, 0),
          new THREE.MeshStandardMaterial({
            color: i % 2 === 0 ? "#f5c518" : "#38bdf8",
            roughness: 0.3,
            flatShading: true,
          })
        );
        coreGroup.add(sat);
        satellites.push(sat);
      }

      // Campo de 160 partículas 3D determinísticas
      const particleGroup = new THREE.Group();
      scene.add(particleGroup);
      const pMatGold = new THREE.MeshBasicMaterial({ color: "#f5c518" });
      const pMatCyan = new THREE.MeshBasicMaterial({ color: "#38bdf8" });
      const pGeom = new THREE.BoxGeometry(0.06, 0.06, 0.06);
      const particles = [];
      let seed = 1337;
      function nextRng() {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      }
      for (let i = 0; i < 160; i++) {
        const pm = new THREE.Mesh(pGeom, i % 3 === 0 ? pMatGold : pMatCyan);
        const rx = (nextRng() - 0.5) * 9;
        const ry = (nextRng() - 0.5) * 14;
        const rz = (nextRng() - 0.5) * 6 - 1.5;
        pm.userData = { rx: rx, ry: ry, rz: rz, sp: 0.5 + nextRng() * 1.4, phase: nextRng() * 6.28 };
        particleGroup.add(pm);
        particles.push(pm);
      }

      // 3. Engine PixelFX determinístico (adaptado de library/vendor/pixelfx/src/fx/arcane/rune-circle.js)
      const pfxCanvas = document.getElementById("pixelfx-canvas");
      const pfxCtx = pfxCanvas.getContext("2d");
      const PW = 160, PH = 112;
      const pfxImg = pfxCtx.createImageData(PW, PH);
      const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(function(v) { return (v + 0.5) / 16; });
      const GLYPHS = [
        [".#.", "#.#", ".#.", ".#.", "#.#"],
        ["#.#", "#.#", ".#.", "#.#", "#.#"],
        ["##.", "#.#", "##.", "#..", "#.."],
        ["#..", "#.#", "###", "#.#", "..#"],
        ["###", ".#.", "###", ".#.", ".#."],
        ["#.#", "###", "#.#", "..#", "..#"]
      ];
      const PAL_ARCANE = [
        [18, 10, 36],
        [46, 22, 84],
        [88, 40, 148],
        [139, 68, 212],
        [192, 132, 252],
        [233, 213, 255],
        [255, 245, 157]
      ];

      function renderPixelFxRuneCircle(t) {
        const data = pfxImg.data;
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 10;
          data[i + 1] = 6;
          data[i + 2] = 22;
          data[i + 3] = 255;
        }
        const cx = 80, cy = 74;
        const R = 52, RR = 43, RI = 26, SY = 0.34;
        const spin = t * 1.15;
        const chase = t * 3.2;

        function putPx(x, y, rgb, alpha) {
          const ix = Math.round(x), iy = Math.round(y);
          if (ix < 0 || iy < 0 || ix >= PW || iy >= PH) return;
          const b = BAYER[((iy & 3) << 2) | (ix & 3)];
          if (alpha < b) return;
          const idx = (iy * PW + ix) * 4;
          data[idx] = rgb[0];
          data[idx + 1] = rgb[1];
          data[idx + 2] = rgb[2];
        }

        function addGlow(gx, gy, rad, rgb, strength) {
          const x0 = Math.max(0, Math.floor(gx - rad)), x1 = Math.min(PW - 1, Math.ceil(gx + rad));
          const y0 = Math.max(0, Math.floor(gy - rad)), y1 = Math.min(PH - 1, Math.ceil(gy + rad));
          for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
              const d = Math.hypot(x - gx, y - gy) / rad;
              if (d >= 1) continue;
              const k = (1 - d) * (1 - d) * strength;
              const idx = (y * PW + x) * 4;
              data[idx] = Math.min(255, data[idx] + rgb[0] * k);
              data[idx + 1] = Math.min(255, data[idx + 1] + rgb[1] * k);
              data[idx + 2] = Math.min(255, data[idx + 2] + rgb[2] * k);
            }
          }
        }

        // Glow central do portal no chão
        addGlow(cx, cy, 58, PAL_ARCANE[3], 0.45);
        addGlow(cx, cy - 18, 36, PAL_ARCANE[4], 0.35);

        // Anéis em perspectiva (floorRing)
        for (let a = 0; a < 180; a++) {
          const ang = (a / 180) * Math.PI * 2;
          const hot = Math.abs(Math.sin((ang - chase) / 2)) < 0.18;
          const col = hot ? PAL_ARCANE[6] : PAL_ARCANE[4];
          putPx(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R * SY, col, 0.95);
          putPx(cx + Math.cos(ang) * RI, cy + Math.sin(ang) * RI * SY, PAL_ARCANE[3], 0.85);
        }

        // 12 Runas (GLYPHS 3x5) orbitando o círculo com partículas ascendentes
        for (let k = 0; k < 12; k++) {
          const g = spin + (k * Math.PI * 2) / 12;
          const rx = cx + Math.cos(g) * RR;
          const ry = cy + Math.sin(g) * RR * SY - 3 + Math.sin(t * 5 + k) * 1.5;
          const glyph = GLYPHS[k % GLYPHS.length];
          const isFront = Math.sin(g) >= 0;
          const col = isFront ? PAL_ARCANE[6] : PAL_ARCANE[4];
          for (let r = 0; r < 5; r++) {
            for (let q = 0; q < 3; q++) {
              if (glyph[r][q] === "#") {
                putPx(rx + q - 1, ry + r - 2, col, isFront ? 1.0 : 0.65);
              }
            }
          }
          addGlow(rx, ry, isFront ? 9 : 5, PAL_ARCANE[4], isFront ? 0.42 : 0.18);
        }

        // Motes ascendentes com dithering Bayer
        for (let m = 0; m < 38; m++) {
          const life = ((t * 0.75 + m * 0.19) % 1);
          const ang = m * 1.7 + life * 1.4;
          const rad = (R * 0.88) * (1 - life * 0.35);
          const mx = cx + Math.cos(ang) * rad;
          const my = cy + Math.sin(ang) * rad * SY - life * 54;
          const col = m % 3 === 0 ? PAL_ARCANE[6] : PAL_ARCANE[5];
          putPx(mx, my, col, 1 - life * 0.75);
          putPx(mx, my + 1, PAL_ARCANE[4], (1 - life) * 0.6);
        }

        pfxCtx.putImageData(pfxImg, 0, 0);
      }

      // 4. Sincronizador determinístico global em função de t
      function renderSceneAt(rawT) {
        const t = Math.max(0, Math.min(DURATION, Number(rawT) || 0));
        const tcEl = document.getElementById("hud-timecode");
        if (tcEl) tcEl.textContent = "T = " + t.toFixed(2) + "s";

        // Atualiza núcleo 3D e partículas de acordo com o ato ativo
        crystal.rotation.y = t * 0.95;
        crystal.rotation.x = t * 0.55;
        wireMesh.rotation.y = -t * 0.65;
        wireMesh.rotation.z = t * 0.45;
        ring1.rotation.x = t * 1.1;
        ring1.rotation.y = t * 0.7;
        ring2.rotation.y = -t * 1.25;
        ring2.rotation.z = t * 0.8;

        for (let i = 0; i < satellites.length; i++) {
          const s = satellites[i];
          const ang = t * 1.6 + (i * Math.PI * 2) / satellites.length;
          const rad = 2.75 + Math.sin(t * 3 + i) * 0.25;
          s.position.set(
            Math.cos(ang) * rad,
            Math.sin(ang * 1.5) * 0.85,
            Math.sin(ang) * rad
          );
          s.rotation.set(t * 2, t * 1.5, 0);
        }

        for (let i = 0; i < particles.length; i++) {
          const pm = particles[i];
          const u = pm.userData;
          const py = (((u.ry + t * u.sp) % 14) + 14) % 14 - 7;
          pm.position.set(u.rx + Math.sin(t + u.phase) * 0.25, py, u.rz);
          pm.rotation.set(t * 1.5, t, 0);
        }

        // Movimento de câmera 3D fluido através dos 3 atos
        if (t < 4.0) {
          const p = t / 4.0;
          crystalMat.color.set("#38bdf8");
          camera.position.set(Math.sin(p * 0.8) * 1.2, 0.25, 7.6 - p * 1.1);
          camera.lookAt(0, 0.15, 0);
        } else if (t < 8.0) {
          const p = (t - 4.0) / 4.0;
          crystalMat.color.set("#c084fc");
          camera.position.set(Math.cos(p * 1.4) * 1.8, 1.35 - p * 0.5, 6.8);
          camera.lookAt(0, -0.35, 0);
        } else {
          const p = (t - 8.0) / 4.0;
          crystalMat.color.set("#f5c518");
          camera.position.set(Math.sin(p * 1.2) * 1.4, -0.4 + p * 0.8, 7.2 - p * 0.9);
          camera.lookAt(0, 0.2, 0);
        }

        renderer.render(scene, camera);

        // Renderiza o canvas PixelFX durante o Ato 2 (e transição)
        if (t >= 3.6 && t <= 8.4) {
          renderPixelFxRuneCircle(t);
        }
      }

      // 5. Timeline GSAP determinística (3 atos + stagger de letras + transições whip + bar chart race)
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });

      const timeProxy = { t: 0 };
      tl.to(timeProxy, {
        t: DURATION,
        duration: DURATION,
        ease: "none",
        onUpdate: function() {
          renderSceneAt(timeProxy.t);
        }
      }, 0);

      // ATO 1: Entrada com Stagger de letras
      tl.fromTo("#a1-badge", { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "back.out(1.6)" }, 0.05);
      tl.fromTo(".a1-ch", { y: 75, opacity: 0, scale: 0.6 }, { y: 0, opacity: 1, scale: 1, duration: 0.42, stagger: 0.024, ease: "back.out(1.8)" }, 0.12);
      tl.fromTo("#a1-card", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, 0.55);

      // Transição Ato 1 -> Ato 2 (t = 3.85s)
      tl.fromTo("#act-transition-flash", { xPercent: -120 }, { xPercent: 220, duration: 0.45, ease: "power2.inOut" }, 3.82);
      tl.to("#act-1", { opacity: 0, scale: 0.92, duration: 0.25 }, 3.9);

      // ATO 2: PixelFX Arcane Engine + Stagger
      tl.set("#act-2", { opacity: 1 }, 4.0);
      tl.fromTo("#a2-badge", { x: -50, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: "power3.out" }, 4.05);
      tl.fromTo(".a2-ch", { y: -65, opacity: 0, scale: 0.7 }, { y: 0, opacity: 1, scale: 1, duration: 0.4, stagger: 0.025, ease: "back.out(1.7)" }, 4.12);
      tl.fromTo("#a2-stage", { y: 70, scale: 0.88, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.5, ease: "back.out(1.4)" }, 4.35);

      // Transição Ato 2 -> Ato 3 (t = 7.85s)
      tl.fromTo("#act-transition-flash", { xPercent: -120 }, { xPercent: 220, duration: 0.45, ease: "power2.inOut" }, 7.82);
      tl.to("#act-2", { opacity: 0, y: -40, duration: 0.25 }, 7.9);

      // ATO 3: HyperFrames Bar Chart Race + Stagger
      tl.set("#act-3", { opacity: 1 }, 8.0);
      tl.fromTo("#a3-badge", { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "back.out(1.6)" }, 8.05);
      tl.fromTo(".a3-ch", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.38, stagger: 0.022, ease: "power3.out" }, 8.1);
      tl.fromTo("#a3-card", { y: 65, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, 8.3);

      // Animação das barras e contadores do Bar Chart Race
      tl.to("#r-fill-1", { width: "96%", duration: 1.8, ease: "power2.out" }, 8.45);
      tl.to("#r-fill-2", { width: "88%", duration: 1.8, ease: "power2.out" }, 8.6);
      tl.to("#r-fill-3", { width: "82%", duration: 1.8, ease: "power2.out" }, 8.75);

      const raceProxy = { v1: 0, v2: 0, v3: 0 };
      tl.to(raceProxy, {
        v1: 980,
        v2: 895,
        v3: 840,
        duration: 1.8,
        ease: "power2.out",
        onUpdate: function() {
          const e1 = document.getElementById("r-val-1");
          const e2 = document.getElementById("r-val-2");
          const e3 = document.getElementById("r-val-3");
          if (e1) e1.textContent = Math.round(raceProxy.v1) + " pts";
          if (e2) e2.textContent = Math.round(raceProxy.v2) + " pts";
          if (e3) e3.textContent = Math.round(raceProxy.v3) + " pts";
        }
      }, 8.45);

      window.__timelines["main"] = tl;
      window.__seek = function(t) {
        tl.seek(t, false);
        renderSceneAt(t);
      };

      renderPixelFxRuneCircle(0);
      renderSceneAt(0);
    })();
  </script>
</body>
</html>`;

  return ProjectSchema.parse({
    id,
    title: 'FREEFORM DEMO — Three.js + PixelFX + HyperFrames em 3 Atos',
    topic: 'Vitrine do modo Freeform HTML/CSS/GSAP/Three.js com PixelFX e HyperFrames em 3 atos',
    tone: 'técnico-editorial',
    targetDuration: duration,
    engine: 'freeform',
    styleId: 'cyber-editorial-grid',
    effectIds: [],
    status: 'scripted',
    voice: {
      provider: 'edge',
      voiceId: 'pt-BR-AntonioNeural',
      rate: 1.12,
      pitch: '+0Hz',
    },
    captionStyle: {
      enabled: true,
      style: 'highlight-yellow',
      wordsPerGroup: 3,
      positionY: 85,
      fontSize: 30,
      highlightColor: '#f5c518',
      textColor: '#ffffff',
      burnIn: true,
    },
    renderSettings: {
      width: 720,
      height: 1280,
      fps: 30,
      crf: 21,
      workers: 2,
      renderer: 'hyperframes',
      embedCaptions: true,
      musicTrack: 'upbeat-simulation',
      musicVolume: 0.15,
      duckingThreshold: 0.03,
      sfxVolume: 0.25,
    },
    scenes: [],
    kineticBlocks: [],
    freeform: {
      html,
      subCompositions: {},
      assets: {},
      narration:
        'No modo freeform, você combina cenas Three.js em tempo real, efeitos pixel art da biblioteca PixelFX e blocos de dados animados do HyperFrames.',
      duration,
      prompt:
        'Vitrine em 3 atos com núcleo low-poly Three.js, tipografia cinética GSAP com stagger, efeito PixelFX Rune Circle com dithering Bayer e Bar Chart Race do HyperFrames.',
      styleId: 'cyber-editorial-grid',
      effectIds: ['effect-sparkles'],
      variables: [],
    },
    totalDuration: duration,
    createdAt: now,
    updatedAt: now,
  });
}

export function createMusicaAcordeMenorProject(id = 'musica-acorde-menor'): Project {
  const now = new Date().toISOString();
  return ProjectSchema.parse({
    id,
    title: 'POR QUE O ACORDE MENOR SOA TRISTE?',
    topic: 'Teoria musical prática: como baixar a terça em meio tom transforma Dó maior em Dó menor (C–E–G para C–E♭–G).',
    tone: 'didático-musical',
    targetDuration: 20,
    engine: 'scene3d',
    designKitId: 'simulacao-2030',
    styleId: 'simulacao-lowpoly-3d',
    effectIds: [],
    status: 'scripted',
    voice: {
      provider: 'edge',
      voiceId: 'pt-BR-AntonioNeural',
      rate: 1.15,
      pitch: '+0Hz',
    },
    captionStyle: {
      enabled: true,
      style: 'highlight-yellow',
      wordsPerGroup: 3,
      positionY: 83,
      fontSize: 32,
      highlightColor: '#f5c518',
      textColor: '#ffffff',
      burnIn: true,
    },
    renderSettings: {
      width: 720,
      height: 1280,
      fps: 30,
      crf: 21,
      workers: 2,
      renderer: 'hyperframes',
      embedCaptions: true,
      musicTrack: 'upbeat-simulation',
      musicVolume: 0.14,
      duckingThreshold: 0.03,
      sfxVolume: 0.28,
    },
    scenes: [
      {
        id: 'scene-1-gancho-piano',
        order: 0,
        narration: 'Por que o acorde menor soa triste? Ouça Dó, Mi e Sol!',
        duration: 4.0,
        template: 'music-studio',
        templateProps: {
          boardText: 'DÓ MAIOR\nC · E · G',
          highlightKeys: ['C4', 'E4', 'G4'],
          keyframes: [
            { t: 0.0, keys: ['C4'], boardText: 'NOTA DÓ (C)' },
            { t: 1.0, keys: ['C4', 'E4'], boardText: 'DÓ + MI (C · E)' },
            { t: 2.0, keys: ['C4', 'E4', 'G4'], boardText: 'DÓ MAIOR\nC · E · G' },
          ],
          highlightColor: '#f5c518',
          wallColor: '#1e1b4b',
        },
        characterId: 'prof-caio',
        secondaryCharacterIds: [],
        pose: 'play-piano',
        camera: 'dolly-in',
        transition: 'cut',
        overlays: [
          {
            type: 'title',
            subtitle: 'AULA DE HARMONIA · TEORIA',
            text: 'POR QUE ACORDE MENOR SOA TRISTE?',
            highlightWord: 'TRISTE?',
            position: 'top',
            boxed: false,
          },
          {
            type: 'badge',
            text: 'NA PRÁTICA AO VIVO',
            icon: '⚠',
            color: '#f5c518',
          },
          {
            type: 'lower-third',
            name: 'PROF. CAIO HARMONIA',
            subtitle: 'PROFESSOR DE MÚSICA · BH',
          },
        ],
        highlightWords: ['triste', 'Dó', 'Mi', 'Sol'],
        sfx: 'ding',
      },
      {
        id: 'scene-2-terca-bemol',
        order: 1,
        narration: 'Agora desça o Mi meio tom para Mi bemol!',
        duration: 4.0,
        template: 'music-studio',
        templateProps: {
          boardText: 'DÓ MAIOR\nC · E · G',
          highlightKeys: ['C4', 'E4', 'G4'],
          keyframes: [
            { t: 0.0, keys: ['C4', 'E4', 'G4'], boardText: 'DÓ MAIOR\nC · E · G' },
            { t: 1.7, keys: ['C4', 'Eb4', 'G4'], boardText: 'DÓ MENOR\nC · E♭ · G' },
          ],
          highlightColor: '#38bdf8',
          wallColor: '#172554',
        },
        characterId: 'prof-caio',
        secondaryCharacterIds: [],
        pose: 'play-piano',
        camera: 'pan',
        transition: 'whip',
        overlays: [
          {
            type: 'role-banner',
            title: 'TERÇA MAIOR → TERÇA MENOR',
            subtitle: 'E4 DESCE MEIO TOM PARA E♭4',
            variant: 'yellow',
          },
        ],
        highlightWords: ['Mi', 'bemol'],
        sfx: 'whoosh',
      },
      {
        id: 'scene-3-palco-guitarra',
        order: 2,
        narration: 'Esse único semitom muda toda a emoção na hora.',
        duration: 3.8,
        template: 'concert-stage',
        templateProps: {
          stageTitle: '-1 SEMITOM',
          stageSubtitle: 'MUDA TODA A EMOÇÃO',
          accentColor: '#38bdf8',
          secondaryLightColor: '#f5c518',
          crowdCount: 18,
        },
        characterId: 'prof-caio',
        secondaryCharacterIds: [],
        pose: 'play-guitar',
        camera: 'orbit',
        transition: 'cut',
        overlays: [],
        highlightWords: ['semitom', 'emoção'],
        sfx: 'ding',
      },
      {
        id: 'scene-4-regencia-tensao',
        order: 3,
        narration: 'O intervalo fechado traz tensão, drama e melancolia.',
        duration: 3.8,
        template: 'concert-stage',
        templateProps: {
          stageTitle: 'C · E♭ · G',
          stageSubtitle: 'MELANCOLIA E DRAMA',
          accentColor: '#ec4899',
          secondaryLightColor: '#38bdf8',
          crowdCount: 20,
        },
        characterId: 'prof-caio',
        secondaryCharacterIds: [],
        pose: 'conduct',
        camera: 'dolly-in',
        transition: 'whip',
        overlays: [
          {
            type: 'counter',
            label: 'INTERVALO DA TERÇA MENOR',
            from: 0,
            to: 3,
            prefix: '',
            suffix: ' SEMITONS',
            sublabel: 'CONTRA 4 SEMITONS NO MAIOR',
          },
        ],
        highlightWords: ['tensão', 'drama', 'melancolia'],
        sfx: 'whoosh',
      },
      {
        id: 'scene-5-final-estudio',
        order: 4,
        narration: 'E aí, prefere acorde maior ou menor? Comenta!',
        duration: 3.8,
        template: 'music-studio',
        templateProps: {
          boardText: 'MAIOR vs MENOR\nCOMENTA AÍ!',
          highlightKeys: ['C4', 'Eb4', 'G4'],
          keyframes: [
            { t: 0.0, keys: ['C4', 'E4', 'G4'], boardText: 'DÓ MAIOR\nALEGRE' },
            { t: 1.6, keys: ['C4', 'Eb4', 'G4'], boardText: 'DÓ MENOR\nTRISTE' },
          ],
          highlightColor: '#f5c518',
          wallColor: '#1e1b4b',
        },
        characterId: 'prof-caio',
        secondaryCharacterIds: [],
        pose: 'sing',
        camera: 'close-face',
        transition: 'zoom',
        overlays: [],
        highlightWords: ['maior', 'menor'],
        sfx: 'cheer',
      },
    ],
    kineticBlocks: [],
    totalDuration: 20,
    createdAt: now,
    updatedAt: now,
  });
}
