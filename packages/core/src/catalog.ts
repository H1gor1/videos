import type {
  Character,
  DesignKit,
  StageTemplateId,
  VideoEngineId,
  VoiceInfo,
} from './schemas.ts';

export interface StageTemplateMetadata {
  id: StageTemplateId;
  name: string;
  description: string;
  category: 'politics' | 'economy' | 'society' | 'media' | 'data' | 'music';
  propsSchema: Record<string, { type: string; description: string; default: any }>;
  exampleProps: Record<string, any>;
  recommendedCamera: string[];
  recommendedPoses: string[];
}

export const STAGE_TEMPLATES: StageTemplateMetadata[] = [
  {
    id: 'red-carpet-confetti',
    name: 'Tapete Vermelho + Confete + Holofote',
    description:
      'Cenário de abertura/posse com tapete vermelho, fita de isolamento dourada, chuva de confetes coloridos e feixe de luz dramático ao fundo.',
    category: 'politics',
    propsSchema: {
      wallColor: { type: 'string', description: 'Cor da parede ao fundo', default: '#5d5753' },
      floorColor: { type: 'string', description: 'Cor do piso lateral', default: '#c9c2b8' },
      carpetColor: { type: 'string', description: 'Cor do tapete central', default: '#c1121f' },
      confettiCount: { type: 'number', description: 'Quantidade de confetes caindo', default: 45 },
      spotlightBeam: { type: 'boolean', description: 'Exibir cone de luz branco atrás do personagem', default: true },
    },
    exampleProps: {
      wallColor: '#5d5753',
      floorColor: '#c9c2b8',
      carpetColor: '#c1121f',
      confettiCount: 55,
      spotlightBeam: true,
    },
    recommendedCamera: ['dolly-in', 'static'],
    recommendedPoses: ['celebrating', 'waving', 'talking'],
  },
  {
    id: 'classroom-office',
    name: 'Sala de Aula / Escritório com Lousa e Notebook',
    description:
      'Ambiente interno com lousa verde/quadro branco com texto customizável, mesa de madeira, notebook aberto e estante de livros.',
    category: 'society',
    propsSchema: {
      boardTitle: { type: 'string', description: 'Título escrito na lousa ao fundo', default: 'PLANO 2030' },
      boardSubtitle: { type: 'string', description: 'Subtítulo ou tópicos na lousa', default: '• EDUCAÇÃO\n• TECNOLOGIA\n• EMPREGO' },
      wallColor: { type: 'string', description: 'Cor da parede', default: '#3d405b' },
      hasLaptop: { type: 'boolean', description: 'Exibir notebook sobre a mesa', default: true },
    },
    exampleProps: {
      boardTitle: 'META: 40H SEMANAIS',
      boardSubtitle: 'PRODUTIVIDADE + QUALIDADE DE VIDA',
      wallColor: '#2b2d42',
      hasLaptop: true,
    },
    recommendedCamera: ['dolly-in', 'pan'],
    recommendedPoses: ['typing', 'pointing', 'talking'],
  },
  {
    id: 'pulpit-plenary',
    name: 'Púlpito / Plenário com Placa e Painel de Votação',
    description:
      'Tribuna de madeira em plenário verde com placa vermelha/azul frontal, bancadas em semicírculo, bandeira do Brasil e telão superior de votação.',
    category: 'politics',
    propsSchema: {
      partyLabel: { type: 'string', description: 'Sigla ou texto na placa frontal do púlpito', default: 'FUTURO' },
      partyColor: { type: 'string', description: 'Cor da placa frontal', default: '#c1121f' },
      screenTitle: { type: 'string', description: 'Título no telão do plenário', default: 'VOTAÇÃO EM PLENÁRIO' },
      screenNumber: { type: 'string', description: 'Número grande no telão', default: '257' },
      screenSub: { type: 'string', description: 'Subtexto no telão', default: 'VOTOS NECESSÁRIOS DE 513' },
      showHemicycle: { type: 'boolean', description: 'Exibir bancadas semicirculares do congresso', default: true },
    },
    exampleProps: {
      partyLabel: 'SIM 2030',
      partyColor: '#c1121f',
      screenTitle: 'MUDAR A CONSTITUIÇÃO',
      screenNumber: '308',
      screenSub: 'VOTOS NECESSÁRIOS DE 513',
      showHemicycle: true,
    },
    recommendedCamera: ['dolly-in', 'orbit'],
    recommendedPoses: ['talking', 'pointing', 'celebrating'],
  },
  {
    id: 'brazil-map-3d',
    name: 'Mapa do Brasil 3D com Marcadores e Rotas',
    description:
      'Mapa do Brasil extrudado em 3D verde sobre fundo azul profundo com marcadores de alerta (!), linhas de conexão/rotas, barras regionais ou cápsula 3D.',
    category: 'data',
    propsSchema: {
      mapColor: { type: 'string', description: 'Cor do mapa 3D', default: '#52b788' },
      bgColor: { type: 'string', description: 'Cor do fundo azul', default: '#023e8a' },
      markers: {
        type: 'array',
        description: 'Lista de marcadores [{label, x, y, color}] sobre o mapa',
        default: [
          { label: 'MINÉRIO', x: 0.4, y: -0.1, color: '#f5c518' },
          { label: 'SOJA', x: -0.2, y: -0.3, color: '#e63946' },
          { label: 'TECH', x: 0.2, y: -0.6, color: '#00b4d8' },
        ],
      },
      showPill: { type: 'boolean', description: 'Exibir cápsula/analgésico 3D sobre o mapa', default: false },
      showRoutes: { type: 'boolean', description: 'Exibir linhas vermelhas/amarelas conectando regiões', default: true },
    },
    exampleProps: {
      mapColor: '#52b788',
      bgColor: '#023e8a',
      markers: [
        { label: 'NORTE', x: -0.35, y: 0.45, color: '#f5c518' },
        { label: 'NORDESTE', x: 0.55, y: 0.25, color: '#e63946' },
        { label: 'SUDESTE', x: 0.25, y: -0.45, color: '#00b4d8' },
      ],
      showPill: false,
      showRoutes: true,
    },
    recommendedCamera: ['orbit', 'dolly-in'],
    recommendedPoses: ['pointing', 'thinking'],
  },
  {
    id: 'bar-chart-3d',
    name: 'Gráfico de Barras 3D sobre Grade Neon',
    description:
      'Três ou mais colunas 3D coloridas que crescem com animação GSAP sobre piso de grade neon azul, acompanhadas de rótulos inferiores e ícones superiores.',
    category: 'data',
    propsSchema: {
      bars: {
        type: 'array',
        description: 'Barras [{label, value, color, topBadge}] (value de 0 a 100)',
        default: [
          { label: 'ECONOMIA', value: 82, color: '#52b788', topBadge: 'INVESTIMENTO' },
          { label: 'CONGRESSO', value: 68, color: '#f5c518', topBadge: 'EMPREGO' },
          { label: 'APROVAÇÃO', value: 88, color: '#48cae4', topBadge: 'VIDAS' },
        ],
      },
      gridColor: { type: 'string', description: 'Cor das linhas da grade neon', default: '#1d4ed8' },
    },
    exampleProps: {
      bars: [
        { label: 'INDÚSTRIA', value: 85, color: '#52b788', topBadge: '+42%' },
        { label: 'JUROS', value: 35, color: '#f5c518', topBadge: '-60%' },
        { label: 'RENDA', value: 92, color: '#48cae4', topBadge: '+55%' },
      ],
      gridColor: '#1d4ed8',
    },
    recommendedCamera: ['dolly-in', 'pan'],
    recommendedPoses: ['pointing', 'celebrating'],
  },
  {
    id: 'city-spending-cap',
    name: 'Cidade com Prédios Rotulados + Placa Teto de Gastos + Alavanca',
    description:
      'Três prédios públicos low-poly (HOSPITAL, ESCOLA, POSTO) sob uma grande viga/placa suspensa com alavanca vermelha interativa no chão.',
    category: 'economy',
    propsSchema: {
      beamLabel: { type: 'string', description: 'Texto na placa/viga suspensa', default: 'TETO DE GASTOS' },
      buildings: {
        type: 'array',
        description: 'Rótulos e cores dos 3 prédios',
        default: [
          { label: 'HOSPITAL', color: '#e63946', height: 1.0 },
          { label: 'ESCOLA', color: '#1d3557', height: 0.9 },
          { label: 'POSTO', color: '#2a9d8f', height: 0.82 },
        ],
      },
      leverPulled: { type: 'boolean', description: 'Se a alavanca é acionada e a viga sobe/desce', default: true },
    },
    exampleProps: {
      beamLabel: 'TETO DE GASTOS',
      buildings: [
        { label: 'HOSPITAL', color: '#e63946', height: 1.0 },
        { label: 'ESCOLA', color: '#1d3557', height: 0.92 },
        { label: 'POSTO', color: '#2a9d8f', height: 0.85 },
      ],
      leverPulled: true,
    },
    recommendedCamera: ['pan', 'dolly-in'],
    recommendedPoses: ['pulling-lever', 'pointing'],
  },
  {
    id: 'news-desk',
    name: 'Bancada de Telejornal / Velocímetro Econômico (SELIC)',
    description:
      'Estúdio com bancada, medidor/velocímetro semicircular ao fundo (ex: SELIC 15%) e dois personagens debatendo ou apresentando.',
    category: 'media',
    propsSchema: {
      gaugeTitle: { type: 'string', description: 'Título do medidor ao fundo', default: 'SELIC' },
      gaugeValue: { type: 'string', description: 'Valor em destaque', default: '15% AO ANO' },
      gaugeAngle: { type: 'number', description: 'Posição do ponteiro (-1 a 1)', default: 0.7 },
      deskLabel: { type: 'string', description: 'Texto na bancada ou placa lateral', default: 'BOLETIM 2030' },
    },
    exampleProps: {
      gaugeTitle: 'SELIC',
      gaugeValue: '14,75%',
      gaugeAngle: 0.65,
      deskLabel: 'PLANTÃO ECONÔMICO',
    },
    recommendedCamera: ['static', 'dolly-in'],
    recommendedPoses: ['talking', 'pointing', 'thinking'],
  },
  {
    id: 'courtroom',
    name: 'Tribunal / Conselho Popular com Bancada Tripla',
    description:
      'Mesa longa de madeira com até 3 personagens lado a lado, papéis sobre a mesa e placas institucionais na parede clara ao fundo.',
    category: 'society',
    propsSchema: {
      topBanner: { type: 'string', description: 'Placa superior na parede', default: 'CONSELHO CIDADÃO' },
      subBanner: { type: 'string', description: 'Placa azul inferior na parede', default: 'AUDIÊNCIA PÚBLICA 2030' },
      wallColor: { type: 'string', description: 'Cor da parede do tribunal', default: '#d6ccc2' },
    },
    exampleProps: {
      topBanner: 'MÃES DE VÍTIMAS',
      subBanner: 'CONSELHO POPULAR DE SEGURANÇA',
      wallColor: '#d6ccc2',
    },
    recommendedCamera: ['dolly-in', 'pan'],
    recommendedPoses: ['talking', 'idle', 'sad'],
  },
  {
    id: 'street-protest',
    name: 'Rua / Manifestação com Multidão Blocky e Bandeiras',
    description:
      'Palco elevado diante de uma multidão de personagens blocky em 3D, bandeiras do Brasil tremulando, placa amarela inclinada e fundo radial vibrante.',
    category: 'society',
    propsSchema: {
      signText: { type: 'string', description: 'Texto na faixa amarela superior', default: 'COMENTA AÍ!' },
      crowdSize: { type: 'number', description: 'Tamanho da multidão 3D', default: 28 },
      showFlags: { type: 'boolean', description: 'Exibir bandeiras do Brasil na multidão', default: true },
      bgColor: { type: 'string', description: 'Cor do fundo dramático', default: '#6a040f' },
    },
    exampleProps: {
      signText: 'COMENTA AÍ',
      crowdSize: 30,
      showFlags: true,
      bgColor: '#6a040f',
    },
    recommendedCamera: ['dolly-in', 'close-face'],
    recommendedPoses: ['waving', 'celebrating', 'talking'],
  },
  {
    id: 'spotlight-close',
    name: 'Spotlight Neutro / Card de Rede Social em Close',
    description:
      'Fundo escuro minimalista com iluminação dramática no personagem e telão/card vertical iluminado ao lado (perfil de rede social, manchete ou código).',
    category: 'media',
    propsSchema: {
      cardHeader: { type: 'string', description: 'Cabeçalho do card lateral', default: 'rede social' },
      cardTitle: { type: 'string', description: 'Nome/título no card', default: 'SIMULAÇÃO 2030' },
      cardSubtitle: { type: 'string', description: 'Subtítulo no card', default: '1 milhão de inscritos' },
    },
    exampleProps: {
      cardHeader: 'rede social',
      cardTitle: 'MARCO SILVA',
      cardSubtitle: '1,2 milhão de seguidores',
    },
    recommendedCamera: ['close-face', 'dolly-in'],
    recommendedPoses: ['talking', 'pointing', 'thinking'],
  },
  {
    id: 'timeline-3d',
    name: 'Linha do Tempo 3D / Recursos Estratégicos (Lítio, Nióbio, Refinaria)',
    description:
      'Bancada ou linha do tempo 3D escalonada com barris/marcos rotulados (ex: LÍTIO, NIÓBIO, TERRAS RARAS ou anos 2026 → 2028 → 2030) e cristais/ícones 3D.',
    category: 'economy',
    propsSchema: {
      milestones: {
        type: 'array',
        description: 'Itens [{label, tag, color}] exibidos nos pedestais/barris 3D',
        default: [
          { label: 'LÍTIO', tag: 'BRASIL', color: '#f4a261' },
          { label: 'NIÓBIO', tag: 'BRASIL', color: '#e9c46a' },
          { label: 'TERRAS RARAS', tag: 'BRASIL', color: '#e76f51' },
        ],
      },
      mode: { type: 'string', description: 'Modo visual: barrels (barris+minérios) ou timeline (anos/marcos)', default: 'barrels' },
    },
    exampleProps: {
      milestones: [
        { label: 'LÍTIO', tag: 'BRASIL', color: '#f4a261' },
        { label: 'NIÓBIO', tag: 'BRASIL', color: '#e9c46a' },
        { label: 'TERRAS RARAS', tag: 'BRASIL', color: '#e76f51' },
      ],
      mode: 'barrels',
    },
    recommendedCamera: ['pan', 'dolly-in'],
    recommendedPoses: ['pointing', 'talking'],
  },
  {
    id: 'music-studio',
    name: 'Estúdio Musical com Piano 2 Oitavas, Monitores e Painel',
    description:
      'Estúdio acústico low-poly com teclado/piano de 2 oitavas (teclas brancas e pretas reais) que acendem notas em destaque via highlightKeys ou keyframes [{t, keys}], caixas monitoras, microfone com pedestal e painel didático.',
    category: 'music',
    propsSchema: {
      boardText: { type: 'string', description: 'Texto exibido no painel/quadro atrás do teclado', default: 'DÓ MAIOR\nC · E · G' },
      highlightKeys: {
        type: 'array',
        description: 'Notas acesas em destaque (ex: ["C4", "E4", "G4"] ou ["C4", "Eb4", "G4"])',
        default: ['C4', 'E4', 'G4'],
      },
      keyframes: {
        type: 'array',
        description: 'Keyframes temporais opcionais [{t, keys, boardText?}] para animar acordes ao longo da cena',
        default: [],
      },
      highlightColor: { type: 'string', description: 'Cor de destaque das teclas acesas', default: '#f5c518' },
      wallColor: { type: 'string', description: 'Cor da parede acústica do estúdio', default: '#1e1b4b' },
    },
    exampleProps: {
      boardText: 'DÓ MAIOR → MENOR\nC · E → E♭ · G',
      highlightKeys: ['C4', 'E4', 'G4'],
      keyframes: [
        { t: 0, keys: ['C4', 'E4', 'G4'], boardText: 'DÓ MAIOR\nC · E · G' },
        { t: 2.0, keys: ['C4', 'Eb4', 'G4'], boardText: 'DÓ MENOR\nC · E♭ · G' },
      ],
      highlightColor: '#f5c518',
      wallColor: '#1e1b4b',
    },
    recommendedCamera: ['dolly-in', 'pan'],
    recommendedPoses: ['play-piano', 'sing', 'talking'],
  },
  {
    id: 'concert-stage',
    name: 'Palco de Show com Luzes Animadas, Instrumentos e Plateia',
    description:
      'Palco elevado com treliça e holofotes coloridos animados, bateria low-poly, guitarra, telão traseiro e plateia em silhuetas vibrando no ritmo.',
    category: 'music',
    propsSchema: {
      stageTitle: { type: 'string', description: 'Texto no telão luminoso ao fundo do palco', default: 'ACORDE MENOR' },
      stageSubtitle: { type: 'string', description: 'Subtítulo no telão do palco', default: 'HARMONIA AO VIVO' },
      accentColor: { type: 'string', description: 'Cor principal dos refletores e bordas do palco', default: '#38bdf8' },
      secondaryLightColor: { type: 'string', description: 'Cor secundária dos refletores animados', default: '#ec4899' },
      crowdCount: { type: 'number', description: 'Quantidade de silhuetas na plateia', default: 18 },
    },
    exampleProps: {
      stageTitle: 'TERÇA MENOR',
      stageSubtitle: 'C4 · E♭4 · G4',
      accentColor: '#38bdf8',
      secondaryLightColor: '#ec4899',
      crowdCount: 18,
    },
    recommendedCamera: ['orbit', 'dolly-in'],
    recommendedPoses: ['play-guitar', 'sing', 'conduct'],
  },
];

