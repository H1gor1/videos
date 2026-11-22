import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_CHARACTERS,
  DEFAULT_DESIGN_KITS,
  WORKSPACE_ROOT,
  getVideoService,
  type Character,
  type DesignKit,
  type Project,
  type VideoEngineId,
  type WordTimestamp,
} from '@videos/core';
import { createScene3DEngine } from '@videos/scenes';
import {
  buildCaptionsHtmlAndController,
  buildSceneOverlaysHtmlAndGsap,
  escapeHtml,
  estimateProportionalWordTimestamps,
  generateAssContent,
  generateOverlaysCss,
  generateSrtContent,
} from '@videos/overlays';

export interface ComposeOptions {
  workspaceRoot?: string;
  mixedAudioPath?: string;
  designKit?: DesignKit;
}

export function resolveProjectDesignKit(project: Project, options?: ComposeOptions): DesignKit {
  if (options?.designKit) return options.designKit;
  const kitId = project.designKitId || 'simulacao-2030';
  try {
    const svc = getVideoService(options?.workspaceRoot || WORKSPACE_ROOT);
    const found = svc.getDesignKit(kitId);
    if (found) return found;
  } catch {
    // Fallback para DEFAULT_DESIGN_KITS
  }
  return DEFAULT_DESIGN_KITS.find((k) => k.id === kitId) || DEFAULT_DESIGN_KITS[0];
}

export interface ComposedArtifact {
  engine: VideoEngineId;
  compositionDir: string;
  indexHtmlPath: string;
  srtPath: string;
  assPath: string;
  totalDuration: number;
  allWordTimestamps: WordTimestamp[];
}

export interface VideoEngine {
  readonly id: VideoEngineId;
  compose(
    project: Project,
    characters: Character[],
    outputDir: string,
    options?: ComposeOptions
  ): Promise<ComposedArtifact>;
}

/**
 * Copia GSAP, Three.js (empacotado para window.THREE) e fontes WOFF2 locais (@fontsource)
 * para a pasta da composição HyperFrames, garantindo funcionamento 100% offline sem CDN.
 */
