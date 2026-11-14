import { mediaLayout, type Project } from '../../../src/project/model';
import type { MediaRegistry } from '../../../src/media/registry';

export function autoCutUnavailable(
  project: Project,
  registry: MediaRegistry,
  selectedIds: string[] = [],
): string | undefined {
  if (!project.clips.length) return '타임라인에 영상을 추가하세요.';
  if (selectedIds.length !== 1 || !project.clips.some((c) => c.id === selectedIds[0]))
    return 'Auto Cut할 영상 블록을 하나만 선택하세요.';
  if (
    !globalThis.isSecureContext ||
    typeof globalThis.AudioDecoder !== 'function' ||
    typeof globalThis.Worker !== 'function' ||
    typeof globalThis.WebAssembly !== 'object'
  )
    return '음성 분석은 HTTPS 또는 localhost의 WebCodecs/WASM 지원 브라우저에서 사용할 수 있습니다.';
  const rows = mediaLayout(project).filter((r) => r.clip.id === selectedIds[0]);
  if (rows.some((r) => !registry.has(r.clip.assetId))) return '누락된 원본을 먼저 다시 연결하세요.';
  if (!rows.some((r) => project.assets.find((a) => a.id === r.clip.assetId)?.hasAudio))
    return '원본 오디오가 있는 영상을 타임라인에 추가하세요.';
  return undefined;
}
