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
} from '@kinema/core';

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
 * Detecta a licença declarada no repositório vendor (LICENSE / REUSE.toml).
 */
function detectRepoLicense(repoDir: string, defaultLicense: string, isMarkdownDoc = false): string {
  const licensePath = path.join(repoDir, 'LICENSE');
  const reusePath = path.join(repoDir, 'REUSE.toml');
  if (existsSync(licensePath)) {
    try {
      const text = readFileSync(licensePath, 'utf8');
      if (isMarkdownDoc && /CC[\s-]BY[\s-]NC[\s-]4\.0/i.test(text)) {
        return 'CC-BY-NC-4.0 (Docs — No Redistribution)';
      }
      if (/CC[\s-]BY[\s-]4\.0/i.test(text)) return 'CC-BY-4.0';
      if (/Apache[\s-]2\.0/i.test(text)) return 'Apache-2.0';
      if (/MIT License/i.test(text)) return 'MIT';
    } catch {
      // Fallback
    }
  }
  if (existsSync(reusePath)) {
    try {
      const reuse = readFileSync(reusePath, 'utf8');
      if (isMarkdownDoc && /CC-BY-NC-4\.0/.test(reuse)) {
        return 'CC-BY-NC-4.0 (Docs — No Redistribution)';
      }
    } catch {
      // Fallback
    }
  }
  return defaultLicense;
}

