import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Job, Project, VideoService } from '@videos/core';
import { composeProject } from '@videos/composer';
import { synthesizeTextToSpeech } from './tts.ts';
import { mixProjectAudio, type AudioTimelineSegment } from './audio-mix.ts';
import { getRenderer, type PreviewFrameResult } from './renderer.ts';
import { generateSceneImage, generateScriptViaLLM } from './providers.ts';
import { analyzeReferenceVideo, syncLibraryRepositories } from './library.ts';

const execFileAsync = promisify(execFile);

/**
 * Estágio TTS + Mix de Áudio com cache por hash.
 */
export async function synthesizeProjectAudio(
  service: VideoService,
  projectId: string,
  onLog?: (msg: string) => void
): Promise<{ project: Project; mixedAudioPath: string }> {
  const project = service.getProject(projectId);
  const settings = service.getSettings();
  const projectDir = service.getProjectDir(projectId);
  const cacheDir = path.join(projectDir, 'cache');
  const audioDir = path.join(projectDir, 'audio');
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(audioDir, { recursive: true });

  const segments: AudioTimelineSegment[] = [];

  if (project.engine === 'scene3d') {
    let cursor = 0;
    for (let i = 0; i < project.scenes.length; i++) {
      const scene = project.scenes[i];
      const outPath = path.join(audioDir, `${scene.id}.mp3`);
      const ttsRes = await synthesizeTextToSpeech({
        text: scene.narration,
        voice: project.voice,
        cacheDir,
        outputAudioPath: outPath,
        highlightWords: scene.highlightWords,
        settings,
      });
      onLog?.(
        `TTS cena ${i + 1}/${project.scenes.length} (${scene.id}): ${ttsRes.duration}s via ${ttsRes.providerUsed} ${ttsRes.cached ? '[CACHE]' : ''}`
      );
      scene.audioPath = ttsRes.audioPath;
      scene.wordTimestamps = ttsRes.wordTimestamps;
      scene.duration = Number(Math.max(2.6, ttsRes.duration + 0.32).toFixed(2));

      segments.push({
        audioPath: scene.audioPath,
        startTime: cursor,
        duration: scene.duration,
        sfx: scene.sfx,
      });
      cursor += scene.duration;
    }
  } else if (project.engine === 'kinetic') {
    let cursor = 0;
    for (let i = 0; i < project.kineticBlocks.length; i++) {
      const block = project.kineticBlocks[i];
      const outPath = path.join(audioDir, `${block.id}.mp3`);
      const ttsRes = await synthesizeTextToSpeech({
        text: block.narration,
        voice: project.voice,
        cacheDir,
        outputAudioPath: outPath,
        highlightWords: block.highlightWord ? [block.highlightWord] : [],
        settings,
      });
      onLog?.(
        `TTS bloco ${i + 1}/${project.kineticBlocks.length} (${block.id}): ${ttsRes.duration}s via ${ttsRes.providerUsed}`
      );
      block.audioPath = ttsRes.audioPath;
      block.wordTimestamps = ttsRes.wordTimestamps;
      block.duration = Number(Math.max(2.6, ttsRes.duration + 0.35).toFixed(2));

      segments.push({
        audioPath: block.audioPath,
        startTime: cursor,
        duration: block.duration,
        sfx: block.sfx,
      });
      cursor += block.duration;
    }
  } else if (project.engine === 'freeform' && project.freeform) {
    if (project.freeform.narration && project.freeform.narration.trim()) {
      const outPath = path.join(audioDir, 'freeform-narration.mp3');
      const ttsRes = await synthesizeTextToSpeech({
        text: project.freeform.narration,
        voice: project.voice,
        cacheDir,
        outputAudioPath: outPath,
        settings,
      });
      project.freeform.audioPath = ttsRes.audioPath;
      project.freeform.wordTimestamps = ttsRes.wordTimestamps;
      project.freeform.duration = Number(
        Math.max(project.freeform.duration, ttsRes.duration + 0.4).toFixed(2)
      );
      segments.push({
        audioPath: ttsRes.audioPath,
        startTime: 0,
        duration: project.freeform.duration,
        sfx: 'whoosh',
      });
    }
  }

  const updatedProject = service.updateProject(projectId, {
    scenes: project.scenes,
    kineticBlocks: project.kineticBlocks,
    freeform: project.freeform,
    status: 'synthesized',
  });

  const mixedAudioPath = path.join(audioDir, 'mixed-master.wav');
  const sfxDir = path.isAbsolute(settings.sfxDir)
    ? settings.sfxDir
    : path.join(service.rootDir, settings.sfxDir);
  const musicDir = path.isAbsolute(settings.musicDir)
    ? settings.musicDir
    : path.join(service.rootDir, settings.musicDir);

  await mixProjectAudio({
    segments,
    totalDuration: updatedProject.totalDuration,
    renderSettings: updatedProject.renderSettings,
    sfxDir,
    musicDir,
    outputWavPath: mixedAudioPath,
  });

  onLog?.(`Mixagem de áudio FFmpeg concluída: ${mixedAudioPath}`);
  return { project: updatedProject, mixedAudioPath };
}

