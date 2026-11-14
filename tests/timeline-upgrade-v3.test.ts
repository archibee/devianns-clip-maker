import { expect, it } from 'vitest';
import { applyCommand, historyReducer, initialHistory } from '../src/project/commands';
import {
  emptyProject,
  defaultTransform,
  mediaLayout,
  hasTimelineAudio,
  type Project,
} from '../src/project/model';
import { parseProject } from '../src/project/validation';
import { buildProject } from '../modules/speech-auto-cut/src/cut-plan';
function fixture(): Project {
  return {
    ...emptyProject(),
    laneCount: 4,
    assets: [true, false].map((hasAudio, i) => ({
      id: `a${i}`,
      name: 'fixture.mp4',
      size: 1,
      lastModified: 0,
      durationUs: 4_000_000,
      width: 640,
      height: 360,
      hasAudio,
      videoCodec: 'avc',
    })),
    clips: [
      {
        id: 'v0',
        assetId: 'a0',
        lane: 0,
        startUs: 0,
        inUs: 0,
        outUs: 2_000_000,
        muted: true,
        transform: defaultTransform(),
      },
      {
        id: 'v1',
        assetId: 'a0',
        lane: 1,
        startUs: 0,
        inUs: 0,
        outUs: 2_000_000,
        transform: defaultTransform(),
      },
      {
        id: 'silent',
        assetId: 'a1',
        lane: 1,
        startUs: 2_000_000,
        inUs: 0,
        outUs: 1_000_000,
        transform: defaultTransform(),
      },
    ],
    subtitles: [
      {
        id: 's',
        lane: 2,
        startUs: 0,
        endUs: 2_000_000,
        text: '기존',
        size: 0.05,
        color: '#ffffff',
        background: '#000000',
        x: 0.5,
        y: 0.9,
      },
    ],
  };
}
it('라인 교환은 시간/설정/음소거를 보존하며 경계는 이동하지 않는다', () => {
  const p = fixture(),
    next = applyCommand(p, { type: 'moveLane', lane: 0, direction: 1 });
  expect(next.clips).toEqual(p.clips.map((c) => ({ ...c, lane: c.lane === 0 ? 1 : 0 })));
  expect(next.subtitles).toEqual(p.subtitles);
  expect(applyCommand(p, { type: 'moveLane', lane: 0, direction: -1 })).toBe(p);
  expect(applyCommand(p, { type: 'moveLane', lane: 3, direction: 1 })).toBe(p);
  const blank = applyCommand(p, { type: 'moveLane', lane: 3, direction: -1 });
  expect(blank.subtitles[0].lane).toBe(3);
  expect(blank.laneCount).toBe(4);
  const moved = historyReducer(initialHistory(p), {
    type: 'command',
    command: { type: 'moveLane', lane: 0, direction: 1 },
  });
  expect(historyReducer(moved, { type: 'undo' }).present).toEqual(p);
});
it('일괄 음소거는 선택한 유음 영상만 변경하고 자막/무음 원본을 무시하며 undo한다', () => {
  const p = fixture(),
    muted = historyReducer(initialHistory(p), {
      type: 'command',
      command: { type: 'muteClips', ids: ['v1', 'silent', 's'], muted: true },
    });
  expect(muted.present.clips[1].muted).toBe(true);
  expect(muted.present.clips[2]).toEqual(p.clips[2]);
  expect(muted.present.subtitles).toEqual(p.subtitles);
  expect(hasTimelineAudio(muted.present)).toBe(false);
  expect(historyReducer(muted, { type: 'undo' }).present).toEqual(p);
  const unmute = applyCommand(muted.present, {
    type: 'muteClips',
    ids: ['v0', 'v1', 's'],
    muted: false,
  });
  expect(hasTimelineAudio(unmute)).toBe(true);
  expect(unmute.clips.slice(0, 2).every((c) => c.muted === false)).toBe(true);
  expect(applyCommand(p, { type: 'muteClips', ids: ['silent', 's'], muted: true })).toBe(p);
});
it('음소거는 JSON·분할·붙여넣기·Auto Cut에서 보존되고 잘못된 입력은 거부한다', () => {
  const p = fixture();
  expect(parseProject(JSON.stringify(p)).clips[0].muted).toBe(true);
  expect(() =>
    parseProject(JSON.stringify({ ...p, clips: [{ ...p.clips[0], muted: 1 }] })),
  ).toThrow();
  const split = applyCommand(p, { type: 'split', timeUs: 1_000_000 });
  expect(split.clips.filter((c) => c.lane === 0).every((c) => c.muted)).toBe(true);
  const paste = applyCommand(p, {
    type: 'pasteBlocks',
    clips: [p.clips[0]],
    cues: [],
    timeUs: 4_000_000,
    lane: 0,
  });
  expect(paste.clips.at(-1)?.muted).toBe(true);
  const cut = buildProject(p, 'v0', [{ startUs: 0, endUs: 1_000_000 }]);
  expect(cut.clips[0].muted).toBe(true);
});
it('합친 블록은 내부 구간의 음소거를 보존하고 전체 해제/재음소거가 가능하다', () => {
  const p = fixture();
  p.clips = [p.clips[0], { ...p.clips[1], lane: 0, startUs: 2_000_000 }];
  const merged = applyCommand(p, { type: 'merge', ids: ['v0', 'v1'] });
  expect(mediaLayout(merged).map((r) => !!r.clip.muted)).toEqual([true, false]);
  const muted = applyCommand(merged, { type: 'muteClips', ids: [merged.clips[0].id], muted: true });
  expect(hasTimelineAudio(muted)).toBe(false);
  const unmute = applyCommand(muted, {
    type: 'muteClips',
    ids: [merged.clips[0].id],
    muted: false,
  });
  expect(mediaLayout(unmute).every((r) => !r.clip.muted)).toBe(true);
});
