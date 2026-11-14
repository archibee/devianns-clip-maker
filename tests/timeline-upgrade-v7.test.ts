import { expect, it } from 'vitest';
import { dragGroup, resolveMoveStart } from '../src/project/block-placement';
import { snapMoveCenter } from '../src/editor/move-snap';
import { applyCommand, historyReducer, initialHistory } from '../src/project/commands';
import { emptyProject, defaultTransform, type Project } from '../src/project/model';
function fixture(): Project {
  return {
    ...emptyProject(),
    laneCount: 2,
    assets: [
      {
        id: 'a',
        name: 'a.mp4',
        size: 1,
        lastModified: 0,
        durationUs: 10_000_000,
        width: 640,
        height: 360,
        hasAudio: true,
        videoCodec: 'avc',
      },
    ],
    clips: [
      {
        id: 'a1',
        assetId: 'a',
        lane: 0,
        startUs: 0,
        inUs: 0,
        outUs: 2_000_000,
        muted: true,
        transform: defaultTransform(),
      },
      {
        id: 'a2',
        assetId: 'a',
        lane: 0,
        startUs: 2_000_000,
        inUs: 0,
        outUs: 2_000_000,
        transform: defaultTransform(),
      },
      {
        id: 'other',
        assetId: 'a',
        lane: 1,
        startUs: 0,
        inUs: 0,
        outUs: 2_000_000,
        transform: defaultTransform(),
      },
    ],
    subtitles: [
      {
        id: 's',
        lane: 0,
        startUs: 6_000_000,
        endUs: 7_000_000,
        text: 's',
        size: 0.05,
        color: '#ffffff',
        background: '#000000',
        x: 0.5,
        y: 0.9,
      },
    ],
  };
}
it('겹친 이동은 가장 가까운 배치 가능한 앞/뒤 경계로 붙는다', () => {
  const p = fixture();
  expect(resolveMoveStart(p, ['a1'], 0, 5_000_000)).toBe(4_000_000);
  expect(resolveMoveStart(p, ['a1'], 0, 6_800_000)).toBe(7_000_000);
  expect(resolveMoveStart(p, ['a1'], 0, -100)).toBe(0);
  const moved = applyCommand(p, { type: 'moveBlocks', ids: ['a1'], lane: 0, timeUs: 5_000_000 });
  expect(moved.clips[0].startUs).toBe(4_000_000);
});
it('선택한 연속 블록만 묶고 다른 라인/불연속 선택은 잡은 블록만 이동한다', () => {
  const p = fixture();
  expect(dragGroup(p, ['a2', 'a1'], 'a2')).toEqual(['a1', 'a2']);
  expect(dragGroup(p, ['a1', 's'], 'a1')).toEqual(['a1']);
  expect(dragGroup(p, ['a1', 'other'], 'a1')).toEqual(['a1']);
  expect(dragGroup(p, ['a1'], 'a2')).toEqual(['a2']);
});
it('영상/자막 혼합 묶음은 시간/원본/음소거를 보존하고 한 번에 undo한다', () => {
  const p = fixture();
  p.subtitles[0].startUs = 4_000_000;
  p.subtitles[0].endUs = 5_000_000;
  const ids = ['a1', 'a2', 's'];
  expect(dragGroup(p, ids, 's')).toEqual(ids);
  const h = historyReducer(initialHistory(p), {
    type: 'command',
    command: { type: 'moveBlocks', ids, lane: 0, timeUs: 3_000_000 },
  });
  expect(h.present.clips[0]).toEqual({ ...p.clips[0], startUs: 3_000_000 });
  expect(h.present.clips[1].startUs).toBe(5_000_000);
  expect(h.present.subtitles[0].startUs).toBe(7_000_000);
  expect(h.present.clips[2]).toEqual(p.clips[2]);
  expect(historyReducer(h, { type: 'undo' }).present).toEqual(p);
  expect(() => applyCommand(p, { type: 'moveBlocks', ids, lane: 1, timeUs: 3_000_000 })).toThrow();
});
it('묶음 전체 길이로 충돌을 보정하고 무효한 묶음은 거부한다', () => {
  const p = fixture();
  expect(resolveMoveStart(p, ['a1', 'a2'], 0, 4_500_000)).toBe(2_000_000);
  expect(() =>
    applyCommand(p, { type: 'moveBlocks', ids: ['a1', 's'], lane: 0, timeUs: 0 }),
  ).toThrow();
});
it('크롭/리사이즈된 영상의 실제 중심을 가로·세로 교차점에 스냅한다', () => {
  const t = {
    ...defaultTransform(),
    scale: 2,
    x: 0.1,
    y: 0.1,
    crop: { x: 0.2, y: 0.1, width: 0.6, height: 0.8 },
  };
  const result = snapMoveCenter(t, 1920, 1080, 960, 540, -0.345 * 960, -0.095 * 540, 8, 8);
  expect(result.guides).toEqual({ x: 0.25, y: 0.5 });
  expect(result.transform.x).toBeCloseTo(-0.25);
  expect(result.transform.y).toBeCloseTo(0);
  expect(result.transform.crop).toEqual(t.crop);
  expect(result.transform.scale).toBe(2);
});
it('한 축만 스냅하거나 가이드와 멀면 자유 이동한다', () => {
  const t = defaultTransform();
  const one = snapMoveCenter(t, 1920, 1080, 960, 540, -0.1 * 960, 0.005 * 540, 8, 8);
  expect(one.guides.x).toBeUndefined();
  expect(one.guides.y).toBe(0.5);
  expect(one.transform.x).toBeCloseTo(-0.1);
  const free = snapMoveCenter(t, 1920, 1080, 960, 540, 0.1 * 960, 0.1 * 540, 8, 8);
  expect(free.guides.x).toBeUndefined();
  expect(free.guides.y).toBeUndefined();
});
