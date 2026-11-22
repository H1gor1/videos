import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  FreeformCompositionSchema,
  KineticBlockSchema,
  STAGE_TEMPLATES,
  SceneSchema,
  createFreeformDemoProject,
  type AppSettings,
  type FreeformComposition,
  type KineticBlock,
  type Scene,
  type VideoEngineId,
} from '@kinema/core';

const execFileAsync = promisify(execFile);

// ============================================================================
// 1. IMAGE PROVIDER (none | comfyui)
// ============================================================================

export interface ImageProvider {
  readonly id: 'none' | 'comfyui';
  generateImage(params: {
    prompt: string;
    width: number;
    height: number;
    outputPath: string;
    settings: AppSettings;
  }): Promise<{ imagePath: string; provider: string }>;
}

async function generateProceduralFallbackPng(
  prompt: string,
  width: number,
  height: number,
  outputPath: string
): Promise<void> {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  // Escolhe paleta de cores determinística pelo hash do prompt
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    hash = (hash * 31 + prompt.charCodeAt(i)) >>> 0;
  }
  const palettes = ['0x0f172a', '0x1e1b4b', '0x022c22', '0x3b0764', '0x450a0a'];
  const bgHex = palettes[hash % palettes.length];
  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=${bgHex}:s=${width}x${height}:d=1`,
    '-frames:v',
    '1',
    outputPath,
  ]);
}

export async function generateSceneImage(params: {
  prompt: string;
  width?: number;
  height?: number;
  outputPath: string;
  settings: AppSettings;
}): Promise<{ imagePath: string; provider: string }> {
  const width = params.width || 720;
  const height = params.height || 1280;
  mkdirSync(path.dirname(params.outputPath), { recursive: true });

  if (params.settings.imageProvider === 'comfyui' && params.settings.comfyuiUrl) {
    try {
      const baseUrl = params.settings.comfyuiUrl.replace(/\/$/, '');
      const workflow = {
        '3': {
          class_type: 'KSampler',
          inputs: {
            seed: 2030,
            steps: 16,
            cfg: 7,
            sampler_name: 'euler',
            scheduler: 'normal',
            denoise: 1,
            model: ['4', 0],
            positive: ['6', 0],
            negative: ['7', 0],
            latent_image: ['5', 0],
          },
        },
        '4': {
          class_type: 'CheckpointLoaderSimple',
          inputs: { ckpt_name: 'v1-5-pruned-emaonly.safetensors' },
        },
        '5': {
          class_type: 'EmptyLatentImage',
          inputs: { width, height, batch_size: 1 },
        },
        '6': {
          class_type: 'CLIPTextEncode',
          inputs: { text: params.prompt, clip: ['4', 1] },
        },
        '7': {
          class_type: 'CLIPTextEncode',
          inputs: { text: 'text, watermark, blurry', clip: ['4', 1] },
        },
        '8': {
          class_type: 'VAEDecode',
          inputs: { samples: ['3', 0], vae: ['4', 2] },
        },
        '9': {
          class_type: 'SaveImage',
          inputs: { filename_prefix: 'kinema', images: ['8', 0] },
        },
      };

      const res = await fetch(`${baseUrl}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow }),
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = (await res.json()) as { prompt_id?: string };
        if (data.prompt_id) {
          // Aguarda até 20s pelo resultado no /history
          for (let i = 0; i < 20; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            const hRes = await fetch(`${baseUrl}/history/${data.prompt_id}`);
            if (!hRes.ok) continue;
            const hist = (await hRes.json()) as Record<string, any>;
            const outputs = hist?.[data.prompt_id]?.outputs?.['9']?.images;
            if (Array.isArray(outputs) && outputs[0]?.filename) {
              const imgRes = await fetch(
                `${baseUrl}/view?filename=${encodeURIComponent(outputs[0].filename)}`
              );
              if (imgRes.ok) {
                writeFileSync(params.outputPath, Buffer.from(await imgRes.arrayBuffer()));
                return { imagePath: params.outputPath, provider: 'comfyui' };
              }
            }
          }
        }
      }
    } catch {
      // Fallback para gerador procedural local se ComfyUI não estiver ativo
    }
  }

  await generateProceduralFallbackPng(params.prompt, width, height, params.outputPath);
  return { imagePath: params.outputPath, provider: 'procedural-fallback' };
}

