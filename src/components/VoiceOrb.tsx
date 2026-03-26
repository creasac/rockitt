import { useEffect, useRef, useState, type CSSProperties } from 'react';

import type { VoiceState } from '../lib/mock-data';

type FrequencyDataGetter = () => Uint8Array | undefined;
type VolumeGetter = () => number;

type VoiceOrbProps = {
  disabled?: boolean;
  getInputByteFrequencyData?: FrequencyDataGetter;
  getInputVolume?: VolumeGetter;
  getOutputByteFrequencyData?: FrequencyDataGetter;
  getOutputVolume?: VolumeGetter;
  label?: string;
  state: VoiceState;
  onPress: () => void;
};

const dotCount = 7;
const flatDotLevel = 0.34;
const idleDots = Array.from({ length: dotCount }, () => flatDotLevel);
const restingDots = [0.08, 0.14, 0.22, 0.3, 0.22, 0.14, 0.08];
const dotCenterIndex = (dotCount - 1) / 2;
const dotUpdateThreshold = 0.014;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const getDotEmphasis = (index: number) =>
  1 - Math.abs(index - dotCenterIndex) / (dotCenterIndex + 1);

const buildWaveformDots = (
  byteData: Uint8Array | undefined,
  volume: number,
  timeMs: number,
) => {
  const normalizedVolume = clamp(Number.isFinite(volume) ? volume : 0, 0, 1);

  if (!byteData?.length) {
    return restingDots.map((baseLevel, index) =>
      clamp(
        baseLevel + normalizedVolume * (0.18 + getDotEmphasis(index) * 0.34),
        0.06,
        1,
      ),
    );
  }

  const usableBins = Math.min(
    byteData.length,
    Math.max(dotCount * 4, Math.floor(byteData.length * 0.34)),
  );
  const nextDots = restingDots.map((baseLevel, index) => {
    const start = Math.floor((index / dotCount) * usableBins);
    const end = Math.max(
      start + 1,
      Math.floor(((index + 1) / dotCount) * usableBins),
    );
    let total = 0;

    for (let binIndex = start; binIndex < end; binIndex += 1) {
      total += byteData[binIndex] ?? 0;
    }

    const averageLevel = total / (end - start) / 255;
    const emphasis = 0.86 + getDotEmphasis(index) * 0.34;
    const combinedLevel = Math.max(
      averageLevel * emphasis,
      normalizedVolume * (0.34 + getDotEmphasis(index) * 0.26),
    );
    const waveDrift =
      Math.sin(timeMs / 165 + index * 0.72) *
      combinedLevel *
      (0.08 + getDotEmphasis(index) * 0.22);
    const accentLift =
      Math.max(0, Math.sin(timeMs / 245 + index * 0.58)) *
      combinedLevel *
      0.18;

    return clamp(
      baseLevel + combinedLevel * 1.1 + waveDrift + accentLift,
      0.06,
      1,
    );
  });
  const signalPeak = nextDots.reduce(
    (peak, level, index) => Math.max(peak, level - restingDots[index]),
    0,
  );

  return signalPeak < 0.04 ? restingDots : nextDots;
};

function WaveformGlyph({
  levels,
  staticDots = false,
}: {
  levels: number[];
  staticDots?: boolean;
}) {
  return (
    <span
      className={`voice-orb__icon voice-orb__waveform${staticDots ? ' voice-orb__waveform--static' : ''}`}
      aria-hidden="true"
    >
      {levels.map((level, index) => (
        <span
          key={index}
          className="voice-orb__wave-dot"
          style={
            {
              '--voice-orb-dot-index': String(index),
              '--voice-orb-dot-level': level.toFixed(3),
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

export function VoiceOrb({
  disabled = false,
  getInputByteFrequencyData,
  getInputVolume,
  getOutputByteFrequencyData,
  getOutputVolume,
  label = 'Start or preview voice mode',
  state,
  onPress,
}: VoiceOrbProps) {
  const [waveformDots, setWaveformDots] = useState(restingDots);
  const waveformDotsRef = useRef(restingDots);
  const isWaveformState = state === 'listening' || state === 'speaking';

  useEffect(() => {
    if (!isWaveformState) {
      waveformDotsRef.current = restingDots;
      setWaveformDots((currentDots) =>
        currentDots.some(
          (currentLevel, index) =>
            Math.abs(currentLevel - restingDots[index]) > dotUpdateThreshold,
        )
          ? restingDots
          : currentDots,
      );
      return;
    }

    let frameId = 0;

    const updateWaveform = () => {
      const nextLevels =
        state === 'speaking'
          ? buildWaveformDots(
              getOutputByteFrequencyData?.(),
              getOutputVolume?.() ?? 0,
              performance.now(),
            )
          : buildWaveformDots(
              getInputByteFrequencyData?.(),
              getInputVolume?.() ?? 0,
              performance.now(),
            );
      const smoothedLevels = nextLevels.map((level, index) => {
        const previousLevel = waveformDotsRef.current[index] ?? restingDots[index];
        const distanceFromCenter = Math.abs(index - dotCenterIndex);
        const smoothingFactor =
          level > previousLevel
            ? 0.5 - distanceFromCenter * 0.05
            : 0.24 - distanceFromCenter * 0.02;

        return (
          previousLevel +
          (level - previousLevel) * clamp(smoothingFactor, 0.12, 0.54)
        );
      });

      waveformDotsRef.current = smoothedLevels;
      setWaveformDots((currentDots) =>
        currentDots.some(
          (currentLevel, index) =>
            Math.abs(currentLevel - smoothedLevels[index]) > dotUpdateThreshold,
        )
          ? smoothedLevels
          : currentDots,
      );
      frameId = window.requestAnimationFrame(updateWaveform);
    };

    frameId = window.requestAnimationFrame(updateWaveform);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [
    getInputByteFrequencyData,
    getInputVolume,
    getOutputByteFrequencyData,
    getOutputVolume,
    state,
  ]);

  return (
    <button
      aria-label={label}
      className={`voice-orb voice-orb--${state}`}
      disabled={disabled}
      type="button"
      onClick={onPress}
    >
      <span className="voice-orb__halo voice-orb__halo--outer" />
      <span className="voice-orb__halo voice-orb__halo--inner" />
      <span className="voice-orb__core">
        <WaveformGlyph
          levels={isWaveformState ? waveformDots : idleDots}
          staticDots={!isWaveformState}
        />
      </span>
    </button>
  );
}
