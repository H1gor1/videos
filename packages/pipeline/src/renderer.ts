import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import type { AppSettings, RendererId, RenderSettings } from '@kinema/core';

const execFileAsync = promisify(execFile);

export interface RenderVideoOptions {
  compositionDir: string;
  outputMp4Path: string;
  totalDuration: number;
  renderSettings: RenderSettings;
  settings: AppSettings;
  onProgress?: (percent: number, message: string) => void;
}

export interface PreviewFrameResult {
  timestamp: number;
  pngPath: string;
  base64: string;
  sceneId?: string;
}

export interface Renderer {
  readonly id: RendererId;
  renderPreviewFrames(params: {
    compositionDir: string;
    timestamps: number[];
    outputDir: string;
    width: number;
    height: number;
    settings: AppSettings;
  }): Promise<PreviewFrameResult[]>;
  renderVideo(options: RenderVideoOptions): Promise<string>;
}

/**
 * Monta o ambiente Node para o CLI do HyperFrames (incluindo o preload fix de captura do OpenMotion).
 */
function buildHyperframesEnv(settings: AppSettings): NodeJS.ProcessEnv {
  const captureFixPath = path.join(settings.hyperframesRoot, 'shared/hyperframes-capture-fix.mjs');
  const captureFixArg = existsSync(captureFixPath)
    ? `--import=${pathToFileURL(captureFixPath).href}`
    : '';
  const currentOpts = process.env.NODE_OPTIONS || '';
  const nodeOptions =
    captureFixArg && !currentOpts.includes(captureFixArg)
      ? [currentOpts, captureFixArg].filter(Boolean).join(' ')
      : currentOpts;

  return {
    ...process.env,
    TMPDIR: '/tmp',
    HYPERFRAMES_NO_TELEMETRY: '1',
    NODE_OPTIONS: nodeOptions,
  };
}

// ============================================================================
// 1. HYPERFRAMES RENDERER (Padrão Determinístico)
// ============================================================================

export class HyperFramesRenderer implements Renderer {
  public readonly id = 'hyperframes' as const;
  private fallback = new PlaywrightChromeRenderer();

  private resolveCliBin(settings: AppSettings): string | null {
    const candidate = path.join(
      settings.hyperframesRoot,
      'node_modules/hyperframes/bin/hyperframes.mjs'
    );
    if (existsSync(candidate)) return candidate;
    return null;
  }

  public async renderPreviewFrames(params: {
    compositionDir: string;
    timestamps: number[];
    outputDir: string;
    width: number;
    height: number;
    settings: AppSettings;
  }): Promise<PreviewFrameResult[]> {
    const cliBin = this.resolveCliBin(params.settings);
    if (!cliBin) {
      return this.fallback.renderPreviewFrames(params);
    }

    mkdirSync(params.outputDir, { recursive: true });
    const atArg = params.timestamps.map((t) => Number(t.toFixed(2))).join(',');

    try {
      await execFileAsync(
        process.execPath,
        [cliBin, 'snapshot', params.compositionDir, '--at', atArg, '--out', params.outputDir],
        {
          cwd: params.compositionDir,
          env: buildHyperframesEnv(params.settings),
          timeout: 90_000,
        }
      );

      const pngFiles = readdirSync(params.outputDir)
        .filter((f) => f.startsWith('frame-') && f.endsWith('.png'))
        .sort();

      if (pngFiles.length === 0) {
        return this.fallback.renderPreviewFrames(params);
      }

      return params.timestamps.map((ts, idx) => {
        const file = pngFiles[Math.min(idx, pngFiles.length - 1)];
        const pngPath = path.join(params.outputDir, file);
        const base64 = readFileSync(pngPath).toString('base64');
        return {
          timestamp: ts,
          pngPath,
          base64,
        };
      });
    } catch {
      return this.fallback.renderPreviewFrames(params);
    }
  }

