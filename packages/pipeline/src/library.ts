import { execFile } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  LibraryItem,
  LibraryItemType,
  ReferenceBreakdown,
  StageTemplateId,
} from '@videos/core';

const execFileAsync = promisify(execFile);

interface VendorRepoSpec {
  folder: string;
  url: string;
  type: LibraryItemType;
  license: string;
}

const VENDOR_REPOS: VendorRepoSpec[] = [
  {
    folder: 'awesome-opus5-5-videos',
    url: 'https://github.com/yihui-dev/awesome-opus5-5-videos.git',
    type: 'prompt',
    license: 'MIT',
  },
  {
    folder: 'lemo-opuscar',
    url: 'https://github.com/lemomo-ai/lemo-opuscar.git',
    type: 'style',
    license: 'Local Only (Undeclared)',
  },
  {
    folder: 'pixelfx',
    url: 'https://github.com/patch-gg/pixelfx.git',
    type: 'effect',
    license: 'MIT',
  },
  {
    folder: 'remotion-skills',
    url: 'https://github.com/remotion-dev/skills.git',
    type: 'technique',
    license: 'MIT',
  },
  {
    folder: 'rea-video',
    url: 'https://github.com/JuneYaooo/rea-video.git',
    type: 'technique',
    license: 'Apache-2.0',
  },
];

function walkFiles(dir: string, maxFiles = 400): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  function recurse(current: string) {
    if (results.length >= maxFiles) return;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        recurse(full);
      } else {
        results.push(full);
      }
    }
  }

  recurse(dir);
  return results;
}

/**
 * Extrai múltiplos itens de um arquivo Markdown (ex: README com seções `##` ou `###`)
 * ou de arquivos individuais (.md, .json, .ts, .js, .glsl).
 */
