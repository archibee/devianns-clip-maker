import { clipLane, cueLane, type Project } from './model';
export type SelectableBlock = { id: string; lane: number; kind: string };
export function selectLineBlocks<T extends SelectableBlock>(
  blocks: T[],
  lane: number,
  selectedIds: string[],
): T[] {
  const line = blocks.filter((block) => block.lane === lane),
    selected = new Set(selectedIds);
  const kinds = new Set(line.filter((block) => selected.has(block.id)).map((block) => block.kind));
  return kinds.size === 1 ? line.filter((block) => kinds.has(block.kind)) : line;
}
/** 새 블록 종류는 이 목록 어댑터에 연결한다. 선택 규칙은 종류 이름에 의존하지 않는다. */
export function timelineBlocks(project: Project): SelectableBlock[] {
  return [
    ...project.clips.map((c) => ({ id: c.id, lane: clipLane(c), kind: 'video' })),
    ...project.subtitles.map((c) => ({ id: c.id, lane: cueLane(c), kind: 'subtitle' })),
  ];
}
