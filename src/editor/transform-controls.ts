type Rect = { x: number; y: number; width: number; height: number };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** 영상 좌표는 그대로 두고 마우스로 잡을 조작점의 표시 범위만 확보한다. */
export function controlRect(rect: Rect, bounds: Rect, minWidth: number, minHeight: number): Rect {
  function axis(start: number, length: number, low: number, available: number, minimum: number) {
    const high = low + available,
      span = Math.min(minimum, available);
    let first = clamp(start, low, high),
      last = clamp(start + length, low, high);
    if (last - first < span) {
      first = clamp((first + last - span) / 2, low, high - span);
      last = first + span;
    }
    return { start: first, length: last - first };
  }
  const x = axis(rect.x, rect.width, bounds.x, bounds.width, minWidth);
  const y = axis(rect.y, rect.height, bounds.y, bounds.height, minHeight);
  return { x: x.start, y: y.start, width: x.length, height: y.length };
}