export const DEFAULT_CHARACTERS: Character[] = [
  {
    id: 'marco-silva',
    name: 'Marco Silva',
    role: 'Analista Político · Recife',
    skinColor: '#7a4b2a',
    hairStyle: 'afro',
    hairColor: '#181412',
    hasBeard: true,
    beardColor: '#181412',
    hasGlasses: true,
    glassesColor: '#111111',
    shirtColor: '#c1121f',
    shirtAccentColor: '#f5c518',
    hasShirtStar: true,
    pantsColor: '#1d3557',
    shoeColor: '#f8f9fa',
    accessories: [],
    headScale: 1.38,
  },
  {
    id: 'helena-costa',
    name: 'Helena Costa',
    role: 'Economista-Chefe · São Paulo',
    skinColor: '#d49a6a',
    hairStyle: 'bun',
    hairColor: '#2b1d14',
    hasBeard: false,
    beardColor: '#2b1d14',
    hasGlasses: true,
    glassesColor: '#b5838d',
    shirtColor: '#f8f9fa',
    shirtAccentColor: '#1d3557',
    hasShirtStar: false,
    pantsColor: '#1d3557',
    shoeColor: '#212529',
    accessories: ['badge'],
    headScale: 1.35,
  },
  {
    id: 'presidente-sim',
    name: 'Marco (Faixa Presidencial)',
    role: 'Presidente Eleito · Brasília',
    skinColor: '#7a4b2a',
    hairStyle: 'afro',
    hairColor: '#181412',
    hasBeard: true,
    beardColor: '#181412',
    hasGlasses: true,
    glassesColor: '#111111',
    shirtColor: '#c1121f',
    shirtAccentColor: '#f5c518',
    hasShirtStar: true,
    pantsColor: '#1d3557',
    shoeColor: '#f8f9fa',
    accessories: ['sash'],
    headScale: 1.38,
  },
  {
    id: 'operario-lucas',
    name: 'Lucas Mendes',
    role: 'Trabalhador Industrial · ABC',
    skinColor: '#8d5524',
    hairStyle: 'short',
    hairColor: '#1a1a1a',
    hasBeard: false,
    beardColor: '#1a1a1a',
    hasGlasses: false,
    glassesColor: '#111111',
    shirtColor: '#1d4ed8',
    shirtAccentColor: '#f5c518',
    hasShirtStar: false,
    pantsColor: '#1e293b',
    shoeColor: '#334155',
    accessories: ['hat'],
    headScale: 1.36,
  },
  {
    id: 'banqueiro-alberto',
    name: 'Alberto Faria',
    role: 'Diretor Financeiro · Faria Lima',
    skinColor: '#f1c27d',
    hairStyle: 'short',
    hairColor: '#9ca3af',
    hasBeard: false,
    beardColor: '#9ca3af',
    hasGlasses: true,
    glassesColor: '#374151',
    shirtColor: '#1f2937',
    shirtAccentColor: '#ef4444',
    hasShirtStar: false,
    pantsColor: '#111827',
    shoeColor: '#000000',
    accessories: ['suit', 'tie'],
    headScale: 1.34,
  },
  {
    id: 'prof-caio',
    name: 'Prof. Caio Harmonia',
    role: 'Professor de Música · Belo Horizonte',
    skinColor: '#c68642',
    hairStyle: 'short',
    hairColor: '#1f1a17',
    hasBeard: true,
    beardColor: '#1f1a17',
    hasGlasses: true,
    glassesColor: '#eab308',
    shirtColor: '#1e293b',
    shirtAccentColor: '#38bdf8',
    hasShirtStar: false,
    pantsColor: '#0f172a',
    shoeColor: '#f8fafc',
    accessories: ['badge'],
    headScale: 1.38,
  },
];

