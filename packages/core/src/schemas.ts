import { z } from 'zod';

// ============================================================================
// 1. PERSONAGENS 3D (Blocky / Chibi Procedural)
// ============================================================================

export const HairStyleSchema = z.enum(['short', 'afro', 'bald', 'long', 'bun']).describe(
  'Estilo de cabelo 3D em blocos: short (curto), afro (volumoso), bald (careca), long (longo), bun (coque)'
);
export type HairStyle = z.infer<typeof HairStyleSchema>;

export const CharacterAccessorySchema = z.enum([
  'sash',
  'tie',
  'suit',
  'hat',
  'microphone',
  'badge',
]).describe(
  'Acessórios 3D do personagem: sash (faixa presidencial), tie (gravata), suit (paletó/terno), hat (chapéu/capacete), microphone (microfone), badge (crachá/estrela)'
);
export type CharacterAccessory = z.infer<typeof CharacterAccessorySchema>;

export const CharacterPoseSchema = z.enum([
  'idle',
  'talking',
  'waving',
  'celebrating',
  'pointing',
  'walking',
  'pulling-lever',
  'typing',
  'thinking',
  'sad',
]).describe(
  'Pose/animação procedural do personagem durante a cena'
);
export type CharacterPose = z.infer<typeof CharacterPoseSchema>;

export const CharacterSchema = z.object({
  id: z.string().min(1).describe('Identificador único do personagem (ex: jones-demo)'),
  name: z.string().min(1).describe('Nome de exibição do personagem'),
  role: z.string().default('Analista · Brasil').describe('Cargo/profissão e cidade para lower-third'),
  skinColor: z.string().default('#7a4b2a').describe('Cor da pele em hexadecimal'),
  hairStyle: HairStyleSchema.default('afro'),
  hairColor: z.string().default('#1a1512').describe('Cor do cabelo em hexadecimal'),
  hasBeard: z.boolean().default(true).describe('Se possui barba volumosa em blocos'),
  beardColor: z.string().default('#1a1512').describe('Cor da barba em hexadecimal'),
  hasGlasses: z.boolean().default(true).describe('Se usa óculos de armação retangular'),
  glassesColor: z.string().default('#111111').describe('Cor da armação dos óculos'),
  shirtColor: z.string().default('#d62828').describe('Cor da camisa/camiseta'),
  shirtAccentColor: z.string().default('#f5c518').describe('Cor de detalhe/estrela na camisa'),
  hasShirtStar: z.boolean().default(true).describe('Se exibe detalhe/estrela no peito'),
  pantsColor: z.string().default('#1d3557').describe('Cor da calça'),
  shoeColor: z.string().default('#f8f9fa').describe('Cor dos tênis/sapatos'),
  accessories: z.array(CharacterAccessorySchema).default([]).describe('Lista de acessórios ativos'),
  headScale: z.number().min(0.8).max(2.0).default(1.38).describe('Escala da cabeça estilo chibi/blocky'),
});
export type Character = z.infer<typeof CharacterSchema>;

// ============================================================================
// 2. TEMPLATES DE CENÁRIO 3D, CÂMERA, GIZMO 3D OVERRIDES E TRANSIÇÕES
// ============================================================================

export const StageTemplateIdSchema = z.enum([
  'red-carpet-confetti',
  'classroom-office',
  'pulpit-plenary',
  'brazil-map-3d',
  'bar-chart-3d',
  'city-spending-cap',
  'news-desk',
  'courtroom',
  'street-protest',
  'spotlight-close',
  'timeline-3d',
]).describe('Identificador do template de cenário 3D procedural');
export type StageTemplateId = z.infer<typeof StageTemplateIdSchema>;

export const CameraPresetSchema = z.enum([
  'static',
  'dolly-in',
  'orbit',
  'pan',
  'shake',
  'close-face',
]).describe('Movimento de câmera GSAP durante a cena');
export type CameraPreset = z.infer<typeof CameraPresetSchema>;

export const TransitionTypeSchema = z.enum([
  'cut',
  'whip',
  'fade',
  'zoom',
]).describe('Transição visual de entrada da cena');
export type TransitionType = z.infer<typeof TransitionTypeSchema>;

