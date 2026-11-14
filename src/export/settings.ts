import { canEncodeAudio, canEncodeVideo, type AudioCodec, type VideoCodec } from 'mediabunny';
import {
  dimensions,
  duration,
  hasTimelineAudio,
  type ExportSettings,
  type Project,
} from '../project/model';

export const MEMORY_LIMIT = 256 * 1024 * 1024;
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