export const DEFAULT_VOICES: VoiceInfo[] = [
  {
    id: 'pt-BR-AntonioNeural',
    name: 'Antônio Neural (Masculino · Dinâmico)',
    provider: 'edge',
    language: 'pt-BR',
    gender: 'male',
    available: true,
    description: 'Voz neural gratuita da Microsoft Edge com word boundaries nativos. Ideal para narração estilo Simulação 2030.',
  },
  {
    id: 'pt-BR-FranciscaNeural',
    name: 'Francisca Neural (Feminino · Clara)',
    provider: 'edge',
    language: 'pt-BR',
    gender: 'female',
    available: true,
    description: 'Voz neural gratuita da Microsoft Edge com ótima dicção para explainers e listas.',
  },
  {
    id: 'pt-BR-ThalitaMultilingualNeural',
    name: 'Thalita Multilingual Neural (Feminino · Expressiva)',
    provider: 'edge',
    language: 'pt-BR',
    gender: 'female',
    available: true,
    description: 'Voz neural multilíngue moderna da Microsoft Edge.',
  },
  {
    id: 'pt-br',
    name: 'eSpeak-NG Português Brasil (Offline Fallback)',
    provider: 'espeak',
    language: 'pt-BR',
    gender: 'male',
    available: true,
    description: 'Sintetizador local 100% offline via espeak-ng instalado no sistema.',
  },
  {
    id: 'pt_BR-faber-medium',
    name: 'Piper Faber PT-BR (Local Neural)',
    provider: 'piper',
    language: 'pt-BR',
    gender: 'male',
    available: false,
    description: 'Voz neural offline via Piper TTS (requer binário piper configurado no .env).',
  },
  {
    id: 'elevenlabs-ptbr',
    name: 'ElevenLabs Multilingual v2',
    provider: 'elevenlabs',
    language: 'pt-BR',
    gender: 'neutral',
    available: false,
    description: 'Provedor comercial opcional via ELEVENLABS_API_KEY.',
  },
  {
    id: 'alloy',
    name: 'OpenAI TTS-1 (Alloy)',
    provider: 'openai',
    language: 'pt-BR',
    gender: 'neutral',
    available: false,
    description: 'Provedor comercial opcional via OPENAI_API_KEY.',
  },
];

