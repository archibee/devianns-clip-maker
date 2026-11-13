import {
  MP4,
  QTFF,
  MATROSKA,
  WEBM,
  BlobSource,
  Input,
  type InputAudioTrack,
  type InputVideoTrack,
} from 'mediabunny';
import { newId, toUs, type Asset } from '../project/model';

export type OpenMedia = {
  input: Input;
  video: InputVideoTrack;
  audio: InputAudioTrack | null;
  origin: number;
  asset: Asset;
};
export async function openMedia(file: File, id: string = newId()): Promise<OpenMedia> {
  if (!globalThis.isSecureContext || typeof globalThis.VideoDecoder !== 'function')
    throw new Error('HTTPS 또는 localhost의 WebCodecs 지원 브라우저가 필요합니다.');
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, MATROSKA, WEBM] });
  try {
    const video = (await input.getVideoTracks())[0];
    const audio = (await input.getAudioTracks())[0] ?? null;
    if (!video) throw new Error('영상 트랙이 없는 파일입니다.');
    if (!(await video.canDecode()))
      throw new Error('이 브라우저에서 원본 영상 코덱을 디코딩할 수 없습니다.');
    if (await video.hasHighDynamicRange())
      throw new Error('현재 버전은 SDR 영상만 편집합니다. HDR 파일을 SDR로 변환해 주세요.');
    if (audio && (!(await audio.canDecode()) || (await audio.getNumberOfChannels()) > 2))
      throw new Error('원본 오디오를 지원하지 않습니다. 지원되는 mono/stereo 파일을 선택하세요.');
    const origin = await video.getFirstTimestamp();
    const end = await video.computeDuration();
    const durationUs = toUs(end - origin);
    if (!Number.isSafeInteger(durationUs) || durationUs <= 0)
      throw new Error('영상 길이를 읽을 수 없습니다.');
    const asset: Asset = {
      id,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      durationUs,
      width: await video.getDisplayWidth(),
      height: await video.getDisplayHeight(),
      videoCodec: (await video.getCodec()) ?? 'unknown',
      hasAudio: !!audio,
      audioCodec: audio ? ((await audio.getCodec()) ?? 'unknown') : undefined,
    };
    return { input, video, audio, origin, asset };
  } catch (error) {
    input.dispose();
    throw error;
  }
}
