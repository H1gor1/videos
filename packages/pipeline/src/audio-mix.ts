import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { RenderSettings } from '@kinema/core';

const execFileAsync = promisify(execFile);

export interface AudioTimelineSegment {
  audioPath?: string;
  startTime: number;
  duration: number;
  sfx?: string;
}

/**
 * Garante que os arquivos de efeitos sonoros sintéticos (SFX) existam em `sfxDir`
 * usando geradores determinísticos do FFmpeg (`aevalsrc`/`sine`).
 */
export async function ensureSyntheticSfxAssets(sfxDir: string): Promise<void> {
  mkdirSync(sfxDir, { recursive: true });

  const sfxDefinitions: Array<{ name: string; filter: string; duration: string }> = [
    {
      name: 'whoosh',
      filter: "aevalsrc='0.35*sin(2*PI*(180+420*t)*t)*exp(-4.5*t)':s=44100:d=0.35",
      duration: '0.35',
    },
    {
      name: 'ding',
      filter: "aevalsrc='0.4*sin(2*PI*880*t)*exp(-4*t)+0.25*sin(2*PI*1760*t)*exp(-6*t)':s=44100:d=0.45",
      duration: '0.45',
    },
    {
      name: 'alarm',
      filter: "aevalsrc='0.35*sin(2*PI*(620+180*sin(2*PI*8*t))*t)*exp(-1.5*t)':s=44100:d=0.55",
      duration: '0.55',
    },
    {
      name: 'lever',
      filter: "aevalsrc='0.4*sin(2*PI*(140+260*t)*t)*exp(-3.5*t)':s=44100:d=0.42",
      duration: '0.42',
    },
    {
      name: 'cheer',
      filter: "aevalsrc='0.28*(sin(2*PI*523.25*t)+sin(2*PI*659.25*t)+sin(2*PI*783.99*t))*exp(-2.2*t)':s=44100:d=0.65",
      duration: '0.65',
    },
    {
      name: 'coin',
      filter: "aevalsrc='0.35*sin(2*PI*(987.77+(t>0.08)*330.7)*t)*exp(-4.5*t)':s=44100:d=0.38",
      duration: '0.38',
    },
    {
      name: 'pop',
      filter: "aevalsrc='0.42*sin(2*PI*(320-180*t)*t)*exp(-12*t)':s=44100:d=0.18",
      duration: '0.18',
    },
  ];

  for (const def of sfxDefinitions) {
    const outPath = path.join(sfxDir, `${def.name}.wav`);
    if (existsSync(outPath)) continue;
    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-f',
        'lavfi',
        '-i',
        def.filter,
        '-t',
        def.duration,
        '-ar',
        '44100',
        '-ac',
        '2',
        outPath,
      ]);
    } catch {
      // Fallback silencioso se lavfi falhar
    }
  }
}

/**
 * Garante trilhas musicais sintéticas suaves em `musicDir` caso o usuário não tenha colocado MP3 próprios.
 */
export async function ensureSyntheticMusicTrack(
  musicDir: string,
  trackName = 'upbeat-simulation',
  minDuration = 60
): Promise<string | null> {
  if (!trackName || trackName === 'none') return null;
  mkdirSync(musicDir, { recursive: true });

  // Verifica se já existe arquivo customizado (.mp3 ou .wav)
  const customMp3 = path.join(musicDir, `${trackName}.mp3`);
  if (existsSync(customMp3)) return customMp3;
  const outWav = path.join(musicDir, `${trackName}.wav`);
  if (existsSync(outWav)) return outWav;

  const dur = Math.max(45, Math.ceil(minDuration + 5));
  let expr =
    "0.16*(sin(2*PI*110*t)+0.6*sin(2*PI*164.81*t)+0.45*sin(2*PI*220*t)*(0.5+0.5*sin(2*PI*2*t)))";
  if (trackName === 'cyber-pulse') {
    expr =
      "0.16*(sin(2*PI*98*t)+0.7*sin(2*PI*146.83*t)*(0.5+0.5*sin(2*PI*3*t))+0.35*sin(2*PI*293.66*t))";
  }

  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `aevalsrc='${expr}':s=44100:d=${dur}`,
      '-af',
      'lowpass=f=1800,highpass=f=60',
      '-ar',
      '44100',
      '-ac',
      '2',
      outWav,
    ]);
    return outWav;
  } catch {
    return null;
  }
}

/**
 * Mixa narração das cenas + SFX posicionados + trilha musical com ducking sidechain em um único WAV stereo.
 */
