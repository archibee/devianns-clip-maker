import { canEncodeAudio, canEncodeVideo, type AudioCodec, type VideoCodec } from 'mediabunny';
import {
  dimensions,
  duration,
  hasTimelineAudio,
  type ExportSettings,
  type Project,
} from '../project/model';

// 설치된 Mediabunny BufferTarget의 ARRAY_BUFFER_MAX_SIZE와 동일하다.
// 기기 RAM/브라우저의 실제 할당 가능량은 이 값보다 작을 수 있다.
export const MEMORY_LIMIT = 2 ** 32;
export const MEMORY_LIMIT_MIB = MEMORY_LIMIT / 1024 / 1024;
export function exportSizeIssue(bytes:number,direct:boolean):string|undefined {
  if(!Number.isSafeInteger(bytes)||bytes<0)return '예상 출력 용량이 지원 가능한 바이트 계산 범위를 초과합니다. 출력 설정을 낮추세요.';
  if(!direct&&bytes>MEMORY_LIMIT)return `예상 출력 용량이 메모리 다운로드 한도 ${MEMORY_LIMIT_MIB}MiB를 초과합니다. 파일에 직접 저장을 선택하세요. 직접 저장에는 앱의 고정 용량 상한이 없습니다.`;
  return undefined;
}
export function exportFailureMessage(error:unknown){
  const message=error instanceof Error?error.message:String(error);
  return /ArrayBuffer|array buffer|allocation|out of memory|exceeded maximum size/i.test(message)
    ?'브라우저가 출력 버퍼를 할당하지 못했습니다. 파일에 직접 저장을 사용하거나 출력 해상도/FPS를 낮추세요.'
    :message;
}
export const videoBitrate = (settings: ExportSettings) =>
  ((settings.resolution === 1080
    ? 8_000_000
    : settings.resolution === 720
      ? 5_000_000
      : 2_500_000) *
    settings.fps) /
  30;
export const hasAudio = hasTimelineAudio;
export function estimateBytes(p: Project, settings: ExportSettings) {
  return Math.ceil(
    (((videoBitrate(settings) + (hasAudio(p) ? 128_000 : 0)) * duration(p)) / 1_000_000 / 8) * 1.2,
  );
}
export type Support = {
  supported: boolean;
  reason: string;
  videoCodec?: VideoCodec;
  audioCodec?: AudioCodec;
};
export async function checkSupport(project: Project, settings: ExportSettings): Promise<Support> {
  if (
    ![1080, 720, 480].includes(settings.resolution) ||
    ![30, 45, 60].includes(settings.fps) ||
    !['mp4', 'webm'].includes(settings.format)
  )
    return { supported: false, reason: '잘못된 출력 설정입니다.' };
  if (
    !globalThis.isSecureContext ||
    typeof globalThis.VideoEncoder !== 'function' ||
    typeof globalThis.OffscreenCanvas !== 'function'
  )
    return {
      supported: false,
      reason: 'HTTPS/localhost에서 WebCodecs·OffscreenCanvas 지원 브라우저로 여세요.',
    };
  const size = dimensions(project.aspect, settings.resolution);
  const videoCandidates: VideoCodec[] = settings.format === 'mp4' ? ['avc'] : ['vp9', 'vp8'];
  try {
    const audioCodec: AudioCodec = settings.format === 'mp4' ? 'aac' : 'opus';
    if (
      hasAudio(project) &&
      !(await canEncodeAudio(audioCodec, {
        numberOfChannels: 2,
        sampleRate: 48_000,
        bitrate: 128_000,
      }))
    ) {
      return {
        supported: false,
        reason: `${audioCodec.toUpperCase()} 오디오 인코딩 미지원. 다른 형식 또는 브라우저를 선택하세요.`,
      };
    }
    for (const videoCodec of videoCandidates) {
      if (
        await canEncodeVideo(videoCodec, {
          ...size,
          frameRate: settings.fps,
          bitrate: videoBitrate(settings),
        })
      ) {
        return {
          supported: true,
          reason: `${videoCodec.toUpperCase()}${hasAudio(project) ? ` + ${audioCodec.toUpperCase()}` : ' · 무음'} 출력 가능`,
          videoCodec,
          audioCodec,
        };
      }
    }
    return {
      supported: false,
      reason: '선택한 크기·FPS의 영상 인코딩을 지원하지 않습니다. 설정이나 형식을 바꾸세요.',
    };
  } catch (e) {
    return {
      supported: false,
      reason: `지원 검사 실패: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
