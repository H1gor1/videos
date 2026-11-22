import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';
import { WORKSPACE_ROOT } from '@videos/core';

describe('Servidor MCP Stdio — Teste de Integração Ponta a Ponta', () => {
  it(
    'conecta um cliente MCP via stdio, consulta library/templates, cria personagem e projeto, define roteiro e valida',
    async () => {
      const tmpDataDir = mkdtempSync(path.join(tmpdir(), 'videos-test-'));

      const transport = new StdioClientTransport({
        command: process.execPath,
        args: ['--import', 'tsx', path.join(WORKSPACE_ROOT, 'apps/mcp/src/index.ts')],
        cwd: WORKSPACE_ROOT,
        env: { ...process.env, VIDEOS_DATA_DIR: tmpDataDir },
      });

      const client = new Client(
        { name: 'videos-test-client', version: '0.1.0' },
        { capabilities: {} }
      );

      try {
        await client.connect(transport);

        // 1. Listar tools disponíveis
        const toolsList = await client.listTools();
        const toolNames = toolsList.tools.map((t) => t.name);
        expect(toolNames).toContain('list_templates');
        expect(toolNames).toContain('list_engines');
        expect(toolNames).toContain('search_library');
        expect(toolNames).toContain('create_character');
        expect(toolNames).toContain('create_project');
        expect(toolNames).toContain('set_script');
        expect(toolNames).toContain('validate_project');
        expect(toolNames).toContain('render_preview_frames');
        expect(toolNames).toContain('render_video');
        expect(toolNames).toContain('breakdown_reference_video');
        expect(toolNames).toContain('generate_image');
        expect(toolNames).toContain('list_design_kits');
        expect(toolNames).toContain('get_design_kit');
        expect(toolNames).toContain('create_design_kit');
        expect(toolNames).toContain('update_design_kit');
        expect(toolNames).toContain('apply_design_kit');

        // 2. Ler resource style-guide
        const resourceRes = await client.readResource({
          uri: 'videos://docs/style-guide',
        });
        const firstContent = resourceRes.contents[0] as { text?: string };
        expect(firstContent.text).toContain('Guia de Estilo');

        // 3. Pesquisar na biblioteca
        const libRes = await client.callTool({
          name: 'search_library',
          arguments: { type: 'style', limit: 5 },
        });
        const libItems = JSON.parse((libRes.content as any)[0].text);
        expect(Array.isArray(libItems)).toBe(true);
        expect(libItems.length).toBeGreaterThan(0);

        // 4. Criar personagem fictício via tool MCP
        const charRes = await client.callTool({
          name: 'create_character',
          arguments: {
            id: 'mcp-test-char',
            name: 'Dr. Rafael Lima',
            role: 'Pesquisador · Brasília',
            hairStyle: 'afro',
            hasBeard: true,
            hasGlasses: true,
            shirtColor: '#c1121f',
            accessories: ['sash'],
          },
        });
        const createdChar = JSON.parse((charRes.content as any)[0].text);
        expect(createdChar.id).toBe('mcp-test-char');

        // 5. Criar projeto via tool MCP
        const projRes = await client.callTool({
          name: 'create_project',
          arguments: {
            id: 'mcp-integration-demo',
            title: 'SIMULAÇÃO MCP · Transição Energética',
            engine: 'scene3d',
            styleId: libItems[0].id,
            characterId: 'mcp-test-char',
          },
        });
        const createdProj = JSON.parse((projRes.content as any)[0].text);
        expect(createdProj.id).toBe('mcp-integration-demo');

        // 6. Definir roteiro e plano de cenas via set_script
        const scriptRes = await client.callTool({
          name: 'set_script',
          arguments: {
            projectId: 'mcp-integration-demo',
            scenes: [
              {
                id: 's1',
                narration: 'Na nossa simulação de dois mil e trinta, a energia limpa domina.',
                duration: 3.8,
                template: 'red-carpet-confetti',
                characterId: 'mcp-test-char',
                pose: 'celebrating',
                camera: 'dolly-in',
                overlays: [
                  {
                    type: 'title',
                    text: 'ENERGIA 2030',
                    highlightWord: '2030',
                    position: 'top',
                    boxed: false,
                  },
                ],
              },
              {
                id: 's2',
                narration: 'Os investimentos em lítio e nióbio crescem em todo o país.',
                duration: 4.0,
                template: 'timeline-3d',
                characterId: 'mcp-test-char',
                pose: 'pointing',
                camera: 'pan',
              },
            ],
          },
        });
        const updatedProj = JSON.parse((scriptRes.content as any)[0].text);
        expect(updatedProj.scenes.length).toBe(2);

        // 7. Validar projeto via validate_project
        const valRes = await client.callTool({
          name: 'validate_project',
          arguments: { projectId: 'mcp-integration-demo' },
        });
        const validation = JSON.parse((valRes.content as any)[0].text);
        expect(validation.valid).toBe(true);
      } finally {
        await client.close().catch(() => undefined);
        rmSync(tmpDataDir, { recursive: true, force: true });
      }
    },
    30_000
  );
});
