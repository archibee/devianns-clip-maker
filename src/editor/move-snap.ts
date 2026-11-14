import { imageRect } from '../render/compositor';
import type { Transform } from '../project/model';
export const MOVE_GRID = [0, 0.25, 0.5, 0.75, 1];
export function snapMoveCenter(
  transform: Transform,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  dx: number,
  dy: number,
  toleranceX: number,
  toleranceY: number,
) {
  const clamp = (n: number) => Math.max(-1, Math.min(1, n));
  const next = {
    ...transform,
    x: clamp(transform.x + dx / width),
    y: clamp(transform.y + dy / height),
  };
  const crop = next.crop ?? { width: 1, height: 1 };
  const rect = imageRect(sourceWidth * crop.width, sourceHeight * crop.height, width, height, next);
  const axis = (center: number, size: number, tolerance: number) =>
    MOVE_GRID.filter((value) => Math.abs(value * size - center) <= tolerance).sort(
      (a, b) => Math.abs(a * size - center) - Math.abs(b * size - center),
    )[0];
  const x = axis(rect.x + rect.width / 2, width, toleranceX),
    y = axis(rect.y + rect.height / 2, height, toleranceY);
  if (x !== undefined) next.x = clamp(next.x + (x * width - rect.x - rect.width / 2) / width);
  if (y !== undefined) next.y = clamp(next.y + (y * height - rect.y - rect.height / 2) / height);
  return { transform: next, guides: { x, y } };
}
