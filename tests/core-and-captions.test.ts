import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CaptionStyleSchema,
  CharacterSchema,
  ProjectSchema,
  RenderSettingsSchema,
  SceneSchema,
  SeriesSchema,
  VideoService,
  VoiceConfigSchema,
  createFreeformDemoProject,
  createKineticTop5Project,
  createSimulacaoDemoProject,
} from '@videos/core';
import {
  buildWordCaptionGroups,
  computeOverlayLayoutZones,
  estimateProportionalWordTimestamps,
  generateAssContent,
  generateSrtContent,
} from '@videos/overlays';
import { collectGlobalWordTimestamps, composeProject } from '@videos/composer';

describe('Schemas Zod (@videos/core)', () => {
  it('valida CharacterSchema com padrões blocky/chibi', () => {
    const char = CharacterSchema.parse({
      id: 'teste-char',
      name: 'Ana Souza',
    });
    expect(char.headScale).toBe(1.38);
    expect(char.hairStyle).toBe('afro');
    expect(char.hasGlasses).toBe(true);
  });

  it('valida SceneSchema, VoiceConfigSchema, CaptionStyleSchema, RenderSettingsSchema e SeriesSchema', () => {
    const scene = SceneSchema.parse({
      id: 's1',
      narration: 'Na nossa simulação de dois mil e trinta.',
      template: 'red-carpet-confetti',
    });
    expect(scene.pose).toBe('talking');
    expect(scene.camera).toBe('dolly-in');

    const voice = VoiceConfigSchema.parse({});
    expect(voice.provider).toBe('edge');
    expect(voice.voiceId).toBe('pt-BR-AntonioNeural');

    const cap = CaptionStyleSchema.parse({});
    expect(cap.style).toBe('highlight-yellow');
    expect(cap.wordsPerGroup).toBe(3);

    const render = RenderSettingsSchema.parse({});
    expect(render.width).toBe(720);
    expect(render.height).toBe(1280);
    expect(render.fps).toBe(30);

    const now = new Date().toISOString();
    const series = SeriesSchema.parse({
      id: 'serie-1',
      title: 'SIMULAÇÃO 2030',
      createdAt: now,
      updatedAt: now,
    });
    expect(series.defaultEngine).toBe('scene3d');
  });
});

describe('Sincronia de Legendas Word-by-Word (@videos/overlays)', () => {
  it('estima timestamps proporcionais e agrupa em 2-3 palavras sem atravessar pausas de cena', () => {
    const scene1Words = estimateProportionalWordTimestamps(
      'Na nossa simulação de dois mil e trinta',
      3.0,
      ['simulação']
    );
    expect(scene1Words.length).toBe(8);
    expect(scene1Words[2].word).toBe('simulação');
    expect(scene1Words[2].highlighted).toBe(true);

    // Simula segunda cena começando após pausa de 0.4s (em t = 3.5s)
    const scene2Words = estimateProportionalWordTimestamps(
      'O país dobra a indústria nacional',
      2.5
    ).map((w) => ({
      ...w,
      start: Number((w.start + 3.5).toFixed(3)),
      end: Number((w.end + 3.5).toFixed(3)),
    }));

    const combined = [...scene1Words, ...scene2Words];
    const groups = buildWordCaptionGroups(combined, 3);

    // Nenhum grupo pode misturar palavras da cena 1 (end <= 3.0) com a cena 2 (start >= 3.5)
    for (const g of groups) {
      const hasScene1 = g.words.some((w) => w.end <= 3.1);
      const hasScene2 = g.words.some((w) => w.start >= 3.4);
      expect(hasScene1 && hasScene2).toBe(false);
    }

    const srt = generateSrtContent(combined, 3);
    expect(srt).toContain('00:00:');
    expect(srt).toContain('Na nossa simulação');

    const ass = generateAssContent(combined, CaptionStyleSchema.parse({}), 720, 1280);
    expect(ass).toContain('[V4+ Styles]');
    expect(ass).toContain('Dialogue:');
  });

  it('garante ausência total de sobreposição temporal entre grupos de legenda mesmo com word boundaries sobrepostos do TTS e nas transições dos 3 engines', () => {
    // Reproduz o caso real do Edge TTS em t ≈ 2–3s onde prevWord.end > nextWord.start
    const overlappingTtsWords = [
      { word: 'Cinco', start: 0.093, end: 0.484, highlighted: false },
      { word: 'tecnologias', start: 0.496, end: 1.213, highlighted: false },
      { word: 'que', start: 1.224, end: 1.333, highlighted: false },
      { word: 'vão', start: 1.343, end: 1.506, highlighted: false },
      { word: 'redesenhar', start: 1.517, end: 2.006, highlighted: false },
      { word: 'o', start: 2.017, end: 2.097, highlighted: false },
      { word: 'mercado', start: 2.061, end: 2.539, highlighted: false },
      { word: 'até', start: 2.55, end: 2.724, highlighted: false },
      { word: 'dois', start: 2.735, end: 2.96, highlighted: false },
      { word: 'mil', start: 2.952, end: 3.072, highlighted: false },
      { word: 'e', start: 3.083, end: 3.163, highlighted: false },
      { word: 'trinta', start: 3.148, end: 3.55, highlighted: false },
    ];

    const groups = buildWordCaptionGroups(overlappingTtsWords, 3);
    expect(groups.length).toBe(4);

    for (let i = 0; i < groups.length; i++) {
      expect(groups[i].end).toBeGreaterThan(groups[i].start);
      if (i + 1 < groups.length) {
        expect(groups[i].end).toBeLessThanOrEqual(groups[i + 1].start);
      }
      for (let w = 0; w < groups[i].words.length - 1; w++) {
        expect(groups[i].words[w].end).toBeLessThanOrEqual(groups[i].words[w + 1].start);
      }
    }

    // Verifica todos os 3 projetos de exemplo (scene3d, kinetic, freeform)
    const projects = [
      createSimulacaoDemoProject(),
      createKineticTop5Project(),
      createFreeformDemoProject(),
    ];

    for (const proj of projects) {
      const globalWords = collectGlobalWordTimestamps(proj);
      const projGroups = buildWordCaptionGroups(globalWords, proj.captionStyle.wordsPerGroup);
      expect(projGroups.length).toBeGreaterThan(0);

      for (let i = 0; i < projGroups.length - 1; i++) {
        expect(projGroups[i].end).toBeLessThanOrEqual(projGroups[i + 1].start);
      }

      // Varredura temporal a cada 10ms garantindo no máximo 1 grupo visível por vez
      for (let t = 0; t <= proj.totalDuration; t += 0.01) {
        let activeCount = 0;
        for (let gIdx = 0; gIdx < projGroups.length; gIdx++) {
          const g = projGroups[gIdx];
          const nextStart = gIdx + 1 < projGroups.length ? projGroups[gIdx + 1].start : Infinity;
          const effectiveEnd = Math.min(g.end + 0.02, nextStart - 0.001);
          if (t >= g.start && t < effectiveEnd) {
            activeCount++;
          }
        }
        expect(activeCount).toBeLessThanOrEqual(1);
      }
    }
  });

  it('evita colisão entre zonas de layout (topo, meio-inferior/lower-third e base/legendas) e valida contagem regressiva #5->#1 do kinetic-top5', () => {
    const zones = computeOverlayLayoutZones(
      CaptionStyleSchema.parse({ positionY: 78, fontSize: 32 }),
      720,
      1280
    );
    expect(zones.top.maxBottomPx).toBeLessThan(zones.lowerMiddle.topPx);
    expect(zones.lowerMiddle.maxBottomPx + zones.minGapPx).toBeLessThanOrEqual(zones.bottom.topPx);

    const kin = createKineticTop5Project();
    const ranked = kin.kineticBlocks.filter((b) => b.rankNumber !== undefined);
    expect(ranked.map((b) => b.rankNumber)).toEqual([5, 4, 3, 2, 1]);
  });
});

