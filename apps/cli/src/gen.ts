import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  WORKSPACE_ROOT,
  createFreeformDemoProject,
  createKineticTop5Project,
  createMusicaAcordeMenorProject,
  createSimulacaoDemoProject,
  getVideoService,
} from '@kinema/core';
import { attachPipelineToService } from '@kinema/pipeline';

async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const exIdx = args.indexOf('--example');
  const projIdx = args.indexOf('--project');

  const exampleId =
    exIdx >= 0 && args[exIdx + 1]
      ? (args[exIdx + 1] as 'simulacao-demo' | 'kinetic-top5' | 'freeform-demo' | 'musica-acorde-menor')
      : !projIdx || projIdx < 0
        ? 'simulacao-demo'
        : undefined;

  const projectId = projIdx >= 0 && args[projIdx + 1] ? args[projIdx + 1] : exampleId || 'simulacao-demo';

  const service = attachPipelineToService(getVideoService(WORKSPACE_ROOT));

  // Garante também os arquivos estáticos em examples/<id>/project.json
  const examplesMap = {
    'simulacao-demo': createSimulacaoDemoProject('simulacao-demo'),
    'kinetic-top5': createKineticTop5Project('kinetic-top5'),
    'freeform-demo': createFreeformDemoProject('freeform-demo'),
    'musica-acorde-menor': createMusicaAcordeMenorProject('musica-acorde-menor'),
  };
  for (const [exName, exProj] of Object.entries(examplesMap)) {
    const exDir = path.join(WORKSPACE_ROOT, 'examples', exName);
    mkdirSync(exDir, { recursive: true });
    const exFile = path.join(exDir, 'project.json');
    writeFileSync(exFile, JSON.stringify(exProj, null, 2) + '\n', 'utf8');
  }

  if (exampleId) {
    service.seedExampleProject(exampleId, projectId);
  }

  if (!jsonOutput) {
    console.log(`🎬 Iniciando geração de ponta a ponta do projeto "${projectId}"...`);
  }

  const job = await service.renderVideoSync(projectId);

  if (job.status === 'failed') {
    if (jsonOutput) {
      console.log(JSON.stringify({ ok: false, job }, null, 2));
    } else {
      console.error(`❌ Falha ao gerar vídeo: ${job.message}`);
    }
    process.exit(1);
  }

  const project = service.getProject(projectId);
  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          projectId: project.id,
          engine: project.engine,
          duration: project.totalDuration,
          outputMp4Path: job.outputMp4Path,
          outputSrtPath: job.outputSrtPath,
          outputAssPath: job.outputAssPath,
          thumbnailPath: job.thumbnailPath,
        },
        null,
        2
      )
    );
  } else {
    console.log(`✅ Vídeo gerado com sucesso!`);
    console.log(`   • MP4: ${job.outputMp4Path}`);
    console.log(`   • SRT: ${job.outputSrtPath}`);
    console.log(`   • ASS: ${job.outputAssPath}`);
    console.log(`   • Thumbnail: ${job.thumbnailPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