export const Vec3TupleSchema = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3Tuple = z.infer<typeof Vec3TupleSchema>;

export const SceneObjectOverrideSchema = z.object({
  position: Vec3TupleSchema.optional().describe('Posição [x, y, z] no espaço 3D da cena'),
  rotation: Vec3TupleSchema.optional().describe('Rotação Euler [rx, ry, rz] em radianos'),
  scale: Vec3TupleSchema.optional().describe('Escala [sx, sy, sz]'),
  hidden: z.boolean().optional().default(false).describe('Se o objeto 3D está oculto na cena'),
  label: z.string().optional().describe('Rótulo amigável do objeto 3D'),
});
export type SceneObjectOverride = z.infer<typeof SceneObjectOverrideSchema>;

export const CameraKeyframeOverrideSchema = z.object({
  position: Vec3TupleSchema.describe('Posição [x, y, z] da câmera salva como keyframe'),
  target: Vec3TupleSchema.describe('Alvo lookAt [x, y, z] da câmera'),
  fov: z.number().min(15).max(90).optional(),
});
export type CameraKeyframeOverride = z.infer<typeof CameraKeyframeOverrideSchema>;

// ============================================================================
// 3. OVERLAYS 2D (COM GEOMETRIA/ESTILO PERSISTIDOS ESTILO FIGMA) E LEGENDAS
// ============================================================================

export const OverlayEnterAnimationSchema = z.enum([
  'none',
  'fade',
  'slide-up',
  'slide-down',
  'pop',
  'whip',
]);
export type OverlayEnterAnimation = z.infer<typeof OverlayEnterAnimationSchema>;

export const OverlayExitAnimationSchema = z.enum([
  'none',
  'fade',
  'slide-down',
  'pop',
]);
export type OverlayExitAnimation = z.infer<typeof OverlayExitAnimationSchema>;

export const OverlayVisualPropsSchema = z.object({
  id: z.string().optional().describe('Identificador estável do elemento overlay'),
  x: z.number().optional().describe('Coordenada X em pixels no canvas 720×1280'),
  y: z.number().optional().describe('Coordenada Y em pixels no canvas 720×1280'),
  width: z.number().optional().describe('Largura em pixels no canvas 720×1280'),
  height: z.number().optional().describe('Altura em pixels no canvas 720×1280'),
  rotation: z.number().optional().describe('Rotação em graus no canvas'),
  scale: z.number().optional().describe('Escala multiplicadora do elemento'),
  opacity: z.number().min(0).max(1).optional().describe('Opacidade de 0 a 1'),
  zIndex: z.number().int().optional().describe('Ordem de camada (z-order)'),
  fontFamily: z.string().optional().describe('Família tipográfica override'),
  fontSize: z.number().optional().describe('Tamanho de fonte em pixels (base 720p)'),
  textColor: z.string().optional().describe('Cor do texto em hexadecimal'),
  backgroundColor: z.string().optional().describe('Cor de fundo override'),
  enterAnimation: OverlayEnterAnimationSchema.optional().describe('Animação de entrada do overlay'),
  exitAnimation: OverlayExitAnimationSchema.optional().describe('Animação de saída do overlay'),
  startOffset: z.number().min(0).optional().describe('Início relativo ao começo da cena em segundos'),
  endOffset: z.number().min(0).optional().describe('Fim relativo ao começo da cena em segundos'),
  hidden: z.boolean().optional().describe('Se a camada está oculta'),
});
export type OverlayVisualProps = z.infer<typeof OverlayVisualPropsSchema>;

export const OverlayTitleSchema = z
  .object({
    type: z.literal('title'),
    text: z.string().describe('Texto principal do título em caixa alta condensada'),
    highlightWord: z.string().optional().describe('Palavra destacada em amarelo (#f5c518)'),
    subtitle: z.string().optional().describe('Subtítulo ou tag de episódio acima do título (ex: SIMULAÇÃO 2030 · EP.1)'),
    position: z.enum(['top', 'center']).default('top'),
    boxed: z.boolean().default(false).describe('Se usa fundo escuro retangular atrás do título'),
  })
  .merge(OverlayVisualPropsSchema);

