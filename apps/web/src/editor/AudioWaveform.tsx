/**
 * Visualizador de Waveform para Timeline NLE (Adaptado de OpenMotion Studio — Apache-2.0)
 * Origem: /home/higorlino/openmotion/studio/src/player/components/AudioWaveform.tsx e audioWaveformPeaks.ts
 */
import React, { useEffect, useMemo, useRef } from 'react';
import type { WordTimestamp } from '@kinema/core';

export function decimatePeaks(
  peaks: readonly number[],
  fromFraction: number,
  toFraction: number,
  barCount: number
): number[] {
  if (peaks.length === 0 || barCount <= 0) return [];
  const start = Math.max(0, Math.min(1, fromFraction));
  const end = Math.max(start, Math.min(1, toFraction));
  const out: number[] = [];
  for (let i = 0; i < barCount; i++) {
    const f0 = start + (i / barCount) * (end - start);
    const f1 = start + ((i + 1) / barCount) * (end - start);
    const idx0 = Math.floor(f0 * peaks.length);
    const idx1 = Math.max(idx0 + 1, Math.ceil(f1 * peaks.length));
    let maxPeak = 0.08;
    for (let j = idx0; j < Math.min(peaks.length, idx1); j++) {
      if (peaks[j] > maxPeak) maxPeak = peaks[j];
    }
    out.push(maxPeak);
  }
  return out;
}

export function loudnessToOpacity(amplitude: number): number {
  return Math.max(0.32, Math.min(1, 0.28 + amplitude * 0.78));
}

/**
 * Gera picos determinísticos de alta densidade a partir do texto narrado e dos timestamps de palavras,
 * simulando o envelope silábico real quando o buffer bruto de áudio não está carregado.
 */
export function buildSyntheticSpeechPeaks(
  narration: string,
  duration: number,
  wordTimestamps?: WordTimestamp[],
  sampleCount = 96
): number[] {
  const peaks = new Array<number>(sampleCount).fill(0.08);
  const dur = Math.max(0.5, duration);

  if (wordTimestamps && wordTimestamps.length > 0) {
    for (const w of wordTimestamps) {
      const i0 = Math.max(0, Math.floor((w.start / dur) * sampleCount));
      const i1 = Math.min(sampleCount - 1, Math.ceil((w.end / dur) * sampleCount));
      const len = Math.max(1, i1 - i0 + 1);
      for (let i = i0; i <= i1; i++) {
        const rel = (i - i0) / len;
        const syllableWave = 0.45 + 0.48 * Math.sin(rel * Math.PI) * (0.75 + 0.25 * Math.cos(i * 1.9));
        peaks[i] = Math.max(peaks[i], Math.min(0.98, w.highlighted ? syllableWave * 1.12 : syllableWave));
      }
    }
    return peaks;
  }

  let seed = 0;
  for (let i = 0; i < narration.length; i++) {
    seed = (seed * 31 + narration.charCodeAt(i)) >>> 0;
  }
  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleCount;
    // Pequenas pausas naturais entre frases/palavras
    const pauseMask = Math.sin(t * Math.PI * 6 + (seed % 7)) > -0.65 ? 1 : 0.14;
    const wave =
      0.32 +
      0.38 * Math.abs(Math.sin(i * 0.65 + (seed % 13))) +
      0.25 * Math.abs(Math.cos(i * 1.45 + (seed % 29)));
    peaks[i] = Math.max(0.08, Math.min(0.96, wave * pauseMask));
  }
  return peaks;
}

export interface AudioWaveformProps {
  narration?: string;
  duration: number;
  wordTimestamps?: WordTimestamp[];
  barColor?: string;
  baselineColor?: string;
  trimStartFraction?: number;
  trimEndFraction?: number;
  kind?: 'speech' | 'music';
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  narration = '',
  duration,
  wordTimestamps,
  barColor = '#38bdf8',
  baselineColor = 'rgba(56, 189, 248, 0.25)',
  trimStartFraction = 0,
  trimEndFraction = 1,
  kind = 'speech',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const rawPeaks = useMemo(() => {
    if (kind === 'music') {
      const count = 120;
      return Array.from({ length: count }, (_, i) => {
        const beat = (i % 4 === 0 ? 0.85 : 0.48) + 0.18 * Math.sin(i * 0.35);
        return Math.max(0.18, Math.min(0.92, beat));
      });
    }
    return buildSyntheticSpeechPeaks(narration, duration, wordTimestamps, 96);
  }, [narration, duration, wordTimestamps, kind]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = Math.max(24, canvas.clientWidth || 160);
    const height = Math.max(14, canvas.clientHeight || 24);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.ceil(width * dpr);
    canvas.height = Math.ceil(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const barStep = 3;
    const barCount = Math.max(6, Math.floor(width / barStep));
    const amplitudes = decimatePeaks(rawPeaks, trimStartFraction, trimEndFraction, barCount);

    ctx.fillStyle = baselineColor;
    ctx.fillRect(0, height - 2, width, 1.5);

    amplitudes.forEach((amp, idx) => {
      const x = (idx * width) / amplitudes.length;
      const w = Math.max(1.4, width / amplitudes.length - 1);
      const h = Math.max(3, amp * (height - 4));
      ctx.fillStyle = barColor;
      ctx.globalAlpha = loudnessToOpacity(amp);
      ctx.fillRect(x, height - h - 1, w, h);
    });
    ctx.globalAlpha = 1;
  }, [rawPeaks, barColor, baselineColor, trimStartFraction, trimEndFraction]);

  return (
    <canvas
      ref={canvasRef}
      className="nle-waveform-canvas"
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        pointerEvents: 'none',
      }}
    />
  );
};
