import { describe, expect, it } from 'vitest';
import { applyCommand, historyReducer, initialHistory } from '../src/project/commands';
import {
  defaultTransform,
  duration,
  emptyProject,
  layout,
  mediaLayout,
  MIN_CROP_SIZE,
  resolve,
  type Asset,
  type Clip,
  type Cue,
} from '../src/project/model';
import { parseProject } from '../src/project/validation';

const assets: Asset[] = ['a', 'b', 'c'].map((id) => ({
  id: `source-${id}`,
  name: `${id}.mp4`,
  size: 1,
  lastModified: 0,
  durationUs: 4_000_000,
  width: 640,
  height: 360,
  hasAudio: true,
  videoCodec: 'avc',
}));
const clip = (id: string, startUs: number, inUs = 0, outUs = 1_000_000): Clip => ({
  id,
  assetId: `source-${id}`,
  inUs,
  outUs,
  startUs,
  transform: defaultTransform(),
});
const cue: Cue = {
  id: 'cue',
  startUs: 2_500_000,
  endUs: 4_000_000,
  text: '자막',
  size: 0.05,
  x: 0.5,
  y: 0.9,
  color: '#ffffff',
  background: '#000000',
};
const project = () => ({
  ...emptyProject(),
  assets,
  clips: [clip('a', 1_000_000), clip('b', 2_000_000), clip('c', 5_000_000)],
  subtitles: [cue],
});

describe('v6 편집 회귀', () => {
  it('맞닿은 영상만 합치며 앞뒤 빈 구간·다른 블록·자막을 유지한다', () => {
    const p = project();
    const merged = applyCommand(p, { type: 'merge', ids: ['a', 'b'] });
    expect(layout(merged).map((r) => [r.startUs, r.endUs])).toEqual([
      [1_000_000, 3_000_000],
      [5_000_000, 6_000_000],
    ]);
    expect(merged.subtitles).toEqual(p.subtitles);
    expect(resolve(merged, 1_500_000)?.clip.assetId).toBe('source-a');
    expect(resolve(merged, 2_500_000)?.clip.assetId).toBe('source-b');
    expect(resolve(merged, 3_500_000)).toBeNull();
    expect(() => applyCommand(p, { type: 'merge', ids: ['a', 'c'] })).toThrow('맞닿은');
    expect(parseProject(JSON.stringify(merged))).toEqual(merged);
  });
  it('재배열·삽입·삭제가 기존 빈 구간을 임의로 없애지 않는다', () => {
    let p = project();
    p.clips[1].outUs = 2_000_000;
    const moved = applyCommand(p, { type: 'move', id: 'b', index: 0 });
    expect(layout(moved).map((r) => [r.startUs, r.endUs])).toEqual([
      [1_000_000, 3_000_000],
      [3_000_000, 4_000_000],
      [5_000_000, 6_000_000],
    ]);
    expect(moved.subtitles).toEqual(p.subtitles);
    const inserted = applyCommand(p, { type: 'insert', assetId: 'source-a', index: 1 });
    expect(layout(inserted).at(-1)?.startUs).toBe(9_000_000);
    expect(
      layout(
        applyCommand(
          { ...p, clips: p.clips.map(({ startUs: _, ...c }) => c) },
          { type: 'deleteClips', ids: ['a'] },
        ),
      )[0].startUs,
    ).toBe(1_000_000);
  });
  it('합친 원본별 변환·분할·트림·undo/redo를 보존한다', () => {
    const p = project();
    p.clips[1].transform = {
      ...defaultTransform(),
      x: 0.1,
      crop: { x: 0.1, y: 0, width: 0.8, height: 1 },
    };
    const h = historyReducer(initialHistory(p), {
      type: 'command',
      command: { type: 'merge', ids: ['a', 'b'] },
    });
    expect(historyReducer(h, { type: 'undo' }).present).toEqual(p);
    expect(historyReducer(historyReducer(h, { type: 'undo' }), { type: 'redo' }).present).toEqual(
      h.present,
    );
    const split = applyCommand(h.present, { type: 'split', timeUs: 2_250_000 });
    expect(mediaLayout(split).map((r) => [r.clip.assetId, r.startUs, r.endUs])).toEqual([
      ['source-a', 1_000_000, 2_000_000],
      ['source-b', 2_000_000, 2_250_000],
      ['source-b', 2_250_000, 3_000_000],
      ['source-c', 5_000_000, 6_000_000],
    ]);
    expect(resolve(split, 2_500_000)?.clip.transform).toEqual(p.clips[1].transform);
    const trimmed = applyCommand(h.present, {
      type: 'trim',
      id: h.present.clips[0].id,
      inUs: 500_000,
      outUs: 1_500_000,
    });
    expect(resolve(trimmed, 1_000_000)?.sourceUs).toBe(500_000);
    expect(resolve(trimmed, 1_750_000)?.clip.assetId).toBe('source-b');
    expect(parseProject(JSON.stringify(trimmed))).toEqual(trimmed);
  });
  it('붙여넣기·겹침 거부·영상/자막의 끝으로 길이 확장을 처리한다', () => {
    const p = project();
    expect(() =>
      applyCommand(p, { type: 'pasteClips', clips: [p.clips[0]], timeUs: 1_500_000 }),
    ).toThrow('겹칩니다');
    let next = applyCommand(p, { type: 'pasteClips', clips: [p.clips[0]], timeUs: 8_000_000 });
    next = applyCommand(next, { type: 'pasteClips', clips: [p.clips[0]], timeUs: duration(next) });
    expect(duration(next)).toBe(10_000_000);
    next = applyCommand(next, {
      type: 'cue',
      cue: { ...cue, startUs: 11_000_000, endUs: 12_000_000 },
    });
    expect(duration(next)).toBe(12_000_000);
    expect(parseProject(JSON.stringify(next))).toEqual(next);
    expect(() =>
      applyCommand({ ...p, assets: [] }, { type: 'pasteClips', clips: p.clips, timeUs: 0 }),
    ).toThrow('원본');
  });
  it('최소 Crop·투명도·폰트 메타데이터는 복원하고 손상된 값·겹침은 거부한다', () => {
    const p = project();
    p.clips[0].transform.crop = { x: 0, y: 0, width: MIN_CROP_SIZE, height: MIN_CROP_SIZE };
    const styled = {
      ...p,
      subtitles: [
        {
          ...cue,
          colorOpacity: 0.65,
          backgroundOpacity: 0,
          font: { postscriptName: 'Test', label: '테스트' },
        },
      ],
    };
    expect(parseProject(JSON.stringify(styled))).toEqual(styled);
    expect(() =>
      parseProject(
        JSON.stringify({
          ...styled,
          subtitles: [{ ...styled.subtitles[0], backgroundOpacity: 2 }],
        }),
      ),
    ).toThrow();
    expect(() =>
      parseProject(JSON.stringify({ ...p, subtitles: [cue, { ...cue, id: 'overlap' }] })),
    ).toThrow();
    p.clips[0].transform.crop.width = MIN_CROP_SIZE / 2;
    expect(() => parseProject(JSON.stringify(p))).toThrow();
  });
});