export const OverlayBadgeSchema = z
  .object({
    type: z.literal('badge'),
    text: z.string().describe('Texto do badge amarelo de aviso (ex: NA NOSSA SIMULAÇÃO)'),
    icon: z.string().default('⚠').describe('Ícone à esquerda do badge'),
    color: z.string().default('#f5c518'),
  })
  .merge(OverlayVisualPropsSchema);

export const OverlayLowerThirdSchema = z
  .object({
    type: z.literal('lower-third'),
    name: z.string().describe('Nome em destaque branco (ex: CARLOS SILVA)'),
    subtitle: z.string().describe('Subtítulo amarelo (ex: ECONOMISTA · RECIFE)'),
  })
  .merge(OverlayVisualPropsSchema);

export const OverlayRoleBannerSchema = z
  .object({
    type: z.literal('role-banner'),
    title: z.string().describe('Texto principal da tarja superior (ex: MÃES DE VÍTIMAS)'),
    subtitle: z.string().optional().describe('Segunda tarja/cargo abaixo (ex: CONSELHO POPULAR DE SEGURANÇA)'),
    variant: z.enum(['yellow', 'blue', 'dark']).default('yellow'),
  })
  .merge(OverlayVisualPropsSchema);

export const OverlayCounterSchema = z
  .object({
    type: z.literal('counter'),
    label: z.string().describe('Rótulo acima do contador (ex: MUDAR A CONSTITUIÇÃO)'),
    from: z.number().default(0),
    to: z.number().describe('Valor final animado pela timeline GSAP'),
    prefix: z.string().default(''),
    suffix: z.string().default(''),
    sublabel: z.string().optional().describe('Subtexto abaixo do número (ex: VOTOS NECESSÁRIOS DE 513)'),
  })
  .merge(OverlayVisualPropsSchema);

export const OverlayWatermarkSchema = z
  .object({
    type: z.literal('watermark'),
    handle: z.string().describe('Arroba ou marca d’água (ex: @simulacao2030)'),
    position: z.enum(['top-right', 'top-left', 'bottom-right']).default('top-right'),
  })
  .merge(OverlayVisualPropsSchema);

export const OverlayProgressBarSchema = z
  .object({
    type: z.literal('progress-bar'),
    color: z.string().default('#f5c518'),
  })
  .merge(OverlayVisualPropsSchema);

export const OverlayEffectSchema = z
  .object({
    type: z.literal('effect'),
    effectId: z.string().describe('ID do efeito visual / PixelFX (ex: scanlines, crt, sparkles, confetti, vignette, glitch)'),
    intensity: z.number().min(0).max(1).default(0.5),
  })
  .merge(OverlayVisualPropsSchema);

export const OverlayItemSchema = z.discriminatedUnion('type', [
  OverlayTitleSchema,
  OverlayBadgeSchema,
  OverlayLowerThirdSchema,
  OverlayRoleBannerSchema,
  OverlayCounterSchema,
  OverlayWatermarkSchema,
  OverlayProgressBarSchema,
  OverlayEffectSchema,
]);
export type OverlayItem = z.infer<typeof OverlayItemSchema>;

export const CaptionStyleTypeSchema = z.enum([
  'highlight-yellow',
  'karaoke',
  'pop',
  'box',
]).describe('Estilo visual das legendas palavra a palavra');
export type CaptionStyleType = z.infer<typeof CaptionStyleTypeSchema>;

export const CaptionStyleSchema = z.object({
  enabled: z.boolean().default(true),
  style: CaptionStyleTypeSchema.default('highlight-yellow'),
  wordsPerGroup: z.number().int().min(1).max(6).default(3).describe('Quantidade de palavras exibidas por grupo (2–3 na referência)'),
  positionY: z.number().min(10).max(92).default(77).describe('Posição vertical em % a partir do topo'),
  fontSize: z.number().min(18).max(72).default(32),
  highlightColor: z.string().default('#f5c518'),
  textColor: z.string().default('#ffffff'),
  burnIn: z.boolean().default(true).describe('Se renderiza as legendas direto no vídeo além de gerar .srt/.ass'),
});
export type CaptionStyle = z.infer<typeof CaptionStyleSchema>;

