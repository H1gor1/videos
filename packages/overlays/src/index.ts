import type {
  CaptionStyle,
  DesignKit,
  OverlayItem,
  TransitionType,
  WordTimestamp,
} from '@kinema/core';

export interface CaptionGroup {
  id: string;
  start: number;
  end: number;
  words: Array<{
    word: string;
    start: number;
    end: number;
    highlighted?: boolean;
  }>;
}

export interface OverlayLayoutZones {
  top: {
    topPx: number;
    maxBottomPx: number;
  };
  lowerMiddle: {
    topPx: number;
    maxBottomPx: number;
    cssBottomPx: number;
  };
  bottom: {
    topPx: number;
    maxBottomPx: number;
    topPercent: number;
  };
  minGapPx: number;
}

/**
 * Calcula as 3 zonas verticais de layout (topo: títulos/badges; meio-inferior: lower-third/tarja;
 * base: legendas) evitando automaticamente qualquer colisão vertical entre elas.
 */
export function computeOverlayLayoutZones(
  captionStyle: CaptionStyle,
  width = 720,
  height = 1280
): OverlayLayoutZones {
  const scale = width / 720;
  const minGapPx = Math.round(44 * scale);

  // Zona 1: Topo (títulos, subtítulos, badges e tarjas superiores) — ~5.5% a ~23% da altura
  const topZoneTopPx = Math.round(72 * scale);
  const topZoneMaxBottomPx = Math.round(height * 0.235);

  // Zona 3: Base (legendas word-by-word) — ancorada na faixa inferior segura (82%..90%)
  const requestedPct = captionStyle?.positionY ?? 83;
  const safeCaptionTopPct = Math.max(82, Math.min(89, requestedPct));
  const captionTopPx = Math.round((safeCaptionTopPct / 100) * height);
  const estimatedCaptionHeightPx = Math.round(((captionStyle?.fontSize || 32) * 2.1 + 22) * scale);
  const captionMaxBottomPx = Math.min(
    height - Math.round(22 * scale),
    captionTopPx + estimatedCaptionHeightPx
  );

  // Zona 2: Meio-Inferior (lower-third / tarja de identificação) — sempre acima da legenda com folga >= minGapPx
  const estimatedLowerThirdHeightPx = Math.round(82 * scale);
  const desiredLowerMiddleBottomPx = Math.round(height * 0.725);
  const lowerMiddleMaxBottomPx = Math.min(
    desiredLowerMiddleBottomPx,
    captionTopPx - minGapPx
  );
  const lowerMiddleTopPx = lowerMiddleMaxBottomPx - estimatedLowerThirdHeightPx;
  const lowerMiddleCssBottomPx = Math.max(
    Math.round(height * 0.26),
    height - lowerMiddleMaxBottomPx
  );

  return {
    top: {
      topPx: topZoneTopPx,
      maxBottomPx: topZoneMaxBottomPx,
    },
    lowerMiddle: {
      topPx: lowerMiddleTopPx,
      maxBottomPx: lowerMiddleMaxBottomPx,
      cssBottomPx: lowerMiddleCssBottomPx,
    },
    bottom: {
      topPx: captionTopPx,
      maxBottomPx: captionMaxBottomPx,
      topPercent: Number(((captionTopPx / height) * 100).toFixed(2)),
    },
    minGapPx,
  };
}

/**
 * Agrupa timestamps palavra a palavra em blocos de `wordsPerGroup` (2–3 palavras)
 * garantindo ausência total de sobreposição temporal entre palavras e entre grupos consecutivos.
 */
