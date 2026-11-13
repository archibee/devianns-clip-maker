import { expect, it } from 'vitest';
import { imageRect, previewSize } from '../src/render/compositor';

it('contain/cover의 좌표는 렌더 해상도에 비례한다', () => {
  const t = { fit: 'contain' as const, scale: 1, x: 0, y: 0 };
  const full = imageRect(1000, 1000, 1920, 1080, t);
  const half = imageRect(1000, 1000, 960, 540, t);
  expect(full).toEqual({ x: 420, y: 0, width: 1080, height: 1080 });
  expect(half.width).toBe(full.width / 2);
  expect(half.x).toBe(full.x / 2);
  expect(imageRect(1000, 1000, 1920, 1080, { ...t, fit: 'cover' }).height).toBe(1920);
  expect(previewSize('16:9')).toEqual({ width: 960, height: 540 });
});
