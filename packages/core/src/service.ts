import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AppSettingsSchema,
  CharacterSchema,
  DesignKitPaletteSchema,
  DesignKitSchema,
  FreeformCompositionSchema,
  JobSchema,
  KineticBlockSchema,
  ProjectSchema,
  SceneSchema,
  SeriesSchema,
  StageTemplateIdSchema,
  type AppSettings,
  type Character,
  type DesignKit,
  type DesignKitPalette,
  type FreeformComposition,
  type IntegrationStatus,
  type Job,
  type KineticBlock,
  type LibraryItem,
  type LibraryItemType,
  type Project,
  type ReferenceBreakdown,
  type Scene,
  type Series,
  type ValidationIssue,
  type ValidationResult,
  type VideoEngineId,
  type VoiceInfo,
} from './schemas.ts';
import {
  DEFAULT_CHARACTERS,
  DEFAULT_DESIGN_KITS,
  DEFAULT_VOICES,
  STAGE_TEMPLATES,
  STYLE_GUIDE_MARKDOWN,
  VIDEO_ENGINES,
  type EngineDescriptor,
  type StageTemplateMetadata,
} from './catalog.ts';
import {
  createFreeformDemoProject,
  createKineticTop5Project,
  createSimulacaoDemoProject,
} from './examples.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const WORKSPACE_ROOT = path.resolve(__dirname, '../../..');

export interface PipelineHandlers {
  synthesizeAudio?: (projectId: string) => Promise<Project>;
  renderPreviewFrames?: (
    projectId: string,
    timestamps?: number[]
  ) => Promise<Array<{ timestamp: number; pngPath: string; base64: string; sceneId?: string }>>;
  renderVideo?: (projectId: string, jobId: string) => Promise<Job>;
  breakdownReferenceVideo?: (videoPath: string, transcribe?: boolean) => Promise<ReferenceBreakdown>;
  generateImage?: (prompt: string, options?: { width?: number; height?: number; projectId?: string }) => Promise<{ imagePath: string; provider: string }>;
  generateScriptWithLLM?: (params: {
    topic: string;
    duration: number;
    tone: string;
    sceneCount: number;
    engine: VideoEngineId;
    characterId?: string;
    styleId?: string;
  }) => Promise<{ title: string; scenes?: Scene[]; kineticBlocks?: KineticBlock[]; freeform?: FreeformComposition }>;
  syncLibrary?: () => Promise<{ count: number; items: LibraryItem[] }>;
}

export interface ServiceChangeEvent {
  type:
    | 'project:created'
    | 'project:updated'
    | 'project:deleted'
    | 'character:updated'
    | 'series:updated'
    | 'designkit:updated'
    | 'job:updated'
    | 'settings:updated'
    | 'library:updated';
  id?: string;
  data?: unknown;
  timestamp: string;
}

const BUILTIN_LIBRARY_SEEDS: LibraryItem[] = [
  {
    id: 'prompt-simulacao-2030',
    type: 'prompt',
    title: 'Simulação Política/Econômica 2030 (Low-Poly 3D)',
    description:
      'Estrutura narrativa viral em 7 atos curtos: posse no tapete vermelho → articulação no plenário → diagnóstico no mapa 3D → ação na alavanca do teto de gastos → recursos estratégicos → gráfico de resultados → pergunta final na multidão.',
    tags: ['simulacao', 'politica', 'economia', '3d', 'reels', 'brasil'],
    sourceRepo: 'builtin/simulacao-2030',
    sourcePath: 'packages/core/src/examples.ts',
    license: 'MIT',
    engineHint: 'scene3d',
    contentPreview:
      'Cena 1: Gancho com badge amarelo "NA NOSSA SIMULAÇÃO" + tapete vermelho. Cena 2: Plenário com contador 257 votos. Cena 3: Mapa do Brasil 3D com marcadores...',
    metadata: { targetDuration: 28, sceneCount: 7 },
  },
  {
    id: 'prompt-top5-tech-explainer',
    type: 'prompt',
    title: 'Top 5 Tecnologias / Ranking Explosivo',
    description:
      'Prompt para vídeos de lista e ranking com tipografia cinética, contadores gigantes e transições whip.',
    tags: ['kinetic', 'top5', 'tech', 'ranking', 'shorts'],
    sourceRepo: 'yihui-dev/awesome-opus5-5-videos',
    sourcePath: 'builtin/prompts/top5-tech',
    license: 'MIT',
    engineHint: 'kinetic',
    contentPreview:
      'Bloco 1: Gancho com estatística gigante. Bloco 2: Itens #3 e #2 em cartões neon. Bloco 3: #1 com explosão numérica e CTA.',
    metadata: { targetDuration: 18, sceneCount: 3 },
  },
  {
    id: 'style-simulacao-lowpoly-3d',
    type: 'style',
    title: 'Simulação Low-Poly Editorial (Amarelo & Vermelho)',
    description:
      'Luz direcional suave com sombras de contato, personagens blocky de cabeça grande, títulos condensados em caixa alta branca com palavra-chave em amarelo #f5c518 e legendas centrais.',
    tags: ['3d', 'low-poly', 'jornalistico', 'amarelo', 'chibi'],
    sourceRepo: 'builtin/styles',
    sourcePath: 'packages/core/src/catalog.ts',
    license: 'MIT',
    engineHint: 'scene3d',
    contentPreview:
      'Paleta: Amarelo destaque #f5c518, Vermelho #c1121f, Azul marinho #1d3557, Tipografia Anton/Bebas Neue para títulos e Inter ExtraBold para legendas.',
    metadata: { primaryColor: '#f5c518', accentColor: '#c1121f', bgColor: '#1d3557' },
  },
  {
    id: 'style-cyber-editorial-grid',
    type: 'style',
    title: 'Cyber Editorial Grid (Neo-Brutalista Escuro)',
    description:
      'Fundo azul-noturno #0b0f19 com grade ciano translúcida, cartões com borda amarela #f5c518 e barras de dados animadas.',
    tags: ['cyber', 'grid', 'editorial', 'dark', 'data'],
    sourceRepo: 'lemomo-ai/lemo-opuscar',
    sourcePath: 'builtin/styles/cyber-editorial',
    license: 'Local Only',
    engineHint: 'freeform',
    contentPreview:
      'Background #0b0f19, Grid rgba(56,189,248,0.12) 48px, Border 2px solid #f5c518, Typography uppercase heavy.',
    metadata: { primaryColor: '#f5c518', accentColor: '#38bdf8', bgColor: '#0b0f19' },
  },
  {
    id: 'style-wes-anderson-symmetry',
    type: 'style',
    title: 'Simetria Pastel Editorial (Cinema Style)',
    description:
      'Composição rigorosamente centralizada, paleta creme/mostarda/terracota e movimentos de câmera ortogonais.',
    tags: ['cinema', 'pastel', 'simetria', 'editorial'],
    sourceRepo: 'lemomo-ai/lemo-opuscar',
    sourcePath: 'builtin/styles/pastel-symmetry',
    license: 'Local Only',
    contentPreview:
      'Enquadramento central simétrico, cores #f4a261, #e9c46a, #264653, cortes secos ou whip pans horizontais.',
    metadata: { primaryColor: '#e9c46a', accentColor: '#e76f51', bgColor: '#264653' },
  },
  {
    id: 'effect-scanlines',
    type: 'effect',
    title: 'CRT Scanlines & Vignette',
    description: 'Linhas horizontais sutis de monitor CRT com vinheta cinematográfica nas bordas.',
    tags: ['crt', 'retro', 'scanlines', 'overlay'],
    sourceRepo: 'patch-gg/pixelfx',
    sourcePath: 'builtin/effects/scanlines',
    license: 'MIT',
    contentPreview: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 2px, transparent 2px, transparent 4px)',
    metadata: { cssClass: 'fx-scanlines' },
  },
  {
    id: 'effect-sparkles',
    type: 'effect',
    title: 'Pixel Sparkles / Partículas Douradas',
    description: 'Partículas luminosas pixel art flutuando deterministicamente na timeline GSAP.',
    tags: ['pixel', 'particles', 'sparkles', 'gold'],
    sourceRepo: 'patch-gg/pixelfx',
    sourcePath: 'builtin/effects/sparkles',
    license: 'MIT',
    contentPreview: 'Partículas determinísticas sincronizadas com o tempo t da cena.',
    metadata: { cssClass: 'fx-sparkles' },
  },
  {
    id: 'effect-glitch',
    type: 'effect',
    title: 'Chromatic RGB Glitch Burst',
    description: 'Deslocamento cromático RGB nos cortes de cena para transições de alto impacto.',
    tags: ['glitch', 'rgb', 'transition', 'cyber'],
    sourceRepo: 'patch-gg/pixelfx',
    sourcePath: 'builtin/effects/glitch',
    license: 'MIT',
    contentPreview: 'text-shadow: -3px 0 #ff0055, 3px 0 #00e5ff; clip-path slices.',
    metadata: { cssClass: 'fx-glitch' },
  },
  {
    id: 'block-bar-chart-race',
    type: 'block',
    title: 'HyperFrames Block: Bar Chart Race',
    description: 'Barras ranqueadas que crescem e ultrapassam umas às outras ao longo de uma série temporal.',
    tags: ['chart', 'data', 'ranking', 'hyperframes'],
    sourceRepo: 'heygen-com/hyperframes',
    sourcePath: 'registry/blocks/bar-chart-race.html',
    license: 'Apache-2.0',
    engineHint: 'freeform',
    contentPreview: 'Bloco nativo do registry HyperFrames para corridas de gráficos de barras.',
    metadata: { collection: 'block' },
  },
  {
    id: 'technique-deterministic-gsap',
    type: 'technique',
    title: 'Técnica: Sincronia Determinística GSAP + Three.js + Legendas',
    description:
      'Como amarrar animações Three.js e legendas word-by-word a uma única timeline GSAP pausada para captura frame a frame sem jitter.',
    tags: ['gsap', 'threejs', 'hyperframes', 'captions', 'deterministic'],
    sourceRepo: 'remotion-dev/skills',
    sourcePath: 'builtin/techniques/deterministic-gsap',
    license: 'MIT',
    contentPreview:
      'Use gsap.timeline({ paused: true }) registrada em window.__timelines["main"] e atualize a cena Three.js dentro de onUpdate / proxy de tempo.',
    metadata: {},
  },
];

