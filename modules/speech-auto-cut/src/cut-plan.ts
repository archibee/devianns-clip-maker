import { mediaLayout, newId, type Clip, type Project } from '../../../src/project/model';
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
export function buildProject(project: Project, keep: Range[], dropSubtitles: boolean): Project {
  if (project.subtitles.length && !dropSubtitles)
    throw new Error(
      '기존 자막을 제외하는 데 동의해야 적용할 수 있습니다. 원래 자막은 실행 취소로 복구할 수 있습니다.',
    );
  const ranges = union(keep);
  const clips: Clip[] = [];
  let cursor = 0;
  for (const row of mediaLayout(project))
    for (const range of ranges) {
      const start = Math.max(row.startUs, range.startUs),
        end = Math.min(row.endUs, range.endUs);
      if (end <= start) continue;
      clips.push({
        id: newId(),
        assetId: row.clip.assetId,
        inUs: row.clip.inUs + start - row.startUs,
        outUs: row.clip.inUs + end - row.startUs,
        startUs: cursor,
        transform: structuredClone(row.clip.transform),
      });
      cursor += end - start;
      if (clips.length > 10000)
        throw new Error(
          '생성되는 컷이 너무 많습니다. 보존 강도 또는 최소 삭제 길이를 늘려 다시 분석하세요.',
        );
    }
  if (!clips.length) throw new Error('남길 영상이 없습니다. 후보를 보존하거나 다시 분석하세요.');
  return parseProject(
    JSON.stringify({ ...project, clips, subtitles: dropSubtitles ? [] : project.subtitles }),
  );
}