export function buildWordCaptionGroups(
  words: WordTimestamp[],
  wordsPerGroup = 3
): CaptionGroup[] {
  if (!words || words.length === 0) return [];
  const step = Math.max(1, Math.min(6, wordsPerGroup));

  // Preserva detecção de pausas reais de transição de cena (> 0.22s) nos timestamps brutos
  const sceneBreakBefore = new Array<boolean>(words.length).fill(false);
  for (let i = 1; i < words.length; i++) {
    if (words[i].start - words[i - 1].end > 0.22) {
      sceneBreakBefore[i] = true;
    }
  }

  // Sanitiza timestamps para eliminar sobreposições do provedor TTS (ex.: Edge TTS onde prev.end > next.start)
  const sanitized: WordTimestamp[] = words.map((w) => ({
    word: w.word,
    start: Number(Math.max(0, w.start).toFixed(3)),
    end: Number(Math.max(w.start + 0.03, w.end).toFixed(3)),
    highlighted: w.highlighted,
  }));

  for (let i = 0; i < sanitized.length; i++) {
    if (i > 0 && sanitized[i].start < sanitized[i - 1].start + 0.015) {
      sanitized[i].start = Number((sanitized[i - 1].start + 0.015).toFixed(3));
    }
    if (i + 1 < sanitized.length && sanitized[i].end > sanitized[i + 1].start) {
      sanitized[i].end = Number(
        Math.max(sanitized[i].start + 0.01, sanitized[i + 1].start).toFixed(3)
      );
    }
    if (sanitized[i].end <= sanitized[i].start) {
      sanitized[i].end = Number((sanitized[i].start + 0.015).toFixed(3));
    }
  }

  for (let i = 0; i < sanitized.length - 1; i++) {
    if (sanitized[i + 1].start < sanitized[i].end) {
      sanitized[i + 1].start = sanitized[i].end;
    }
    if (sanitized[i + 1].end <= sanitized[i + 1].start) {
      sanitized[i + 1].end = Number((sanitized[i + 1].start + 0.015).toFixed(3));
    }
  }

  const groups: CaptionGroup[] = [];
  let currentChunk: WordTimestamp[] = [];

  const flushChunk = () => {
    if (currentChunk.length === 0) return;
    const start = currentChunk[0].start;
    const end = currentChunk[currentChunk.length - 1].end;
    groups.push({
      id: `cap-group-${groups.length}`,
      start: Number(start.toFixed(3)),
      end: Number(Math.max(start + 0.02, end).toFixed(3)),
      words: currentChunk.map((w) => ({
        word: w.word,
        start: Number(w.start.toFixed(3)),
        end: Number(Math.max(w.start + 0.01, w.end).toFixed(3)),
        highlighted: w.highlighted,
      })),
    });
    currentChunk = [];
  };

  for (let i = 0; i < sanitized.length; i++) {
    const word = sanitized[i];
    if (currentChunk.length > 0 && (sceneBreakBefore[i] || currentChunk.length >= step)) {
      flushChunk();
    }
    currentChunk.push(word);
  }
  flushChunk();

  // Passagem final: garante invariante estrito groups[i].end <= groups[i + 1].start
  for (let i = 0; i < groups.length - 1; i++) {
    const curr = groups[i];
    const next = groups[i + 1];
    if (curr.end > next.start) {
      curr.end = Number(Math.max(curr.start + 0.01, next.start).toFixed(3));
      const lastWord = curr.words[curr.words.length - 1];
      if (lastWord && lastWord.end > curr.end) {
        lastWord.end = curr.end;
      }
    }
    if (next.start < curr.end) {
      next.start = curr.end;
      if (next.words[0] && next.words[0].start < next.start) {
        next.words[0].start = next.start;
        if (next.words[0].end <= next.words[0].start) {
          next.words[0].end = Number((next.words[0].start + 0.015).toFixed(3));
        }
      }
      if (next.end <= next.start) {
        next.end = Number((next.start + 0.02).toFixed(3));
      }
    }
  }

  return groups;
}

/**
 * Gera timestamps proporcionais por palavra (ponderado pelo comprimento de caracteres)
 * quando o provedor TTS não emite word boundaries nativos.
 */
