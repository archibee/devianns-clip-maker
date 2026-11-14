import { expect, it, vi, afterEach } from 'vitest';
import { buildProject, selectionProject } from '../modules/speech-auto-cut/src/cut-plan';
import { autoCutUnavailable } from '../modules/speech-auto-cut/src/eligibility';
import { applyCommand, historyReducer, initialHistory } from '../src/project/commands';
import {
  emptyProject,
  defaultTransform,
  layout,
  laneCount,
  type Project,
} from '../src/project/model';
import type { MediaRegistry } from '../src/media/registry';
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
        id: 'target',
        assetId: 'a',
        lane: 0,
        startUs: 5_000_000,
        inUs: 0,
        outUs: 4_000_000,
        transform: defaultTransform(),
      },
      {
        id: 'next',
        assetId: 'a',
        lane: 0,
        startUs: 9_000_000,
        inUs: 0,
        outUs: 2_000_000,
        transform: defaultTransform(),
      },
      {
        id: 'other',
        assetId: 'a',
        lane: 1,
        startUs: 6_000_000,
        inUs: 0,
        outUs: 2_000_000,
        transform: defaultTransform(),
      },
    ],
    subtitles: [
      {
        id: 'old',
        lane: 2,
        startUs: 5_000_000,
        endUs: 10_000_000,
        text: '기존 자막',
        size: 0.05,
        color: '#ffffff',
        background: '#000000',
        x: 0.5,
        y: 0.9,
      },
    ],
  };
}
const keep = [
  { startUs: 0, endUs: 1_000_000 },
  { startUs: 2_000_000, endUs: 3_000_000 },
];
afterEach(() => vi.unstubAllGlobals());
it('다중 라인에서도 영상 한 블록 선택만 허용하며 다른 블록 원본 누락은 분석을 막지 않는다', () => {
  for (const key of ['AudioDecoder', 'Worker']) vi.stubGlobal(key, () => {});
  vi.stubGlobal('isSecureContext', true);
  const p = fixture(),
    registry = { has: (id:string) => id==='a' } as unknown as MediaRegistry;
  expect(autoCutUnavailable(p, registry, ['target'])).toBeUndefined();
  expect(autoCutUnavailable(p, registry, [])).toContain('하나');
  expect(autoCutUnavailable(p, registry, ['target', 'next'])).toContain('하나');
  p.clips[2].assetId = 'missing';
  expect(autoCutUnavailable(p, registry, ['target'])).toBeUndefined();
});
it('선택 블록만 0초부터 분석하고 원래 시작 위치부터 컷을 붙이며 다른 블록/자막을 고정한다', () => {
  const p = fixture(),
    scope = selectionProject(p, 'target');
  expect(scope.clips).toHaveLength(1);
  expect(scope.clips[0].startUs).toBe(0);
  expect(scope.subtitles).toEqual([]);
  const next = buildProject(p, 'target', keep, true);
  expect(next.clips.slice(0, 2).map((c) => [c.startUs, c.outUs - c.inUs, c.lane])).toEqual([
    [5_000_000, 1_000_000, 0],
    [6_000_000, 1_000_000, 0],
  ]);
  expect(next.clips.find((c) => c.id === 'next')).toEqual(p.clips[1]);
  expect(next.clips.find((c) => c.id === 'other')).toEqual(p.clips[2]);
  expect(next.subtitles[0]).toEqual(p.subtitles[0]);
  expect(laneCount(next)).toBe(4);
  expect(next.subtitles.slice(1).map((c) => [c.startUs, c.endUs, c.lane, c.text])).toEqual([
    [5_000_000, 6_000_000, 3, ''],
    [6_000_000, 7_000_000, 3, ''],
  ]);
  expect(layout(next).find((r) => r.clip.id === 'next')!.startUs).toBe(9_000_000);
});
it('자막을 생성하지 않으면 라인 추가 없이 기존 자막을 보존하고 실패는 원본에 영향이 없다', () => {
  const p = fixture(),
    next = buildProject(p, 'target', keep);
  expect(next.subtitles).toEqual(p.subtitles);
  expect(next.laneCount).toBe(3);
  expect(() => buildProject(p, 'target', [], true)).toThrow('남길 영상');
  expect(() => buildProject({ ...p, laneCount: 32 }, 'target', keep, true)).toThrow('32');
  expect(buildProject({ ...p, laneCount: 32 }, 'target', keep).laneCount).toBe(32);
  expect(p.clips[0].id).toBe('target');
});
it('합친 블록의 내부 원본 구간을 선택 범위 안에서 잘라낸다', () => {
  const p = fixture();
  p.clips[0].parts = [
    { assetId: 'a', inUs: 1_000_000, outUs: 3_000_000, transform: defaultTransform() },
    { assetId: 'a', inUs: 5_000_000, outUs: 7_000_000, transform: defaultTransform() },
  ];
  const next = buildProject(p, 'target', [{ startUs: 1_000_000, endUs: 3_000_000 }]);
  expect(next.clips.slice(0, 2).map((c) => [c.inUs, c.outUs, c.startUs])).toEqual([
    [2_000_000, 3_000_000, 5_000_000],
    [5_000_000, 6_000_000, 6_000_000],
  ]);
});
it('라인 삭제는 포함 블록만 지우고 번호를 당기며 절대시간과 undo/redo를 보존한다', () => {
  const p = fixture();
  const deleted = historyReducer(initialHistory(p), {
    type: 'command',
    command: { type: 'deleteLane', lane: 0 },
  });
  expect(deleted.present.clips.map((c) => [c.id, c.startUs, c.lane])).toEqual([
    ['other', 6_000_000, 0],
  ]);
  expect(deleted.present.subtitles[0]).toEqual({ ...p.subtitles[0], lane: 1 });
  expect(laneCount(deleted.present)).toBe(2);
  const undo = historyReducer(deleted, { type: 'undo' });
  expect(undo.present).toEqual(p);
  expect(historyReducer(undo, { type: 'redo' }).present).toEqual(deleted.present);
  const single = { ...fixture(), laneCount: 1, clips: [{ ...p.clips[0], lane: 0 }], subtitles: [] };
  const empty = applyCommand(single, { type: 'deleteLane', lane: 0 });
  expect(empty.clips).toEqual([]);
  expect(laneCount(empty)).toBe(1);
});
it('Auto Cut과 새 자막 라인은 한 번의 undo로 복구한다', () => {
  const p = fixture(),
    next = buildProject(p, 'target', keep, true);
  const applied = historyReducer(initialHistory(p), {
    type: 'command',
    command: {
      type: 'replaceTimeline',
      clips: next.clips,
      subtitles: next.subtitles,
      laneCount: next.laneCount,
    },
  });
  expect(historyReducer(applied, { type: 'undo' }).present).toEqual(p);
});
