import { expect, it } from 'vitest';
import { applyCommand, historyReducer, initialHistory } from '../src/project/commands';
import { defaultTransform, emptyProject, type Project } from '../src/project/model';

function fixture(): Project {
  return {
    ...emptyProject(),
    assets: [
      {
        id: 'source',
        name: 'test.mp4',
        size: 100,
        lastModified: 0,
        durationUs: 6_000_000,
        width: 1920,
        height: 1080,
        hasAudio: true,
        videoCodec: 'avc',
      },
    ],
    clips: ['a', 'b', 'c'].map((id, i) => ({
      id,
      assetId: 'source',
      inUs: 0,
      outUs: 2_000_000,
      startUs: i * 2_000_000,
      transform: { ...defaultTransform(), x: i * 0.1, scale: 1 + i * 0.2 },
    })),
  };
}
it('선택 영상의 지정 변환만 변경하고 원본·시간·비선택 영상을 보존한다', () => {
  const p = fixture();
  const next = applyCommand(p, { type: 'transforms', ids: ['a', 'b'], patch: { scale: 2 } });
  expect(next.clips).toEqual(
    p.clips.map((c) => (c.id === 'c' ? c : { ...c, transform: { ...c.transform, scale: 2 } })),
  );
  expect(p.clips[0].transform.scale).toBe(1);
});
it('크롭/이동을 한 번에 undo/redo하고 잘못된 값은 원본을 변경하지 않는다', () => {
  const p = fixture();
  const h = historyReducer(initialHistory(p), {
    type: 'command',
    command: {
      type: 'transforms',
      ids: ['a', 'b'],
      patch: { crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, x: 0.2, y: -0.1 },
    },
  });
  expect(h.past).toHaveLength(1);
  const undo = historyReducer(h, { type: 'undo' });
  expect(undo.present).toEqual(p);
  expect(historyReducer(undo, { type: 'redo' }).present).toEqual(h.present);
  expect(() =>
    applyCommand(p, { type: 'transforms', ids: ['a', 'b'], patch: { scale: 99 } }),
  ).toThrow();
  expect(p.clips[0].transform.scale).toBe(1);
});
it('합친 영상 내부 변환에도 변경한 항목만 적용하며 크롭 초기화가 가능하다', () => {
  const p = fixture();
  p.clips[0].parts = [
    {
      assetId: 'source',
      inUs: 0,
      outUs: 2_000_000,
      transform: {
        ...defaultTransform(),
        scale: 3,
        crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      },
    },
  ];
  p.clips[0].transform.crop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
  const next = applyCommand(p, {
    type: 'transforms',
    ids: ['a', 'b'],
    patch: { x: 0.3, crop: undefined },
  });
  expect(next.clips[0].parts![0].transform).toEqual({ ...defaultTransform(), scale: 3, x: 0.3 });
  expect(next.clips[0].transform.crop).toBeUndefined();
});
