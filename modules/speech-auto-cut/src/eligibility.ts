import { mediaLayout, clipLane, type Project } from '../../../src/project/model';
import type { MediaRegistry } from '../../../src/media/registry';

export function autoCutUnavailable(project: Project, registry: MediaRegistry): string | undefined {
  if (!project.clips.length) return '타임라인에 영상을 추가하세요.';
  if (new Set(project.clips.map(clipLane)).size > 1)
    return 'Auto Cut은 영상이 한 행에 있을 때 사용할 수 있습니다. 여러 영상 행의 동시 분석은 지원하지 않습니다.';
  if (
    !globalThis.isSecureContext ||
    typeof globalThis.AudioDecoder !== 'function' ||
    typeof globalThis.Worker !== 'function' ||
    typeof globalThis.WebAssembly !== 'object'
  )
    return '음성 분석은 HTTPS 또는 localhost의 WebCodecs/WASM 지원 브라우저에서 사용할 수 있습니다.';
  const rows = mediaLayout(project);
  if (rows.some((r) => !registry.has(r.clip.assetId))) return '누락된 원본을 먼저 다시 연결하세요.';
  if (!rows.some((r) => project.assets.find((a) => a.id === r.clip.assetId)?.hasAudio))
    return '원본 오디오가 있는 영상을 타임라인에 추가하세요.';
  return undefined;
}