export function estimateProportionalWordTimestamps(
  narration: string,
  durationSeconds: number,
  highlightWords: string[] = []
): WordTimestamp[] {
  const tokens = narration
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return [];

  const highlightSet = new Set(
    highlightWords.map((w) => w.toLowerCase().replace(/[.,!?;:"]/g, ''))
  );
  const usableDuration = Math.max(0.4, durationSeconds - 0.15);
  const weights = tokens.map((t) => Math.max(2, t.length));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  let cursor = 0.05;
  return tokens.map((token, idx) => {
    const slice = (weights[idx] / totalWeight) * usableDuration;
    const start = Number(cursor.toFixed(3));
    const end = Number((cursor + slice).toFixed(3));
    cursor += slice;
    const clean = token.toLowerCase().replace(/[.,!?;:"]/g, '');
    return {
      word: token,
      start,
      end,
      highlighted: highlightSet.has(clean),
    };
  });
}

/**
 * Gera o CSS completo para fontes locais (@fontsource) e overlays 2D parametrizado pelo DesignKit.
 */
export function generateOverlaysCss(
  captionStyle: CaptionStyle,
  width = 720,
  height = 1280,
  designKit?: DesignKit
): string {
  const scale = width / 720;
  const capFontSize = Math.round((captionStyle.fontSize || designKit?.typography.captionFontSize || 32) * scale);
  const zones = computeOverlayLayoutZones(captionStyle, width, height);

  const primary = designKit?.palette.primary || captionStyle.highlightColor || '#f5c518';
  const accent = designKit?.palette.accent || '#c1121f';
  const bg = designKit?.palette.background || '#0f172a';
  const surface = designKit?.palette.surface || 'rgba(15, 23, 42, 0.94)';
  const text = designKit?.palette.text || captionStyle.textColor || '#ffffff';
  const textOnPrimary = designKit?.palette.textOnPrimary || '#111827';
  const muted = designKit?.palette.muted || '#94a3b8';
  const headingFont = designKit?.typography.headingFont || 'Anton';
  const bodyFont = designKit?.typography.bodyFont || 'Inter';
  const titleFontSize = Math.round((designKit?.typography.titleFontSize || 58) * scale);
  const radius = designKit?.borderRadius || `${Math.round(8 * scale)}px`;
  const shadow = designKit?.shadowStyle || '0 10px 28px rgba(0, 0, 0, 0.55)';
  const ltBorderW = Math.round((designKit?.overlayPreset.lowerThirdBorderWidth ?? 6) * scale);
  const badgeBorderW = Math.round((designKit?.overlayPreset.badgeBorderWidth ?? 2) * scale);
  const uppercaseRule = designKit?.typography.uppercaseHeadings === false ? 'none' : 'uppercase';
  const letterSpacing = designKit?.typography.letterSpacing || '0.02em';

  return `
@font-face {
  font-family: "Anton";
  src: url("assets/fonts/anton-latin-400-normal.woff2") format("woff2");
  font-weight: 400 900;
  font-style: normal;
}
@font-face {
  font-family: "Bebas Neue";
  src: url("assets/fonts/bebas-neue-latin-400-normal.woff2") format("woff2");
  font-weight: 400 900;
  font-style: normal;
}
@font-face {
  font-family: "Inter";
  src: url("assets/fonts/inter-latin-800-normal.woff2") format("woff2");
  font-weight: 400 900;
  font-style: normal;
}

:root {
  --dk-primary: ${primary};
  --dk-accent: ${accent};
  --dk-bg: ${bg};
  --dk-surface: ${surface};
  --dk-text: ${text};
  --dk-text-on-primary: ${textOnPrimary};
  --dk-muted: ${muted};
  --dk-heading-font: "${headingFont}", "Anton", "Bebas Neue", sans-serif;
  --dk-body-font: "${bodyFont}", "Inter", sans-serif;
  --dk-radius: ${radius};
  --dk-shadow: ${shadow};
  --dk-lt-border-w: ${ltBorderW}px;
  --dk-badge-border-w: ${badgeBorderW}px;
}

.ov-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 20;
  overflow: hidden;
}

/* Zonas de Layout com Prevenção Automática de Colisão */
.ov-zone-top {
  position: absolute;
  left: ${Math.round((designKit?.safeArea.leftPx ?? 32) * scale)}px;
  right: ${Math.round((designKit?.safeArea.rightPx ?? 32) * scale)}px;
  top: ${zones.top.topPx}px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${Math.round(10 * scale)}px;
  z-index: 24;
  pointer-events: none;
}

.ov-zone-lower-middle {
  position: absolute;
  left: ${Math.round((designKit?.safeArea.leftPx ?? 36) * scale)}px;
  right: ${Math.round((designKit?.safeArea.rightPx ?? 36) * scale)}px;
  bottom: ${zones.lowerMiddle.cssBottomPx}px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${Math.round(8 * scale)}px;
  z-index: 25;
  pointer-events: none;
}

/* 1. Título de Abertura Condensado Bold */
.ov-title-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  width: 100%;
}
.ov-title-wrap.pos-center {
  position: absolute;
  left: ${Math.round(36 * scale)}px;
  right: ${Math.round(36 * scale)}px;
  top: ${Math.round(height * 0.35)}px;
}
.ov-title-subpill {
  display: inline-block;
  padding: ${Math.round(4 * scale)}px ${Math.round(14 * scale)}px;
  margin-bottom: ${Math.round(6 * scale)}px;
  border-radius: var(--dk-radius);
  border: 1.5px solid rgba(255, 255, 255, 0.45);
  background: var(--dk-surface);
  color: var(--dk-text);
  font-family: var(--dk-body-font);
  font-weight: 800;
  font-size: ${Math.round((designKit?.typography.subtitleFontSize || 14) * scale)}px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.ov-title-main {
  font-family: var(--dk-heading-font);
  font-size: ${titleFontSize}px;
  line-height: 1.03;
  letter-spacing: ${letterSpacing};
  color: var(--dk-text);
  text-transform: ${uppercaseRule};
  text-shadow: 0 4px 16px rgba(0, 0, 0, 0.45), 0 2px 4px rgba(0, 0, 0, 0.55);
}
.ov-title-main.boxed {
  background: var(--dk-surface);
  color: var(--dk-text);
  padding: ${Math.round(10 * scale)}px ${Math.round(20 * scale)}px;
  border-radius: var(--dk-radius);
  font-size: ${Math.round(titleFontSize * 0.8)}px;
  box-shadow: var(--dk-shadow);
  text-shadow: none;
}
.ov-title-main .hl {
  color: var(--dk-primary);
}

/* 2. Badge de Aviso */
.ov-badge {
  display: inline-flex;
  align-items: center;
  gap: ${Math.round(8 * scale)}px;
  background: var(--dk-primary);
  color: var(--dk-text-on-primary);
  font-family: var(--dk-heading-font);
  font-size: ${Math.round(24 * scale)}px;
  letter-spacing: 0.03em;
  padding: ${Math.round(4 * scale)}px ${Math.round(16 * scale)}px;
  border-radius: var(--dk-radius);
  border: var(--dk-badge-border-w) solid #111827;
  box-shadow: var(--dk-shadow);
  white-space: nowrap;
  text-transform: ${uppercaseRule};
}

/* 3. Lower-Third (Zona Meio-Inferior) */
.ov-lower-third {
  background: var(--dk-surface);
  border-left: var(--dk-lt-border-w) solid var(--dk-primary);
  padding: ${Math.round(9 * scale)}px ${Math.round(16 * scale)}px;
  border-radius: 0 var(--dk-radius) var(--dk-radius) 0;
  box-shadow: var(--dk-shadow);
}
.ov-lt-name {
  font-family: var(--dk-heading-font);
  font-size: ${Math.round(26 * scale)}px;
  color: var(--dk-text);
  letter-spacing: 0.03em;
  line-height: 1.08;
  text-transform: ${uppercaseRule};
}
.ov-lt-sub {
  font-family: var(--dk-body-font);
  font-weight: 800;
  font-size: ${Math.round(14 * scale)}px;
  color: var(--dk-primary);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-top: 2px;
}

/* 4. Tarja de Cargo / Role Banner (Zona Topo) */
.ov-role-banner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${Math.round(6 * scale)}px;
  width: 100%;
}
.ov-rb-title {
  background: var(--dk-surface);
  color: var(--dk-primary);
  font-family: var(--dk-heading-font);
  font-size: ${Math.round(36 * scale)}px;
  padding: ${Math.round(6 * scale)}px ${Math.round(20 * scale)}px;
  border-radius: var(--dk-radius);
  letter-spacing: 0.03em;
  text-transform: ${uppercaseRule};
  box-shadow: var(--dk-shadow);
}
.ov-rb-sub {
  background: var(--dk-accent);
  color: #ffffff;
  font-family: var(--dk-body-font);
  font-weight: 800;
  font-size: ${Math.round(16 * scale)}px;
  padding: ${Math.round(5 * scale)}px ${Math.round(14 * scale)}px;
  border-radius: var(--dk-radius);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

/* 5. Contador Numérico Animado (Zona Topo Direita) */
.ov-counter {
  align-self: flex-end;
  background: var(--dk-surface);
  border: 2px solid var(--dk-primary);
  border-radius: var(--dk-radius);
  padding: ${Math.round(10 * scale)}px ${Math.round(18 * scale)}px;
  text-align: center;
  box-shadow: var(--dk-shadow);
}
.ov-cnt-label {
  font-family: var(--dk-body-font);
  font-weight: 800;
  font-size: ${Math.round(13 * scale)}px;
  color: var(--dk-muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.ov-cnt-val {
  font-family: var(--dk-heading-font);
  font-size: ${Math.round(48 * scale)}px;
  color: var(--dk-primary);
  line-height: 1.05;
}
.ov-cnt-sub {
  font-family: var(--dk-body-font);
  font-weight: 700;
  font-size: ${Math.round(11 * scale)}px;
  color: var(--dk-muted);
  text-transform: uppercase;
}

/* 6. Marca d'água / @handle */
.ov-watermark {
  position: absolute;
  top: ${Math.round(28 * scale)}px;
  right: ${Math.round(28 * scale)}px;
  background: var(--dk-surface);
  color: var(--dk-text);
  font-family: var(--dk-body-font);
  font-weight: 800;
  font-size: ${Math.round(15 * scale)}px;
  padding: ${Math.round(5 * scale)}px ${Math.round(13 * scale)}px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  box-shadow: var(--dk-shadow);
}

/* 7. Barra de Progresso Inferior */
.ov-progress-track {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: ${Math.round(10 * scale)}px;
  background: rgba(0, 0, 0, 0.45);
  z-index: 40;
}
.ov-progress-fill {
  height: 100%;
  width: 0%;
  background: var(--dk-primary);
}

/* 8. Legendas Word-by-Word Centrais (Zona Base — sem colisão com lower-third) */
.ov-captions-container {
  position: absolute;
  left: ${Math.round(28 * scale)}px;
  right: ${Math.round(28 * scale)}px;
  top: ${zones.bottom.topPercent}%;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 35;
  pointer-events: none;
}
.ov-caption-group {
  position: absolute;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: ${Math.round(10 * scale)}px;
  opacity: 0;
  visibility: hidden;
}
.ov-caption-group.style-box {
  background: var(--dk-surface);
  padding: ${Math.round(8 * scale)}px ${Math.round(18 * scale)}px;
  border-radius: var(--dk-radius);
  box-shadow: var(--dk-shadow);
}
.ov-cap-word {
  font-family: var(--dk-body-font);
  font-weight: 800;
  font-size: ${capFontSize}px;
  color: ${captionStyle.textColor || text};
  padding: ${Math.round(3 * scale)}px ${Math.round(8 * scale)}px;
  border-radius: var(--dk-radius);
  text-shadow: ${captionStyle.style === 'box' ? 'none' : '0 2px 6px rgba(0, 0, 0, 0.92), 0 0 12px rgba(0, 0, 0, 0.75)'};
  transition: none;
}
.ov-cap-word.is-active {
  background: ${captionStyle.highlightColor || primary};
  color: var(--dk-text-on-primary);
  text-shadow: none;
  box-shadow: var(--dk-shadow);
}

/* 9. Efeitos Visuais / PixelFX Overlays */
.fx-scanlines {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.14) 0px,
    rgba(0, 0, 0, 0.14) 2px,
    transparent 2px,
    transparent 4px
  );
  pointer-events: none;
  z-index: 15;
}
.fx-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 50%, transparent 58%, rgba(0, 0, 0, 0.52) 100%);
  pointer-events: none;
  z-index: 14;
}
`;
}

/**
 * Gera o HTML e os comandos GSAP dos overlays de uma cena distribuídos nas zonas de layout
 * ou posicionados livremente quando o usuário os arrasta/redimensiona no canvas visual (x, y, width, height, rotation).
 */
export function buildSceneOverlaysHtmlAndGsap(
  sceneId: string,
  sceneStart: number,
  sceneDuration: number,
  overlays: OverlayItem[],
  transition: TransitionType,
  width = 720,
  _height = 1280,
  designKit?: DesignKit
): { html: string; gsapCode: string } {
  const scale = width / 720;
  const topZoneHtml: string[] = [];
  const lowerMiddleZoneHtml: string[] = [];
  const rootHtmlParts: string[] = [];
  const gsapLines: string[] = [];

  overlays.forEach((ov, idx) => {
    if (ov.hidden) return;
    const domId = `${sceneId}-ov-${idx}`;
    const hasCustomPos = ov.x !== undefined || ov.y !== undefined;

    // Constrói estilos inline de override visual (geometria, tipografia, cores, z-order)
    const inlineParts: string[] = [];
    if (hasCustomPos) {
      inlineParts.push('position:absolute');
      inlineParts.push(`left:${Math.round((ov.x ?? 36) * scale)}px`);
      inlineParts.push(`top:${Math.round((ov.y ?? 72) * scale)}px`);
    }
    if (ov.width !== undefined) inlineParts.push(`width:${Math.round(ov.width * scale)}px`);
    if (ov.height !== undefined) inlineParts.push(`height:${Math.round(ov.height * scale)}px`);
    if (ov.zIndex !== undefined) inlineParts.push(`z-index:${ov.zIndex}`);
    if (ov.fontFamily) inlineParts.push(`font-family:"${escapeHtml(ov.fontFamily)}",sans-serif`);
    if (ov.fontSize !== undefined) inlineParts.push(`font-size:${Math.round(ov.fontSize * scale)}px`);
    if (ov.textColor) inlineParts.push(`color:${escapeHtml(ov.textColor)}`);
    if (ov.backgroundColor) inlineParts.push(`background:${escapeHtml(ov.backgroundColor)}`);

    const dataAttrs = `data-editable-kind="overlay" data-scene-id="${escapeHtml(sceneId)}" data-overlay-index="${idx}" data-overlay-type="${ov.type}"`;

    const startOffset = Math.max(0, Math.min(sceneDuration - 0.3, ov.startOffset ?? 0));
    const endOffset =
      ov.endOffset !== undefined
        ? Math.max(startOffset + 0.25, Math.min(sceneDuration, ov.endOffset))
        : sceneDuration;
    const absStart = sceneStart + startOffset;
    const absEnd = sceneStart + endOffset;
    const targetOpacity = ov.opacity ?? 1;
    const targetRotation = ov.rotation ?? 0;
    const targetScale = ov.scale ?? 1;

    const pushAnimation = (defaultEnter: 'slide-up' | 'slide-down' | 'pop' | 'whip' | 'fade') => {
      const enter = ov.enterAnimation || defaultEnter;
      const exit = ov.exitAnimation || 'fade';

      if (startOffset > 0.01) {
        gsapLines.push(`tl.set("#${domId}", { opacity: 0 }, ${sceneStart.toFixed(3)});`);
      }

      if (enter === 'none') {
        gsapLines.push(
          `tl.set("#${domId}", { x: 0, y: 0, opacity: ${targetOpacity}, scale: ${targetScale}, rotation: ${targetRotation} }, ${absStart.toFixed(3)});`
        );
      } else if (enter === 'pop') {
        gsapLines.push(
          `tl.fromTo("#${domId}", { scale: ${Number((targetScale * 0.6).toFixed(2))}, rotation: ${targetRotation}, opacity: 0 }, { scale: ${targetScale}, rotation: ${targetRotation}, opacity: ${targetOpacity}, duration: 0.32, ease: "back.out(1.7)" }, ${absStart.toFixed(3)});`
        );
      } else if (enter === 'whip') {
        gsapLines.push(
          `tl.fromTo("#${domId}", { x: -80, scale: ${targetScale}, rotation: ${targetRotation}, opacity: 0 }, { x: 0, scale: ${targetScale}, rotation: ${targetRotation}, opacity: ${targetOpacity}, duration: 0.38, ease: "power3.out" }, ${absStart.toFixed(3)});`
        );
      } else if (enter === 'slide-down') {
        gsapLines.push(
          `tl.fromTo("#${domId}", { y: -35, scale: ${targetScale}, rotation: ${targetRotation}, opacity: 0 }, { y: 0, scale: ${targetScale}, rotation: ${targetRotation}, opacity: ${targetOpacity}, duration: 0.35, ease: "back.out(1.4)" }, ${absStart.toFixed(3)});`
        );
      } else if (enter === 'slide-up') {
        gsapLines.push(
          `tl.fromTo("#${domId}", { y: 35, scale: ${targetScale}, rotation: ${targetRotation}, opacity: 0 }, { y: 0, scale: ${targetScale}, rotation: ${targetRotation}, opacity: ${targetOpacity}, duration: 0.35, ease: "power2.out" }, ${absStart.toFixed(3)});`
        );
      } else {
        gsapLines.push(
          `tl.fromTo("#${domId}", { scale: ${targetScale}, rotation: ${targetRotation}, opacity: 0 }, { scale: ${targetScale}, rotation: ${targetRotation}, opacity: ${targetOpacity}, duration: 0.3, ease: "power1.out" }, ${absStart.toFixed(3)});`
        );
      }

      if (exit !== 'none') {
        const exitStart = Math.max(absStart + 0.2, absEnd - 0.25);
        gsapLines.push(
          `tl.to("#${domId}", { opacity: 0, duration: 0.22 }, ${exitStart.toFixed(3)});`
        );
      }
    };

    if (ov.type === 'title') {
      const words = ov.text.split(/\s+/);
      const hlTarget = (ov.highlightWord || '').toLowerCase();
      const renderedWords = words
        .map((w) => {
          const clean = w.toLowerCase().replace(/[.,!?;:"]/g, '');
          if (hlTarget && clean === hlTarget.replace(/[.,!?;:"]/g, '')) {
            return `<span class="hl">${escapeHtml(w)}</span>`;
          }
          return escapeHtml(w);
        })
        .join(' ');

      const isBoxed = ov.boxed ?? designKit?.overlayPreset.titleBoxed ?? false;
      const styleAttr = inlineParts.length ? ` style="${inlineParts.join(';')}"` : '';
      const mainStyleParts: string[] = [];
      if (ov.fontFamily) mainStyleParts.push(`font-family:"${escapeHtml(ov.fontFamily)}",sans-serif`);
      if (ov.fontSize !== undefined) mainStyleParts.push(`font-size:${Math.round(ov.fontSize * scale)}px`);
      if (ov.textColor) mainStyleParts.push(`color:${escapeHtml(ov.textColor)}`);
      if (ov.backgroundColor) mainStyleParts.push(`background:${escapeHtml(ov.backgroundColor)}`);
      const mainStyleAttr = mainStyleParts.length ? ` style="${mainStyleParts.join(';')}"` : '';

      const block = `
        <div id="${domId}" ${dataAttrs} class="ov-title-wrap ${!hasCustomPos && ov.position === 'center' ? 'pos-center' : ''}"${styleAttr}>
          ${ov.subtitle ? `<div class="ov-title-subpill">${escapeHtml(ov.subtitle)}</div>` : ''}
          <div class="ov-title-main ${isBoxed ? 'boxed' : ''}"${mainStyleAttr}>${renderedWords}</div>
        </div>
      `;
      if (hasCustomPos || ov.position === 'center') {
        rootHtmlParts.push(block);
      } else {
        topZoneHtml.push(block);
      }
      pushAnimation('slide-down');
    } else if (ov.type === 'badge') {
      const bgCol = ov.backgroundColor || ov.color || designKit?.palette.primary || '#f5c518';
      const badgeStyles = [...inlineParts.filter((p) => !p.startsWith('background:')), `background:${escapeHtml(bgCol)}`];
      const block = `
        <div id="${domId}" ${dataAttrs} class="ov-badge" style="${badgeStyles.join(';')}">
          <span>${escapeHtml(ov.icon || '⚠')}</span>
          <span>${escapeHtml(ov.text)}</span>
        </div>
      `;
      if (hasCustomPos) rootHtmlParts.push(block);
      else topZoneHtml.push(block);
      pushAnimation('pop');
    } else if (ov.type === 'lower-third') {
      const styleAttr = inlineParts.length ? ` style="${inlineParts.join(';')}"` : '';
      const block = `
        <div id="${domId}" ${dataAttrs} class="ov-lower-third"${styleAttr}>
          <div class="ov-lt-name" ${ov.textColor ? `style="color:${escapeHtml(ov.textColor)}"` : ''}>${escapeHtml(ov.name)}</div>
          <div class="ov-lt-sub">${escapeHtml(ov.subtitle)}</div>
        </div>
      `;
      if (hasCustomPos) rootHtmlParts.push(block);
      else lowerMiddleZoneHtml.push(block);
      pushAnimation('whip');
    } else if (ov.type === 'role-banner') {
      const styleAttr = inlineParts.length ? ` style="${inlineParts.join(';')}"` : '';
      const block = `
        <div id="${domId}" ${dataAttrs} class="ov-role-banner"${styleAttr}>
          <div class="ov-rb-title" ${ov.textColor ? `style="color:${escapeHtml(ov.textColor)}"` : ''}>${escapeHtml(ov.title)}</div>
          ${ov.subtitle ? `<div class="ov-rb-sub">${escapeHtml(ov.subtitle)}</div>` : ''}
        </div>
      `;
      if (hasCustomPos) rootHtmlParts.push(block);
      else topZoneHtml.push(block);
      pushAnimation('slide-down');
    } else if (ov.type === 'counter') {
      const valId = `${domId}-val`;
      const styleAttr = inlineParts.length ? ` style="${inlineParts.join(';')}"` : '';
      const block = `
        <div id="${domId}" ${dataAttrs} class="ov-counter"${styleAttr}>
          <div class="ov-cnt-label">${escapeHtml(ov.label)}</div>
          <div id="${valId}" class="ov-cnt-val" ${ov.textColor ? `style="color:${escapeHtml(ov.textColor)}"` : ''}>${escapeHtml(ov.prefix || '')}${ov.from}${escapeHtml(ov.suffix || '')}</div>
          ${ov.sublabel ? `<div class="ov-cnt-sub">${escapeHtml(ov.sublabel)}</div>` : ''}
        </div>
      `;
      if (hasCustomPos) rootHtmlParts.push(block);
      else topZoneHtml.push(block);
      pushAnimation('pop');
      gsapLines.push(
        `{
          const proxy = { val: ${ov.from} };
          const el = document.getElementById("${valId}");
          tl.to(proxy, {
            val: ${ov.to},
            duration: ${Math.max(0.6, Math.min(2.2, (endOffset - startOffset) * 0.6)).toFixed(2)},
            ease: "power2.out",
            onUpdate: function() {
              if (el) el.textContent = ${JSON.stringify(ov.prefix || '')} + Math.round(proxy.val) + ${JSON.stringify(ov.suffix || '')};
            }
          }, ${(absStart + 0.15).toFixed(3)});
        }`
      );
    } else if (ov.type === 'watermark') {
      const styleAttr = inlineParts.length ? ` style="${inlineParts.join(';')}"` : '';
      rootHtmlParts.push(`
        <div id="${domId}" ${dataAttrs} class="ov-watermark"${styleAttr}>${escapeHtml(ov.handle)}</div>
      `);
      pushAnimation('fade');
    } else if (ov.type === 'effect') {
      const cls = ov.effectId.includes('scanline') ? 'fx-scanlines' : 'fx-vignette';
      rootHtmlParts.push(`<div id="${domId}" ${dataAttrs} class="${cls}"></div>`);
    }
  });

  if (topZoneHtml.length > 0) {
    rootHtmlParts.push(`<div class="ov-zone-top">${topZoneHtml.join('\n')}</div>`);
  }
  if (lowerMiddleZoneHtml.length > 0) {
    rootHtmlParts.push(`<div class="ov-zone-lower-middle">${lowerMiddleZoneHtml.join('\n')}</div>`);
  }

  // Transição de entrada da cena
  if (transition === 'whip') {
    const flashId = `${sceneId}-whip`;
    const primaryCol = designKit?.palette.primary || '#f5c518';
    rootHtmlParts.push(
      `<div id="${flashId}" style="position:absolute;inset:0;background:linear-gradient(90deg,transparent,${primaryCol}55,transparent);transform:translateX(-100%);pointer-events:none;z-index:30;"></div>`
    );
    gsapLines.push(
      `tl.fromTo("#${flashId}", { xPercent: -100 }, { xPercent: 100, duration: 0.28, ease: "power2.inOut" }, ${sceneStart.toFixed(3)});`
    );
  } else if (transition === 'fade') {
    const fadeId = `${sceneId}-fade`;
    rootHtmlParts.push(
      `<div id="${fadeId}" style="position:absolute;inset:0;background:#000000;opacity:0;pointer-events:none;z-index:30;"></div>`
    );
    gsapLines.push(
      `tl.fromTo("#${fadeId}", { opacity: 0.85 }, { opacity: 0, duration: 0.35, ease: "power1.out" }, ${sceneStart.toFixed(3)});`
    );
  }

  return {
    html: rootHtmlParts.join('\n'),
    gsapCode: gsapLines.join('\n'),
  };
}

/**
 * Gera o HTML das legendas palavra a palavra + função determinística de atualização por tempo `t`.
 */
export function buildCaptionsHtmlAndController(
  allWords: WordTimestamp[],
  captionStyle: CaptionStyle
): { html: string; groupsJson: string } {
  if (!captionStyle.enabled || allWords.length === 0) {
    return { html: '', groupsJson: '[]' };
  }

  const groups = buildWordCaptionGroups(allWords, captionStyle.wordsPerGroup);
  const groupHtml = groups
    .map((g, gIdx) => {
      const wordsHtml = g.words
        .map(
          (w, wIdx) =>
            `<span id="cap-w-${gIdx}-${wIdx}" class="ov-cap-word">${escapeHtml(w.word)}</span>`
        )
        .join('');
      return `<div id="${g.id}" class="ov-caption-group style-${captionStyle.style}">${wordsHtml}</div>`;
    })
    .join('\n');

  return {
    html: `<div class="ov-captions-container">${groupHtml}</div>`,
    groupsJson: JSON.stringify(groups),
  };
}

/**
 * Gera arquivo de legendas .SRT a partir dos timestamps palavra a palavra agrupados.
 */
export function generateSrtContent(words: WordTimestamp[], wordsPerGroup = 3): string {
  const groups = buildWordCaptionGroups(words, wordsPerGroup);
  if (groups.length === 0) return '';

  return groups
    .map((g, idx) => {
      const startStr = formatSrtTime(g.start);
      const endStr = formatSrtTime(g.end);
      const text = g.words.map((w) => w.word).join(' ');
      return `${idx + 1}\n${startStr} --> ${endStr}\n${text}\n`;
    })
    .join('\n');
}

/**
 * Gera arquivo de legendas .ASS (SubStation Alpha) com highlight amarelo palavra a palavra.
 */
export function generateAssContent(
  words: WordTimestamp[],
  captionStyle: CaptionStyle,
  width = 720,
  height = 1280
): string {
  const groups = buildWordCaptionGroups(words, captionStyle.wordsPerGroup);
  const zones = computeOverlayLayoutZones(captionStyle, width, height);
  const marginV = Math.round(height * (1 - zones.bottom.topPercent / 100));
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Inter,${captionStyle.fontSize || 32},&H00FFFFFF,&H0018C5F5,&H00111827,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,30,30,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events: string[] = [];
  for (const g of groups) {
    for (let activeIdx = 0; activeIdx < g.words.length; activeIdx++) {
      const activeWord = g.words[activeIdx];
      const lineWords = g.words
        .map((w, idx) =>
          idx === activeIdx
            ? `{\\c&H0018C5F5&\\b1}[${w.word}]{\\c&H00FFFFFF&}`
            : w.word
        )
        .join(' ');
      events.push(
        `Dialogue: 0,${formatAssTime(activeWord.start)},${formatAssTime(activeWord.end)},Default,,0,0,0,,${lineWords}`
      );
    }
  }

  return header + events.join('\n') + '\n';
}

function formatSrtTime(sec: number): string {
  const totalMs = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(totalMs / 3600000);
  const m = Math.floor((totalMs % 3600000) / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function formatAssTime(sec: number): string {
  const totalCs = Math.max(0, Math.round(sec * 100));
  const h = Math.floor(totalCs / 360000);
  const m = Math.floor((totalCs % 360000) / 6000);
  const s = Math.floor((totalCs % 6000) / 100);
  const cs = totalCs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
