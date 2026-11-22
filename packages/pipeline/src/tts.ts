import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { AppSettings, VoiceConfig, WordTimestamp } from '@videos/core';
import { estimateProportionalWordTimestamps } from '@videos/overlays';

const execFileAsync = promisify(execFile);

export interface TTSSynthesisResult {
  audioPath: string;
  duration: number;
  wordTimestamps: WordTimestamp[];
  providerUsed: string;
  cached: boolean;
}

export async function probeAudioDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const val = parseFloat(stdout.trim());
    return Number.isFinite(val) && val > 0 ? Number(val.toFixed(3)) : 3.5;
  } catch {
    return 3.5;
  }
}

/**
 * Sintetiza áudio via Microsoft Edge Neural TTS (`msedge-tts`) com word boundaries nativos.
 */
async function synthesizeWithEdgeTTS(
  text: string,
  voice: VoiceConfig,
  outMp3Path: string,
  highlightWords: string[] = []
): Promise<{ duration: number; wordTimestamps: WordTimestamp[] }> {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
  const tts = new MsEdgeTTS();
  const voiceId = voice.voiceId.includes('Neural') ? voice.voiceId : 'pt-BR-AntonioNeural';

  await tts.setMetadata(voiceId, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, {
    wordBoundaryEnabled: true,
  });

  const ratePct = Math.round(((voice.rate || 1.0) - 1.0) * 100);
  const rateStr = `${ratePct >= 0 ? '+' : ''}${ratePct}%`;

  const { audioStream, metadataStream } = tts.toStream(text, {
    rate: rateStr,
    pitch: voice.pitch || '+0Hz',
  });

  const audioChunks: Buffer[] = [];
  const metaChunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Edge TTS timeout após 15s')), 15000);
    audioStream.on('data', (chunk: Buffer) => audioChunks.push(Buffer.from(chunk)));
    if (metadataStream) {
      metadataStream.on('data', (chunk: Buffer) => metaChunks.push(Buffer.from(chunk)));
    }
    audioStream.on('end', () => {
      clearTimeout(timeout);
      resolve();
    });
    audioStream.on('error', (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  const fullAudio = Buffer.concat(audioChunks);
  if (fullAudio.length < 256) {
    throw new Error('Edge TTS retornou buffer de áudio vazio');
  }
  writeFileSync(outMp3Path, fullAudio);

  const duration = await probeAudioDuration(outMp3Path);
  const highlightSet = new Set(
    highlightWords.map((w) => w.toLowerCase().replace(/[.,!?;:"]/g, ''))
  );

  const wordTimestamps: WordTimestamp[] = [];
  for (const raw of metaChunks) {
    try {
      const parsed = JSON.parse(raw.toString('utf8'));
      const entries = Array.isArray(parsed?.Metadata) ? parsed.Metadata : [];
      for (const entry of entries) {
        if (entry?.Type === 'WordBoundary' && entry?.Data?.text?.Text) {
          const word = String(entry.Data.text.Text);
          // Offset e Duration em 100-nanosegundos (1e7 ticks = 1s)
          const start = Number((Number(entry.Data.Offset || 0) / 1e7).toFixed(3));
          const dur = Number((Number(entry.Data.Duration || 2500000) / 1e7).toFixed(3));
          const clean = word.toLowerCase().replace(/[.,!?;:"]/g, '');
          wordTimestamps.push({
            word,
            start,
            end: Number((start + Math.max(0.08, dur)).toFixed(3)),
            highlighted: highlightSet.has(clean),
          });
        }
      }
    } catch {
      // Ignora chunk inválido
    }
  }

  tts.close();

  if (wordTimestamps.length === 0) {
    return {
      duration,
      wordTimestamps: estimateProportionalWordTimestamps(text, duration, highlightWords),
    };
  }

  return { duration, wordTimestamps };
}

/**
 * Sintetiza áudio offline via `espeak-ng` (fallback garantido sem rede).
 */
async function synthesizeWithEspeak(
  text: string,
  voice: VoiceConfig,
  outWavPath: string,
  highlightWords: string[] = []
): Promise<{ duration: number; wordTimestamps: WordTimestamp[] }> {
  const wpm = Math.max(110, Math.min(310, Math.round(168 * (voice.rate || 1.08))));
  const rawWavPath = outWavPath.replace(/\.wav$/, '.raw.wav');

  await execFileAsync('espeak-ng', [
    '-v',
    'pt-br',
    '-s',
    String(wpm),
    '-w',
    rawWavPath,
    text,
  ]);

  // Normaliza para 44.1kHz stereo/mono limpo com pequeno padding final de 0.18s
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    rawWavPath,
    '-af',
    'aresample=44100,apad=pad_dur=0.18',
    '-ar',
    '44100',
    '-ac',
    '1',
    outWavPath,
  ]);

  const duration = await probeAudioDuration(outWavPath);
  const wordTimestamps = estimateProportionalWordTimestamps(text, duration, highlightWords);
  return { duration, wordTimestamps };
}

/**
 * Sintetiza áudio via provedores opcionais (ElevenLabs, OpenAI, Piper) ou redireciona para Edge/eSpeak.
 */
export async function synthesizeTextToSpeech(params: {
  text: string;
  voice: VoiceConfig;
  cacheDir: string;
  outputAudioPath: string;
  highlightWords?: string[];
  settings?: AppSettings;
}): Promise<TTSSynthesisResult> {
  const { text, voice, cacheDir, outputAudioPath, highlightWords = [], settings } = params;
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(path.dirname(outputAudioPath), { recursive: true });

  const hash = createHash('sha256')
    .update(JSON.stringify({ text: text.trim(), provider: voice.provider, voiceId: voice.voiceId, rate: voice.rate, pitch: voice.pitch }))
    .digest('hex')
    .slice(0, 16);

  const cacheMetaPath = path.join(cacheDir, `tts-${hash}.json`);
  const cacheAudioMp3 = path.join(cacheDir, `tts-${hash}.mp3`);
  const cacheAudioWav = path.join(cacheDir, `tts-${hash}.wav`);

  if (existsSync(cacheMetaPath)) {
    try {
      const meta = JSON.parse(readFileSync(cacheMetaPath, 'utf8'));
      const cachedAudio = existsSync(cacheAudioMp3)
        ? cacheAudioMp3
        : existsSync(cacheAudioWav)
          ? cacheAudioWav
          : null;
      if (cachedAudio && meta.duration > 0 && Array.isArray(meta.wordTimestamps)) {
        copyFileSync(cachedAudio, outputAudioPath);
        return {
          audioPath: outputAudioPath,
          duration: meta.duration,
          wordTimestamps: meta.wordTimestamps,
          providerUsed: meta.providerUsed || voice.provider,
          cached: true,
        };
      }
    } catch {
      // Re-sintetizar se o cache estiver corrompido
    }
  }

  let providerUsed: string = voice.provider;
  let duration = 3.5;
  let wordTimestamps: WordTimestamp[] = [];
  let savedCacheAudio = cacheAudioWav;

  // 1. Provedores comerciais opcionais (OpenAI / ElevenLabs) se chave presente
  if (voice.provider === 'openai' && settings?.openaiApiKey) {
    try {
      const res = await fetch(`${settings.openaiBaseUrl.replace(/\/$/, '')}/audio/speech`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text,
          voice: voice.voiceId || 'alloy',
          speed: voice.rate || 1.0,
        }),
      });
      if (!res.ok) throw new Error(`OpenAI TTS HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(cacheAudioMp3, buf);
      savedCacheAudio = cacheAudioMp3;
      duration = await probeAudioDuration(cacheAudioMp3);
      wordTimestamps = estimateProportionalWordTimestamps(text, duration, highlightWords);
      providerUsed = 'openai';
    } catch {
      providerUsed = 'edge';
    }
  } else if (voice.provider === 'elevenlabs' && settings?.elevenlabsApiKey) {
    try {
      const vId = settings.elevenlabsVoiceId || '21m00Tcm4TlvDq8ikWAM';
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': settings.elevenlabsApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
        }),
      });
      if (!res.ok) throw new Error(`ElevenLabs TTS HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(cacheAudioMp3, buf);
      savedCacheAudio = cacheAudioMp3;
      duration = await probeAudioDuration(cacheAudioMp3);
      wordTimestamps = estimateProportionalWordTimestamps(text, duration, highlightWords);
      providerUsed = 'elevenlabs';
    } catch {
      providerUsed = 'edge';
    }
  }

  // 2. Edge TTS padrão (com fallback transparente para espeak-ng)
  if (providerUsed === 'edge') {
    try {
      const edgeRes = await synthesizeWithEdgeTTS(text, voice, cacheAudioMp3, highlightWords);
      savedCacheAudio = cacheAudioMp3;
      duration = edgeRes.duration;
      wordTimestamps = edgeRes.wordTimestamps;
      providerUsed = 'edge';
    } catch {
      const espRes = await synthesizeWithEspeak(text, voice, cacheAudioWav, highlightWords);
      savedCacheAudio = cacheAudioWav;
      duration = espRes.duration;
      wordTimestamps = espRes.wordTimestamps;
      providerUsed = 'espeak';
    }
  } else if (providerUsed === 'espeak' || providerUsed === 'piper') {
    const espRes = await synthesizeWithEspeak(text, voice, cacheAudioWav, highlightWords);
    savedCacheAudio = cacheAudioWav;
    duration = espRes.duration;
    wordTimestamps = espRes.wordTimestamps;
    providerUsed = 'espeak';
  }

  writeFileSync(
    cacheMetaPath,
    JSON.stringify({ duration, wordTimestamps, providerUsed }, null, 2),
    'utf8'
  );
  copyFileSync(savedCacheAudio, outputAudioPath);

  return {
    audioPath: outputAudioPath,
    duration,
    wordTimestamps,
    providerUsed,
    cached: false,
  };
}
