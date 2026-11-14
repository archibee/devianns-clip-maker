import {
  mediaLayout,
  layout,
  newId,
  clipLane,
  laneCount,
  type Clip,
  type Project,
} from '../../../src/project/model';
import { parseProject } from '../../../src/project/validation';
import type { Range } from './contracts';

export function union(ranges: Range[]): Range[] {
  const result: Range[] = [];
  for (const r of [...ranges].sort((a, b) => a.startUs - b.startUs)) {
    if (
      !Number.isSafeInteger(r.startUs) ||
      !Number.isSafeInteger(r.endUs) ||
      r.startUs < 0 ||
      r.endUs <= r.startUs
    )
      throw new Error('분석 구간 시간이 올바르지 않습니다.');
    const last = result.at(-1);
    if (last && r.startUs <= last.endUs) last.endUs = Math.max(last.endUs, r.endUs);
    else result.push({ ...r });
  }
  return result;
}
export function removals(project: Project, keep: Range[]): Range[] {
  const result: Range[] = [];
  const sorted = union(keep);
  for (const row of mediaLayout(project)) {
    let cursor = row.startUs;
    for (const r of sorted) {
      if (r.endUs <= cursor || r.startUs >= row.endUs) continue;
      if (r.startUs > cursor)
        result.push({ startUs: cursor, endUs: Math.min(row.endUs, r.startUs) });
      cursor = Math.max(cursor, Math.min(row.endUs, r.endUs));
    }
    if (cursor < row.endUs) result.push({ startUs: cursor, endUs: row.endUs });
  }
  return union(result);
}
/** 분석과 모달 미리보기는 선택 블록 시작을 0초로 한 독립 범위를 사용한다. */
export function selectionProject(project: Project, id: string): Project {
  const row = layout(project).find((r) => r.clip.id === id);
  if (!row) throw new Error('Auto Cut 대상 영상 블록이 없습니다.');
  return { ...project, clips: [{ ...row.clip, startUs: 0 }], subtitles: [] };
}
export function buildProject(
  project: Project,
  targetId: string,
  keep: Range[],
  generateSubtitles = false,
): Project {
  const target = layout(project).find((r) => r.clip.id === targetId);
  if (!target) throw new Error('Auto Cut 대상 영상 블록이 없습니다.');
  const scope = selectionProject(project, targetId);
  const ranges = union(keep),
    videoLane = clipLane(target.clip),
    subtitleLane = laneCount(project);
  if (generateSubtitles && subtitleLane >= 32)
    throw new Error(
      '새 자막 라인을 추가할 수 없습니다. 최대 32라인입니다. 자동 자막 생성을 끄거나 라인을 삭제하세요.',
    );
  const clips: Clip[] = [];
  let cursor = target.startUs;
  for (const row of mediaLayout(scope))
    for (const range of ranges) {
      const start = Math.max(row.startUs, range.startUs),
        end = Math.min(row.endUs, range.endUs);
      if (end <= start) continue;
      clips.push({
        lane: videoLane,
        id: newId(),
        assetId: row.clip.assetId,
        inUs: row.clip.inUs + start - row.startUs,
        outUs: row.clip.inUs + end - row.startUs,
        startUs: cursor,
        transform: structuredClone(row.clip.transform),
      });
      cursor += end - start;
      if (clips.length > 10000)
        throw new Error('생성되는 컷이 너무 많습니다. 분석 설정을 조절하세요.');
    }
  if (!clips.length) throw new Error('남길 영상이 없습니다. 후보를 보존하거나 다시 분석하세요.');
  const subtitles = generateSubtitles
    ? clips.map((clip) => ({
        lane: subtitleLane,
        id: newId(),
        startUs: clip.startUs!,
        endUs: clip.startUs! + clip.outUs - clip.inUs,
        text: '',
        size: 0.05,
        color: '#ffffff',
        background: '#000000',
        x: 0.5,
        y: 0.9,
      }))
    : [];
  return parseProject(
    JSON.stringify({
      ...project,
      laneCount: subtitleLane + (generateSubtitles ? 1 : 0),
      clips: layout(project).flatMap((r) =>
        r.clip.id === targetId ? clips : [{ ...r.clip, startUs: r.startUs }],
      ),
      subtitles: [...project.subtitles, ...subtitles],
    }),
  );
}