export const WordTimestampSchema = z.object({
  word: z.string(),
  start: z.number().min(0).describe('Início da palavra em segundos'),
  end: z.number().min(0).describe('Fim da palavra em segundos'),
  highlighted: z.boolean().optional(),
});
export type WordTimestamp = z.infer<typeof WordTimestampSchema>;

// ============================================================================
// 4. CENAS E ENGINES (scene3d, kinetic, freeform)
// ============================================================================

export const VideoEngineIdSchema = z.enum(['scene3d', 'kinetic', 'freeform']).describe(
  'Engine de geração do vídeo: scene3d (Simulação 3D blocky), kinetic (tipografia cinética/listas/top-N), freeform (composição HTML/CSS/JS livre no contrato HyperFrames)'
);
export type VideoEngineId = z.infer<typeof VideoEngineIdSchema>;

export const SceneSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().min(0).default(0),
  narration: z.string().describe('Texto falado pelo TTS nesta cena'),
  duration: z.number().min(1).max(60).default(4.2).describe('Duração da cena em segundos (ajustada automaticamente ao áudio TTS)'),
  template: StageTemplateIdSchema.default('red-carpet-confetti'),
  templateProps: z.record(z.string(), z.any()).default({}).describe('Propriedades específicas do cenário 3D (rótulos, barras, placas, cores)'),
  characterId: z.string().default('default-hero').describe('ID do personagem principal em cena'),
  secondaryCharacterIds: z.array(z.string()).default([]).describe('IDs de personagens secundários na cena'),
  pose: CharacterPoseSchema.default('talking'),
  camera: CameraPresetSchema.default('dolly-in'),
  transition: TransitionTypeSchema.default('cut'),
  overlays: z.array(OverlayItemSchema).default([]),
  objectOverrides: z
    .record(z.string(), SceneObjectOverrideSchema)
    .default({})
    .describe('Overrides de posição, rotação, escala e visibilidade por objectId 3D na cena'),
  cameraOverride: CameraKeyframeOverrideSchema.optional().describe(
    'Keyframe de enquadramento customizado da câmera 3D salvo no editor visual'
  ),
  highlightWords: z.array(z.string()).default([]).describe('Palavras da narração que recebem ênfase extra'),
  sfx: z.enum(['none', 'whoosh', 'ding', 'alarm', 'lever', 'cheer', 'coin', 'pop']).default('whoosh'),
  backgroundTexture: z.string().optional().describe('Caminho opcional de textura/imagem gerada (ex: ComfyUI)'),
  audioPath: z.string().optional().describe('Caminho do arquivo de áudio TTS gerado para a cena'),
  audioTrimStart: z.number().min(0).optional(),
  audioTrimEnd: z.number().min(0).optional(),
  wordTimestamps: z.array(WordTimestampSchema).optional().describe('Timestamps palavra a palavra relativos ao início da cena'),
});
export type Scene = z.infer<typeof SceneSchema>;

export const KineticLayoutSchema = z.enum([
  'hero-stat',
  'top-list-item',
  'quote-card',
  'split-comparison',
  'counter-explosion',
  'callout-badge',
]);
export type KineticLayout = z.infer<typeof KineticLayoutSchema>;

export const ElementDomOverrideSchema = OverlayVisualPropsSchema.extend({
  text: z.string().optional(),
});
export type ElementDomOverride = z.infer<typeof ElementDomOverrideSchema>;

