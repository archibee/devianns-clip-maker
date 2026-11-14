export type Us = number;
export type Fps = 30 | 45 | 60;
export type Resolution = 1080 | 720 | 480;
export type Aspect = '16:9' | '9:16' | '1:1';
export type Asset = {
  id: string;
  name: string;
  size: number;
  lastModified: number;
  durationUs: Us;
  width: number;
  height: number;
  hasAudio: boolean;
  videoCodec: string;
  audioCodec?: string;
};
export type Crop = { x: number; y: number; width: number; height: number };
export const MIN_CROP_SIZE = 0.001;
export type Transform = {
  fit: 'contain' | 'cover';
  scale: number;
  x: number;
  y: number;
  crop?: Crop;
};
export type ClipPart = {
  assetId: string;
  inUs: Us;
  outUs: Us;
  transform: Transform;
  muted?: boolean;
};
export type Clip = ClipPart & { id: string; startUs?: Us; parts?: ClipPart[]; lane?: number };
export type Cue = {
  lane?: number;
  id: string;
  startUs: Us;
  endUs: Us;
  text: string;
  size: number;
  color: string;
  background: string;
  colorOpacity?: number;
  backgroundOpacity?: number;
  x: number;
  y: number;
  font?: { postscriptName: string; label: string };
};
export type CueStyle = Pick<
  Cue,
  'size' | 'color' | 'background' | 'colorOpacity' | 'backgroundOpacity' | 'x' | 'y' | 'font'
>;
export const CUE_STYLE_KEYS: readonly (keyof CueStyle)[] = [
  'size',
  'color',
  'background',
  'colorOpacity',
  'backgroundOpacity',
  'x',
  'y',
  'font',
];
export type Project = {
  laneCount?: number;
  schemaVersion: 1;
  id: string;
  name: string;
  aspect: Aspect;
  fps: Fps;
  assets: Asset[];
  clips: Clip[];
  subtitles: Cue[];
};
export type ExportSettings = { resolution: Resolution; fps: Fps; format: 'mp4' | 'webm' };
export const MAX_DURATION_US = Number.MAX_SAFE_INTEGER;
export const newId = () => crypto.randomUUID();
export const toUs = (seconds: number) => Math.round(seconds * 1_000_000);
export const seconds = (us: Us) => us / 1_000_000;
export const defaultTransform = (): Transform => ({ fit: 'contain', scale: 1, x: 0, y: 0 });
export const emptyProject = (): Project => ({
  laneCount: 1,
  schemaVersion: 1,
  id: newId(),
  name: '새 프로젝트',
  aspect: '16:9',
  fps: 30,
  assets: [],
  clips: [],
  subtitles: [],
});
export const clipDuration = (clip: Clip) => clip.outUs - clip.inUs;
export const duration = (project: Project) =>
  Math.max(0, ...layout(project).map((c) => c.endUs), ...project.subtitles.map((c) => c.endUs));
export const frameTime = (n: number, fps: Fps) => Math.round((n * 1_000_000) / fps);
export function dimensions(aspect: Aspect, resolution: Resolution) {
  const long = resolution === 1080 ? 1920 : resolution === 720 ? 1280 : 854;
  return aspect === '16:9'
    ? { width: long, height: resolution }
    : aspect === '9:16'
      ? { width: resolution, height: long }
      : { width: resolution, height: resolution };
}
export function layout(project: Project) {
  const cursors = new Map<number, number>();
  return project.clips.map((clip) => {
    const lane = clip.lane ?? 0;
    const startUs = clip.startUs ?? cursors.get(lane) ?? 0;
    const item = { clip, startUs, endUs: startUs + clipDuration(clip) };
    cursors.set(lane, item.endUs);
    return item;
  });
}
export function resolve(project: Project, timeUs: Us) {
  const item = resolveAll(project, timeUs)[0];
  return item ? { ...item, sourceUs: item.clip.inUs + timeUs - item.startUs } : null;
}
export const clipLane = (clip: Clip) => clip.lane ?? 0;
export const cueLane = (cue: Cue) => cue.lane ?? 1;
export const laneCount = (p: Project) =>
  Math.max(
    p.laneCount ?? 1,
    1,
    ...p.clips.map((c) => clipLane(c) + 1),
    ...p.subtitles.map((c) => cueLane(c) + 1),
  );
export function resolveAll(project: Project, timeUs: Us) {
  return mediaLayout(project)
    .filter((x) => timeUs >= x.startUs && timeUs < x.endUs)
    .sort((a, b) => clipLane(b.clip) - clipLane(a.clip))
    .map((item) => ({ ...item, sourceUs: item.clip.inUs + timeUs - item.startUs }));
}
export function mediaLayout(project: Project) {
  return layout(project).flatMap<{ clip: Clip; startUs: number; endUs: number; sourceKey: string }>(
    (item) => {
      if (!item.clip.parts) return [{ ...item, sourceKey: item.clip.id }];
      let offset = 0;
      return item.clip.parts.flatMap((part, index) => {
        const partEnd = offset + part.outUs - part.inUs;
        const from = Math.max(offset, item.clip.inUs),
          to = Math.min(partEnd, item.clip.outUs);
        const result =
          to > from
            ? [
                {
                  clip: {
                    ...part,
                    muted: item.clip.muted ?? part.muted,
                    lane: item.clip.lane,
                    id: item.clip.id,
                    inUs: part.inUs + from - offset,
                    outUs: part.inUs + to - offset,
                  },
                  startUs: item.startUs + from - item.clip.inUs,
                  endUs: item.startUs + to - item.clip.inUs,
                  sourceKey: `${item.clip.id}:${index}`,
                },
              ]
            : [];
        offset = partEnd;
        return result;
      });
    },
  );
}
export function timecode(timeUs: Us, fps: Fps = 30) {
  const total = Math.max(0, Math.floor(timeUs / 1_000_000));
  const frames = Math.floor(((Math.max(0, timeUs) % 1_000_000) * fps) / 1_000_000 + 0.0001);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}
export const hasTimelineAudio = (p: Project) =>
  mediaLayout(p).some(
    (r) => !r.clip.muted && p.assets.find((a) => a.id === r.clip.assetId)?.hasAudio,
  );
export function cueErrors(project: Project): string[] {
  const cues = [...project.subtitles].sort((a, b) => a.startUs - b.startUs);
  const errors: string[] = [];
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    if (c.startUs < 0 || c.endUs <= c.startUs || !Number.isSafeInteger(c.endUs))
      errors.push('자막 시간을 영상 범위 안으로 조정하세요.');
    if (
      cues
        .slice(0, i)
        .some(
          (other) =>
            cueLane(other) === cueLane(c) && c.startUs < other.endUs && c.endUs > other.startUs,
        )
    )
      errors.push('같은 행의 겹치는 자막 시간을 조정하세요.');
  }
  return [...new Set(errors)];
}
