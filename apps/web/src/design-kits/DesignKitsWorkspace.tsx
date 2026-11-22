/**
 * Área de Design Kits (Brand / Design System Multi-Engine)
 * Adaptado de OpenMotion Studio (Apache-2.0):
 * - /home/higorlino/openmotion/studio/src/motion/BrandKitPage.tsx
 * - /home/higorlino/openmotion/studio/src/motion/BrandKitDetail.tsx
 * - /home/higorlino/openmotion/studio/src/motion/BrandKitInspector.tsx
 * - /home/higorlino/openmotion/studio/src/motion/BrandKitLivePreview.tsx
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Character,
  DesignKit,
  DesignKitPalette,
  Project,
  Scene,
} from '@videos/core';
import { ThreeViewport } from '../components/ThreeViewport.tsx';

export interface DesignKitsWorkspaceProps {
  designKits: DesignKit[];
  activeProject: Project | null;
  activeCharacter: Character;
  onKitsChanged: () => Promise<void>;
  onApplyKitToProject: (kitId: string) => Promise<void>;
  showNotice: (msg: string) => void;
}

type InspectorTab = 'palette' | 'typography' | 'shapes' | 'references' | 'rules';

/**
 * Extrai paleta dominante localmente no navegador via Canvas 2D quando o usuário faz upload de uma imagem.
 */
async function extractColorsFromImageDataUrl(dataUrl: string): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 24;
      canvas.height = 24;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(['#f5c518', '#c1121f', '#0f172a', '#1e293b']);
        return;
      }
      ctx.drawImage(img, 0, 0, 24, 24);
      const { data } = ctx.getImageData(0, 0, 24, 24);
      const counts = new Map<string, number>();
      const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n / 24) * 24)).toString(16).padStart(2, '0');
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        const hex = `#${toHex(data[i])}${toHex(data[i + 1])}${toHex(data[i + 2])}`;
        counts.set(hex, (counts.get(hex) || 0) + 1);
      }
      const sorted = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([h]) => h);
      resolve(sorted.length > 0 ? sorted : ['#f5c518', '#c1121f', '#0f172a']);
    };
    img.onerror = () => resolve(['#f5c518', '#c1121f', '#0f172a']);
    img.src = dataUrl;
  });
}

