import { layout, clipLane, cueLane, laneCount, type Project } from './model';

export function blockRanges(project: Project) {
  return [
    ...layout(project).map((r) => ({
      id: r.clip.id,
      lane: clipLane(r.clip),
      startUs: r.startUs,
      endUs: r.endUs,
    })),
    ...project.subtitles.map((c) => ({
      id: c.id,
      lane: cueLane(c),
      startUs: c.startUs,
      endUs: c.endUs,
    })),
  ];
}
export function validateBlockPlacement(
  project: Project,
  id: string,
  lane: number,
  startUs: number,
) {
  const all = blockRanges(project),
    block = all.find((b) => b.id === id);
  if (!block) throw new Error('이동할 블록이 없습니다.');
  const endUs = startUs + block.endUs - block.startUs;
  if (
    !Number.isInteger(lane) ||
    lane < 0 ||
    lane >= laneCount(project) ||
    !Number.isSafeInteger(startUs) ||
    startUs < 0 ||
    !Number.isSafeInteger(endUs)
  )
    throw new Error('블록 위치가 올바르지 않습니다.');
  if (all.some((b) => b.id !== id && b.lane === lane && startUs < b.endUs && endUs > b.startUs))
    throw new Error('같은 라인에 블록이 겹칩니다. 빈 위치나 다른 라인으로 옮기세요.');
}
export function snapBlockStart(
  project: Project,
  id: string,
  lane: number,
  startUs: number,
  snapUs: number,
) {
  const all = blockRanges(project),
    block = all.find((b) => b.id === id);
  if (!block) return startUs;
  const length = block.endUs - block.startUs,
    max = Number.MAX_SAFE_INTEGER - length;
  const desired = Math.round(Math.max(0, Math.min(max, startUs)));
  let result = desired,
    distance = snapUs + 1;
  for (const edge of [
    0,
    ...all.filter((b) => b.id !== id && b.lane === lane).flatMap((b) => [b.startUs, b.endUs]),
  ])
    for (const candidate of [edge, edge - length]) {
      const difference = Math.abs(candidate - desired);
      if (candidate >= 0 && candidate <= max && difference <= snapUs && difference < distance) {
        result = candidate;
        distance = difference;
      }
    }
  return result;
}
export function dragGroup(project: Project, selected: string[], anchor: string) {
  const blocks = blockRanges(project)
    .filter((b) => selected.includes(b.id))
    .sort((a, b) => a.startUs - b.startUs);
  return blocks.length > 1 &&
    blocks.some((b) => b.id === anchor) &&
    blocks.every((b, i) => b.lane === blocks[0].lane && (!i || b.startUs === blocks[i - 1].endUs))
    ? blocks.map((b) => b.id)
    : [anchor];
}
export function moveGroup(project: Project, ids: string[]) {
  const blocks = blockRanges(project)
    .filter((b) => ids.includes(b.id))
    .sort((a, b) => a.startUs - b.startUs);
  if (
    !blocks.length ||
    blocks.length !== new Set(ids).size ||
    blocks.some((b, i) => b.lane !== blocks[0].lane || (i && b.startUs !== blocks[i - 1].endUs))
  )
    throw new Error('같은 라인의 연속 블록만 함께 이동할 수 있습니다.');
  return { blocks, startUs: blocks[0].startUs, endUs: blocks.at(-1)!.endUs, lane: blocks[0].lane };
}
export function resolveMoveStart(
  project: Project,
  ids: string[],
  lane: number,
  startUs: number,
  snapUs = 0,
) {
  const group = moveGroup(project, ids),
    span = group.endUs - group.startUs,
    max = Number.MAX_SAFE_INTEGER - span;
  if (
    !Number.isInteger(lane) ||
    lane < 0 ||
    lane >= laneCount(project) ||
    !Number.isFinite(startUs)
  )
    throw new Error('블록 위치가 올바르지 않습니다.');
  const desired = Math.round(Math.max(0, Math.min(max, startUs)));
  const obstacles = blockRanges(project).filter((b) => !ids.includes(b.id) && b.lane === lane);
  const fits = (start: number) =>
    start >= 0 &&
    start <= max &&
    !obstacles.some((b) => start < b.endUs && start + span > b.startUs);
  const candidates = [0, ...obstacles.flatMap((b) => [b.endUs, b.startUs - span])]
    .filter(fits)
    .sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired) || a - b);
  if (fits(desired))
    return candidates.length && Math.abs(candidates[0] - desired) <= snapUs
      ? candidates[0]
      : desired;
  if (!candidates.length) throw new Error('블록을 놓을 빈 구간이 없습니다.');
  return candidates[0];
}
