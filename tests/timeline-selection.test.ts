import { expect, it } from 'vitest';
import { selectLineBlocks } from '../src/project/timeline-selection';
const blocks = [
  { id: 'v1', lane: 0, kind: 'video' },
  { id: 'v2', lane: 0, kind: 'video' },
  { id: 's1', lane: 0, kind: 'subtitle' },
  { id: 's2', lane: 0, kind: 'subtitle' },
  { id: 'other', lane: 1, kind: 'video' },
];
it('활성 라인의 같은 종류만 선택한다', () => {
  expect(selectLineBlocks(blocks, 0, ['v1']).map((b) => b.id)).toEqual(['v1', 'v2']);
  expect(selectLineBlocks(blocks, 0, ['s1']).map((b) => b.id)).toEqual(['s1', 's2']);
});
it('무선택/다른 라인 선택/혼합 선택은 활성 라인 전체를 선택한다', () => {
  const ids = ['v1', 'v2', 's1', 's2'];
  for (const selection of [[], ['other'], ['v1', 's1'], ids])
    expect(selectLineBlocks(blocks, 0, selection).map((b) => b.id)).toEqual(ids);
  expect(selectLineBlocks(blocks, 2, [])).toEqual([]);
});
it('새로운 종류도 전체 선택과 종류별 선택 규칙에 자동 포함된다', () => {
  const extended = [
    ...blocks,
    { id: 'shape1', lane: 0, kind: 'shape' },
    { id: 'shape2', lane: 0, kind: 'shape' },
  ];
  expect(selectLineBlocks(extended, 0, [])).toHaveLength(6);
  expect(selectLineBlocks(extended, 0, ['shape1']).map((b) => b.id)).toEqual(['shape1', 'shape2']);
});