export const KineticBlockSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().min(0).default(0),
  narration: z.string().describe('Narração TTS deste bloco cinético'),
  duration: z.number().min(1).max(30).default(3.8),
  layout: KineticLayoutSchema.default('top-list-item'),
  headline: z.string().describe('Título de impacto animado'),
  subheadline: z.string().optional(),
  highlightWord: z.string().optional(),
  badge: z.string().optional(),
  rankNumber: z.number().int().optional().describe('Número no ranking para vídeos Top-N'),
  items: z.array(z.string()).default([]),
  statValue: z.number().optional(),
  statPrefix: z.string().optional(),
  statSuffix: z.string().optional(),
  accentColor: z.string().default('#f5c518'),
  bgStyle: z.enum(['dark-grid', 'radial-glow', 'editorial-cream', 'neon-cyber', 'crimson-burst']).default('dark-grid'),
  transition: TransitionTypeSchema.default('whip'),
  sfx: z.enum(['none', 'whoosh', 'ding', 'alarm', 'lever', 'cheer', 'coin', 'pop']).default('pop'),
  elementOverrides: z.record(z.string(), ElementDomOverrideSchema).default({}),
  backgroundImage: z.string().optional(),
  audioPath: z.string().optional(),
  wordTimestamps: z.array(WordTimestampSchema).optional(),
});
export type KineticBlock = z.infer<typeof KineticBlockSchema>;

export const FreeformVariableSchema = z.object({
  id: z.string(),
  type: z.enum(['string', 'number', 'color']),
  label: z.string(),
  default: z.any(),
});

export const FreeformCompositionSchema = z.object({
  html: z.string().describe('HTML completo da composição raiz no contrato HyperFrames (com window.__timelines)'),
  subCompositions: z.record(z.string(), z.string()).default({}).describe('Mapa opcional de sub-composições (ex: {"compositions/s1.html": "<template>..."})'),
  assets: z.record(z.string(), z.string()).default({}).describe('Arquivos extras em texto/SVG relativos à pasta da composição'),
  narration: z.string().default('').describe('Narração completa opcional para síntese TTS e legendas automáticas'),
  duration: z.number().min(1).max(300).default(15),
  prompt: z.string().optional(),
  styleId: z.string().optional(),
  effectIds: z.array(z.string()).default([]),
  variables: z.array(FreeformVariableSchema).default([]),
  elementOverrides: z.record(z.string(), ElementDomOverrideSchema).default({}),
  audioPath: z.string().optional(),
  wordTimestamps: z.array(WordTimestampSchema).optional(),
});
export type FreeformComposition = z.infer<typeof FreeformCompositionSchema>;

// ============================================================================
// 5. DESIGN KIT (Identidade Visual, Regras, Moodboard, Tokens Multi-Engine)
// ============================================================================

export const DesignKitReferenceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['image', 'video', 'link']),
  title: z.string(),
  urlOrPath: z.string(),
  notes: z.string().default(''),
  dominantColors: z.array(z.string()).default([]),
  breakdownId: z.string().optional().describe('ID do ReferenceBreakdown anexado se kind=video'),
  breakdownSummary: z.string().optional(),
  createdAt: z.string(),
});
export type DesignKitReference = z.infer<typeof DesignKitReferenceSchema>;

export const DesignKitPaletteSchema = z.object({
  primary: z.string().default('#f5c518').describe('Cor primária de destaque'),
  accent: z.string().default('#c1121f').describe('Cor secundária / ação'),
  background: z.string().default('#0f172a').describe('Cor de fundo principal'),
  surface: z.string().default('#111827').describe('Cor de superfície de cards, tarjas e placas'),
  text: z.string().default('#ffffff').describe('Cor principal do texto'),
  textOnPrimary: z.string().default('#111827').describe('Cor do texto sobre a cor primária'),
  muted: z.string().default('#94a3b8').describe('Cor de subtextos e rótulos secundários'),
  danger: z.string().default('#ef4444').describe('Cor de perigo / alerta'),
  success: z.string().default('#22c55e').describe('Cor de sucesso / crescimento'),
  extraSwatches: z.array(z.string()).default([]).describe('Cores complementares permitidas na paleta'),
});
export type DesignKitPalette = z.infer<typeof DesignKitPaletteSchema>;