export const DesignKitsWorkspace: React.FC<DesignKitsWorkspaceProps> = ({
  designKits,
  activeProject,
  activeCharacter,
  onKitsChanged,
  onApplyKitToProject,
  showNotice,
}) => {
  const [selectedKitId, setSelectedKitId] = useState<string>(
    activeProject?.designKitId || designKits[0]?.id || 'simulacao-2030'
  );
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('palette');
  const [previewEngineTab, setPreviewEngineTab] = useState<'scene3d' | 'kinetic' | 'freeform'>('scene3d');
  const [busy, setBusy] = useState<boolean>(false);

  // Formulário de nova referência (moodboard)
  const [refTitle, setRefTitle] = useState<string>('');
  const [refKind, setRefKind] = useState<'image' | 'video' | 'link'>('image');
  const [refUrlOrPath, setRefUrlOrPath] = useState<string>('/renders/simulacao-demo.mp4');
  const [refNotes, setRefNotes] = useState<string>('');
  const [refRunBreakdown, setRefRunBreakdown] = useState<boolean>(true);
  const [newRuleText, setNewRuleText] = useState<string>('');

  const importJsonInputRef = useRef<HTMLInputElement | null>(null);
  const refFileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedKit = useMemo(
    () => designKits.find((k) => k.id === selectedKitId) || designKits[0] || null,
    [designKits, selectedKitId]
  );

  useEffect(() => {
    if (!selectedKit && designKits[0]) {
      setSelectedKitId(designKits[0].id);
    }
  }, [designKits, selectedKit]);

  // Cena de amostra para o Preview 3D ao vivo do Design Kit
  const previewSampleScene: Scene = useMemo(() => {
    if (activeProject && activeProject.scenes.length > 0) {
      return activeProject.scenes[0];
    }
    return {
      id: 'kit-preview-scene',
      order: 0,
      narration: 'Na nossa simulação de dois mil e trinta, o Design Kit transforma todo o visual.',
      duration: 4.0,
      template: 'red-carpet-confetti',
      templateProps: {},
      characterId: activeCharacter.id,
      secondaryCharacterIds: [],
      pose: 'celebrating',
      camera: 'dolly-in',
      transition: 'cut',
      overlays: [
        {
          type: 'title',
          subtitle: 'DESIGN KIT PREVIEW',
          text: 'IDENTIDADE VISUAL 2030',
          highlightWord: '2030',
          position: 'top',
          boxed: selectedKit?.overlayPreset.titleBoxed ?? false,
        },
        {
          type: 'badge',
          text: 'NA NOSSA SIMULAÇÃO',
          icon: '⚠',
          color: selectedKit?.palette.primary || '#f5c518',
        },
        {
          type: 'lower-third',
          name: activeCharacter.name.toUpperCase(),
          subtitle: activeCharacter.role.toUpperCase(),
        },
      ],
      objectOverrides: {},
      highlightWords: ['simulação', 'visual'],
      sfx: 'cheer',
    };
  }, [activeProject, activeCharacter, selectedKit]);

  const handlePatchKit = async (patch: Partial<DesignKit>, noticeMsg?: string) => {
    if (!selectedKit) return;
    await fetch(`/api/design-kits/${selectedKit.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await onKitsChanged();
    if (noticeMsg) showNotice(noticeMsg);
  };

  const handleCreateNewKit = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/design-kits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Novo Design Kit ${designKits.length + 1}`,
          description: 'Identidade visual customizada para vídeos curtos verticais 9:16.',
          category: 'Customizado',
        }),
      }).then((r) => r.json());
      await onKitsChanged();
      setSelectedKitId(res.id);
      showNotice(`Design Kit "${res.name}" criado!`);
    } finally {
      setBusy(false);
    }
  };

  const handleExportKitJson = () => {
    if (!selectedKit) return;
    const blob = new Blob([JSON.stringify(selectedKit, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `design-kit-${selectedKit.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    showNotice(`Design Kit "${selectedKit.name}" exportado como JSON!`);
  };

  const handleImportKitJson = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await fetch('/api/design-kits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...parsed,
          id: parsed.id || undefined,
          name: parsed.name || file.name.replace(/\.json$/i, ''),
        }),
      }).then((r) => r.json());
      await onKitsChanged();
      setSelectedKitId(res.id);
      showNotice(`Design Kit "${res.name}" importado com sucesso!`);
    } catch (err) {
      showNotice(`Erro ao importar JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleUploadReferenceFile = async (file: File) => {
    if (!selectedKit) return;
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
        reader.readAsDataURL(file);
      });
      const isVideo = file.type.startsWith('video/') || file.name.endsWith('.mp4');
      const dominantColors = !isVideo ? await extractColorsFromImageDataUrl(dataUrl) : [];

      await fetch(`/api/design-kits/${selectedKit.id}/references`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: isVideo ? 'video' : 'image',
          title: refTitle || file.name,
          filename: file.name,
          base64Data: dataUrl,
          notes: refNotes || 'Referência adicionada ao moodboard.',
          dominantColors,
          runBreakdown: isVideo && refRunBreakdown,
        }),
      });
      setRefTitle('');
      setRefNotes('');
      await onKitsChanged();
      showNotice(`Referência "${file.name}" anexada ao moodboard!`);
    } finally {
      setBusy(false);
    }
  };

  const handleAddReferenceByPathOrLink = async () => {
    if (!selectedKit || !refUrlOrPath.trim()) return;
    setBusy(true);
    try {
      await fetch(`/api/design-kits/${selectedKit.id}/references`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: refKind,
          title: refTitle || (refKind === 'video' ? 'Vídeo de Referência' : 'Referência Visual'),
          urlOrPath: refUrlOrPath.trim(),
          notes: refNotes,
          runBreakdown: refKind === 'video' && refRunBreakdown,
        }),
      });
      setRefTitle('');
      setRefNotes('');
      await onKitsChanged();
      showNotice('Referência adicionada ao Design Kit!');
    } finally {
      setBusy(false);
    }
  };

  const handleGeneratePaletteFromReferences = async () => {
    if (!selectedKit) return;
    setBusy(true);
    try {
      await fetch(`/api/design-kits/${selectedKit.id}/generate-from-references`, {
        method: 'POST',
      });
      await onKitsChanged();
      showNotice('Paleta e tokens gerados localmente a partir das referências do moodboard!');
    } finally {
      setBusy(false);
    }
  };

  if (!selectedKit) return null;

  return (
    <div
      data-testid="design-kits-workspace"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* Cabeçalho da Área Design Kits (Estilo OpenMotion BrandKitPage) */}
      <div
        className="vs-card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          padding: '14px 18px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="om-badge">DESIGN KITS · MULTI-ENGINE</span>
            <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>
              Design Kits & Identidade Visual (9:16)
            </h2>
          </div>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            Gerencie paletas semânticas, tipografia, safe areas, moodboard com breakdown Rea-Video e aplique a qualquer projeto sem editar cena por cena.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="om-button"
            data-testid="create-design-kit-btn"
            disabled={busy}
            onClick={() => void handleCreateNewKit()}
          >
            + Novo Design Kit
          </button>
          <button
            type="button"
            className="om-button"
            onClick={() => importJsonInputRef.current?.click()}
          >
            📥 Importar JSON
          </button>
          <input
            ref={importJsonInputRef}
            type="file"
            accept=".json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportKitJson(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="om-button"
            data-testid="export-design-kit-btn"
            onClick={handleExportKitJson}
          >
            📤 Exportar JSON
          </button>
          {activeProject && (
            <button
              type="button"
              className="om-button"
              data-primary
              data-testid="apply-kit-to-active-project-btn"
              onClick={() => void onApplyKitToProject(selectedKit.id)}
            >
              ✓ Aplicar "{selectedKit.name}" ao Projeto ({activeProject.id})
            </button>
          )}
        </div>
      </div>

      {/* Cards de Seleção Rápida dos Design Kits (Simulação 2030, Editorial Minimal, Custom...) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 12,
        }}
      >
        {designKits.map((kit) => {
          const isSelected = kit.id === selectedKit.id;
          const isApplied = activeProject?.designKitId === kit.id;
          return (
            <div
              key={kit.id}
              data-testid={`design-kit-card-${kit.id}`}
              onClick={() => setSelectedKitId(kit.id)}
              style={{
                padding: 14,
                borderRadius: 12,
                background: isSelected
                  ? 'linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))'
                  : 'rgba(15, 23, 42, 0.65)',
                border: isSelected
                  ? `2px solid ${kit.palette.primary}`
                  : '1px solid rgba(255,255,255,0.1)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="om-badge">{kit.category}</span>
                {isApplied && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 900,
                      background: '#22c55e',
                      color: '#090d16',
                      padding: '2px 7px',
                      borderRadius: 99,
                    }}
                  >
                    ATIVO NO PROJETO
                  </span>
                )}
              </div>

              <div>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#f8fafc' }}>{kit.name}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                  {kit.description.slice(0, 115)}
                </div>
              </div>

              {/* Faixa de Swatches da Paleta */}
              <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)' }}>
                {[
                  kit.palette.background,
                  kit.palette.surface,
                  kit.palette.primary,
                  kit.palette.accent,
                  kit.palette.text,
                  ...(kit.palette.extraSwatches?.slice(0, 3) || []),
                ].map((c, ci) => (
                  <div key={ci} style={{ flex: 1, background: c }} title={c} />
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#cbd5e1' }}>
                <span>
                  Fontes: <strong>{kit.typography.headingFont}</strong> + {kit.typography.bodyFont}
                </span>
                <span>Raio: {kit.borderRadius}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Layout Principal do Kit Selecionado: Preview Ao Vivo Multi-Engine (Esquerda) + Inspector (Direita) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '410px 1fr',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {/* ------------------------------------------------------------------
            COLUNA ESQUERDA: PREVIEW AO VIVO DO KIT NOS 3 ENGINES + OVERLAYS
           ------------------------------------------------------------------ */}
        <div className="vs-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: selectedKit.palette.primary }}>
              PREVIEW AO VIVO · {selectedKit.name.toUpperCase()}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['scene3d', 'kinetic', 'freeform'] as const).map((eng) => (
                <button
                  key={eng}
                  type="button"
                  data-testid={`kit-preview-engine-${eng}`}
                  onClick={() => setPreviewEngineTab(eng)}
                  style={{
                    padding: '3px 8px',
                    fontSize: 10,
                    fontWeight: 800,
                    borderRadius: 5,
                    border: 'none',
                    cursor: 'pointer',
                    background: previewEngineTab === eng ? selectedKit.palette.primary : 'rgba(30,41,59,0.7)',
                    color: previewEngineTab === eng ? selectedKit.palette.textOnPrimary : '#cbd5e1',
                  }}
                >
                  {eng}
                </button>
              ))}
            </div>
          </div>

          {/* Preview 9:16 por Engine */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {previewEngineTab === 'scene3d' ? (
              <ThreeViewport
                mode="scene"
                scene={previewSampleScene}
                character={activeCharacter}
                captionStyle={selectedKit.captionPreset}
                designKit={selectedKit}
                isPlaying={false}
                currentTime={1.2}
                showSafeAreas={true}
              />
            ) : previewEngineTab === 'kinetic' ? (
              <div
                className="vs-phone-viewport"
                style={{
                  background: selectedKit.palette.background,
                  color: selectedKit.palette.text,
                  padding: 28,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: 14,
                }}
              >
                <div
                  style={{
                    alignSelf: 'flex-start',
                    background: selectedKit.palette.primary,
                    color: selectedKit.palette.textOnPrimary,
                    fontFamily: selectedKit.typography.headingFont,
                    fontSize: 32,
                    fontWeight: 900,
                    padding: '4px 16px',
                    borderRadius: selectedKit.borderRadius,
                    boxShadow: selectedKit.shadowStyle,
                  }}
                >
                  #1
                </div>
                <h2
                  style={{
                    fontFamily: selectedKit.typography.headingFont,
                    fontSize: 38,
                    lineHeight: 1.05,
                    textTransform: selectedKit.typography.uppercaseHeadings ? 'uppercase' : 'none',
                  }}
                >
                  TOP 5 TECNOLOGIAS <span style={{ color: selectedKit.palette.primary }}>2030</span>
                </h2>
                <div
                  style={{
                    background: selectedKit.palette.surface,
                    color: selectedKit.palette.text,
                    padding: '12px 14px',
                    borderRadius: selectedKit.borderRadius,
                    boxShadow: selectedKit.shadowStyle,
                    borderLeft: `5px solid ${selectedKit.palette.primary}`,
                    fontFamily: selectedKit.typography.bodyFont,
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  • Agentes Autônomos via MCP
                </div>
                <div
                  style={{
                    background: selectedKit.palette.surface,
                    color: selectedKit.palette.text,
                    padding: '12px 14px',
                    borderRadius: selectedKit.borderRadius,
                    boxShadow: selectedKit.shadowStyle,
                    borderLeft: `5px solid ${selectedKit.palette.accent}`,
                    fontFamily: selectedKit.typography.bodyFont,
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  • Renderização Determinística 9:16
                </div>
              </div>
            ) : (
              <div
                className="vs-phone-viewport"
                style={{
                  background: selectedKit.palette.background,
                  color: selectedKit.palette.text,
                  padding: 24,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div
                  style={{
                    display: 'inline-block',
                    alignSelf: 'flex-start',
                    background: selectedKit.palette.primary,
                    color: selectedKit.palette.textOnPrimary,
                    fontFamily: selectedKit.typography.headingFont,
                    padding: '4px 12px',
                    borderRadius: selectedKit.borderRadius,
                    fontSize: 13,
                    fontWeight: 900,
                  }}
                >
                  FREEFORM · {selectedKit.name.toUpperCase()}
                </div>
                <div
                  style={{
                    background: selectedKit.palette.surface,
                    border: `2px solid ${selectedKit.palette.primary}`,
                    borderRadius: selectedKit.borderRadius,
                    boxShadow: selectedKit.shadowStyle,
                    padding: 18,
                  }}
                >
                  <div style={{ fontFamily: selectedKit.typography.headingFont, fontSize: 28, color: selectedKit.palette.primary }}>
                    +340% RETENÇÃO
                  </div>
                  <div style={{ fontFamily: selectedKit.typography.bodyFont, fontSize: 12, color: selectedKit.palette.muted, marginTop: 4 }}>
                    Tokens CSS <code>--dk-primary</code> e <code>--dk-surface</code> aplicados automaticamente.
                  </div>
                </div>
                <div
                  style={{
                    alignSelf: 'center',
                    background: selectedKit.palette.primary,
                    color: selectedKit.palette.textOnPrimary,
                    fontFamily: selectedKit.typography.bodyFont,
                    fontWeight: 900,
                    padding: '4px 12px',
                    borderRadius: selectedKit.borderRadius,
                    fontSize: 15,
                  }}
                >
                  legenda ativa
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------------------
            COLUNA DIREITA: INSPECTOR COMPLETO DO DESIGN KIT (5 ABAS)
           ------------------------------------------------------------------ */}
        <div className="vs-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Metadados básicos do Kit */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 10 }}>
            <label style={{ fontSize: 11, color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>Nome do Design Kit</span>
              <input
                className="vs-input"
                value={selectedKit.name}
                onChange={(e) => void handlePatchKit({ name: e.target.value })}
              />
            </label>
            <label style={{ fontSize: 11, color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>Categoria</span>
              <input
                className="vs-input"
                value={selectedKit.category}
                onChange={(e) => void handlePatchKit({ category: e.target.value })}
              />
            </label>
          </div>

          {/* Navegação de Abas do Inspector */}
          <div
            role="tablist"
            style={{
              display: 'flex',
              gap: 6,
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              paddingBottom: 8,
              flexWrap: 'wrap',
            }}
          >
            {(
              [
                ['palette', '🎨 Paleta & Papéis de Cor'],
                ['typography', '🔤 Tipografia & Escala'],
                ['shapes', '📐 Safe Areas, Overlays & 3D'],
                ['references', `🖼 Referências & Rea-Video (${selectedKit.references.length})`],
                ['rules', `📋 Regras & Tom de Voz (${selectedKit.rules.length})`],
              ] as const
            ).map(([tabId, label]) => (
              <button
                key={tabId}
                type="button"
                role="tab"
                data-testid={`kit-tab-${tabId}`}
                onClick={() => setInspectorTab(tabId)}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 800,
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  background:
                    inspectorTab === tabId ? selectedKit.palette.primary : 'rgba(30, 41, 59, 0.7)',
                  color:
                    inspectorTab === tabId ? selectedKit.palette.textOnPrimary : '#e2e8f0',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ABA 1: PALETA SEMÂNTICA */}
          {inspectorTab === 'palette' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))',
                  gap: 10,
                }}
              >
                {(
                  [
                    ['primary', 'Primária / Destaque'],
                    ['accent', 'Acento / Secundária'],
                    ['background', 'Fundo Principal'],
                    ['surface', 'Superfície / Tarjas'],
                    ['text', 'Texto Principal'],
                    ['textOnPrimary', 'Texto sobre Primária'],
                    ['muted', 'Texto Secundário'],
                    ['danger', 'Perigo / Alerta'],
                    ['success', 'Sucesso / Dados +'],
                  ] as Array<[keyof DesignKitPalette, string]>
                ).map(([roleKey, roleLabel]) => {
                  const val = String(selectedKit.palette[roleKey] || '#000000');
                  return (
                    <div
                      key={roleKey}
                      style={{
                        padding: 10,
                        borderRadius: 9,
                        background: 'rgba(30, 41, 59, 0.5)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <input
                        type="color"
                        value={val.startsWith('#') && val.length === 7 ? val : '#f5c518'}
                        onChange={(e) =>
                          void handlePatchKit(
                            {
                              palette: {
                                ...selectedKit.palette,
                                [roleKey]: e.target.value,
                              },
                            },
                            `Cor ${roleLabel} atualizada`
                          )
                        }
                        style={{
                          width: 34,
                          height: 34,
                          padding: 0,
                          flexShrink: 0,
                          border: '2px solid rgba(255,255,255,0.28)',
                          borderRadius: 6,
                          cursor: 'pointer',
                          background: val,
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#f8fafc' }}>{roleLabel}</div>
                        <input
                          className="vs-input"
                          style={{ padding: '2px 6px', fontSize: 11, marginTop: 3 }}
                          value={val}
                          onChange={(e) =>
                            void handlePatchKit({
                              palette: {
                                ...selectedKit.palette,
                                [roleKey]: e.target.value,
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ABA 2: TIPOGRAFIA & ESCALA */}
          {inspectorTab === 'typography' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <label style={{ fontSize: 11, color: '#94a3b8' }}>
                  Fonte de Títulos (Heading)
                  <select
                    className="vs-select"
                    value={selectedKit.typography.headingFont}
                    onChange={(e) =>
                      void handlePatchKit(
                        {
                          typography: { ...selectedKit.typography, headingFont: e.target.value },
                        },
                        `Fonte de título alterada para ${e.target.value}`
                      )
                    }
                  >
                    <option value="Anton">Anton (Condensada Impacto)</option>
                    <option value="Bebas Neue">Bebas Neue (Editorial Display)</option>
                    <option value="Inter">Inter ExtraBold</option>
                  </select>
                </label>

                <label style={{ fontSize: 11, color: '#94a3b8' }}>
                  Fonte de Corpo & Legendas
                  <select
                    className="vs-select"
                    value={selectedKit.typography.bodyFont}
                    onChange={(e) =>
                      void handlePatchKit({
                        typography: { ...selectedKit.typography, bodyFont: e.target.value },
                      })
                    }
                  >
                    <option value="Inter">Inter</option>
                    <option value="Albert Sans">Albert Sans</option>
                    <option value="IBM Plex Mono">IBM Plex Mono</option>
                  </select>
                </label>

                <label style={{ fontSize: 11, color: '#94a3b8' }}>
                  Tamanho Título Base (720p)
                  <input
                    type="number"
                    className="vs-input"
                    value={selectedKit.typography.titleFontSize}
                    onChange={(e) =>
                      void handlePatchKit({
                        typography: {
                          ...selectedKit.typography,
                          titleFontSize: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              </div>

              {/* Espécime Tipográfico Ao Vivo */}
              <div
                style={{
                  padding: 16,
                  borderRadius: 10,
                  background: selectedKit.palette.background,
                  color: selectedKit.palette.text,
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
              >
                <div style={{ fontSize: 10, color: selectedKit.palette.muted, fontWeight: 800 }}>
                  ESPÉCIME TIPOGRÁFICO · {selectedKit.typography.headingFont.toUpperCase()}
                </div>
                <div
                  style={{
                    fontFamily: selectedKit.typography.headingFont,
                    fontSize: 34,
                    letterSpacing: selectedKit.typography.letterSpacing,
                    textTransform: selectedKit.typography.uppercaseHeadings ? 'uppercase' : 'none',
                    marginTop: 4,
                  }}
                >
                  Aa Bb Cc · <span style={{ color: selectedKit.palette.primary }}>SIMULAÇÃO 2030</span> · 0123456789
                </div>
              </div>
            </div>
          )}

          {/* ABA 3: SAFE AREAS 9:16, RAIOS, SOMBRAS, OVERLAYS E CENA 3D */}
          {inspectorTab === 'shapes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                <label style={{ fontSize: 11, color: '#94a3b8' }}>
                  Safe Area Topo (px)
                  <input
                    type="number"
                    className="vs-input"
                    value={selectedKit.safeArea.topPx}
                    onChange={(e) =>
                      void handlePatchKit({
                        safeArea: { ...selectedKit.safeArea, topPx: Number(e.target.value) },
                      })
                    }
                  />
                </label>
                <label style={{ fontSize: 11, color: '#94a3b8' }}>
                  Safe Area Base (px)
                  <input
                    type="number"
                    className="vs-input"
                    value={selectedKit.safeArea.bottomPx}
                    onChange={(e) =>
                      void handlePatchKit({
                        safeArea: { ...selectedKit.safeArea, bottomPx: Number(e.target.value) },
                      })
                    }
                  />
                </label>
                <label style={{ fontSize: 11, color: '#94a3b8' }}>
                  Margem Esq/Dir (px)
                  <input
                    type="number"
                    className="vs-input"
                    value={selectedKit.safeArea.leftPx}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      void handlePatchKit({
                        safeArea: { ...selectedKit.safeArea, leftPx: v, rightPx: v },
                      });
                    }}
                  />
                </label>
                <label style={{ fontSize: 11, color: '#94a3b8' }}>
                  Raio de Borda
                  <input
                    type="text"
                    className="vs-input"
                    value={selectedKit.borderRadius}
                    onChange={(e) => void handlePatchKit({ borderRadius: e.target.value })}
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <label style={{ fontSize: 11, color: '#94a3b8' }}>
                  Parede 3D Padrão (Scene3D)
                  <input
                    type="text"
                    className="vs-input"
                    value={selectedKit.scene3dPreset.wallColor}
                    onChange={(e) =>
                      void handlePatchKit({
                        scene3dPreset: { ...selectedKit.scene3dPreset, wallColor: e.target.value },
                      })
                    }
                  />
                </label>
                <label style={{ fontSize: 11, color: '#94a3b8' }}>
                  Piso 3D Padrão (Scene3D)
                  <input
                    type="text"
                    className="vs-input"
                    value={selectedKit.scene3dPreset.floorColor}
                    onChange={(e) =>
                      void handlePatchKit({
                        scene3dPreset: { ...selectedKit.scene3dPreset, floorColor: e.target.value },
                      })
                    }
                  />
                </label>
                <label style={{ fontSize: 11, color: '#94a3b8' }}>
                  Duração Alvo de Cena (s)
                  <input
                    type="number"
                    step={0.5}
                    className="vs-input"
                    value={selectedKit.pacing.targetSceneDuration}
                    onChange={(e) =>
                      void handlePatchKit({
                        pacing: {
                          ...selectedKit.pacing,
                          targetSceneDuration: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              </div>
            </div>
          )}

          {/* ABA 4: MOODBOARD DE REFERÊNCIAS + BREAKDOWN REA-VIDEO + EXTRAÇÃO DE PALETA */}
          {inspectorTab === 'references' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 800, color: '#e2e8f0' }}>
                  Moodboard de Referências (Imagens, Vídeos com Rea-Video Breakdown & Links)
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="om-button"
                    disabled={busy}
                    onClick={() => refFileInputRef.current?.click()}
                  >
                    📤 Upload Imagem/Vídeo
                  </button>
                  <input
                    ref={refFileInputRef}
                    type="file"
                    accept="image/*,video/mp4"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUploadReferenceFile(f);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    className="om-button"
                    data-primary
                    data-testid="extract-palette-from-refs-btn"
                    disabled={busy}
                    onClick={() => void handleGeneratePaletteFromReferences()}
                  >
                    ✨ Extrair Paleta Dominante das Referências
                  </button>
                </div>
              </div>

              {/* Adicionar referência por caminho local ou link */}
              <div
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'grid',
                  gridTemplateColumns: '110px 1fr 1.2fr auto',
                  gap: 8,
                  alignItems: 'end',
                }}
              >
                <label style={{ fontSize: 10, color: '#94a3b8' }}>
                  Tipo
                  <select
                    className="vs-select"
                    value={refKind}
                    onChange={(e) => setRefKind(e.target.value as any)}
                  >
                    <option value="video">Vídeo MP4</option>
                    <option value="image">Imagem</option>
                    <option value="link">Link Web</option>
                  </select>
                </label>
                <label style={{ fontSize: 10, color: '#94a3b8' }}>
                  Título / Nota
                  <input
                    className="vs-input"
                    placeholder="Ex: Corte Rápido Episódio 1"
                    value={refTitle}
                    onChange={(e) => setRefTitle(e.target.value)}
                  />
                </label>
                <label style={{ fontSize: 10, color: '#94a3b8' }}>
                  Caminho ou URL
                  <input
                    className="vs-input"
                    value={refUrlOrPath}
                    onChange={(e) => setRefUrlOrPath(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="om-button"
                  disabled={busy}
                  onClick={() => void handleAddReferenceByPathOrLink()}
                >
                  + Anexar
                </button>
              </div>

              {/* Lista de Referências do Moodboard */}
              {selectedKit.references.map((ref) => (
                <div
                  key={ref.id}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: 'rgba(30, 41, 59, 0.55)',
                    border: '1px solid rgba(255,255,255,0.09)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="om-badge">{ref.kind.toUpperCase()}</span>
                      <strong style={{ fontSize: 13 }}>{ref.title}</strong>
                      <code style={{ fontSize: 10, color: '#94a3b8' }}>{ref.urlOrPath}</code>
                    </div>
                    {ref.notes && (
                      <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 4 }}>{ref.notes}</div>
                    )}
                    {ref.breakdownSummary && (
                      <div
                        style={{
                          fontSize: 11,
                          color: '#38bdf8',
                          marginTop: 4,
                          background: 'rgba(56, 189, 248, 0.1)',
                          padding: '4px 8px',
                          borderRadius: 6,
                        }}
                      >
                        🎬 Ficha Rea-Video: {ref.breakdownSummary}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(ref.dominantColors || []).map((c, ci) => (
                      <span
                        key={ci}
                        title={c}
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          background: c,
                          border: '1px solid rgba(255,255,255,0.4)',
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ABA 5: REGRAS LIVRES EM TEXTO & TOM DE VOZ */}
          {inspectorTab === 'rules' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ fontSize: 11, color: '#94a3b8' }}>
                Tom de Voz & Narração (Orientação para o Agente MCP)
                <input
                  className="vs-input"
                  value={selectedKit.voiceTone}
                  onChange={(e) => void handlePatchKit({ voiceTone: e.target.value })}
                />
              </label>

              <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', marginTop: 4 }}>
                REGRAS LIVRES DO DESIGN KIT ({selectedKit.rules.length})
              </div>
              {selectedKit.rules.map((rule, rIdx) => (
                <div
                  key={rIdx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(30, 41, 59, 0.55)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    fontSize: 12,
                  }}
                >
                  <span>• {rule}</span>
                  <button
                    type="button"
                    className="om-button"
                    style={{ fontSize: 10, padding: '2px 7px' }}
                    onClick={() =>
                      void handlePatchKit(
                        {
                          rules: selectedKit.rules.filter((_, i) => i !== rIdx),
                        },
                        'Regra removida'
                      )
                    }
                  >
                    ✕
                  </button>
                </div>
              ))}

              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="vs-input"
                  placeholder="Adicionar nova regra livre (ex: Nunca usar vermelho sobre fundo azul)..."
                  value={newRuleText}
                  onChange={(e) => setNewRuleText(e.target.value)}
                />
                <button
                  type="button"
                  className="om-button"
                  data-primary
                  onClick={() => {
                    if (!newRuleText.trim()) return;
                    void handlePatchKit(
                      { rules: [...selectedKit.rules, newRuleText.trim()] },
                      'Nova regra adicionada ao Design Kit!'
                    );
                    setNewRuleText('');
                  }}
                >
                  + Adicionar Regra
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
