import { expect, it } from 'vitest';
import { snapBlockStart, validateBlockPlacement } from '../src/project/block-placement';
import { followPlayhead } from '../src/editor/timeline-scroll';
import { emptyProject, defaultTransform, type Project } from '../src/project/model';
import { applyCommand, initialHistory, historyReducer } from '../src/project/commands';
function fixture(): Project {
  return {
    ...emptyProject(),
    laneCount: 3,
    assets: [
      {
        id: 'a',
        name: 'fixture.mp4',
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
        id: 'v',
        assetId: 'a',
        lane: 0,
        startUs: 0,
        inUs: 1_000_000,
        outUs: 3_000_000,
        muted: true,
        transform: defaultTransform(),
      },
      {
        id: 'next',
        assetId: 'a',
        lane: 0,
        startUs: 5_000_000,
        inUs: 0,
        outUs: 2_000_000,
        transform: defaultTransform(),
      },
    ],
    subtitles: [
      {
        id: 's',
        lane: 1,
        startUs: 3_000_000,
        endUs: 4_000_000,
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
it('같은 라인의 시작/끝 경계에 스냅하고 0초를 넘지 않는다', () => {
  const p = fixture();
  expect(snapBlockStart(p, 'v', 0, 3_030_000, 50_000)).toBe(3_000_000);
  expect(snapBlockStart(p, 'v', 0, -1_000_000, 50_000)).toBe(0);
  expect(snapBlockStart(p, 'v', 2, 3_030_000, 50_000)).toBe(3_030_000);
});
it('충돌 후보는 거부하고 다른 라인 이동은 원본/소리/변환을 보존하며 undo한다', () => {
  const p = fixture();
  expect(() => validateBlockPlacement(p, 'v', 0, 4_000_000)).toThrow();
  expect(() => validateBlockPlacement(p, 'v', 1, 2_500_000)).toThrow();
  expect(() => validateBlockPlacement(p, 'v', 2, 2_500_000)).not.toThrow();
  const h = historyReducer(initialHistory(p), {
    type: 'command',
    command: { type: 'placeBlock', id: 'v', lane: 2, timeUs: 2_500_000 },
  });
  expect(h.present.clips[0]).toEqual({ ...p.clips[0], lane: 2, startUs: 2_500_000 });
  expect(historyReducer(h, { type: 'undo' }).present).toEqual(p);
  expect(() =>
    applyCommand(p, { type: 'placeBlock', id: 'v', lane: 0, timeUs: 4_000_000 }),
  ).toThrow();
  expect(p.clips[0].startUs).toBe(0);
});
it('진행바는 현재 페이지 안에서는 스크롤하지 않고 경계에서 반복해서 다음 페이지로 넘긴다', () => {
  const width = 800,
    content = 10000;
  let left = 0;
  expect(followPlayhead(783, left, width, content)).toBe(0);
  left = followPlayhead(785, left, width, content);
  expect(left).toBe(712);
  left = followPlayhead(1497, left, width, content);
  expect(left).toBe(1424);
  left = followPlayhead(2209, left, width, content);
  expect(left).toBe(2136);
  expect(followPlayhead(4000, left, width, content)).toBeGreaterThan(left);
});
it('뒤로 탐색/viewport 변경/끝 범위를 처리한다', () => {
  expect(followPlayhead(72, 2136, 800, 10000)).toBe(0);
  expect(followPlayhead(600, 0, 500, 10000)).toBe(412);
  expect(followPlayhead(9999, 0, 800, 10000)).toBe(9200);
  expect(followPlayhead(800, 0, 800, 800)).toBe(0);
  expect(followPlayhead(10, 0, 50, 10000)).toBe(0);
});
