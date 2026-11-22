import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WORKSPACE_ROOT, VideoService } from '@kinema/core';
import { extractItemsFromVendorRepo } from '@kinema/pipeline';

describe('Importador da Biblioteca (lemo-opuscar, awesome-opus5-5-videos, pixelfx, hyperframes)', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const d of tempDirs) {
      rmSync(d, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('indexa lemo-opuscar a partir de fixture mínima, retorna STYLE.md completo e injeta em applyStyle', () => {
    const tmpRoot = mkdtempSync(path.join(tmpdir(), 'kinema-lib-fixture-'));
    tempDirs.push(tmpRoot);

    const fixtureLib = path.join(WORKSPACE_ROOT, 'tests/fixtures/library');
    cpSync(fixtureLib, path.join(tmpRoot, 'library'), { recursive: true });

    const lemoDir = path.join(tmpRoot, 'library/vendor/lemo-opuscar');
    const items = extractItemsFromVendorRepo(tmpRoot, lemoDir, {
      folder: 'lemo-opuscar',
      url: 'https://github.com/lemomo-ai/lemo-opuscar.git',
      type: 'style',
      license: 'Local Only (Undeclared)',
    });

    const styles = items.filter((i) => i.type === 'style');
    const techniques = items.filter((i) => i.type === 'technique');

    expect(styles).toHaveLength(1);
    expect(styles[0].id).toBe('lemo-style-chalkboard');
    expect(styles[0].title).toBe('Chalkboard');
    expect(styles[0].description).toContain('real classroom blackboard');
    expect(styles[0].sourcePath).toBe('library/vendor/lemo-opuscar/styles/chalkboard/STYLE.md');
    expect(styles[0].previewUrl).toBe('library/vendor/lemo-opuscar/styles/chalkboard/poster.jpg');
    expect(styles[0].license).toMatch(/Undeclared|Do Not Redistribute/i);
    expect(styles[0].tags).toContain('chalkboard');

    // _template e README de styles não devem virar style; AGENTS.md vira technique (sem seção License)
    expect(styles.some((s) => s.id.includes('template') || s.id.includes('readme'))).toBe(false);
    expect(techniques.length).toBeGreaterThanOrEqual(2);
    expect(techniques.some((t) => t.title.includes('License'))).toBe(false);

    // Grava index.json e valida searchLibrary, getLibraryItem e applyStyle
    writeFileSync(
      path.join(tmpRoot, 'library/index.json'),
      JSON.stringify({ version: 1, count: items.length, items }, null, 2),
      'utf8'
    );

    const svc = new VideoService(tmpRoot);
    const found = svc.searchLibrary({ query: 'chalkboard', type: 'style' });
    expect(found.some((i) => i.id === 'lemo-style-chalkboard')).toBe(true);

    const fullItem = svc.getLibraryItem('lemo-style-chalkboard');
    expect(fullItem?.fullContent).toContain('FULL_STYLE_END_MARKER');

    const proj = svc.createProject({ title: 'Teste Estilo', engine: 'freeform' });
    const styled = svc.applyStyle(proj.id, 'lemo-style-chalkboard');
    expect(styled.styleId).toBe('lemo-style-chalkboard');
    expect(styled.stylePrompt).toContain('FULL_STYLE_END_MARKER');
  });

  it('quando vendor real existir, indexa >= 90 estilos reais do lemo-opuscar e searchLibrary encontra lemo-style-chalkboard', () => {
    const realLemoStyles = path.join(WORKSPACE_ROOT, 'library/vendor/lemo-opuscar/styles');
    if (!existsSync(realLemoStyles)) return;

    const svc = new VideoService(WORKSPACE_ROOT);
    const found = svc.searchLibrary({ query: 'chalkboard', type: 'style' });
    expect(found[0]?.id).toBe('lemo-style-chalkboard');

    const allLemoStyles = svc.searchLibrary({ type: 'style', tag: 'lemo-opuscar', limit: 200 });
    expect(allLemoStyles.length).toBeGreaterThanOrEqual(90);

    const fullChalkboard = svc.getLibraryItem('lemo-style-chalkboard');
    expect(fullChalkboard?.fullContent).toContain('## 11. Variation space');
  });
});