// ============================================================================
// 2. LLM SCRIPT GENERATOR (manual | gemini | openai-compatible)
// ============================================================================

export async function generateScriptViaLLM(params: {
  topic: string;
  duration: number;
  tone: string;
  sceneCount: number;
  engine: VideoEngineId;
  characterId?: string;
  styleId?: string;
  settings: AppSettings;
}): Promise<{
  title: string;
  scenes?: Scene[];
  kineticBlocks?: KineticBlock[];
  freeform?: FreeformComposition;
}> {
  const { topic, duration, tone, sceneCount, engine, characterId = 'marco-silva', settings } = params;
  const count = Math.max(2, Math.min(12, sceneCount || 5));
  const durPerScene = Number((duration / count).toFixed(1));

  const systemPrompt = `Você é um roteirista especialista em Reels/Shorts verticais em Português do Brasil.
Crie um roteiro JSON sobre o tema: "${topic}" com tom "${tone}", duração total de ${duration}s dividida em ${count} partes para o engine "${engine}".
Templates 3D disponíveis: ${STAGE_TEMPLATES.map((t) => t.id).join(', ')}.
Responda APENAS com JSON válido no formato {"title": "...", "scenes": [...]}.`;

  if (settings.llmProvider === 'gemini' && settings.geminiApiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.geminiModel}:generateContent?key=${settings.geminiApiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const body = (await res.json()) as any;
        const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed.scenes)) {
            return {
              title: parsed.title || topic,
              scenes: parsed.scenes.map((s: any, idx: number) =>
                SceneSchema.parse({
                  ...s,
                  id: `scene-${idx + 1}`,
                  order: idx,
                  characterId: s.characterId || characterId,
                })
              ),
            };
          }
        }
      }
    } catch {
      // Fallback para o gerador determinístico abaixo
    }
  } else if (settings.llmProvider === 'openai-compatible' && settings.openaiApiKey) {
    try {
      const url = `${settings.openaiBaseUrl.replace(/\/$/, '')}/chat/completions`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: settings.openaiModel || 'gpt-4o-mini',
          messages: [{ role: 'user', content: systemPrompt }],
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const body = (await res.json()) as any;
        const text = body?.choices?.[0]?.message?.content;
        if (text) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed.scenes)) {
            return {
              title: parsed.title || topic,
              scenes: parsed.scenes.map((s: any, idx: number) =>
                SceneSchema.parse({
                  ...s,
                  id: `scene-${idx + 1}`,
                  order: idx,
                  characterId: s.characterId || characterId,
                })
              ),
            };
          }
        }
      }
    } catch {
      // Fallback determinístico
    }
  }

  // Gerador local estruturado (modo manual ou fallback sem chave de API)
  const cleanTitle = topic.length > 42 ? topic.slice(0, 42).toUpperCase() : topic.toUpperCase();

  if (engine === 'kinetic') {
    const blocks: KineticBlock[] = Array.from({ length: count }, (_, idx) =>
      KineticBlockSchema.parse({
        id: `kb-${idx + 1}`,
        order: idx,
        narration:
          idx === 0
            ? `Vamos analisar ${topic} em ${count} pontos diretos.`
            : idx === count - 1
              ? `Em primeiro lugar: o resultado que transforma todo o cenário. Comenta o que achou!`
              : `Ponto número ${count - idx}: impacto direto em velocidade e escala.`,
        duration: Math.max(2.8, durPerScene),
        layout: idx === 0 ? 'hero-stat' : idx === count - 1 ? 'counter-explosion' : 'top-list-item',
        headline: idx === 0 ? cleanTitle : `PONTO #${count - idx}`,
        subheadline: `ANÁLISE: ${tone.toUpperCase()}`,
        rankNumber: idx > 0 ? count - idx : undefined,
        statValue: idx === count - 1 ? 100 : undefined,
        statSuffix: idx === count - 1 ? '%' : undefined,
        items: [`Impacto em ${topic}`, 'Escala até 2030'],
        accentColor: idx % 2 === 0 ? '#f5c518' : '#38bdf8',
        bgStyle: idx === 0 ? 'dark-grid' : idx === count - 1 ? 'crimson-burst' : 'neon-cyber',
        transition: idx === 0 ? 'zoom' : 'whip',
        sfx: idx === 0 ? 'whoosh' : 'pop',
      })
    );
    return { title: cleanTitle, kineticBlocks: blocks };
  }

  if (engine === 'freeform') {
    const demo = createFreeformDemoProject('temp');
    return {
      title: cleanTitle,
      freeform: FreeformCompositionSchema.parse({
        ...demo.freeform!,
        narration: `Análise visual sobre ${topic} renderizada como código no HyperFrames.`,
        duration,
      }),
    };
  }

  const templateCycle = [
    'red-carpet-confetti',
    'pulpit-plenary',
    'brazil-map-3d',
    'city-spending-cap',
    'timeline-3d',
    'bar-chart-3d',
    'street-protest',
  ] as const;

  const poses = ['celebrating', 'talking', 'pointing', 'pulling-lever', 'pointing', 'celebrating', 'waving'] as const;
  const cameras = ['dolly-in', 'dolly-in', 'orbit', 'pan', 'dolly-in', 'dolly-in', 'close-face'] as const;

  const scenes: Scene[] = Array.from({ length: count }, (_, idx) => {
    const tpl = templateCycle[idx % templateCycle.length];
    const tplMeta = STAGE_TEMPLATES.find((t) => t.id === tpl);
    return SceneSchema.parse({
      id: `scene-${idx + 1}`,
      order: idx,
      narration:
        idx === 0
          ? `Na nossa simulação sobre ${topic}, o cenário começa com uma decisão histórica.`
          : idx === count - 1
            ? `Na sua opinião, esse plano para ${topic} funcionaria? Comenta aí!`
            : `Na etapa ${idx + 1}, os indicadores mostram como ${topic} muda os resultados.`,
      duration: Math.max(3.0, durPerScene),
      template: tpl,
      templateProps: tplMeta?.exampleProps || {},
      characterId,
      pose: poses[idx % poses.length],
      camera: cameras[idx % cameras.length],
      transition: idx === 0 ? 'cut' : idx % 2 === 1 ? 'whip' : 'cut',
      overlays:
        idx === 0
          ? [
              {
                type: 'title',
                subtitle: 'SIMULAÇÃO 2030',
                text: cleanTitle,
                highlightWord: cleanTitle.split(' ').slice(-1)[0],
                position: 'top',
                boxed: false,
              },
              {
                type: 'badge',
                text: 'NA NOSSA SIMULAÇÃO',
                icon: '⚠',
                color: '#f5c518',
              },
            ]
          : [],
      highlightWords: [],
      sfx: idx === 0 ? 'cheer' : 'whoosh',
    });
  });

  return { title: cleanTitle, scenes };
}

// ============================================================================
// 3. PONTOS DE EXTENSÃO DOCUMENTADOS (Blender MCP & EffectCraft)
// ============================================================================

/**
 * Interface de extensão para provedores externos de cenas 3D (ex: Blender MCP).
 */
export interface ExternalScene3DProvider {
  readonly id: 'blender-mcp';
  exportSceneToGlb(params: {
    blendFilePath?: string;
    pythonScript: string;
    outputGlbPath: string;
  }): Promise<{ glbPath: string }>;
}

/**
 * Interface de extensão para pós-processadores VFX/Shader (ex: EffectCraft Rust).
 */
export interface VfxPostProcessor {
  readonly id: 'effectcraft';
  applyEffectToFrames(params: {
    inputMp4Path: string;
    effectName: string;
    params: Record<string, number | string>;
    outputMp4Path: string;
  }): Promise<{ outputMp4Path: string }>;
}