export const DesignKitTypographySchema = z.object({
  headingFont: z.string().default('Anton').describe('Família de fonte para títulos e contadores'),
  bodyFont: z.string().default('Inter').describe('Família de fonte para subtítulos, corpo e legendas'),
  monoFont: z.string().default('IBM Plex Mono').describe('Família monoespaçada'),
  allowedFonts: z.array(z.string()).default(['Anton', 'Bebas Neue', 'Inter', 'IBM Plex Mono']),
  headingWeight: z.number().default(900),
  bodyWeight: z.number().default(800),
  uppercaseHeadings: z.boolean().default(true),
  titleFontSize: z.number().default(58),
  subtitleFontSize: z.number().default(15),
  captionFontSize: z.number().default(32),
  letterSpacing: z.string().default('0.02em'),
});
export type DesignKitTypography = z.infer<typeof DesignKitTypographySchema>;

export const DesignKitSafeAreaSchema = z.object({
  topPx: z.number().default(64).describe('Margem segura superior em px (base 720x1280)'),
  bottomPx: z.number().default(130).describe('Margem segura inferior em px (base 720x1280)'),
  leftPx: z.number().default(32).describe('Margem segura esquerda em px (base 720x1280)'),
  rightPx: z.number().default(32).describe('Margem segura direita em px (base 720x1280)'),
});
export type DesignKitSafeArea = z.infer<typeof DesignKitSafeAreaSchema>;

export const DesignKitSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  category: z.string().default('Jornalístico / Simulação'),
  isOfficial: z.boolean().default(false),
  palette: DesignKitPaletteSchema.default({}),
  typography: DesignKitTypographySchema.default({}),
  spacingScale: z.array(z.number()).default([4, 8, 12, 16, 24, 32, 48]),
  borderRadius: z.string().default('8px'),
  shadowStyle: z.string().default('0 10px 28px rgba(0, 0, 0, 0.55)'),
  safeArea: DesignKitSafeAreaSchema.default({}),
  captionPreset: CaptionStyleSchema.default({}),
  overlayPreset: z
    .object({
      titleBoxed: z.boolean().default(false),
      lowerThirdBorderWidth: z.number().default(6),
      badgeBorderWidth: z.number().default(2),
      watermarkHandle: z.string().default('@simulacao2030'),
      logoUrl: z.string().optional(),
    })
    .default({}),
  scene3dPreset: z
    .object({
      wallColor: z.string().default('#5d5753'),
      floorColor: z.string().default('#c9c2b8'),
      ambientLightColor: z.string().default('#fff5eb'),
      keyLightColor: z.string().default('#fffbeb'),
      fillLightColor: z.string().default('#fdba74'),
      materialRoughness: z.number().min(0).max(1).default(0.76),
    })
    .default({}),
  pacing: z
    .object({
      targetSceneDuration: z.number().min(1.5).max(15).default(4.0),
      minSceneDuration: z.number().min(1).max(10).default(2.5),
      maxSceneDuration: z.number().min(2).max(20).default(6.0),
      preferredTransition: TransitionTypeSchema.default('whip'),
    })
    .default({}),
  voiceTone: z.string().default('Jornalístico, didático, ritmo dinâmico e direto'),
  rules: z.array(z.string()).default([]).describe('Regras livres de marca em texto'),
  references: z.array(DesignKitReferenceSchema).default([]).describe('Moodboard de imagens, vídeos e links com notas'),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DesignKit = z.infer<typeof DesignKitSchema>;

// ============================================================================
// 6. VOZ, RENDER, SÉRIES E PROJETOS
// ============================================================================

export const TTSProviderIdSchema = z.enum(['edge', 'espeak', 'piper', 'elevenlabs', 'openai']);
export type TTSProviderId = z.infer<typeof TTSProviderIdSchema>;

export const VoiceConfigSchema = z.object({
  provider: TTSProviderIdSchema.default('edge'),
  voiceId: z.string().default('pt-BR-AntonioNeural'),
  rate: z.number().min(0.5).max(2.0).default(1.08).describe('Velocidade da fala (1.0 = normal)'),
  pitch: z.string().default('+0Hz'),
});
export type VoiceConfig = z.infer<typeof VoiceConfigSchema>;

export const VoiceInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: TTSProviderIdSchema,
  language: z.string(),
  gender: z.enum(['male', 'female', 'neutral']),
  available: z.boolean(),
  description: z.string().optional(),
});
export type VoiceInfo = z.infer<typeof VoiceInfoSchema>;

