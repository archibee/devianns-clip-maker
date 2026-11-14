import { layout, clipLane, cueLane, laneCount, type Project } from './model';

function ranges(project: Project) {
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
  const all = ranges(project),
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
  const all = ranges(project),
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
