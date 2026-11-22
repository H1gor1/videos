import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  CameraKeyframeOverrideSchema,
  CameraPresetSchema,
  CharacterAccessorySchema,
  CharacterPoseSchema,
  DesignKitPaletteSchema,
  DesignKitReferenceSchema,
  DesignKitSafeAreaSchema,
  DesignKitTypographySchema,
  HairStyleSchema,
  KineticBlockSchema,
  LibraryItemTypeSchema,
  OverlayItemSchema,
  STAGE_TEMPLATES,
  SceneObjectOverrideSchema,
  SceneSchema,
  StageTemplateIdSchema,
  TransitionTypeSchema,
  VideoEngineIdSchema,
  WORKSPACE_ROOT,
  getVideoService,
  type VideoService,
} from '@videos/core';
import { attachPipelineToService } from '@videos/pipeline';

export function createVideosMcpServer(customService?: VideoService): McpServer {
  const service = customService || attachPipelineToService(getVideoService(WORKSPACE_ROOT));

  const server = new McpServer({
    name: 'videos-studio-mcp',
    version: '0.1.0',
  });

  // ==========================================================================
  // RESOURCES
  // ==========================================================================

  server.resource(
    'scene-schema',
    'videos://docs/scene-schema',
    {
      description: 'Esquema JSON completo de cenas 3D, blocos cinéticos, personagens e overlays.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              engines: service.listEngines(),
              scene3dSchema: service.getEngineSchema('scene3d'),
              kineticSchema: service.getEngineSchema('kinetic'),
              freeformSchema: service.getEngineSchema('freeform'),
            },
            null,
            2
          ),
        },
      ],
    })
  );

  server.resource(
    'style-guide',
    'videos://docs/style-guide',
    {
      description: 'Guia de estilo completo para criação de vídeos curtos verticais (scene3d, kinetic, freeform).',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: service.getStyleGuide(),
        },
      ],
    })
  );

  server.resource(
    'template-detail',
    new ResourceTemplate('videos://templates/{id}', {
      list: async () => ({
        resources: STAGE_TEMPLATES.map((t) => ({
          uri: `videos://templates/${t.id}`,
          name: t.name,
          description: t.description,
          mimeType: 'application/json',
        })),
      }),
    }),
    {
      description: 'Detalhes, propriedades (propsSchema) e exemplo de uso de um template de cenário 3D.',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const id = String(variables.id || '');
      const tpl = service.getTemplate(id);
      if (!tpl) {
        throw new Error(`Template não encontrado: ${id}`);
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(tpl, null, 2),
          },
        ],
      };
    }
  );

  // ==========================================================================
  // PROMPTS
  // ==========================================================================

  server.prompt(
    'create_episode',
    'Guia passo a passo para criar um episódio no formato Simulação 3D (personagem blocky + cenários 3D + overlays + legendas).',
    {
      topic: z.string().describe('Tema do episódio (ex: E se o Brasil zerasse a tarifa de ônibus em 2030?)'),
      duration: z.string().optional().describe('Duração alvo em segundos (ex: 30)'),
    },
    async ({ topic, duration }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Você vai criar um episódio completo no estilo "Simulação 2030" sobre: "${topic}" (duração alvo: ${duration || '30'}s).

Siga exatamente este fluxo usando as tools MCP:
1. Leia \`videos://docs/style-guide\` ou chame \`list_templates\` e \`list_characters\`.
2. Escolha ou crie um personagem blocky 3D via \`create_character\` (cabeça grande chibi, barba/cabelo em blocos, óculos, acessórios como faixa presidencial ou terno).
3. Crie o projeto com \`create_project\` (\`engine: "scene3d"\`).
4. Envie o roteiro e plano de cenas completo via \`set_script\` alternando pelo menos 5 templates de cenário 3D diferentes, cortes de 3,5 a 5s, poses dinâmicas (\`celebrating\`, \`talking\`, \`pointing\`, \`pulling-lever\`, \`waving\`) e overlays 2D (\`title\`, \`badge\`, \`lower-third\`, \`counter\`, \`role-banner\`).
5. Valide o projeto com \`validate_project\` e corrija qualquer erro apontado.
6. Sintetize a narração e mix de áudio com \`synthesize_audio\`.
7. Gere frames PNG de preview com \`render_preview_frames\`, inspecione visualmente cada imagem retornada e ajuste cenas se necessário.
8. Dispare a renderização final MP4 com \`render_video\` e acompanhe via \`get_job_status\` / \`get_output\`.`,
          },
        },
      ],
    })
  );

  server.prompt(
    'create_video',
    'Guia genérico multi-engine para criar qualquer vídeo curto vertical (scene3d, kinetic ou freeform) consultando a Biblioteca.',
    {
      topic: z.string().describe('Tema ou objetivo do vídeo'),
      engine: z.string().optional().describe('Engine preferido: scene3d | kinetic | freeform'),
    },
    async ({ topic, engine }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Crie um vídeo curto vertical (Reels/Shorts) sobre "${topic}" (engine sugerido: ${engine || 'auto'}).

Fluxo obrigatório do agente:
1. **Escolher Engine**: Chame \`list_engines\` e \`get_engine_schema\` (\`scene3d\` para simulações com personagens 3D; \`kinetic\` para listas Top-N/estatísticas; \`freeform\` para composição HTML/CSS/GSAP livre).
2. **Buscar na Biblioteca**: Chame \`search_library\` para encontrar um \`prompt\` viral, um \`style\` cinematográfico (dos 99 estilos) e um \`effect\` ou \`block\`. Use \`get_library_item\` para ler o conteúdo completo.
3. **Construir**: Crie o projeto com \`create_project\` passando \`engine\`, \`promptId\` e \`styleId\`. Configure as cenas via \`set_script\` (para \`scene3d\`/\`kinetic\`) ou o código HTML/GSAP via \`set_composition\` (para \`freeform\`).
4. **Validar**: Chame \`validate_project\`.
5. **Preview Visual**: Chame \`render_preview_frames\` para inspecionar os PNGs renderizados.
6. **Render Final**: Chame \`synthesize_audio\` e \`render_video\`.`,
          },
        },
      ],
    })
  );

  // ==========================================================================
  // TOOLS
  // ==========================================================================

  server.tool(
    'list_templates',
    'Lista todos os templates de cenário 3D disponíveis com schemas de propriedades (propsSchema), exemplos, câmeras e poses recomendadas.',
    {},
    async () => ({
      content: [{ type: 'text', text: JSON.stringify(service.listTemplates(), null, 2) }],
    })
  );

  server.tool(
    'list_engines',
    'Lista os engines de vídeo plugáveis disponíveis (scene3d, kinetic, freeform) e suas capacidades.',
    {},
    async () => ({
      content: [{ type: 'text', text: JSON.stringify(service.listEngines(), null, 2) }],
    })
  );

  server.tool(
    'get_engine_schema',
    'Retorna o schema de entrada, layouts, templates e regras do engine especificado.',
    {
      engine: VideoEngineIdSchema,
    },
    async ({ engine }) => ({
      content: [{ type: 'text', text: JSON.stringify(service.getEngineSchema(engine), null, 2) }],
    })
  );

  server.tool(
    'list_characters',
    'Lista todos os personagens 3D blocky cadastrados.',
    {},
    async () => ({
      content: [{ type: 'text', text: JSON.stringify(service.listCharacters(), null, 2) }],
    })
  );

  server.tool(
    'create_character',
    'Cria um novo personagem 3D blocky/chibi parametrizável.',
    {
      id: z.string().optional(),
      name: z.string().describe('Nome do personagem'),
      role: z.string().optional().describe('Profissão e cidade para lower-third (ex: Economista · Recife)'),
      skinColor: z.string().optional(),
      hairStyle: HairStyleSchema.optional(),
      hairColor: z.string().optional(),
      hasBeard: z.boolean().optional(),
      beardColor: z.string().optional(),
      hasGlasses: z.boolean().optional(),
      glassesColor: z.string().optional(),
      shirtColor: z.string().optional(),
      shirtAccentColor: z.string().optional(),
      hasShirtStar: z.boolean().optional(),
      pantsColor: z.string().optional(),
      shoeColor: z.string().optional(),
      accessories: z.array(CharacterAccessorySchema).optional(),
      headScale: z.number().optional(),
    },
    async (input) => {
      const created = service.createCharacter(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(created, null, 2) }],
      };
    }
  );

  server.tool(
    'update_character',
    'Atualiza aparência, cores ou acessórios de um personagem 3D existente.',
    {
      id: z.string().describe('ID do personagem'),
      name: z.string().optional(),
      role: z.string().optional(),
      skinColor: z.string().optional(),
      hairStyle: HairStyleSchema.optional(),
      hairColor: z.string().optional(),
      hasBeard: z.boolean().optional(),
      hasGlasses: z.boolean().optional(),
      shirtColor: z.string().optional(),
      pantsColor: z.string().optional(),
      shoeColor: z.string().optional(),
      accessories: z.array(CharacterAccessorySchema).optional(),
      headScale: z.number().optional(),
    },
    async ({ id, ...patch }) => {
      const updated = service.updateCharacter(id, patch);
      return {
        content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
      };
    }
  );

  server.tool(
    'list_voices',
    'Lista todas as vozes TTS disponíveis (Edge Neural grátis, eSpeak offline, Piper, ElevenLabs, OpenAI).',
    {},
    async () => ({
      content: [{ type: 'text', text: JSON.stringify(service.listVoices(), null, 2) }],
    })
  );

  server.tool(
    'list_series',
    'Lista todas as séries de vídeos cadastradas.',
    {},
    async () => ({
      content: [{ type: 'text', text: JSON.stringify(service.listSeries(), null, 2) }],
    })
  );

  server.tool(
    'create_series',
    'Cria uma nova série com configurações padrão de personagem, voz e estilo de legenda.',
    {
      id: z.string().optional(),
      title: z.string().describe('Título da série (ex: SIMULAÇÃO 2030)'),
      description: z.string().optional(),
      defaultEngine: VideoEngineIdSchema.optional(),
      defaultCharacterId: z.string().optional(),
      watermarkHandle: z.string().optional(),
    },
    async (input) => {
      const series = service.createSeries(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(series, null, 2) }],
      };
    }
  );

  server.tool(
    'create_project',
    'Cria um novo projeto de vídeo curto vertical com suporte aos engines scene3d, kinetic e freeform, além de promptId e styleId da biblioteca.',
    {
      id: z.string().optional(),
      title: z.string().describe('Título do episódio/vídeo'),
      topic: z.string().optional().describe('Tema ou premissa do vídeo'),
      tone: z.string().optional(),
      targetDuration: z.number().optional().describe('Duração alvo em segundos (30, 60, 90, 150)'),
      seriesId: z.string().optional(),
      episodeNumber: z.number().optional(),
      engine: VideoEngineIdSchema.optional().default('scene3d'),
      promptId: z.string().optional().describe('ID de prompt da biblioteca para pré-configurar o projeto'),
      styleId: z.string().optional().describe('ID de estilo visual da biblioteca'),
      designKitId: z.string().optional().describe('ID do Design Kit (ex: simulacao-2030, editorial-minimal)'),
      characterId: z.string().optional().describe('ID do personagem principal (para scene3d)'),
      sceneCount: z.number().optional().describe('Número inicial de cenas'),
    },
    async (input) => {
      const project = service.createProject(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(project, null, 2) }],
      };
    }
  );

  server.tool(
    'get_project',
    'Retorna os dados completos de um projeto (cenas, blocos, composição, voz, legendas e caminhos de saída).',
    {
      projectId: z.string().describe('ID do projeto'),
    },
    async ({ projectId }) => ({
      content: [{ type: 'text', text: JSON.stringify(service.getProject(projectId), null, 2) }],
    })
  );

  server.tool(
    'set_script',
    'Define o roteiro completo e o plano de cenas (para scene3d) ou blocos tipográficos (para kinetic) de um projeto.',
    {
      projectId: z.string().describe('ID do projeto'),
      title: z.string().optional(),
      topic: z.string().optional(),
      scenes: z.array(SceneSchema.partial().required({ narration: true })).optional(),
      kineticBlocks: z
        .array(KineticBlockSchema.partial().required({ narration: true, headline: true }))
        .optional(),
    },
    async ({ projectId, ...payload }) => {
      const updated = service.setScript(projectId, payload);
      return {
        content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
      };
    }
  );

  server.tool(
    'set_composition',
    'Define diretamente a composição HTML/CSS/JS no contrato HyperFrames (window.__timelines["main"]) para projetos do engine freeform.',
    {
      projectId: z.string().describe('ID do projeto'),
      html: z.string().describe('Código HTML completo da composição HyperFrames'),
      subCompositions: z.record(z.string(), z.string()).optional(),
      assets: z.record(z.string(), z.string()).optional(),
      narration: z.string().optional().describe('Narração opcional para síntese TTS e mix de áudio'),
      duration: z.number().optional().describe('Duração em segundos'),
      prompt: z.string().optional(),
      styleId: z.string().optional(),
    },
    async ({ projectId, ...input }) => {
      const updated = service.setComposition(projectId, input);
      return {
        content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
      };
    }
  );

  server.tool(
    'apply_style',
    'Aplica um estilo visual da biblioteca (ex: Lemo-Opuscar 99 estilos) a um projeto existente.',
    {
      projectId: z.string(),
      styleId: z.string().describe('ID do estilo na biblioteca'),
    },
    async ({ projectId, styleId }) => {
      const updated = service.applyStyle(projectId, styleId);
      return {
        content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
      };
    }
  );

  server.tool(
    'add_effect',
    'Adiciona um efeito visual / overlay (ex: PixelFX scanlines, sparkles, vignette, glitch) ao projeto ou a uma cena específica.',
    {
      projectId: z.string(),
      effectId: z.string().describe('ID do efeito na biblioteca ou preset (scanlines, vignette, sparkles, glitch)'),
      sceneId: z.string().optional(),
    },
    async ({ projectId, effectId, sceneId }) => {
      const updated = service.addEffect(projectId, effectId, sceneId);
      return {
        content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
      };
    }
  );

  server.tool(
    'add_scene',
    'Adiciona uma nova cena 3D ao final do projeto.',
    {
      projectId: z.string(),
      narration: z.string().describe('Texto narrado na cena'),
      duration: z.number().optional(),
      template: StageTemplateIdSchema.optional(),
      templateProps: z.record(z.string(), z.any()).optional(),
      characterId: z.string().optional(),
      pose: CharacterPoseSchema.optional(),
      camera: CameraPresetSchema.optional(),
      transition: TransitionTypeSchema.optional(),
      overlays: z.array(OverlayItemSchema).optional(),
      highlightWords: z.array(z.string()).optional(),
    },
    async ({ projectId, ...sceneInput }) => {
      const updated = service.addScene(projectId, sceneInput);
      return {
        content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
      };
    }
  );

  server.tool(
    'update_scene',
    'Atualiza propriedades de uma cena específica (narração, template, templateProps, pose, câmera, overlays, objectOverrides 3D, cameraOverride, duração).',
    {
      projectId: z.string(),
      sceneId: z.string(),
      narration: z.string().optional(),
      duration: z.number().optional(),
      template: StageTemplateIdSchema.optional(),
      templateProps: z.record(z.string(), z.any()).optional(),
      characterId: z.string().optional(),
      pose: CharacterPoseSchema.optional(),
      camera: CameraPresetSchema.optional(),
      transition: TransitionTypeSchema.optional(),
      overlays: z.array(OverlayItemSchema).optional(),
      objectOverrides: z.record(z.string(), SceneObjectOverrideSchema).optional(),
      cameraOverride: CameraKeyframeOverrideSchema.optional(),
      highlightWords: z.array(z.string()).optional(),
    },
    async ({ projectId, sceneId, ...patch }) => {
      const updated = service.updateScene(projectId, sceneId, patch);
      return {
        content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
      };
    }
  );

  server.tool(
    'remove_scene',
    'Remove uma cena do projeto e renumera as demais.',
    {
      projectId: z.string(),
      sceneId: z.string(),
    },
    async ({ projectId, sceneId }) => {
      const updated = service.removeScene(projectId, sceneId);
      return {
        content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
      };
    }
  );

  server.tool(
    'reorder_scenes',
    'Reordena as cenas do projeto de acordo com a lista de IDs fornecida.',
    {
      projectId: z.string(),
      sceneIds: z.array(z.string()).describe('Lista ordenada de IDs de cenas'),
    },
    async ({ projectId, sceneIds }) => {
      const updated = service.reorderScenes(projectId, sceneIds);
      return {
        content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
      };
    }
  );

  server.tool(
    'validate_project',
    'Valida o projeto e retorna erros e avisos acionáveis (cenas sem narração, templates inválidos, contrato HyperFrames).',
    {
      projectId: z.string(),
    },
    async ({ projectId }) => ({
      content: [{ type: 'text', text: JSON.stringify(service.validateProject(projectId), null, 2) }],
    })
  );

  server.tool(
    'synthesize_audio',
    'Executa a síntese de voz TTS (com word boundaries) e mixagem FFmpeg (música com ducking sidechain + SFX) para todas as cenas do projeto.',
    {
      projectId: z.string(),
    },
    async ({ projectId }) => {
      const project = await service.synthesizeAudio(projectId);
      return {
        content: [{ type: 'text', text: JSON.stringify(project, null, 2) }],
      };
    }
  );

  server.tool(
    'render_preview_frames',
    'Renderiza frames-chave do projeto em PNG e retorna as imagens diretamente via MCP para revisão visual do agente.',
    {
      projectId: z.string(),
      timestamps: z
        .array(z.number())
        .optional()
        .describe('Segundos exatos para capturar (se omitido, captura 1 frame central por cena)'),
    },
    async ({ projectId, timestamps }) => {
      const frames = await service.renderPreviewFrames(projectId, timestamps);
      const content: Array<
        | { type: 'text'; text: string }
        | { type: 'image'; data: string; mimeType: string }
      > = [
        {
          type: 'text',
          text: JSON.stringify(
            frames.map((f) => ({
              timestamp: f.timestamp,
              sceneId: f.sceneId,
              pngPath: f.pngPath,
            })),
            null,
            2
          ),
        },
      ];

      for (const frame of frames) {
        content.push({
          type: 'image',
          data: frame.base64,
          mimeType: 'image/png',
        });
      }

      return { content };
    }
  );

  server.tool(
    'render_video',
    'Inicia a renderização completa do vídeo em MP4 (H.264/AAC + legendas .srt/.ass) na fila assíncrona e retorna o jobId.',
    {
      projectId: z.string(),
      wait: z
        .boolean()
        .optional()
        .default(false)
        .describe('Se true, aguarda a conclusão síncrona antes de retornar'),
    },
    async ({ projectId, wait }) => {
      const job = wait
        ? await service.renderVideoSync(projectId)
        : await service.startRenderVideoJob(projectId);
      return {
        content: [{ type: 'text', text: JSON.stringify(job, null, 2) }],
      };
    }
  );

  server.tool(
    'get_job_status',
    'Consulta o progresso por estágio, logs e status de um job de renderização.',
    {
      jobId: z.string(),
    },
    async ({ jobId }) => ({
      content: [{ type: 'text', text: JSON.stringify(service.getJob(jobId), null, 2) }],
    })
  );

  server.tool(
    'get_output',
    'Retorna os caminhos finais do arquivo MP4, legendas .SRT/.ASS e thumbnail de um projeto renderizado.',
    {
      projectId: z.string(),
    },
    async ({ projectId }) => {
      const p = service.getProject(projectId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                projectId: p.id,
                title: p.title,
                status: p.status,
                totalDuration: p.totalDuration,
                outputMp4Path: p.outputMp4Path,
                outputSrtPath: p.outputSrtPath,
                outputAssPath: p.outputAssPath,
                thumbnailPath: p.thumbnailPath,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    'search_library',
    'Pesquisa na biblioteca local de prompts virais (awesome-opus5-5-videos), 99 estilos de filme (lemo-opuscar), 244 efeitos (pixelfx), blocos HyperFrames e técnicas.',
    {
      query: z.string().optional().describe('Termo de busca (ex: chart, cyberpunk, wes anderson, glitch, top5)'),
      type: LibraryItemTypeSchema.optional().describe('Filtro por tipo: prompt | style | effect | block | technique'),
      tag: z.string().optional(),
      limit: z.number().optional().default(25),
    },
    async (params) => ({
      content: [{ type: 'text', text: JSON.stringify(service.searchLibrary(params), null, 2) }],
    })
  );

  server.tool(
    'get_library_item',
    'Retorna o conteúdo completo (código, prompt ou especificação) de um item da biblioteca pelo ID.',
    {
      id: z.string().describe('ID do item retornado por search_library'),
    },
    async ({ id }) => {
      const item = service.getLibraryItem(id);
      if (!item) {
        throw new Error(`Item da biblioteca não encontrado: ${id}`);
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(item, null, 2) }],
      };
    }
  );

  server.tool(
    'breakdown_reference_video',
    'Analisa um vídeo MP4 de referência (detecção de cenas FFmpeg + extração de keyframes + ficha Rea-Video) para recriar um projeto semelhante.',
    {
      videoPath: z.string().describe('Caminho absoluto do arquivo de vídeo MP4 de referência'),
      transcribe: z.boolean().optional().default(false),
    },
    async ({ videoPath, transcribe }) => {
      const breakdown = await service.breakdownReferenceVideo(videoPath, transcribe);
      return {
        content: [{ type: 'text', text: JSON.stringify(breakdown, null, 2) }],
      };
    }
  );

  server.tool(
    'generate_image',
    'Gera uma imagem/textura de fundo via ImageProvider opcional (ComfyUI local ou gerador procedural fallback).',
    {
      prompt: z.string().describe('Descrição visual da textura ou fundo'),
      width: z.number().optional().default(720),
      height: z.number().optional().default(1280),
      projectId: z.string().optional(),
    },
    async ({ prompt, width, height, projectId }) => {
      const res = await service.generateImage(prompt, { width, height, projectId });
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
      };
    }
  );

  // ==========================================================================
  // DESIGN KITS TOOLS
  // ==========================================================================

  server.tool(
    'list_design_kits',
    'Lista todos os Design Kits disponíveis (ex: simulacao-2030, editorial-minimal) com paleta, tipografia, safe areas, ritmo e regras.',
    {},
    async () => ({
      content: [{ type: 'text', text: JSON.stringify(service.listDesignKits(), null, 2) }],
    })
  );

  server.tool(
    'get_design_kit',
    'Retorna os tokens visuais completos, regras, tipografia, paleta e referências de um Design Kit pelo ID.',
    {
      id: z.string().describe('ID do Design Kit (ex: simulacao-2030, editorial-minimal)'),
    },
    async ({ id }) => {
      const kit = service.getDesignKit(id);
      if (!kit) throw new Error(`Design Kit não encontrado: ${id}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(kit, null, 2) }],
      };
    }
  );

  server.tool(
    'create_design_kit',
    'Cria um novo Design Kit com paleta nomeada, tipografia, safe areas, ritmo, regras livres e referências (moodboard).',
    {
      id: z.string().optional(),
      name: z.string().describe('Nome do Design Kit'),
      description: z.string().optional(),
      category: z.string().optional(),
      palette: DesignKitPaletteSchema.partial().optional(),
      typography: DesignKitTypographySchema.partial().optional(),
      safeArea: DesignKitSafeAreaSchema.partial().optional(),
      borderRadius: z.string().optional(),
      shadowStyle: z.string().optional(),
      voiceTone: z.string().optional(),
      rules: z.array(z.string()).optional(),
      references: z.array(DesignKitReferenceSchema).optional(),
    },
    async (input) => {
      const created = service.createDesignKit(input as any);
      return {
        content: [{ type: 'text', text: JSON.stringify(created, null, 2) }],
      };
    }
  );

  server.tool(
    'update_design_kit',
    'Atualiza regras, paleta, tipografia, safe areas ou referências de um Design Kit existente.',
    {
      id: z.string().describe('ID do Design Kit'),
      name: z.string().optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      palette: DesignKitPaletteSchema.partial().optional(),
      typography: DesignKitTypographySchema.partial().optional(),
      safeArea: DesignKitSafeAreaSchema.partial().optional(),
      borderRadius: z.string().optional(),
      shadowStyle: z.string().optional(),
      voiceTone: z.string().optional(),
      rules: z.array(z.string()).optional(),
      references: z.array(DesignKitReferenceSchema).optional(),
    },
    async ({ id, ...patch }) => {
      const updated = service.updateDesignKit(id, patch as any);
      return {
        content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
      };
    }
  );

  server.tool(
    'apply_design_kit',
    'Aplica um Design Kit a um projeto existente, atualizando tokens de cores, tipografia, legendas e estilo 3D sem editar cena por cena.',
    {
      projectId: z.string().describe('ID do projeto'),
      designKitId: z.string().describe('ID do Design Kit (ex: simulacao-2030, editorial-minimal)'),
    },
    async ({ projectId, designKitId }) => {
      const updated = service.applyDesignKit(projectId, designKitId);
      return {
        content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
      };
    }
  );

  return server;
}