export function prepareCompositionAssets(outputDir: string, workspaceRoot = WORKSPACE_ROOT): void {
  const vendorDir = path.join(outputDir, 'assets', 'vendor');
  const fontsDir = path.join(outputDir, 'assets', 'fonts');
  mkdirSync(vendorDir, { recursive: true });
  mkdirSync(fontsDir, { recursive: true });

  // 1. GSAP
  const gsapSrc = path.join(workspaceRoot, 'node_modules/gsap/dist/gsap.min.js');
  const gsapDest = path.join(vendorDir, 'gsap.min.js');
  if (existsSync(gsapSrc) && !existsSync(gsapDest)) {
    copyFileSync(gsapSrc, gsapDest);
  }

  // 2. Three.js sincronizado como window.THREE (+ RoundedBoxGeometry de three/examples/jsm/geometries)
  const threeCjsSrc = path.join(workspaceRoot, 'node_modules/three/build/three.cjs');
  const roundedBoxSrc = path.join(
    workspaceRoot,
    'node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js'
  );
  const threeDest = path.join(vendorDir, 'three.min.js');
  const needsThreeBundle =
    existsSync(threeCjsSrc) &&
    (!existsSync(threeDest) ||
      !readFileSync(threeDest, 'utf8').includes('RoundedBoxGeometry'));
  if (needsThreeBundle) {
    const rawCjs = readFileSync(threeCjsSrc, 'utf8');
    let roundedBoxAddon = '';
    if (existsSync(roundedBoxSrc)) {
      const rawRb = readFileSync(roundedBoxSrc, 'utf8')
        .replace(/import\s*\{[^}]*\}\s*from\s*['"]three['"];?/g, '')
        .replace(/export\s*\{\s*RoundedBoxGeometry\s*\};?/g, '');
      roundedBoxAddon = `\n;(function(THREE){\nconst BoxGeometry = THREE.BoxGeometry;\nconst Vector3 = THREE.Vector3;\n${rawRb}\nTHREE.RoundedBoxGeometry = RoundedBoxGeometry;\n})(window.THREE);\n`;
    }
    const wrapped = `(function(){var exports={};var module={exports:exports};\n${rawCjs}\n;window.THREE=module.exports;})();${roundedBoxAddon}`;
    writeFileSync(threeDest, wrapped, 'utf8');
  }

  // 3. Fontes @fontsource locais (Anton, Bebas Neue, Inter)
  const fontFiles: Array<[string, string]> = [
    ['@fontsource/anton/files/anton-latin-400-normal.woff2', 'anton-latin-400-normal.woff2'],
    ['@fontsource/anton/files/anton-latin-ext-400-normal.woff2', 'anton-latin-ext-400-normal.woff2'],
    ['@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2', 'bebas-neue-latin-400-normal.woff2'],
    ['@fontsource/bebas-neue/files/bebas-neue-latin-ext-400-normal.woff2', 'bebas-neue-latin-ext-400-normal.woff2'],
    ['@fontsource/inter/files/inter-latin-700-normal.woff2', 'inter-latin-700-normal.woff2'],
    ['@fontsource/inter/files/inter-latin-800-normal.woff2', 'inter-latin-800-normal.woff2'],
  ];

  for (const [relSrc, filename] of fontFiles) {
    const src = path.join(workspaceRoot, 'node_modules', relSrc);
    const dest = path.join(fontsDir, filename);
    if (existsSync(src) && !existsSync(dest)) {
      copyFileSync(src, dest);
    }
  }

  // 4. hyperframes.json & meta.json
  const hfConfig = {
    $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
    paths: {
      blocks: 'compositions',
      components: 'compositions/components',
      assets: 'assets',
    },
  };
  writeFileSync(path.join(outputDir, 'hyperframes.json'), JSON.stringify(hfConfig, null, 2) + '\n', 'utf8');
}

/**
 * Coleta ou estima os timestamps globais palavra a palavra de todas as cenas/blocos do projeto.
 */
export function collectGlobalWordTimestamps(project: Project): WordTimestamp[] {
  const allWords: WordTimestamp[] = [];
  if (project.engine === 'scene3d') {
    let cursor = 0;
    for (const scene of project.scenes) {
      const maxLocal = Math.max(0.2, scene.duration - 0.02);
      const localWords =
        scene.wordTimestamps && scene.wordTimestamps.length > 0
          ? scene.wordTimestamps
          : estimateProportionalWordTimestamps(scene.narration, scene.duration, scene.highlightWords);
      for (const w of localWords) {
        const clampedStart = Math.max(0, Math.min(maxLocal - 0.02, w.start));
        const clampedEnd = Math.max(clampedStart + 0.015, Math.min(maxLocal, w.end));
        allWords.push({
          word: w.word,
          start: Number((cursor + clampedStart).toFixed(3)),
          end: Number((cursor + clampedEnd).toFixed(3)),
          highlighted: w.highlighted,
        });
      }
      cursor += scene.duration;
    }
  } else if (project.engine === 'kinetic') {
    let cursor = 0;
    for (const block of project.kineticBlocks) {
      const maxLocal = Math.max(0.2, block.duration - 0.02);
      const localWords =
        block.wordTimestamps && block.wordTimestamps.length > 0
          ? block.wordTimestamps
          : estimateProportionalWordTimestamps(
              block.narration,
              block.duration,
              block.highlightWord ? [block.highlightWord] : []
            );
      for (const w of localWords) {
        const clampedStart = Math.max(0, Math.min(maxLocal - 0.02, w.start));
        const clampedEnd = Math.max(clampedStart + 0.015, Math.min(maxLocal, w.end));
        allWords.push({
          word: w.word,
          start: Number((cursor + clampedStart).toFixed(3)),
          end: Number((cursor + clampedEnd).toFixed(3)),
          highlighted: w.highlighted,
        });
      }
      cursor += block.duration;
    }
  } else if (project.engine === 'freeform' && project.freeform) {
    if (project.freeform.wordTimestamps && project.freeform.wordTimestamps.length > 0) {
      return project.freeform.wordTimestamps;
    }
    if (project.freeform.narration) {
      return estimateProportionalWordTimestamps(project.freeform.narration, project.freeform.duration);
    }
  }
  return allWords;
}

// ============================================================================
// ENGINE 1: SCENE 3D ("Simulação 3D" — Personagens Blocky + Cenários + Overlays)
// ============================================================================

export class Scene3DVideoEngine implements VideoEngine {
  public readonly id = 'scene3d' as const;

  public async compose(
    project: Project,
    characters: Character[],
    outputDir: string,
    options: ComposeOptions = {}
  ): Promise<ComposedArtifact> {
    mkdirSync(outputDir, { recursive: true });
    prepareCompositionAssets(outputDir, options.workspaceRoot);

    const width = project.renderSettings.width || 720;
    const height = project.renderSettings.height || 1280;
    const fps = project.renderSettings.fps || 30;
    const designKit = resolveProjectDesignKit(project, options);

    const charMap = new Map<string, Character>();
    for (const c of DEFAULT_CHARACTERS) charMap.set(c.id, c);
    for (const c of characters) charMap.set(c.id, c);

    let cursor = 0;
    const runtimeScenes: any[] = [];
    const clipDomBlocks: string[] = [];
    const gsapOverlayScripts: string[] = [];

    for (const scene of project.scenes) {
      const sceneStart = Number(cursor.toFixed(3));
      const sceneDur = Number(scene.duration.toFixed(3));
      const mainChar = charMap.get(scene.characterId) || DEFAULT_CHARACTERS[0];
      const secChars = (scene.secondaryCharacterIds || [])
        .map((id) => charMap.get(id))
        .filter(Boolean);

      runtimeScenes.push({
        id: scene.id,
        startTime: sceneStart,
        duration: sceneDur,
        template: scene.template,
        templateProps: scene.templateProps || {},
        character: mainChar,
        secondaryCharacters: secChars,
        pose: scene.pose,
        camera: scene.camera,
        objectOverrides: scene.objectOverrides || {},
        cameraOverride: scene.cameraOverride,
        designKit,
      });

      const { html: ovHtml, gsapCode } = buildSceneOverlaysHtmlAndGsap(
        scene.id,
        sceneStart,
        sceneDur,
        scene.overlays || [],
        scene.transition,
        width,
        height,
        designKit
      );

      clipDomBlocks.push(`
      <div
        id="${escapeHtml(scene.id)}"
        class="clip ov-layer"
        data-start="${sceneStart}"
        data-duration="${sceneDur}"
        data-track-index="1"
        data-timeline-label="${escapeHtml(scene.template)}"
      >
        ${ovHtml}
      </div>`);

      if (gsapCode) {
        gsapOverlayScripts.push(gsapCode);
      }

      cursor += sceneDur;
    }

    const totalDuration = Number(Math.max(1, cursor).toFixed(3));
    const allWords = collectGlobalWordTimestamps(project);
    const { html: captionsHtml, groupsJson } = buildCaptionsHtmlAndController(
      allWords,
      project.captionStyle
    );

    const hasProgressBar = project.scenes.some((s) =>
      s.overlays.some((o) => o.type === 'progress-bar')
    );

    const globalEffectsHtml = (project.effectIds || [])
      .map((fx) => {
        if (fx.includes('scanline')) return '<div class="fx-scanlines"></div>';
        if (fx.includes('vignette')) return '<div class="fx-vignette"></div>';
        return '';
      })
      .join('\n');

    let audioTagHtml = '';
    if (options.mixedAudioPath && existsSync(options.mixedAudioPath)) {
      const audioDestDir = path.join(outputDir, 'assets', 'audio');
      mkdirSync(audioDestDir, { recursive: true });
      const ext = path.extname(options.mixedAudioPath) || '.wav';
      const audioRel = `assets/audio/mix${ext}`;
      copyFileSync(options.mixedAudioPath, path.join(outputDir, audioRel));
      audioTagHtml = `<audio id="master-audio" src="${audioRel}" data-start="0" data-duration="${totalDuration}" data-track-index="0"></audio>`;
    }

    const css = generateOverlaysCss(project.captionStyle, width, height, designKit);

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${width}, height=${height}" />
  <title>${escapeHtml(project.title)}</title>
  <script src="assets/vendor/gsap.min.js"></script>
  <script src="assets/vendor/three.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: #0f172a;
      user-select: none;
    }
    #root {
      position: relative;
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: #0f172a;
    }
    #scene3d-canvas {
      position: absolute;
      inset: 0;
      width: ${width}px;
      height: ${height}px;
      display: block;
      z-index: 1;
    }
    .clip {
      position: absolute;
      inset: 0;
    }
    ${css}
  </style>
