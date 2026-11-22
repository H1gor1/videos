import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppSettings,
  CameraPreset,
  CaptionStyleType,
  Character,
  CharacterAccessory,
  CharacterPose,
  DesignKit,
  EngineDescriptor,
  HairStyle,
  IntegrationStatus,
  Job,
  LibraryItem,
  LibraryItemType,
  OverlayItem,
  Project,
  ReferenceBreakdown,
  Scene,
  Series,
  StageTemplateId,
  StageTemplateMetadata,
  TransitionType,
  VideoEngineId,
  VoiceInfo,
} from '@kinema/core';
import { ThreeViewport } from './components/ThreeViewport.tsx';
import { NleEditorWorkspace } from './editor/NleEditorWorkspace.tsx';
import { DesignKitsWorkspace } from './design-kits/DesignKitsWorkspace.tsx';

type ScreenId =
  | 'dashboard'
  | 'library'
  | 'recreate'
  | 'wizard'
  | 'editor'
  | 'design-kits'
  | 'characters'
  | 'timeline'
  | 'render'
  | 'settings';

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

const SKIN_SWATCHES = ['#5c3818', '#7a4b2a', '#8d5524', '#c68642', '#e0ac69', '#f1c27d'];
const SHIRT_SWATCHES = ['#c1121f', '#1d4ed8', '#15803d', '#eab308', '#7e22ce', '#1f2937', '#f8fafc'];
const HAIR_STYLES: HairStyle[] = ['afro', 'short', 'long', 'bun', 'bald'];
const ACCESSORIES: CharacterAccessory[] = ['sash', 'tie', 'suit', 'hat', 'microphone', 'badge'];

