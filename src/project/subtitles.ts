import { duration, cueLane, clipLane, layout, type Cue, type Project } from './model';

export function validateCueRange(project: Project, cue: Cue) {
  if (
    !Number.isSafeInteger(cue.startUs) ||
    !Number.isSafeInteger(cue.endUs) ||
    cue.startUs < 0 ||
    cue.endUs <= cue.startUs ||
    cue.endUs > Number.MAX_SAFE_INTEGER
  ) {
    throw new Error('자막 시간을 영상 범위 안에서 시작 < 끝으로 지정하세요.');
  }
  if (
    project.subtitles.some(
      (other) =>
        other.id !== cue.id &&
        cueLane(other) === cueLane(cue) &&
        cue.startUs < other.endUs &&
        cue.endUs > other.startUs,
    )
  ) {
    throw new Error('자막이 다른 자막과 겹칩니다. 빈 구간이나 인접 경계로 옮기세요.');
  }
  if (
    layout(project).some(
      (r) => clipLane(r.clip) === cueLane(cue) && cue.startUs < r.endUs && cue.endUs > r.startUs,
    )
  )
    throw new Error('같은 행의 영상과 겹칩니다. 빈 위치나 다른 행을 선택하세요.');
}

export type CueGesture = 'move' | 'start' | 'end';
/** 후보만 계산한다. 드래그 한 번을 하나의 명령으로 확정하고, 충돌은 명령에서 거부한다. */
export function cueDragRange(
  project: Project,
  cue: Cue,
  mode: CueGesture,
  deltaUs: number,
  snapUs = 0,
) {
  const end = duration(project);
  const length = cue.endUs - cue.startUs;
  const minimum = Math.min(length, Math.round(1_000_000 / project.fps));
  const edges = [
    0,
    end,
    ...project.subtitles.filter((c) => c.id !== cue.id).flatMap((c) => [c.startUs, c.endUs]),
  ];
  const snapped = (value: number, candidates: number[]) => {
    let result = value;
    let distance = snapUs + 1;
    for (const candidate of candidates) {
      const difference = Math.abs(candidate - value);
      if (difference <= snapUs && difference < distance) {
        result = candidate;
        distance = difference;
      }
    }
    return result;
  };
  if (mode === 'move') {
    const start = snapped(
      cue.startUs + deltaUs,
      edges.flatMap((edge) => [edge, edge - length]),
    );
    const startUs = Math.round(Math.max(0, Math.min(Number.MAX_SAFE_INTEGER - length, start)));
    return { startUs, endUs: startUs + length };
  }
  if (mode === 'start')
    return {
      startUs: Math.round(
        Math.max(0, Math.min(cue.endUs - minimum, snapped(cue.startUs + deltaUs, edges))),
      ),
      endUs: cue.endUs,
    };
  return {
    startUs: cue.startUs,
    endUs: Math.round(
      Math.min(
        Number.MAX_SAFE_INTEGER,
        Math.max(cue.startUs + minimum, snapped(cue.endUs + deltaUs, edges)),
      ),
    ),
  };
}