</head>
<body>
  <div
    id="root"
    data-composition-id="main"
    data-root="true"
    data-start="0"
    data-duration="${totalDuration}"
    data-width="${width}"
    data-height="${height}"
    data-fps="${fps}"
    drawable=""
  >
    ${audioTagHtml}
    <div id="stage-3d-clip" class="clip" data-start="0" data-duration="${totalDuration}" data-track-index="0">
      <canvas id="scene3d-canvas" width="${width}" height="${height}" layoutsubtree="" content="drawable"></canvas>
    </div>

    ${clipDomBlocks.join('\n')}
    ${globalEffectsHtml}
    ${captionsHtml}
    ${
      hasProgressBar
        ? `<div class="ov-progress-track"><div id="global-progress-fill" class="ov-progress-fill"></div></div>`
        : ''
    }
  </div>

  <script>
    (function() {
      const TOTAL_DURATION = ${totalDuration};
      const WIDTH = ${width};
      const HEIGHT = ${height};
      const SCENES_DATA = ${JSON.stringify(runtimeScenes)};
      const CAPTION_GROUPS = ${groupsJson};

      // Inicializa o motor Three.js procedural
      const createEngine = ${createScene3DEngine.toString()};
      const engine = createEngine(window.THREE);
      const canvas = document.getElementById("scene3d-canvas");
      const stageController = engine.mountScene3DCanvas(canvas, WIDTH, HEIGHT, SCENES_DATA);

      function updateCaptionsAtTime(t) {
        let activeGroupIdx = -1;
        for (let gIdx = 0; gIdx < CAPTION_GROUPS.length; gIdx++) {
          const g = CAPTION_GROUPS[gIdx];
          const nextStart = gIdx + 1 < CAPTION_GROUPS.length ? CAPTION_GROUPS[gIdx + 1].start : Infinity;
          const effectiveEnd = Math.min(g.end + 0.02, nextStart - 0.001);
          if (t >= g.start && t < effectiveEnd) {
            activeGroupIdx = gIdx;
            break;
          }
        }

        for (let gIdx = 0; gIdx < CAPTION_GROUPS.length; gIdx++) {
          const g = CAPTION_GROUPS[gIdx];
          const gEl = document.getElementById(g.id);
          if (!gEl) continue;
          const isGroupActive = gIdx === activeGroupIdx;
          if (!isGroupActive) {
            gEl.style.opacity = "0";
            gEl.style.visibility = "hidden";
            continue;
          }
          gEl.style.opacity = "1";
          gEl.style.visibility = "visible";

          let activeWordIdx = -1;
          for (let wIdx = 0; wIdx < g.words.length; wIdx++) {
            const w = g.words[wIdx];
            const isNextExists = wIdx + 1 < g.words.length;
            const wEnd = isNextExists ? g.words[wIdx + 1].start : g.end + 0.02;
            if (t >= w.start && t < wEnd) {
              activeWordIdx = wIdx;
              break;
            }
          }
          if (activeWordIdx === -1 && g.words.length > 0) {
            activeWordIdx = t < g.words[0].start ? 0 : g.words.length - 1;
          }

          for (let wIdx = 0; wIdx < g.words.length; wIdx++) {
            const wEl = document.getElementById("cap-w-" + gIdx + "-" + wIdx);
            if (!wEl) continue;
            wEl.className = wIdx === activeWordIdx ? "ov-cap-word is-active" : "ov-cap-word";
          }
        }
      }

      function syncAtTime(t) {
        const clamped = Math.max(0, Math.min(TOTAL_DURATION, Number(t) || 0));
        stageController.renderAtTime(clamped);
        updateCaptionsAtTime(clamped);
        const prog = document.getElementById("global-progress-fill");
        if (prog) {
          prog.style.width = ((clamped / TOTAL_DURATION) * 100).toFixed(2) + "%";
        }
      }

      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });

      const timeProxy = { t: 0 };
      tl.to(timeProxy, {
        t: TOTAL_DURATION,
        duration: TOTAL_DURATION,
        ease: "none",
        onUpdate: function() {
          syncAtTime(timeProxy.t);
        }
      }, 0);

      ${gsapOverlayScripts.join('\n      ')}

      window.__timelines["main"] = tl;

      if (window.__hyperframes && typeof window.__hyperframes.registerFrameSource === "function") {
        window.__hyperframes.registerFrameSource(function(t) {
          syncAtTime(t);
        });
      }

      window.__seek = function(t) {
        tl.seek(t, false);
        syncAtTime(t);
      };

      syncAtTime(0);
    })();
  </script>
