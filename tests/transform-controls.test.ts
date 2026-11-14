import { expect, it } from 'vitest';
import { controlRect } from '../src/editor/transform-controls';

it('세로 미리보기 밖의 사각형도 편집 공간 안에 조작점을 유지한다', () => {
  const bounds = { x: -200, y: 0, width: 700, height: 960 };
  const rect = { x: -1000, y: -800, width: 2400, height: 2500 };
  expect(controlRect(rect, bounds, 32, 32)).toEqual(bounds);
  expect(rect).toEqual({ x: -1000, y: -800, width: 2400, height: 2500 });
});
it('완전히 밖으로 이동하거나 아주 작아져도 조작점 간격을 확보한다', () => {
  const bounds = { x: 8, y: 8, width: 284, height: 524 };
  for (const rect of [
    { x: 1000, y: 2000, width: 200, height: 300 },
    { x: -2000, y: -3000, width: 20, height: 30 },
    { x: 140, y: 260, width: 1, height: 1 },
  ]) {
    const result = controlRect(rect, bounds, 32, 32);
    expect(result.x).toBeGreaterThanOrEqual(bounds.x);
    expect(result.y).toBeGreaterThanOrEqual(bounds.y);
    expect(result.x + result.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    expect(result.y + result.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    expect(result.width).toBeGreaterThanOrEqual(32);
    expect(result.height).toBeGreaterThanOrEqual(32);
  }
});
it('안에 있는 정상 사각형의 조작점은 원래 테두리를 따른다', () => {
  const rect = { x: 20, y: 30, width: 100, height: 200 };
  expect(controlRect(rect, { x: 0, y: 0, width: 300, height: 500 }, 32, 32)).toEqual(rect);
});
