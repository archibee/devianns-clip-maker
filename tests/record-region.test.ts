import { expect, it } from 'vitest';
import {
  containRect,
  FULL_REGION,
  recordingSize,
  validRegion,
} from '../modules/screen-recorder/src/geometry';
it('caps output size with the selected aspect ratio and no upscale', () => {
  expect(recordingSize(3840, 2160, FULL_REGION)).toEqual({ width: 1920, height: 1080 });
  expect(recordingSize(640, 360, { x: 0, y: 0, width: 0.5, height: 1 })).toEqual({
    width: 320,
    height: 360,
  });
  expect(recordingSize(1000, 2000, FULL_REGION)).toEqual({ width: 540, height: 1080 });
});
it('preserves aspect ratio when the source changes instead of stretching', () => {
  expect(containRect(400, 300, 1920, 1080)).toEqual({ x: 240, y: 0, width: 1440, height: 1080 });
  const result = containRect(1920, 1080, 1000, 1000);
  expect(result.x).toBeCloseTo(0);
  expect(result.y).toBeCloseTo(218.75);
  expect(result.width).toBeCloseTo(1000);
  expect(result.height).toBeCloseTo(562.5);
});
it('rejects empty, out-of-bounds and nonfinite selections', () => {
  for (const region of [
    { x: 0, y: 0, width: 0, height: 1 },
    { x: 0.9, y: 0, width: 0.3, height: 0.5 },
    { x: NaN, y: 0, width: 1, height: 1 },
  ]) {
    expect(validRegion(region)).toBe(false);
    expect(() => recordingSize(640, 360, region)).toThrow();
  }
});