export async function mixProjectAudio(params: {
  segments: AudioTimelineSegment[];
  totalDuration: number;
  renderSettings: RenderSettings;
  sfxDir: string;
  musicDir: string;
  outputWavPath: string;
}): Promise<string> {
  const { segments, totalDuration, renderSettings, sfxDir, musicDir, outputWavPath } = params;
  mkdirSync(path.dirname(outputWavPath), { recursive: true });
  await ensureSyntheticSfxAssets(sfxDir);

  const durSec = Math.max(1, Number(totalDuration.toFixed(2)));
  const voiceWavPath = outputWavPath.replace(/\.wav$/, '.voice.wav');

  // 1. Montar trilha de voz combinada com adelay para cada segmento
  const validVoiceSegments = segments.filter((s) => s.audioPath && existsSync(s.audioPath));
  if (validVoiceSegments.length === 0) {
    // Gera trilha silenciosa se não houver voz
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `anullsrc=r=44100:cl=stereo:d=${durSec}`,
      '-t',
      String(durSec),
      voiceWavPath,
    ]);
  } else {
    const inputs: string[] = [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `anullsrc=r=44100:cl=stereo:d=${durSec}`,
    ];
    const filterParts: string[] = [];
    const mixLabels: string[] = ['[0:a]'];

    validVoiceSegments.forEach((seg, idx) => {
      inputs.push('-i', seg.audioPath!);
      const inputIdx = idx + 1;
      const delayMs = Math.max(0, Math.round(seg.startTime * 1000));
      const label = `[v${inputIdx}]`;
      filterParts.push(
        `[${inputIdx}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${delayMs}|${delayMs}${label}`
      );
      mixLabels.push(label);
    });

    filterParts.push(
      `${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=0,volume=${mixLabels.length}[vout]`
    );

    await execFileAsync('ffmpeg', [
      ...inputs,
      '-filter_complex',
      filterParts.join(';'),
      '-map',
      '[vout]',
      '-t',
      String(durSec),
      '-ar',
      '44100',
      '-ac',
      '2',
      voiceWavPath,
    ]);
  }

  // 2. Mixar SFX + Música de fundo com sidechaincompress (ducking quando a voz fala)
  const musicPath = await ensureSyntheticMusicTrack(
    musicDir,
    renderSettings.musicTrack,
    durSec
  );

  const sfxSegments = segments.filter(
    (s) => s.sfx && s.sfx !== 'none' && existsSync(path.join(sfxDir, `${s.sfx}.wav`))
  );

  try {
    const mixInputs: string[] = ['-y', '-i', voiceWavPath];
    const filters: string[] = [];
    let nextIdx = 1;

    let musicIdx: number | null = null;
    if (musicPath && existsSync(musicPath) && renderSettings.musicVolume > 0) {
      mixInputs.push('-stream_loop', '-1', '-i', musicPath);
      musicIdx = nextIdx++;
    }

    const sfxLabels: string[] = [];
    for (const seg of sfxSegments) {
      const sfxFile = path.join(sfxDir, `${seg.sfx}.wav`);
      mixInputs.push('-i', sfxFile);
      const idx = nextIdx++;
      const delayMs = Math.max(0, Math.round(seg.startTime * 1000));
      const lbl = `[sfx${idx}]`;
      filters.push(
        `[${idx}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${renderSettings.sfxVolume || 0.3},adelay=${delayMs}|${delayMs}${lbl}`
      );
      sfxLabels.push(lbl);
    }

    if (musicIdx !== null) {
      // Sidechain ducking: divide a voz em [voice_main] e [voice_sc] e comprime a música
      filters.push(`[0:a]asplit=2[voice_main][voice_sc]`);
      filters.push(
        `[${musicIdx}:a]aresample=44100,aformat=channel_layouts=stereo,atrim=0:${durSec},volume=${renderSettings.musicVolume}[music_raw]`
      );
      filters.push(
        `[music_raw][voice_sc]sidechaincompress=threshold=${renderSettings.duckingThreshold || 0.03}:ratio=6:attack=15:release=250[music_ducked]`
      );

      const finalInputs = ['[voice_main]', '[music_ducked]', ...sfxLabels];
      filters.push(
        `${finalInputs.join('')}amix=inputs=${finalInputs.length}:duration=first:normalize=0[master]`
      );
    } else if (sfxLabels.length > 0) {
      const finalInputs = ['[0:a]', ...sfxLabels];
      filters.push(
        `${finalInputs.join('')}amix=inputs=${finalInputs.length}:duration=first:normalize=0[master]`
      );
    } else {
      filters.push(`[0:a]acopy[master]`);
    }

    await execFileAsync('ffmpeg', [
      ...mixInputs,
      '-filter_complex',
      filters.join(';'),
      '-map',
      '[master]',
      '-t',
      String(durSec),
      '-ar',
      '44100',
      '-ac',
      '2',
      outputWavPath,
    ]);
  } catch {
    // Fallback direto para a trilha de voz se sidechaincompress falhar
    await execFileAsync('ffmpeg', ['-y', '-i', voiceWavPath, '-c', 'copy', outputWavPath]);
  }

  return outputWavPath;
}