export const RendererIdSchema = z.enum(['hyperframes', 'playwright', 'remotion']);
export type RendererId = z.infer<typeof RendererIdSchema>;

export const RenderSettingsSchema = z.object({
  width: z.number().int().default(720).describe('Largura em pixels (720 ou 1080)'),
  height: z.number().int().default(1280).describe('Altura em pixels (1280 ou 1920)'),
  fps: z.number().int().min(15).max(60).default(30),
  crf: z.number().int().min(12).max(35).default(21).describe('Qualidade H.264 CRF (menor = maior qualidade)'),
  workers: z.number().int().min(1).max(8).default(2),
  renderer: RendererIdSchema.default('hyperframes'),
  embedCaptions: z.boolean().default(true),
  musicTrack: z.string().default('upbeat-simulation').describe('Nome do preset sintético ou arquivo em assets/music'),
  musicVolume: z.number().min(0).max(1).default(0.16),
  duckingThreshold: z.number().min(0.005).max(0.5).default(0.03),
  sfxVolume: z.number().min(0).max(1).default(0.32),
});
export type RenderSettings = z.infer<typeof RenderSettingsSchema>;

export const SeriesSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).describe('Título da série (ex: SIMULAÇÃO 2030)'),
  description: z.string().default(''),
  defaultEngine: VideoEngineIdSchema.default('scene3d'),
  defaultCharacterId: z.string().optional(),
  defaultVoice: VoiceConfigSchema.default({}),
  defaultCaptionStyle: CaptionStyleSchema.default({}),
  defaultStyleId: z.string().optional(),
  defaultDesignKitId: z.string().optional().default('simulacao-2030'),
  watermarkHandle: z.string().default('@simulacao2030'),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Series = z.infer<typeof SeriesSchema>;