function extractItemsFromVendorRepo(
  rootDir: string,
  repoDir: string,
  spec: VendorRepoSpec
): LibraryItem[] {
  const items: LibraryItem[] = [];
  const files = walkFiles(repoDir, 350);

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const baseName = path.basename(file, ext);
    if (!['.md', '.json', '.ts', '.tsx', '.js', '.html', '.txt', '.glsl', '.frag'].includes(ext)) {
      continue;
    }
    let stat;
    try {
      stat = statSync(file);
      if (stat.size > 512 * 1024 || stat.size < 20) continue;
    } catch {
      continue;
    }

    const relPath = path.relative(rootDir, file);
    let content = '';
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    // Se for um README.md grande com várias seções (como awesome-opus5-5-videos ou lemo-opuscar),
    // extrai também cada seção ### como um item individual pesquisável
    if (ext === '.md' && content.length > 1200) {
      const sections = content.split(/^#{2,3}\s+/m);
      if (sections.length > 3) {
        sections.slice(1, 110).forEach((sec, idx) => {
          const lines = sec.trim().split('\n');
          const rawTitle = (lines[0] || '').replace(/[*_`[\]]/g, '').trim();
          if (!rawTitle || rawTitle.length < 3 || rawTitle.length > 100) return;
          const body = lines.slice(1).join('\n').trim();
          if (body.length < 25) return;

          const slug = rawTitle
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
            .slice(0, 40);

          items.push({
            id: `${spec.folder}-${slug}-${idx}`,
            type: spec.type,
            title: rawTitle,
            description: body.slice(0, 220).replace(/\s+/g, ' '),
            tags: [spec.folder, spec.type, ...slug.split('-').filter((t) => t.length > 2)].slice(0, 8),
            sourceRepo: spec.url.replace(/\.git$/, ''),
            sourcePath: relPath,
            license: spec.license,
            contentPreview: body.slice(0, 1200),
            metadata: { sectionIndex: idx },
          });
        });
        continue;
      }
    }

    // Se for um JSON de array ou catálogo (ex: efeitos/estilos em JSON)
    if (ext === '.json' && !file.endsWith('package.json') && !file.endsWith('tsconfig.json')) {
      try {
        const parsed = JSON.parse(content);
        const list = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.items)
            ? parsed.items
            : Array.isArray(parsed.styles)
              ? parsed.styles
              : Array.isArray(parsed.effects)
                ? parsed.effects
                : null;
        if (list && list.length > 0) {
          list.slice(0, 260).forEach((entry: any, idx: number) => {
            const title = String(entry.title || entry.name || entry.id || `${baseName} #${idx + 1}`);
            const desc = String(entry.description || entry.prompt || entry.summary || '');
            const idSlug = String(entry.id || entry.name || idx)
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-');
            items.push({
              id: `${spec.folder}-${idSlug}-${idx}`,
              type: spec.type,
              title,
              description: desc.slice(0, 240),
              tags: Array.isArray(entry.tags)
                ? entry.tags.map(String)
                : [spec.folder, spec.type, baseName],
              sourceRepo: spec.url.replace(/\.git$/, ''),
              sourcePath: relPath,
              license: spec.license,
              contentPreview: JSON.stringify(entry, null, 2).slice(0, 1200),
              metadata: {},
            });
          });
          continue;
        }
      } catch {
        // Segue como arquivo normal
      }
    }

    if (['package', 'package-lock', 'tsconfig', 'vite.config'].includes(baseName)) continue;

    const firstHeading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const title = firstHeading || `${spec.folder}: ${baseName}`;
    const desc = content
      .replace(/^#.*$/gm, '')
      .trim()
      .slice(0, 220)
      .replace(/\s+/g, ' ');

    items.push({
      id: `${spec.folder}-${baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${items.length}`,
      type: spec.type,
      title,
      description: desc || `Arquivo ${relPath} de ${spec.folder}`,
      tags: [spec.folder, spec.type, baseName.toLowerCase()],
      sourceRepo: spec.url.replace(/\.git$/, ''),
      sourcePath: relPath,
      license: spec.license,
      contentPreview: content.slice(0, 1200),
      metadata: {},
    });
  }

  return items;
}

/**
 * Indexa os ~450 blocos e componentes do registry local do HyperFrames.
 */
function indexLocalHyperFramesRegistry(): LibraryItem[] {
  const items: LibraryItem[] = [];
  const seen = new Set<string>();

  // 1. Cache local em ~/.hyperframes/cache
  const hfCacheDir = '/home/higorlino/.hyperframes/cache';
  if (existsSync(hfCacheDir)) {
    const files = readdirSync(hfCacheDir).filter(
      (f) => (f.includes('__blocks__') || f.includes('__components__')) && f.endsWith('.json')
    );
    for (const file of files) {
      const fullPath = path.join(hfCacheDir, file);
      try {
        const raw = JSON.parse(readFileSync(fullPath, 'utf8'));
        const data = raw.data || raw;
        if (!data || !data.name) continue;
        const id = `hf-block-${data.name}`;
        if (seen.has(id)) continue;
        seen.add(id);

        items.push({
          id,
          type: 'block',
          title: data.title || data.name,
          description: data.description || `Bloco HyperFrames ${data.name}`,
          tags: Array.isArray(data.tags) ? ['hyperframes', ...data.tags] : ['hyperframes', 'block'],
          sourceRepo: 'https://github.com/heygen-com/hyperframes',
          sourcePath: fullPath,
          license: 'Apache-2.0',
          engineHint: 'freeform',
          contentPreview: JSON.stringify(
            {
              name: data.name,
              title: data.title,
              description: data.description,
              dimensions: data.dimensions,
              duration: data.duration,
              variables: data.variables,
            },
            null,
            2
          ),
          metadata: {
            duration: data.duration,
            dimensions: data.dimensions,
          },
        });
      } catch {
        // Ignora item malformado
      }
    }
  }

  // 2. Catálogo OpenMotion em /home/higorlino/openmotion/web/catalog/hyperframes.json
  const omCatalogPath = '/home/higorlino/openmotion/web/catalog/hyperframes.json';
  if (existsSync(omCatalogPath)) {
    try {
      const catalog = JSON.parse(readFileSync(omCatalogPath, 'utf8'));
      const entries = Array.isArray(catalog.entries) ? catalog.entries : [];
      for (const entry of entries) {
        if (!['block', 'component', 'example'].includes(entry.collection)) continue;
        const cleanSlug = String(entry.id || '').replace(/^hf-(block|component|example)-/, '');
        const id = `hf-block-${cleanSlug}`;
        if (seen.has(id)) continue;
        seen.add(id);

        items.push({
          id,
          type: 'block',
          title: entry.title || cleanSlug,
          description: entry.description || `Componente HyperFrames (${entry.collection})`,
          tags: Array.isArray(entry.tags) ? ['hyperframes', ...entry.tags] : ['hyperframes', entry.collection],
          sourceRepo: 'https://github.com/heygen-com/hyperframes',
          sourcePath: entry.sourceUrl || omCatalogPath,
          license: 'Apache-2.0',
          previewUrl: entry.posterAvailable ? entry.poster : undefined,
          engineHint: 'freeform',
          contentPreview: `${entry.title}\n\n${entry.description || ''}\nSource: ${entry.sourceUrl || ''}`,
          metadata: { collection: entry.collection, ratio: entry.ratio, seconds: entry.seconds },
        });
      }
    } catch {
      // Ignora erro de leitura
    }
  }

  return items;
}

/**
 * Faz `git clone --depth 1` dos 5 repositórios em `library/vendor/<repo>` (gitignored)
 * e indexa tudo + blocos HyperFrames em `library/index.json`.
 */
export async function syncLibraryRepositories(rootDir: string): Promise<{
  count: number;
  items: LibraryItem[];
  repoStats: Record<string, number>;
}> {
  const libraryDir = path.join(rootDir, 'library');
  const vendorDir = path.join(libraryDir, 'vendor');
  mkdirSync(vendorDir, { recursive: true });

  const allItems: LibraryItem[] = [];
  const repoStats: Record<string, number> = {};

  for (const spec of VENDOR_REPOS) {
    const targetDir = path.join(vendorDir, spec.folder);
    if (!existsSync(targetDir)) {
      try {
        await execFileAsync(
          'git',
          ['clone', '--depth', '1', spec.url, targetDir],
          { timeout: 60_000 }
        );
      } catch {
        // Se estiver offline ou o repo falhar, segue com os demais e seeds embutidos
      }
    }

    if (existsSync(targetDir)) {
      const extracted = extractItemsFromVendorRepo(rootDir, targetDir, spec);
      repoStats[spec.folder] = extracted.length;
      allItems.push(...extracted);
    } else {
      repoStats[spec.folder] = 0;
    }
  }

  // Indexar blocos locais do HyperFrames (~450 blocos)
  const hfBlocks = indexLocalHyperFramesRegistry();
  repoStats['hyperframes-registry'] = hfBlocks.length;
  allItems.push(...hfBlocks);

  const indexPayload = {
    version: 1,
    syncedAt: new Date().toISOString(),
    repoStats,
    count: allItems.length,
    items: allItems,
  };

  writeFileSync(
    path.join(libraryDir, 'index.json'),
    JSON.stringify(indexPayload, null, 2) + '\n',
    'utf8'
  );

  return {
    count: allItems.length,
    items: allItems,
    repoStats,
  };
}

// ============================================================================
// MODO "RECRIAR A PARTIR DE VÍDEO" (Baseado em JuneYaooo/rea-video + FFmpeg)
// ============================================================================

export async function analyzeReferenceVideo(params: {
  videoPath: string;
  dataDir: string;
  libraryDir: string;
  transcribe?: boolean;
}): Promise<ReferenceBreakdown> {
  const { videoPath, dataDir, libraryDir } = params;
  if (!existsSync(videoPath)) {
    throw new Error(`Arquivo de vídeo de referência não encontrado: ${videoPath}`);
  }

  const id = `breakdown-${Date.now()}`;
  const outDir = path.join(dataDir, 'breakdowns', id);
  const framesDir = path.join(outDir, 'frames');
  mkdirSync(framesDir, { recursive: true });

  // 1. Probe do vídeo com ffprobe
  const { stdout: probeStdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration:stream=codec_type,width,height,r_frame_rate',
    '-of',
    'json',
    videoPath,
  ]);
  const probeData = JSON.parse(probeStdout);
  const streams: any[] = probeData.streams || [];
  const videoStream = streams.find((s) => s.codec_type === 'video') || {};
  const hasAudio = streams.some((s) => s.codec_type === 'audio');
  const width = Number(videoStream.width) || 720;
  const height = Number(videoStream.height) || 1280;
  const duration = Number(parseFloat(probeData.format?.duration || '15').toFixed(2));
  const fpsParts = String(videoStream.r_frame_rate || '30/1').split('/');
  const fps = Math.round(Number(fpsParts[0]) / Number(fpsParts[1] || 1)) || 30;

  // 2. Detectar cortes de cena via ffmpeg select='gt(scene,0.28)'
  const cutTimestamps: number[] = [0];
  try {
    const { stderr } = await execFileAsync(
      'ffmpeg',
      [
        '-i',
        videoPath,
        '-vf',
        "select='gt(scene,0.28)',showinfo",
        '-f',
        'null',
        '-',
      ],
      { timeout: 45_000 }
    );
    const regex = /pts_time:([0-9.]+)/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(stderr)) !== null) {
      const ts = Number(parseFloat(m[1]).toFixed(2));
      if (ts - cutTimestamps[cutTimestamps.length - 1] >= 1.8 && ts < duration - 0.5) {
        cutTimestamps.push(ts);
      }
      if (cutTimestamps.length >= 10) break;
    }
  } catch {
    // Fallback para amostragem uniforme
  }

  if (cutTimestamps.length < 3) {
    const step = Math.max(2.5, Number((duration / 6).toFixed(2)));
    for (let t = step; t < duration - 0.8 && cutTimestamps.length < 7; t += step) {
      cutTimestamps.push(Number(t.toFixed(2)));
    }
  }

  // 3. Extrair 1 frame PNG por plano detectado
  const templateRotation: StageTemplateId[] = [
    'red-carpet-confetti',
    'pulpit-plenary',
    'brazil-map-3d',
    'city-spending-cap',
    'timeline-3d',
    'bar-chart-3d',
    'street-protest',
  ];

  const shots = [];
  for (let i = 0; i < cutTimestamps.length; i++) {
    const startTime = cutTimestamps[i];
    const endTime = i + 1 < cutTimestamps.length ? cutTimestamps[i + 1] : duration;
    const shotDur = Number(Math.max(1.0, endTime - startTime).toFixed(2));
    const sampleTime = Number((startTime + Math.min(0.8, shotDur * 0.35)).toFixed(2));
    const framePath = path.join(framesDir, `shot_${String(i + 1).padStart(2, '0')}.png`);

    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-ss',
        String(sampleTime),
        '-i',
        videoPath,
        '-frames:v',
        '1',
        '-vf',
        'scale=360:-1',
        framePath,
      ]);
    } catch {
      // Ignora falha individual
    }

    const suggestedTemplate = templateRotation[i % templateRotation.length];
    shots.push({
      index: i,
      startTime,
      endTime,
      duration: shotDur,
      framePath,
      dominantColors: ['#f5c518', '#c1121f', '#1d3557'],
      suggestedTemplate,
      suggestedCamera: (i % 2 === 0 ? 'dolly-in' : 'pan') as 'dolly-in' | 'pan',
      transcriptSegment: `Plano ${i + 1} (${startTime}s–${endTime}s)`,
      visualDescription: `Plano ${i + 1} detectado em ${startTime}s (${shotDur}s). Template 3D sugerido: ${suggestedTemplate}.`,
    });
  }

  // 4. Carregar diretrizes do Rea-Video se clonado em library/vendor/rea-video
  let reaPromptSnippet = '';
  const reaVendorDir = path.join(libraryDir, 'vendor', 'rea-video');
  if (existsSync(reaVendorDir)) {
    const reaFiles = walkFiles(reaVendorDir, 20).filter((f) => f.endsWith('.md'));
    if (reaFiles[0]) {
      try {
        reaPromptSnippet = readFileSync(reaFiles[0], 'utf8').slice(0, 1500);
      } catch {
        reaPromptSnippet = '';
      }
    }
  }

  const reaVideoGuide = `# Ficha de Engenharia Reversa de Vídeo (Metodologia Rea-Video)
- **Arquivo analisado**: \`${path.basename(videoPath)}\` (${width}x${height} @ ${fps}fps, ${duration}s)
- **Planos/Cortes detectados**: ${shots.length} planos (média de ${(duration / Math.max(1, shots.length)).toFixed(1)}s por corte)
- **Fluxo para o Agente / Criador**:
  1. Revise os frames extraídos em \`${framesDir}\`.
  2. Para cada plano, mapeie o template 3D (\`scene3d\`), tipografia (\`kinetic\`) ou cena HTML (\`freeform\`).
  3. Sincronize a narração TTS com legendas \`highlight-yellow\` de 2–3 palavras.
${reaPromptSnippet ? `\n## Referência Rea-Video Local\n${reaPromptSnippet}` : ''}`;

  const breakdown: ReferenceBreakdown = {
    id,
    videoPath,
    width,
    height,
    fps,
    duration,
    hasAudio,
    shots,
    fullTranscript: '',
    reaVideoGuide,
    suggestedEngine: width <= height ? 'scene3d' : 'freeform',
    createdAt: new Date().toISOString(),
  };

  writeFileSync(path.join(outDir, 'breakdown.json'), JSON.stringify(breakdown, null, 2), 'utf8');
  return breakdown;
}