function slugifyKeyword(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const IGNORED_DOC_BASENAMES = new Set([
  'license',
  'notices',
  'notice',
  'changelog',
  'package',
  'package-lock',
  'tsconfig',
  'vite.config',
]);

const IGNORED_SECTION_TITLES = /^(license|licen[cs]e|notices?|credits?|changelog|table of contents|contents|contributing)$/i;

/**
 * Extrai estilos reais (`styles/<slug>/STYLE.md`) e docs de técnica do `lemo-opuscar`.
 */
function extractLemoOpuscarItems(rootDir: string, repoDir: string, spec: VendorRepoSpec): LibraryItem[] {
  const items: LibraryItem[] = [];
  const sourceRepo = spec.url.replace(/\.git$/, '');
  const styleLicense = detectRepoLicense(repoDir, 'Undeclared (Local Only — Do Not Redistribute)', true);
  const stylesDir = path.join(repoDir, 'styles');

  // 1. Estilos reais em styles/<slug>/STYLE.md (ignora _template e README.md)
  if (existsSync(stylesDir)) {
    const entries = readdirSync(stylesDir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

      const slug = entry.name;
      const styleDir = path.join(stylesDir, slug);
      const styleMdPath = path.join(styleDir, 'STYLE.md');
      if (!existsSync(styleMdPath)) continue;

      const styleMd = readFileSync(styleMdPath, 'utf8');
      const styleJsonPath = path.join(styleDir, 'style.json');
      let styleJson: Record<string, any> = {};
      if (existsSync(styleJsonPath)) {
        try {
          styleJson = JSON.parse(readFileSync(styleJsonPath, 'utf8'));
        } catch {
          styleJson = {};
        }
      }

      // Título a partir do H1 (# <Nome> — Style Prompt)
      const h1Raw = styleMd.match(/^#\s+(.+)$/m)?.[1]?.trim() || '';
      const cleanTitle =
        h1Raw
          .replace(/\s*[—–-]\s*Style\s+Prompt\s*$/i, '')
          .trim() ||
        String(styleJson.en || '') ||
        slug
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');

      // Descrição: primeiro blockquote descritivo após o H1 (ignorando linha "References (grammar only):")
      const blockquoteLines = styleMd
        .split('\n')
        .filter((l) => l.trim().startsWith('>'))
        .map((l) => l.replace(/^>\s*/, '').trim())
        .filter((l) => l.length > 0 && !/^references\b/i.test(l));
      const firstBlockquote = blockquoteLines[0] || String(styleJson.line || '');
      const firstSentence =
        firstBlockquote.match(/^[^.!?]+[.!?]/)?.[0]?.trim() ||
        firstBlockquote.slice(0, 240).trim();

      // Suits / uso e tags derivadas
      const suitsLine = styleMd.match(/^Suits\s+(.+)$/im)?.[1] || '';
      const rawKeywords = [
        ...slug.split('-'),
        ...(Array.isArray(styleJson.uses) ? styleJson.uses.map(String) : []),
        ...(styleJson.category_en ? [String(styleJson.category_en)] : []),
        ...suitsLine
          .replace(/[.,;:!?()]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length >= 4 && !/^(that|with|from|this|into|your|more|when|where|which|they|them|have|will|suits|short|long|how|the|and|for)$/i.test(w)),
      ];
      const tags = Array.from(
        new Set(
          ['lemo-opuscar', 'style', slug, ...rawKeywords.map(slugifyKeyword)].filter(
            (t) => t.length >= 2
          )
        )
      ).slice(0, 14);

      // Thumbnail / preview se existir imagem ou vídeo na pasta do estilo
      let previewUrl: string | undefined;
      for (const candidate of ['poster.jpg', 'poster.png', 'poster.webp', 'preview.mp4', 'preview.gif']) {
        const candidateAbs = path.join(styleDir, candidate);
        if (existsSync(candidateAbs)) {
          previewUrl = path.relative(rootDir, candidateAbs);
          break;
        }
      }
      if (!previewUrl) {
        const stillsDir = path.join(styleDir, 'demo', 'stills');
        if (existsSync(stillsDir)) {
          const stillFile = readdirSync(stillsDir).find((f) => /\.(jpe?g|png|webp|mp4)$/i.test(f));
          if (stillFile) {
            previewUrl = path.relative(rootDir, path.join(stillsDir, stillFile));
          }
        }
      }

      items.push({
        id: `lemo-style-${slug}`,
        type: 'style',
        title: cleanTitle,
        description: firstSentence || `Estilo cinematográfico ${cleanTitle} (Lemo-Opuscar).`,
        tags,
        sourceRepo,
        sourcePath: path.relative(rootDir, styleMdPath),
        license: styleLicense,
        previewUrl,
        engineHint: 'freeform',
        contentPreview: styleMd.slice(0, 1200),
        metadata: {
          slug,
          num: styleJson.num,
          category: styleJson.category_en,
          uses: styleJson.uses,
          film: styleJson.film,
        },
      });
    }
  }

  // 2. Docs gerais do lemo-opuscar (AGENTS.md, DIRECTOR.md, TECHNIQUE.md, etc.) apenas como 'technique'
  const topFiles = existsSync(repoDir)
    ? readdirSync(repoDir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.md'))
        .map((e) => path.join(repoDir, e.name))
    : [];
  const docsDirFiles = walkFiles(path.join(repoDir, 'docs'), 60).filter((f) => f.endsWith('.md'));

  for (const docFile of [...topFiles, ...docsDirFiles]) {
    const baseName = path.basename(docFile, '.md');
    if (IGNORED_DOC_BASENAMES.has(baseName.toLowerCase())) continue;
    if (/\.zh-CN$/i.test(baseName) || baseName.toLowerCase() === 'readme') continue;

    const relPath = path.relative(rootDir, docFile);
    let content = '';
    try {
      content = readFileSync(docFile, 'utf8');
    } catch {
      continue;
    }
    const sections = content.split(/^#{2,3}\s+/m);
    if (sections.length > 2) {
      sections.slice(1, 30).forEach((sec, idx) => {
        const lines = sec.trim().split('\n');
        const rawTitle = (lines[0] || '').replace(/[*_`[\]]/g, '').trim();
        if (!rawTitle || rawTitle.length < 3 || rawTitle.length > 100) return;
        if (IGNORED_SECTION_TITLES.test(rawTitle)) return;
        const body = lines.slice(1).join('\n').trim();
        if (body.length < 40) return;
        const secSlug = slugifyKeyword(rawTitle).slice(0, 40);
        items.push({
          id: `lemo-tech-${slugifyKeyword(baseName)}-${secSlug}-${idx}`,
          type: 'technique',
          title: `${baseName}: ${rawTitle}`,
          description: body.slice(0, 220).replace(/\s+/g, ' '),
          tags: ['lemo-opuscar', 'technique', slugifyKeyword(baseName), ...secSlug.split('-').filter((t) => t.length > 2)].slice(0, 8),
          sourceRepo,
          sourcePath: relPath,
          license: styleLicense,
          contentPreview: body.slice(0, 1200),
          metadata: { sectionIndex: idx },
        });
      });
    }
  }

  return items;
}

/**
 * Extrai exatamente 1 item por vídeo/prompt do `awesome-opus5-5-videos`.
 */
function extractAwesomePromptsItems(rootDir: string, repoDir: string, spec: VendorRepoSpec): LibraryItem[] {
  const items: LibraryItem[] = [];
  const sourceRepo = spec.url.replace(/\.git$/, '');
  const license = detectRepoLicense(repoDir, spec.license);
  const videosJsonPath = path.join(repoDir, 'data', 'videos.json');
  const promptsDir = path.join(repoDir, 'prompts');

  if (existsSync(videosJsonPath)) {
    try {
      const list = JSON.parse(readFileSync(videosJsonPath, 'utf8'));
      if (Array.isArray(list)) {
        for (const entry of list) {
          const slug = String(entry.slug || '').trim();
          if (!slug) continue;
          const promptMdPath = path.join(promptsDir, `${slug}.md`);
          const sourceFile = existsSync(promptMdPath) ? promptMdPath : videosJsonPath;
          const promptText = String(entry.prompt || '').trim();
          const author = String(entry.author || '').trim();
          const category = String(entry.category || 'video').trim();
          const techTags = Array.isArray(entry.tech_tags) ? entry.tech_tags.map(String) : [];

          items.push({
            id: `awesome-prompt-${slug}`,
            type: 'prompt',
            title: author ? `@${author} — ${category} (${slug})` : `${category} (${slug})`,
            description: (promptText || `Prompt de vídeo ${slug}`).slice(0, 220).replace(/\s+/g, ' '),
            tags: Array.from(
              new Set(['awesome-opus5-5-videos', 'prompt', slugifyKeyword(category), ...techTags.map(slugifyKeyword)].filter(Boolean))
            ).slice(0, 10),
            sourceRepo,
            sourcePath: path.relative(rootDir, sourceFile),
            license,
            previewUrl: entry.poster_url ? String(entry.poster_url) : undefined,
            engineHint: techTags.some((t: string) => /three/i.test(t)) ? 'freeform' : undefined,
            contentPreview: promptText.slice(0, 1200),
            metadata: {
              slug,
              author,
              category,
              techTags,
              postUrl: entry.post_url,
              skillryUrl: entry.skillry_url,
              added: entry.added,
            },
          });
        }
        return items;
      }
    } catch {
      // Segue para fallback em prompts/*.md
    }
  }

  // Fallback para fixtures mínimas com prompts/*.md
  if (existsSync(promptsDir)) {
    const mdFiles = readdirSync(promptsDir)
      .filter((f) => f.endsWith('.md'))
      .sort();
    for (const file of mdFiles) {
      const abs = path.join(promptsDir, file);
      const slug = path.basename(file, '.md');
      const content = readFileSync(abs, 'utf8');
      const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || slug;
      const promptBlock = content.match(/##\s*Prompt[\s\S]*?```(?:text)?\n([\s\S]*?)```/i)?.[1]?.trim() || content;
      items.push({
        id: `awesome-prompt-${slug}`,
        type: 'prompt',
        title: h1,
        description: promptBlock.slice(0, 220).replace(/\s+/g, ' '),
        tags: ['awesome-opus5-5-videos', 'prompt', slug],
        sourceRepo,
        sourcePath: path.relative(rootDir, abs),
        license,
        contentPreview: promptBlock.slice(0, 1200),
        metadata: { slug },
      });
    }
  }

  return items;
}

/**
 * Extrai exatamente 1 item por efeito PixelFX (`src/fx/<category>/<name>.js`, ignorando helpers `_*.js`).
 */
function extractPixelFxItems(rootDir: string, repoDir: string, spec: VendorRepoSpec): LibraryItem[] {
  const items: LibraryItem[] = [];
  const sourceRepo = spec.url.replace(/\.git$/, '');
  const license = detectRepoLicense(repoDir, spec.license);
  const fxRoot = path.join(repoDir, 'src', 'fx');
  if (!existsSync(fxRoot)) return items;

  const categories = readdirSync(fxRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const catDir of categories) {
    const cat = catDir.name;
    const catPath = path.join(fxRoot, cat);
    const files = readdirSync(catPath)
      .filter((f) => f.endsWith('.js') && !f.startsWith('_'))
      .sort();

    for (const file of files) {
      const abs = path.join(catPath, file);
      const slug = path.basename(file, '.js');
      const content = readFileSync(abs, 'utf8');

      const name = content.match(/\bname\s*:\s*["'`]([^"'`]+)["'`]/)?.[1]?.trim() || slug;
      const desc = content.match(/\bdesc\s*:\s*["'`]([^"'`]+)["'`]/)?.[1]?.trim() || '';
      const tagsRaw = content.match(/\btags\s*:\s*\[([^\]]*)\]/)?.[1] || '';
      const parsedTags = Array.from(tagsRaw.matchAll(/["'`]([^"'`]+)["'`]/g)).map((m) =>
        slugifyKeyword(m[1])
      );
      const durationMatch = content.match(/\bduration\s*:\s*([0-9.]+)/)?.[1];

      items.push({
        id: `pixelfx-${cat}-${slug}`,
        type: 'effect',
        title: name,
        description: desc || `Efeito PixelFX ${cat}/${slug}`,
        tags: Array.from(new Set(['pixelfx', 'effect', cat, slug, ...parsedTags].filter(Boolean))).slice(0, 10),
        sourceRepo,
        sourcePath: path.relative(rootDir, abs),
        license,
        contentPreview: content.slice(0, 1200),
        metadata: {
          fxId: `${cat}/${slug}`,
          category: cat,
          duration: durationMatch ? Number(durationMatch) : undefined,
        },
      });
    }
  }

  return items;
}

/**
 * Extrai múltiplos itens de um arquivo Markdown (ex: README com seções `##` ou `###`)
 * ou de arquivos individuais (.md, .json, .ts, .js, .glsl).
 */
export function extractItemsFromVendorRepo(
  rootDir: string,
  repoDir: string,
  spec: VendorRepoSpec
): LibraryItem[] {
  if (spec.folder === 'lemo-opuscar') {
    return extractLemoOpuscarItems(rootDir, repoDir, spec);
  }
  if (spec.folder === 'awesome-opus5-5-videos') {
    return extractAwesomePromptsItems(rootDir, repoDir, spec);
  }
  if (spec.folder === 'pixelfx') {
    return extractPixelFxItems(rootDir, repoDir, spec);
  }

  const items: LibraryItem[] = [];
  const files = walkFiles(repoDir, 400);
  const repoLicense = detectRepoLicense(repoDir, spec.license);

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const baseName = path.basename(file, ext);
    if (IGNORED_DOC_BASENAMES.has(baseName.toLowerCase())) continue;
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

    if (ext === '.md' && content.length > 1200) {
      const sections = content.split(/^#{2,3}\s+/m);
      if (sections.length > 3) {
        sections.slice(1, 110).forEach((sec, idx) => {
          const lines = sec.trim().split('\n');
          const rawTitle = (lines[0] || '').replace(/[*_`[\]]/g, '').trim();
          if (!rawTitle || rawTitle.length < 3 || rawTitle.length > 100) return;
          if (IGNORED_SECTION_TITLES.test(rawTitle)) return;
          const body = lines.slice(1).join('\n').trim();
          if (body.length < 25) return;

          const slug = slugifyKeyword(rawTitle).slice(0, 40);

          items.push({
            id: `${spec.folder}-${slug}-${idx}`,
            type: spec.type,
            title: rawTitle,
            description: body.slice(0, 220).replace(/\s+/g, ' '),
            tags: [spec.folder, spec.type, ...slug.split('-').filter((t) => t.length > 2)].slice(0, 8),
            sourceRepo: spec.url.replace(/\.git$/, ''),
            sourcePath: relPath,
            license: repoLicense,
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
              license: repoLicense,
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
      license: repoLicense,
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