export class VideoService {
  public readonly rootDir: string;
  public readonly dataDir: string;
  public readonly projectsDir: string;
  public readonly libraryDir: string;
  public readonly events = new EventEmitter();
  private handlers: PipelineHandlers = {};

  constructor(rootDir = WORKSPACE_ROOT) {
    this.rootDir = rootDir;
    this.dataDir = process.env.VIDEOS_DATA_DIR
      ? path.resolve(process.env.VIDEOS_DATA_DIR)
      : path.join(rootDir, 'data');
    this.projectsDir = path.join(this.dataDir, 'projects');
    this.libraryDir = path.join(rootDir, 'library');
    this.ensureStorage();
  }

  public registerPipelineHandlers(handlers: PipelineHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  public emitChange(event: Omit<ServiceChangeEvent, 'timestamp'>): void {
    const fullEvent: ServiceChangeEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };
    this.events.emit('change', fullEvent);
  }

  private ensureStorage(): void {
    mkdirSync(this.dataDir, { recursive: true });
    mkdirSync(this.projectsDir, { recursive: true });
    mkdirSync(this.libraryDir, { recursive: true });
    mkdirSync(path.join(this.rootDir, 'assets', 'music'), { recursive: true });
    mkdirSync(path.join(this.rootDir, 'assets', 'sfx'), { recursive: true });

    const charsPath = path.join(this.dataDir, 'characters.json');
    if (!existsSync(charsPath)) {
      writeFileSync(charsPath, JSON.stringify(DEFAULT_CHARACTERS, null, 2), 'utf8');
    }

    const seriesPath = path.join(this.dataDir, 'series.json');
    if (!existsSync(seriesPath)) {
      const now = new Date().toISOString();
      const defaultSeries: Series[] = [
        {
          id: 'simulacao-2030',
          title: 'SIMULAÇÃO 2030',
          description: 'Série de simulações políticas e econômicas em 3D low-poly.',
          defaultEngine: 'scene3d',
          defaultCharacterId: 'marco-silva',
          defaultVoice: {
            provider: 'edge',
            voiceId: 'pt-BR-AntonioNeural',
            rate: 1.12,
            pitch: '+0Hz',
          },
          defaultCaptionStyle: {
            enabled: true,
            style: 'highlight-yellow',
            wordsPerGroup: 3,
            positionY: 78,
            fontSize: 32,
            highlightColor: '#f5c518',
            textColor: '#ffffff',
            burnIn: true,
          },
          defaultStyleId: 'style-simulacao-lowpoly-3d',
          defaultDesignKitId: 'simulacao-2030',
          watermarkHandle: '@simulacao2030',
          createdAt: now,
          updatedAt: now,
        },
      ];
      writeFileSync(seriesPath, JSON.stringify(defaultSeries, null, 2), 'utf8');
    }

    const jobsPath = path.join(this.dataDir, 'jobs.json');
    if (!existsSync(jobsPath)) {
      writeFileSync(jobsPath, JSON.stringify([], null, 2), 'utf8');
    }

    const designKitsPath = path.join(this.dataDir, 'design-kits.json');
    if (!existsSync(designKitsPath)) {
      writeFileSync(designKitsPath, JSON.stringify(DEFAULT_DESIGN_KITS, null, 2), 'utf8');
    } else {
      try {
        const existingKits = zArrayParse(DesignKitSchema, JSON.parse(readFileSync(designKitsPath, 'utf8')));
        const existingIds = new Set(existingKits.map((k) => k.id));
        let changed = false;
        for (const seed of DEFAULT_DESIGN_KITS) {
          if (!existingIds.has(seed.id)) {
            existingKits.push(seed);
            changed = true;
          }
        }
        if (changed) {
          writeFileSync(designKitsPath, JSON.stringify(existingKits, null, 2), 'utf8');
        }
      } catch {
        writeFileSync(designKitsPath, JSON.stringify(DEFAULT_DESIGN_KITS, null, 2), 'utf8');
      }
    }

    // Semear exemplos iniciais se nenhum projeto existir ainda
    const existingProjects = readdirSync(this.projectsDir, { withFileTypes: true }).filter((d) =>
      d.isDirectory()
    );
    if (existingProjects.length === 0) {
      this.saveProjectFile(createSimulacaoDemoProject('simulacao-demo'));
      this.saveProjectFile(createKineticTop5Project('kinetic-top5'));
      this.saveProjectFile(createFreeformDemoProject('freeform-demo'));
    }
  }

  // ==========================================================================
  // TEMPLATES & ENGINES
  // ==========================================================================

  public listTemplates(): StageTemplateMetadata[] {
    return STAGE_TEMPLATES;
  }

  public getTemplate(id: string): StageTemplateMetadata | undefined {
    return STAGE_TEMPLATES.find((t) => t.id === id);
  }

  public listEngines(): EngineDescriptor[] {
    return VIDEO_ENGINES;
  }

  public getEngineSchema(engineId: VideoEngineId): Record<string, unknown> {
    if (engineId === 'scene3d') {
      return {
        engine: 'scene3d',
        description: 'Projeto baseado em cenas 3D procedurais com personagens blocky e overlays 2D.',
        templates: STAGE_TEMPLATES.map((t) => ({
          id: t.id,
          name: t.name,
          propsSchema: t.propsSchema,
          exampleProps: t.exampleProps,
        })),
        poses: ['idle', 'talking', 'waving', 'celebrating', 'pointing', 'walking', 'pulling-lever', 'typing', 'thinking', 'sad'],
        cameras: ['static', 'dolly-in', 'orbit', 'pan', 'shake', 'close-face'],
        transitions: ['cut', 'whip', 'fade', 'zoom'],
        overlayTypes: ['title', 'badge', 'lower-third', 'role-banner', 'counter', 'watermark', 'progress-bar', 'effect'],
      };
    }
    if (engineId === 'kinetic') {
      return {
        engine: 'kinetic',
        description: 'Projeto de tipografia cinética, listas Top-N, estatísticas e citações animadas.',
        layouts: ['hero-stat', 'top-list-item', 'quote-card', 'split-comparison', 'counter-explosion', 'callout-badge'],
        bgStyles: ['dark-grid', 'radial-glow', 'editorial-cream', 'neon-cyber', 'crimson-burst'],
        transitions: ['cut', 'whip', 'fade', 'zoom'],
      };
    }
    return {
      engine: 'freeform',
      description: 'Composição HTML/CSS/JS livre compatível com o contrato HyperFrames (window.__timelines["main"]).',
      requiredAttributes: ['id="root"', 'data-composition-id="main"', 'data-width', 'data-height', 'data-duration'],
      requiredGlobals: ['window.__timelines["main"]', 'window.__seek(t)'],
    };
  }

  public getStyleGuide(): string {
    return STYLE_GUIDE_MARKDOWN;
  }

  // ==========================================================================
  // PERSONAGENS
  // ==========================================================================

  public listCharacters(): Character[] {
    const charsPath = path.join(this.dataDir, 'characters.json');
    const raw = JSON.parse(readFileSync(charsPath, 'utf8'));
    return zArrayParse(CharacterSchema, raw);
  }

  public getCharacter(id: string): Character | undefined {
    return this.listCharacters().find((c) => c.id === id);
  }

  public createCharacter(input: Partial<Character> & { name: string }): Character {
    const chars = this.listCharacters();
    const id =
      input.id ||
      input.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') +
        '-' +
        Math.random().toString(36).slice(2, 6);
    const character = CharacterSchema.parse({ ...input, id });
    const idx = chars.findIndex((c) => c.id === character.id);
    if (idx >= 0) chars[idx] = character;
    else chars.push(character);
    writeFileSync(path.join(this.dataDir, 'characters.json'), JSON.stringify(chars, null, 2), 'utf8');
    this.emitChange({ type: 'character:updated', id: character.id, data: character });
    return character;
  }

  public updateCharacter(id: string, patch: Partial<Character>): Character {
    const chars = this.listCharacters();
    const idx = chars.findIndex((c) => c.id === id);
    if (idx < 0) throw new Error(`Personagem não encontrado: ${id}`);
    const updated = CharacterSchema.parse({ ...chars[idx], ...patch, id });
    chars[idx] = updated;
    writeFileSync(path.join(this.dataDir, 'characters.json'), JSON.stringify(chars, null, 2), 'utf8');
    this.emitChange({ type: 'character:updated', id, data: updated });
    return updated;
  }

  // ==========================================================================
  // VOZES
  // ==========================================================================

  public listVoices(): VoiceInfo[] {
    const settings = this.getSettings();
    return DEFAULT_VOICES.map((v) => {
      if (v.provider === 'elevenlabs') {
        return { ...v, available: Boolean(settings.elevenlabsApiKey) };
      }
      if (v.provider === 'openai') {
        return { ...v, available: Boolean(settings.openaiApiKey) };
      }
      if (v.provider === 'piper') {
        return { ...v, available: Boolean(settings.piperModelPath && existsSync(settings.piperModelPath)) };
      }
      return v;
    });
  }

  // ==========================================================================
  // SÉRIES
  // ==========================================================================

  public listSeries(): Series[] {
    const seriesPath = path.join(this.dataDir, 'series.json');
    const raw = JSON.parse(readFileSync(seriesPath, 'utf8'));
    return zArrayParse(SeriesSchema, raw);
  }