</body>
</html>`;

    const indexHtmlPath = path.join(outputDir, 'index.html');
    const srtPath = path.join(outputDir, 'captions.srt');
    const assPath = path.join(outputDir, 'captions.ass');

    writeFileSync(indexHtmlPath, html, 'utf8');
    writeFileSync(srtPath, generateSrtContent(allWords, project.captionStyle.wordsPerGroup), 'utf8');
    writeFileSync(assPath, generateAssContent(allWords, project.captionStyle, width, height), 'utf8');

    return {
      engine: 'scene3d',
      compositionDir: outputDir,
      indexHtmlPath,
      srtPath,
      assPath,
      totalDuration,
      allWordTimestamps: allWords,
    };
  }
}

// ============================================================================
// ENGINE 2: KINETIC (Tipografia Cinética, Listas Top-N, Estatísticas & Citações)
// ============================================================================

export class KineticVideoEngine implements VideoEngine {
  public readonly id = 'kinetic' as const;

  public async compose(
    project: Project,
    _characters: Character[],
    outputDir: string,
    options: ComposeOptions = {}
  ): Promise<ComposedArtifact> {
    mkdirSync(outputDir, { recursive: true });
    prepareCompositionAssets(outputDir, options.workspaceRoot);

    const width = project.renderSettings.width || 720;
    const height = project.renderSettings.height || 1280;
    const fps = project.renderSettings.fps || 30;
    const scale = width / 720;
    const designKit = resolveProjectDesignKit(project, options);

    let cursor = 0;
    const blockHtmls: string[] = [];
    const gsapScripts: string[] = [];

    const bgMap: Record<string, string> = {
      'dark-grid': `radial-gradient(circle at 50% 30%, ${designKit.palette.surface || '#1e293b'} 0%, ${designKit.palette.background || '#090d16'} 75%)`,
      'radial-glow': 'radial-gradient(circle at 50% 40%, #311042 0%, #090612 80%)',
      'editorial-cream': designKit.id === 'editorial-minimal' ? designKit.palette.background : '#f4ecdf',
      'neon-cyber': 'linear-gradient(160deg, #061326 0%, #0f172a 55%, #082f49 100%)',
      'crimson-burst': 'radial-gradient(circle at 50% 35%, #7f1d1d 0%, #180408 82%)',
    };

    const buildElOverrideStyle = (ov?: {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      rotation?: number;
      scale?: number;
      opacity?: number;
      textColor?: string;
      backgroundColor?: string;
      fontSize?: number;
      fontFamily?: string;
    }) => {
      if (!ov) return '';
      const parts: string[] = [];
      const tx = ov.x !== undefined ? `${Math.round(ov.x * scale)}px` : '0px';
      const ty = ov.y !== undefined ? `${Math.round(ov.y * scale)}px` : '0px';
      const rot = ov.rotation ? ` rotate(${ov.rotation}deg)` : '';
      const sc = ov.scale && ov.scale !== 1 ? ` scale(${ov.scale})` : '';
      if (ov.x !== undefined || ov.y !== undefined || ov.rotation || (ov.scale && ov.scale !== 1)) {
        parts.push(`transform:translate(${tx},${ty})${rot}${sc}`);
      }
      if (ov.width !== undefined) parts.push(`width:${Math.round(ov.width * scale)}px`);
      if (ov.height !== undefined) parts.push(`height:${Math.round(ov.height * scale)}px`);
      if (ov.opacity !== undefined) parts.push(`opacity:${ov.opacity}`);
      if (ov.textColor) parts.push(`color:${escapeHtml(ov.textColor)}`);
      if (ov.backgroundColor) parts.push(`background:${escapeHtml(ov.backgroundColor)}`);
      if (ov.fontSize !== undefined) parts.push(`font-size:${Math.round(ov.fontSize * scale)}px`);
      if (ov.fontFamily) parts.push(`font-family:"${escapeHtml(ov.fontFamily)}",sans-serif`);
      return parts.join(';');
    };

    project.kineticBlocks.forEach((b, idx) => {
      const start = Number(cursor.toFixed(3));
      const dur = Number(b.duration.toFixed(3));
      const bid = `kb-${idx}`;
      const isLight = b.bgStyle === 'editorial-cream' || designKit.id === 'editorial-minimal';
      const textColor = isLight ? designKit.palette.text || '#18181b' : '#ffffff';
      const accent = b.accentColor || designKit.palette.primary || '#f5c518';
      const elOvs = b.elementOverrides || {};

      const hlTarget = (b.highlightWord || '').toLowerCase();
      const headlineHtml = b.headline
        .split(/\s+/)
        .map((w) => {
          const clean = w.toLowerCase().replace(/[.,!?;:"]/g, '');
          if (hlTarget && clean === hlTarget.replace(/[.,!?;:"]/g, '')) {
            return `<span style="color:${escapeHtml(accent)}">${escapeHtml(w)}</span>`;
          }
          return escapeHtml(w);
        })
        .join(' ');

      const itemsHtml = (b.items || [])
        .map(
          (item, iIdx) => `
          <div id="${bid}-item-${iIdx}" class="kb-list-row" style="${buildElOverrideStyle(elOvs[`item-${iIdx}`])}">
            <span class="kb-bullet" style="background:${escapeHtml(accent)}"></span>
            <span>${escapeHtml(item)}</span>
          </div>`
        )
        .join('\n');

      blockHtmls.push(`
      <div
        id="${bid}"
        class="clip kb-card"
        data-start="${start}"
        data-duration="${dur}"
        data-track-index="1"
        style="background:${bgMap[b.bgStyle] || bgMap['dark-grid']};color:${textColor};opacity:0;"
      >
        <div class="kb-grid-overlay"></div>
        <div class="kb-inner" id="${bid}-inner">
          ${
            b.rankNumber !== undefined
              ? `<div id="${bid}-rank" class="kb-rank" style="background:${escapeHtml(accent)};${buildElOverrideStyle(elOvs.rank)}">#${b.rankNumber}</div>`
              : b.badge
                ? `<div id="${bid}-badge" class="kb-badge" style="background:${escapeHtml(accent)};${buildElOverrideStyle(elOvs.badge)}">${escapeHtml(b.badge)}</div>`
                : ''
          }
          <h1 id="${bid}-head" class="kb-headline" style="${buildElOverrideStyle(elOvs.head)}">${headlineHtml}</h1>
          ${b.subheadline ? `<p id="${bid}-sub" class="kb-sub" style="${buildElOverrideStyle(elOvs.sub)}">${escapeHtml(b.subheadline)}</p>` : ''}
          ${
            b.statValue !== undefined
              ? `<div id="${bid}-stat" class="kb-stat" style="color:${escapeHtml(accent)};${buildElOverrideStyle(elOvs.stat)}">${escapeHtml(b.statPrefix || '')}0${escapeHtml(b.statSuffix || '')}</div>`
              : ''
          }
          ${itemsHtml ? `<div class="kb-list">${itemsHtml}</div>` : ''}
        </div>
      </div>`);

      gsapScripts.push(
        `tl.set("#${bid}", { opacity: 1 }, ${start});`,
        `tl.fromTo("#${bid}-inner", { y: 65, scale: 0.92, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.42, ease: "back.out(1.4)" }, ${start});`
      );

      if (b.statValue !== undefined) {
        gsapScripts.push(`{
          const proxy = { v: 0 };
          const el = document.getElementById("${bid}-stat");
          tl.to(proxy, {
            v: ${b.statValue},
            duration: ${Math.min(1.6, dur * 0.55).toFixed(2)},
            ease: "power2.out",
            onUpdate: function() {
              if (el) el.textContent = ${JSON.stringify(b.statPrefix || '')} + Math.round(proxy.v) + ${JSON.stringify(b.statSuffix || '')};
            }
          }, ${(start + 0.25).toFixed(3)});
        }`);
      }

      (b.items || []).forEach((_it, iIdx) => {
        gsapScripts.push(
          `tl.fromTo("#${bid}-item-${iIdx}", { x: -50, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: "power2.out" }, ${(start + 0.35 + iIdx * 0.22).toFixed(3)});`
        );
      });

      gsapScripts.push(`tl.set("#${bid}", { opacity: 0 }, ${(start + dur).toFixed(3)});`);
      cursor += dur;
    });

    const totalDuration = Number(Math.max(1, cursor).toFixed(3));
    const allWords = collectGlobalWordTimestamps(project);
    const { html: captionsHtml, groupsJson } = buildCaptionsHtmlAndController(
      allWords,
      project.captionStyle
    );
    const css = generateOverlaysCss(project.captionStyle, width, height, designKit);

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${width}, height=${height}" />
  <title>${escapeHtml(project.title)}</title>
  <script src="assets/vendor/gsap.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #root {
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: #090d16;
    }
    .clip { position: absolute; inset: 0; }
    .kb-card {
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: ${Math.round(56 * scale)}px;
    }
    .kb-grid-overlay {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px);
      background-size: 48px 48px;
      pointer-events: none;
    }
    .kb-inner {
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: ${Math.round(18 * scale)}px;
    }
    .kb-rank {
      font-family: "Anton", sans-serif;
      font-size: ${Math.round(52 * scale)}px;
      color: #0f172a;
      padding: ${Math.round(6 * scale)}px ${Math.round(22 * scale)}px;
      border-radius: ${Math.round(12 * scale)}px;
      line-height: 1.05;
    }
    .kb-badge {
      font-family: "Inter", sans-serif;
      font-weight: 900;
      font-size: ${Math.round(18 * scale)}px;
      color: #0f172a;
      padding: ${Math.round(6 * scale)}px ${Math.round(16 * scale)}px;
      border-radius: ${Math.round(8 * scale)}px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .kb-headline {
      font-family: "Anton", "Bebas Neue", sans-serif;
      font-size: ${Math.round(74 * scale)}px;
      line-height: 1.02;
      text-transform: uppercase;
      letter-spacing: 0.01em;
    }
    .kb-sub {
      font-family: "Inter", sans-serif;
      font-weight: 800;
      font-size: ${Math.round(24 * scale)}px;
      opacity: 0.85;
      line-height: 1.3;
    }
    .kb-stat {
      font-family: "Anton", sans-serif;
      font-size: ${Math.round(115 * scale)}px;
      line-height: 1;
      text-shadow: 0 10px 30px rgba(0,0,0,0.45);
    }
    .kb-list {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: ${Math.round(14 * scale)}px;
      margin-top: ${Math.round(12 * scale)}px;
    }
    .kb-list-row {
      display: flex;
      align-items: center;
      gap: ${Math.round(14 * scale)}px;
      background: rgba(15, 23, 42, 0.78);
      border: 1px solid rgba(255, 255, 255, 0.16);
      padding: ${Math.round(16 * scale)}px ${Math.round(20 * scale)}px;
      border-radius: ${Math.round(14 * scale)}px;
      font-family: "Inter", sans-serif;
      font-weight: 800;
      font-size: ${Math.round(24 * scale)}px;
      color: #f8fafc;
    }
    .kb-bullet {
      width: ${Math.round(14 * scale)}px;
      height: ${Math.round(14 * scale)}px;
      border-radius: 99px;
      flex-shrink: 0;
    }
    ${css}
  </style>
</head>
<body>
  <div
    id="root"
    data-composition-id="main"
    data-root="true"
    data-start="0"
    data-duration="${totalDuration}"
    data-width="${width}"
    data-height="${height}"
    data-fps="${fps}"
  >
    ${blockHtmls.join('\n')}
    ${captionsHtml}
  </div>
  <script>
    (function() {
      const TOTAL_DURATION = ${totalDuration};
      const CAPTION_GROUPS = ${groupsJson};

      function updateCaptionsAtTime(t) {
        let activeGroupIdx = -1;
        for (let gIdx = 0; gIdx < CAPTION_GROUPS.length; gIdx++) {
          const g = CAPTION_GROUPS[gIdx];
          const nextStart = gIdx + 1 < CAPTION_GROUPS.length ? CAPTION_GROUPS[gIdx + 1].start : Infinity;
          const effectiveEnd = Math.min(g.end + 0.02, nextStart - 0.001);
          if (t >= g.start && t < effectiveEnd) {
            activeGroupIdx = gIdx;
            break;
          }
        }

        for (let gIdx = 0; gIdx < CAPTION_GROUPS.length; gIdx++) {
          const g = CAPTION_GROUPS[gIdx];
          const gEl = document.getElementById(g.id);
          if (!gEl) continue;
          const isGroupActive = gIdx === activeGroupIdx;
          gEl.style.opacity = isGroupActive ? "1" : "0";
          gEl.style.visibility = isGroupActive ? "visible" : "hidden";
          if (!isGroupActive) continue;

          let activeWordIdx = -1;
          for (let wIdx = 0; wIdx < g.words.length; wIdx++) {
            const w = g.words[wIdx];
            const wEnd = wIdx + 1 < g.words.length ? g.words[wIdx + 1].start : g.end + 0.02;
            if (t >= w.start && t < wEnd) {
              activeWordIdx = wIdx;
              break;
            }
          }
          if (activeWordIdx === -1 && g.words.length > 0) {
            activeWordIdx = t < g.words[0].start ? 0 : g.words.length - 1;
          }

          for (let wIdx = 0; wIdx < g.words.length; wIdx++) {
            const wEl = document.getElementById("cap-w-" + gIdx + "-" + wIdx);
            if (!wEl) continue;
            wEl.className = wIdx === activeWordIdx ? "ov-cap-word is-active" : "ov-cap-word";
          }
        }
      }

      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      const proxy = { t: 0 };
      tl.to(proxy, {
        t: TOTAL_DURATION,
        duration: TOTAL_DURATION,
        ease: "none",
        onUpdate: function() { updateCaptionsAtTime(proxy.t); }
      }, 0);

      ${gsapScripts.join('\n      ')}

      window.__timelines["main"] = tl;
      window.__seek = function(t) {
        tl.seek(t, false);
        updateCaptionsAtTime(t);
      };
      updateCaptionsAtTime(0);
    })();
  </script>
</body>
</html>`;

    const indexHtmlPath = path.join(outputDir, 'index.html');
    const srtPath = path.join(outputDir, 'captions.srt');
    const assPath = path.join(outputDir, 'captions.ass');

    writeFileSync(indexHtmlPath, html, 'utf8');
    writeFileSync(srtPath, generateSrtContent(allWords, project.captionStyle.wordsPerGroup), 'utf8');
    writeFileSync(assPath, generateAssContent(allWords, project.captionStyle, width, height), 'utf8');

    return {
      engine: 'kinetic',
      compositionDir: outputDir,
      indexHtmlPath,
      srtPath,
      assPath,
      totalDuration,
      allWordTimestamps: allWords,
    };
  }
}