export const App: React.FC = () => {
  const [screen, setScreen] = useState<ScreenId>('dashboard');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [sseConnected, setSseConnected] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Dados globais sincronizados com o servidor + SSE
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('simulacao-demo');
  const [activeSceneIdx, setActiveSceneIdx] = useState<number>(0);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [activeCharId, setActiveCharId] = useState<string>('marco-silva');
  const [charPreviewPose, setCharPreviewPose] = useState<CharacterPose>('celebrating');
  const [templates, setTemplates] = useState<StageTemplateMetadata[]>([]);
  const [engines, setEngines] = useState<EngineDescriptor[]>([]);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [designKits, setDesignKits] = useState<DesignKit[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  // Estado da Biblioteca
  const [libQuery, setLibQuery] = useState('');
  const [libType, setLibType] = useState<LibraryItemType | ''>('');
  const [selectedLibItem, setSelectedLibItem] = useState<(LibraryItem & { fullContent?: string }) | null>(null);
  const [syncingLib, setSyncingLib] = useState(false);

  // Estado do Wizard
  const [wizTitle, setWizTitle] = useState('SIMULAÇÃO 2030 · Reforma Tributária');
  const [wizTopic, setWizTopic] = useState('E se o Brasil zerasse imposto sobre consumo e tributasse dividendos em 2030?');
  const [wizEngine, setWizEngine] = useState<VideoEngineId>('scene3d');
  const [wizStyleId, setWizStyleId] = useState('style-simulacao-lowpoly-3d');
  const [wizPromptId, setWizPromptId] = useState('prompt-simulacao-2030');
  const [wizDuration, setWizDuration] = useState(30);
  const [wizTone, setWizTone] = useState('jornalístico-didático');
  const [wizSceneCount, setWizSceneCount] = useState(6);
  const [wizVoiceId, setWizVoiceId] = useState('pt-BR-AntonioNeural');
  const [wizVoiceRate, setWizVoiceRate] = useState(1.12);
  const [wizCaptionStyle, setWizCaptionStyle] = useState<CaptionStyleType>('highlight-yellow');
  const [wizCharacterId, setWizCharacterId] = useState('marco-silva');
  const [wizMusicTrack, setWizMusicTrack] = useState('upbeat-simulation');
  const [wizSeriesId, setWizSeriesId] = useState('simulacao-2030');
  const [wizBusy, setWizBusy] = useState(false);

  // Estado da tela Recriar Vídeo (Rea-Video)
  const [refVideoPath, setRefVideoPath] = useState(
    '/home/higorlino/.t3/userdata/attachments/fc2b025b-0496-4249-9079-cc05036ad435-25614dee-bc0c-48f2-bb8d-b4f740514ce2-mp4.mp4'
  );
  const [breakdown, setBreakdown] = useState<ReferenceBreakdown | null>(null);
  const [breakingDown, setBreakingDown] = useState(false);

  // Estado do Timeline / Preview Realtime
  const [playhead, setPlayhead] = useState(0);
  const [isPlayingTimeline, setIsPlayingTimeline] = useState(false);
  const [compositionUrl, setCompositionUrl] = useState<string | null>(null);
  const [previewFrames, setPreviewFrames] = useState<Array<{ timestamp: number; url: string; sceneId?: string }>>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [dragSceneIdx, setDragSceneIdx] = useState<number | null>(null);

  // Estado de Configurações
  const [settingsTab, setSettingsTab] = useState<'providers' | 'integrations'>('providers');
  const [voicePreviewUrl, setVoicePreviewUrl] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const showNotice = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const fetchAllData = useCallback(async () => {
    try {
      const [pRes, cRes, tRes, eRes, vRes, sRes, dkRes, jRes, iRes, stRes] = await Promise.all([
        fetch('/api/projects').then((r) => r.json()),
        fetch('/api/characters').then((r) => r.json()),
        fetch('/api/templates').then((r) => r.json()),
        fetch('/api/engines').then((r) => r.json()),
        fetch('/api/voices').then((r) => r.json()),
        fetch('/api/series').then((r) => r.json()),
        fetch('/api/design-kits').then((r) => r.json()),
        fetch('/api/jobs').then((r) => r.json()),
        fetch('/api/integrations').then((r) => r.json()),
        fetch('/api/settings').then((r) => r.json()),
      ]);
      setProjects(Array.isArray(pRes) ? pRes : []);
      setCharacters(Array.isArray(cRes) ? cRes : []);
      setTemplates(Array.isArray(tRes) ? tRes : []);
      setEngines(Array.isArray(eRes) ? eRes : []);
      setVoices(Array.isArray(vRes) ? vRes : []);
      setSeriesList(Array.isArray(sRes) ? sRes : []);
      setDesignKits(Array.isArray(dkRes) ? dkRes : []);
      setJobs(Array.isArray(jRes) ? jRes : []);
      setIntegrations(Array.isArray(iRes) ? iRes : []);
      setSettings(stRes);
    } catch {
      // Silencioso no boot inicial
    }
  }, []);

  const fetchLibrary = useCallback(async (q = libQuery, t = libType) => {
    const params = new URLSearchParams();
    if (q) params.set('query', q);
    if (t) params.set('type', t);
    params.set('limit', '120');
    const items = await fetch(`/api/library?${params.toString()}`).then((r) => r.json());
    setLibraryItems(Array.isArray(items) ? items : []);
  }, [libQuery, libType]);

  useEffect(() => {
    fetchAllData();
    fetchLibrary('', '');
  }, [fetchAllData]);

  // Conexão SSE em tempo real para refletir edições feitas via MCP/CLI ou progresso de jobs
  useEffect(() => {
    const es = new EventSource('/api/events');
    es.addEventListener('connected', () => setSseConnected(true));
    es.addEventListener('change', (ev) => {
      try {
        const payload = JSON.parse((ev as MessageEvent).data);
        if (payload.type === 'job:updated' && payload.data) {
          setJobs((prev) => {
            const idx = prev.findIndex((j) => j.id === payload.data.id);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = payload.data;
              return copy;
            }
            return [payload.data, ...prev];
          });
          if (payload.data.status === 'completed') {
            fetchAllData();
          }
        } else {
          fetchAllData();
        }
      } catch {
        fetchAllData();
      }
    });
    es.onerror = () => setSseConnected(false);
    return () => es.close();
  }, [fetchAllData]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || projects[0] || null,
    [projects, activeProjectId]
  );

  const activeScene: Scene | null = useMemo(() => {
    if (!activeProject || activeProject.scenes.length === 0) return null;
    return activeProject.scenes[Math.min(activeSceneIdx, activeProject.scenes.length - 1)] || null;
  }, [activeProject, activeSceneIdx]);

  const activeCharacter: Character = useMemo(
    () =>
      characters.find((c) => c.id === activeCharId) ||
      characters[0] || {
        id: 'marco-silva',
        name: 'Marco Silva',
        role: 'Economista · Recife',
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
    [characters, activeCharId]
  );

  // Seek do iframe HyperFrames quando o usuário arrasta o playhead na Timeline
  useEffect(() => {
    const win = iframeRef.current?.contentWindow as any;
    if (win && typeof win.__seek === 'function') {
      win.__seek(playhead);
    }
  }, [playhead]);

  // Loop de reprodução da Timeline
  useEffect(() => {
    if (!isPlayingTimeline || !activeProject) return;
    const total = Math.max(1, activeProject.totalDuration || 15);
    let raf = 0;
    let last = performance.now();

    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setPlayhead((prev) => {
        const next = prev + dt;
        return next >= total ? 0 : next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [isPlayingTimeline, activeProject]);

  // Handlers de ação
  const handleSelectProject = (id: string, goTo: ScreenId = 'editor') => {
    setActiveProjectId(id);
    setActiveSceneIdx(0);
    setPlayhead(0);
    setCompositionUrl(null);
    setScreen(goTo);
  };

  const handleUpdateScene = async (sceneId: string, patch: Partial<Scene>) => {
    if (!activeProject) return;
    const res = await fetch(`/api/projects/${activeProject.id}/scenes/${sceneId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then((r) => r.json());
    setProjects((prev) => prev.map((p) => (p.id === res.id ? res : p)));
  };

  const handleAddScene = async () => {
    if (!activeProject) return;
    const res = await fetch(`/api/projects/${activeProject.id}/scenes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        narration: 'Nova etapa da nossa simulação em dois mil e trinta.',
        template: 'bar-chart-3d',
        characterId: activeCharacter.id,
        pose: 'pointing',
        camera: 'dolly-in',
        duration: 4.0,
      }),
    }).then((r) => r.json());
    setProjects((prev) => prev.map((p) => (p.id === res.id ? res : p)));
    setActiveSceneIdx(res.scenes.length - 1);
    showNotice('Nova cena adicionada!');
  };

  const handleRemoveScene = async (sceneId: string) => {
    if (!activeProject) return;
    const res = await fetch(`/api/projects/${activeProject.id}/scenes/${sceneId}`, {
      method: 'DELETE',
    }).then((r) => r.json());
    setProjects((prev) => prev.map((p) => (p.id === res.id ? res : p)));
    setActiveSceneIdx(0);
  };

  const handleReorderScenes = async (fromIdx: number, toIdx: number) => {
    if (!activeProject || fromIdx === toIdx) return;
    const ordered = [...activeProject.scenes];
    const [moved] = ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, moved);
    const res = await fetch(`/api/projects/${activeProject.id}/scenes/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneIds: ordered.map((s) => s.id) }),
    }).then((r) => r.json());
    setProjects((prev) => prev.map((p) => (p.id === res.id ? res : p)));
    setActiveSceneIdx(toIdx);
  };

  const handleSynthesizeAudio = async (projectId: string) => {
    setBusyAction('Sintetizando TTS + Mix FFmpeg...');
    try {
      await fetch(`/api/projects/${projectId}/synthesize`, { method: 'POST' });
      await fetchAllData();
      showNotice('Narração TTS e mix de áudio concluídos!');
    } finally {
      setBusyAction(null);
    }
  };

  const handleComposePreview = async (projectId: string) => {
    setBusyAction('Montando composição HTML HyperFrames...');
    try {
      const res = await fetch(`/api/projects/${projectId}/compose`, { method: 'POST' }).then((r) =>
        r.json()
      );
      setCompositionUrl(res.previewUrl);
      showNotice('Composição HyperFrames pronta para preview!');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCapturePreviewFrames = async (projectId: string) => {
    setBusyAction('Renderizando frames PNG via HyperFrames...');
    try {
      const frames = await fetch(`/api/projects/${projectId}/preview-frames`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).then((r) => r.json());
      setPreviewFrames(Array.isArray(frames) ? frames : []);
      showNotice(`${frames.length} frames PNG capturados!`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleStartRender = async (projectId: string, customSettings?: Partial<Project['renderSettings']>) => {
    const job = await fetch(`/api/projects/${projectId}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ renderSettings: customSettings }),
    }).then((r) => r.json());
    setJobs((prev) => [job, ...prev]);
    setScreen('render');
    showNotice(`Renderização iniciada (${job.id})!`);
  };

  const handleUseLibraryItem = (item: LibraryItem) => {
    if (item.type === 'prompt') {
      setWizPromptId(item.id);
      setWizTitle(item.title);
      setWizTopic(item.description);
      if (item.engineHint) setWizEngine(item.engineHint);
      setScreen('wizard');
      showNotice(`Prompt "${item.title}" carregado no Wizard!`);
    } else if (item.type === 'style') {
      setWizStyleId(item.id);
      if (activeProject) {
        fetch(`/api/projects/${activeProject.id}/apply-style`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ styleId: item.id }),
        }).then(() => fetchAllData());
      }
      setScreen('wizard');
      showNotice(`Estilo "${item.title}" selecionado!`);
    } else if (item.type === 'effect' && activeProject) {
      fetch(`/api/projects/${activeProject.id}/add-effect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ effectId: item.id }),
      }).then(() => {
        fetchAllData();
        showNotice(`Efeito "${item.title}" aplicado ao projeto "${activeProject.title}"!`);
      });
    } else {
      setWizEngine('freeform');
      setWizTitle(`Vídeo com ${item.title}`);
      setWizTopic(item.description);
      setScreen('wizard');
    }
  };

  const handleCreateWizardProject = async (useLLM: boolean) => {
    setWizBusy(true);
    try {
      const created = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: wizTitle,
          topic: wizTopic,
          tone: wizTone,
          targetDuration: wizDuration,
          seriesId: wizSeriesId,
          engine: wizEngine,
          styleId: wizStyleId,
          promptId: wizPromptId,
          characterId: wizCharacterId,
          sceneCount: wizSceneCount,
          voice: {
            provider: wizVoiceId === 'pt-br' ? 'espeak' : 'edge',
            voiceId: wizVoiceId,
            rate: wizVoiceRate,
            pitch: '+0Hz',
          },
          captionStyle: {
            enabled: true,
            style: wizCaptionStyle,
            wordsPerGroup: 3,
            positionY: 78,
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
            musicTrack: wizMusicTrack,
            musicVolume: 0.16,
            duckingThreshold: 0.03,
            sfxVolume: 0.32,
          },
        }),
      }).then((r) => r.json());

      if (useLLM) {
        await fetch(`/api/projects/${created.id}/generate-script`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: wizTopic,
            duration: wizDuration,
            tone: wizTone,
            sceneCount: wizSceneCount,
            engine: wizEngine,
            characterId: wizCharacterId,
            styleId: wizStyleId,
          }),
        });
      }

      await fetchAllData();
      setActiveProjectId(created.id);
      setActiveSceneIdx(0);
      setScreen('editor');
      showNotice(`Projeto "${created.title}" criado com sucesso!`);
    } finally {
      setWizBusy(false);
    }
  };

  return (
    <div className="vs-shell">
      {/* TOPBAR ESTILO OPENMOTION STUDIO */}
      <header className="vs-topbar">
        <div className="vs-brand">
          <span className="vs-brand-badge">SIMULAÇÃO 3D & HYPERFRAMES</span>
          <span>Kinema</span>
          {activeProject && (
            <span className="ui-badge ui-badge--accent" style={{ marginLeft: 8 }}>
              {activeProject.title} ({activeProject.engine})
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {busyAction && (
            <span className="ui-badge ui-badge--warning">
              <span className="ui-dot" /> {busyAction}
            </span>
          )}
          {toast && <span className="ui-badge ui-badge--accent">{toast}</span>}
          <span className={`ui-badge ${sseConnected ? 'ui-badge--success' : ''}`}>
            <span className="ui-dot" /> {sseConnected ? 'SSE & MCP Live' : 'Offline'}
          </span>
          <button
            className="ui-button ui-button--sm"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          >
            Tema: {theme === 'dark' ? 'Escuro' : 'Claro'}
          </button>
          {activeProject && (
            <button
              className="ui-button ui-button--primary ui-button--sm"
              onClick={() => handleStartRender(activeProject.id)}
            >
              Renderizar MP4
            </button>
          )}
        </div>
      </header>

      <div className="vs-body">
        {/* RAIL DE NAVEGAÇÃO PRIMÁRIA */}
        <nav className="vs-rail" aria-label="Navegação Principal">
          {(
            [
              ['dashboard', 'Projetos', '🎬'],
              ['editor', 'Editor NLE', '🎞️'],
              ['design-kits', 'Design Kits', '🎨'],
              ['library', 'Biblioteca', '📚'],
              ['recreate', 'Recriar', '🔍'],
              ['wizard', 'Wizard', '✨'],
              ['characters', 'Personagem', '🧑'],
              ['timeline', 'HyperFrames', '⏱️'],
              ['render', 'Render', '🚀'],
              ['settings', 'Config', '⚙️'],
            ] as Array<[ScreenId, string, string]>
          ).map(([id, label, icon]) => (
            <button
              key={id}
              data-testid={`nav-rail-${id}`}
              className={`vs-rail-btn ${screen === id ? 'active' : ''}`}
              onClick={() => setScreen(id)}
            >
              <span style={{ fontSize: 18 }}>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* CONTEÚDO DA TELA ATIVA */}
        <main className={`vs-content ${screen === 'characters' ? 'no-pad' : ''}`}>
          {/* ================================================================
              TELA 1: DASHBOARD DE PROJETOS E SÉRIES
              ================================================================ */}
          {screen === 'dashboard' && (
            <div>
              <div className="vs-page-header">
                <div>
                  <h1 className="vs-page-title">Dashboard de Projetos & Séries</h1>
                  <p className="vs-page-sub">
                    Geração determinística de Reels/Shorts com Three.js Blocky 3D, Tipografia Cinética e HyperFrames.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="ui-button" onClick={() => setScreen('library')}>
                    Explorar Biblioteca ({libraryItems.length}+ itens)
                  </button>
                  <button className="ui-button ui-button--primary" onClick={() => setScreen('wizard')}>
                    + Novo Vídeo (Wizard)
                  </button>
                </div>
              </div>

              {/* Séries */}
              <div style={{ marginBottom: 24, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--motion-muted)' }}>SÉRIES ATIVAS:</span>
                {seriesList.map((s) => (
                  <span key={s.id} className="ui-badge ui-badge--accent">
                    {s.title} ({s.watermarkHandle})
                  </span>
                ))}
              </div>

              {/* Grid de Projetos */}
              <div className="vs-cards-grid">
                {projects.map((p) => {
                  const mp4Url = p.outputMp4Path ? `/renders/${p.id}.mp4` : null;
                  const srtUrl = p.outputSrtPath ? `/renders/${p.id}.srt` : null;
                  const thumbUrl = p.thumbnailPath ? `/renders/${p.id}-thumb.png` : null;
                  return (
                    <div key={p.id} className="vs-card">
                      <div className="vs-card-thumb">
                        {mp4Url ? (
                          <video src={mp4Url} poster={thumbUrl || undefined} controls preload="metadata" />
                        ) : thumbUrl ? (
                          <img src={thumbUrl} alt={p.title} />
                        ) : (
                          <div style={{ textAlign: 'center', padding: 16, color: 'var(--motion-muted)' }}>
                            <div style={{ fontSize: 28, marginBottom: 6 }}>🎬</div>
                            <div style={{ fontSize: 12 }}>Pronto para compor/renderizar</div>
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span className="ui-badge ui-badge--accent">{p.engine.toUpperCase()}</span>
                        <span
                          className={`ui-badge ${
                            p.status === 'completed'
                              ? 'ui-badge--success'
                              : p.status === 'rendering'
                                ? 'ui-badge--warning'
                                : ''
                          }`}
                        >
                          {p.status} · {p.totalDuration}s
                        </span>
                      </div>

                      <div>
                        <strong style={{ fontSize: 15, color: 'var(--motion-strong)', display: 'block' }}>
                          {p.title}
                        </strong>
                        <p style={{ fontSize: 12, color: 'var(--motion-muted)', margin: '4px 0 0 0' }}>
                          {p.topic || 'Sem descrição'}
                        </p>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 'auto' }}>
                        <button
                          className="ui-button ui-button--primary ui-button--sm"
                          onClick={() => handleSelectProject(p.id, 'editor')}
                        >
                          Editar Cenas
                        </button>
                        <button
                          className="ui-button ui-button--sm"
                          onClick={() => handleSelectProject(p.id, 'timeline')}
                        >
                          Timeline
                        </button>
                        <button
                          className="ui-button ui-button--accent ui-button--sm"
                          onClick={() => handleStartRender(p.id)}
                        >
                          Renderizar
                        </button>
                        {mp4Url && (
                          <a className="ui-button ui-button--sm" href={mp4Url} download={`${p.id}.mp4`}>
                            MP4
                          </a>
                        )}
                        {srtUrl && (
                          <a className="ui-button ui-button--sm" href={srtUrl} download={`${p.id}.srt`}>
                            SRT
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================================================================
              TELA 2: BIBLIOTECA DE PROMPTS, ESTILOS, EFEITOS, BLOCOS E TÉCNICAS
              ================================================================ */}
          {screen === 'library' && (
            <div>
              <div className="vs-page-header">
                <div>
                  <h1 className="vs-page-title">Biblioteca de Prompts, 99 Estilos, 244 Efeitos & Blocos</h1>
                  <p className="vs-page-sub">
                    Catálogo indexado de awesome-opus5-5-videos, lemo-opuscar, pixelfx, remotion-skills, rea-video e HyperFrames Registry.
                  </p>
                </div>
                <button
                  className="ui-button ui-button--primary"
                  disabled={syncingLib}
                  onClick={async () => {
                    setSyncingLib(true);
                    try {
                      const res = await fetch('/api/library/sync', { method: 'POST' }).then((r) => r.json());
                      await fetchLibrary(libQuery, libType);
                      showNotice(`Biblioteca sincronizada (${res.count} itens)!`);
                    } finally {
                      setSyncingLib(false);
                    }
                  }}
                >
                  {syncingLib ? 'Sincronizando git repos...' : '↻ Sincronizar Biblioteca (library:sync)'}
                </button>
              </div>

              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <input
                  className="ui-input"
                  placeholder="Buscar por título, tag, estilo (ex: cyberpunk, chart, glitch, wes anderson, top5)..."
                  value={libQuery}
                  onChange={(e) => {
                    setLibQuery(e.target.value);
                    fetchLibrary(e.target.value, libType);
                  }}
                />
              </div>

              <div className="vs-filter-pills">
                {(
                  [
                    ['', 'Todos'],
                    ['prompt', 'Prompts Virais'],
                    ['style', '99 Estilos de Filme'],
                    ['effect', '244 Efeitos PixelFX'],
                    ['block', 'Blocos HyperFrames (~450)'],
                    ['technique', 'Técnicas & Skills'],
                  ] as Array<[LibraryItemType | '', string]>
                ).map(([t, label]) => (
                  <button
                    key={t}
                    className={`vs-pill ${libType === t ? 'active' : ''}`}
                    onClick={() => {
                      setLibType(t);
                      fetchLibrary(libQuery, t);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {selectedLibItem && (
                <div className="vs-card" style={{ marginBottom: 20, borderColor: '#f5c518' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span className="ui-badge ui-badge--accent">{selectedLibItem.type.toUpperCase()}</span>{' '}
                      <strong style={{ fontSize: 16, marginLeft: 8 }}>{selectedLibItem.title}</strong>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="ui-button ui-button--primary ui-button--sm"
                        onClick={() => handleUseLibraryItem(selectedLibItem)}
                      >
                        Usar este {selectedLibItem.type} no Projeto/Wizard
                      </button>
                      <button className="ui-button ui-button--sm" onClick={() => setSelectedLibItem(null)}>
                        Fechar
                      </button>
                    </div>
                  </div>
                  <pre
                    style={{
                      background: 'var(--motion-bg)',
                      padding: 12,
                      borderRadius: 8,
                      fontSize: 12,
                      maxHeight: 240,
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {selectedLibItem.fullContent || selectedLibItem.contentPreview || selectedLibItem.description}
                  </pre>
                </div>
              )}

              <div className="vs-cards-grid">
                {libraryItems.map((item) => (
                  <div key={item.id} className="vs-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="ui-badge ui-badge--accent">{item.type}</span>
                      <span style={{ fontSize: 11, color: 'var(--motion-dim)' }}>{item.license}</span>
                    </div>
                    <strong style={{ fontSize: 15, color: 'var(--motion-strong)' }}>{item.title}</strong>
                    <p style={{ fontSize: 12, color: 'var(--motion-muted)', margin: 0 }}>
                      {item.description.slice(0, 160)}
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {item.tags.slice(0, 5).map((tag, ti) => (
                        <span key={ti} className="ui-badge">
                          #{tag}
                        </span>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                      <button
                        className="ui-button ui-button--primary ui-button--sm"
                        onClick={() => handleUseLibraryItem(item)}
                      >
                        Usar este {item.type}
                      </button>
                      <button
                        className="ui-button ui-button--sm"
                        onClick={async () => {
                          const full = await fetch(`/api/library/${encodeURIComponent(item.id)}`).then((r) =>
                            r.json()
                          );
                          setSelectedLibItem(full);
                        }}
                      >
                        Inspecionar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================================================================
              TELA 3: RECRIAR A PARTIR DE VÍDEO (Rea-Video + FFmpeg Scene Detect)
              ================================================================ */}
          {screen === 'recreate' && (
            <div>
              <div className="vs-page-header">
                <div>
                  <h1 className="vs-page-title">Recriar a partir de Vídeo (Rea-Video Breakdown)</h1>
                  <p className="vs-page-sub">
                    Extrai planos/cortes via FFmpeg scene detection e monta uma ficha estruturada para reconstrução em 3D ou Freeform.
                  </p>
                </div>
              </div>

              <div className="vs-card" style={{ marginBottom: 20 }}>
                <div className="vs-form-grid">
                  <label className="ui-field">
                    <span>Caminho local do arquivo MP4 de referência</span>
                    <input
                      className="ui-input"
                      value={refVideoPath}
                      onChange={(e) => setRefVideoPath(e.target.value)}
                    />
                  </label>
                  <label className="ui-field">
                    <span>Ou envie um arquivo de vídeo (.mp4)</span>
                    <input
                      type="file"
                      accept="video/mp4,video/*"
                      className="ui-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = async () => {
                          setBreakingDown(true);
                          try {
                            const res = await fetch('/api/reference/breakdown', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                filename: file.name,
                                base64Data: reader.result,
                              }),
                            }).then((r) => r.json());
                            setBreakdown(res);
                            showNotice(`Breakdown concluído: ${res.shots?.length || 0} planos detectados!`);
                          } finally {
                            setBreakingDown(false);
                          }
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="ui-button ui-button--primary"
                    disabled={breakingDown}
                    onClick={async () => {
                      setBreakingDown(true);
                      try {
                        const res = await fetch('/api/reference/breakdown', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ videoPath: refVideoPath }),
                        }).then((r) => r.json());
                        setBreakdown(res);
                        showNotice(`Breakdown concluído: ${res.shots?.length || 0} planos detectados!`);
                      } finally {
                        setBreakingDown(false);
                      }
                    }}
                  >
                    {breakingDown ? 'Analisando cortes com FFmpeg...' : '🔍 Analisar Vídeo & Extrair Cenas'}
                  </button>
                  {breakdown && (
                    <button
                      className="ui-button ui-button--accent"
                      onClick={() => {
                        setWizTitle(`RECRIAÇÃO · ${breakdown.id}`);
                        setWizTopic(`Projeto recriado a partir de ${breakdown.videoPath} (${breakdown.shots.length} planos)`);
                        setWizEngine(breakdown.suggestedEngine);
                        setWizDuration(Math.min(60, Math.round(breakdown.duration)));
                        setWizSceneCount(Math.min(10, breakdown.shots.length));
                        setScreen('wizard');
                      }}
                    >
                      ✨ Criar Projeto no Wizard com este Breakdown
                    </button>
                  )}
                </div>
              </div>

              {breakdown && (
                <div>
                  <div className="vs-card" style={{ marginBottom: 16 }}>
                    <strong>
                      Ficha Rea-Video ({breakdown.width}x{breakdown.height} @ {breakdown.fps}fps, {breakdown.duration}s —{' '}
                      {breakdown.shots.length} planos)
                    </strong>
                    <pre
                      style={{
                        background: 'var(--motion-bg)',
                        padding: 12,
                        borderRadius: 8,
                        fontSize: 12,
                        whiteSpace: 'pre-wrap',
                        margin: 0,
                      }}
                    >
                      {breakdown.reaVideoGuide}
                    </pre>
                  </div>

                  <div className="vs-cards-grid">
                    {breakdown.shots.map((shot) => {
                      const relFrame = shot.framePath.split('/data/')[1];
                      const frameUrl = relFrame ? `/data-files/${relFrame}` : null;
                      return (
                        <div key={shot.index} className="vs-card">
                          {frameUrl && (
                            <div className="vs-card-thumb">
                              <img src={frameUrl} alt={`Shot ${shot.index + 1}`} />
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span className="ui-badge ui-badge--accent">Plano #{shot.index + 1}</span>
                            <span className="ui-badge">
                              {shot.startTime}s → {shot.endTime}s ({shot.duration}s)
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--motion-muted)' }}>
                            Template 3D sugerido: <strong>{shot.suggestedTemplate}</strong> · Câmera:{' '}
                            <strong>{shot.suggestedCamera}</strong>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================
              TELA 4: WIZARD DE NOVO PROJETO (Formato, Estilo, Tema, Voz, Personagem)
              ================================================================ */}
          {screen === 'wizard' && (
            <div>
              <div className="vs-page-header">
                <div>
                  <h1 className="vs-page-title">Wizard — Criar Novo Vídeo Curto Vertical</h1>
                  <p className="vs-page-sub">
                    Escolha o Engine (Simulação 3D, Tipografia Cinética ou Freeform HTML), Estilo da Biblioteca, Voz e Personagem.
                  </p>
                </div>
              </div>

              <div className="vs-card" style={{ maxWidth: 920 }}>
                <div className="vs-form-grid">
                  <label className="ui-field">
                    <span>1. Formato / Engine (VideoEngine)</span>
                    <select
                      className="ui-input"
                      value={wizEngine}
                      onChange={(e) => setWizEngine(e.target.value as VideoEngineId)}
                    >
                      {engines.map((eng) => (
                        <option key={eng.id} value={eng.id}>
                          {eng.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="ui-field">
                    <span>2. Estilo Visual da Biblioteca</span>
                    <select
                      className="ui-input"
                      value={wizStyleId}
                      onChange={(e) => setWizStyleId(e.target.value)}
                    >
                      {libraryItems
                        .filter((i) => i.type === 'style')
                        .slice(0, 50)
                        .map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.title}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label className="ui-field">
                    <span>3. Título do Episódio</span>
                    <input
                      className="ui-input"
                      value={wizTitle}
                      onChange={(e) => setWizTitle(e.target.value)}
                    />
                  </label>

                  <label className="ui-field">
                    <span>4. Série</span>
                    <select
                      className="ui-input"
                      value={wizSeriesId}
                      onChange={(e) => setWizSeriesId(e.target.value)}
                    >
                      {seriesList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="ui-field">
                  <span>5. Tema / Premissa do Roteiro</span>
                  <textarea
                    className="ui-input"
                    value={wizTopic}
                    onChange={(e) => setWizTopic(e.target.value)}
                  />
                </label>

                <div className="vs-form-grid">
                  <label className="ui-field">
                    <span>6. Duração Alvo</span>
                    <select
                      className="ui-input"
                      value={wizDuration}
                      onChange={(e) => setWizDuration(Number(e.target.value))}
                    >
                      <option value={30}>30 segundos (Reels rápido)</option>
                      <option value={60}>60 segundos (Shorts padrão)</option>
                      <option value={90}>90 segundos (Explainer completo)</option>
                      <option value={150}>150 segundos (Simulação profunda)</option>
                    </select>
                  </label>

                  <label className="ui-field">
                    <span>7. Número de Cenas ({wizSceneCount})</span>
                    <input
                      type="number"
                      min={2}
                      max={12}
                      className="ui-input"
                      value={wizSceneCount}
                      onChange={(e) => setWizSceneCount(Number(e.target.value))}
                    />
                  </label>

                  <label className="ui-field">
                    <span>8. Tom da Narração</span>
                    <select
                      className="ui-input"
                      value={wizTone}
                      onChange={(e) => setWizTone(e.target.value)}
                    >
                      <option value="jornalístico-didático">Jornalístico-Didático (Simulação 2030)</option>
                      <option value="dinâmico-viral">Dinâmico & Viral</option>
                      <option value="satírico-político">Satírico / Crítico</option>
                      <option value="técnico-econômico">Técnico & Econômico</option>
                    </select>
                  </label>

                  <label className="ui-field">
                    <span>9. Personagem 3D Principal</span>
                    <select
                      className="ui-input"
                      value={wizCharacterId}
                      onChange={(e) => setWizCharacterId(e.target.value)}
                    >
                      {characters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.role})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="ui-field">
                    <span>10. Voz TTS & Velocidade ({wizVoiceRate}x)</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select
                        className="ui-input"
                        value={wizVoiceId}
                        onChange={(e) => setWizVoiceId(e.target.value)}
                      >
                        {voices.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step={0.05}
                        min={0.7}
                        max={1.6}
                        style={{ width: 90 }}
                        className="ui-input"
                        value={wizVoiceRate}
                        onChange={(e) => setWizVoiceRate(Number(e.target.value))}
                      />
                    </div>
                  </label>

                  <label className="ui-field">
                    <span>11. Estilo de Legenda Word-by-Word</span>
                    <select
                      className="ui-input"
                      value={wizCaptionStyle}
                      onChange={(e) => setWizCaptionStyle(e.target.value as CaptionStyleType)}
                    >
                      <option value="highlight-yellow">Highlight Amarelo (Referência Simulação 2030)</option>
                      <option value="karaoke">Karaokê Progressivo</option>
                      <option value="pop">Pop Dinâmico</option>
                      <option value="box">Caixa Escura (Box)</option>
                    </select>
                  </label>

                  <label className="ui-field">
                    <span>12. Trilha Musical (com Sidechain Ducking)</span>
                    <select
                      className="ui-input"
                      value={wizMusicTrack}
                      onChange={(e) => setWizMusicTrack(e.target.value)}
                    >
                      <option value="upbeat-simulation">Upbeat Simulation (Sintética)</option>
                      <option value="cyber-pulse">Cyber Pulse (Sintética)</option>
                      <option value="none">Sem música de fundo</option>
                    </select>
                  </label>
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                  <button
                    className="ui-button ui-button--primary"
                    disabled={wizBusy}
                    onClick={() => handleCreateWizardProject(true)}
                  >
                    {wizBusy ? 'Gerando projeto...' : '✨ Gerar Roteiro + Cenas e Abrir no Editor'}
                  </button>
                  <button
                    className="ui-button"
                    disabled={wizBusy}
                    onClick={() => handleCreateWizardProject(false)}
                  >
                    Criar Estrutura Manual
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              TELA 5: EDITOR DE VÍDEO NLE + CANVAS VISUAL 2D/3D (OPENMOTION)
              ================================================================ */}
          {screen === 'editor' && activeProject && (
            <NleEditorWorkspace
              project={activeProject}
              characters={characters}
              templates={templates}
              designKits={designKits}
              libraryItems={libraryItems}
              onProjectUpdated={(updated) => {
                setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
              }}
              onSynthesizeAudio={handleSynthesizeAudio}
              onStartRender={handleStartRender}
              onOpenDesignKits={() => setScreen('design-kits')}
              showNotice={showNotice}
            />
          )}

          {/* ================================================================
              TELA 5B: DESIGN KITS (IDENTIDADE VISUAL, REGRAS, MOODBOARD & REA-VIDEO)
              ================================================================ */}
          {screen === 'design-kits' && (
            <DesignKitsWorkspace
              designKits={designKits}
              activeProject={activeProject}
              activeCharacter={activeCharacter}
              onKitsChanged={fetchAllData}
              onApplyKitToProject={async (kitId) => {
                if (!activeProject) return;
                const updated = await fetch(`/api/projects/${activeProject.id}/apply-design-kit`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ designKitId: kitId }),
                }).then((r) => r.json());
                setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
                showNotice(`Design Kit "${kitId}" aplicado a "${activeProject.title}"!`);
              }}
              showNotice={showNotice}
            />
          )}

          {/* ================================================================
              TELA 6: EDITOR DE PERSONAGEM 3D BLOCKY COM PREVIEW ORBITÁVEL
              ================================================================ */}
          {screen === 'characters' && (
            <div className="vs-studio-3col">
              {/* Lista e Presets */}
              <div className="vs-panel-col">
                <div className="vs-panel-head">
                  <span>PERSONAGENS 3D ({characters.length})</span>
                  <button
                    className="ui-button ui-button--primary ui-button--sm"
                    onClick={async () => {
                      const created = await fetch('/api/characters', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          name: `Personagem ${characters.length + 1}`,
                          role: 'Especialista · Brasil',
                        }),
                      }).then((r) => r.json());
                      await fetchAllData();
                      setActiveCharId(created.id);
                    }}
                  >
                    + Novo
                  </button>
                </div>

                <div className="vs-panel-scroll">
                  {characters.map((c) => (
                    <div
                      key={c.id}
                      className={`vs-scene-item ${c.id === activeCharacter.id ? 'active' : ''}`}
                      onClick={() => setActiveCharId(c.id)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            background: c.shirtColor,
                            border: '1px solid #fff',
                          }}
                        />
                        <strong style={{ fontSize: 13 }}>{c.name}</strong>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--motion-muted)' }}>{c.role}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Viewport 3D Orbitável */}
              <div className="vs-center-stage">
                <ThreeViewport mode="character" character={activeCharacter} pose={charPreviewPose} />

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12, justifyContent: 'center' }}>
                  {POSES.map((p) => (
                    <button
                      key={p}
                      className={`ui-button ui-button--sm ${charPreviewPose === p ? 'ui-button--primary' : ''}`}
                      onClick={() => setCharPreviewPose(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Controles Paramétricos do Personagem */}
              <div className="vs-panel-col right">
                <div className="vs-panel-head">
                  <span>CUSTOMIZAR PERSONAGEM BLOCKY</span>
                </div>
                <div className="vs-panel-scroll">
                  <label className="ui-field">
                    <span>Nome</span>
                    <input
                      className="ui-input"
                      value={activeCharacter.name}
                      onChange={async (e) => {
                        const res = await fetch(`/api/characters/${activeCharacter.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ name: e.target.value }),
                        }).then((r) => r.json());
                        setCharacters((prev) => prev.map((c) => (c.id === res.id ? res : c)));
                      }}
                    />
                  </label>

                  <label className="ui-field">
                    <span>Cargo / Cidade (Lower-Third)</span>
                    <input
                      className="ui-input"
                      value={activeCharacter.role}
                      onChange={async (e) => {
                        const res = await fetch(`/api/characters/${activeCharacter.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ role: e.target.value }),
                        }).then((r) => r.json());
                        setCharacters((prev) => prev.map((c) => (c.id === res.id ? res : c)));
                      }}
                    />
                  </label>

                  <div className="ui-field">
                    <span>Tom de Pele</span>
                    <div className="vs-swatch-row">
                      {SKIN_SWATCHES.map((hex) => (
                        <button
                          key={hex}
                          className={`vs-color-swatch ${activeCharacter.skinColor === hex ? 'active' : ''}`}
                          style={{ background: hex }}
                          onClick={async () => {
                            const res = await fetch(`/api/characters/${activeCharacter.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ skinColor: hex }),
                            }).then((r) => r.json());
                            setCharacters((prev) => prev.map((c) => (c.id === res.id ? res : c)));
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="vs-form-grid">
                    <label className="ui-field">
                      <span>Estilo de Cabelo</span>
                      <select
                        className="ui-input"
                        value={activeCharacter.hairStyle}
                        onChange={async (e) => {
                          const res = await fetch(`/api/characters/${activeCharacter.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ hairStyle: e.target.value }),
                          }).then((r) => r.json());
                          setCharacters((prev) => prev.map((c) => (c.id === res.id ? res : c)));
                        }}
                      >
                        {HAIR_STYLES.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="ui-field">
                      <span>Escala Chibi da Cabeça ({activeCharacter.headScale})</span>
                      <input
                        type="range"
                        min={1.0}
                        max={1.7}
                        step={0.04}
                        value={activeCharacter.headScale}
                        onChange={async (e) => {
                          const res = await fetch(`/api/characters/${activeCharacter.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ headScale: Number(e.target.value) }),
                          }).then((r) => r.json());
                          setCharacters((prev) => prev.map((c) => (c.id === res.id ? res : c)));
                        }}
                      />
                    </label>
                  </div>

                  <div style={{ display: 'flex', gap: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={activeCharacter.hasBeard}
                        onChange={async (e) => {
                          const res = await fetch(`/api/characters/${activeCharacter.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ hasBeard: e.target.checked }),
                          }).then((r) => r.json());
                          setCharacters((prev) => prev.map((c) => (c.id === res.id ? res : c)));
                        }}
                      />
                      Barba em blocos
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={activeCharacter.hasGlasses}
                        onChange={async (e) => {
                          const res = await fetch(`/api/characters/${activeCharacter.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ hasGlasses: e.target.checked }),
                          }).then((r) => r.json());
                          setCharacters((prev) => prev.map((c) => (c.id === res.id ? res : c)));
                        }}
                      />
                      Óculos 3D
                    </label>
                  </div>

                  <div className="ui-field">
                    <span>Cor da Camisa</span>
                    <div className="vs-swatch-row">
                      {SHIRT_SWATCHES.map((hex) => (
                        <button
                          key={hex}
                          className={`vs-color-swatch ${activeCharacter.shirtColor === hex ? 'active' : ''}`}
                          style={{ background: hex }}
                          onClick={async () => {
                            const res = await fetch(`/api/characters/${activeCharacter.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ shirtColor: hex }),
                            }).then((r) => r.json());
                            setCharacters((prev) => prev.map((c) => (c.id === res.id ? res : c)));
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="ui-field">
                    <span>Acessórios 3D</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {ACCESSORIES.map((acc) => {
                        const active = activeCharacter.accessories.includes(acc);
                        return (
                          <button
                            key={acc}
                            className={`ui-button ui-button--sm ${active ? 'ui-button--primary' : ''}`}
                            onClick={async () => {
                              const next = active
                                ? activeCharacter.accessories.filter((a) => a !== acc)
                                : [...activeCharacter.accessories, acc];
                              const res = await fetch(`/api/characters/${activeCharacter.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ accessories: next }),
                              }).then((r) => r.json());
                              setCharacters((prev) => prev.map((c) => (c.id === res.id ? res : c)));
                            }}
                          >
                            {acc}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              TELA 7: TIMELINE & PREVIEW REALTIME COM ÁUDIO, SCRUB E TRILHAS
              ================================================================ */}
          {screen === 'timeline' && activeProject && (
            <div>
              <div className="vs-page-header">
                <div>
                  <h1 className="vs-page-title">Timeline Multi-Trilhas & Preview Realtime</h1>
                  <p className="vs-page-sub">
                    Scrub determinístico GSAP + Three.js sincronizado com trilha de áudio master e frames-chave do HyperFrames.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="ui-button"
                    onClick={() => handleCapturePreviewFrames(activeProject.id)}
                  >
                    📸 Capturar Frames PNG (HyperFrames Snapshot)
                  </button>
                  <button
                    className="ui-button ui-button--primary"
                    onClick={() => handleComposePreview(activeProject.id)}
                  >
                    🔄 Atualizar Composição Realtime
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '360px minmax(0, 1fr)', gap: 20 }}>
                {/* Player 9:16 Sincronizado */}
                <div className="vs-card" style={{ alignItems: 'center' }}>
                  {compositionUrl ? (
                    <div className="vs-phone-viewport">
                      <iframe
                        ref={iframeRef}
                        src={compositionUrl}
                        title="HyperFrames Realtime Player"
                        style={{
                          width: 720,
                          height: 1280,
                          transform: 'scale(0.472)',
                          transformOrigin: '0 0',
                          border: 0,
                        }}
                      />
                    </div>
                  ) : activeProject.engine === 'scene3d' && activeScene ? (
                    <ThreeViewport
                      mode="scene"
                      scene={activeScene}
                      character={
                        characters.find((c) => c.id === activeScene.characterId) || activeCharacter
                      }
                      captionStyle={activeProject.captionStyle}
                      currentTime={playhead}
                      isPlaying={isPlayingTimeline}
                    />
                  ) : null}

                  <audio
                    ref={audioRef}
                    src={`/project-files/${activeProject.id}/audio/mixed-master.wav`}
                    style={{ width: '100%', marginTop: 8 }}
                    controls
                  />
                </div>

                {/* Scrubber + Trilhas + Keyframes */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="vs-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <button
                        className="ui-button ui-button--primary"
                        onClick={() => setIsPlayingTimeline((p) => !p)}
                      >
                        {isPlayingTimeline ? '⏸ Pausar' : '▶ Play Scrub'}
                      </button>
                      <span style={{ fontFamily: 'var(--motion-font-mono)', fontSize: 14, fontWeight: 700 }}>
                        {playhead.toFixed(2)}s / {activeProject.totalDuration.toFixed(2)}s
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(1, activeProject.totalDuration)}
                        step={0.05}
                        style={{ flex: 1 }}
                        value={playhead}
                        onChange={(e) => {
                          setIsPlayingTimeline(false);
                          setPlayhead(Number(e.target.value));
                        }}
                      />
                    </div>

                    {/* Trilhas */}
                    <div className="vs-timeline-tracks">
                      <div className="vs-track-row">
                        <div className="vs-track-label">1. Cenários 3D / Clips</div>
                        <div className="vs-track-lane">
                          {activeProject.scenes.map((sc, idx) => {
                            const widthPct = (sc.duration / Math.max(1, activeProject.totalDuration)) * 100;
                            const colors = ['#c1121f', '#1d4ed8', '#15803d', '#b45309', '#6d28d9'];
                            return (
                              <div
                                key={sc.id}
                                className="vs-track-clip"
                                style={{
                                  width: `${widthPct}%`,
                                  background: colors[idx % colors.length],
                                }}
                                onClick={() => setActiveSceneIdx(idx)}
                              >
                                #{idx + 1} {sc.template} ({sc.duration}s)
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="vs-track-row">
                        <div className="vs-track-label">2. Overlays 2D & GSAP</div>
                        <div className="vs-track-lane">
                          {activeProject.scenes.map((sc, idx) => {
                            const widthPct = (sc.duration / Math.max(1, activeProject.totalDuration)) * 100;
                            return (
                              <div
                                key={sc.id}
                                className="vs-track-clip"
                                style={{
                                  width: `${widthPct}%`,
                                  background: sc.overlays.length > 0 ? '#eab308' : '#334155',
                                  color: sc.overlays.length > 0 ? '#0f172a' : '#94a3b8',
                                }}
                              >
                                {sc.overlays.length} overlays ({sc.transition})
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="vs-track-row">
                        <div className="vs-track-label">3. Legendas Word-by-Word</div>
                        <div className="vs-track-lane">
                          <div
                            className="vs-track-clip"
                            style={{ width: '100%', background: '#0284c7' }}
                          >
                            Estilo: {activeProject.captionStyle.style} ({activeProject.captionStyle.wordsPerGroup} palavras/grupo)
                          </div>
                        </div>
                      </div>

                      <div className="vs-track-row">
                        <div className="vs-track-label">4. Áudio + Ducking + SFX</div>
                        <div className="vs-track-lane">
                          <div
                            className="vs-track-clip"
                            style={{ width: '100%', background: '#059669' }}
                          >
                            Voz: {activeProject.voice.voiceId} + Música: {activeProject.renderSettings.musicTrack} (Sidechain Ducking)
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Frames PNG capturados via HyperFrames */}
                  {previewFrames.length > 0 && (
                    <div className="vs-card">
                      <strong>Frames PNG Capturados pelo HyperFrames ({previewFrames.length})</strong>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                        {previewFrames.map((f, i) => (
                          <div key={i} style={{ textAlign: 'center' }}>
                            <img
                              src={f.url}
                              alt={`Frame ${f.timestamp}s`}
                              style={{ width: '100%', borderRadius: 8, border: '1px solid var(--motion-border)' }}
                            />
                            <span style={{ fontSize: 11, color: 'var(--motion-muted)' }}>{f.timestamp}s</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              TELA 8: RENDERIZAÇÃO, FILA SSE, LOGS E GALERIA MP4/SRT
              ================================================================ */}
          {screen === 'render' && activeProject && (
            <div>
              <div className="vs-page-header">
                <div>
                  <h1 className="vs-page-title">Renderização Determinística & Fila de Jobs (SSE)</h1>
                  <p className="vs-page-sub">
                    Configure resolução vertical, FPS, CRF, workers e acompanhe cada estágio da pipeline em tempo real.
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '380px minmax(0, 1fr)', gap: 20 }}>
                {/* Configurações de Render */}
                <div className="vs-card">
                  <strong style={{ fontSize: 15 }}>Parâmetros de Exportação ({activeProject.title})</strong>

                  <label className="ui-field">
                    <span>Resolução Vertical (9:16)</span>
                    <select
                      className="ui-input"
                      value={`${activeProject.renderSettings.width}x${activeProject.renderSettings.height}`}
                      onChange={async (e) => {
                        const [w, h] = e.target.value.split('x').map(Number);
                        await fetch(`/api/projects/${activeProject.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            renderSettings: { ...activeProject.renderSettings, width: w, height: h },
                          }),
                        });
                        fetchAllData();
                      }}
                    >
                      <option value="720x1280">720 × 1280 (HD Vertical · Rápido)</option>
                      <option value="1080x1920">1080 × 1920 (Full HD Reels/Shorts)</option>
                    </select>
                  </label>

                  <div className="vs-form-grid">
                    <label className="ui-field">
                      <span>FPS</span>
                      <select
                        className="ui-input"
                        value={activeProject.renderSettings.fps}
                        onChange={async (e) => {
                          await fetch(`/api/projects/${activeProject.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              renderSettings: {
                                ...activeProject.renderSettings,
                                fps: Number(e.target.value),
                              },
                            }),
                          });
                          fetchAllData();
                        }}
                      >
                        <option value={24}>24 fps</option>
                        <option value={30}>30 fps (Padrão)</option>
                        <option value={60}>60 fps</option>
                      </select>
                    </label>

                    <label className="ui-field">
                      <span>Qualidade H.264 (CRF {activeProject.renderSettings.crf})</span>
                      <input
                        type="number"
                        min={15}
                        max={30}
                        className="ui-input"
                        value={activeProject.renderSettings.crf}
                        onChange={async (e) => {
                          await fetch(`/api/projects/${activeProject.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              renderSettings: {
                                ...activeProject.renderSettings,
                                crf: Number(e.target.value),
                              },
                            }),
                          });
                          fetchAllData();
                        }}
                      />
                    </label>

                    <label className="ui-field">
                      <span>Workers Paralelos</span>
                      <input
                        type="number"
                        min={1}
                        max={8}
                        className="ui-input"
                        value={activeProject.renderSettings.workers}
                        onChange={async (e) => {
                          await fetch(`/api/projects/${activeProject.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              renderSettings: {
                                ...activeProject.renderSettings,
                                workers: Number(e.target.value),
                              },
                            }),
                          });
                          fetchAllData();
                        }}
                      />
                    </label>

                    <label className="ui-field">
                      <span>Renderizador</span>
                      <select
                        className="ui-input"
                        value={activeProject.renderSettings.renderer}
                        onChange={async (e) => {
                          await fetch(`/api/projects/${activeProject.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              renderSettings: {
                                ...activeProject.renderSettings,
                                renderer: e.target.value as any,
                              },
                            }),
                          });
                          fetchAllData();
                        }}
                      >
                        <option value="hyperframes">HyperFrames (Padrão Determinístico)</option>
                        <option value="playwright">Playwright / Chrome Fallback</option>
                        <option value="remotion">Remotion Adapter (Opcional)</option>
                      </select>
                    </label>
                  </div>

                  <button
                    className="ui-button ui-button--primary"
                    onClick={() => handleStartRender(activeProject.id)}
                  >
                    🚀 Iniciar Renderização MP4 + SRT/ASS
                  </button>
                </div>

                {/* Fila de Jobs & Logs SSE */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {jobs.map((job) => (
                    <div key={job.id} className="vs-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong>{job.projectId}</strong> ·{' '}
                          <span style={{ fontSize: 12, color: 'var(--motion-muted)' }}>{job.id}</span>
                        </div>
                        <span
                          className={`ui-badge ${
                            job.status === 'completed'
                              ? 'ui-badge--success'
                              : job.status === 'failed'
                                ? 'ui-badge--danger'
                                : 'ui-badge--warning'
                          }`}
                        >
                          {job.stage.toUpperCase()} · {job.progress}%
                        </span>
                      </div>

                      <progress className="ui-progress" value={job.progress} max={100} />
                      <div style={{ fontSize: 12, color: 'var(--motion-muted)' }}>{job.message}</div>

                      <pre
                        style={{
                          background: 'var(--motion-bg)',
                          padding: 10,
                          borderRadius: 6,
                          fontSize: 11,
                          maxHeight: 120,
                          overflow: 'auto',
                          margin: 0,
                        }}
                      >
                        {job.logs.slice(-8).join('\n')}
                      </pre>

                      {job.status === 'completed' && (
                        <div style={{ display: 'flex', gap: 10 }}>
                          <a
                            className="ui-button ui-button--primary ui-button--sm"
                            href={`/renders/${job.projectId}.mp4`}
                            download={`${job.projectId}.mp4`}
                          >
                            ⬇ Baixar MP4
                          </a>
                          <a
                            className="ui-button ui-button--sm"
                            href={`/renders/${job.projectId}.srt`}
                            download={`${job.projectId}.srt`}
                          >
                            ⬇ Baixar Legendas .SRT
                          </a>
                          <a
                            className="ui-button ui-button--sm"
                            href={`/renders/${job.projectId}.ass`}
                            download={`${job.projectId}.ass`}
                          >
                            ⬇ Baixar Legendas .ASS
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              TELA 9: CONFIGURAÇÕES & ABA "INTEGRAÇÕES" (13 FERRAMENTAS)
              ================================================================ */}
          {screen === 'settings' && settings && (
            <div>
              <div className="vs-page-header">
                <div>
                  <h1 className="vs-page-title">Configurações de Provedores & 13 Integrações</h1>
                  <p className="vs-page-sub">
                    Configure chaves (.env local), teste vozes TTS e verifique o status de detecção das 13 ferramentas do ecossistema.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className={`ui-button ${settingsTab === 'providers' ? 'ui-button--primary' : ''}`}
                    onClick={() => setSettingsTab('providers')}
                  >
                    Provedores, Vozes & Chaves (.env)
                  </button>
                  <button
                    className={`ui-button ${settingsTab === 'integrations' ? 'ui-button--primary' : ''}`}
                    onClick={() => setSettingsTab('integrations')}
                  >
                    Integrações (13 Ferramentas)
                  </button>
                </div>
              </div>

              {settingsTab === 'providers' ? (
                <div className="vs-card" style={{ maxWidth: 900 }}>
                  <div className="vs-form-grid">
                    <label className="ui-field">
                      <span>Provedor TTS Padrão</span>
                      <select
                        className="ui-input"
                        value={settings.ttsProvider}
                        onChange={(e) =>
                          setSettings({ ...settings, ttsProvider: e.target.value as any })
                        }
                      >
                        <option value="edge">Microsoft Edge Neural (Grátis + Word Boundaries)</option>
                        <option value="espeak">eSpeak-NG PT-BR (100% Offline Fallback)</option>
                        <option value="piper">Piper TTS (Local Neural)</option>
                        <option value="elevenlabs">ElevenLabs API</option>
                        <option value="openai">OpenAI TTS API</option>
                      </select>
                    </label>

                    <label className="ui-field">
                      <span>Voz Padrão & Teste de Áudio</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <select
                          className="ui-input"
                          value={settings.ttsDefaultVoice}
                          onChange={(e) =>
                            setSettings({ ...settings, ttsDefaultVoice: e.target.value })
                          }
                        >
                          {voices.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                        </select>
                        <button
                          className="ui-button ui-button--sm"
                          onClick={async () => {
                            const res = await fetch('/api/voices/preview', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                provider: settings.ttsProvider,
                                voiceId: settings.ttsDefaultVoice,
                              }),
                            }).then((r) => r.json());
                            setVoicePreviewUrl(res.audioUrl);
                          }}
                        >
                          🔊 Testar Voz
                        </button>
                      </div>
                    </label>

                    <label className="ui-field">
                      <span>Provedor LLM Interno (Opcional — MCP não exige chave)</span>
                      <select
                        className="ui-input"
                        value={settings.llmProvider}
                        onChange={(e) =>
                          setSettings({ ...settings, llmProvider: e.target.value as any })
                        }
                      >
                        <option value="manual">Manual / Estruturado Local (Sem Chave)</option>
                        <option value="gemini">Google Gemini API</option>
                        <option value="openai-compatible">OpenAI-Compatible (OpenRouter / DeepSeek / Ollama)</option>
                      </select>
                    </label>

                    <label className="ui-field">
                      <span>GEMINI_API_KEY</span>
                      <input
                        type="password"
                        className="ui-input"
                        value={settings.geminiApiKey}
                        onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })}
                      />
                    </label>

                    <label className="ui-field">
                      <span>OPENAI_API_KEY (ou OpenRouter/DeepSeek)</span>
                      <input
                        type="password"
                        className="ui-input"
                        value={settings.openaiApiKey}
                        onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
                      />
                    </label>

                    <label className="ui-field">
                      <span>OPENAI_BASE_URL</span>
                      <input
                        className="ui-input"
                        value={settings.openaiBaseUrl}
                        onChange={(e) => setSettings({ ...settings, openaiBaseUrl: e.target.value })}
                      />
                    </label>

                    <label className="ui-field">
                      <span>Provedor de Imagem Opcional (ImageProvider)</span>
                      <select
                        className="ui-input"
                        value={settings.imageProvider}
                        onChange={(e) =>
                          setSettings({ ...settings, imageProvider: e.target.value as any })
                        }
                      >
                        <option value="none">Desligado por padrão (none)</option>
                        <option value="comfyui">ComfyUI HTTP Local</option>
                      </select>
                    </label>

                    <label className="ui-field">
                      <span>COMFYUI_URL</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          className="ui-input"
                          value={settings.comfyuiUrl}
                          onChange={(e) => setSettings({ ...settings, comfyuiUrl: e.target.value })}
                        />
                        <button
                          className="ui-button ui-button--sm"
                          onClick={async () => {
                            const res = await fetch('/api/settings/test-provider', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ provider: 'comfyui' }),
                            }).then((r) => r.json());
                            showNotice(res.message);
                          }}
                        >
                          Testar
                        </button>
                      </div>
                    </label>

                    <label className="ui-field">
                      <span>Pasta de Música (MUSIC_DIR)</span>
                      <input
                        className="ui-input"
                        value={settings.musicDir}
                        onChange={(e) => setSettings({ ...settings, musicDir: e.target.value })}
                      />
                    </label>

                    <label className="ui-field">
                      <span>Pasta de SFX (SFX_DIR)</span>
                      <input
                        className="ui-input"
                        value={settings.sfxDir}
                        onChange={(e) => setSettings({ ...settings, sfxDir: e.target.value })}
                      />
                    </label>
                  </div>

                  {voicePreviewUrl && (
                    <audio src={voicePreviewUrl} autoPlay controls style={{ width: '100%' }} />
                  )}

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      className="ui-button ui-button--primary"
                      onClick={async () => {
                        const saved = await fetch('/api/settings', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(settings),
                        }).then((r) => r.json());
                        setSettings(saved);
                        showNotice('Configurações salvas em data/settings.json e .env!');
                      }}
                    >
                      💾 Salvar Configurações (.env)
                    </button>
                  </div>
                </div>
              ) : (
                <div className="vs-cards-grid">
                  {integrations.map((item) => (
                    <div key={item.id} className="vs-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="ui-badge ui-badge--accent">{item.category}</span>
                        <span
                          className={`ui-badge ${
                            item.detected ? 'ui-badge--success' : 'ui-badge--warning'
                          }`}
                        >
                          {item.detected ? '✓ Detectado' : 'Opcional / Desligado'}
                        </span>
                      </div>
                      <strong style={{ fontSize: 16, color: 'var(--motion-strong)' }}>{item.name}</strong>
                      <p style={{ fontSize: 12, color: 'var(--motion-muted)', margin: 0 }}>
                        {item.description}
                      </p>
                      <div style={{ fontSize: 12 }}>
                        <strong>Status:</strong> {item.statusText}
                      </div>
                      <div
                        style={{
                          background: 'var(--motion-bg)',
                          padding: 8,
                          borderRadius: 6,
                          fontSize: 11,
                          fontFamily: 'var(--motion-font-mono)',
                        }}
                      >
                        {item.installInstructions}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                        <span style={{ fontSize: 11, color: 'var(--motion-dim)' }}>Licença: {item.license}</span>
                        <a
                          className="ui-text-link"
                          href={item.repoUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Repositório ↗
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