  public getSeries(id: string): Series | undefined {
    return this.listSeries().find((s) => s.id === id);
  }

  public createSeries(input: Partial<Series> & { title: string }): Series {
    const all = this.listSeries();
    const now = new Date().toISOString();
    const id =
      input.id ||
      input.title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    const series = SeriesSchema.parse({
      ...input,
      id,
      createdAt: input.createdAt || now,
      updatedAt: now,
    });
    const idx = all.findIndex((s) => s.id === series.id);
    if (idx >= 0) all[idx] = series;
    else all.push(series);
    writeFileSync(path.join(this.dataDir, 'series.json'), JSON.stringify(all, null, 2), 'utf8');
    this.emitChange({ type: 'series:updated', id: series.id, data: series });
    return series;
  }

  // ==========================================================================
  // DESIGN KITS (Brand / Design System Multi-Engine)
  // ==========================================================================

  public listDesignKits(): DesignKit[] {
    const kitsPath = path.join(this.dataDir, 'design-kits.json');
    if (!existsSync(kitsPath)) return DEFAULT_DESIGN_KITS;
    try {
      const raw = JSON.parse(readFileSync(kitsPath, 'utf8'));
      const parsed = zArrayParse(DesignKitSchema, raw);
      return parsed.length > 0 ? parsed : DEFAULT_DESIGN_KITS;
    } catch {
      return DEFAULT_DESIGN_KITS;
    }
  }

  public getDesignKit(id?: string): DesignKit | undefined {
    const all = this.listDesignKits();
    if (!id) return all[0];
    return all.find((k) => k.id === id);
  }

  public createDesignKit(input: Partial<DesignKit> & { name: string }): DesignKit {
    const all = this.listDesignKits();
    const now = new Date().toISOString();
    const id =
      input.id ||
      input.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') +
        '-' +
        Math.random().toString(36).slice(2, 6);

    const kit = DesignKitSchema.parse({
      ...input,
      id,
      createdAt: input.createdAt || now,
      updatedAt: now,
    });

    const idx = all.findIndex((k) => k.id === kit.id);
    if (idx >= 0) all[idx] = kit;
    else all.push(kit);
    writeFileSync(path.join(this.dataDir, 'design-kits.json'), JSON.stringify(all, null, 2), 'utf8');
    this.emitChange({ type: 'designkit:updated', id: kit.id, data: kit });
    return kit;
  }

  public updateDesignKit(id: string, patch: Partial<DesignKit>): DesignKit {
    const all = this.listDesignKits();
    const idx = all.findIndex((k) => k.id === id);
    if (idx < 0) throw new Error(`Design Kit não encontrado: ${id}`);
    const current = all[idx];
    const updated = DesignKitSchema.parse({
      ...current,
      ...patch,
      palette: patch.palette ? { ...current.palette, ...patch.palette } : current.palette,
      typography: patch.typography ? { ...current.typography, ...patch.typography } : current.typography,
      safeArea: patch.safeArea ? { ...current.safeArea, ...patch.safeArea } : current.safeArea,
      captionPreset: patch.captionPreset ? { ...current.captionPreset, ...patch.captionPreset } : current.captionPreset,
      overlayPreset: patch.overlayPreset ? { ...current.overlayPreset, ...patch.overlayPreset } : current.overlayPreset,
      scene3dPreset: patch.scene3dPreset ? { ...current.scene3dPreset, ...patch.scene3dPreset } : current.scene3dPreset,
      pacing: patch.pacing ? { ...current.pacing, ...patch.pacing } : current.pacing,
      id,
      updatedAt: new Date().toISOString(),
    });
    all[idx] = updated;
    writeFileSync(path.join(this.dataDir, 'design-kits.json'), JSON.stringify(all, null, 2), 'utf8');
    this.emitChange({ type: 'designkit:updated', id, data: updated });
    return updated;
  }

  public deleteDesignKit(id: string): void {
    const all = this.listDesignKits().filter((k) => k.id !== id);
    writeFileSync(path.join(this.dataDir, 'design-kits.json'), JSON.stringify(all, null, 2), 'utf8');
    this.emitChange({ type: 'designkit:updated', id });
  }

  public applyDesignKit(projectId: string, designKitId: string): Project {
    const project = this.getProject(projectId);
    const kit = this.getDesignKit(designKitId);
    if (!kit) {
      throw new Error(`Design Kit não encontrado: ${designKitId}`);
    }
    project.designKitId = kit.id;
    project.captionStyle = {
      ...project.captionStyle,
      ...kit.captionPreset,
      highlightColor: kit.palette.primary,
      textColor: kit.captionPreset.textColor || kit.palette.text,
      fontSize: kit.typography.captionFontSize || project.captionStyle.fontSize,
    };

    // Atualiza blocos cinéticos ou badges/watermarks que usavam o padrão anterior para refletir os tokens do kit
    if (project.engine === 'kinetic') {
      project.kineticBlocks = project.kineticBlocks.map((b) => ({
        ...b,
        accentColor: kit.palette.primary,
        bgStyle:
          kit.id === 'editorial-minimal' || isLightHex(kit.palette.background)
            ? 'editorial-cream'
            : b.bgStyle === 'editorial-cream'
              ? 'dark-grid'
              : b.bgStyle,
      }));
    } else if (project.engine === 'scene3d') {
      project.scenes = project.scenes.map((sc) => ({
        ...sc,
        overlays: sc.overlays.map((ov) => {
          if (ov.type === 'title') {
            return { ...ov, boxed: kit.overlayPreset.titleBoxed };
          }
          if (ov.type === 'badge') {
            return { ...ov, color: kit.palette.primary };
          }
          if (ov.type === 'progress-bar') {
            return { ...ov, color: kit.palette.primary };
          }
          if (ov.type === 'watermark' && kit.overlayPreset.watermarkHandle) {
            return { ...ov, handle: kit.overlayPreset.watermarkHandle };
          }
          return ov;
        }),
      }));
    }

    const saved = this.saveProjectFile(project);
    this.emitChange({ type: 'project:updated', id: projectId, data: saved });
    return saved;
  }