export interface EngineDescriptor {
  id: VideoEngineId;
  name: string;
  tagline: string;
  description: string;
  supportsCharacters: boolean;
  supportsStageTemplates: boolean;
  supportsCustomHtml: boolean;
  exampleId: string;
}

export const VIDEO_ENGINES: EngineDescriptor[] = [
  {
    id: 'scene3d',
    name: 'Simulação 3D (Three.js Blocky + GSAP)',
    tagline: 'Personagens 3D chibi/blocky consistentes, 13 cenários low-poly, overlays jornalísticos e legendas amarelas.',
    description:
      'Engine flagship inspirado na série "Simulação 2030". Constrói personagens 3D procedurais parametrizáveis, cenários 3D com iluminação suave, movimentos de câmera dolly/orbit/pan e overlays 2D sincronizados em uma timeline GSAP determinística para o HyperFrames.',
    supportsCharacters: true,
    supportsStageTemplates: true,
    supportsCustomHtml: false,
    exampleId: 'simulacao-demo',
  },
  {
    id: 'kinetic',
    name: 'Tipografia Cinética & Top-N (Kinetic)',
    tagline: 'Listas virais, rankings Top-5, estatísticas explosivas, citações e cartões animados com GSAP.',
    description:
      'Engine focado em motion design tipográfico de alta retenção: rankings numerados, contadores gigantes, comparativos divididos e citações animadas com transições whip/zoom e legendas sincronizadas.',
    supportsCharacters: false,
    supportsStageTemplates: false,
    supportsCustomHtml: false,
    exampleId: 'kinetic-top5',
  },
  {
    id: 'freeform',
    name: 'Composição Livre HyperFrames (HTML/CSS/JS/Three.js)',
    tagline: 'Qualquer vídeo imaginável: o agente ou usuário escreve HTML/CSS/GSAP/Canvas diretamente no contrato HyperFrames.',
    description:
      'Modo universal onde a IA (via MCP) ou o editor web define diretamente a composição HTML com window.__timelines["main"], aplicando prompts virais e os 99 estilos cinematográficos da biblioteca.',
    supportsCharacters: false,
    supportsStageTemplates: false,
    supportsCustomHtml: true,
    exampleId: 'freeform-demo',
  },
];

