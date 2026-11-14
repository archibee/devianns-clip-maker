import { expect, it } from 'vitest';
import { buildProject } from '../modules/speech-auto-cut/src/cut-plan';
import { defaultTransform, emptyProject, layout, type Project } from '../src/project/model';
import { historyReducer, initialHistory } from '../src/project/commands';

function project(): Project {
  return {
    ...emptyProject(),
    assets: [
      {
        id: 'a',
        name: 'clip.mp4',
        size: 1,
        lastModified: 0,
        durationUs: 4_000_000,
        width: 640,
        height: 360,
        hasAudio: true,
        videoCodec: 'avc',
      },
    ],
    clips: [{ id: 'c', assetId: 'a', inUs: 0, outUs: 4_000_000, transform: defaultTransform() }],
  };
}
const keep = [
  { startUs: 0, endUs: 1_000_000 },
  { startUs: 2_000_000, endUs: 3_500_000 },
];
it('최종 컷마다 빈 자막을 정확한 길이·기본 스타일로 만들고 원본은 변경하지 않는다', () => {
  const source = project(),
    result = buildProject(source, 'c', keep, true);
  expect(result.subtitles).toHaveLength(result.clips.length);
  expect(result.subtitles.map((q) => [q.startUs, q.endUs])).toEqual(
    layout(result).map((r) => [r.startUs, r.endUs]),
  );
  expect(result.subtitles.map((q) => [q.startUs, q.endUs])).toEqual([
    [0, 1_000_000],
    [1_000_000, 2_500_000],
  ]);
  for (const cue of result.subtitles)
    expect(cue).toMatchObject({
      text: '',
      size: 0.05,
      color: '#ffffff',
      background: '#000000',
      x: 0.5,
      y: 0.9,
    });
  expect(new Set(result.subtitles.map((q) => q.id)).size).toBe(2);
  expect(source.subtitles).toEqual([]);
  expect(source.clips).toHaveLength(1);
  expect(buildProject(source, 'c', keep).subtitles).toEqual([]);
  expect(
    buildProject(source, 'c', [{ startUs: 0, endUs: 3_500_000 }], true).subtitles,
  ).toHaveLength(1);
});
it('기존 자막을 보존하고 새 컷·새 라인 자막을 한 번의 undo/redo로 복원한다', () => {
  const source = project();
  source.subtitles = [
    {
      id: 'old',
      startUs: 0,
      endUs: 2_000_000,
      text: '기존',
      size: 0.05,
      color: '#ffffff',
      background: '#000000',
      x: 0.5,
      y: 0.9,
    },
  ];

  const result = buildProject(source, 'c', keep, true);
  expect(result.subtitles[0]).toEqual(source.subtitles[0]);
  expect(result.subtitles.slice(1).every((c) => c.lane === 2)).toBe(true);
  const applied = historyReducer(initialHistory(source), {
    type: 'command',
    command: { type: 'replaceTimeline', clips: result.clips, subtitles: result.subtitles },
  });
  const undone = historyReducer(applied, { type: 'undo' });
  expect(undone.present).toEqual(source);
  expect(historyReducer(undone, { type: 'redo' }).present).toEqual(result);
});
