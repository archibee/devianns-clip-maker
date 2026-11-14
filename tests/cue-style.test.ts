import { expect, it } from 'vitest';
import { applyCommand, historyReducer, initialHistory } from '../src/project/commands';
import { emptyProject, type CueStyle } from '../src/project/model';

function fixture() {
  return {
    ...emptyProject(),
    subtitles: ['a', 'b', 'c'].map((id, i) => ({
      id,
      text: `내용 ${id}`,
      startUs: i * 2_000_000,
      endUs: (i + 1) * 2_000_000,
      size: 0.05,
      color: i === 1 ? '#ffff00' : '#ffffff',
      background: '#000000',
      x: 0.5,
      y: 0.9,
    })),
  };
}

it('선택한 자막에 변경한 스타일만 적용하고 내용·시간·나머지 스타일을 보존한다', () => {
  const p = fixture();
  const next = applyCommand(p, {
    type: 'cueStyle',
    ids: ['a', 'b'],
    patch: {
      background: '#112233',
      backgroundOpacity: 0.25,
      font: { postscriptName: 'TestFont', label: 'Test Font' },
    },
  });
  for (let i = 0; i < 2; i++)
    expect(next.subtitles[i]).toEqual({
      ...p.subtitles[i],
      background: '#112233',
      backgroundOpacity: 0.25,
      font: { postscriptName: 'TestFont', label: 'Test Font' },
    });
  expect(next.subtitles[2]).toEqual(p.subtitles[2]);
  expect(p.subtitles[0].background).toBe('#000000');
});

it('일괄 변경은 단일 undo/redo이며 선택 자막 삭제도 함께 되돌린다', () => {
  const p = fixture();
  const edited = historyReducer(initialHistory(p), {
    type: 'command',
    command: { type: 'cueStyle', ids: ['a', 'b'], patch: { size: 0.08 } },
  });
  expect(edited.past).toHaveLength(1);
  const undo = historyReducer(edited, { type: 'undo' });
  expect(undo.present).toEqual(p);
  expect(historyReducer(undo, { type: 'redo' }).present).toEqual(edited.present);
  const deleted = historyReducer(edited, {
    type: 'command',
    command: { type: 'deleteCues', ids: ['a', 'b'] },
  });
  expect(deleted.present.subtitles.map((c) => c.id)).toEqual(['c']);
  expect(historyReducer(deleted, { type: 'undo' }).present).toEqual(edited.present);
});

it('범위를 벗어난 스타일은 거부하고 내용·시간 주입은 무시한다', () => {
  const p = fixture();
  expect(() =>
    applyCommand(p, { type: 'cueStyle', ids: ['a', 'b'], patch: { backgroundOpacity: 2 } }),
  ).toThrow();
  expect(p.subtitles[0].background).toBe('#000000');
  const next = applyCommand(p, {
    type: 'cueStyle',
    ids: ['a', 'b'],
    patch: { color: '#123456', text: '변조', startUs: 99 } as Partial<CueStyle>,
  });
  expect(next.subtitles[0]).toEqual({ ...p.subtitles[0], color: '#123456' });
});
