/**
 * Workspace do Editor de Vídeo NLE Multitrilha + Canvas Visual 2D/3D (Adaptado de OpenMotion Studio — Apache-2.0)
 * Origem: /home/higorlino/openmotion/studio/src/components/EditorShell.tsx, DomEditOverlay.tsx,
 *         LayersPanel.tsx, PropertyPanel.tsx e TimelinePane.tsx.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CameraKeyframeOverride,
  CameraPreset,
  Character,
  CharacterPose,
  DesignKit,
  KineticBlock,
  LibraryItem,
  OverlayItem,
  Project,
  Scene,
  SceneObjectOverride,
  StageTemplateId,
  StageTemplateMetadata,
  TransitionType,
  ValidationResult,
} from '@kinema/core';
import { buildWordCaptionGroups, computeOverlayLayoutZones } from '@kinema/overlays';
import {
  defaultOverlayRect720,
  ThreeViewport,
  type LiveObject3DTransform,
  type Scene3DObjectDescriptor,
} from '../components/ThreeViewport.tsx';
import { AudioWaveform, decimatePeaks, extractAudioPeaksFromBuffer } from './AudioWaveform.tsx';
import { useEditHistory } from './useEditHistory.ts';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowGoBack,
  ArrowGoForward,
  ArrowUp,
  ArrowsOutCardinal,
  Box3D,
  Camera,
  CheckCircleIcon,
  ClosedCaptioning,
  Code,
  Eye,
  EyeSlash,
  FastForward,
  FilmSlate,
  Lightbulb,
  Magnet,
  Microphone,
  MusicNote,
  Pause,
  Play,
  Rewind,
  Scissors,
  ShapeBox,
  ShieldCheck,
  SkipLeft,
  SpeakerHigh,
  SpeakerLow,
  SpeakerSlash,
  Trash,
} from '../design-system/react/RemixIcons.tsx';

const POSES: CharacterPose[] = [
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
  'play-piano',
  'play-guitar',
  'conduct',
  'sing',
];

const CAMERAS: CameraPreset[] = [
  'static',
  'dolly-in',
  'orbit',
  'pan',
  'shake',
  'close-face',
];

const TRANSITIONS: TransitionType[] = ['cut', 'whip', 'fade', 'zoom'];
const SFX_LIST: Scene['sfx'][] = ['none', 'whoosh', 'ding', 'alarm', 'lever', 'cheer', 'coin', 'pop'];

function computeAudioSignature(p: Project): string {
  const parts =
    p.engine === 'scene3d'
      ? p.scenes.map((s) => `${s.id}|${s.duration}|${s.narration}|${s.sfx}`)
      : p.engine === 'kinetic'
        ? p.kineticBlocks.map((b) => `${b.id}|${b.duration}|${b.narration}|${b.sfx}`)
        : [p.freeform ? `${p.freeform.duration}|${p.freeform.narration}` : 'freeform'];
  return JSON.stringify({
    parts,
    voice: p.voice,
    musicTrack: p.renderSettings.musicTrack,
    musicVolume: p.renderSettings.musicVolume,
    sfxVolume: p.renderSettings.sfxVolume,
  });
}

export interface NleEditorWorkspaceProps {
  project: Project;
  characters: Character[];
  templates: StageTemplateMetadata[];
  designKits: DesignKit[];
  libraryItems: LibraryItem[];
  audioRevision?: number;
  onProjectUpdated: (project: Project) => void;
  onSynthesizeAudio: (projectId: string) => Promise<void>;
  onStartRender: (projectId: string) => Promise<void>;
  onOpenDesignKits: () => void;
  showNotice: (msg: string) => void;
}

export const NleEditorWorkspace: React.FC<NleEditorWorkspaceProps> = ({
  project,
  characters,
  templates,
  designKits,
  libraryItems,
  audioRevision = 0,
  onProjectUpdated,
  onSynthesizeAudio,
  onStartRender,
  onOpenDesignKits,
  showNotice,
}) => {
  // Estado de reprodução e timeline NLE
  const [playhead, setPlayhead] = useState<number>(0);
  const playheadRef = useRef<number>(0);
  playheadRef.current = playhead;
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [pxPerSec, setPxPerSec] = useState<number>(58);
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [showSafeAreas, setShowSafeAreas] = useState<boolean>(true);

  // Estado de áudio master sincronizado (HTMLAudioElement como relógio mestre)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioVersion, setAudioVersion] = useState<number>(0);
  const [audioStatus, setAudioStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [masterAudioUrl, setMasterAudioUrl] = useState<string | null>(null);
  const [masterPeaks, setMasterPeaks] = useState<number[] | null>(null);
  const [voicePeaks, setVoicePeaks] = useState<number[] | null>(null);
  const [audioVolume, setAudioVolume] = useState<number>(1);
  const [audioMuted, setAudioMuted] = useState<boolean>(false);
  const [synthesizingAudio, setSynthesizingAudio] = useState<boolean>(false);
  const synthesizedSigRef = useRef<{ projectId: string; sig: string } | null>(null);

  // Estado ao vivo durante arraste/resize/rotate 2D, Gizmo 3D e Timeline (60fps, sem poluir histórico)
  const [liveOverlayTransforms, setLiveOverlayTransforms] = useState<Record<number, Partial<OverlayItem>>>({});
  const [liveObject3DTransform, setLiveObject3DTransform] = useState<LiveObject3DTransform | null>(null);
  const [liveSceneDurations, setLiveSceneDurations] = useState<Record<number, number>>({});
  const [liveOverlaySpans, setLiveOverlaySpans] = useState<Record<string, { startOffset: number; endOffset: number }>>({});

  // Ferramenta ativa no canvas central: '2d' (Figma overlays), '3d' (Gizmo TransformControls), 'camera' (Orbit 3D), 'code' (HTML/JSON avançado)
  const [canvasTool, setCanvasTool] = useState<'2d' | '3d' | 'camera' | 'code'>('2d');
  const [gizmoMode, setGizmoMode] = useState<'translate' | 'rotate' | 'scale'>('translate');

  // Seleção ativa (cena, overlays 2D, objeto 3D)
  const [activeSceneIdx, setActiveSceneIdx] = useState<number>(0);
  const [selectedOverlayIndices, setSelectedOverlayIndices] = useState<number[]>([0]);
  const [selectedObject3DId, setSelectedObject3DId] = useState<string | null>('character-main');
  const [objects3DCatalog, setObjects3DCatalog] = useState<Scene3DObjectDescriptor[]>([]);

  // Abas laterais
  const [leftTab, setLeftTab] = useState<'scenes' | 'overlays' | 'blocks' | 'audio'>('overlays');
  const [rightTab, setRightTab] = useState<'inspector' | 'layers' | 'validation'>('inspector');
  const [blockSearch, setBlockSearch] = useState<string>('');

  // Código HTML/JSON sincronizado (modo avançado)
  const [codeDraft, setCodeDraft] = useState<string>('');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  const rulerRef = useRef<HTMLDivElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const [canvasFitScale, setCanvasFitScale] = useState<number>(1);
  const [zoomMode, setZoomMode] = useState<'fit' | number>('fit');
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const spaceHeldRef = useRef<boolean>(false);
  const spacePanUsedRef = useRef<boolean>(false);

  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const updateScale = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const fit = Math.min((rect.height - 8) / 640, (rect.width - 16) / 360);
      setCanvasFitScale(Math.max(0.3, Number(fit.toFixed(4))));
    };
    updateScale();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateScale);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  const effectiveScale = zoomMode === 'fit' ? canvasFitScale : zoomMode * 2;
  const displayZoomPct = Math.round(effectiveScale * 50);
  const canPanPreview = zoomMode !== 'fit' && effectiveScale > canvasFitScale + 0.01;

  useEffect(() => {
    if (zoomMode === 'fit') {
      setPanOffset({ x: 0, y: 0 });
    }
  }, [zoomMode]);

  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const curFactor = zoomMode === 'fit' ? canvasFitScale / 2 : zoomMode;
      const step = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const next = Math.max(0.25, Math.min(2.5, Number((curFactor * step).toFixed(3))));
      setZoomMode(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomMode, canvasFitScale]);

  const activeDesignKit = useMemo(
    () =>
      designKits.find((k) => k.id === (project.designKitId || 'simulacao-2030')) ||
      designKits[0],
    [designKits, project.designKitId]
  );

  // Calcula intervalos de tempo globais de cada cena/bloco (respeitando trim ao vivo)
  const sceneSpans = useMemo(() => {
    const spans: Array<{
      index: number;
      id: string;
      label: string;
      start: number;
      end: number;
      duration: number;
      scene?: Scene;
      kineticBlock?: KineticBlock;
    }> = [];
    let cursor = 0;
    if (project.engine === 'scene3d') {
      project.scenes.forEach((sc, idx) => {
        const start = Number(cursor.toFixed(2));
        const dur = Number((liveSceneDurations[idx] ?? sc.duration ?? 4.0).toFixed(2));
        spans.push({
          index: idx,
          id: sc.id,
          label: `${idx + 1}. ${sc.template}`,
          start,
          end: Number((start + dur).toFixed(2)),
          duration: dur,
          scene: sc,
        });
        cursor += dur;
      });
    } else if (project.engine === 'kinetic') {
      project.kineticBlocks.forEach((kb, idx) => {
        const start = Number(cursor.toFixed(2));
        const dur = Number((liveSceneDurations[idx] ?? kb.duration ?? 3.6).toFixed(2));
        spans.push({
          index: idx,
          id: kb.id,
          label: `${idx + 1}. ${kb.headline.slice(0, 18)}`,
          start,
          end: Number((start + dur).toFixed(2)),
          duration: dur,
          kineticBlock: kb,
        });
        cursor += dur;
      });
    } else if (project.engine === 'freeform' && project.freeform) {
      spans.push({
        index: 0,
        id: 'freeform-main',
        label: 'Composição Freeform HTML',
        start: 0,
        end: project.freeform.duration || 12,
        duration: project.freeform.duration || 12,
      });
      cursor = project.freeform.duration || 12;
    }
    return { spans, totalDuration: Math.max(1, Number(cursor.toFixed(2))) };
  }, [project, liveSceneDurations]);

  const totalDuration = sceneSpans.totalDuration;
  const currentAudioSig = useMemo(() => computeAudioSignature(project), [project]);

  // Recarrega o mix master + picos reais via Web Audio API (decodeAudioData) quando projeto/áudio muda
  useEffect(() => {
    if (audioRevision > 0) {
      synthesizedSigRef.current = { projectId: project.id, sig: currentAudioSig };
      setAudioVersion((v) => v + 1);
    }
  }, [audioRevision]);

  useEffect(() => {
    let cancelled = false;
    const rev = audioVersion;
    const masterUrl = `/project-files/${project.id}/audio/mixed-master.wav?v=${rev}`;
    const voiceUrl = `/project-files/${project.id}/audio/mixed-master.voice.wav?v=${rev}`;

    setAudioStatus('loading');

    const loadAudioAndPeaks = async () => {
      try {
        const res = await fetch(masterUrl, { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) {
            setAudioStatus('missing');
            setMasterAudioUrl(null);
            setMasterPeaks(null);
            setVoicePeaks(null);
          }
          return;
        }
        const masterBuf = await res.arrayBuffer();
        if (cancelled) return;

        setMasterAudioUrl(masterUrl);
        setAudioStatus('ready');

        if (!synthesizedSigRef.current || synthesizedSigRef.current.projectId !== project.id) {
          synthesizedSigRef.current = { projectId: project.id, sig: computeAudioSignature(project) };
        }

        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;

        const ctx = new AudioCtx();
        try {
          const decodedMaster = await ctx.decodeAudioData(masterBuf.slice(0));
          if (!cancelled) {
            setMasterPeaks(extractAudioPeaksFromBuffer(decodedMaster, 420));
          }

          try {
            const vRes = await fetch(voiceUrl, { cache: 'no-store' });
            if (vRes.ok && !cancelled) {
              const voiceBuf = await vRes.arrayBuffer();
              const decodedVoice = await ctx.decodeAudioData(voiceBuf);
              if (!cancelled) {
                setVoicePeaks(extractAudioPeaksFromBuffer(decodedVoice, 420));
              }
            } else if (!cancelled) {
              setVoicePeaks(null);
            }
          } catch {
            if (!cancelled) setVoicePeaks(null);
          }
        } catch {
          // Áudio toca normalmente mesmo se decodeAudioData não estiver disponível
        } finally {
          void ctx.close().catch(() => {});
        }
      } catch {
        if (!cancelled) {
          setAudioStatus('missing');
          setMasterAudioUrl(null);
        }
      }
    };

    void loadAudioAndPeaks();
    return () => {
      cancelled = true;
    };
  }, [project.id, audioVersion]);

  const isAudioOutdated =
    audioStatus === 'ready' &&
    synthesizedSigRef.current?.projectId === project.id &&
    currentAudioSig !== synthesizedSigRef.current.sig;

  // Sincroniza volume/mute no HTMLAudioElement mestre
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = audioMuted;
    audio.volume = Math.max(0, Math.min(1, audioVolume));
  }, [audioVolume, audioMuted, masterAudioUrl]);

  // Seek determinístico sincronizado entre playhead visual e HTMLAudioElement mestre
  const seekTo = useCallback(
    (timeSec: number) => {
      const clamped = Math.max(0, Math.min(totalDuration, Number(timeSec.toFixed(3))));
      setPlayhead(clamped);
      const audio = audioRef.current;
      if (audio && audioStatus === 'ready') {
        try {
          const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : totalDuration;
          audio.currentTime = Math.max(0, Math.min(dur, clamped));
        } catch {
          // Aguarda metadata
        }
      }
    },
    [totalDuration, audioStatus]
  );

  const handleTriggerSynthesizeAudio = useCallback(async () => {
    if (synthesizingAudio) return;
    setSynthesizingAudio(true);
    try {
      await onSynthesizeAudio(project.id);
      synthesizedSigRef.current = { projectId: project.id, sig: computeAudioSignature(project) };
      setAudioVersion((v) => v + 1);
    } finally {
      setSynthesizingAudio(false);
    }
  }, [synthesizingAudio, onSynthesizeAudio, project]);

  // Mantém activeSceneIdx sincronizado quando o playhead cruza fronteiras de cena durante playback
  useEffect(() => {
    const found = sceneSpans.spans.find(
      (sp) => playhead >= sp.start && playhead < sp.end - 0.02
    );
    if (found && found.index !== activeSceneIdx) {
      setActiveSceneIdx(found.index);
    }
  }, [playhead, sceneSpans.spans, activeSceneIdx]);

  const activeSpan =
    sceneSpans.spans[Math.min(activeSceneIdx, Math.max(0, sceneSpans.spans.length - 1))] || null;
  const activeScene = activeSpan?.scene || null;
  const activeKineticBlock = activeSpan?.kineticBlock || null;
  const localSceneTime = activeSpan ? Math.max(0, playhead - activeSpan.start) : 0;

  const activeCharacter = useMemo(() => {
    const cid = activeScene?.characterId || 'marco-silva';
    return characters.find((c) => c.id === cid) || characters[0];
  }, [characters, activeScene?.characterId]);

  // Sincroniza rascunho de código HTML/JSON quando o projeto muda
  useEffect(() => {
    if (project.engine === 'freeform' && project.freeform) {
      setCodeDraft(project.freeform.html);
    } else if (project.engine === 'scene3d' && activeScene) {
      setCodeDraft(JSON.stringify(activeScene, null, 2));
    } else if (project.engine === 'kinetic' && activeKineticBlock) {
      setCodeDraft(JSON.stringify(activeKineticBlock, null, 2));
    }
  }, [project.id, project.engine, project.updatedAt, activeSceneIdx]);

  // Persistência centralizada via VideoService REST API + Histórico de Undo/Redo
  const persistProjectState = useCallback(
    async (nextProject: Project, noticeMsg?: string) => {
      const res = await fetch(`/api/projects/${nextProject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: nextProject.title,
          designKitId: nextProject.designKitId,
          captionStyle: nextProject.captionStyle,
          renderSettings: nextProject.renderSettings,
          scenes: nextProject.scenes,
          kineticBlocks: nextProject.kineticBlocks,
          freeform: nextProject.freeform,
        }),
      }).then((r) => r.json());
      onProjectUpdated(res);
      if (noticeMsg) showNotice(noticeMsg);
      return res as Project;
    },
    [onProjectUpdated, showNotice]
  );

  const editHistory = useEditHistory(async (restoredProject, actionLabel) => {
    await persistProjectState(restoredProject, actionLabel);
  });

  const commitProjectMutation = useCallback(
    async (mutator: (draft: Project) => void, label: string) => {
      const before = structuredClone(project);
      const after = structuredClone(project);
      mutator(after);
      editHistory.recordEdit(label, before, after);
      await persistProjectState(after, label);
    },
    [project, editHistory, persistProjectState]
  );

  // Commits específicos para Cena, Overlays 2D e Objetos 3D
  const handleUpdateActiveScene = useCallback(
    async (patch: Partial<Scene>, label = 'Atualizar cena') => {
      if (!activeScene) return;
      await commitProjectMutation((draft) => {
        const idx = draft.scenes.findIndex((s) => s.id === activeScene.id);
        if (idx >= 0) {
          draft.scenes[idx] = { ...draft.scenes[idx], ...patch };
        }
      }, label);
    },
    [activeScene, commitProjectMutation]
  );

  const handleOverlayCommit = useCallback(
    async (overlayIdx: number, patch: Partial<OverlayItem>, label = 'Editar overlay 2D') => {
      if (!activeScene) return;
      await commitProjectMutation((draft) => {
        const sc = draft.scenes.find((s) => s.id === activeScene.id);
        if (!sc || !sc.overlays[overlayIdx]) return;
        sc.overlays[overlayIdx] = {
          ...sc.overlays[overlayIdx],
          ...patch,
        } as OverlayItem;
      }, label);
    },
    [activeScene, commitProjectMutation]
  );

  const handleOverlaysPatchBatchCommit = useCallback(
    async (
      patches: Array<{ index: number; patch: Partial<OverlayItem> }>,
      label = 'Mover overlays 2D'
    ) => {
      if (!activeScene || patches.length === 0) return;
      await commitProjectMutation((draft) => {
        const sc = draft.scenes.find((s) => s.id === activeScene.id);
        if (!sc) return;
        for (const item of patches) {
          if (sc.overlays[item.index]) {
            sc.overlays[item.index] = {
              ...sc.overlays[item.index],
              ...item.patch,
            } as OverlayItem;
          }
        }
      }, label);
    },
    [activeScene, commitProjectMutation]
  );

  const handleObject3DCommit = useCallback(
    async (objectId: string, override: SceneObjectOverride, label = 'Transformar objeto 3D') => {
      if (!activeScene) return;
      await commitProjectMutation((draft) => {
        const sc = draft.scenes.find((s) => s.id === activeScene.id);
        if (!sc) return;
        sc.objectOverrides = {
          ...(sc.objectOverrides || {}),
          [objectId]: override,
        };
      }, label);
    },
    [activeScene, commitProjectMutation]
  );

  const handleCameraKeyframeCommit = useCallback(
    async (cameraOverride: CameraKeyframeOverride | undefined, label = 'Salvar câmera 3D') => {
      if (!activeScene) return;
      await commitProjectMutation((draft) => {
        const sc = draft.scenes.find((s) => s.id === activeScene.id);
        if (!sc) return;
        sc.cameraOverride = cameraOverride;
      }, label);
    },
    [activeScene, commitProjectMutation]
  );

  // Dividir clipe no playhead (Atalho S / Botão Razor)
  const handleSplitAtPlayhead = useCallback(async () => {
    if (!activeSpan) return;
    const offset = Number((playhead - activeSpan.start).toFixed(2));
    if (offset < 0.8 || offset > activeSpan.duration - 0.8) {
      showNotice('Posicione a agulha (playhead) a pelo menos 0.8s das bordas do clipe para dividir.');
      return;
    }
    const before = structuredClone(project);
    const res = await fetch(`/api/projects/${project.id}/scenes/${activeSpan.id}/split`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ splitOffsetSeconds: offset }),
    }).then((r) => r.json());
    editHistory.recordEdit(`Dividir clipe ${activeSpan.id} em ${offset}s`, before, res);
    onProjectUpdated(res);
    showNotice(`Clipe dividido em duas cenas no instante ${playhead.toFixed(2)}s!`);
  }, [activeSpan, playhead, project, editHistory, onProjectUpdated, showNotice]);

  // Excluir seleção ativa (Delete / Backspace)
  const handleDeleteSelection = useCallback(async () => {
    if (canvasTool === '2d' && activeScene && selectedOverlayIndices.length > 0) {
      const toRemove = new Set(selectedOverlayIndices);
      await commitProjectMutation((draft) => {
        const sc = draft.scenes.find((s) => s.id === activeScene.id);
        if (!sc) return;
        sc.overlays = sc.overlays.filter((_, idx) => !toRemove.has(idx));
      }, 'Excluir overlay(s) 2D');
      setSelectedOverlayIndices([]);
      return;
    }
    if (canvasTool === '3d' && activeScene && selectedObject3DId) {
      const currOv = activeScene.objectOverrides?.[selectedObject3DId] || { hidden: false };
      await handleObject3DCommit(
        selectedObject3DId,
        { ...currOv, hidden: !currOv.hidden },
        `Alternar visibilidade 3D (${selectedObject3DId})`
      );
    }
  }, [
    canvasTool,
    activeScene,
    selectedOverlayIndices,
    selectedObject3DId,
    commitProjectMutation,
    handleObject3DCommit,
  ]);

  // Loop de reprodução da timeline NLE com HTMLAudioElement como RELÓGIO MESTRE (suporta J/K/L shuttle)
  useEffect(() => {
    const audio = audioRef.current;

    if (!isPlaying) {
      if (audio && !audio.paused) {
        audio.pause();
        setPlayhead(Number(audio.currentTime.toFixed(3)));
      }
      return;
    }

    let raf = 0;
    let cancelled = false;
    const useAudioMaster = Boolean(audio && audioStatus === 'ready' && masterAudioUrl && playbackRate > 0);

    if (useAudioMaster && audio) {
      try {
        audio.playbackRate = playbackRate;
        const audioDur =
          Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : totalDuration;
        if (Math.abs(audio.currentTime - playheadRef.current) > 0.04) {
          audio.currentTime = Math.max(0, Math.min(Math.max(0, audioDur - 0.01), playheadRef.current));
        }
      } catch {
        // Ignora caso metadata ainda esteja carregando
      }

      void audio.play().catch(() => {
        // Autoplay bloqueado sem gesto: mantém rAF se necessário
      });

      const stepFromAudio = () => {
        if (cancelled) return;
        const t = audio.currentTime;
        if (audio.ended || t >= totalDuration) {
          audio.currentTime = 0;
          setPlayhead(0);
          void audio.play().catch(() => {});
        } else {
          setPlayhead(Number(t.toFixed(3)));
        }
        raf = requestAnimationFrame(stepFromAudio);
      };
      raf = requestAnimationFrame(stepFromAudio);

      return () => {
        cancelled = true;
        cancelAnimationFrame(raf);
        if (!audio.paused) {
          audio.pause();
          setPlayhead(Number(audio.currentTime.toFixed(3)));
        }
      };
    }

    // Fallback (sem áudio sintetizado ainda ou shuttle reverso J < 0)
    if (audio && !audio.paused) {
      audio.pause();
    }
    let last = performance.now();
    const stepTimer = (now: number) => {
      if (cancelled) return;
      const dt = ((now - last) / 1000) * playbackRate;
      last = now;
      setPlayhead((prev) => {
        let next = prev + dt;
        if (next >= totalDuration) next = 0;
        if (next < 0) next = totalDuration;
        const clamped = Number(next.toFixed(3));
        if (audio && audioStatus === 'ready') {
          try {
            audio.currentTime = clamped;
          } catch {
            // noop
          }
        }
        return clamped;
      });
      raf = requestAnimationFrame(stepTimer);
    };
    raf = requestAnimationFrame(stepTimer);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [isPlaying, playbackRate, totalDuration, audioStatus, masterAudioUrl]);

  // Atalhos globais de teclado do Editor NLE (Espaço, J/K/L, S, Delete, Ctrl+Z, Ctrl+Shift+Z, Setas)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      // Ctrl+Z / Ctrl+Shift+Z funcionam mesmo fora do canvas
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (isInput) return;
        e.preventDefault();
        if (e.shiftKey) {
          void editHistory.redo();
        } else {
          void editHistory.undo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        if (isInput) return;
        e.preventDefault();
        void editHistory.redo();
        return;
      }

      if (isInput) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (!spaceHeldRef.current) {
          spaceHeldRef.current = true;
          spacePanUsedRef.current = false;
          setIsSpacePressed(true);
        }
      } else if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPlaying(false);
        setPlaybackRate(1);
      } else if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setIsPlaying(true);
        setPlaybackRate((r) => (r < 1 ? 1 : r >= 2 ? 1 : 1.5));
      } else if (e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setIsPlaying(true);
        setPlaybackRate(-1.25);
      } else if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        void handleSplitAtPlayhead();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        void handleDeleteSelection();
      } else if (
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) &&
        activeScene &&
        selectedOverlayIndices.length > 0 &&
        canvasTool === '2d'
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 2;
        const idx = selectedOverlayIndices[0];
        const ov = activeScene.overlays[idx];
        if (!ov) return;
        const curX = ov.x ?? 60;
        const curY = ov.y ?? 100;
        const nx =
          e.key === 'ArrowLeft' ? curX - step : e.key === 'ArrowRight' ? curX + step : curX;
        const ny = e.key === 'ArrowUp' ? curY - step : e.key === 'ArrowDown' ? curY + step : curY;
        void handleOverlayCommit(idx, { x: nx, y: ny }, 'Nudge overlay 2D');
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && spaceHeldRef.current) {
        e.preventDefault();
        spaceHeldRef.current = false;
        setIsSpacePressed(false);
        if (!spacePanUsedRef.current) {
          setPlaybackRate(1);
          setIsPlaying((p) => !p);
        }
        spacePanUsedRef.current = false;
      }
    };

    const onWindowBlur = () => {
      spaceHeldRef.current = false;
      spacePanUsedRef.current = false;
      setIsSpacePressed(false);
      setIsPanning(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [
    editHistory,
    handleSplitAtPlayhead,
    handleDeleteSelection,
    activeScene,
    selectedOverlayIndices,
    canvasTool,
    handleOverlayCommit,
  ]);

  // Scrubbing na régua de tempo (atualiza playhead + audio.currentTime)
  const handleRulerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const bar = rulerRef.current;
    if (!bar) return;
    const updateFromClientX = (clientX: number) => {
      const rect = bar.getBoundingClientRect();
      const x = Math.max(0, clientX - rect.left);
      const rawSec = x / pxPerSec;
      const snapped = snapEnabled ? Math.round(rawSec * 10) / 10 : rawSec;
      seekTo(snapped);
    };
    updateFromClientX(e.clientX);
    const onMove = (ev: PointerEvent) => updateFromClientX(ev.clientX);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Aparar (Trim) a duração de uma cena diretamente na trilha V1 (com feedback visual 60fps + Esc cancel + commit único)
  const startSceneTrimDrag = (sceneIdx: number, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const span = sceneSpans.spans[sceneIdx];
    if (!span) return;
    const startX = e.clientX;
    const initialDur = span.duration;
    let latestDur = initialDur;
    let cancelled = false;
    let rafId = 0;

    const cleanup = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKeyDown);
    };

    const onMove = (ev: PointerEvent) => {
      if (cancelled) return;
      const dt = (ev.clientX - startX) / pxPerSec;
      const raw = Math.max(1.5, Math.min(25, initialDur + dt));
      latestDur = snapEnabled ? Math.round(raw * 4) / 4 : Number(raw.toFixed(2));
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (!cancelled) {
          setLiveSceneDurations((prev) => ({ ...prev, [sceneIdx]: latestDur }));
        }
      });
    };

    const onCancel = () => {
      cancelled = true;
      cleanup();
      setLiveSceneDurations((prev) => {
        const copy = { ...prev };
        delete copy[sceneIdx];
        return copy;
      });
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        onCancel();
      }
    };

    const onUp = () => {
      if (cancelled) return;
      cleanup();
      setLiveSceneDurations((prev) => {
        const copy = { ...prev };
        delete copy[sceneIdx];
        return copy;
      });
      if (Math.abs(latestDur - initialDur) >= 0.1) {
        void commitProjectMutation((draft) => {
          if (draft.engine === 'scene3d' && draft.scenes[sceneIdx]) {
            draft.scenes[sceneIdx].duration = latestDur;
          } else if (draft.engine === 'kinetic' && draft.kineticBlocks[sceneIdx]) {
            draft.kineticBlocks[sceneIdx].duration = latestDur;
          }
        }, `Aparar duração de ${span.id} para ${latestDur}s`);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKeyDown);
  };

  // Mover / Aparar clipe de Overlay 2D na trilha V2 (com feedback visual 60fps + Esc cancel + commit único)
  const startOverlayTimelineDrag = (
    sceneIdx: number,
    overlayIdx: number,
    mode: 'move' | 'trim-end',
    e: React.PointerEvent
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const sc = project.scenes[sceneIdx];
    const ov = sc?.overlays[overlayIdx];
    if (!sc || !ov) return;

    const spanKey = `${sceneIdx}-${overlayIdx}`;
    const startX = e.clientX;
    const initStart = ov.startOffset ?? 0;
    const initEnd = ov.endOffset ?? sc.duration;
    const clipLen = Math.max(0.4, initEnd - initStart);
    let nextStart = initStart;
    let nextEnd = initEnd;
    let moved = false;
    let cancelled = false;
    let rafId = 0;

    const cleanup = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKeyDown);
    };

    const onMove = (ev: PointerEvent) => {
      if (cancelled) return;
      if (Math.abs(ev.clientX - startX) < 2) return;
      moved = true;
      const dt = (ev.clientX - startX) / pxPerSec;
      if (mode === 'move') {
        const s = Math.max(0, Math.min(sc.duration - clipLen, initStart + dt));
        nextStart = snapEnabled ? Math.round(s * 10) / 10 : Number(s.toFixed(2));
        nextEnd = Number(Math.min(sc.duration, nextStart + clipLen).toFixed(2));
      } else {
        const end = Math.max(initStart + 0.5, Math.min(sc.duration, initEnd + dt));
        nextEnd = snapEnabled ? Math.round(end * 10) / 10 : Number(end.toFixed(2));
      }
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (!cancelled) {
          setLiveOverlaySpans((prev) => ({
            ...prev,
            [spanKey]: { startOffset: nextStart, endOffset: nextEnd },
          }));
        }
      });
    };

    const onCancel = () => {
      cancelled = true;
      cleanup();
      setLiveOverlaySpans((prev) => {
        const copy = { ...prev };
        delete copy[spanKey];
        return copy;
      });
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        onCancel();
      }
    };

    const onUp = () => {
      if (cancelled) return;
      cleanup();
      setLiveOverlaySpans((prev) => {
        const copy = { ...prev };
        delete copy[spanKey];
        return copy;
      });
      if (!moved) return;
      void commitProjectMutation((draft) => {
        const targetOv = draft.scenes[sceneIdx]?.overlays[overlayIdx];
        if (!targetOv) return;
        targetOv.startOffset = nextStart;
        targetOv.endOffset = nextEnd;
      }, `Ajustar tempo do overlay ${ov.type} (${nextStart}s–${nextEnd}s)`);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKeyDown);
  };

  // Adicionar novo overlay rápido à cena ativa
  const handleAddQuickOverlay = async (kind: OverlayItem['type']) => {
    if (!activeScene) return;
    let newOv: OverlayItem;
    const primary = activeDesignKit?.palette.primary || '#f5c518';
    if (kind === 'title') {
      newOv = {
        type: 'title',
        text: 'NOVO TÍTULO 2030',
        highlightWord: '2030',
        subtitle: 'SIMULAÇÃO 2030',
        position: 'top',
        boxed: activeDesignKit?.overlayPreset.titleBoxed ?? false,
        x: 50,
        y: 88,
        width: 620,
        height: 110,
      };
    } else if (kind === 'badge') {
      newOv = {
        type: 'badge',
        text: 'NA NOSSA SIMULAÇÃO',
        icon: '⚠',
        color: primary,
        x: 200,
        y: 224,
        width: 320,
        height: 48,
      };
    } else if (kind === 'lower-third') {
      newOv = {
        type: 'lower-third',
        name: activeCharacter?.name.toUpperCase() || 'MARCO SILVA',
        subtitle: activeCharacter?.role.toUpperCase() || 'ECONOMISTA · RECIFE',
        x: 36,
        y: 840,
        width: 360,
        height: 86,
      };
    } else if (kind === 'role-banner') {
      newOv = {
        type: 'role-banner',
        title: 'CONSELHO ECONÔMICO',
        subtitle: 'META INDUSTRIAL 2030',
        variant: 'yellow',
        x: 60,
        y: 120,
        width: 600,
        height: 92,
      };
    } else if (kind === 'counter') {
      newOv = {
        type: 'counter',
        label: 'IMPACTO NO PIB',
        from: 0,
        to: 257,
        prefix: '+',
        suffix: ' BI',
        sublabel: 'PROJEÇÃO 2030',
        x: 410,
        y: 112,
        width: 274,
        height: 126,
      };
    } else {
      newOv = {
        type: 'watermark',
        handle: activeDesignKit?.overlayPreset.watermarkHandle || '@simulacao2030',
        position: 'top-right',
        x: 480,
        y: 48,
        width: 200,
        height: 42,
      };
    }

    await commitProjectMutation((draft) => {
      const sc = draft.scenes.find((s) => s.id === activeScene.id);
      if (sc) sc.overlays.push(newOv);
    }, `Adicionar overlay ${kind}`);
    setSelectedOverlayIndices([activeScene.overlays.length]);
    setCanvasTool('2d');
  };

  // Aplicar Design Kit ao projeto
  const handleApplyDesignKit = async (designKitId: string) => {
    const before = structuredClone(project);
    const res = await fetch(`/api/projects/${project.id}/apply-design-kit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ designKitId }),
    }).then((r) => r.json());
    editHistory.recordEdit(`Aplicar Design Kit (${designKitId})`, before, res);
    onProjectUpdated(res);
    showNotice(`Design Kit "${designKitId}" aplicado ao projeto!`);
  };

  // Validar conformidade com o Design Kit
  const handleValidateProject = async () => {
    const res = await fetch(`/api/projects/${project.id}/validate`, {
      method: 'POST',
    }).then((r) => r.json());
    setValidationResult(res);
    setRightTab('validation');
    showNotice(
      res.issues.length === 0
        ? 'Projeto 100% em conformidade com o Design Kit!'
        : `Validação concluída: ${res.issues.length} aviso(s)/erro(s) encontrados.`
    );
  };

  const selectedOverlayIdx = selectedOverlayIndices.length > 0 ? selectedOverlayIndices[0] : -1;
  const baseSelectedOverlay: OverlayItem | null =
    activeScene && selectedOverlayIdx >= 0
      ? activeScene.overlays[selectedOverlayIdx] || null
      : null;
  const selectedOverlay: OverlayItem | null = baseSelectedOverlay
    ? ({
        ...baseSelectedOverlay,
        ...(liveOverlayTransforms[selectedOverlayIdx] || {}),
      } as OverlayItem)
    : null;

  const selectedOverlayRect = useMemo(() => {
    if (!selectedOverlay || selectedOverlayIdx < 0) return null;
    const zones = computeOverlayLayoutZones(project.captionStyle, 720, 1280);
    return defaultOverlayRect720(selectedOverlay, selectedOverlayIdx, zones);
  }, [selectedOverlay, selectedOverlayIdx, project.captionStyle]);

  const baseSelectedObject3D: Scene3DObjectDescriptor | null =
    objects3DCatalog.find((o) => o.id === selectedObject3DId) || objects3DCatalog[0] || null;
  const selectedObject3D: Scene3DObjectDescriptor | null =
    baseSelectedObject3D &&
    liveObject3DTransform &&
    liveObject3DTransform.objectId === baseSelectedObject3D.id
      ? {
          ...baseSelectedObject3D,
          position: liveObject3DTransform.position,
          rotation: liveObject3DTransform.rotation,
          scale: liveObject3DTransform.scale,
        }
      : baseSelectedObject3D;

  const timelineWidthPx = Math.max(760, Math.ceil(totalDuration * pxPerSec) + 120);

  // Grupos de legendas globais para a trilha C1
  const captionBlocks = useMemo(() => {
    const blocks: Array<{ id: string; start: number; end: number; text: string }> = [];
    sceneSpans.spans.forEach((sp) => {
      const words = sp.scene?.wordTimestamps || sp.kineticBlock?.wordTimestamps || [];
      if (words.length > 0) {
        const groups = buildWordCaptionGroups(words, project.captionStyle.wordsPerGroup || 3);
        groups.forEach((g) => {
          blocks.push({
            id: `${sp.id}-${g.id}`,
            start: Number((sp.start + g.start).toFixed(2)),
            end: Number((sp.start + g.end).toFixed(2)),
            text: g.words.map((w) => w.word).join(' '),
          });
        });
      } else {
        const text = sp.scene?.narration || sp.kineticBlock?.narration || '';
        const tokens = text.trim().split(/\s+/).filter(Boolean);
        const step = project.captionStyle.wordsPerGroup || 3;
        const groupCount = Math.max(1, Math.ceil(tokens.length / step));
        const durPerG = sp.duration / groupCount;
        for (let i = 0; i < groupCount; i++) {
          blocks.push({
            id: `${sp.id}-cg-${i}`,
            start: Number((sp.start + i * durPerG).toFixed(2)),
            end: Number((sp.start + (i + 1) * durPerG).toFixed(2)),
            text: tokens.slice(i * step, (i + 1) * step).join(' '),
          });
        }
      }
    });
    return blocks;
  }, [sceneSpans.spans, project.captionStyle.wordsPerGroup]);

  return (
    <div
      data-testid="nle-editor-workspace"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: 'var(--surface-canvas-bg, #0b0f19)',
        border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
        borderRadius: 0,
        overflow: 'hidden',
      }}
    >
      {/* ====================================================================
          1. BARRA DE FERRAMENTAS SUPERIOR DO EDITOR NLE
         ==================================================================== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          background: 'var(--surface-panel-bg, #111827)',
          borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        {/* Esquerda: Undo/Redo + Modos de Ferramenta do Canvas (2D Figma / 3D Gizmo / Câmera / Código) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            className="om-button"
            data-testid="nle-undo-btn"
            disabled={!editHistory.canUndo}
            onClick={() => void editHistory.undo()}
            title="Desfazer (Ctrl+Z)"
            style={{ padding: '5px 10px', fontSize: 12 }}
          >
            <ArrowGoBack size={14} /> Desfazer
          </button>
          <button
            type="button"
            className="om-button"
            data-testid="nle-redo-btn"
            disabled={!editHistory.canRedo}
            onClick={() => void editHistory.redo()}
            title="Refazer (Ctrl+Shift+Z)"
            style={{ padding: '5px 10px', fontSize: 12 }}
          >
            <ArrowGoForward size={14} /> Refazer
          </button>

          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.12)', margin: '0 4px' }} />

          <div
            role="group"
            aria-label="Ferramentas do Canvas"
            style={{
              display: 'inline-flex',
              background: 'rgba(15, 23, 42, 0.85)',
              padding: 3,
              borderRadius: 9,
              border: '1px solid rgba(255,255,255,0.1)',
              gap: 3,
            }}
          >
            <button
              type="button"
              data-testid="tool-2d-btn"
              onClick={() => setCanvasTool('2d')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background: canvasTool === '2d' ? '#38bdf8' : 'transparent',
                color: canvasTool === '2d' ? '#090d16' : '#e2e8f0',
              }}
            >
              <ArrowsOutCardinal size={14} /> 2D / Overlays (Figma)
            </button>
            {project.engine === 'scene3d' && (
              <>
                <button
                  type="button"
                  data-testid="tool-3d-btn"
                  onClick={() => setCanvasTool('3d')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    background: canvasTool === '3d' ? '#f5c518' : 'transparent',
                    color: canvasTool === '3d' ? '#090d16' : '#e2e8f0',
                  }}
                >
                  <Box3D size={14} /> 3D Gizmo
                </button>
                <button
                  type="button"
                  data-testid="tool-camera-btn"
                  onClick={() => setCanvasTool('camera')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    background: canvasTool === 'camera' ? '#a855f7' : 'transparent',
                    color: canvasTool === 'camera' ? '#ffffff' : '#e2e8f0',
                  }}
                >
                  <Camera size={14} /> Câmera 3D
                </button>
              </>
            )}
            <button
              type="button"
              data-testid="tool-code-btn"
              onClick={() => setCanvasTool('code')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background: canvasTool === 'code' ? '#22c55e' : 'transparent',
                color: canvasTool === 'code' ? '#090d16' : '#e2e8f0',
              }}
            >
              <Code size={14} /> Código HTML/JSON
            </button>
          </div>

          {/* Sub-modo do Gizmo 3D (Mover / Rotacionar / Escalar) */}
          {canvasTool === '3d' && (
            <div
              style={{
                display: 'inline-flex',
                background: 'rgba(245, 197, 24, 0.14)',
                padding: 3,
                borderRadius: 8,
                border: '1px solid rgba(245, 197, 24, 0.4)',
                gap: 3,
              }}
            >
              {(['translate', 'rotate', 'scale'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  data-testid={`gizmo-mode-${m}`}
                  onClick={() => setGizmoMode(m)}
                  style={{
                    padding: '3px 8px',
                    fontSize: 11,
                    fontWeight: 800,
                    borderRadius: 5,
                    border: 'none',
                    cursor: 'pointer',
                    background: gizmoMode === m ? '#f5c518' : 'transparent',
                    color: gizmoMode === m ? '#090d16' : '#fde68a',
                  }}
                >
                  {m === 'translate' ? 'Mover (XYZ)' : m === 'rotate' ? 'Rotacionar' : 'Escalar'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Centro: Seletor de Design Kit do Projeto + Safe Areas + Snapping */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>Design Kit:</span>
            <select
              data-testid="project-design-kit-select"
              className="vs-select"
              style={{ width: 205, padding: '4px 8px', fontSize: 12 }}
              value={project.designKitId || 'simulacao-2030'}
              onChange={(e) => void handleApplyDesignKit(e.target.value)}
            >
              {designKits.map((dk) => (
                <option key={dk.id} value={dk.id}>
                  {dk.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="om-button"
              style={{ padding: '4px 8px', fontSize: 11 }}
              onClick={onOpenDesignKits}
              title="Gerenciar Design Kits"
            >
              Editar Kit
            </button>
          </div>

          <button
            type="button"
            className="om-button"
            data-testid="toggle-safe-area-btn"
            onClick={() => setShowSafeAreas((s) => !s)}
            style={{
              padding: '4px 9px',
              fontSize: 11,
              borderColor: showSafeAreas ? '#38bdf8' : undefined,
              color: showSafeAreas ? '#38bdf8' : undefined,
            }}
          >
            <ShapeBox size={14} /> Safe Area 9:16
          </button>

          <button
            type="button"
            className="om-button"
            data-testid="toggle-snap-btn"
            onClick={() => setSnapEnabled((s) => !s)}
            style={{
              padding: '4px 9px',
              fontSize: 11,
              borderColor: snapEnabled ? '#ec4899' : undefined,
              color: snapEnabled ? '#ec4899' : undefined,
            }}
          >
            <Magnet size={14} /> Snap {snapEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Direita: Validar Conformidade, Sintetizar TTS e Renderizar MP4 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            className="om-button"
            data-testid="nle-validate-btn"
            onClick={() => void handleValidateProject()}
            style={{ padding: '5px 10px', fontSize: 12 }}
          >
            <ShieldCheck size={14} /> Validar Kit
          </button>
          <button
            type="button"
            className="om-button"
            data-testid="nle-synthesize-btn"
            disabled={synthesizingAudio}
            onClick={() => void handleTriggerSynthesizeAudio()}
            style={{ padding: '5px 10px', fontSize: 12 }}
          >
            <Microphone size={14} /> {synthesizingAudio ? 'Gerando...' : 'TTS + Mix'}
          </button>
          <button
            type="button"
            className="om-button"
            data-primary
            onClick={() => void onStartRender(project.id)}
            style={{ padding: '5px 12px', fontSize: 12 }}
          >
            <FilmSlate size={14} /> Renderizar MP4
          </button>
        </div>
      </div>

      {/* ====================================================================
          2. ÁREA CENTRAL DE 3 COLUNAS (BIBLIOTECA | PREVIEW CANVAS | CAMADAS & INSPECTOR)
         ==================================================================== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '270px 1fr 330px',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* ------------------------------------------------------------------
            2A. PAINEL ESQUERDO: BIBLIOTECA DE MÍDIA / OVERLAYS / CENAS / ÁUDIO
           ------------------------------------------------------------------ */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid rgba(255,255,255,0.09)',
            background: 'rgba(15, 23, 42, 0.65)',
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              borderBottom: '1px solid rgba(255,255,255,0.09)',
              background: 'rgba(9, 13, 22, 0.6)',
            }}
          >
            {(
              [
                ['overlays', 'Overlays'],
                ['scenes', 'Cenários'],
                ['blocks', 'Blocos'],
                ['audio', 'Áudio'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setLeftTab(id)}
                style={{
                  padding: '8px 4px',
                  fontSize: 11,
                  fontWeight: 800,
                  border: 'none',
                  borderBottom: leftTab === id ? '2px solid #f5c518' : '2px solid transparent',
                  background: 'transparent',
                  color: leftTab === id ? '#f5c518' : '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {leftTab === 'overlays' && (
              <>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8' }}>
                  ADICIONAR CAMADA 2D À CENA ATIVA
                </div>
                {(
                  [
                    ['title', 'Título Condensado Bold', 'Texto grande no topo ou centro com palavra em destaque'],
                    ['badge', 'Badge Amarelo de Aviso', 'Pílula ⚠ NA NOSSA SIMULAÇÃO com borda forte'],
                    ['lower-third', 'Lower-Third Jornalístico', 'Nome + cargo/cidade na zona meio-inferior'],
                    ['role-banner', 'Tarja Dupla de Cargo', 'Tarja superior institucional + subtítulo colorido'],
                    ['counter', 'Contador Numérico GSAP', 'Número animado de 0 até o alvo com rótulo'],
                    ['watermark', 'Marca d’Água / @handle', 'Pílula de arroba do canal no topo'],
                  ] as const
                ).map(([kind, title, desc]) => (
                  <button
                    key={kind}
                    type="button"
                    data-testid={`add-overlay-${kind}`}
                    onClick={() => void handleAddQuickOverlay(kind)}
                    style={{
                      textAlign: 'left',
                      padding: '9px 11px',
                      borderRadius: 9,
                      background: 'rgba(30, 41, 59, 0.65)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#f8fafc',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 12, color: '#f5c518' }}>+ {title}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{desc}</div>
                  </button>
                ))}
              </>
            )}

            {leftTab === 'scenes' && (
              <>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8' }}>
                  {templates.length} CENÁRIOS 3D LOW-POLY (CLIQUE PARA APLICAR)
                </div>
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() =>
                      void handleUpdateActiveScene(
                        { template: tpl.id, templateProps: tpl.exampleProps },
                        `Trocar cenário 3D para ${tpl.name}`
                      )
                    }
                    style={{
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: 8,
                      background:
                        activeScene?.template === tpl.id
                          ? 'rgba(245, 197, 24, 0.16)'
                          : 'rgba(30, 41, 59, 0.55)',
                      border:
                        activeScene?.template === tpl.id
                          ? '1.5px solid #f5c518'
                          : '1px solid rgba(255,255,255,0.08)',
                      color: '#f8fafc',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 12 }}>{tpl.name}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                      <code>{tpl.id}</code> · {tpl.category}
                    </div>
                  </button>
                ))}
              </>
            )}

            {leftTab === 'blocks' && (
              <>
                <input
                  className="vs-input"
                  placeholder="Buscar blocos HyperFrames / PixelFX..."
                  value={blockSearch}
                  onChange={(e) => setBlockSearch(e.target.value)}
                  style={{ fontSize: 12, padding: '6px 9px' }}
                />
                {libraryItems
                  .filter(
                    (it) =>
                      !blockSearch ||
                      it.title.toLowerCase().includes(blockSearch.toLowerCase()) ||
                      it.tags.some((t) => t.toLowerCase().includes(blockSearch.toLowerCase()))
                  )
                  .slice(0, 20)
                  .map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: 'rgba(30, 41, 59, 0.55)',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                        <span className="om-badge">{item.type}</span>
                        <span style={{ color: '#94a3b8' }}>{item.sourceRepo.split('/')[1] || item.sourceRepo}</span>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 12, marginTop: 4 }}>{item.title}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        {item.description.slice(0, 75)}
                      </div>
                    </div>
                  ))}
              </>
            )}

            {leftTab === 'audio' && (
              <>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8' }}>
                  TRILHA MUSICAL & SIDECHAIN DUCKING
                </div>
                <label className="vs-label">Trilha Musical Master</label>
                <select
                  className="vs-select"
                  value={project.renderSettings.musicTrack}
                  onChange={(e) =>
                    void commitProjectMutation((draft) => {
                      draft.renderSettings.musicTrack = e.target.value;
                    }, `Trocar música para ${e.target.value}`)
                  }
                >
                  <option value="upbeat-simulation">Upbeat Simulation (Synth Pulse)</option>
                  <option value="cyber-pulse">Cyber Pulse 2030</option>
                  <option value="none">Sem Música</option>
                </select>

                <label className="vs-label" style={{ marginTop: 6 }}>
                  Volume da Música ({Math.round(project.renderSettings.musicVolume * 100)}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={0.5}
                  step={0.02}
                  value={project.renderSettings.musicVolume}
                  onChange={(e) =>
                    void commitProjectMutation((draft) => {
                      draft.renderSettings.musicVolume = Number(e.target.value);
                    }, 'Ajustar volume da música')
                  }
                />

                <label className="vs-label" style={{ marginTop: 6 }}>
                  Volume dos SFX ({Math.round(project.renderSettings.sfxVolume * 100)}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={project.renderSettings.sfxVolume}
                  onChange={(e) =>
                    void commitProjectMutation((draft) => {
                      draft.renderSettings.sfxVolume = Number(e.target.value);
                    }, 'Ajustar volume de SFX')
                  }
                />

                {activeScene && (
                  <>
                    <label className="vs-label" style={{ marginTop: 8 }}>
                      Efeito Sonoro (SFX) da Cena Ativa
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 5 }}>
                      {SFX_LIST.map((sfx) => (
                        <button
                          key={sfx}
                          type="button"
                          className="om-button"
                          data-primary={activeScene.sfx === sfx || undefined}
                          onClick={() => void handleUpdateActiveScene({ sfx }, `Trocar SFX para ${sfx}`)}
                          style={{ fontSize: 11, padding: '5px 8px' }}
                        >
                          <SpeakerHigh size={13} /> {sfx}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------------------
            2B. PALCO CENTRAL: PLAYER 9:16 + CANVAS VISUAL (2D/3D) + CONTROLES
           ------------------------------------------------------------------ */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            background:
              'radial-gradient(circle at 50% 40%, rgba(30, 41, 59, 0.55) 0%, rgba(9, 13, 22, 0.95) 80%)',
            padding: '10px 16px',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Barra de status superior do Canvas + Controles de Zoom */}
          <div
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 11,
              color: '#94a3b8',
              gap: 8,
              flexWrap: 'wrap',
              paddingBottom: 4,
            }}
          >
            <span>
              Cena Ativa:{' '}
              <strong style={{ color: '#f8fafc' }}>
                {activeSpan ? activeSpan.label : project.title}
              </strong>{' '}
              · Kit:{' '}
              <strong style={{ color: activeDesignKit?.palette.primary || '#f5c518' }}>
                {activeDesignKit?.name}
              </strong>
            </span>

            {/* Controles de Zoom do Preview (Ajustar / 50% / 100% / 200% + Ctrl+Scroll + Espaço+Arrastar) */}
            <div
              data-testid="nle-preview-zoom-controls"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                background: 'rgba(15, 23, 42, 0.85)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 7,
                padding: 2,
              }}
            >
              {(
                [
                  ['fit', 'Ajustar'],
                  [0.5, '50%'],
                  [1, '100%'],
                  [2, '200%'],
                ] as Array<['fit' | number, string]>
              ).map(([modeVal, label]) => {
                const isAct =
                  modeVal === 'fit'
                    ? zoomMode === 'fit'
                    : typeof zoomMode === 'number' && Math.abs(zoomMode - modeVal) < 0.01;
                return (
                  <button
                    key={String(modeVal)}
                    type="button"
                    data-testid={`preview-zoom-${modeVal}`}
                    onClick={() => setZoomMode(modeVal)}
                    style={{
                      padding: '2px 7px',
                      fontSize: 10,
                      fontWeight: 800,
                      borderRadius: 5,
                      border: 'none',
                      cursor: 'pointer',
                      background: isAct ? '#f5c518' : 'transparent',
                      color: isAct ? '#090d16' : '#cbd5e1',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
              <span
                data-testid="preview-zoom-indicator"
                title="Ctrl+Scroll para zoom · Espaço+Arrastar para mover quando ampliado"
                style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: 10,
                  color: '#38bdf8',
                  padding: '0 6px',
                  fontWeight: 700,
                }}
              >
                {displayZoomPct}%
              </span>
              {(panOffset.x !== 0 || panOffset.y !== 0) && (
                <button
                  type="button"
                  onClick={() => setPanOffset({ x: 0, y: 0 })}
                  title="Centralizar preview"
                  style={{
                    padding: '2px 6px',
                    fontSize: 10,
                    fontWeight: 700,
                    borderRadius: 5,
                    border: 'none',
                    cursor: 'pointer',
                    background: 'rgba(56, 189, 248, 0.2)',
                    color: '#38bdf8',
                  }}
                >
                  Centralizar
                </button>
              )}
            </div>

            <span>
              Modo:{' '}
              <strong style={{ color: '#38bdf8' }}>
                {canvasTool === '2d'
                  ? 'Edição 2D Figma'
                  : canvasTool === '3d'
                    ? `Gizmo 3D (${gizmoMode.toUpperCase()})`
                    : canvasTool === 'camera'
                      ? 'Câmera 3D Orbit'
                      : 'Código HTML/JSON'}
              </strong>
            </span>
          </div>

          {/* Superfície Principal: Viewport 9:16 ou Painel de Código */}
          <div
            ref={canvasContainerRef}
            data-testid="nle-preview-stage-area"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              minHeight: 0,
              overflow: 'hidden',
              position: 'relative',
              padding: '4px 0',
            }}
          >
            {isSpacePressed && canvasTool !== 'code' && (
              <div
                data-testid="nle-preview-pan-overlay"
                onPointerDown={(e) => {
                  if (!canPanPreview) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setIsPanning(true);
                  const startX = e.clientX;
                  const startY = e.clientY;
                  const startPan = { ...panOffset };
                  const onMove = (ev: PointerEvent) => {
                    const dx = ev.clientX - startX;
                    const dy = ev.clientY - startY;
                    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                      spacePanUsedRef.current = true;
                    }
                    setPanOffset({ x: startPan.x + dx, y: startPan.y + dy });
                  };
                  const onUp = () => {
                    setIsPanning(false);
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                    window.removeEventListener('pointercancel', onUp);
                  };
                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                  window.addEventListener('pointercancel', onUp);
                }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 95,
                  cursor: canPanPreview ? (isPanning ? 'grabbing' : 'grab') : 'default',
                  background: 'transparent',
                }}
              />
            )}
            {canvasTool === 'code' ? (
              <div
                data-testid="advanced-code-editor-panel"
                style={{
                  width: '100%',
                  maxWidth: 680,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  background: '#090d16',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#22c55e' }}>
                    {'</>'} Código Sincronizado ({project.engine === 'freeform' ? 'HTML HyperFrames' : 'JSON da Cena Ativa'})
                  </span>
                  <button
                    type="button"
                    className="om-button"
                    data-primary
                    data-testid="apply-code-sync-btn"
                    style={{ fontSize: 11, padding: '4px 10px' }}
                    onClick={async () => {
                      try {
                        if (project.engine === 'freeform') {
                          await commitProjectMutation((draft) => {
                            if (draft.freeform) draft.freeform.html = codeDraft;
                          }, 'Atualizar código HTML Freeform');
                        } else if (project.engine === 'scene3d' && activeScene) {
                          const parsed = JSON.parse(codeDraft);
                          await handleUpdateActiveScene(parsed, 'Sincronizar JSON da cena 3D');
                        } else if (project.engine === 'kinetic' && activeKineticBlock) {
                          const parsed = JSON.parse(codeDraft);
                          await commitProjectMutation((draft) => {
                            draft.kineticBlocks[activeSceneIdx] = {
                              ...draft.kineticBlocks[activeSceneIdx],
                              ...parsed,
                            };
                          }, 'Sincronizar JSON do bloco cinético');
                        }
                      } catch (err) {
                        showNotice(`Erro ao aplicar código: ${err instanceof Error ? err.message : String(err)}`);
                      }
                    }}
                  >
                    Aplicar & Sincronizar com Visual
                  </button>
                </div>
                <textarea
                  data-testid="code-editor-textarea"
                  value={codeDraft}
                  onChange={(e) => setCodeDraft(e.target.value)}
                  style={{
                    flex: 1,
                    width: '100%',
                    background: '#050811',
                    color: '#e2e8f0',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 8,
                    padding: 10,
                    fontFamily: '"IBM Plex Mono", monospace',
                    fontSize: 12,
                    lineHeight: 1.45,
                    resize: 'none',
                  }}
                />
              </div>
            ) : project.engine === 'scene3d' && activeScene ? (
              <div
                className="vs-scaled-viewport"
                data-testid="nle-preview-scale-wrapper"
                data-zoom-pct={displayZoomPct}
                style={{
                  width: 360,
                  height: 640,
                  flexShrink: 0,
                  transform: `translate(${canPanPreview ? panOffset.x : 0}px, ${canPanPreview ? panOffset.y : 0}px) scale(${effectiveScale})`,
                  transformOrigin: 'center center',
                }}
              >
                <ThreeViewport
                  mode="scene"
                  scene={activeScene}
                  character={activeCharacter}
                  captionStyle={project.captionStyle}
                  designKit={activeDesignKit}
                  isPlaying={isPlaying}
                  currentTime={localSceneTime}
                  interactive={true}
                  canvasTool={canvasTool}
                  gizmoMode={gizmoMode}
                  showSafeAreas={showSafeAreas}
                  snapEnabled={snapEnabled}
                  selectedOverlayIndices={selectedOverlayIndices}
                  onSelectOverlays={setSelectedOverlayIndices}
                  onOverlayCommit={(idx, patch, label) => void handleOverlayCommit(idx, patch, label)}
                  onOverlaysPatchBatchCommit={(patches, label) =>
                    void handleOverlaysPatchBatchCommit(patches, label)
                  }
                  onLiveOverlayTransformsChange={setLiveOverlayTransforms}
                  selectedObject3DId={selectedObject3DId}
                  onSelectObject3D={(id) => {
                    setSelectedObject3DId(id);
                    setRightTab('inspector');
                  }}
                  onObject3DCommit={(id, ov, label) => void handleObject3DCommit(id, ov, label)}
                  onLiveObject3DTransform={setLiveObject3DTransform}
                  onCatalogObjects3D={setObjects3DCatalog}
                  onCameraKeyframeCommit={(kf, label) => void handleCameraKeyframeCommit(kf, label)}
                  onCaptionPositionCommit={(posY) =>
                    void commitProjectMutation((draft) => {
                      draft.captionStyle.positionY = posY;
                    }, `Mover legendas para Y=${posY}%`)
                  }
                />
              </div>
            ) : project.engine === 'kinetic' && activeKineticBlock ? (
              /* Preview Visual 2D Interativo para o Engine Kinetic */
              <div
                className="vs-scaled-viewport"
                data-testid="nle-preview-scale-wrapper"
                data-zoom-pct={displayZoomPct}
                style={{
                  width: 360,
                  height: 640,
                  flexShrink: 0,
                  transform: `translate(${canPanPreview ? panOffset.x : 0}px, ${canPanPreview ? panOffset.y : 0}px) scale(${effectiveScale})`,
                  transformOrigin: 'center center',
                }}
              >
                <div
                  className="vs-phone-viewport"
                  style={{
                    background: activeDesignKit?.palette.background || '#090d16',
                    color: activeDesignKit?.palette.text || '#ffffff',
                    padding: 28,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: 12,
                  }}
                >
                  {activeKineticBlock.rankNumber !== undefined && (
                    <div
                      style={{
                        alignSelf: 'flex-start',
                        background: activeKineticBlock.accentColor || activeDesignKit?.palette.primary || '#f5c518',
                        color: activeDesignKit?.palette.textOnPrimary || '#090d16',
                        fontFamily: activeDesignKit?.typography.headingFont || 'Anton',
                        fontSize: 28,
                        fontWeight: 900,
                        padding: '4px 14px',
                        borderRadius: activeDesignKit?.borderRadius || 8,
                      }}
                    >
                      #{activeKineticBlock.rankNumber}
                    </div>
                  )}
                  <h2
                    style={{
                      fontFamily: activeDesignKit?.typography.headingFont || 'Anton',
                      fontSize: 36,
                      lineHeight: 1.05,
                      color: activeDesignKit?.palette.text || '#fff',
                    }}
                  >
                    {activeKineticBlock.headline}
                  </h2>
                  {activeKineticBlock.subheadline && (
                    <p style={{ fontSize: 13, fontWeight: 700, opacity: 0.85 }}>
                      {activeKineticBlock.subheadline}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              /* Preview Freeform */
              <div
                className="vs-scaled-viewport"
                data-testid="nle-preview-scale-wrapper"
                data-zoom-pct={displayZoomPct}
                style={{
                  width: 360,
                  height: 640,
                  flexShrink: 0,
                  transform: `translate(${canPanPreview ? panOffset.x : 0}px, ${canPanPreview ? panOffset.y : 0}px) scale(${effectiveScale})`,
                  transformOrigin: 'center center',
                }}
              >
                <div
                  className="vs-phone-viewport"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 20,
                    textAlign: 'center',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: activeDesignKit?.typography.headingFont || 'Anton',
                        fontSize: 20,
                        fontWeight: 900,
                        color: '#f5c518',
                      }}
                    >
                      {project.title}
                    </div>
                    <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
                      Use a aba <code>{'</>'} Código HTML/JSON</code> acima para editar o HTML HyperFrames ao vivo.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Elemento HTMLAudioElement único como relógio mestre do player */}
          <audio
            ref={audioRef}
            data-testid="nle-master-audio"
            src={masterAudioUrl || undefined}
            preload="auto"
            style={{ display: 'none' }}
          />

          {/* Barra de Transporte do Player (Play/Pause, Shuttle J/K/L, Volume/Mute, Timecode, Áudio Status, Split S) */}
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(15, 23, 42, 0.9)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10,
              padding: '6px 12px',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <button
                type="button"
                className="om-button"
                title="Início (0s)"
                onClick={() => {
                  setIsPlaying(false);
                  seekTo(0);
                }}
                style={{ padding: '4px 8px', fontSize: 12 }}
              >
                <SkipLeft size={14} />
              </button>
              <button
                type="button"
                className="om-button"
                title="Rebobinar J (-1.25x)"
                onClick={() => {
                  setIsPlaying(true);
                  setPlaybackRate(-1.25);
                }}
                style={{ padding: '4px 8px', fontSize: 11 }}
              >
                <Rewind size={14} /> J
              </button>
              <button
                type="button"
                className="om-button"
                data-primary
                data-testid="nle-play-pause-btn"
                title="Play / Pause (Espaço ou K)"
                onClick={() => {
                  setPlaybackRate(1);
                  setIsPlaying((p) => !p);
                }}
                style={{ padding: '4px 14px', fontSize: 12, fontWeight: 800 }}
              >
                {isPlaying ? (
                  <>
                    <Pause size={14} /> Pausar (K)
                  </>
                ) : (
                  <>
                    <Play size={14} /> Play (Espaço)
                  </>
                )}
              </button>
              <button
                type="button"
                className="om-button"
                title="Avançar Rápido L (1.5x)"
                onClick={() => {
                  setIsPlaying(true);
                  setPlaybackRate(1.5);
                }}
                style={{ padding: '4px 8px', fontSize: 11 }}
              >
                L <FastForward size={14} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                data-testid="nle-timecode-display"
                data-playhead={playhead.toFixed(4)}
                style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#f5c518',
                  background: 'rgba(9, 13, 22, 0.9)',
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid rgba(245, 197, 24, 0.3)',
                }}
              >
                {playhead.toFixed(2)}s / {totalDuration.toFixed(2)}s · {project.renderSettings.fps} FPS
                {playbackRate !== 1 ? ` (${playbackRate}x)` : ''}
              </div>

              {/* Controle de Volume / Mute */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  type="button"
                  className="om-button"
                  data-testid="nle-mute-btn"
                  title={audioMuted ? 'Ativar som' : 'Silenciar'}
                  onClick={() => setAudioMuted((m) => !m)}
                  style={{ padding: '4px 7px', fontSize: 11 }}
                >
                  {audioMuted || audioVolume === 0 ? (
                    <SpeakerSlash size={14} />
                  ) : audioVolume < 0.5 ? (
                    <SpeakerLow size={14} />
                  ) : (
                    <SpeakerHigh size={14} />
                  )}
                </button>
                <input
                  type="range"
                  aria-label="Volume do Player"
                  data-testid="nle-volume-slider"
                  min={0}
                  max={1}
                  step={0.05}
                  value={audioMuted ? 0 : audioVolume}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setAudioVolume(v);
                    if (v > 0 && audioMuted) setAudioMuted(false);
                  }}
                  style={{ width: 64 }}
                />
              </div>

              {/* Indicador de Áudio Ausente ou Desatualizado */}
              {audioStatus === 'missing' && (
                <button
                  type="button"
                  className="om-button"
                  data-testid="nle-no-audio-warning"
                  disabled={synthesizingAudio}
                  onClick={() => void handleTriggerSynthesizeAudio()}
                  style={{
                    padding: '4px 9px',
                    fontSize: 11,
                    borderColor: '#f59e0b',
                    color: '#fde047',
                    background: 'rgba(245, 158, 11, 0.14)',
                  }}
                >
                  <Microphone size={13} />{' '}
                  {synthesizingAudio ? 'Gerando TTS + Mix...' : 'Sem áudio: clique em TTS + Mix'}
                </button>
              )}
              {audioStatus === 'ready' && isAudioOutdated && (
                <button
                  type="button"
                  className="om-button"
                  data-testid="nle-outdated-audio-warning"
                  disabled={synthesizingAudio}
                  onClick={() => void handleTriggerSynthesizeAudio()}
                  style={{
                    padding: '4px 9px',
                    fontSize: 11,
                    borderColor: '#f59e0b',
                    color: '#fde047',
                    background: 'rgba(245, 158, 11, 0.14)',
                  }}
                >
                  <Microphone size={13} />{' '}
                  {synthesizingAudio ? 'Atualizando...' : 'Áudio desatualizado · Regenerar Mix'}
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                className="om-button"
                data-testid="nle-split-clip-btn"
                title="Dividir clipe no playhead (Atalho S)"
                onClick={() => void handleSplitAtPlayhead()}
                style={{ padding: '4px 10px', fontSize: 11 }}
              >
                <Scissors size={13} /> Dividir (S)
              </button>
              <button
                type="button"
                className="om-button"
                data-testid="nle-delete-selection-btn"
                title="Excluir elemento selecionado (Delete)"
                onClick={() => void handleDeleteSelection()}
                style={{ padding: '4px 10px', fontSize: 11 }}
              >
                <Trash size={13} /> Excluir (Del)
              </button>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------
            2C. PAINEL DIREITO: INSPECTOR DE PROPRIEDADES, CAMADAS (Z-ORDER) & VALIDAÇÃO
           ------------------------------------------------------------------ */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            borderLeft: '1px solid rgba(255,255,255,0.09)',
            background: 'rgba(15, 23, 42, 0.65)',
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              borderBottom: '1px solid rgba(255,255,255,0.09)',
              background: 'rgba(9, 13, 22, 0.6)',
            }}
          >
            {(
              [
                ['inspector', 'Inspector'],
                ['layers', 'Camadas'],
                ['validation', 'Conformidade'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                data-testid={`right-tab-${id}`}
                onClick={() => setRightTab(id)}
                style={{
                  padding: '8px 4px',
                  fontSize: 11,
                  fontWeight: 800,
                  border: 'none',
                  borderBottom: rightTab === id ? '2px solid #38bdf8' : '2px solid transparent',
                  background: 'transparent',
                  color: rightTab === id ? '#38bdf8' : '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* ABA 1: CAMADAS (Z-ORDER 2D + OBJETOS 3D) */}
            {rightTab === 'layers' && activeScene && (
              <>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#38bdf8' }}>
                  CAMADAS 2D (OVERLAYS & Z-ORDER)
                </div>
                {activeScene.overlays.length === 0 && (
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>Nenhum overlay 2D nesta cena.</div>
                )}
                {activeScene.overlays.map((ov, idx) => {
                  const isSel = selectedOverlayIndices.includes(idx);
                  return (
                    <div
                      key={idx}
                      data-testid={`layer-2d-row-${idx}`}
                      onClick={() => {
                        setCanvasTool('2d');
                        setSelectedOverlayIndices([idx]);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '7px 9px',
                        borderRadius: 8,
                        background: isSel ? 'rgba(56, 189, 248, 0.18)' : 'rgba(30, 41, 59, 0.55)',
                        border: isSel ? '1.5px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700 }}>
                        <span style={{ color: '#38bdf8', textTransform: 'uppercase' }}>{ov.type}</span> ·{' '}
                        {'text' in ov
                          ? ov.text.slice(0, 16)
                          : 'name' in ov
                            ? ov.name
                            : 'title' in ov
                              ? ov.title
                              : 'label' in ov
                                ? ov.label
                                : ov.type}
                      </div>
                      <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="om-button"
                          title="Subir camada (Z-Order +)"
                          style={{ padding: '2px 6px', fontSize: 10 }}
                          onClick={() =>
                            void handleOverlayCommit(
                              idx,
                              { zIndex: (ov.zIndex ?? 20 + idx) + 2 },
                              'Trazer camada para frente'
                            )
                          }
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          className="om-button"
                          title="Descer camada (Z-Order -)"
                          style={{ padding: '2px 6px', fontSize: 10 }}
                          onClick={() =>
                            void handleOverlayCommit(
                              idx,
                              { zIndex: Math.max(2, (ov.zIndex ?? 20 + idx) - 2) },
                              'Enviar camada para trás'
                            )
                          }
                        >
                          <ArrowDown size={12} />
                        </button>
                        <button
                          type="button"
                          className="om-button"
                          title="Mostrar/Ocultar camada"
                          style={{ padding: '2px 6px', fontSize: 10 }}
                          onClick={() =>
                            void handleOverlayCommit(
                              idx,
                              { hidden: !ov.hidden },
                              ov.hidden ? 'Mostrar overlay' : 'Ocultar overlay'
                            )
                          }
                        >
                          {ov.hidden ? <EyeSlash size={12} /> : <Eye size={12} />}
                        </button>
                      </div>
                    </div>
                  );
                })}

                <div style={{ fontSize: 11, fontWeight: 800, color: '#f5c518', marginTop: 8 }}>
                  OBJETOS 3D NA CENA (RAYCAST & GIZMO)
                </div>
                {objects3DCatalog.map((obj) => {
                  const isSel = canvasTool === '3d' && selectedObject3DId === obj.id;
                  return (
                    <div
                      key={obj.id}
                      data-testid={`layer-3d-row-${obj.id}`}
                      onClick={() => {
                        setCanvasTool('3d');
                        setSelectedObject3DId(obj.id);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '7px 9px',
                        borderRadius: 8,
                        background: isSel ? 'rgba(245, 197, 24, 0.18)' : 'rgba(30, 41, 59, 0.55)',
                        border: isSel ? '1.5px solid #f5c518' : '1px solid rgba(255,255,255,0.08)',
                        cursor: 'pointer',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Box3D size={13} /> {obj.label}
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>
                          <code>{obj.id}</code> · [{obj.position.join(', ')}]
                        </div>
                      </div>
                      <button
                        type="button"
                        className="om-button"
                        style={{ padding: '2px 6px', fontSize: 10 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleObject3DCommit(
                            obj.id,
                            {
                              ...(activeScene.objectOverrides?.[obj.id] || {}),
                              position: obj.position,
                              rotation: obj.rotation,
                              scale: obj.scale,
                              hidden: !obj.hidden,
                            },
                            `Visibilidade 3D (${obj.id})`
                          );
                        }}
                      >
                        {obj.hidden ? <EyeSlash size={12} /> : <Eye size={12} />}
                      </button>
                    </div>
                  );
                })}
              </>
            )}

            {/* ABA 2: INSPECTOR DE PROPRIEDADES (2D FIGMA / 3D GIZMO / CENA) */}
            {rightTab === 'inspector' && (
              <>
                {/* Se modo 3D estiver ativo e houver objeto 3D selecionado */}
                {canvasTool === '3d' && activeScene && selectedObject3D ? (
                  <div
                    data-testid="inspector-3d-object"
                    style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 900, color: '#f5c518' }}>
                        INSPECTOR 3D · {selectedObject3D.label.toUpperCase()}
                      </span>
                      <button
                        type="button"
                        className="om-button"
                        style={{ fontSize: 10, padding: '2px 7px' }}
                        onClick={() =>
                          void commitProjectMutation((draft) => {
                            const sc = draft.scenes.find((s) => s.id === activeScene.id);
                            if (sc && sc.objectOverrides) {
                              delete sc.objectOverrides[selectedObject3D.id];
                            }
                          }, `Resetar transform 3D de ${selectedObject3D.id}`)
                        }
                      >
                        Resetar 3D
                      </button>
                    </div>

                    <div className="vs-label">Seletor Rápido de Objeto 3D</div>
                    <select
                      className="vs-select"
                      data-testid="inspector-3d-select"
                      value={selectedObject3D.id}
                      onChange={(e) => setSelectedObject3DId(e.target.value)}
                    >
                      {objects3DCatalog.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label} ({o.id})
                        </option>
                      ))}
                    </select>

                    <div className="vs-label" style={{ marginTop: 4 }}>
                      Posição 3D [X, Y, Z]
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                      {(['X', 'Y', 'Z'] as const).map((axis, aIdx) => (
                        <label key={axis} style={{ fontSize: 10, color: '#94a3b8' }}>
                          {axis}
                          <input
                            type="number"
                            step={0.15}
                            data-testid={`inspector-3d-pos-${axis.toLowerCase()}`}
                            className="vs-input"
                            style={{ padding: '4px 6px', fontSize: 12 }}
                            value={selectedObject3D.position[aIdx]}
                            onChange={(e) => {
                              const nextPos: [number, number, number] = [...selectedObject3D.position];
                              nextPos[aIdx] = Number(e.target.value);
                              void handleObject3DCommit(
                                selectedObject3D.id,
                                {
                                  ...(activeScene.objectOverrides?.[selectedObject3D.id] || {}),
                                  position: nextPos,
                                  rotation: selectedObject3D.rotation,
                                  scale: selectedObject3D.scale,
                                },
                                `Posição 3D ${axis}=${nextPos[aIdx]}`
                              );
                            }}
                          />
                        </label>
                      ))}
                    </div>

                    <div className="vs-label" style={{ marginTop: 4 }}>
                      Rotação Euler [RX, RY, RZ] (rad)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                      {(['RX', 'RY', 'RZ'] as const).map((axis, aIdx) => (
                        <label key={axis} style={{ fontSize: 10, color: '#94a3b8' }}>
                          {axis}
                          <input
                            type="number"
                            step={0.15}
                            className="vs-input"
                            style={{ padding: '4px 6px', fontSize: 12 }}
                            value={selectedObject3D.rotation[aIdx]}
                            onChange={(e) => {
                              const nextRot: [number, number, number] = [...selectedObject3D.rotation];
                              nextRot[aIdx] = Number(e.target.value);
                              void handleObject3DCommit(
                                selectedObject3D.id,
                                {
                                  ...(activeScene.objectOverrides?.[selectedObject3D.id] || {}),
                                  position: selectedObject3D.position,
                                  rotation: nextRot,
                                  scale: selectedObject3D.scale,
                                },
                                `Rotação 3D ${axis}=${nextRot[aIdx]}`
                              );
                            }}
                          />
                        </label>
                      ))}
                    </div>

                    <div className="vs-label" style={{ marginTop: 4 }}>
                      Escala Uniforme ({selectedObject3D.scale[0]}x)
                    </div>
                    <input
                      type="range"
                      min={0.3}
                      max={2.2}
                      step={0.05}
                      value={selectedObject3D.scale[0]}
                      onChange={(e) => {
                        const s = Number(e.target.value);
                        void handleObject3DCommit(
                          selectedObject3D.id,
                          {
                            ...(activeScene.objectOverrides?.[selectedObject3D.id] || {}),
                            position: selectedObject3D.position,
                            rotation: selectedObject3D.rotation,
                            scale: [s, s, s],
                          },
                          `Escala 3D ${s}x`
                        );
                      }}
                    />
                  </div>
                ) : null}

                {/* Inspector de Overlay 2D Selecionado ("Tipo Figma") */}
                {canvasTool === '2d' && activeScene && selectedOverlay && (
                  <div
                    data-testid="inspector-2d-overlay"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      paddingBottom: 10,
                      borderBottom: '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 900, color: '#38bdf8' }}>
                        OVERLAY 2D · {selectedOverlay.type.toUpperCase()} (#{selectedOverlayIndices[0] + 1})
                      </span>
                      <span className="om-badge">720×1280</span>
                    </div>

                    {/* Botões rápidos de Alinhamento Magnético no Canvas */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                      <button
                        type="button"
                        className="om-button"
                        style={{ fontSize: 10, padding: '3px 6px' }}
                        onClick={() =>
                          void handleOverlayCommit(
                            selectedOverlayIndices[0],
                            { x: activeDesignKit?.safeArea.leftPx ?? 32 },
                            'Alinhar à esquerda (Safe Area)'
                          )
                        }
                      >
                        <AlignLeft size={12} /> Esq
                      </button>
                      <button
                        type="button"
                        className="om-button"
                        data-testid="align-center-h-btn"
                        style={{ fontSize: 10, padding: '3px 6px' }}
                        onClick={() => {
                          const w = selectedOverlay.width || selectedOverlayRect?.width || 320;
                          void handleOverlayCommit(
                            selectedOverlayIndices[0],
                            { x: Math.round((720 - w) / 2) },
                            'Centralizar horizontalmente'
                          );
                        }}
                      >
                        <AlignCenter size={12} /> Centro H
                      </button>
                      <button
                        type="button"
                        className="om-button"
                        style={{ fontSize: 10, padding: '3px 6px' }}
                        onClick={() => {
                          const w = selectedOverlay.width || selectedOverlayRect?.width || 320;
                          const rightM = activeDesignKit?.safeArea.rightPx ?? 32;
                          void handleOverlayCommit(
                            selectedOverlayIndices[0],
                            { x: Math.round(720 - rightM - w) },
                            'Alinhar à direita (Safe Area)'
                          );
                        }}
                      >
                        Dir <AlignRight size={12} />
                      </button>
                    </div>

                    {/* Geometria X, Y, Largura, Altura, Rotação, Opacidade */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                      <label style={{ fontSize: 10, color: '#94a3b8' }}>
                        Posição X (px)
                        <input
                          type="number"
                          data-testid="inspector-ov-x"
                          className="vs-input"
                          style={{ padding: '4px 6px', fontSize: 12 }}
                          value={Math.round(selectedOverlay.x ?? selectedOverlayRect?.left ?? 50)}
                          onChange={(e) =>
                            void handleOverlayCommit(
                              selectedOverlayIndices[0],
                              { x: Number(e.target.value) },
                              'Ajustar X do overlay'
                            )
                          }
                        />
                      </label>
                      <label style={{ fontSize: 10, color: '#94a3b8' }}>
                        Posição Y (px)
                        <input
                          type="number"
                          data-testid="inspector-ov-y"
                          className="vs-input"
                          style={{ padding: '4px 6px', fontSize: 12 }}
                          value={Math.round(selectedOverlay.y ?? selectedOverlayRect?.top ?? 96)}
                          onChange={(e) =>
                            void handleOverlayCommit(
                              selectedOverlayIndices[0],
                              { y: Number(e.target.value) },
                              'Ajustar Y do overlay'
                            )
                          }
                        />
                      </label>
                      <label style={{ fontSize: 10, color: '#94a3b8' }}>
                        Largura W (px)
                        <input
                          type="number"
                          data-testid="inspector-ov-width"
                          className="vs-input"
                          style={{ padding: '4px 6px', fontSize: 12 }}
                          value={Math.round(selectedOverlay.width ?? selectedOverlayRect?.width ?? 360)}
                          onChange={(e) =>
                            void handleOverlayCommit(
                              selectedOverlayIndices[0],
                              { width: Number(e.target.value) },
                              'Ajustar largura do overlay'
                            )
                          }
                        />
                      </label>
                      <label style={{ fontSize: 10, color: '#94a3b8' }}>
                        Rotação (°)
                        <input
                          type="number"
                          data-testid="inspector-ov-rotation"
                          className="vs-input"
                          style={{ padding: '4px 6px', fontSize: 12 }}
                          value={selectedOverlay.rotation ?? 0}
                          onChange={(e) =>
                            void handleOverlayCommit(
                              selectedOverlayIndices[0],
                              { rotation: Number(e.target.value) },
                              'Ajustar rotação do overlay'
                            )
                          }
                        />
                      </label>
                    </div>

                    {/* Texto do Overlay */}
                    {('text' in selectedOverlay ||
                      'name' in selectedOverlay ||
                      'title' in selectedOverlay ||
                      'label' in selectedOverlay) && (
                      <label style={{ fontSize: 10, color: '#94a3b8' }}>
                        Texto Principal
                        <input
                          type="text"
                          data-testid="inspector-ov-text"
                          className="vs-input"
                          style={{ padding: '5px 8px', fontSize: 12 }}
                          value={
                            'text' in selectedOverlay
                              ? selectedOverlay.text
                              : 'name' in selectedOverlay
                                ? selectedOverlay.name
                                : 'title' in selectedOverlay
                                  ? selectedOverlay.title
                                  : 'label' in selectedOverlay
                                    ? selectedOverlay.label
                                    : ''
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            if (selectedOverlay.type === 'title' || selectedOverlay.type === 'badge') {
                              void handleOverlayCommit(selectedOverlayIndices[0], { text: val } as any);
                            } else if (selectedOverlay.type === 'lower-third') {
                              void handleOverlayCommit(selectedOverlayIndices[0], { name: val } as any);
                            } else if (selectedOverlay.type === 'role-banner') {
                              void handleOverlayCommit(selectedOverlayIndices[0], { title: val } as any);
                            } else if (selectedOverlay.type === 'counter') {
                              void handleOverlayCommit(selectedOverlayIndices[0], { label: val } as any);
                            }
                          }}
                        />
                      </label>
                    )}

                    {/* Tipografia, Cor e Opacidade */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 75px', gap: 6 }}>
                      <label style={{ fontSize: 10, color: '#94a3b8' }}>
                        Fonte (Design Kit)
                        <select
                          className="vs-select"
                          style={{ padding: '4px 6px', fontSize: 11 }}
                          value={selectedOverlay.fontFamily || activeDesignKit?.typography.headingFont || 'Anton'}
                          onChange={(e) =>
                            void handleOverlayCommit(
                              selectedOverlayIndices[0],
                              { fontFamily: e.target.value },
                              `Trocar fonte para ${e.target.value}`
                            )
                          }
                        >
                          {(activeDesignKit?.typography.allowedFonts || ['Anton', 'Bebas Neue', 'Inter']).map(
                            (f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            )
                          )}
                          <option value="Comic Sans MS">Comic Sans MS (Fora do Kit)</option>
                        </select>
                      </label>
                      <label style={{ fontSize: 10, color: '#94a3b8' }}>
                        Opacidade
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.1}
                          className="vs-input"
                          style={{ padding: '4px 6px', fontSize: 12 }}
                          value={selectedOverlay.opacity ?? 1}
                          onChange={(e) =>
                            void handleOverlayCommit(
                              selectedOverlayIndices[0],
                              { opacity: Number(e.target.value) },
                              'Ajustar opacidade'
                            )
                          }
                        />
                      </label>
                    </div>

                    {/* Swatches da Paleta do Design Kit */}
                    <div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>
                        Cor de Fundo / Destaque (Paleta do Kit)
                      </div>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {[
                          activeDesignKit?.palette.primary || '#f5c518',
                          activeDesignKit?.palette.accent || '#c1121f',
                          activeDesignKit?.palette.surface || '#111827',
                          activeDesignKit?.palette.background || '#0f172a',
                          ...(activeDesignKit?.palette.extraSwatches?.slice(0, 4) || []),
                        ].map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            title={hex}
                            onClick={() =>
                              void handleOverlayCommit(
                                selectedOverlayIndices[0],
                                selectedOverlay.type === 'badge'
                                  ? ({ color: hex, backgroundColor: hex } as any)
                                  : { backgroundColor: hex },
                                `Aplicar cor ${hex}`
                              )
                            }
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 5,
                              background: hex,
                              border: '2px solid rgba(255,255,255,0.45)',
                              cursor: 'pointer',
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Animação de Entrada/Saída e Tempo de Início/Fim */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                      <label style={{ fontSize: 10, color: '#94a3b8' }}>
                        Animação Entrada
                        <select
                          className="vs-select"
                          style={{ padding: '4px 6px', fontSize: 11 }}
                          value={selectedOverlay.enterAnimation || 'pop'}
                          onChange={(e) =>
                            void handleOverlayCommit(
                              selectedOverlayIndices[0],
                              { enterAnimation: e.target.value as any },
                              'Alterar animação de entrada'
                            )
                          }
                        >
                          <option value="pop">Pop / Elastic</option>
                          <option value="slide-down">Slide Down</option>
                          <option value="slide-up">Slide Up</option>
                          <option value="whip">Whip Lateral</option>
                          <option value="fade">Fade Suave</option>
                          <option value="none">Sem Animação</option>
                        </select>
                      </label>
                      <label style={{ fontSize: 10, color: '#94a3b8' }}>
                        Animação Saída
                        <select
                          className="vs-select"
                          style={{ padding: '4px 6px', fontSize: 11 }}
                          value={selectedOverlay.exitAnimation || 'fade'}
                          onChange={(e) =>
                            void handleOverlayCommit(
                              selectedOverlayIndices[0],
                              { exitAnimation: e.target.value as any },
                              'Alterar animação de saída'
                            )
                          }
                        >
                          <option value="fade">Fade Out</option>
                          <option value="none">Manter até o corte</option>
                        </select>
                      </label>
                      <label style={{ fontSize: 10, color: '#94a3b8' }}>
                        Início na Cena (s)
                        <input
                          type="number"
                          min={0}
                          max={activeScene.duration - 0.3}
                          step={0.1}
                          className="vs-input"
                          style={{ padding: '4px 6px', fontSize: 12 }}
                          value={selectedOverlay.startOffset ?? 0}
                          onChange={(e) =>
                            void handleOverlayCommit(
                              selectedOverlayIndices[0],
                              { startOffset: Number(e.target.value) },
                              'Ajustar tempo de início do overlay'
                            )
                          }
                        />
                      </label>
                      <label style={{ fontSize: 10, color: '#94a3b8' }}>
                        Fim na Cena (s)
                        <input
                          type="number"
                          min={0.5}
                          max={activeScene.duration}
                          step={0.1}
                          className="vs-input"
                          style={{ padding: '4px 6px', fontSize: 12 }}
                          value={selectedOverlay.endOffset ?? activeScene.duration}
                          onChange={(e) =>
                            void handleOverlayCommit(
                              selectedOverlayIndices[0],
                              { endOffset: Number(e.target.value) },
                              'Ajustar tempo de fim do overlay'
                            )
                          }
                        />
                      </label>
                    </div>
                  </div>
                )}

                {/* Propriedades Gerais da Cena Ativa */}
                {activeScene && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: '#f5c518' }}>
                      CENA #{activeSceneIdx + 1} · {activeScene.id.toUpperCase()}
                    </div>
                    <label className="vs-label">Narração TTS (Português)</label>
                    <textarea
                      className="vs-textarea"
                      style={{ minHeight: 58, fontSize: 12 }}
                      value={activeScene.narration}
                      onChange={(e) =>
                        void handleUpdateActiveScene({ narration: e.target.value }, 'Editar narração')
                      }
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                      <label style={{ fontSize: 10, color: '#94a3b8' }}>
                        Pose 3D
                        <select
                          className="vs-select"
                          style={{ padding: '4px 6px', fontSize: 11 }}
                          value={activeScene.pose}
                          onChange={(e) =>
                            void handleUpdateActiveScene(
                              { pose: e.target.value as CharacterPose },
                              'Trocar pose 3D'
                            )
                          }
                        >
                          {POSES.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={{ fontSize: 10, color: '#94a3b8' }}>
                        Câmera GSAP
                        <select
                          className="vs-select"
                          style={{ padding: '4px 6px', fontSize: 11 }}
                          value={activeScene.camera}
                          onChange={(e) =>
                            void handleUpdateActiveScene(
                              { camera: e.target.value as CameraPreset },
                              'Trocar preset de câmera'
                            )
                          }
                        >
                          {CAMERAS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={{ fontSize: 10, color: '#94a3b8' }}>
                        Transição
                        <select
                          className="vs-select"
                          style={{ padding: '4px 6px', fontSize: 11 }}
                          value={activeScene.transition}
                          onChange={(e) =>
                            void handleUpdateActiveScene(
                              { transition: e.target.value as TransitionType },
                              'Trocar transição'
                            )
                          }
                        >
                          {TRANSITIONS.map((tr) => (
                            <option key={tr} value={tr}>
                              {tr}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={{ fontSize: 10, color: '#94a3b8' }}>
                        Duração (s)
                        <input
                          type="number"
                          step={0.2}
                          min={1.5}
                          max={25}
                          className="vs-input"
                          style={{ padding: '4px 6px', fontSize: 12 }}
                          value={activeScene.duration}
                          onChange={(e) =>
                            void handleUpdateActiveScene(
                              { duration: Number(e.target.value) },
                              'Ajustar duração da cena'
                            )
                          }
                        />
                      </label>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ABA 3: RELATÓRIO DE CONFORMIDADE COM O DESIGN KIT */}
            {rightTab === 'validation' && (
              <div data-testid="validation-panel" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: '#22c55e' }}>
                    CONFORMIDADE COM DESIGN KIT
                  </span>
                  <button
                    type="button"
                    className="om-button"
                    style={{ fontSize: 10, padding: '2px 8px' }}
                    onClick={() => void handleValidateProject()}
                  >
                    Revalidar
                  </button>
                </div>

                {!validationResult ? (
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    Clique em <strong>Validar Kit</strong> para checar cores fora da paleta, fontes não permitidas e safe areas 9:16.
                  </div>
                ) : validationResult.issues.length === 0 ? (
                  <div
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      background: 'rgba(34, 197, 94, 0.14)',
                      border: '1px solid rgba(34, 197, 94, 0.4)',
                      fontSize: 12,
                      color: '#86efac',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <CheckCircleIcon size={15} />
                    <span>
                      Todas as cenas, cores, fontes e safe areas respeitam o Design Kit "{activeDesignKit?.name}".
                    </span>
                  </div>
                ) : (
                  validationResult.issues.map((iss, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        background:
                          iss.severity === 'error'
                            ? 'rgba(239, 68, 68, 0.14)'
                            : 'rgba(245, 197, 24, 0.12)',
                        border: `1px solid ${iss.severity === 'error' ? '#ef4444' : '#f5c518'}`,
                        fontSize: 11,
                      }}
                    >
                      <div style={{ fontWeight: 800, color: iss.severity === 'error' ? '#fca5a5' : '#fde047' }}>
                        [{iss.severity.toUpperCase()}] {iss.path}
                      </div>
                      <div style={{ color: '#f8fafc', marginTop: 2 }}>{iss.message}</div>
                      <div style={{ color: '#94a3b8', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Lightbulb size={12} /> <span>{iss.suggestion}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ====================================================================
          3. TIMELINE MULTITRILHA NLE (Cenas, Overlays, Legendas, Narração Waveform, Música, SFX)
         ==================================================================== */}
      <div
        data-testid="nle-multitrack-timeline"
        style={{
          height: 255,
          display: 'flex',
          flexDirection: 'column',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          background: '#080c14',
          userSelect: 'none',
        }}
      >
        {/* Barra de Controles da Timeline (Zoom, Adicionar Cena, Info de Atalhos) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '5px 12px',
            background: '#0f172a',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            fontSize: 11,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <strong style={{ color: '#f8fafc', letterSpacing: '0.04em' }}>
              TIMELINE MULTITRILHA NLE
            </strong>
            <span style={{ color: '#94a3b8' }}>
              Atalhos: <code>Espaço</code> Play · <code>J/K/L</code> Shuttle · <code>S</code> Dividir ·{' '}
              <code>Del</code> Excluir · <code>Ctrl+Z</code> Undo
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#94a3b8' }}>Zoom:</span>
            <input
              type="range"
              aria-label="Zoom da Timeline"
              min={32}
              max={140}
              value={pxPerSec}
              onChange={(e) => setPxPerSec(Number(e.target.value))}
              style={{ width: 95 }}
            />
            <span style={{ color: '#cbd5e1', width: 48 }}>{pxPerSec}px/s</span>
          </div>
        </div>

        {/* Corpo Rolável das Trilhas + Régua + Playhead */}
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '140px 1fr',
            overflow: 'hidden',
            minHeight: 0,
          }}
        >
          {/* Cabeçalhos das 6 Trilhas à Esquerda */}
          <div
            style={{
              background: '#0b101b',
              borderRight: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              flexDirection: 'column',
              fontSize: 11,
              fontWeight: 800,
              color: '#94a3b8',
            }}
          >
            <div style={{ height: 24, padding: '4px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              TEMPO (s)
            </div>
            <div style={{ height: 36, padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#f5c518', display: 'flex', alignItems: 'center', gap: 6 }}>
              <FilmSlate size={13} /> V1 · Cenas 3D
            </div>
            <div style={{ height: 45, padding: '12px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ArrowsOutCardinal size={13} /> V2 · Overlays 2D
            </div>
            <div style={{ height: 28, padding: '5px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#fde047', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ClosedCaptioning size={13} /> C1 · Legendas
            </div>
            <div style={{ height: 38, padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#22c55e', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Microphone size={13} /> A1 · Narração TTS
            </div>
            <div style={{ height: 30, padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#c084fc', display: 'flex', alignItems: 'center', gap: 6 }}>
              <MusicNote size={13} /> A2 · Música &amp; SFX
            </div>
          </div>

          {/* Área de Clipes + Playhead Vertical */}
          <div style={{ overflowX: 'auto', overflowY: 'hidden', position: 'relative' }}>
            <div
              ref={rulerRef}
              style={{
                width: timelineWidthPx,
                height: '100%',
                position: 'relative',
              }}
            >
              {/* 0. Régua Graduada de Tempo */}
              <div
                data-testid="nle-timeline-ruler"
                onPointerDown={handleRulerPointerDown}
                style={{
                  height: 24,
                  background: '#0f172a',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                  position: 'relative',
                  cursor: 'ew-resize',
                }}
              >
                {Array.from({ length: Math.ceil(totalDuration) + 1 }, (_, sec) => (
                  <div
                    key={sec}
                    style={{
                      position: 'absolute',
                      left: sec * pxPerSec,
                      top: 0,
                      bottom: 0,
                      borderLeft: '1px solid rgba(148, 163, 184, 0.3)',
                      paddingLeft: 4,
                      fontSize: 9,
                      color: '#94a3b8',
                      lineHeight: '22px',
                    }}
                  >
                    {sec}s
                  </div>
                ))}
              </div>

              {/* 1. Trilha V1: Clipes de Cenas 3D / Blocos (Com Trim Handle e Clique p/ Selecionar) */}
              <div
                style={{
                  height: 36,
                  position: 'relative',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(15, 23, 42, 0.45)',
                }}
              >
                {sceneSpans.spans.map((sp) => {
                  const isAct = sp.index === activeSceneIdx;
                  return (
                    <div
                      key={sp.id}
                      data-testid={`timeline-scene-clip-${sp.index}`}
                      onClick={() => {
                        setActiveSceneIdx(sp.index);
                        seekTo(Number((sp.start + 0.1).toFixed(2)));
                      }}
                      style={{
                        position: 'absolute',
                        left: sp.start * pxPerSec,
                        width: Math.max(24, sp.duration * pxPerSec - 2),
                        top: 3,
                        bottom: 3,
                        borderRadius: 6,
                        background: isAct
                          ? 'linear-gradient(90deg, rgba(245,197,24,0.32), rgba(234,88,12,0.28))'
                          : 'rgba(30, 41, 59, 0.9)',
                        border: isAct ? '1.5px solid #f5c518' : '1px solid rgba(255,255,255,0.15)',
                        padding: '0 10px 0 8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 11,
                        fontWeight: 800,
                        color: '#f8fafc',
                        cursor: 'pointer',
                        overflow: 'hidden',
                      }}
                    >
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {sp.label}
                      </span>
                      <span style={{ fontSize: 9, color: '#fde047', marginLeft: 4 }}>
                        {sp.duration}s
                      </span>
                      {/* Handle direito de Trim da duração da cena */}
                      <div
                        title="Arraste para aparar a duração da cena"
                        data-testid={`timeline-scene-trim-${sp.index}`}
                        onPointerDown={(e) => startSceneTrimDrag(sp.index, e)}
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: 0,
                          bottom: 0,
                          width: 7,
                          background: isAct ? '#f5c518' : 'rgba(255,255,255,0.25)',
                          cursor: 'ew-resize',
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* 2. Trilha V2: Clipes de Overlays 2D (Arrastáveis e Aparáveis em sub-faixas sem sobreposição) */}
              <div
                style={{
                  height: 45,
                  position: 'relative',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(9, 13, 22, 0.5)',
                }}
              >
                {sceneSpans.spans.map((sp) => {
                  const visibleOvs = (sp.scene?.overlays || []).filter((o) => !o.hidden);
                  const laneCount = Math.max(1, Math.min(3, visibleOvs.length));
                  const laneH = Math.floor(39 / laneCount);
                  return (sp.scene?.overlays || []).map((ov, ovIdx) => {
                    if (ov.hidden) return null;
                    const liveSpan = liveOverlaySpans[`${sp.index}-${ovIdx}`];
                    const effStartOffset = liveSpan?.startOffset ?? ov.startOffset ?? 0;
                    const effEndOffset = liveSpan?.endOffset ?? ov.endOffset ?? sp.duration;
                    const ovStart = sp.start + effStartOffset;
                    const ovEnd = sp.start + effEndOffset;
                    const ovDur = Math.max(0.3, ovEnd - ovStart);
                    const isSel =
                      sp.index === activeSceneIdx && selectedOverlayIndices.includes(ovIdx);
                    const laneIdx = ovIdx % laneCount;
                    return (
                      <div
                        key={`${sp.id}-ov-${ovIdx}`}
                        data-testid={`timeline-overlay-clip-${sp.index}-${ovIdx}`}
                        onPointerDown={(e) => startOverlayTimelineDrag(sp.index, ovIdx, 'move', e)}
                        onClick={() => {
                          setActiveSceneIdx(sp.index);
                          setSelectedOverlayIndices([ovIdx]);
                          setCanvasTool('2d');
                        }}
                        style={{
                          position: 'absolute',
                          left: ovStart * pxPerSec,
                          width: Math.max(18, ovDur * pxPerSec - 3),
                          top: 3 + laneIdx * laneH,
                          height: Math.max(11, laneH - 2),
                          borderRadius: 4,
                          background: isSel ? 'rgba(56, 189, 248, 0.42)' : 'rgba(14, 116, 144, 0.48)',
                          border: isSel ? '1.5px solid #38bdf8' : '1px solid rgba(56, 189, 248, 0.4)',
                          padding: '0 8px 0 5px',
                          display: 'flex',
                          alignItems: 'center',
                          fontSize: 9,
                          fontWeight: 800,
                          color: '#e0f2fe',
                          cursor: 'grab',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span>
                          {ov.type.toUpperCase()}
                          {'text' in ov ? `: ${ov.text.slice(0, 14)}` : 'name' in ov ? `: ${ov.name}` : ''}
                        </span>
                        <div
                          title="Aparar saída do overlay"
                          onPointerDown={(e) =>
                            startOverlayTimelineDrag(sp.index, ovIdx, 'trim-end', e)
                          }
                          style={{
                            position: 'absolute',
                            right: 0,
                            top: 0,
                            bottom: 0,
                            width: 5,
                            background: '#38bdf8',
                            cursor: 'ew-resize',
                          }}
                        />
                      </div>
                    );
                  });
                })}
              </div>

              {/* 3. Trilha C1: Legendas Sincronizadas Word-by-Word */}
              <div
                style={{
                  height: 28,
                  position: 'relative',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(15, 23, 42, 0.35)',
                }}
              >
                {captionBlocks.map((cb) => (
                  <div
                    key={cb.id}
                    onClick={() => seekTo(cb.start)}
                    style={{
                      position: 'absolute',
                      left: cb.start * pxPerSec,
                      width: Math.max(14, (cb.end - cb.start) * pxPerSec - 2),
                      top: 3,
                      bottom: 3,
                      borderRadius: 4,
                      background: 'rgba(245, 197, 24, 0.18)',
                      border: '1px solid rgba(245, 197, 24, 0.45)',
                      padding: '0 5px',
                      fontSize: 9,
                      fontWeight: 800,
                      color: '#fef08a',
                      display: 'flex',
                      alignItems: 'center',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                    }}
                  >
                    {cb.text}
                  </div>
                ))}
              </div>

              {/* 4. Trilha A1: Narração TTS com Waveform Canvas */}
              <div
                style={{
                  height: 38,
                  position: 'relative',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(6, 24, 18, 0.45)',
                }}
              >
                {sceneSpans.spans.map((sp) => {
                  const activeVoiceSource = voicePeaks || masterPeaks;
                  const scenePeaks = activeVoiceSource
                    ? decimatePeaks(
                        activeVoiceSource,
                        sp.start / Math.max(0.1, totalDuration),
                        sp.end / Math.max(0.1, totalDuration),
                        80
                      )
                    : undefined;
                  return (
                    <div
                      key={`wav-${sp.id}`}
                      onClick={() => {
                        setActiveSceneIdx(sp.index);
                        seekTo(sp.start);
                      }}
                      style={{
                        position: 'absolute',
                        left: sp.start * pxPerSec,
                        width: Math.max(24, sp.duration * pxPerSec - 2),
                        top: 3,
                        bottom: 3,
                        borderRadius: 5,
                        background: 'rgba(16, 185, 129, 0.14)',
                        border: '1px solid rgba(34, 197, 94, 0.45)',
                        overflow: 'hidden',
                        cursor: 'pointer',
                      }}
                    >
                      <AudioWaveform
                        narration={sp.scene?.narration || sp.kineticBlock?.narration || ''}
                        duration={sp.duration}
                        wordTimestamps={sp.scene?.wordTimestamps || sp.kineticBlock?.wordTimestamps}
                        peaks={scenePeaks}
                        barColor="#22c55e"
                        baselineColor="rgba(34, 197, 94, 0.25)"
                        kind="speech"
                      />
                    </div>
                  );
                })}
              </div>

              {/* 5. Trilha A2: Música Master (Sidechain Ducking) + Marcadores de SFX */}
              <div
                style={{
                  height: 30,
                  position: 'relative',
                  background: 'rgba(28, 12, 42, 0.4)',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    width: totalDuration * pxPerSec,
                    top: 3,
                    bottom: 3,
                    borderRadius: 5,
                    background: 'rgba(168, 85, 247, 0.15)',
                    border: '1px solid rgba(192, 132, 252, 0.35)',
                    overflow: 'hidden',
                  }}
                >
                  <AudioWaveform
                    duration={totalDuration}
                    peaks={masterPeaks || undefined}
                    barColor="#c084fc"
                    baselineColor="rgba(192, 132, 252, 0.2)"
                    kind="music"
                  />
                </div>
                {sceneSpans.spans.map((sp) => {
                  const sfx = sp.scene?.sfx || sp.kineticBlock?.sfx || 'none';
                  if (sfx === 'none') return null;
                  return (
                    <div
                      key={`sfx-${sp.id}`}
                      title={`SFX: ${sfx} em ${sp.start}s`}
                      style={{
                        position: 'absolute',
                        left: sp.start * pxPerSec + 2,
                        top: 5,
                        background: '#a855f7',
                        color: '#fff',
                        fontSize: 8,
                        fontWeight: 900,
                        padding: '1px 5px',
                        borderRadius: 4,
                        zIndex: 4,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      <SpeakerHigh size={10} /> {sfx}
                    </div>
                  );
                })}
              </div>

              {/* Agulha do Playhead Vertical */}
              <div
                data-testid="nle-playhead-line"
                style={{
                  position: 'absolute',
                  left: playhead * pxPerSec,
                  top: 0,
                  bottom: 0,
                  width: 2,
                  background: '#ef4444',
                  boxShadow: '0 0 8px rgba(239, 68, 68, 0.9)',
                  pointerEvents: 'none',
                  zIndex: 50,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: -6,
                    width: 14,
                    height: 12,
                    background: '#ef4444',
                    clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
