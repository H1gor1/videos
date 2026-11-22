import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VideoService, type Project } from '@kinema/core';
import { composeProject } from '@kinema/composer';
import { EditHistoryManager } from '../apps/web/src/editor/useEditHistory.ts';
import {
  buildCompositionSnapTarget,
  buildSafeAreaSnapTarget,
  resolveSnapAdjustment,
} from '../apps/web/src/editor/snapEngine.ts';
import {
  ALL_RESIZE_HANDLES,
  DragCommitSession,
  computeResizedRect720,
} from '../apps/web/src/editor/overlayDragSession.ts';
import { decimatePeaks, extractAudioPeaksFromBuffer } from '../apps/web/src/editor/AudioWaveform.tsx';

describe('Editor NLE: Histórico Undo/Redo, Snapping Magnético, Overrides 2D/3D e Design Kits', () => {
  let tempRoot: string;
  let service: VideoService;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(tmpdir(), 'kinema-editor-test-'));
    service = new VideoService(tempRoot);
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('executa Undo e Redo transacional restaurando estados anteriores do projeto com precisão', () => {
    const history = new EditHistoryManager<Project>(20);
    const p0 = service.getProject('simulacao-demo');
    expect(history.canUndo()).toBe(false);

    // Passo 1: arraste de overlay 2D
    const p1 = service.updateScene('simulacao-demo', p0.scenes[0].id, {
      overlays: p0.scenes[0].overlays.map((ov, idx) =>
        idx === 1 ? { ...ov, x: 180, y: 340, rotation: -8 } : ov
      ),
    });
    history.record('Arrastar badge 2D', p0, p1);
    expect(history.canUndo()).toBe(true);

    // Passo 2: mover personagem 3D com gizmo
    const p2 = service.updateScene('simulacao-demo', p0.scenes[0].id, {
      objectOverrides: {
        'character-main': {
          position: [0.55, 0.1, 0.4],
          rotation: [0, 0.35, 0],
          scale: [1.1, 1.1, 1.1],
          hidden: false,
        },
      },
    });
    history.record('Gizmo 3D character-main', p1, p2);

    // Undo #1 -> volta para p1 (sem override 3D, mas com badge em x=180, y=340)
    const undo1 = history.undo();
    expect(undo1).not.toBeNull();
    expect(undo1!.before.scenes[0].objectOverrides['character-main']).toBeUndefined();
    expect(undo1!.before.scenes[0].overlays[1].x).toBe(180);
    expect(history.canRedo()).toBe(true);

    // Undo #2 -> volta para p0 original
    const undo2 = history.undo();
    expect(undo2).not.toBeNull();
    expect(undo2!.before.scenes[0].overlays[1].x).toBeUndefined();
    expect(history.canUndo()).toBe(false);

    // Redo #1 -> reaplica p1
    const redo1 = history.redo();
    expect(redo1).not.toBeNull();
    expect(redo1!.after.scenes[0].overlays[1].x).toBe(180);
    expect(redo1!.after.scenes[0].overlays[1].y).toBe(340);
  });

  it('persiste overrides 2D (Figma), overrides 3D (TransformControls + Camera Keyframe) e divisão de clipe (Split S) no disco e na composição HTML', async () => {
    const proj = service.getProject('simulacao-demo');
    const sceneId = proj.scenes[0].id;

    // 1. Persiste edição 2D + 3D + Keyframe de Câmera
    const updatedOverlays = [...proj.scenes[0].overlays];
    updatedOverlays[1] = {
      ...updatedOverlays[1],
      x: 144,
      y: 312,
      width: 340,
      height: 52,
      rotation: -5,
      startOffset: 0.25,
      endOffset: 3.5,
    };

    service.updateScene('simulacao-demo', sceneId, {
      overlays: updatedOverlays,
      objectOverrides: {
        'character-main': {
          position: [0.42, 0.15, 0.65],
          rotation: [0, 0.48, 0],
          scale: [1.12, 1.12, 1.12],
          hidden: false,
        },
        'prop-0': {
          position: [-0.8, 1.5, -1.1],
          hidden: false,
        },
      },
      cameraOverride: {
        position: [0.85, 2.15, 8.9],
        target: [0, 1.4, 0],
        fov: 38,
      },
    });

    // Recarrega do disco com nova instância de VideoService para provar persistência em project.json
    const freshService = new VideoService(tempRoot);
    const reloaded = freshService.getProject('simulacao-demo');
    const sc0 = reloaded.scenes[0];

    expect(sc0.overlays[1].x).toBe(144);
    expect(sc0.overlays[1].y).toBe(312);
    expect(sc0.overlays[1].width).toBe(340);
    expect(sc0.overlays[1].rotation).toBe(-5);
    expect(sc0.objectOverrides['character-main']?.position).toEqual([0.42, 0.15, 0.65]);
    expect(sc0.cameraOverride?.position).toEqual([0.85, 2.15, 8.9]);

    // Compõe o HTML determinístico do HyperFrames e verifica que os overrides estão no runtime
    const compDir = path.join(tempRoot, 'comp-overrides');
    const artifact = await composeProject(reloaded, freshService.listCharacters(), compDir, {
      workspaceRoot: tempRoot,
    });
    expect(existsSync(artifact.indexHtmlPath)).toBe(true);
    const html = readFileSync(artifact.indexHtmlPath, 'utf8');
    expect(html).toContain('left:144px;top:312px;width:340px;height:52px');
    expect(html).toContain('rotation: -5');
    expect(html).toContain('"character-main":{"position":[0.42,0.15,0.65]');
    expect(html).toContain('"cameraOverride":{"position":[0.85,2.15,8.9]');

    // 2. Testa Split de cena (Atalho S na Timeline NLE)
    const countBefore = reloaded.scenes.length;
    const durBefore = sc0.duration;
    const afterSplit = freshService.splitScene('simulacao-demo', sceneId, 1.8);
    expect(afterSplit.scenes.length).toBe(countBefore + 1);
    expect(afterSplit.scenes[0].duration).toBe(1.8);
    expect(Number((afterSplit.scenes[0].duration + afterSplit.scenes[1].duration).toFixed(2))).toBe(
      durBefore
    );
  });

  it('calcula snapping magnético ao centro do canvas 9:16 e às bordas da safe area', () => {
    const targets = [
      buildCompositionSnapTarget({ left: 0, top: 0, width: 720, height: 1280 }),
      buildSafeAreaSnapTarget({ topPx: 64, bottomPx: 130, leftPx: 32, rightPx: 32 }, 720, 1280),
    ];

    // Um elemento de largura 320 movido para x=197 tem centerX = 357 (a 3px do centro 360px -> deve fazer snap para dx+3)
    const res = resolveSnapAdjustment({
      movingRect: { left: 100, top: 100, width: 320, height: 50 },
      proposedDx: 97, // proposed.left = 197, proposed.centerX = 357
      proposedDy: -33, // proposed.top = 67 (a 3px da safe area topPx = 64 -> deve fazer snap para 64)
      targets,
      compWidth: 720,
      compHeight: 1280,
    });

    expect(100 + res.dx).toBe(200); // centerX = 200 + 160 = 360
    expect(100 + res.dy).toBe(64); // topPx da safe area = 64
    expect(res.guides.length).toBeGreaterThanOrEqual(2);
  });

  it('aplica Design Kits contrastantes (simulacao-2030 vs editorial-minimal) mudando o visual da composição e valida conformidade', async () => {
    const kits = service.listDesignKits();
    expect(kits.map((k) => k.id)).toContain('simulacao-2030');
    expect(kits.map((k) => k.id)).toContain('editorial-minimal');

    // Renderiza composição com Kit 1: simulacao-2030
    service.applyDesignKit('simulacao-demo', 'simulacao-2030');
    const pSim = service.getProject('simulacao-demo');
    const dirSim = path.join(tempRoot, 'comp-kit-sim');
    const artSim = await composeProject(pSim, service.listCharacters(), dirSim, {
      workspaceRoot: tempRoot,
    });
    const htmlSim = readFileSync(artSim.indexHtmlPath, 'utf8');
    expect(htmlSim).toContain('--dk-primary: #f5c518');
    expect(htmlSim).toContain('--dk-heading-font: "Anton"');

    // Aplica Kit 2 contrastante: editorial-minimal ao mesmo projeto sem editar cena por cena
    service.applyDesignKit('simulacao-demo', 'editorial-minimal');
    const pEd = service.getProject('simulacao-demo');
    expect(pEd.designKitId).toBe('editorial-minimal');
    expect(pEd.captionStyle.highlightColor).toBe('#c84b31');

    const dirEd = path.join(tempRoot, 'comp-kit-ed');
    const artEd = await composeProject(pEd, service.listCharacters(), dirEd, {
      workspaceRoot: tempRoot,
    });
    const htmlEd = readFileSync(artEd.indexHtmlPath, 'utf8');
    expect(htmlEd).toContain('--dk-primary: #c84b31');
    expect(htmlEd).toContain('--dk-bg: #f4ecdf');
    expect(htmlEd).toContain('--dk-heading-font: "Bebas Neue"');
    expect(htmlEd).not.toEqual(htmlSim);

    // Introduz violações deliberadas do Design Kit (cor fora da paleta, fonte proibida e posição fora da safe area)
    const sc0 = pEd.scenes[0];
    service.updateScene('simulacao-demo', sc0.id, {
      overlays: [
        {
          ...sc0.overlays[0],
          textColor: '#00ff11', // Cor fora da paleta do Editorial Minimal
          fontFamily: 'Comic Sans MS', // Fonte não permitida
          x: 4, // Fora da safe area esquerda (40px)
          y: 12, // Fora da safe area topo (72px)
        },
      ],
    });

    const validation = service.validateProject('simulacao-demo');
    expect(validation.designKitId).toBe('editorial-minimal');
    const messages = validation.issues.map((i) => i.message).join(' | ');
    expect(messages).toContain('#00ff11');
    expect(messages).toContain('Comic Sans MS');
    expect(messages).toContain('safe area');
  });

  it('DragCommitSession aplica updates ao vivo sem commitar, faz 1 único commit no pointerup e 0 no cancel (Esc)', () => {
    const history = new EditHistoryManager<Project>(20);
    const p0 = service.getProject('simulacao-demo');
    const sceneId = p0.scenes[0].id;
    const liveFrames: Array<{ x: number; y: number }> = [];
    const commits: Array<{ x: number; y: number }> = [];
    let currentLive = { x: p0.scenes[0].overlays[0].x ?? 40, y: p0.scenes[0].overlays[0].y ?? 60 };

    // 1. Sessão normal: múltiplos moves -> 1 único commit ao finalizar
    const session = new DragCommitSession<{ x: number; y: number }>({
      onLiveUpdate: (patch) => {
        currentLive = patch;
        liveFrames.push(patch);
      },
      onCommit: (patch) => {
        commits.push(patch);
        const before = service.getProject('simulacao-demo');
        const updated = service.updateScene('simulacao-demo', sceneId, {
          overlays: before.scenes[0].overlays.map((ov, idx) =>
            idx === 0 ? { ...ov, x: patch.x, y: patch.y } : ov
          ),
        });
        history.record('Mover overlay', before, updated);
      },
      onCancel: () => {
        currentLive = { x: p0.scenes[0].overlays[0].x ?? 40, y: p0.scenes[0].overlays[0].y ?? 60 };
      },
    });

    session.update({ x: 110, y: 120 });
    session.update({ x: 145, y: 175 });
    session.update({ x: 192, y: 244 });
    expect(liveFrames).toHaveLength(3);
    expect(commits).toHaveLength(0);
    expect(history.canUndo()).toBe(false);

    const committed = session.finish();
    expect(committed).toBe(true);
    expect(commits).toEqual([{ x: 192, y: 244 }]);
    expect(history.canUndo()).toBe(true);

    // Undo restaura o estado anterior de uma vez só (única entrada no histórico)
    const undoSnap = history.undo();
    expect(undoSnap?.before.scenes[0].overlays[0].x).toBe(p0.scenes[0].overlays[0].x);
    expect(history.canUndo()).toBe(false);

    // 2. Sessão cancelada com Esc: nenhuma mutação persistida nem entrada no histórico
    const cancelSession = new DragCommitSession<{ x: number; y: number }>({
      onLiveUpdate: (patch) => {
        currentLive = patch;
      },
      onCommit: (patch) => {
        commits.push(patch);
      },
      onCancel: () => {
        currentLive = { x: 40, y: 60 };
      },
    });
    cancelSession.update({ x: 300, y: 400 });
    cancelSession.cancel();
    expect(cancelSession.finish()).toBe(false);
    expect(commits).toHaveLength(1);
    expect(currentLive).toEqual({ x: 40, y: 60 });
  });

  it('computeResizedRect720 suporta os 8 handles com âncora oposta e clamp mínimo', () => {
    expect(ALL_RESIZE_HANDLES).toEqual(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);
    const base = { left: 100, top: 200, width: 300, height: 100 };

    const se = computeResizedRect720(base, 'se', 50, 40);
    expect(se).toEqual({ left: 100, top: 200, width: 350, height: 140 });

    const nw = computeResizedRect720(base, 'nw', 20, 15);
    expect(nw).toEqual({ left: 120, top: 215, width: 280, height: 85 });

    // Clamp mínimo 96x36 quando puxa além da largura/altura mínima
    const clamped = computeResizedRect720(base, 'nw', 500, 500);
    expect(clamped).toEqual({ left: 304, top: 264, width: 96, height: 36 });
  });

  it('extractAudioPeaksFromBuffer e decimatePeaks extraem picos normalizados do áudio real', () => {
    // 48 amostras divididas em 24 bins: primeira metade baixa (0.25), segunda metade pico máximo (1.0)
    const ch0 = new Float32Array(48);
    for (let i = 0; i < 24; i++) ch0[i] = 0.25;
    for (let i = 24; i < 48; i++) ch0[i] = -1.0;
    const fakeBuffer = {
      numberOfChannels: 1,
      length: ch0.length,
      getChannelData: () => ch0,
    } as unknown as AudioBuffer;
    const peaks = extractAudioPeaksFromBuffer(fakeBuffer, 24);
    expect(peaks).toHaveLength(24);
    expect(peaks[0]).toBeCloseTo(0.25, 4);
    expect(peaks[23]).toBeCloseTo(1.0, 4);

    const slice = decimatePeaks(peaks, 0.5, 1, 2);
    expect(slice[0]).toBeCloseTo(1.0, 4);
    expect(slice[1]).toBeCloseTo(1.0, 4);
  });
});
