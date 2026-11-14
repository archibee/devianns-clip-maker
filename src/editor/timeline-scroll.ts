/** 좌표는 콘텐츠의 왼쪽부터 계산한다. 현재 보이는 폭을 단위로 페이지를 넘긴다. */
export function followPlayhead(
  x: number,
  left: number,
  viewport: number,
  content: number,
  gutter = 72,
) {
  if (viewport <= gutter + 16) return left;
  const page = viewport - gutter - 16,
    max = Math.max(0, content - viewport);
  let next = left;
  if (x > left + viewport - 16) next = left + Math.ceil((x - (left + viewport - 16)) / page) * page;
  else if (x < left + gutter) next = Math.floor(Math.max(0, x - gutter) / page) * page;
  return Math.max(0, Math.min(max, next));
}
