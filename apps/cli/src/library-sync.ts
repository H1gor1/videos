import { WORKSPACE_ROOT, getVideoService } from '@videos/core';
import { attachPipelineToService, syncLibraryRepositories } from '@videos/pipeline';

async function main() {
  const jsonOutput = process.argv.includes('--json');
  attachPipelineToService(getVideoService(WORKSPACE_ROOT));
  if (!jsonOutput) {
    console.log('📚 Sincronizando biblioteca de prompts, estilos, efeitos, técnicas e blocos HyperFrames...');
  }
  const res = await syncLibraryRepositories(WORKSPACE_ROOT);
  if (jsonOutput) {
    console.log(JSON.stringify({ ok: true, count: res.count, repoStats: res.repoStats }, null, 2));
  } else {
    console.log(`✅ Biblioteca sincronizada: ${res.count} itens indexados em library/index.json`);
    for (const [repo, count] of Object.entries(res.repoStats)) {
      console.log(`   • ${repo}: ${count} itens`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