export const ProjectStatusSchema = z.enum([
  'draft',
  'scripted',
  'synthesized',
  'composed',
  'rendering',
  'completed',
  'failed',
]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const ProjectSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  topic: z.string().default(''),
  tone: z.string().default('jornalístico-didático'),
  targetDuration: z.number().default(30),
  seriesId: z.string().optional(),
  episodeNumber: z.number().int().optional(),
  engine: VideoEngineIdSchema.default('scene3d'),
  designKitId: z.string().optional().default('simulacao-2030').describe('ID do Design Kit aplicado ao projeto'),
  styleId: z.string().optional().describe('ID de estilo aplicado da biblioteca (ex: lemo-opuscar)'),
  stylePrompt: z.string().optional().describe('Diretrizes visuais do estilo selecionado'),
  promptId: z.string().optional().describe('ID de prompt base da biblioteca'),
  effectIds: z.array(z.string()).default([]).describe('Efeitos visuais aplicados (ex: PixelFX)'),
  status: ProjectStatusSchema.default('draft'),
  voice: VoiceConfigSchema.default({}),
  captionStyle: CaptionStyleSchema.default({}),
  renderSettings: RenderSettingsSchema.default({}),
  // Dados do engine scene3d:
  scenes: z.array(SceneSchema).default([]),
  // Dados do engine kinetic:
  kineticBlocks: z.array(KineticBlockSchema).default([]),
  // Dados do engine freeform:
  freeform: FreeformCompositionSchema.optional(),
  // Artefatos gerados:
  outputMp4Path: z.string().optional(),
  outputSrtPath: z.string().optional(),
  outputAssPath: z.string().optional(),
  thumbnailPath: z.string().optional(),
  compositionDir: z.string().optional(),
  totalDuration: z.number().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

// ============================================================================
// 7. FILA DE JOBS, BIBLIOTECA, BREAKDOWN E INTEGRAÇÕES
// ============================================================================

export const PipelineStageSchema = z.enum([
  'queued',
  'script',
  'tts',
  'audio-mix',
  'compose',
  'render',
  'encode',
  'completed',
  'failed',
]);
export type PipelineStage = z.infer<typeof PipelineStageSchema>;

export const JobSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  status: z.enum(['queued', 'running', 'completed', 'failed']),
  stage: PipelineStageSchema.default('queued'),
  progress: z.number().min(0).max(100).default(0),
  message: z.string().default('Aguardando na fila...'),
  logs: z.array(z.string()).default([]),
  outputMp4Path: z.string().optional(),
  outputSrtPath: z.string().optional(),
  outputAssPath: z.string().optional(),
  thumbnailPath: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Job = z.infer<typeof JobSchema>;

export const LibraryItemTypeSchema = z.enum([
  'prompt',
  'style',
  'effect',
  'block',
  'technique',
]);
export type LibraryItemType = z.infer<typeof LibraryItemTypeSchema>;

export const LibraryItemSchema = z.object({
  id: z.string().min(1),
  type: LibraryItemTypeSchema,
  title: z.string(),
  description: z.string().default(''),
  tags: z.array(z.string()).default([]),
  sourceRepo: z.string(),
  sourcePath: z.string(),
  license: z.string().default('MIT'),
  previewUrl: z.string().optional(),
  contentPreview: z.string().optional(),
  engineHint: VideoEngineIdSchema.optional(),
  metadata: z.record(z.string(), z.any()).default({}),
});
export type LibraryItem = z.infer<typeof LibraryItemSchema>;

export const ReferenceShotBreakdownSchema = z.object({
  index: z.number().int(),
  startTime: z.number(),
  endTime: z.number(),
  duration: z.number(),
  framePath: z.string(),
  dominantColors: z.array(z.string()).default([]),
  suggestedTemplate: StageTemplateIdSchema.optional(),
  suggestedCamera: CameraPresetSchema.default('dolly-in'),
  transcriptSegment: z.string().default(''),
  visualDescription: z.string().default(''),
});

export const ReferenceBreakdownSchema = z.object({
  id: z.string(),
  videoPath: z.string(),
  width: z.number(),
  height: z.number(),
  fps: z.number(),
  duration: z.number(),
  hasAudio: z.boolean(),
  shots: z.array(ReferenceShotBreakdownSchema),
  fullTranscript: z.string().default(''),
  reaVideoGuide: z.string().describe('Instruções e prompt estruturado baseado no Rea-Video para reconstrução'),
  suggestedEngine: VideoEngineIdSchema.default('scene3d'),
  createdAt: z.string(),
});
export type ReferenceBreakdown = z.infer<typeof ReferenceBreakdownSchema>;

export const IntegrationStatusSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['core', 'library', 'optional-provider', 'extension']),
  repoUrl: z.string(),
  license: z.string(),
  detected: z.boolean(),
  enabled: z.boolean(),
  statusText: z.string(),
  installInstructions: z.string(),
  description: z.string(),
});
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

export const ValidationIssueSchema = z.object({
  severity: z.enum(['error', 'warning']),
  path: z.string(),
  message: z.string(),
  suggestion: z.string(),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  engine: VideoEngineIdSchema,
  estimatedDuration: z.number(),
  designKitId: z.string().optional(),
  issues: z.array(ValidationIssueSchema),
});
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export const AppSettingsSchema = z.object({
  ttsProvider: TTSProviderIdSchema.default('edge'),
  ttsDefaultVoice: z.string().default('pt-BR-AntonioNeural'),
  llmProvider: z.enum(['manual', 'gemini', 'openai-compatible']).default('manual'),
  geminiApiKey: z.string().default(''),
  geminiModel: z.string().default('gemini-2.5-flash'),
  openaiApiKey: z.string().default(''),
  openaiBaseUrl: z.string().default('https://api.openai.com/v1'),
  openaiModel: z.string().default('gpt-4o-mini'),
  elevenlabsApiKey: z.string().default(''),
  elevenlabsVoiceId: z.string().default(''),
  piperBin: z.string().default('piper'),
  piperModelPath: z.string().default(''),
  imageProvider: z.enum(['none', 'comfyui']).default('none'),
  comfyuiUrl: z.string().default('http://127.0.0.1:8188'),
  renderer: RendererIdSchema.default('hyperframes'),
  chromePath: z.string().default('/usr/bin/google-chrome'),
  hyperframesRoot: z.string().default('/home/higorlino/openmotion'),
  musicDir: z.string().default('./assets/music'),
  sfxDir: z.string().default('./assets/sfx'),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;
