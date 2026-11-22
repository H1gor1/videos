import {
  STAGE_TEMPLATES,
  VIDEO_ENGINES,
} from '@videos/core';

export function buildOpenApiSpec() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Videos Studio API (Reels / Shorts Generator)',
      version: '0.1.0',
      description:
        'API REST, SSE e MCP Streamable HTTP para geração de vídeos curtos verticais com Three.js, GSAP e HyperFrames.',
    },
    servers: [{ url: 'http://127.0.0.1:3456' }],
    paths: {
      '/api/health': {
        get: { summary: 'Status do servidor', responses: { '200': { description: 'OK' } } },
      },
      '/api/engines': {
        get: {
          summary: 'Lista engines de vídeo disponíveis (scene3d, kinetic, freeform)',
          responses: { '200': { description: 'Lista de engines' } },
        },
      },
      '/api/templates': {
        get: {
          summary: 'Lista os 11 templates de cenário 3D procedural',
          responses: { '200': { description: 'Templates 3D' } },
        },
      },
      '/api/characters': {
        get: { summary: 'Lista personagens 3D blocky', responses: { '200': { description: 'OK' } } },
        post: { summary: 'Cria personagem 3D blocky', responses: { '200': { description: 'Criado' } } },
      },
      '/api/characters/{id}': {
        patch: { summary: 'Atualiza personagem 3D', responses: { '200': { description: 'Atualizado' } } },
      },
      '/api/voices': {
        get: { summary: 'Lista vozes TTS disponíveis', responses: { '200': { description: 'OK' } } },
      },
      '/api/series': {
        get: { summary: 'Lista séries', responses: { '200': { description: 'OK' } } },
        post: { summary: 'Cria série', responses: { '200': { description: 'Criada' } } },
      },
      '/api/design-kits': {
        get: { summary: 'Lista Design Kits', responses: { '200': { description: 'OK' } } },
        post: { summary: 'Cria Design Kit', responses: { '200': { description: 'Criado' } } },
      },
      '/api/design-kits/{id}': {
        get: { summary: 'Obtém Design Kit por ID', responses: { '200': { description: 'OK' } } },
        patch: { summary: 'Atualiza Design Kit', responses: { '200': { description: 'Atualizado' } } },
      },
      '/api/projects/{id}/apply-design-kit': {
        post: { summary: 'Aplica Design Kit ao projeto', responses: { '200': { description: 'OK' } } },
      },
      '/api/projects': {
        get: { summary: 'Lista projetos', responses: { '200': { description: 'OK' } } },
        post: { summary: 'Cria projeto (scene3d, kinetic ou freeform)', responses: { '200': { description: 'Criado' } } },
      },
      '/api/projects/{id}': {
        get: { summary: 'Obtém detalhes do projeto', responses: { '200': { description: 'OK' } } },
        patch: { summary: 'Atualiza projeto', responses: { '200': { description: 'Atualizado' } } },
        delete: { summary: 'Remove projeto', responses: { '200': { description: 'Removido' } } },
      },
      '/api/projects/{id}/script': {
        post: { summary: 'Define roteiro e cenas do projeto', responses: { '200': { description: 'OK' } } },
      },
      '/api/projects/{id}/composition': {
        post: { summary: 'Define composição HTML freeform', responses: { '200': { description: 'OK' } } },
      },
      '/api/projects/{id}/validate': {
        post: { summary: 'Valida projeto', responses: { '200': { description: 'Resultado da validação' } } },
      },
      '/api/projects/{id}/synthesize': {
        post: { summary: 'Sintetiza áudio TTS e mix FFmpeg', responses: { '200': { description: 'OK' } } },
      },
      '/api/projects/{id}/preview-frames': {
        post: { summary: 'Renderiza frames PNG de preview', responses: { '200': { description: 'Frames PNG' } } },
      },
      '/api/projects/{id}/render': {
        post: { summary: 'Inicia job assíncrono de renderização MP4', responses: { '200': { description: 'Job criado' } } },
      },
      '/api/jobs': {
        get: { summary: 'Lista fila de jobs de renderização', responses: { '200': { description: 'OK' } } },
      },
      '/api/jobs/{id}': {
        get: { summary: 'Obtém status e logs de um job', responses: { '200': { description: 'OK' } } },
      },
      '/api/library': {
        get: {
          summary: 'Pesquisa na biblioteca (prompts, estilos, efeitos, blocos, técnicas)',
          responses: { '200': { description: 'Itens encontrados' } },
        },
      },
      '/api/library/sync': {
        post: { summary: 'Clona e indexa repositórios da biblioteca', responses: { '200': { description: 'OK' } } },
      },
      '/api/reference/breakdown': {
        post: { summary: 'Analisa vídeo de referência com FFmpeg + Rea-Video', responses: { '200': { description: 'Breakdown' } } },
      },
      '/api/integrations': {
        get: { summary: 'Lista status das 13 ferramentas e integrações', responses: { '200': { description: 'OK' } } },
      },
      '/api/events': {
        get: { summary: 'Stream SSE de atualizações em tempo real', responses: { '200': { description: 'text/event-stream' } } },
      },
      '/mcp': {
        post: { summary: 'Endpoint MCP Streamable HTTP', responses: { '200': { description: 'JSON-RPC MCP' } } },
      },
    },
    components: {
      schemas: {
        Engines: { enum: VIDEO_ENGINES.map((e) => e.id) },
        StageTemplates: { enum: STAGE_TEMPLATES.map((t) => t.id) },
      },
    },
  };
}
