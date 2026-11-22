import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createKinemaMcpServer } from './server.ts';

async function main() {
  const server = createKinemaMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Erro fatal no servidor MCP stdio:', err);
  process.exit(1);
});

export * from './server.ts';
