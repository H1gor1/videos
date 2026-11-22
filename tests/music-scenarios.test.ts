import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CharacterPoseSchema,
  DEFAULT_CHARACTERS,
  STAGE_TEMPLATES,
  StageTemplateIdSchema,
  VideoService,
  createMusicaAcordeMenorProject,
} from '@kinema/core';
import { composeProject } from '@kinema/composer';

describe('Cenários e poses musicais no engine scene3d', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const d of tempDirs) {
      rmSync(d, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('registra music-studio, concert-stage e as 4 novas poses no schema e no catálogo MCP', () => {
    expect(StageTemplateIdSchema.options).toContain('music-studio');
    expect(StageTemplateIdSchema.options).toContain('concert-stage');
    expect(STAGE_TEMPLATES.some((t) => t.id === 'music-studio')).toBe(true);
    expect(STAGE_TEMPLATES.some((t) => t.id === 'concert-stage')).toBe(true);

    for (const pose of ['play-piano', 'play-guitar', 'conduct', 'sing']) {
      expect(CharacterPoseSchema.options).toContain(pose);
    }

    const tmpRoot = mkdtempSync(path.join(tmpdir(), 'kinema-music-schema-'));
    tempDirs.push(tmpRoot);
    const svc = new VideoService(tmpRoot);
    const schema = svc.getEngineSchema('scene3d') as {
      templates: Array<{ id: string }>;
      poses: string[];
    };
    expect(schema.templates.length).toBe(13);
    expect(schema.poses).toEqual(
      expect.arrayContaining(['play-piano', 'play-guitar', 'conduct', 'sing'])
    );
  });

  it('valida e compõe o exemplo musica-acorde-menor com keyframes C-E-G -> C-Eb-G', async () => {
    const tmpOut = mkdtempSync(path.join(tmpdir(), 'kinema-music-compose-'));
    tempDirs.push(tmpOut);

    const proj = createMusicaAcordeMenorProject('musica-acorde-menor');
    expect(proj.engine).toBe('scene3d');
    expect(proj.scenes.length).toBeGreaterThanOrEqual(4);
    expect(proj.scenes.some((s) => s.template === 'music-studio')).toBe(true);
    expect(proj.scenes.some((s) => s.template === 'concert-stage')).toBe(true);
    expect(JSON.stringify(proj.scenes)).toContain('Eb4');

    const artifact = await composeProject(proj, DEFAULT_CHARACTERS, tmpOut);
    const html = readFileSync(artifact.indexHtmlPath, 'utf8');
    expect(html).toContain('music-studio');
    expect(html).toContain('concert-stage');
    expect(html).toContain('play-piano');
    expect(html).toContain('Eb4');
  });
});