// ============================================================================
// ENGINE 3: FREEFORM (Composição HTML/CSS/JS livre no contrato HyperFrames)
// ============================================================================

export class FreeformVideoEngine implements VideoEngine {
  public readonly id = 'freeform' as const;

  public async compose(
    project: Project,
    _characters: Character[],
    outputDir: string,
    options: ComposeOptions = {}
  ): Promise<ComposedArtifact> {
    mkdirSync(outputDir, { recursive: true });
    prepareCompositionAssets(outputDir, options.workspaceRoot);

    const width = project.renderSettings.width || 720;
    const height = project.renderSettings.height || 1280;
    const designKit = resolveProjectDesignKit(project, options);
    const freeform = project.freeform;
    if (!freeform || !freeform.html) {
      throw new Error('Projeto freeform sem HTML definido');
    }

    // Salva sub-composições e assets extras se fornecidos
    for (const [relPath, content] of Object.entries(freeform.subCompositions || {})) {
      const target = path.join(outputDir, relPath);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content, 'utf8');
    }
    for (const [relPath, content] of Object.entries(freeform.assets || {})) {
      const target = path.join(outputDir, relPath);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content, 'utf8');
    }

    const totalDuration = freeform.duration || project.totalDuration || 10;
    const allWords = collectGlobalWordTimestamps(project);

    // Substitui eventual CDN de GSAP por cópia local assets/vendor/gsap.min.js para funcionar offline
    let finalHtml = freeform.html.replace(
      /https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@[^"']+\/gsap\.min\.js/g,
      'assets/vendor/gsap.min.js'
    );

    const css = generateOverlaysCss(project.captionStyle, width, height, designKit);
    if (finalHtml.includes('</style>')) {
      finalHtml = finalHtml.replace('</style>', `\n${css}\n</style>`);
    }

    if (
      project.captionStyle.enabled &&
      allWords.length > 0 &&
      !finalHtml.includes('ov-captions-container')
    ) {
      const { html: captionsHtml, groupsJson } = buildCaptionsHtmlAndController(
        allWords,
        project.captionStyle
      );
      const captionBridgeScript = `
  <script>
    (function() {
      const CAPTION_GROUPS = ${groupsJson};
      function updateFreeformCaptions(t) {
        let activeGroupIdx = -1;
        for (let gIdx = 0; gIdx < CAPTION_GROUPS.length; gIdx++) {
          const g = CAPTION_GROUPS[gIdx];
          const nextStart = gIdx + 1 < CAPTION_GROUPS.length ? CAPTION_GROUPS[gIdx + 1].start : Infinity;
          const effectiveEnd = Math.min(g.end + 0.02, nextStart - 0.001);
          if (t >= g.start && t < effectiveEnd) {
            activeGroupIdx = gIdx;
            break;
          }
        }
        for (let gIdx = 0; gIdx < CAPTION_GROUPS.length; gIdx++) {
          const g = CAPTION_GROUPS[gIdx];
          const gEl = document.getElementById(g.id);
          if (!gEl) continue;
          const isGroupActive = gIdx === activeGroupIdx;
          gEl.style.opacity = isGroupActive ? "1" : "0";
          gEl.style.visibility = isGroupActive ? "visible" : "hidden";
          if (!isGroupActive) continue;
          let activeWordIdx = -1;
          for (let wIdx = 0; wIdx < g.words.length; wIdx++) {
            const w = g.words[wIdx];
            const wEnd = wIdx + 1 < g.words.length ? g.words[wIdx + 1].start : g.end + 0.02;
            if (t >= w.start && t < wEnd) {
              activeWordIdx = wIdx;
              break;
            }
          }
          if (activeWordIdx === -1 && g.words.length > 0) {
            activeWordIdx = t < g.words[0].start ? 0 : g.words.length - 1;
          }
          for (let wIdx = 0; wIdx < g.words.length; wIdx++) {
            const wEl = document.getElementById("cap-w-" + gIdx + "-" + wIdx);
            if (!wEl) continue;
            wEl.className = wIdx === activeWordIdx ? "ov-cap-word is-active" : "ov-cap-word";
          }
        }
      }
      const prevSeek = window.__seek;
      window.__seek = function(t) {
        if (typeof prevSeek === "function") prevSeek(t);
        updateFreeformCaptions(t);
      };
      const mainTl = window.__timelines && window.__timelines["main"];
      if (mainTl && typeof mainTl.eventCallback === "function") {
        const prevUpdate = mainTl.eventCallback("onUpdate");
        mainTl.eventCallback("onUpdate", function() {
          if (typeof prevUpdate === "function") prevUpdate();
          updateFreeformCaptions(mainTl.time());
        });
      }
      updateFreeformCaptions(0);
    })();
  </script>`;
      if (finalHtml.includes('</body>')) {
        finalHtml = finalHtml.replace(
          '</body>',
          `${captionsHtml}\n${captionBridgeScript}\n</body>`
        );
      }
    }

    const indexHtmlPath = path.join(outputDir, 'index.html');
    const srtPath = path.join(outputDir, 'captions.srt');
    const assPath = path.join(outputDir, 'captions.ass');

    writeFileSync(indexHtmlPath, finalHtml, 'utf8');
    writeFileSync(srtPath, generateSrtContent(allWords, project.captionStyle.wordsPerGroup), 'utf8');
    writeFileSync(assPath, generateAssContent(allWords, project.captionStyle, width, height), 'utf8');

    return {
      engine: 'freeform',
      compositionDir: outputDir,
      indexHtmlPath,
      srtPath,
      assPath,
      totalDuration,
      allWordTimestamps: allWords,
    };
  }
}

const ENGINE_REGISTRY: Record<VideoEngineId, VideoEngine> = {
  scene3d: new Scene3DVideoEngine(),
  kinetic: new KineticVideoEngine(),
  freeform: new FreeformVideoEngine(),
};

export function getVideoEngine(engineId: VideoEngineId): VideoEngine {
  return ENGINE_REGISTRY[engineId] || ENGINE_REGISTRY.scene3d;
}

export async function composeProject(
  project: Project,
  characters: Character[],
  outputDir: string,
  options?: ComposeOptions
): Promise<ComposedArtifact> {
  const engine = getVideoEngine(project.engine);
  return engine.compose(project, characters, outputDir, options);
}
