import { readFileSync } from 'node:fs';
import {
  WORKSPACE_ROOT,
  getVideoService,
  type LibraryItemType,
  type VideoEngineId,
} from '@kinema/core';
import { attachPipelineToService } from '@kinema/pipeline';

function parseFlags(argv: string[]): { command: string; flags: Record<string, string>; json: boolean } {
  const args = argv.slice(2);
  const command = args[0] && !args[0].startsWith('--') ? args[0] : 'help';
  const flags: Record<string, string> = {};
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === '--json') {
      json = true;
      continue;
    }
    if (token.startsWith('--')) {
      const eqIdx = token.indexOf('=');
      if (eqIdx > 0) {
        flags[token.slice(2, eqIdx)] = token.slice(eqIdx + 1);
      } else {
        const key = token.slice(2);
        const next = args[i + 1];
        if (next && !next.startsWith('--')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = 'true';
        }
      }
    }
  }

  return { command, flags, json };
}

function outputResult(data: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
  } else if (typeof data === 'string') {
    console.log(data);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

async function main() {
  const { command, flags, json } = parseFlags(process.argv);
  const service = attachPipelineToService(getVideoService(WORKSPACE_ROOT));

  switch (command) {
    case 'list-templates':
    case 'list_templates':
      outputResult(service.listTemplates(), json);
      break;

    case 'list-engines':
    case 'list_engines':
      outputResult(service.listEngines(), json);
      break;

    case 'get-engine-schema':
    case 'get_engine_schema':
      outputResult(service.getEngineSchema((flags.engine || 'scene3d') as VideoEngineId), json);
      break;

    case 'list-characters':
    case 'list_characters':
      outputResult(service.listCharacters(), json);
      break;

    case 'create-character':
    case 'create_character': {
      const payload = flags.data ? JSON.parse(flags.data) : { name: flags.name || 'Novo Personagem', ...flags };
      outputResult(service.createCharacter(payload), json);
      break;
    }

    case 'update-character':
    case 'update_character': {
      const patch = flags.data ? JSON.parse(flags.data) : flags;
      outputResult(service.updateCharacter(flags.id, patch), json);
      break;
    }

    case 'list-voices':
    case 'list_voices':
      outputResult(service.listVoices(), json);
      break;

    case 'list-series':
    case 'list_series':
      outputResult(service.listSeries(), json);
      break;

    case 'create-series':
    case 'create_series': {
      const payload = flags.data ? JSON.parse(flags.data) : { title: flags.title || 'Nova Série', ...flags };
      outputResult(service.createSeries(payload), json);
      break;
    }

    case 'list-projects':
    case 'list_projects':
      outputResult(service.listProjects(), json);
      break;

    case 'create-project':
    case 'create_project': {
      const payload = flags.data
        ? JSON.parse(flags.data)
        : {
            title: flags.title || 'Novo Episódio',
            topic: flags.topic || '',
            engine: (flags.engine as VideoEngineId) || 'scene3d',
            promptId: flags.promptId,
            styleId: flags.styleId,
            characterId: flags.characterId,
            targetDuration: flags.duration ? Number(flags.duration) : 30,
          };
      outputResult(service.createProject(payload), json);
      break;
    }

    case 'get-project':
    case 'get_project':
      outputResult(service.getProject(flags.id || flags.projectId), json);
      break;

    case 'set-script':
    case 'set_script': {
      const body = flags.file
        ? JSON.parse(readFileSync(flags.file, 'utf8'))
        : JSON.parse(flags.data || '{}');
      outputResult(service.setScript(flags.projectId || flags.id, body), json);
      break;
    }

    case 'set-composition':
    case 'set_composition': {
      const html = flags.htmlFile ? readFileSync(flags.htmlFile, 'utf8') : flags.html;
      outputResult(
        service.setComposition(flags.projectId || flags.id, {
          html,
          narration: flags.narration || '',
          duration: flags.duration ? Number(flags.duration) : 15,
        }),
        json
      );
      break;
    }

    case 'apply-style':
    case 'apply_style':
      outputResult(service.applyStyle(flags.projectId || flags.id, flags.styleId), json);
      break;

    case 'add-effect':
    case 'add_effect':
      outputResult(service.addEffect(flags.projectId || flags.id, flags.effectId, flags.sceneId), json);
      break;

    case 'add-scene':
    case 'add_scene': {
      const sceneData = flags.data ? JSON.parse(flags.data) : { narration: flags.narration || 'Nova cena', ...flags };
      outputResult(service.addScene(flags.projectId || flags.id, sceneData), json);
      break;
    }

    case 'update-scene':
    case 'update_scene': {
      const patch = flags.data ? JSON.parse(flags.data) : flags;
      outputResult(service.updateScene(flags.projectId || flags.id, flags.sceneId, patch), json);
      break;
    }

    case 'remove-scene':
    case 'remove_scene':
      outputResult(service.removeScene(flags.projectId || flags.id, flags.sceneId), json);
      break;

    case 'reorder-scenes':
    case 'reorder_scenes': {
      const ids = (flags.sceneIds || '').split(',').filter(Boolean);
      outputResult(service.reorderScenes(flags.projectId || flags.id, ids), json);
      break;
    }

    case 'validate-project':
    case 'validate_project':
      outputResult(service.validateProject(flags.projectId || flags.id), json);
      break;

    case 'synthesize-audio':
    case 'synthesize_audio':
      outputResult(await service.synthesizeAudio(flags.projectId || flags.id), json);
      break;

    case 'render-preview-frames':
    case 'render_preview_frames': {
      const timestamps = flags.timestamps
        ? flags.timestamps.split(',').map((t) => Number(t))
        : undefined;
      const frames = await service.renderPreviewFrames(flags.projectId || flags.id, timestamps);
      outputResult(
        frames.map((f) => ({ timestamp: f.timestamp, pngPath: f.pngPath, sceneId: f.sceneId })),
        json
      );
      break;
    }

    case 'render-video':
    case 'render_video': {
      const job = await service.renderVideoSync(flags.projectId || flags.id);
      outputResult(job, json);
      break;
    }

    case 'get-job-status':
    case 'get_job_status':
      outputResult(service.getJob(flags.jobId || flags.id), json);
      break;

    case 'get-output':
    case 'get_output': {
      const p = service.getProject(flags.projectId || flags.id);
      outputResult(
        {
          projectId: p.id,
          status: p.status,
          outputMp4Path: p.outputMp4Path,
          outputSrtPath: p.outputSrtPath,
          outputAssPath: p.outputAssPath,
          thumbnailPath: p.thumbnailPath,
          totalDuration: p.totalDuration,
        },
        json
      );
      break;
    }

    case 'search-library':
    case 'search_library':
      outputResult(
        service.searchLibrary({
          query: flags.query || flags.q,
          type: flags.type as LibraryItemType | undefined,
          tag: flags.tag,
          limit: flags.limit ? Number(flags.limit) : 30,
        }),
        json
      );
      break;

    case 'get-library-item':
    case 'get_library_item':
      outputResult(service.getLibraryItem(flags.id), json);
      break;

    case 'library-sync':
    case 'library_sync':
      outputResult(await service.syncLibrary(), json);
      break;

    case 'breakdown-reference-video':
    case 'breakdown_reference_video':
      outputResult(
        await service.breakdownReferenceVideo(flags.video || flags.videoPath, flags.transcribe === 'true'),
        json
      );
      break;

    case 'generate-image':
    case 'generate_image':
      outputResult(
        await service.generateImage(flags.prompt || 'Fundo abstrato 2030', {
          projectId: flags.projectId,
        }),
        json
      );
      break;

    case 'list-integrations':
    case 'list_integrations':
      outputResult(service.listIntegrations(), json);
      break;

    case 'list-design-kits':
    case 'list_design_kits':
      outputResult(service.listDesignKits(), json);
      break;

    case 'get-design-kit':
    case 'get_design_kit':
      outputResult(service.getDesignKit(flags.id || flags.designKitId), json);
      break;

    case 'create-design-kit':
    case 'create_design_kit': {
      const payload = flags.file
        ? JSON.parse(readFileSync(flags.file, 'utf8'))
        : flags.data
          ? JSON.parse(flags.data)
          : { name: flags.name || 'Novo Design Kit', ...flags };
      outputResult(service.createDesignKit(payload), json);
      break;
    }

    case 'update-design-kit':
    case 'update_design_kit': {
      const patch = flags.file
        ? JSON.parse(readFileSync(flags.file, 'utf8'))
        : flags.data
          ? JSON.parse(flags.data)
          : flags;
      outputResult(service.updateDesignKit(flags.id || flags.designKitId, patch), json);
      break;
    }

    case 'apply-design-kit':
    case 'apply_design_kit':
      outputResult(
        service.applyDesignKit(
          flags.projectId || flags.id,
          flags.designKitId || flags.kitId || 'simulacao-2030'
        ),
        json
      );
      break;

    default:
      outputResult(
        {
          cli: '@kinema/cli',
          commands: [
            'list-templates',
            'list-engines',
            'get-engine-schema --engine scene3d|kinetic|freeform',
            'list-characters',
            'create-character --name "..."',
            'update-character --id "..." --data "{...}"',
            'list-voices',
            'list-series',
            'create-series --title "..."',
            'list-projects',
            'create-project --title "..." --engine scene3d',
            'get-project --id "..."',
            'set-script --projectId "..." --file script.json',
            'set-composition --projectId "..." --htmlFile index.html',
            'apply-style --projectId "..." --styleId "..."',
            'add-effect --projectId "..." --effectId "..."',
            'add-scene --projectId "..." --narration "..."',
            'update-scene --projectId "..." --sceneId "..." --data "{...}"',
            'remove-scene --projectId "..." --sceneId "..."',
            'reorder-scenes --projectId "..." --sceneIds "s1,s2,s3"',
            'validate-project --projectId "..."',
            'synthesize-audio --projectId "..."',
            'render-preview-frames --projectId "..."',
            'render-video --projectId "..."',
            'get-job-status --jobId "..."',
            'get-output --projectId "..."',
            'search-library --query "..." --type prompt|style|effect|block|technique',
            'get-library-item --id "..."',
            'library-sync',
            'breakdown-reference-video --video /caminho/video.mp4',
            'generate-image --prompt "..."',
            'list-integrations',
          ],
          flags: ['--json'],
        },
        json
      );
      break;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