/**
 * Renderiza frames PNG de preview (1 por cena ou nos timestamps solicitados).
 */
export async function renderProjectPreviewFrames(
  service: VideoService,
  projectId: string,
  timestamps?: number[]
): Promise<PreviewFrameResult[]> {
  const project = service.getProject(projectId);
  const settings = service.getSettings();
  const projectDir = service.getProjectDir(projectId);
  const compositionDir = path.join(projectDir, 'composition');
  const previewsDir = path.join(projectDir, 'previews');

  await composeProject(project, service.listCharacters(), compositionDir, {
    workspaceRoot: service.rootDir,
  });

  let targetTimestamps = timestamps && timestamps.length > 0 ? timestamps : [];
  const sceneIdByIndex: string[] = [];

  if (targetTimestamps.length === 0) {
    if (project.engine === 'scene3d' && project.scenes.length > 0) {
      let cursor = 0;
      for (const sc of project.scenes) {
        targetTimestamps.push(Number((cursor + sc.duration * 0.45).toFixed(2)));
        sceneIdByIndex.push(sc.id);
        cursor += sc.duration;
      }
    } else if (project.engine === 'kinetic' && project.kineticBlocks.length > 0) {
      let cursor = 0;
      for (const kb of project.kineticBlocks) {
        targetTimestamps.push(Number((cursor + kb.duration * 0.5).toFixed(2)));
        sceneIdByIndex.push(kb.id);
        cursor += kb.duration;
      }
    } else {
      const dur = project.totalDuration || 10;
      targetTimestamps = [
        Number((dur * 0.2).toFixed(2)),
        Number((dur * 0.5).toFixed(2)),
        Number((dur * 0.8).toFixed(2)),
      ];
    }
  }

  const renderer = getRenderer(project.renderSettings.renderer || settings.renderer);
  const frames = await renderer.renderPreviewFrames({
    compositionDir,
    timestamps: targetTimestamps,
    outputDir: previewsDir,
    width: project.renderSettings.width || 720,
    height: project.renderSettings.height || 1280,
    settings,
  });

  if (frames[0]?.pngPath && existsSync(frames[0].pngPath)) {
    const thumbPath = path.join(projectDir, 'thumbnail.png');
    copyFileSync(frames[0].pngPath, thumbPath);
    service.updateProject(projectId, {
      compositionDir,
      thumbnailPath: thumbPath,
    });
  }

  return frames.map((f, idx) => ({
    ...f,
    sceneId: sceneIdByIndex[idx] || f.sceneId,
  }));
}

/**
 * Executa a pipeline completa de ponta a ponta (TTS → Mix → Compose → Render → Encode H.264/AAC + SRT/ASS).
 */