export const DEFAULT_DESIGN_KITS: DesignKit[] = [
  {
    id: 'simulacao-2030',
    name: 'Simulação 2030 (Low-Poly Jornalístico)',
    description:
      'Identidade visual oficial da série Simulação 2030: amarelo destaque #f5c518, vermelho editorial #c1121f, iluminação 3D quente de estúdio, tipografia Anton condensada em caixa alta e legendas word-by-word centrais.',
    category: 'Jornalístico / Simulação 3D',
    isOfficial: true,
    palette: {
      primary: '#f5c518',
      accent: '#c1121f',
      background: '#0f172a',
      surface: '#111827',
      text: '#ffffff',
      textOnPrimary: '#111827',
      muted: '#94a3b8',
      danger: '#ef4444',
      success: '#52b788',
      extraSwatches: [
        '#1d3557',
        '#1d4ed8',
        '#38bdf8',
        '#00b4d8',
        '#48cae4',
        '#e63946',
        '#f4a261',
        '#e9c46a',
        '#e76f51',
        '#2a9d8f',
        '#6a040f',
        '#5d5753',
        '#c9c2b8',
      ],
    },
    typography: {
      headingFont: 'Anton',
      bodyFont: 'Inter',
      monoFont: 'IBM Plex Mono',
      allowedFonts: ['Anton', 'Bebas Neue', 'Inter', 'IBM Plex Mono'],
      headingWeight: 900,
      bodyWeight: 800,
      uppercaseHeadings: true,
      titleFontSize: 58,
      subtitleFontSize: 14,
      captionFontSize: 32,
      letterSpacing: '0.02em',
    },
    spacingScale: [4, 8, 12, 16, 24, 32, 48],
    borderRadius: '8px',
    shadowStyle: '0 10px 28px rgba(0, 0, 0, 0.55)',
    safeArea: {
      topPx: 64,
      bottomPx: 130,
      leftPx: 32,
      rightPx: 32,
    },
    captionPreset: {
      enabled: true,
      style: 'highlight-yellow',
      wordsPerGroup: 3,
      positionY: 83,
      fontSize: 32,
      highlightColor: '#f5c518',
      textColor: '#ffffff',
      burnIn: true,
    },
    overlayPreset: {
      titleBoxed: false,
      lowerThirdBorderWidth: 6,
      badgeBorderWidth: 2,
      watermarkHandle: '@simulacao2030',
    },
    scene3dPreset: {
      wallColor: '#5d5753',
      floorColor: '#c9c2b8',
      ambientLightColor: '#fff5eb',
      keyLightColor: '#fffbeb',
      fillLightColor: '#fdba74',
      materialRoughness: 0.76,
    },
    pacing: {
      targetSceneDuration: 4.0,
      minSceneDuration: 2.5,
      maxSceneDuration: 6.0,
      preferredTransition: 'whip',
    },
    voiceTone: 'Jornalístico, didático, ritmo acelerado (1.12x) e tom analítico provocativo',
    rules: [
      'Sempre iniciar a Cena 1 com título forte em Anton caixa alta + badge amarelo ⚠ NA NOSSA SIMULAÇÃO',
      'Destacar 1 palavra-chave em amarelo #f5c518 no título e manter legendas centrais de 2 a 3 palavras',
      'Alternar cenários 3D a cada 3,5–5,5s e nunca posicionar overlays sobre o rosto do personagem',
    ],
    references: [
      {
        id: 'ref-sim2030-ep1',
        kind: 'video',
        title: 'Referência Original Simulação 2030 (7 Planos Low-Poly)',
        urlOrPath: '/renders/simulacao-demo.mp4',
        notes: 'Abertura no tapete vermelho → plenário 257 votos → mapa do Brasil 3D → teto de gastos → minerais críticos → gráfico 3D → multidão.',
        dominantColors: ['#f5c518', '#c1121f', '#1d3557', '#52b788'],
        createdAt: '2026-11-21T00:00:00.000Z',
      },
    ],
    createdAt: '2026-11-21T00:00:00.000Z',
    updatedAt: '2026-11-21T00:00:00.000Z',
  },
  {
    id: 'editorial-minimal',
    name: 'Editorial Minimal (Creme & Terracota)',
    description:
      'Kit contrastante inspirado em revistas impressas e jornalismo de dados minimalista: fundo papel creme (#f4ecdf), destaques em terracota (#c84b31), azul petróleo (#2d4263), sombras duras neo-brutalistas e tipografia Bebas Neue.',
    category: 'Editorial / Minimalista',
    isOfficial: true,
    palette: {
      primary: '#c84b31',
      accent: '#2d4263',
      background: '#f4ecdf',
      surface: '#ffffff',
      text: '#191919',
      textOnPrimary: '#ffffff',
      muted: '#5c5549',
      danger: '#b91c1c',
      success: '#15803d',
      extraSwatches: ['#e6ccb2', '#ddb892', '#7f5539', '#3d405b', '#81b29a', '#f2cc8f'],
    },
    typography: {
      headingFont: 'Bebas Neue',
      bodyFont: 'Inter',
      monoFont: 'IBM Plex Mono',
      allowedFonts: ['Bebas Neue', 'Inter', 'IBM Plex Mono'],
      headingWeight: 800,
      bodyWeight: 700,
      uppercaseHeadings: true,
      titleFontSize: 52,
      subtitleFontSize: 13,
      captionFontSize: 28,
      letterSpacing: '0.05em',
    },
    spacingScale: [4, 8, 16, 24, 32, 48, 64],
    borderRadius: '2px',
    shadowStyle: '5px 5px 0px rgba(25, 25, 25, 0.92)',
    safeArea: {
      topPx: 72,
      bottomPx: 140,
      leftPx: 40,
      rightPx: 40,
    },
    captionPreset: {
      enabled: true,
      style: 'box',
      wordsPerGroup: 3,
      positionY: 83,
      fontSize: 28,
      highlightColor: '#c84b31',
      textColor: '#191919',
      burnIn: true,
    },
    overlayPreset: {
      titleBoxed: true,
      lowerThirdBorderWidth: 4,
      badgeBorderWidth: 2,
      watermarkHandle: '@editorial.minimal',
    },
    scene3dPreset: {
      wallColor: '#efe5d8',
      floorColor: '#dfd1c0',
      ambientLightColor: '#ffffff',
      keyLightColor: '#fffaf0',
      fillLightColor: '#93c5fd',
      materialRoughness: 0.9,
    },
    pacing: {
      targetSceneDuration: 4.5,
      minSceneDuration: 3.0,
      maxSceneDuration: 6.5,
      preferredTransition: 'fade',
    },
    voiceTone: 'Sóbrio, analítico, pausado e estilo documentário editorial',
    rules: [
      'Usar fundo creme claro (#f4ecdf) e cartões brancos com sombra dura desplazada (5px 5px 0px)',
      'Destaques sempre em terracota (#c84b31) ou azul petróleo (#2d4263), nunca amarelo neon',
      'Títulos sempre em caixa (titleBoxed: true) com tipografia Bebas Neue e margens laterais amplas (40px)',
    ],
    references: [
      {
        id: 'ref-editorial-print',
        kind: 'link',
        title: 'Moodboard Editorial Print & Data Viz',
        urlOrPath: 'https://openmotion.dev/design-kits/editorial-minimal',
        notes: 'Inspiração em infográficos impressos de alta legibilidade com contraste tinta sobre papel creme.',
        dominantColors: ['#f4ecdf', '#c84b31', '#2d4263', '#191919'],
        createdAt: '2026-11-21T00:00:00.000Z',
      },
    ],
    createdAt: '2026-11-21T00:00:00.000Z',
    updatedAt: '2026-11-21T00:00:00.000Z',
  },
];

