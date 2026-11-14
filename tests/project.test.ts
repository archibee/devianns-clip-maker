import { describe, expect, it } from 'vitest';
import { applyCommand, historyReducer, initialHistory, trimAt } from '../src/project/commands';
import {
  cueErrors,
  defaultTransform,
  dimensions,
  duration,
  emptyProject,
  frameTime,
  resolve,
  type Asset,
} from '../src/project/model';
import { parseProject } from '../src/project/validation';

const asset: Asset = {
  id: 'a',
  name: 'test.mp4',
  size: 100,
  lastModified: 0,
  durationUs: 4_000_000,
  width: 1280,
  height: 720,
  hasAudio: true,
  videoCodec: 'avc',
};
function project() {
  const p = emptyProject();
  return {
    ...p,
    assets: [asset],
    clips: [{ id: 'c', assetId: 'a', inUs: 0, outUs: 4_000_000, transform: defaultTransform() }],
  };
}
describe('비파괴 컷과 결합 오디오 시간 계약', () => {
  it('키프레임과 무관한 구간을 분할하고 원본 시간과 길이를 보존한다', () => {
    const p = applyCommand(project(), { type: 'split', timeUs: 1_234_567 });
    expect(p.clips.map((c) => [c.inUs, c.outUs])).toEqual([
      [0, 1_234_567],
      [1_234_567, 4_000_000],
    ]);
    expect(duration(p)).toBe(4_000_000);
    expect(resolve(p, 1_234_567)?.clip.id).toBe(p.clips[1].id);
    expect(resolve(p, 1_234_567)?.sourceUs).toBe(1_234_567);
    expect(resolve(p, duration(p))).toBeNull();
  });
  it('트림 후 재배열해도 영상과 오디오에 쓰이는 원본 구간은 같다', () => {
    let p = applyCommand(project(), { type: 'split', timeUs: 2_000_000 });
    const right = p.clips[1].id;
    p = applyCommand(p, { type: 'trim', id: right, inUs: 2_500_000, outUs: 3_500_000 });
    p = applyCommand(p, { type: 'move', id: right, index: 0 });
    expect(resolve(p, 500_000)?.sourceUs).toBe(3_000_000);
    expect(duration(p)).toBe(3_000_000);
    expect(p.clips[0].assetId).toBe('a');
  });
  it('0 길이 분할과 원본 밖 트림을 허용하지 않는다', () => {
    const p = project();
    expect(applyCommand(p, { type: 'split', timeUs: 0 })).toBe(p);
    expect(() => applyCommand(p, { type: 'trim', id: 'c', inUs: 0, outUs: 9_000_000 })).toThrow();
    expect(trimAt(p, 'c', 'in', 9_000_000).inUs).toBeLessThan(4_000_000);
  });
  it('undo/redo는 편집 결과를 정확히 복원한다', () => {
    const h = initialHistory(project());
    const edited = historyReducer(h, {
      type: 'command',
      command: { type: 'split', timeUs: 2_000_000 },
    });
    const undone = historyReducer(edited, { type: 'undo' });
    expect(undone.present).toEqual(h.present);
    expect(historyReducer(undone, { type: 'redo' }).present).toEqual(edited.present);
  });
});
describe('출력 설정과 프로젝트 검증', () => {
  it('모든 크기/FPS에서 프레임 시간은 누적 오차 없이 계산된다', () => {
    for (const fps of [30, 45, 60] as const) expect(frameTime(fps * 300, fps)).toBe(300_000_000);
    expect(dimensions('16:9', 480)).toEqual({ width: 854, height: 480 });
    expect(dimensions('9:16', 1080)).toEqual({ width: 1080, height: 1920 });
  });
  it('올바른 JSON은 복원하고 버전·참조·비정상 수치는 거부한다', () => {
    const p = project();
    expect(parseProject(JSON.stringify(p))).toEqual(p);
    expect(() => parseProject(JSON.stringify({ ...p, schemaVersion: 2 }))).toThrow();
    expect(() => parseProject(JSON.stringify({ ...p, assets: [] }))).toThrow();
    expect(() =>
      parseProject(JSON.stringify({ ...p, clips: [{ ...p.clips[0], inUs: -1 }] })),
    ).toThrow();
  });
  it('자막이 영상 끝을 넘어도 유지하고 겹침은 검출한다', () => {
    const p = project();
    const cue = {
      id: 'q',
      startUs: 0,
      endUs: 3_000_000,
      text: '한글',
      size: 0.05,
      color: '#ffffff',
      background: '#000000',
      x: 0.5,
      y: 0.9,
    };
    const withCue = applyCommand(p, { type: 'cue', cue });
    const shortened = applyCommand(withCue, { type: 'trim', id: 'c', inUs: 0, outUs: 1_000_000 });
    expect(shortened.subtitles).toHaveLength(1);
    expect(cueErrors(shortened)).toEqual([]);
    expect(duration(shortened)).toBe(3_000_000);
    expect(cueErrors({ ...withCue, subtitles: [cue, { ...cue, id: 'r' }] })).not.toHaveLength(0);
  });
});
