import {
  clipLane,
  laneCount,
  layout,
  mediaLayout,
  newId,
  type Project,
} from '../../../src/project/model';
import type { MediaRegistry } from '../../../src/media/registry';
import { parseProject } from '../../../src/project/validation';
import { union } from '../../speech-auto-cut/src/cut-plan';
import type { Range, Options } from '../../speech-auto-cut/src/contracts';

// Detection sensitivity only: thresholds advance in equal steps; no editing margins.
export const CAPTION_PRESETS = [
  { label: '매우 높음', positive: 0.3, negative: 0.15 },
  { label: '높음', positive: 0.4, negative: 0.25 },
  { label: '중간', positive: 0.5, negative: 0.35 },
  { label: '낮음', positive: 0.6, negative: 0.45 },
  { label: '매우 낮음', positive: 0.7, negative: 0.55 },
] as const;
export function captionOptions(index: number): Options {
  return {
    ...CAPTION_PRESETS[index],
    beforeMs: 0,
    afterMs: 0,
    silenceMs: 100,
    minSpeechMs: 0,
    minRemoveMs: 100,
  };
}
/** Expand compound clips to retain their exact source and absolute timeline positions. */
export function captionScope(project: Project, lane: number): Project {
  return {
    ...project,
    clips: mediaLayout(project)
      .filter(
        (row) =>
          clipLane(row.clip) === lane &&
          !row.clip.muted &&
          project.assets.find((a) => a.id === row.clip.assetId)?.hasAudio,
      )
      .map((row) => ({ ...row.clip, startUs: row.startUs })),
    subtitles: [],
  };
}
export function captionUnavailable(
  project: Project,
  registry: MediaRegistry,
  lane: number,
): string | undefined {
  if (
    !globalThis.isSecureContext ||
    typeof globalThis.AudioDecoder !== 'function' ||
    typeof globalThis.Worker !== 'function' ||
    typeof globalThis.WebAssembly !== 'object'
  )
    return '음성 분석은 HTTPS 또는 localhost의 WebCodecs/WASM 지원 브라우저에서 사용할 수 있습니다.';
  const scope = captionScope(project, lane);
  if (!scope.clips.length) return '선택한 라인에 음소거되지 않은 오디오 포함 영상이 필요합니다.';
  if (scope.clips.some((c) => !registry.has(c.assetId)))
    return '누락된 원본을 먼저 다시 연결하세요.';
  if (laneCount(project) >= 32)
    return '새 자막 라인을 추가하려면 라인을 하나 삭제하세요. 최대 32라인입니다.';
  return undefined;
}
export function buildCaptions(project: Project, lane: number, ranges: Range[]): Project {
  // Clip to source blocks: never generate captions over gaps in the chosen line.
  const rows = layout(captionScope(project, lane));
  const bounded = union(ranges).flatMap((range) =>
    rows.flatMap((row) => {
      const startUs = Math.max(range.startUs, row.startUs),
        endUs = Math.min(range.endUs, row.endUs);
      return endUs > startUs ? [{ startUs, endUs }] : [];
    }),
  );
  const intervals = union(bounded);
  if (!intervals.length) return project;
  if (intervals.length > 10000)
    throw new Error('생성할 자막이 너무 많습니다. 분석 강도를 조절하세요.');
  const targetLane = laneCount(project);
  if (targetLane >= 32) throw new Error('최대 32라인까지 추가할 수 있습니다.');
  return parseProject(
    JSON.stringify({
      ...project,
      laneCount: targetLane + 1,
      subtitles: [
        ...project.subtitles,
        ...intervals.map((range) => ({
          ...range,
          lane: targetLane,
          id: newId(),
          text: '',
          size: 0.05,
          color: '#ffffff',
          background: '#000000',
          x: 0.5,
          y: 0.9,
        })),
      ],
    }),
  );
}