  public async renderVideo(options: RenderVideoOptions): Promise<string> {
    const cliBin = this.resolveCliBin(options.settings);
    if (!cliBin) {
      return this.fallback.renderVideo(options);
    }

    mkdirSync(path.dirname(options.outputMp4Path), { recursive: true });

    try {
      await new Promise<void>((resolve, reject) => {
        const args = [
          cliBin,
          'render',
          options.compositionDir,
          '-o',
          options.outputMp4Path,
          '--fps',
          String(options.renderSettings.fps || 30),
          '--workers',
          String(options.renderSettings.workers || 2),
          '--crf',
          String(options.renderSettings.crf || 21),
        ];

        const child = spawn(process.execPath, args, {
          cwd: options.compositionDir,
          env: buildHyperframesEnv(options.settings),
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stderr = '';
        child.stdout.on('data', (chunk: Buffer) => {
          const text = chunk.toString('utf8');
          const match = text.match(/(\d{1,3})%/);
          if (match && options.onProgress) {
            const pct = Math.min(99, parseInt(match[1], 10));
            options.onProgress(pct, `HyperFrames renderizando (${pct}%)...`);
          }
        });
        child.stderr.on('data', (chunk: Buffer) => {
          stderr = (stderr + chunk.toString('utf8')).slice(-8000);
        });
        child.on('error', reject);
        child.on('close', (code) => {
          if (code === 0 && existsSync(options.outputMp4Path)) {
            resolve();
          } else {
            reject(new Error(`HyperFrames render falhou (code ${code}): ${stderr.slice(-500)}`));
          }
        });
      });

      return options.outputMp4Path;
    } catch {
      options.onProgress?.(10, 'Fallback para Playwright/Chrome ativado...');
      return this.fallback.renderVideo(options);
    }
  }
}

// ============================================================================
// 2. PLAYWRIGHT / CHROME FALLBACK RENDERER (`window.__seek(t)` + screenshots → FFmpeg)
// ============================================================================

export class PlaywrightChromeRenderer implements Renderer {
  public readonly id = 'playwright' as const;

  public async renderPreviewFrames(params: {
    compositionDir: string;
    timestamps: number[];
    outputDir: string;
    width: number;
    height: number;
    settings: AppSettings;
  }): Promise<PreviewFrameResult[]> {
    mkdirSync(params.outputDir, { recursive: true });
    const puppeteer = await import('puppeteer-core');
    const browser = await puppeteer.default.launch({
      executablePath: params.settings.chromePath || '/usr/bin/google-chrome',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--allow-file-access-from-files',
      ],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({
        width: params.width,
        height: params.height,
        deviceScaleFactor: 1,
      });

      const indexUrl = pathToFileURL(path.join(params.compositionDir, 'index.html')).href;
      await page.goto(indexUrl, { waitUntil: 'load', timeout: 30_000 });
      await page.evaluate(() => document.fonts?.ready);

      const results: PreviewFrameResult[] = [];
      for (let i = 0; i < params.timestamps.length; i++) {
        const ts = params.timestamps[i];
        await page.evaluate((t: number) => {
          const w = window as any;
          if (typeof w.__seek === 'function') {
            w.__seek(t);
          } else if (w.__timelines && w.__timelines.main) {
            w.__timelines.main.seek(t, false);
          }
        }, ts);

        const pngPath = path.join(params.outputDir, `frame-${String(i).padStart(2, '0')}-at-${ts.toFixed(1)}s.png`);
        await page.screenshot({ path: pngPath, type: 'png' });
        const base64 = readFileSync(pngPath).toString('base64');
        results.push({ timestamp: ts, pngPath, base64 });
      }
      return results;
    } finally {
      await browser.close();
    }
  }

  public async renderVideo(options: RenderVideoOptions): Promise<string> {
    const width = options.renderSettings.width || 720;
    const height = options.renderSettings.height || 1280;
    const fps = options.renderSettings.fps || 30;
    const totalFrames = Math.max(1, Math.ceil(options.totalDuration * fps));
    const framesDir = path.join(options.compositionDir, '.pw-frames');
    rmSync(framesDir, { recursive: true, force: true });
    mkdirSync(framesDir, { recursive: true });
    mkdirSync(path.dirname(options.outputMp4Path), { recursive: true });

    const puppeteer = await import('puppeteer-core');
    const browser = await puppeteer.default.launch({
      executablePath: options.settings.chromePath || '/usr/bin/google-chrome',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--allow-file-access-from-files',
      ],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      const indexUrl = pathToFileURL(path.join(options.compositionDir, 'index.html')).href;
      await page.goto(indexUrl, { waitUntil: 'load', timeout: 30_000 });
      await page.evaluate(() => document.fonts?.ready);

      for (let f = 0; f < totalFrames; f++) {
        const t = f / fps;
        await page.evaluate((timeSec: number) => {
          const w = window as any;
          if (typeof w.__seek === 'function') {
            w.__seek(timeSec);
          } else if (w.__timelines && w.__timelines.main) {
            w.__timelines.main.seek(timeSec, false);
          }
        }, t);

        const framePath = path.join(framesDir, `f_${String(f).padStart(5, '0')}.jpg`);
        await page.screenshot({ path: framePath, type: 'jpeg', quality: 92 });

        if (f % 15 === 0 && options.onProgress) {
          const pct = Math.round((f / totalFrames) * 90);
          options.onProgress(pct, `Capturando frame ${f + 1}/${totalFrames} via Chrome...`);
        }
      }
    } finally {
      await browser.close();
    }

    await execFileAsync('ffmpeg', [
      '-y',
      '-framerate',
      String(fps),
      '-i',
      path.join(framesDir, 'f_%05d.jpg'),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      String(options.renderSettings.crf || 21),
      options.outputMp4Path,
    ]);

    rmSync(framesDir, { recursive: true, force: true });
    return options.outputMp4Path;
  }
}

// ============================================================================
// 3. REMOTION RENDERER ADAPTER (Opcional, mesmo contrato `Renderer`)
// ============================================================================

export class RemotionRenderer implements Renderer {
  public readonly id = 'remotion' as const;
  private hyperframes = new HyperFramesRenderer();

  public async renderPreviewFrames(params: {
    compositionDir: string;
    timestamps: number[];
    outputDir: string;
    width: number;
    height: number;
    settings: AppSettings;
  }): Promise<PreviewFrameResult[]> {
    return this.hyperframes.renderPreviewFrames(params);
  }

  public async renderVideo(options: RenderVideoOptions): Promise<string> {
    options.onProgress?.(
      5,
      'Adapter Remotion selecionado (usando motor determinístico HyperFrames compatível)...'
    );
    return this.hyperframes.renderVideo(options);
  }
}

const RENDERERS: Record<RendererId, Renderer> = {
  hyperframes: new HyperFramesRenderer(),
  playwright: new PlaywrightChromeRenderer(),
  remotion: new RemotionRenderer(),
};

export function getRenderer(id: RendererId = 'hyperframes'): Renderer {
  return RENDERERS[id] || RENDERERS.hyperframes;
}
