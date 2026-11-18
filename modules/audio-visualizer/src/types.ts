/** Compact, JSON-safe spectrum. No PCM, frames or source files are retained. */
export type VisualizerData = {
  version: 1;
  bands: number;
  stepUs: number;
  offsetUs: number;
  values: number[];
  width: number;
  gain: number;
  showTime: boolean;
};
export const MAX_VISUALIZER_VALUES = 120_000;
export function validVisualizer(value: unknown): value is VisualizerData {
  if (!value || typeof value !== 'object') return false;
  const v = value as VisualizerData;
  return (
    v.version === 1 &&
    v.bands === 32 &&
    Number.isSafeInteger(v.stepUs) &&
    v.stepUs >= 50_000 &&
    Number.isSafeInteger(v.offsetUs) &&
    v.offsetUs >= 0 &&
    Array.isArray(v.values) &&
    v.values.length >= v.bands &&
    v.values.length <= MAX_VISUALIZER_VALUES &&
    v.values.length % v.bands === 0 &&
    v.values.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
    Number.isFinite(v.width) &&
    v.width >= 0.1 &&
    v.width <= 0.95 &&
    Number.isFinite(v.gain) &&
    v.gain >= 0.25 &&
    v.gain <= 4 &&
    typeof v.showTime === 'boolean'
  );
}