export const STYLE_GUIDE_MARKDOWN = `# Guia de Estilo — Gerador de Vídeos Curtos Verticais (Reels / Shorts)

## 0. Consultar o Design Kit do Projeto (Obrigatório)
- Antes de criar ou editar cenas, **sempre consulte o Design Kit do projeto** chamando \`get_design_kit\` (com o \`designKitId\` do projeto, padrão \`"simulacao-2030"\`, ou listando kits disponíveis via \`list_design_kits\`).
- O Design Kit define as regras visuais estritas do projeto:
  - **Paleta de Cores** (\`palette.primary\`, \`palette.accent\`, \`palette.background\`, \`palette.surface\`, \`palette.text\`, \`palette.extraSwatches\`).
  - **Tipografia Permitida** (\`typography.headingFont\`, \`typography.bodyFont\`, \`typography.allowedFonts\`).
  - **Safe Areas 9:16** (\`safeArea.topPx\`, \`safeArea.bottomPx\`, \`safeArea.leftPx\`, \`safeArea.rightPx\`).
  - **Ritmo e Transições** (\`pacing.minSceneDuration\`..\`pacing.maxSceneDuration\`, \`pacing.preferredTransition\`).
  - **Regras Livres da Marca** (\`rules[]\`) e **Tom de Voz** (\`voiceTone\`).
- Para trocar toda a identidade visual de um vídeo sem editar cena por cena, chame \`apply_design_kit\`.

## 1. Escolha do Engine (\`VideoEngine\`)
- **\`scene3d\` (Flagship — Estilo "Simulação 2030")**:
  - Use quando o vídeo conta uma história, simulação política/econômica, explicação com apresentador 3D, debate ou jornada em etapas.
  - Personagem 3D **blocky/chibi** com cabeça grande (\`headScale: 1.38\`), barba/cabelo em blocos geométricos, óculos e acessórios (\`sash\`, \`tie\`, \`suit\`, \`hat\`, \`microphone\`, \`badge\`).
  - Cortes rápidos a cada **3,5 a 5,5 segundos** (ritmo de Reels/Shorts).
  - Alterne cenários 3D a cada cena para manter retenção visual (\`red-carpet-confetti\`, \`pulpit-plenary\`, \`brazil-map-3d\`, \`city-spending-cap\`, \`bar-chart-3d\`, \`timeline-3d\`, \`news-desk\`, \`courtroom\`, \`street-protest\`, \`music-studio\`, \`concert-stage\`).
- **\`kinetic\` (Tipografia Cinética / Listas / Top-N)**:
  - Use para vídeos "Top 5...", "3 Números que...", "Comparativo X vs Y", estatísticas rápidas e citações.
- **\`freeform\` (Composição Livre HyperFrames)**:
  - Use quando quiser controle total sobre o DOM/Canvas/Three.js/Shaders aplicando um prompt da biblioteca (\`awesome-opus5-5-videos\`) ou um dos 99 estilos de filme (\`lemo-opuscar\`).

## 2. Regras de Ouro de Retenção Visual
1. **Gancho nos primeiros 3 segundos**:
   - Na Cena 1, sempre inclua um overlay \`title\` forte (com \`highlightWord\` na cor primária do Design Kit) e um \`badge\` de aviso (\`⚠ NA NOSSA SIMULAÇÃO\`).
2. **Legendas Palavra a Palavra (\`highlight-yellow\` / \`box\`)**:
   - Posicionadas na faixa central-inferior (~77–83% da altura), agrupadas de **2 a 3 palavras** por vez.
   - A palavra ativa recebe fundo na cor primária do Design Kit com texto contrastante; as palavras vizinhas do grupo ficam nítidas com sombra.
3. **Movimento Constante e Overrides 2D/3D**:
   - Nunca deixe a câmera 100% parada em cenas seguidas: alterne \`dolly-in\`, \`pan\`, \`orbit\` e \`close-face\` (ou ajuste com \`cameraOverride\`).
   - Combine a pose do personagem com a ação da cena (\`celebrating\` no tapete vermelho, \`pulling-lever\` no teto de gastos, \`pointing\` no mapa 3D e gráfico de barras).
   - Posições customizadas de overlays (\`x\`, \`y\`, \`width\`, \`height\`, \`rotation\`) e objetos 3D (\`scene.objectOverrides[objectId]\`) são persistidas no \`project.json\` e respeitadas deterministicamente no render.
4. **Contrato Determinístico HyperFrames**:
   - Toda animação é registrada em \`window.__timelines["main"] = gsap.timeline({ paused: true })\` e pode ser inspecionada em qualquer instante \`t\` via \`window.__seek(t)\`.
   - Proibido usar \`Math.random()\` sem seed fixa ou \`requestAnimationFrame\` solto fora do relógio da timeline.
`;
