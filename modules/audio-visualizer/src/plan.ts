import {
  clipLane,
  laneCount,
  mediaLayout,
  newId,
  type Cue,
  type Project,
} from '../../../src/project/model';
import { parseProject } from '../../../src/project/validation';
import type { MediaRegistry } from '../../../src/media/registry';
export const visualizerScope = (project: Project, lane: number) =>
  mediaLayout(project).filter(
    (row) =>
      clipLane(row.clip) === lane &&
      !row.clip.muted &&
      project.assets.find((a) => a.id === row.clip.assetId)?.hasAudio,
  );
export function visualizerUnavailable(project: Project, lane: number, registry: MediaRegistry) {
  if (typeof Worker !== 'function' || typeof AudioDecoder !== 'function')
    return '오디오 분석을 지원하는 브라우저가 필요합니다.';
  if (laneCount(project) >= 32) return '최대 32라인입니다. 라인을 하나 삭제하세요.';
  const rows = visualizerScope(project, lane);
  if (!rows.length) return '선택 라인에 음소거되지 않은 오디오 포함 영상이 필요합니다.';
  if (rows.some((row) => !registry.has(row.clip.assetId))) return '누락된 원본을 다시 연결하세요.';
  return undefined;
}
export function appendVisualizer(project: Project, cue: Cue): Project {
  if (!cue.visualizer) throw new Error('먼저 오디오를 분석하세요.');
  const lane = laneCount(project);
  if (lane >= 32) throw new Error('최대 32라인까지 추가할 수 있습니다.');
  return parseProject(
    JSON.stringify(
      {
        ...project,
        laneCount: lane + 1,
        subtitles: [...project.subtitles, { ...cue, id: newId(), lane }],
      },
      null,
      2,
    ),
  );
}