  /**
   * Extrai localmente (via FFmpeg rawvideo 16x16 RGB) a paleta de cores dominante de uma imagem ou vídeo,
   * sem depender de serviços externos pagos.
   */
  public extractPaletteFromFile(filePath: string): {
    dominantColors: string[];
    palette: DesignKitPalette;
  } {
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : filePath.startsWith('/renders/') || filePath.startsWith('/assets/')
        ? path.join(this.rootDir, filePath.slice(1))
        : path.join(this.rootDir, filePath);

    let hexColors: string[] = [];

    if (existsSync(absPath)) {
      try {
        const raw = execFileSync(
          'ffmpeg',
          [
            '-v',
            'error',
            '-i',
            absPath,
            '-frames:v',
            '1',
            '-vf',
            'scale=16:16',
            '-f',
            'rawvideo',
            '-pix_fmt',
            'rgb24',
            '-',
          ],
          { timeout: 10_000 }
        );
        const buckets = new Map<string, { r: number; g: number; b: number; count: number; sat: number; lum: number }>();
        for (let i = 0; i + 2 < raw.length; i += 3) {
          // Quantiza em passos de 24 para agrupar tons próximos
          const r = Math.min(255, Math.round(raw[i] / 24) * 24);
          const g = Math.min(255, Math.round(raw[i + 1] / 24) * 24);
          const b = Math.min(255, Math.round(raw[i + 2] / 24) * 24);
          const key = rgbToHex(r, g, b);
          const max = Math.max(r, g, b) / 255;
          const min = Math.min(r, g, b) / 255;
          const lum = (max + min) / 2;
          const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lum - 1) || 1);
          const prev = buckets.get(key);
          if (prev) prev.count += 1;
          else buckets.set(key, { r, g, b, count: 1, sat, lum });
        }
        const sorted = Array.from(buckets.entries()).sort((a, b) => b[1].count - a[1].count);
        hexColors = sorted.slice(0, 8).map(([hex]) => hex);
      } catch {
        // Fallback determinístico se o arquivo não for decodificável pelo ffmpeg
      }
    }

    if (hexColors.length < 4) {
      hexColors = ['#f5c518', '#c1121f', '#0f172a', '#1e293b', '#52b788', '#38bdf8'];
    }

    // Classifica as cores extraídas por luminância e saturação
    const parsed = hexColors.map((hex) => ({ hex, ...hexToHslMetrics(hex) }));
    const vibrant = [...parsed].sort((a, b) => b.sat - a.sat);
    const byFrequency = parsed;

    const background = byFrequency[0]?.hex || '#0f172a';
    const bgIsLight = isLightHex(background);
    const primary = vibrant[0]?.hex || '#f5c518';
    const accent = vibrant.find((c) => c.hex !== primary)?.hex || '#c1121f';
    const surface =
      byFrequency.find((c) => c.hex !== background && c.hex !== primary)?.hex ||
      (bgIsLight ? '#ffffff' : '#1e293b');
    const text = bgIsLight ? '#191919' : '#ffffff';
    const textOnPrimary = isLightHex(primary) ? '#111827' : '#ffffff';

    const palette = DesignKitPaletteSchema.parse({
      primary,
      accent,
      background,
      surface,
      text,
      textOnPrimary,
      muted: bgIsLight ? '#5c5549' : '#94a3b8',
      danger: '#ef4444',
      success: '#22c55e',
      extraSwatches: hexColors.filter((h) => ![primary, accent, background, surface].includes(h)),
    });

    return {
      dominantColors: hexColors,
      palette,
    };
  }

  public generateDesignKitFromReferences(kitId: string): DesignKit {
    const kit = this.getDesignKit(kitId);
    if (!kit) throw new Error(`Design Kit não encontrado: ${kitId}`);

    const collectedColors: string[] = [];
    const updatedRefs = kit.references.map((ref) => {
      if (ref.kind === 'image' || ref.kind === 'video') {
        const extracted = this.extractPaletteFromFile(ref.urlOrPath);
        collectedColors.push(...extracted.dominantColors);
        return {
          ...ref,
          dominantColors: extracted.dominantColors.slice(0, 6),
        };
      }
      if (ref.dominantColors && ref.dominantColors.length > 0) {
        collectedColors.push(...ref.dominantColors);
      }
      return ref;
    });

    let nextPalette = kit.palette;
    if (collectedColors.length > 0) {
      const unique = Array.from(new Set(collectedColors.map((c) => c.toLowerCase())));
      const parsed = unique.map((hex) => ({ hex, ...hexToHslMetrics(hex) }));
      const vibrant = [...parsed].sort((a, b) => b.sat - a.sat);
      const primary = vibrant[0]?.hex || kit.palette.primary;
      const accent = vibrant[1]?.hex || kit.palette.accent;
      const background = parsed.find((c) => c.lum < 0.25 || c.lum > 0.82)?.hex || unique[0] || kit.palette.background;
      const bgIsLight = isLightHex(background);
      nextPalette = DesignKitPaletteSchema.parse({
        ...kit.palette,
        primary,
        accent,
        background,
        surface: bgIsLight ? '#ffffff' : '#1e293b',
        text: bgIsLight ? '#191919' : '#ffffff',
        textOnPrimary: isLightHex(primary) ? '#111827' : '#ffffff',
        extraSwatches: unique.slice(0, 8),
      });
    }

    return this.updateDesignKit(kitId, {
      references: updatedRefs,
      palette: nextPalette,
      captionPreset: {
        ...kit.captionPreset,
        highlightColor: nextPalette.primary,
        textColor: nextPalette.text,
      },
    });
  }

  // ==========================================================================
  // PROJETOS & CENAS
  // ==========================================================================

  public getProjectDir(projectId: string): string {
    return path.join(this.projectsDir, projectId);
  }

  private saveProjectFile(project: Project): Project {
    const dir = this.getProjectDir(project.id);
    mkdirSync(dir, { recursive: true });
    const validated = ProjectSchema.parse({
      ...project,
      totalDuration: this.computeTotalDuration(project),
      updatedAt: new Date().toISOString(),
    });
    writeFileSync(path.join(dir, 'project.json'), JSON.stringify(validated, null, 2), 'utf8');
    return validated;
  }

  private computeTotalDuration(project: Partial<Project>): number {
    if (project.engine === 'freeform' && project.freeform) {
      return Number(project.freeform.duration.toFixed(2));
    }
    if (project.engine === 'kinetic' && project.kineticBlocks && project.kineticBlocks.length > 0) {
      const sum = project.kineticBlocks.reduce((acc, b) => acc + (b.duration || 3.5), 0);
      return Number(sum.toFixed(2));
    }
    if (project.scenes && project.scenes.length > 0) {
      const sum = project.scenes.reduce((acc, s) => acc + (s.duration || 4.0), 0);
      return Number(sum.toFixed(2));
    }
    return project.targetDuration || 15;
  }

  public listProjects(): Project[] {
    if (!existsSync(this.projectsDir)) return [];
    const entries = readdirSync(this.projectsDir, { withFileTypes: true });
    const projects: Project[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pFile = path.join(this.projectsDir, entry.name, 'project.json');
      if (existsSync(pFile)) {
        try {
          const raw = JSON.parse(readFileSync(pFile, 'utf8'));
          projects.push(ProjectSchema.parse(raw));
        } catch {
          // Ignorar projeto corrompido
        }
      }
    }
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  public getProject(id: string): Project {
    const pFile = path.join(this.getProjectDir(id), 'project.json');
    if (!existsSync(pFile)) {
      throw new Error(`Projeto não encontrado: ${id}`);
    }
    return ProjectSchema.parse(JSON.parse(readFileSync(pFile, 'utf8')));
  }

  public seedExampleProject(exampleId: 'simulacao-demo' | 'kinetic-top5' | 'freeform-demo', customId?: string): Project {
    const targetId = customId || exampleId;
    let project: Project;
    if (exampleId === 'simulacao-demo') {
      project = createSimulacaoDemoProject(targetId);
    } else if (exampleId === 'kinetic-top5') {
      project = createKineticTop5Project(targetId);
    } else if (exampleId === 'freeform-demo') {
      project = createFreeformDemoProject(targetId);
    } else {
      throw new Error(`Exemplo desconhecido: ${exampleId}`);
    }
    const saved = this.saveProjectFile(project);
    this.emitChange({ type: 'project:updated', id: saved.id, data: saved });
    return saved;
  }

  public createProject(
    input: Partial<Project> & {
      title: string;
      engine?: VideoEngineId;
      promptId?: string;
      styleId?: string;
      characterId?: string;
      sceneCount?: number;
    }
  ): Project {
    const now = new Date().toISOString();
    const id =
      input.id ||
      input.title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 32) +
        '-' +
        Math.random().toString(36).slice(2, 6);

    const series = input.seriesId ? this.getSeries(input.seriesId) : undefined;
    const engine: VideoEngineId = input.engine || series?.defaultEngine || 'scene3d';
    let styleId = input.styleId || series?.defaultStyleId;
    let stylePrompt = input.stylePrompt;

    if (styleId) {
      const item = this.getLibraryItem(styleId);
      if (item) {
        stylePrompt = item.contentPreview || item.description;
      }
    }

    let scenes = input.scenes || [];
    let kineticBlocks = input.kineticBlocks || [];
    let freeform = input.freeform;

    if (input.promptId) {
      const promptItem = this.getLibraryItem(input.promptId);
      if (promptItem && !input.topic) {
        input.topic = promptItem.description;
      }
    }

    // Se nenhuma cena foi passada, criar estrutura inicial útil
    if (engine === 'scene3d' && scenes.length === 0) {
      const charId = input.characterId || series?.defaultCharacterId || 'marco-silva';
      const count = Math.max(1, Math.min(12, input.sceneCount || 3));
      const defaultTemplates = [
        'red-carpet-confetti',
        'pulpit-plenary',
        'brazil-map-3d',
        'city-spending-cap',
        'timeline-3d',
        'bar-chart-3d',
        'street-protest',
      ] as const;
      const durPerScene = Number(((input.targetDuration || 15) / count).toFixed(1));
      scenes = Array.from({ length: count }, (_, i) =>
        SceneSchema.parse({
          id: `scene-${i + 1}`,
          order: i,
          narration:
            i === 0
              ? `Na nossa simulação sobre ${input.topic || input.title}, tudo muda rapidamente.`
              : i === count - 1
                ? 'E para você, esse cenário faz sentido? Comenta aí!'
                : `No passo ${i + 1}, os dados mostram um impacto direto na economia.`,
          duration: Math.max(2.5, durPerScene),
          template: defaultTemplates[i % defaultTemplates.length],
          templateProps: STAGE_TEMPLATES.find((t) => t.id === defaultTemplates[i % defaultTemplates.length])?.exampleProps || {},
          characterId: charId,
          pose: i === 0 ? 'celebrating' : i === count - 1 ? 'waving' : 'talking',
          camera: i % 2 === 0 ? 'dolly-in' : 'pan',
          transition: i === 0 ? 'cut' : 'whip',
          overlays:
            i === 0
              ? [
                  {
                    type: 'title',
                    text: input.title.toUpperCase(),
                    highlightWord: input.title.split(' ').slice(-1)[0]?.toUpperCase(),
                    position: 'top',
                    boxed: false,
                  },
                  {
                    type: 'badge',
                    text: 'NA NOSSA SIMULAÇÃO',
                    icon: '⚠',
                    color: '#f5c518',
                  },
                ]
              : [],
          highlightWords: [],
          sfx: i === 0 ? 'cheer' : 'whoosh',
        })
      );
    } else if (engine === 'kinetic' && kineticBlocks.length === 0) {
      kineticBlocks = createKineticTop5Project(id).kineticBlocks;
    } else if (engine === 'freeform' && !freeform) {
      freeform = createFreeformDemoProject(id).freeform;
    }

    const project = ProjectSchema.parse({
      ...input,
      id,
      engine,
      styleId,
      stylePrompt,
      voice: input.voice || series?.defaultVoice || {},
      captionStyle: input.captionStyle || series?.defaultCaptionStyle || {},
      renderSettings: input.renderSettings || {},
      scenes,
      kineticBlocks,
      freeform,
      status: 'scripted',
      createdAt: now,
      updatedAt: now,
    });

    const saved = this.saveProjectFile(project);
    this.emitChange({ type: 'project:created', id: saved.id, data: saved });
    return saved;
  }

  public updateProject(id: string, patch: Partial<Project>): Project {
    const current = this.getProject(id);
    const updated = this.saveProjectFile({
      ...current,
      ...patch,
      id,
    });
    this.emitChange({ type: 'project:updated', id, data: updated });
    return updated;
  }

  public deleteProject(id: string): void {
    const dir = this.getProjectDir(id);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
    this.emitChange({ type: 'project:deleted', id });
  }

  public setScript(
    projectId: string,
    payload: {
      title?: string;
      topic?: string;
      scenes?: Array<Partial<Scene> & { narration: string }>;
      kineticBlocks?: Array<Partial<KineticBlock> & { narration: string; headline: string }>;
      freeform?: Partial<FreeformComposition> & { html: string };
    }
  ): Project {
    const project = this.getProject(projectId);
    if (payload.title) project.title = payload.title;
    if (payload.topic) project.topic = payload.topic;

    if (payload.scenes) {
      project.engine = 'scene3d';
      project.scenes = payload.scenes.map((s, idx) =>
        SceneSchema.parse({
          ...s,
          id: s.id || `scene-${idx + 1}`,
          order: idx,
        })
      );
    }
    if (payload.kineticBlocks) {
      project.engine = 'kinetic';
      project.kineticBlocks = payload.kineticBlocks.map((b, idx) =>
        KineticBlockSchema.parse({
          ...b,
          id: b.id || `kb-${idx + 1}`,
          order: idx,
        })
      );
    }
    if (payload.freeform) {
      project.engine = 'freeform';
      project.freeform = FreeformCompositionSchema.parse({
        ...(project.freeform || {}),
        ...payload.freeform,
      });
    }

    project.status = 'scripted';
    const saved = this.saveProjectFile(project);
    this.emitChange({ type: 'project:updated', id: projectId, data: saved });
    return saved;
  }

  public setComposition(
    projectId: string,
    input: Partial<FreeformComposition> & { html: string }
  ): Project {
    const project = this.getProject(projectId);
    project.engine = 'freeform';
    project.freeform = FreeformCompositionSchema.parse({
      ...(project.freeform || {}),
      ...input,
    });
    project.status = 'scripted';
    const saved = this.saveProjectFile(project);
    this.emitChange({ type: 'project:updated', id: projectId, data: saved });
    return saved;
  }

  public applyStyle(projectId: string, styleId: string): Project {
    const project = this.getProject(projectId);
    const styleItem = this.getLibraryItem(styleId);
    project.styleId = styleId;
    project.stylePrompt = styleItem ? styleItem.contentPreview || styleItem.description : styleId;

    if (styleItem?.metadata?.primaryColor) {
      project.captionStyle.highlightColor = String(styleItem.metadata.primaryColor);
    }
    const saved = this.saveProjectFile(project);
    this.emitChange({ type: 'project:updated', id: projectId, data: saved });
    return saved;
  }

  public addEffect(projectId: string, effectId: string, sceneId?: string): Project {
    const project = this.getProject(projectId);
    if (!project.effectIds.includes(effectId)) {
      project.effectIds.push(effectId);
    }
    if (project.engine === 'scene3d' && project.scenes.length > 0) {
      const targets = sceneId
        ? project.scenes.filter((s) => s.id === sceneId)
        : project.scenes;
      for (const s of targets) {
        const hasOverlay = s.overlays.some((o) => o.type === 'effect' && o.effectId === effectId);
        if (!hasOverlay) {
          s.overlays.push({ type: 'effect', effectId, intensity: 0.5 });
        }
      }
    }
    const saved = this.saveProjectFile(project);
    this.emitChange({ type: 'project:updated', id: projectId, data: saved });
    return saved;
  }

  public addScene(projectId: string, sceneInput: Partial<Scene> & { narration: string }): Project {
    const project = this.getProject(projectId);
    const order = project.scenes.length;
    const scene = SceneSchema.parse({
      ...sceneInput,
      id: sceneInput.id || `scene-${order + 1}-${Math.random().toString(36).slice(2, 5)}`,
      order,
    });
    project.scenes.push(scene);
    const saved = this.saveProjectFile(project);
    this.emitChange({ type: 'project:updated', id: projectId, data: saved });
    return saved;
  }

  public updateScene(projectId: string, sceneId: string, patch: Partial<Scene>): Project {
    const project = this.getProject(projectId);
    const idx = project.scenes.findIndex((s) => s.id === sceneId);
    if (idx < 0) throw new Error(`Cena não encontrada: ${sceneId}`);
    project.scenes[idx] = SceneSchema.parse({
      ...project.scenes[idx],
      ...patch,
      id: sceneId,
    });
    const saved = this.saveProjectFile(project);
    this.emitChange({ type: 'project:updated', id: projectId, data: saved });
    return saved;
  }

  public removeScene(projectId: string, sceneId: string): Project {
    const project = this.getProject(projectId);
    project.scenes = project.scenes
      .filter((s) => s.id !== sceneId)
      .map((s, idx) => ({ ...s, order: idx }));
    const saved = this.saveProjectFile(project);
    this.emitChange({ type: 'project:updated', id: projectId, data: saved });
    return saved;
  }

  public reorderScenes(projectId: string, sceneIds: string[]): Project {
    const project = this.getProject(projectId);
    const map = new Map(project.scenes.map((s) => [s.id, s]));
    const reordered: Scene[] = [];
    for (const id of sceneIds) {
      const found = map.get(id);
      if (found) {
        reordered.push(found);
        map.delete(id);
      }
    }
    for (const leftover of map.values()) {
      reordered.push(leftover);
    }
    project.scenes = reordered.map((s, idx) => ({ ...s, order: idx }));
    const saved = this.saveProjectFile(project);
    this.emitChange({ type: 'project:updated', id: projectId, data: saved });
    return saved;
  }

  /**
   * Divide uma cena (ou bloco cinético) em duas no ponto `splitOffsetSeconds` (relativo ao início da cena),
   * repartindo também a narração e os wordTimestamps proporcionalmente (usado pela ferramenta Razor / atalho S da timeline NLE).
   */
  public splitScene(projectId: string, sceneId: string, splitOffsetSeconds: number): Project {
    const project = this.getProject(projectId);
    if (project.engine === 'kinetic') {
      const idx = project.kineticBlocks.findIndex((b) => b.id === sceneId);
      if (idx < 0) throw new Error(`Bloco não encontrado: ${sceneId}`);
      const block = project.kineticBlocks[idx];
      const clamped = Math.max(1.0, Math.min(block.duration - 1.0, Number(splitOffsetSeconds.toFixed(2))));
      const ratio = clamped / block.duration;
      const words = block.narration.trim().split(/\s+/);
      const splitWordIdx = Math.max(1, Math.min(words.length - 1, Math.round(words.length * ratio)));
      const firstNarration = words.slice(0, splitWordIdx).join(' ') || block.narration;
      const secondNarration = words.slice(splitWordIdx).join(' ') || block.narration;

      const firstBlock: KineticBlock = KineticBlockSchema.parse({
        ...block,
        duration: clamped,
        narration: firstNarration,
      });
      const secondBlock: KineticBlock = KineticBlockSchema.parse({
        ...block,
        id: `${block.id}-pt2-${Math.random().toString(36).slice(2, 5)}`,
        duration: Number(Math.max(1.0, block.duration - clamped).toFixed(2)),
        narration: secondNarration,
      });
      project.kineticBlocks.splice(idx, 1, firstBlock, secondBlock);
      project.kineticBlocks = project.kineticBlocks.map((b, i) => ({ ...b, order: i }));
    } else {
      const idx = project.scenes.findIndex((s) => s.id === sceneId);
      if (idx < 0) throw new Error(`Cena não encontrada: ${sceneId}`);
      const scene = project.scenes[idx];
      const clamped = Math.max(1.0, Math.min(scene.duration - 1.0, Number(splitOffsetSeconds.toFixed(2))));
      const ratio = clamped / scene.duration;
      const words = scene.narration.trim().split(/\s+/);
      const splitWordIdx = Math.max(1, Math.min(words.length - 1, Math.round(words.length * ratio)));
      const firstNarration = words.slice(0, splitWordIdx).join(' ') || scene.narration;
      const secondNarration = words.slice(splitWordIdx).join(' ') || scene.narration;

      const firstScene: Scene = SceneSchema.parse({
        ...scene,
        duration: clamped,
        narration: firstNarration,
        wordTimestamps: scene.wordTimestamps
          ? scene.wordTimestamps.filter((w) => w.start < clamped)
          : undefined,
      });
      const secondScene: Scene = SceneSchema.parse({
        ...scene,
        id: `${scene.id}-pt2-${Math.random().toString(36).slice(2, 5)}`,
        duration: Number(Math.max(1.0, scene.duration - clamped).toFixed(2)),
        narration: secondNarration,
        wordTimestamps: scene.wordTimestamps
          ? scene.wordTimestamps
              .filter((w) => w.start >= clamped)
              .map((w) => ({
                ...w,
                start: Number(Math.max(0, w.start - clamped).toFixed(3)),
                end: Number(Math.max(0.02, w.end - clamped).toFixed(3)),
              }))
          : undefined,
      });
      project.scenes.splice(idx, 1, firstScene, secondScene);
      project.scenes = project.scenes.map((s, i) => ({ ...s, order: i }));
    }

    const saved = this.saveProjectFile(project);
    this.emitChange({ type: 'project:updated', id: projectId, data: saved });
    return saved;
  }

  // ==========================================================================
  // VALIDAÇÃO ACIONÁVEL + CONFORMIDADE COM O DESIGN KIT
  // ==========================================================================

  public validateProject(projectId: string): ValidationResult {
    const project = this.getProject(projectId);
    const issues: ValidationIssue[] = [];
    const characters = new Set(this.listCharacters().map((c) => c.id));
    const templates = new Set(STAGE_TEMPLATES.map((t) => t.id));
    const designKit = this.getDesignKit(project.designKitId || 'simulacao-2030');

    const allowedPalette = new Set<string>();
    const allowedFonts = new Set<string>();
    if (designKit) {
      const p = designKit.palette;
      [
        p.primary,
        p.accent,
        p.background,
        p.surface,
        p.text,
        p.textOnPrimary,
        p.muted,
        p.danger,
        p.success,
        ...(p.extraSwatches || []),
      ]
        .filter(Boolean)
        .forEach((c) => allowedPalette.add(c.toLowerCase()));
      (designKit.typography.allowedFonts || []).forEach((f) => allowedFonts.add(f.toLowerCase()));
    }

    const checkColorConformity = (colorValue: string | undefined, pathLabel: string) => {
      if (!designKit || !colorValue || !colorValue.startsWith('#')) return;
      const norm = colorValue.trim().toLowerCase();
      if (!allowedPalette.has(norm)) {
        issues.push({
          severity: 'warning',
          path: pathLabel,
          message: `Cor "${colorValue}" não faz parte da paleta do Design Kit "${designKit.name}".`,
          suggestion: `Use uma das cores oficiais do kit (ex: primária ${designKit.palette.primary}, destaque ${designKit.palette.accent}, superfície ${designKit.palette.surface}).`,
        });
      }
    };

    const checkFontConformity = (fontFamily: string | undefined, pathLabel: string) => {
      if (!designKit || !fontFamily) return;
      const clean = fontFamily.replace(/['"]/g, '').split(',')[0].trim().toLowerCase();
      if (clean && allowedFonts.size > 0 && !allowedFonts.has(clean)) {
        issues.push({
          severity: 'warning',
          path: pathLabel,
          message: `Fonte "${fontFamily}" não está permitida no Design Kit "${designKit.name}".`,
          suggestion: `Use apenas fontes autorizadas pelo kit: ${designKit.typography.allowedFonts.join(', ')}.`,
        });
      }
    };

    const checkSafeAreaConformity = (
      ov: { x?: number; y?: number; width?: number; height?: number },
      pathLabel: string
    ) => {
      if (!designKit) return;
      const sa = designKit.safeArea;
      const w = project.renderSettings.width || 720;
      const h = project.renderSettings.height || 1280;
      if (ov.x !== undefined) {
        if (ov.x < sa.leftPx || ov.x + (ov.width || 80) > w - sa.rightPx) {
          issues.push({
            severity: 'warning',
            path: `${pathLabel}.x`,
            message: `Elemento em x=${ov.x}px ultrapassa a safe area horizontal (${sa.leftPx}px..${w - sa.rightPx}px) do Design Kit "${designKit.name}".`,
            suggestion: `Mantenha o elemento dentro das margens seguras horizontais (${sa.leftPx}px a ${w - sa.rightPx}px).`,
          });
        }
      }
      if (ov.y !== undefined) {
        if (ov.y < sa.topPx || ov.y + (ov.height || 40) > h - sa.bottomPx) {
          issues.push({
            severity: 'warning',
            path: `${pathLabel}.y`,
            message: `Elemento em y=${ov.y}px ultrapassa a safe area vertical (${sa.topPx}px..${h - sa.bottomPx}px) do Design Kit "${designKit.name}".`,
            suggestion: `Reposicione o elemento entre y=${sa.topPx}px e y=${h - sa.bottomPx}px para não ser coberto pela UI do Reels/Shorts.`,
          });
        }
      }
    };

    checkColorConformity(project.captionStyle.highlightColor, 'captionStyle.highlightColor');
    checkColorConformity(project.captionStyle.textColor, 'captionStyle.textColor');

    if (project.engine === 'scene3d') {
      if (project.scenes.length === 0) {
        issues.push({
          severity: 'error',
          path: 'scenes',
          message: 'O projeto scene3d não possui nenhuma cena configurada.',
          suggestion: 'Use set_script ou add_scene para adicionar pelo menos 1 cena 3D.',
        });
      }
      const usedTemplates = new Set<string>();
      project.scenes.forEach((scene, i) => {
        usedTemplates.add(scene.template);
        if (!scene.narration || scene.narration.trim().length < 3) {
          issues.push({
            severity: 'error',
            path: `scenes[${i}].narration`,
            message: `A cena "${scene.id}" está com narração vazia ou muito curta.`,
            suggestion: 'Forneça uma frase clara em português para síntese TTS e geração de legendas.',
          });
        }
        if (!templates.has(scene.template)) {
          issues.push({
            severity: 'error',
            path: `scenes[${i}].template`,
            message: `Template "${scene.template}" inválido na cena "${scene.id}".`,
            suggestion: `Use um dos templates suportados: ${Array.from(templates).join(', ')}.`,
          });
        }
        if (!characters.has(scene.characterId)) {
          issues.push({
            severity: 'warning',
            path: `scenes[${i}].characterId`,
            message: `Personagem "${scene.characterId}" não encontrado no banco; será usado o fallback padrão.`,
            suggestion: `Crie o personagem com create_character ou use um existente (${Array.from(characters).join(', ')}).`,
          });
        }
        const minDur = designKit?.pacing.minSceneDuration ?? 1.5;
        const maxDur = designKit?.pacing.maxSceneDuration ?? 20;
        if (scene.duration < minDur || scene.duration > maxDur) {
          issues.push({
            severity: 'warning',
            path: `scenes[${i}].duration`,
            message: `Duração da cena "${scene.id}" (${scene.duration}s) foge do ritmo do Design Kit (${minDur}–${maxDur}s).`,
            suggestion: `Ajuste a duração da cena para ficar entre ${minDur}s e ${maxDur}s.`,
          });
        }

        scene.overlays.forEach((ov, oi) => {
          const ovPath = `scenes[${i}].overlays[${oi}]`;
          if ('color' in ov && ov.color) {
            checkColorConformity(ov.color, `${ovPath}.color`);
          }
          checkColorConformity(ov.textColor, `${ovPath}.textColor`);
          checkColorConformity(ov.backgroundColor, `${ovPath}.backgroundColor`);
          checkFontConformity(ov.fontFamily, `${ovPath}.fontFamily`);
          checkSafeAreaConformity(ov, ovPath);
        });
      });

      if (project.scenes.length >= 3 && usedTemplates.size === 1) {
        issues.push({
          severity: 'warning',
          path: 'scenes',
          message: 'Todas as cenas usam o mesmo template de cenário 3D.',
          suggestion: 'Alterne cenários (ex: red-carpet-confetti, pulpit-plenary, brazil-map-3d, bar-chart-3d) para maior retenção visual.',
        });
      }
    } else if (project.engine === 'kinetic') {
      if (project.kineticBlocks.length === 0) {
        issues.push({
          severity: 'error',
          path: 'kineticBlocks',
          message: 'O projeto kinetic não possui blocos tipográficos.',
          suggestion: 'Use set_script com kineticBlocks para definir os cartões animados.',
        });
      }
      project.kineticBlocks.forEach((b, i) => {
        if (!b.headline.trim()) {
          issues.push({
            severity: 'error',
            path: `kineticBlocks[${i}].headline`,
            message: `Bloco "${b.id}" sem título principal (headline).`,
            suggestion: 'Preencha um headline curto em caixa alta.',
          });
        }
        checkColorConformity(b.accentColor, `kineticBlocks[${i}].accentColor`);
        Object.entries(b.elementOverrides || {}).forEach(([elKey, elOv]) => {
          const elPath = `kineticBlocks[${i}].elementOverrides.${elKey}`;
          checkColorConformity(elOv.textColor, `${elPath}.textColor`);
          checkColorConformity(elOv.backgroundColor, `${elPath}.backgroundColor`);
          checkFontConformity(elOv.fontFamily, `${elPath}.fontFamily`);
          checkSafeAreaConformity(elOv, elPath);
        });
      });
    } else if (project.engine === 'freeform') {
      if (!project.freeform || !project.freeform.html.trim()) {
        issues.push({
          severity: 'error',
          path: 'freeform.html',
          message: 'O projeto freeform não possui HTML de composição.',
          suggestion: 'Use set_composition para definir o HTML no contrato HyperFrames.',
        });
      } else {
        const html = project.freeform.html;
        if (!html.includes('data-composition-id')) {
          issues.push({
            severity: 'error',
            path: 'freeform.html',
            message: 'HTML freeform não contém atributo data-composition-id="main" no elemento raiz.',
            suggestion: 'Inclua <div id="root" data-composition-id="main" data-start="0" data-duration="..."> no HTML.',
          });
        }
        if (!html.includes('__timelines')) {
          issues.push({
            severity: 'error',
            path: 'freeform.html',
            message: 'HTML freeform não registra timeline GSAP em window.__timelines.',
            suggestion: 'Registre window.__timelines["main"] = gsap.timeline({ paused: true }).',
          });
        }
      }
    }

    return {
      valid: !issues.some((i) => i.severity === 'error'),
      engine: project.engine,
      estimatedDuration: this.computeTotalDuration(project),
      designKitId: designKit?.id,
      issues,
    };
  }

  // ==========================================================================
  // BIBLIOTECA DE PROMPTS, ESTILOS, EFEITOS, BLOCOS E TÉCNICAS
  // ==========================================================================

  public loadLibraryIndex(): LibraryItem[] {
    const indexPath = path.join(this.libraryDir, 'index.json');
    if (!existsSync(indexPath)) {
      return BUILTIN_LIBRARY_SEEDS;
    }
    try {
      const parsed = JSON.parse(readFileSync(indexPath, 'utf8'));
      const items = Array.isArray(parsed.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
      const byId = new Map<string, LibraryItem>();
      for (const seed of BUILTIN_LIBRARY_SEEDS) byId.set(seed.id, seed);
      for (const item of items) byId.set(item.id, item);
      return Array.from(byId.values());
    } catch {
      return BUILTIN_LIBRARY_SEEDS;
    }
  }

  public searchLibrary(options: {
    query?: string;
    type?: LibraryItemType;
    tag?: string;
    limit?: number;
  } = {}): LibraryItem[] {
    const all = this.loadLibraryIndex();
    const q = (options.query || '').trim().toLowerCase();
    const tag = (options.tag || '').trim().toLowerCase();
    const filtered = all.filter((item) => {
      if (options.type && item.type !== options.type) return false;
      if (tag && !item.tags.some((t) => t.toLowerCase().includes(tag))) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q)) ||
        (item.contentPreview || '').toLowerCase().includes(q)
      );
    });
    return filtered.slice(0, options.limit || 60);
  }

  public getLibraryItem(id: string): (LibraryItem & { fullContent?: string }) | undefined {
    const item = this.loadLibraryIndex().find((i) => i.id === id);
    if (!item) return undefined;
    let fullContent = item.contentPreview || item.description;
    const absPath = path.isAbsolute(item.sourcePath)
      ? item.sourcePath
      : path.join(this.rootDir, item.sourcePath);
    if (existsSync(absPath)) {
      try {
        fullContent = readFileSync(absPath, 'utf8').slice(0, 24000);
      } catch {
        // Manter preview
      }
    }
    return { ...item, fullContent };
  }

  // ==========================================================================
  // FILA DE JOBS
  // ==========================================================================

  public listJobs(): Job[] {
    const jobsPath = path.join(this.dataDir, 'jobs.json');
    if (!existsSync(jobsPath)) return [];
    const raw = JSON.parse(readFileSync(jobsPath, 'utf8'));
    return zArrayParse(JobSchema, raw).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public getJob(jobId: string): Job {
    const found = this.listJobs().find((j) => j.id === jobId);
    if (!found) throw new Error(`Job não encontrado: ${jobId}`);
    return found;
  }

  public createJob(projectId: string): Job {
    const jobs = this.listJobs();
    const now = new Date().toISOString();
    const job: Job = JobSchema.parse({
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      projectId,
      status: 'queued',
      stage: 'queued',
      progress: 0,
      message: 'Job adicionado à fila de renderização',
      logs: [`[${now}] Job criado para o projeto ${projectId}`],
      createdAt: now,
      updatedAt: now,
    });
    jobs.unshift(job);
    writeFileSync(path.join(this.dataDir, 'jobs.json'), JSON.stringify(jobs.slice(0, 100), null, 2), 'utf8');
    this.emitChange({ type: 'job:updated', id: job.id, data: job });
    return job;
  }

  public updateJob(jobId: string, patch: Partial<Job> & { appendLog?: string }): Job {
    const jobs = this.listJobs();
    const idx = jobs.findIndex((j) => j.id === jobId);
    if (idx < 0) throw new Error(`Job não encontrado: ${jobId}`);
    const current = jobs[idx];
    const logs = [...current.logs];
    if (patch.appendLog) {
      logs.push(`[${new Date().toISOString()}] ${patch.appendLog}`);
    }
    const { appendLog: _ignored, ...rest } = patch;
    const updated = JobSchema.parse({
      ...current,
      ...rest,
      logs: rest.logs || logs,
      updatedAt: new Date().toISOString(),
    });
    jobs[idx] = updated;
    writeFileSync(path.join(this.dataDir, 'jobs.json'), JSON.stringify(jobs, null, 2), 'utf8');
    this.emitChange({ type: 'job:updated', id: jobId, data: updated });
    return updated;
  }

  // ==========================================================================
  // CONFIGURAÇÕES (.env + data/settings.json) E 13 INTEGRAÇÕES
  // ==========================================================================

  public getSettings(): AppSettings {
    const settingsPath = path.join(this.dataDir, 'settings.json');
    let saved: Record<string, unknown> = {};
    if (existsSync(settingsPath)) {
      try {
        saved = JSON.parse(readFileSync(settingsPath, 'utf8'));
      } catch {
        saved = {};
      }
    }
    return AppSettingsSchema.parse({
      ttsProvider: process.env.TTS_PROVIDER || saved.ttsProvider || 'edge',
      ttsDefaultVoice: process.env.TTS_DEFAULT_VOICE || saved.ttsDefaultVoice || 'pt-BR-AntonioNeural',
      llmProvider: process.env.LLM_PROVIDER || saved.llmProvider || 'manual',
      geminiApiKey: process.env.GEMINI_API_KEY || saved.geminiApiKey || '',
      geminiModel: process.env.GEMINI_MODEL || saved.geminiModel || 'gemini-2.5-flash',
      openaiApiKey: process.env.OPENAI_API_KEY || saved.openaiApiKey || '',
      openaiBaseUrl: process.env.OPENAI_BASE_URL || saved.openaiBaseUrl || 'https://api.openai.com/v1',
      openaiModel: process.env.OPENAI_MODEL || saved.openaiModel || 'gpt-4o-mini',
      elevenlabsApiKey: process.env.ELEVENLABS_API_KEY || saved.elevenlabsApiKey || '',
      elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID || saved.elevenlabsVoiceId || '',
      piperBin: process.env.PIPER_BIN || saved.piperBin || 'piper',
      piperModelPath: process.env.PIPER_MODEL_PATH || saved.piperModelPath || '',
      imageProvider: process.env.IMAGE_PROVIDER || saved.imageProvider || 'none',
      comfyuiUrl: process.env.COMFYUI_URL || saved.comfyuiUrl || 'http://127.0.0.1:8188',
      renderer: process.env.RENDERER || saved.renderer || 'hyperframes',
      chromePath: process.env.CHROME_PATH || saved.chromePath || '/usr/bin/google-chrome',
      hyperframesRoot: process.env.HYPERFRAMES_ROOT || saved.hyperframesRoot || '/home/higorlino/openmotion',
      musicDir: process.env.MUSIC_DIR || saved.musicDir || './assets/music',
      sfxDir: process.env.SFX_DIR || saved.sfxDir || './assets/sfx',
    });
  }

  public updateSettings(patch: Partial<AppSettings>): AppSettings {
    const current = this.getSettings();
    const updated = AppSettingsSchema.parse({ ...current, ...patch });
    writeFileSync(path.join(this.dataDir, 'settings.json'), JSON.stringify(updated, null, 2), 'utf8');

    // Sincronizar também em .env local (ignorado pelo git)
    const envLines = [
      `TTS_PROVIDER=${updated.ttsProvider}`,
      `TTS_DEFAULT_VOICE=${updated.ttsDefaultVoice}`,
      `LLM_PROVIDER=${updated.llmProvider}`,
      `GEMINI_API_KEY=${updated.geminiApiKey}`,
      `GEMINI_MODEL=${updated.geminiModel}`,
      `OPENAI_API_KEY=${updated.openaiApiKey}`,
      `OPENAI_BASE_URL=${updated.openaiBaseUrl}`,
      `OPENAI_MODEL=${updated.openaiModel}`,
      `ELEVENLABS_API_KEY=${updated.elevenlabsApiKey}`,
      `ELEVENLABS_VOICE_ID=${updated.elevenlabsVoiceId}`,
      `PIPER_BIN=${updated.piperBin}`,
      `PIPER_MODEL_PATH=${updated.piperModelPath}`,
      `IMAGE_PROVIDER=${updated.imageProvider}`,
      `COMFYUI_URL=${updated.comfyuiUrl}`,
      `RENDERER=${updated.renderer}`,
      `CHROME_PATH=${updated.chromePath}`,
      `HYPERFRAMES_ROOT=${updated.hyperframesRoot}`,
      `MUSIC_DIR=${updated.musicDir}`,
      `SFX_DIR=${updated.sfxDir}`,
    ];
    writeFileSync(path.join(this.rootDir, '.env'), envLines.join('\n') + '\n', 'utf8');
    this.emitChange({ type: 'settings:updated', data: updated });
    return updated;
  }

  public listIntegrations(): IntegrationStatus[] {
    const settings = this.getSettings();
    const vendorDir = path.join(this.libraryDir, 'vendor');
    const hasVendor = (name: string) => existsSync(path.join(vendorDir, name));
    const hasHyperframes =
      existsSync(path.join(settings.hyperframesRoot, 'node_modules/hyperframes/bin/hyperframes.mjs')) ||
      existsSync('/home/higorlino/.local/bin/hyperframes');
    const hasThree = existsSync(path.join(this.rootDir, 'node_modules/three/package.json'));
    const hasGsap = existsSync(path.join(this.rootDir, 'node_modules/gsap/package.json'));
    let hasFfmpeg = false;
    try {
      execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
      hasFfmpeg = true;
    } catch {
      hasFfmpeg = false;
    }

    return [
      {
        id: 'hyperframes',
        name: 'HyperFrames',
        category: 'core',
        repoUrl: 'https://github.com/heygen-com/hyperframes',
        license: 'Apache-2.0',
        detected: hasHyperframes,
        enabled: true,
        statusText: hasHyperframes ? 'Detectado (CLI + Registry local ~450 blocos)' : 'Não detectado (usando fallback Playwright)',
        installInstructions: 'npm install hyperframes ou apontar HYPERFRAMES_ROOT=/home/higorlino/openmotion',
        description: 'Renderizador HTML → MP4 determinístico e catálogo de blocos de motion design.',
      },
      {
        id: 'threejs',
        name: 'Three.js',
        category: 'core',
        repoUrl: 'https://github.com/mrdoob/three.js',
        license: 'MIT',
        detected: hasThree,
        enabled: true,
        statusText: hasThree ? 'Instalado no monorepo' : 'Ausente',
        installInstructions: 'npm install three',
        description: 'Motor WebGL 3D para personagens blocky procedurais e cenários low-poly.',
      },
      {
        id: 'gsap',
        name: 'GSAP (GreenSock)',
        category: 'core',
        repoUrl: 'https://github.com/greensock/GSAP',
        license: 'Standard No-Charge',
        detected: hasGsap,
        enabled: true,
        statusText: hasGsap ? 'Instalado no monorepo' : 'Ausente',
        installInstructions: 'npm install gsap',
        description: 'Motor de timeline determinística pausada e seekável (window.__timelines["main"]).',
      },
      {
        id: 'ffmpeg',
        name: 'FFmpeg',
        category: 'core',
        repoUrl: 'https://ffmpeg.org',
        license: 'LGPL / GPL',
        detected: hasFfmpeg,
        enabled: true,
        statusText: hasFfmpeg ? 'Instalado no PATH do sistema' : 'Não encontrado no PATH',
        installInstructions: 'Instale o pacote ffmpeg pela distribuição Linux',
        description: 'Mixagem de áudio com sidechain ducking, síntese de SFX, detecção de cenas e encode H.264/AAC.',
      },
      {
        id: 'rea-video',
        name: 'Rea-Video',
        category: 'library',
        repoUrl: 'https://github.com/JuneYaooo/rea-video',
        license: 'Apache-2.0',
        detected: hasVendor('rea-video'),
        enabled: true,
        statusText: hasVendor('rea-video') ? 'Clonado em library/vendor/rea-video' : 'Pronto para sincronizar (npm run library:sync)',
        installInstructions: 'npm run library:sync',
        description: 'Prompts e metodologia para engenharia reversa e breakdown de vídeos de referência.',
      },
      {
        id: 'awesome-opus5-5-videos',
        name: 'Awesome Opus 5.5 Videos',
        category: 'library',
        repoUrl: 'https://github.com/yihui-dev/awesome-opus5-5-videos',
        license: 'MIT',
        detected: hasVendor('awesome-opus5-5-videos'),
        enabled: true,
        statusText: hasVendor('awesome-opus5-5-videos') ? 'Indexado na Biblioteca' : 'Pronto para sincronizar (npm run library:sync)',
        installInstructions: 'npm run library:sync',
        description: 'Coleção curada de prompts de vídeos virais prontos para geração por IA.',
      },
      {
        id: 'lemo-opuscar',
        name: 'Lemo-Opuscar (99 Film Styles)',
        category: 'library',
        repoUrl: 'https://github.com/lemomo-ai/lemo-opuscar',
        license: 'Uso Local (Não Redistribuir)',
        detected: hasVendor('lemo-opuscar'),
        enabled: true,
        statusText: hasVendor('lemo-opuscar') ? '99 estilos indexados localmente' : 'Pronto para sincronizar (npm run library:sync)',
        installInstructions: 'npm run library:sync (clona apenas localmente em library/vendor/lemo-opuscar)',
        description: '99 estilos cinematográficos aplicáveis a projetos scene3d, kinetic e freeform.',
      },
      {
        id: 'pixelfx',
        name: 'PixelFX (244 Pixel Art Effects)',
        category: 'library',
        repoUrl: 'https://github.com/patch-gg/pixelfx',
        license: 'MIT',
        detected: hasVendor('pixelfx'),
        enabled: true,
        statusText: hasVendor('pixelfx') ? '244 efeitos indexados na Biblioteca' : 'Pronto para sincronizar (npm run library:sync)',
        installInstructions: 'npm run library:sync',
        description: '244 efeitos visuais e overlays em código utilizáveis em cenas e transições.',
      },
      {
        id: 'remotion-skills',
        name: 'Remotion Skills',
        category: 'library',
        repoUrl: 'https://github.com/remotion-dev/skills',
        license: 'MIT',
        detected: hasVendor('remotion-skills'),
        enabled: true,
        statusText: hasVendor('remotion-skills') ? 'Técnicas indexadas na Biblioteca' : 'Pronto para sincronizar (npm run library:sync)',
        installInstructions: 'npm run library:sync',
        description: 'Boas práticas e técnicas de animação programática para consulta do agente.',
      },
      {
        id: 'comfyui',
        name: 'ComfyUI (ImageProvider)',
        category: 'optional-provider',
        repoUrl: 'https://github.com/Comfy-Org/ComfyUI',
        license: 'GPL-3.0',
        detected: settings.imageProvider === 'comfyui',
        enabled: settings.imageProvider === 'comfyui',
        statusText: settings.imageProvider === 'comfyui' ? `Ativo em ${settings.comfyuiUrl}` : 'Desligado por padrão (none)',
        installInstructions: 'Inicie o ComfyUI local na porta 8188 e ative IMAGE_PROVIDER=comfyui em Configurações.',
        description: 'Geração opcional de texturas, fundos e imagens de cena via tool MCP generate_image.',
      },
      {
        id: 'remotion',
        name: 'Remotion (Renderer Alternativo)',
        category: 'optional-provider',
        repoUrl: 'https://github.com/remotion-dev/remotion',
        license: 'Remotion License / MIT',
        detected: existsSync(path.join(this.rootDir, 'node_modules/remotion')),
        enabled: settings.renderer === 'remotion',
        statusText: settings.renderer === 'remotion' ? 'Selecionado como Renderer' : 'Adapter opcional disponível (desligado por padrão)',
        installInstructions: 'npm install remotion @remotion/renderer e selecione RENDERER=remotion.',
        description: 'Adapter alternativo que implementa a interface Renderer do pipeline.',
      },
      {
        id: 'blender-mcp',
        name: 'Blender MCP',
        category: 'extension',
        repoUrl: 'https://github.com/ahujasid/mcp-for-blender',
        license: 'MIT',
        detected: false,
        enabled: false,
        statusText: 'Ponto de extensão documentado (ExternalScene3DProvider)',
        installInstructions: 'Instale o addon Blender MCP no Blender e conecte ao agente externo junto com este servidor MCP.',
        description: 'Permite exportar modelos GLB/cenas renderizadas do Blender para uso nos templates scene3d.',
      },
      {
        id: 'effectcraft',
        name: 'EffectCraft (Rust VFX)',
        category: 'extension',
        repoUrl: 'https://github.com/storytold/effectcraft',
        license: 'MIT / Apache-2.0',
        detected: false,
        enabled: false,
        statusText: 'Ponto de extensão documentado (Shader/VFX Post-Processor)',
        installInstructions: 'Compile via cargo install effectcraft e registre filtros pós-processamento customizados.',
        description: 'Motor Rust de efeitos especiais e shaders para pós-processamento de frames.',
      },
    ];
  }

  // ==========================================================================
  // DELEGAÇÃO PARA O PIPELINE (TTS, PREVIEW, RENDER, BREAKDOWN, IMAGE, LLM)
  // ==========================================================================

  public async synthesizeAudio(projectId: string): Promise<Project> {
    if (!this.handlers.synthesizeAudio) {
      throw new Error('Pipeline handler synthesizeAudio não registrado');
    }
    return this.handlers.synthesizeAudio(projectId);
  }

  public async renderPreviewFrames(
    projectId: string,
    timestamps?: number[]
  ): Promise<Array<{ timestamp: number; pngPath: string; base64: string; sceneId?: string }>> {
    if (!this.handlers.renderPreviewFrames) {
      throw new Error('Pipeline handler renderPreviewFrames não registrado');
    }
    return this.handlers.renderPreviewFrames(projectId, timestamps);
  }

  public async startRenderVideoJob(projectId: string): Promise<Job> {
    if (!this.handlers.renderVideo) {
      throw new Error('Pipeline handler renderVideo não registrado');
    }
    const job = this.createJob(projectId);
    // Executa assincronamente em background sem bloquear a resposta MCP/REST
    setImmediate(() => {
      this.handlers.renderVideo!(projectId, job.id).catch((err) => {
        this.updateJob(job.id, {
          status: 'failed',
          stage: 'failed',
          message: err instanceof Error ? err.message : String(err),
          error: err instanceof Error ? err.stack || err.message : String(err),
          appendLog: `ERRO FATAL: ${err instanceof Error ? err.message : String(err)}`,
        });
      });
    });
    return job;
  }

  public async renderVideoSync(projectId: string): Promise<Job> {
    if (!this.handlers.renderVideo) {
      throw new Error('Pipeline handler renderVideo não registrado');
    }
    const job = this.createJob(projectId);
    return this.handlers.renderVideo(projectId, job.id);
  }

  public async breakdownReferenceVideo(videoPath: string, transcribe = false): Promise<ReferenceBreakdown> {
    if (!this.handlers.breakdownReferenceVideo) {
      throw new Error('Pipeline handler breakdownReferenceVideo não registrado');
    }
    return this.handlers.breakdownReferenceVideo(videoPath, transcribe);
  }

  public async generateImage(
    prompt: string,
    options?: { width?: number; height?: number; projectId?: string }
  ): Promise<{ imagePath: string; provider: string }> {
    if (!this.handlers.generateImage) {
      throw new Error('Pipeline handler generateImage não registrado');
    }
    return this.handlers.generateImage(prompt, options);
  }

  public async generateScriptWithLLM(params: {
    topic: string;
    duration: number;
    tone: string;
    sceneCount: number;
    engine: VideoEngineId;
    characterId?: string;
    styleId?: string;
  }): Promise<{ title: string; scenes?: Scene[]; kineticBlocks?: KineticBlock[]; freeform?: FreeformComposition }> {
    if (!this.handlers.generateScriptWithLLM) {
      throw new Error('Pipeline handler generateScriptWithLLM não registrado');
    }
    return this.handlers.generateScriptWithLLM(params);
  }

  public async syncLibrary(): Promise<{ count: number; items: LibraryItem[] }> {
    if (!this.handlers.syncLibrary) {
      throw new Error('Pipeline handler syncLibrary não registrado');
    }
    const res = await this.handlers.syncLibrary();
    this.emitChange({ type: 'library:updated', data: { count: res.count } });
    return res;
  }
}

function zArrayParse<T>(schema: { parse: (v: unknown) => T }, arr: unknown): T[] {
  if (!Array.isArray(arr)) return [];
  const out: T[] = [];
  for (const item of arr) {
    try {
      out.push(schema.parse(item));
    } catch {
      // Skip invalid item
    }
  }
  return out;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHslMetrics(hex: string): { r: number; g: number; b: number; lum: number; sat: number } {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0');
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lum = (max + min) / 2;
  const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lum - 1) || 1);
  return { r, g, b, lum, sat };
}

function isLightHex(hex: string): boolean {
  const { r, g, b } = hexToHslMetrics(hex);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150;
}

let defaultServiceInstance: VideoService | null = null;
export function getVideoService(rootDir = WORKSPACE_ROOT): VideoService {
  if (!defaultServiceInstance || defaultServiceInstance.rootDir !== rootDir) {
    defaultServiceInstance = new VideoService(rootDir);
  }
  return defaultServiceInstance;
}