export async function executeFullPipeline(
  service: VideoService,
  projectId: string,
  jobId: string
): Promise<Job> {
  const log = (stage: Job['stage'], progress: number, message: string) => {
    service.updateJob(jobId, {
      status: 'running',
      stage,
      progress,
      message,
      appendLog: `[${stage.toUpperCase()}] ${message}`,
    });
  };

  try {
    log('script', 5, 'Validando roteiro e plano de cenas...');
    const validation = service.validateProject(projectId);
    if (!validation.valid) {
      const errs = validation.issues
        .filter((i) => i.severity === 'error')
        .map((i) => `${i.path}: ${i.message}`)
        .join('; ');
      throw new Error(`Falha na validação do projeto: ${errs}`);
    }

    service.updateProject(projectId, { status: 'rendering' });

    // 1. TTS + Audio Mix
    log('tts', 15, 'Sintetizando narração TTS e timestamps palavra a palavra...');
    const { project, mixedAudioPath } = await synthesizeProjectAudio(
      service,
      projectId,
      (msg) => log('tts', 25, msg)
    );

    log('audio-mix', 38, 'Trilha de áudio master mixada com ducking sidechain e SFX.');

    // 2. Composição HTML HyperFrames
    log('compose', 45, `Gerando composição HTML HyperFrames (engine: ${project.engine})...`);
    const projectDir = service.getProjectDir(projectId);
    const compositionDir = path.join(projectDir, 'composition');
    const artifact = await composeProject(
      project,
      service.listCharacters(),
      compositionDir,
      {
        workspaceRoot: service.rootDir,
        mixedAudioPath,
      }
    );

    // 3. Renderização Visual
    const settings = service.getSettings();
    const rendererId = project.renderSettings.renderer || settings.renderer;
    const renderer = getRenderer(rendererId);
    log(
      'render',
      52,
      `Renderizando vídeo (${project.renderSettings.width}x${project.renderSettings.height} @ ${project.renderSettings.fps}fps, ${artifact.totalDuration}s) via ${renderer.id}...`
    );

    const rawVideoMp4 = path.join(projectDir, 'render', 'raw-visual.mp4');
    await renderer.renderVideo({
      compositionDir,
      outputMp4Path: rawVideoMp4,
      totalDuration: artifact.totalDuration,
      renderSettings: project.renderSettings,
      settings,
      onProgress: (pct, msg) => {
        const mapped = 52 + Math.round((pct / 100) * 33);
        log('render', mapped, msg);
      },
    });

    // 4. Encode Final H.264 + AAC + Thumbnail + Export SRT/ASS
    log('encode', 88, 'Codificando MP4 final H.264/AAC com FFmpeg e gerando legendas .srt/.ass...');
    const rendersOutDir = path.join(service.rootDir, 'renders');
    mkdirSync(rendersOutDir, { recursive: true });

    const finalMp4Path = path.join(rendersOutDir, `${projectId}.mp4`);
    const finalSrtPath = path.join(rendersOutDir, `${projectId}.srt`);
    const finalAssPath = path.join(rendersOutDir, `${projectId}.ass`);
    const finalThumbPath = path.join(rendersOutDir, `${projectId}-thumb.png`);

    copyFileSync(artifact.srtPath, finalSrtPath);
    copyFileSync(artifact.assPath, finalAssPath);

    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      rawVideoMp4,
      '-i',
      mixedAudioPath,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      String(project.renderSettings.crf || 21),
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-ar',
      '44100',
      '-ac',
      '2',
      '-movflags',
      '+faststart',
      '-shortest',
      finalMp4Path,
    ]);

    // Extrai thumbnail representativo
    const thumbTime = Math.min(1.2, artifact.totalDuration * 0.25);
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss',
      String(thumbTime.toFixed(2)),
      '-i',
      finalMp4Path,
      '-frames:v',
      '1',
      finalThumbPath,
    ]);

    service.updateProject(projectId, {
      status: 'completed',
      compositionDir,
      outputMp4Path: finalMp4Path,
      outputSrtPath: finalSrtPath,
      outputAssPath: finalAssPath,
      thumbnailPath: finalThumbPath,
    });

    return service.updateJob(jobId, {
      status: 'completed',
      stage: 'completed',
      progress: 100,
      message: `Vídeo renderizado com sucesso: ${finalMp4Path}`,
      outputMp4Path: finalMp4Path,
      outputSrtPath: finalSrtPath,
      outputAssPath: finalAssPath,
      thumbnailPath: finalThumbPath,
      appendLog: `[COMPLETED] MP4: ${finalMp4Path} | SRT: ${finalSrtPath}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    service.updateProject(projectId, { status: 'failed' });
    return service.updateJob(jobId, {
      status: 'failed',
      stage: 'failed',
      message: msg,
      error: err instanceof Error ? err.stack || msg : msg,
      appendLog: `[FAILED] ${msg}`,
    });
  }
}

/**
 * Conecta todos os handlers da pipeline na instância do `VideoService`.
 */
export function attachPipelineToService(service: VideoService): VideoService {
  service.registerPipelineHandlers({
    synthesizeAudio: async (projectId) => {
      const { project } = await synthesizeProjectAudio(service, projectId);
      return project;
    },
    renderPreviewFrames: async (projectId, timestamps) => {
      return renderProjectPreviewFrames(service, projectId, timestamps);
    },
    renderVideo: async (projectId, jobId) => {
      return executeFullPipeline(service, projectId, jobId);
    },
    breakdownReferenceVideo: async (videoPath, transcribe) => {
      return analyzeReferenceVideo({
        videoPath,
        dataDir: service.dataDir,
        libraryDir: service.libraryDir,
        transcribe,
      });
    },
    generateImage: async (prompt, options) => {
      const settings = service.getSettings();
      const targetDir = options?.projectId
        ? path.join(service.getProjectDir(options.projectId), 'assets', 'generated')
        : path.join(service.dataDir, 'generated-images');
      const outPath = path.join(targetDir, `img-${Date.now()}.png`);
      return generateSceneImage({
        prompt,
        width: options?.width,
        height: options?.height,
        outputPath: outPath,
        settings,
      });
    },
    generateScriptWithLLM: async (params) => {
      const settings = service.getSettings();
      return generateScriptViaLLM({ ...params, settings });
    },
    syncLibrary: async () => {
      const res = await syncLibraryRepositories(service.rootDir);
      return { count: res.count, items: res.items };
    },
  });
  return service;
}
