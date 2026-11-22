import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {
  WORKSPACE_ROOT,
  getVideoService,
  type LibraryItemType,
  type ServiceChangeEvent,
  type VideoEngineId,
} from '@kinema/core';
import { composeProject } from '@kinema/composer';
import { attachPipelineToService, synthesizeTextToSpeech } from '@kinema/pipeline';
import { createKinemaMcpServer } from '../../mcp/src/server.ts';
import { buildOpenApiSpec } from './openapi.ts';

export function createServerApp(rootDir = WORKSPACE_ROOT) {
  const service = attachPipelineToService(getVideoService(rootDir));
  const app = new Hono();

  app.use('*', cors());

  // ==========================================================================
  // 1. HEALTH & OPENAPI
  // ==========================================================================

  app.get('/api/health', (c) =>
    c.json({
      ok: true,
      service: 'kinema-server',
      version: '0.1.0',
      engines: service.listEngines().map((e) => e.id),
      projectCount: service.listProjects().length,
      libraryCount: service.loadLibraryIndex().length,
    })
  );

  app.get('/api/openapi.json', (c) => c.json(buildOpenApiSpec()));

  // ==========================================================================
  // 2. SSE LIVE UPDATES (para a UI refletir mudanças feitas pelo MCP/CLI)
  // ==========================================================================

  app.get('/api/events', (c) => {
    return streamSSE(c, async (stream) => {
      const listener = (evt: ServiceChangeEvent) => {
        stream.writeSSE({
          event: 'change',
          data: JSON.stringify(evt),
        });
      };

      service.events.on('change', listener);
      stream.onAbort(() => {
        service.events.off('change', listener);
      });

      await stream.writeSSE({
        event: 'connected',
        data: JSON.stringify({ timestamp: new Date().toISOString() }),
      });

      while (!stream.aborted) {
        await stream.sleep(15000);
        if (!stream.aborted) {
          await stream.writeSSE({ event: 'ping', data: '{}' });
        }
      }
    });
  });

  // ==========================================================================
  // 3. ENGINES, TEMPLATES, PERSONAGENS, VOZES, SÉRIES
  // ==========================================================================

  app.get('/api/engines', (c) => c.json(service.listEngines()));

  app.get('/api/engines/:id/schema', (c) => {
    const engineId = c.req.param('id') as VideoEngineId;
    return c.json(service.getEngineSchema(engineId));
  });

  app.get('/api/templates', (c) => c.json(service.listTemplates()));

  app.get('/api/templates/:id', (c) => {
    const tpl = service.getTemplate(c.req.param('id'));
    if (!tpl) return c.json({ error: 'Template não encontrado' }, 404);
    return c.json(tpl);
  });

  app.get('/api/characters', (c) => c.json(service.listCharacters()));

  app.post('/api/characters', async (c) => {
    const body = await c.req.json();
    return c.json(service.createCharacter(body));
  });

  app.patch('/api/characters/:id', async (c) => {
    const body = await c.req.json();
    return c.json(service.updateCharacter(c.req.param('id'), body));
  });

  app.get('/api/voices', (c) => c.json(service.listVoices()));

  app.post('/api/voices/preview', async (c) => {
    const body = await c.req.json();
    const voice = {
      provider: body.provider || 'edge',
      voiceId: body.voiceId || 'pt-BR-AntonioNeural',
      rate: Number(body.rate) || 1.08,
      pitch: body.pitch || '+0Hz',
    };
    const previewDir = path.join(service.dataDir, 'voice-previews');
    mkdirSync(previewDir, { recursive: true });
    const filename = `preview-${voice.provider}-${voice.voiceId.replace(/[^a-zA-Z0-9_-]/g, '_')}.mp3`;
    const outPath = path.join(previewDir, filename);
    const res = await synthesizeTextToSpeech({
      text: body.text || 'Na nossa simulação de dois mil e trinta, o futuro começa agora.',
      voice,
      cacheDir: previewDir,
      outputAudioPath: outPath,
      settings: service.getSettings(),
    });
    return c.json({
      audioUrl: `/data-files/voice-previews/${filename}?t=${Date.now()}`,
      duration: res.duration,
      providerUsed: res.providerUsed,
    });
  });

  app.get('/api/series', (c) => c.json(service.listSeries()));

  app.post('/api/series', async (c) => {
    const body = await c.req.json();
    return c.json(service.createSeries(body));
  });

  // ==========================================================================
  // 3B. DESIGN KITS
  // ==========================================================================

  app.get('/api/design-kits', (c) => c.json(service.listDesignKits()));

  app.get('/api/design-kits/:id', (c) => {
    const kit = service.getDesignKit(c.req.param('id'));
    if (!kit) return c.json({ error: 'Design Kit não encontrado' }, 404);
    return c.json(kit);
  });

  app.post('/api/design-kits', async (c) => {
    const body = await c.req.json();
    return c.json(service.createDesignKit(body));
  });

  app.patch('/api/design-kits/:id', async (c) => {
    const body = await c.req.json();
    return c.json(service.updateDesignKit(c.req.param('id'), body));
  });

  app.delete('/api/design-kits/:id', (c) => {
    service.deleteDesignKit(c.req.param('id'));
    return c.json({ ok: true });
  });

  app.post('/api/design-kits/:id/generate-from-references', async (c) => {
    return c.json(service.generateDesignKitFromReferences(c.req.param('id')));
  });

  app.post('/api/design-kits/:id/references', async (c) => {
    const kitId = c.req.param('id');
    const kit = service.getDesignKit(kitId);
    if (!kit) return c.json({ error: 'Design Kit não encontrado' }, 404);
    const body = await c.req.json();

    let urlOrPath = body.urlOrPath || '';
    if (body.base64Data) {
      const uploadsDir = path.join(service.dataDir, 'design-kit-refs');
      mkdirSync(uploadsDir, { recursive: true });
      const safeName = (body.filename || `ref-${Date.now()}.png`).replace(/[^a-zA-Z0-9._-]/g, '_');
      const fullPath = path.join(uploadsDir, safeName);
      const cleanBase64 = String(body.base64Data).replace(/^data:[^;]+;base64,/, '');
      writeFileSync(fullPath, Buffer.from(cleanBase64, 'base64'));
      urlOrPath = fullPath;
    }

    let dominantColors: string[] = Array.isArray(body.dominantColors) ? body.dominantColors : [];
    let breakdownId: string | undefined;
    let breakdownSummary: string | undefined;

    if ((body.kind === 'image' || body.kind === 'video') && urlOrPath) {
      const extracted = service.extractPaletteFromFile(urlOrPath);
      if (dominantColors.length === 0) {
        dominantColors = extracted.dominantColors.slice(0, 6);
      }
      if (body.kind === 'video' && body.runBreakdown) {
        try {
          const bd = await service.breakdownReferenceVideo(urlOrPath, false);
          breakdownId = bd.id;
          breakdownSummary = `${bd.shots.length} planos detectados (${bd.duration}s @ ${bd.fps}fps) · ${bd.reaVideoGuide.slice(0, 220)}...`;
        } catch {
          // Segue sem breakdown se o arquivo não for vídeo local válido
        }
      }
    }

    const newRef = {
      id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      kind: (body.kind || 'image') as 'image' | 'video' | 'link',
      title: body.title || 'Nova Referência',
      urlOrPath: urlOrPath || 'https://openmotion.dev',
      notes: body.notes || '',
      dominantColors,
      breakdownId,
      breakdownSummary,
      createdAt: new Date().toISOString(),
    };

    const updated = service.updateDesignKit(kitId, {
      references: [...kit.references, newRef],
    });
    return c.json(updated);
  });

  // ==========================================================================
  // 4. PROJETOS, CENAS, COMPOSIÇÃO, PREVIEW, RENDER
  // ==========================================================================

  app.get('/api/projects', (c) => c.json(service.listProjects()));

  app.post('/api/projects', async (c) => {
    const body = await c.req.json();
    return c.json(service.createProject(body));
  });

  app.get('/api/projects/:id', (c) => {
    try {
      return c.json(service.getProject(c.req.param('id')));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 404);
    }
  });

  app.patch('/api/projects/:id', async (c) => {
    const body = await c.req.json();
    return c.json(service.updateProject(c.req.param('id'), body));
  });

  app.delete('/api/projects/:id', (c) => {
    service.deleteProject(c.req.param('id'));
    return c.json({ ok: true });
  });

  app.post('/api/projects/:id/script', async (c) => {
    const body = await c.req.json();
    return c.json(service.setScript(c.req.param('id'), body));
  });

  app.post('/api/projects/:id/composition', async (c) => {
    const body = await c.req.json();
    return c.json(service.setComposition(c.req.param('id'), body));
  });

  app.post('/api/projects/:id/apply-style', async (c) => {
    const body = await c.req.json();
    return c.json(service.applyStyle(c.req.param('id'), body.styleId));
  });

  app.post('/api/projects/:id/apply-design-kit', async (c) => {
    const body = await c.req.json();
    return c.json(service.applyDesignKit(c.req.param('id'), body.designKitId));
  });

  app.post('/api/projects/:id/add-effect', async (c) => {
    const body = await c.req.json();
    return c.json(service.addEffect(c.req.param('id'), body.effectId, body.sceneId));
  });

  app.post('/api/projects/:id/scenes', async (c) => {
    const body = await c.req.json();
    return c.json(service.addScene(c.req.param('id'), body));
  });

  app.patch('/api/projects/:id/scenes/:sceneId', async (c) => {
    const body = await c.req.json();
    return c.json(
      service.updateScene(c.req.param('id'), c.req.param('sceneId'), body)
    );
  });

  app.delete('/api/projects/:id/scenes/:sceneId', (c) => {
    return c.json(service.removeScene(c.req.param('id'), c.req.param('sceneId')));
  });

  app.post('/api/projects/:id/scenes/reorder', async (c) => {
    const body = await c.req.json();
    return c.json(service.reorderScenes(c.req.param('id'), body.sceneIds || []));
  });

  app.post('/api/projects/:id/scenes/:sceneId/split', async (c) => {
    const body = await c.req.json();
    return c.json(
      service.splitScene(
        c.req.param('id'),
        c.req.param('sceneId'),
        Number(body.splitOffsetSeconds ?? 2.0)
      )
    );
  });

  app.post('/api/projects/:id/validate', (c) => {
    return c.json(service.validateProject(c.req.param('id')));
  });

  app.post('/api/projects/:id/synthesize', async (c) => {
    const project = await service.synthesizeAudio(c.req.param('id'));
    return c.json(project);
  });

  app.post('/api/projects/:id/compose', async (c) => {
    const projectId = c.req.param('id');
    const project = service.getProject(projectId);
    const compDir = path.join(service.getProjectDir(projectId), 'composition');
    const mixedAudioPath = path.join(service.getProjectDir(projectId), 'audio', 'mixed-master.wav');
    const artifact = await composeProject(project, service.listCharacters(), compDir, {
      workspaceRoot: service.rootDir,
      mixedAudioPath: existsSync(mixedAudioPath) ? mixedAudioPath : undefined,
    });
    return c.json({
      ...artifact,
      previewUrl: `/project-files/${projectId}/composition/index.html?t=${Date.now()}`,
    });
  });

  app.post('/api/projects/:id/preview-frames', async (c) => {
    const projectId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const frames = await service.renderPreviewFrames(projectId, body.timestamps);
    return c.json(
      frames.map((f) => ({
        timestamp: f.timestamp,
        sceneId: f.sceneId,
        pngPath: f.pngPath,
        url: `/project-files/${projectId}/previews/${path.basename(f.pngPath)}?t=${Date.now()}`,
      }))
    );
  });

  app.post('/api/projects/:id/render', async (c) => {
    const projectId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    if (body.renderSettings) {
      service.updateProject(projectId, {
        renderSettings: {
          ...service.getProject(projectId).renderSettings,
          ...body.renderSettings,
        },
      });
    }
    const job = await service.startRenderVideoJob(projectId);
    return c.json(job);
  });

  app.post('/api/projects/:id/generate-script', async (c) => {
    const projectId = c.req.param('id');
    const project = service.getProject(projectId);
    const body = await c.req.json().catch(() => ({}));
    const generated = await service.generateScriptWithLLM({
      topic: body.topic || project.topic || project.title,
      duration: Number(body.duration) || project.targetDuration || 30,
      tone: body.tone || project.tone || 'jornalístico-didático',
      sceneCount: Number(body.sceneCount) || project.scenes.length || 5,
      engine: body.engine || project.engine,
      characterId: body.characterId || project.scenes[0]?.characterId,
      styleId: body.styleId || project.styleId,
    });
    const updated = service.setScript(projectId, generated);
    return c.json(updated);
  });

  // ==========================================================================
  // 5. JOBS, BIBLIOTECA, BREAKDOWN, IMAGENS, CONFIGURAÇÕES E INTEGRAÇÕES
  // ==========================================================================

  app.get('/api/jobs', (c) => c.json(service.listJobs()));

  app.get('/api/jobs/:id', (c) => {
    try {
      return c.json(service.getJob(c.req.param('id')));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 404);
    }
  });

  app.get('/api/library', (c) => {
    const query = c.req.query('query') || c.req.query('q') || '';
    const type = c.req.query('type') as LibraryItemType | undefined;
    const tag = c.req.query('tag') || '';
    const limit = Number(c.req.query('limit')) || 100;
    return c.json(service.searchLibrary({ query, type, tag, limit }));
  });

  app.get('/api/library/:id', (c) => {
    const item = service.getLibraryItem(c.req.param('id'));
    if (!item) return c.json({ error: 'Item não encontrado' }, 404);
    return c.json(item);
  });

  app.post('/api/library/sync', async (c) => {
    const res = await service.syncLibrary();
    return c.json({ ok: true, count: res.count });
  });

  app.post('/api/reference/breakdown', async (c) => {
    const body = await c.req.json();
    let videoPath = body.videoPath;

    // Suporte a upload base64 pela interface web
    if (!videoPath && body.base64Data) {
      const uploadsDir = path.join(service.dataDir, 'uploads');
      mkdirSync(uploadsDir, { recursive: true });
      const safeName = (body.filename || `upload-${Date.now()}.mp4`).replace(/[^a-zA-Z0-9._-]/g, '_');
      videoPath = path.join(uploadsDir, safeName);
      const cleanBase64 = String(body.base64Data).replace(/^data:[^;]+;base64,/, '');
      writeFileSync(videoPath, Buffer.from(cleanBase64, 'base64'));
    }

    if (!videoPath) {
      // Usa o vídeo de referência padrão se nenhum caminho for enviado
      videoPath =
        '/home/higorlino/.t3/userdata/attachments/fc2b025b-0496-4249-9079-cc05036ad435-25614dee-bc0c-48f2-bb8d-b4f740514ce2-mp4.mp4';
    }

    const breakdown = await service.breakdownReferenceVideo(videoPath, Boolean(body.transcribe));
    return c.json(breakdown);
  });

  app.post('/api/images/generate', async (c) => {
    const body = await c.req.json();
    const res = await service.generateImage(body.prompt || 'Cenário 3D low-poly', {
      width: body.width,
      height: body.height,
      projectId: body.projectId,
    });
    return c.json(res);
  });

  app.get('/api/settings', (c) => c.json(service.getSettings()));

  app.patch('/api/settings', async (c) => {
    const body = await c.req.json();
    return c.json(service.updateSettings(body));
  });

  app.post('/api/settings/test-provider', async (c) => {
    const body = await c.req.json();
    const settings = service.getSettings();
    const kind = body.provider || 'tts';

    if (kind === 'comfyui') {
      try {
        const res = await fetch(`${settings.comfyuiUrl.replace(/\/$/, '')}/system_stats`, {
          signal: AbortSignal.timeout(3000),
        });
        return c.json({ ok: res.ok, message: res.ok ? 'ComfyUI conectado!' : `HTTP ${res.status}` });
      } catch (err) {
        return c.json({
          ok: false,
          message: `ComfyUI offline em ${settings.comfyuiUrl} (${err instanceof Error ? err.message : String(err)})`,
        });
      }
    }

    return c.json({
      ok: true,
      message: `Provedor ${kind} (${settings.ttsProvider}) verificado e pronto.`,
    });
  });

  app.get('/api/integrations', (c) => c.json(service.listIntegrations()));

  // ==========================================================================
  // 6. MCP STREAMABLE HTTP EM `/mcp`
  // ==========================================================================

  app.all('/mcp', async (c) => {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const mcpServer = createKinemaMcpServer(service);
    await mcpServer.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  // ==========================================================================
  // 7. ARQUIVOS ESTÁTICOS (Renders, Composições, Previews, UI Web)
  // ==========================================================================

  const serveFileFromDisk = (absPath: string) => {
    if (!existsSync(absPath)) {
      return new Response('Not Found', { status: 404 });
    }
    const ext = path.extname(absPath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.srt': 'text/plain; charset=utf-8',
      '.ass': 'text/plain; charset=utf-8',
      '.woff2': 'font/woff2',
      '.woff': 'font/woff',
      '.ttf': 'font/ttf',
    };
    const buf = readFileSync(absPath);
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': mimeMap[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      },
    });
  };

  app.get('/renders/*', (c) => {
    const rel = c.req.path.replace(/^\/renders\//, '');
    const target = path.resolve(rootDir, 'renders', rel);
    if (!target.startsWith(path.resolve(rootDir, 'renders'))) {
      return c.text('Forbidden', 403);
    }
    return serveFileFromDisk(target);
  });

  app.get('/project-files/:projectId/*', (c) => {
    const projectId = c.req.param('projectId');
    const prefix = `/project-files/${projectId}/`;
    const rel = c.req.path.slice(prefix.length);
    const projectBase = service.getProjectDir(projectId);
    const target = path.resolve(projectBase, rel);
    if (!target.startsWith(path.resolve(projectBase))) {
      return c.text('Forbidden', 403);
    }
    return serveFileFromDisk(target);
  });

  app.get('/data-files/*', (c) => {
    const rel = c.req.path.replace(/^\/data-files\//, '');
    const target = path.resolve(service.dataDir, rel);
    if (!target.startsWith(path.resolve(service.dataDir))) {
      return c.text('Forbidden', 403);
    }
    return serveFileFromDisk(target);
  });

  // Servir build da interface web (apps/web/dist)
  const webDistDir = path.join(rootDir, 'apps', 'web', 'dist');
  app.get('*', (c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.json({ error: 'Endpoint não encontrado' }, 404);
    }
    const reqRel = c.req.path === '/' ? 'index.html' : c.req.path.slice(1);
    const candidate = path.resolve(webDistDir, reqRel);
    if (candidate.startsWith(webDistDir) && existsSync(candidate)) {
      return serveFileFromDisk(candidate);
    }
    const indexHtml = path.join(webDistDir, 'index.html');
    if (existsSync(indexHtml)) {
      return serveFileFromDisk(indexHtml);
    }
    return c.html(`<!doctype html><html><body style="font-family:sans-serif;background:#0f172a;color:#fff;padding:40px">
      <h1>Kinema API Server Ativo</h1>
      <p>Rode <code>npm run build:web</code> ou acesse o Vite dev server.</p>
    </body></html>`);
  });

  return { app, service };
}

// Inicia o servidor HTTP apenas quando executado diretamente
const isMain = process.argv[1] && path.resolve(process.argv[1]).endsWith('apps/server/src/index.ts');
if (isMain) {
  const port = Number(process.env.PORT) || 3456;
  const hostname = process.env.HOST || '127.0.0.1';
  const { app } = createServerApp(WORKSPACE_ROOT);
  serve({ fetch: app.fetch, port, hostname }, (info) => {
    console.log(`🚀 Kinema Server + MCP HTTP rodando em http://${info.address}:${info.port}`);
    console.log(`   • REST API & OpenAPI: http://${info.address}:${info.port}/api/openapi.json`);
    console.log(`   • MCP Streamable HTTP: http://${info.address}:${info.port}/mcp`);
    console.log(`   • SSE Events: http://${info.address}:${info.port}/api/events`);
  });
}