describe('Camada de Serviço, Composer Multi-Engine e Pipeline Mock (@videos/core + @videos/composer)', () => {
  let tempRoot: string;
  let service: VideoService;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(tmpdir(), 'videos-test-'));
    service = new VideoService(tempRoot);
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('cria projetos nos 3 engines (scene3d, kinetic, freeform), valida e compõe HTML HyperFrames', async () => {
    // 1. scene3d
    const p3d = service.createProject({
      title: 'Teste Simulação 3D',
      engine: 'scene3d',
      sceneCount: 2,
    });
    expect(p3d.engine).toBe('scene3d');
    expect(p3d.scenes.length).toBe(2);
    expect(service.validateProject(p3d.id).valid).toBe(true);

    const comp3dDir = path.join(tempRoot, 'comp-3d');
    const art3d = await composeProject(p3d, service.listCharacters(), comp3dDir);
    expect(existsSync(art3d.indexHtmlPath)).toBe(true);
    const html3d = readFileSync(art3d.indexHtmlPath, 'utf8');
    expect(html3d).toContain('data-composition-id="main"');
    expect(html3d).toContain('window.__timelines["main"] = tl');
    expect(html3d).toContain('window.__seek = function(t)');

    // 2. kinetic
    const pKin = service.createProject({
      title: 'Teste Kinetic Top 5',
      engine: 'kinetic',
    });
    expect(pKin.engine).toBe('kinetic');
    expect(service.validateProject(pKin.id).valid).toBe(true);

    const compKinDir = path.join(tempRoot, 'comp-kin');
    const artKin = await composeProject(pKin, service.listCharacters(), compKinDir);
    expect(existsSync(artKin.indexHtmlPath)).toBe(true);

    // 3. freeform
    const pFree = service.createProject({
      title: 'Teste Freeform',
      engine: 'freeform',
    });
    expect(pFree.engine).toBe('freeform');
    expect(service.validateProject(pFree.id).valid).toBe(true);

    const compFreeDir = path.join(tempRoot, 'comp-free');
    const artFree = await composeProject(pFree, service.listCharacters(), compFreeDir);
    expect(existsSync(artFree.indexHtmlPath)).toBe(true);
  });

  it('executa pipeline com handlers mockados e lista as 13 integrações', async () => {
    service.registerPipelineHandlers({
      synthesizeAudio: async (projectId) => {
        return service.updateProject(projectId, { status: 'synthesized' });
      },
      renderVideo: async (projectId, jobId) => {
        return service.updateJob(jobId, {
          status: 'completed',
          stage: 'completed',
          progress: 100,
          outputMp4Path: `/tmp/${projectId}.mp4`,
        });
      },
    });

    const synth = await service.synthesizeAudio('simulacao-demo');
    expect(synth.status).toBe('synthesized');

    const job = await service.renderVideoSync('simulacao-demo');
    expect(job.status).toBe('completed');
    expect(job.progress).toBe(100);

    const integrations = service.listIntegrations();
    expect(integrations.length).toBe(13);
  });
});
