import { expect, it } from 'vitest';
import { applyCommand, initialHistory, historyReducer } from '../src/project/commands';
import {
  emptyProject,
  defaultTransform,
  layout,
  laneCount,
  resolveAll,
  type Project,
  type Cue,
} from '../src/project/model';
import { parseProject } from '../src/project/validation';
const cue = (id: string, lane: number, startUs = 0): Cue => ({
  id,
  lane,
  startUs,
  endUs: startUs + 1_000_000,
  text: id,
  size: 0.05,
  color: '#ffffff',
  background: '#000000',
  x: 0.5,
  y: 0.9,
});
function fixture(): Project {
  return {
    ...emptyProject(),
    laneCount: 3,
    assets: [
      {
        id: 'asset',
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
        id: 'v',
        assetId: 'asset',
        lane: 0,
        startUs: 0,
        inUs: 0,
        outUs: 2_000_000,
        transform: defaultTransform(),
      },
    ],
    subtitles: [cue('s', 1)],
  };
}

it('새 프로젝트는 한 행이며 이전 파일의 영상/자막은 시간을 보존해 두 행으로 해석한다', () => {
  expect(laneCount(emptyProject())).toBe(1);
  const p = fixture();
  delete p.laneCount;
  delete p.clips[0].lane;
  delete p.subtitles[0].lane;
  const restored = parseProject(JSON.stringify(p));
  expect(laneCount(restored)).toBe(2);
  expect(layout(restored)[0].startUs).toBe(0);
  expect(restored.subtitles[0].text).toBe('s');
  const added = applyCommand(restored, { type: 'addLane' });
  expect(laneCount(added)).toBe(3);
});
it('같은 행 영상/자막 충돌은 전체 거부하고 다른 행의 동시 배치를 허용한다', () => {
  const p = fixture();
  expect(() => applyCommand(p, { type: 'placeBlock', id: 's', lane: 0, timeUs: 0 })).toThrow();
  expect(p.subtitles[0].lane).toBe(1);
  const moved = applyCommand(p, { type: 'placeBlock', id: 's', lane: 0, timeUs: 2_000_000 });
  expect(moved.subtitles[0]).toMatchObject({ lane: 0, startUs: 2_000_000, endUs: 3_000_000 });
  expect(applyCommand(p, { type: 'placeBlock', id: 'v', lane: 2, timeUs: 0 }).clips[0].lane).toBe(
    2,
  );
});
it('상대 시간/행 간격을 보존해 붙여넣고 새 ID를 부여한다', () => {
  const p = fixture();
  p.clips.push({ ...p.clips[0], id: 'v2', lane: 2, startUs: 4_000_000 });
  const next = applyCommand(p, {
    type: 'pasteBlocks',
    clips: p.clips,
    cues: [],
    lane: 0,
    timeUs: 8_000_000,
  });
  const copies = next.clips.slice(2);
  expect(copies.map((c) => [c.startUs, c.lane])).toEqual([
    [8_000_000, 0],
    [12_000_000, 2],
  ]);
  expect(copies[0].id).not.toBe('v');
  expect(copies[0].assetId).toBe('asset');
  expect(() =>
    applyCommand(p, { type: 'pasteBlocks', clips: p.clips, cues: [], lane: 0, timeUs: 0 }),
  ).toThrow();
});
it('다중 자막 잘라내기/붙여넣기를 각각 undo로 복구하며 행과 스타일을 보존한다', () => {
  const p = fixture();
  p.subtitles.push(cue('s2', 2, 2_000_000));
  const cut = historyReducer(initialHistory(p), {
    type: 'command',
    command: { type: 'deleteBlocks', ids: ['s', 's2'] },
  });
  expect(cut.present.subtitles).toHaveLength(0);
  const pasted = historyReducer(cut, {
    type: 'command',
    command: { type: 'pasteBlocks', clips: [], cues: p.subtitles, timeUs: 3_000_000, lane: 1 },
  });
  expect(pasted.present.subtitles.map((c) => [c.startUs, c.lane, c.text])).toEqual([
    [3_000_000, 1, 's'],
    [5_000_000, 2, 's2'],
  ]);
  const undoPaste = historyReducer(pasted, { type: 'undo' });
  expect(undoPaste.present).toEqual(cut.present);
  expect(historyReducer(undoPaste, { type: 'undo' }).present).toEqual(p);
});
it('동시 영상 전체를 행 순서로 해석하고 분할은 모든 행을 자른다', () => {
  const p = fixture();
  p.clips.push({ ...p.clips[0], id: 'v2', lane: 2 });
  expect(resolveAll(p, 500_000).map((r) => r.clip.id)).toEqual(['v2', 'v']);
  const next = applyCommand(p, { type: 'split', timeUs: 500_000 });
  expect(next.clips).toHaveLength(4);
  expect(next.subtitles).toHaveLength(2);
  expect(() => applyCommand(p, { type: 'merge', ids: ['v', 'v2'] })).toThrow();
});
it('트림은 다른 영상 행의 시간을 바꾸지 않으며 자막과의 충돌은 거부한다', () => {
  const p = fixture();
  p.clips.push({ ...p.clips[0], id: 'v2', lane: 2, startUs: 3_000_000 });
  const next = applyCommand(p, { type: 'trim', id: 'v', inUs: 0, outUs: 3_000_000 });
  expect(next.clips[1].startUs).toBe(3_000_000);
  p.subtitles.push(cue('same', 0, 2_000_000));
  expect(() => applyCommand(p, { type: 'trim', id: 'v', inUs: 0, outUs: 3_000_000 })).toThrow();
});
it('원본 누락 붙여넣기와 행 한도 초과는 거부한다', () => {
  const p = fixture();
  expect(() =>
    applyCommand(p, {
      type: 'pasteBlocks',
      clips: [{ ...p.clips[0], assetId: 'missing' }],
      cues: [],
      lane: 0,
      timeUs: 4_000_000,
    }),
  ).toThrow();
  expect(() => applyCommand({ ...p, laneCount: 32 }, { type: 'addLane' })).toThrow();
});
