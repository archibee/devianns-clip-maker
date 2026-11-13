import {
  clipDuration,
  defaultTransform,
  duration,
  MAX_DURATION_US,
  newId,
  resolve,
  type Asset,
  type Clip,
  type Cue,
  type Project,
} from './model';

export type Command =
  | { type: 'assets'; assets: Asset[] }
  | { type: 'insert'; assetId: string; index: number }
  | { type: 'split'; timeUs: number }
  | { type: 'delete'; id: string }
  | { type: 'trim'; id: string; inUs: number; outUs: number }
  | { type: 'move'; id: string; index: number }
  | { type: 'transform'; id: string; transform: Clip['transform'] }
  | { type: 'cue'; cue: Cue }
  | { type: 'deleteCue'; id: string }
  | { type: 'settings'; patch: Partial<Pick<Project, 'name' | 'aspect' | 'fps'>> };

export function applyCommand(p: Project, cmd: Command): Project {
  let result = p;
  switch (cmd.type) {
    case 'assets':
      result = { ...p, assets: [...p.assets, ...cmd.assets] };
      break;
    case 'insert': {
      const asset = p.assets.find((a) => a.id === cmd.assetId);
      if (!asset) throw new Error('에셋을 찾을 수 없습니다.');
      const clips = [...p.clips];
      clips.splice(Math.max(0, Math.min(clips.length, cmd.index)), 0, {
        id: newId(),
        assetId: asset.id,
        inUs: 0,
        outUs: asset.durationUs,
        transform: defaultTransform(),
      });
      result = { ...p, clips };
      break;
    }
    case 'split': {
      const item = resolve(p, cmd.timeUs);
      if (!item || item.sourceUs <= item.clip.inUs || item.sourceUs >= item.clip.outUs) return p;
      const index = p.clips.indexOf(item.clip);
      const clips = [...p.clips];
      clips.splice(
        index,
        1,
        { ...item.clip, outUs: item.sourceUs },
        { ...item.clip, id: newId(), inUs: item.sourceUs },
      );
      result = { ...p, clips };
      break;
    }
    case 'delete':
      result = { ...p, clips: p.clips.filter((c) => c.id !== cmd.id) };
      break;
    case 'trim': {
      const clip = p.clips.find((c) => c.id === cmd.id);
      if (!clip) return p;
      const asset = p.assets.find((a) => a.id === clip.assetId)!;
      if (
        !Number.isSafeInteger(cmd.inUs) ||
        !Number.isSafeInteger(cmd.outUs) ||
        cmd.inUs < 0 ||
        cmd.outUs <= cmd.inUs ||
        cmd.outUs > asset.durationUs
      ) {
        throw new Error('원본 범위 안에서 시작 < 끝으로 지정하세요.');
      }
      result = {
        ...p,
        clips: p.clips.map((c) =>
          c.id === cmd.id ? { ...c, inUs: cmd.inUs, outUs: cmd.outUs } : c,
        ),
      };
      break;
    }
    case 'move': {
      const clip = p.clips.find((c) => c.id === cmd.id);
      if (!clip) return p;
      const clips = p.clips.filter((c) => c.id !== cmd.id);
      clips.splice(Math.max(0, Math.min(clips.length, cmd.index)), 0, clip);
      result = { ...p, clips };
      break;
    }
    case 'transform':
      result = {
        ...p,
        clips: p.clips.map((c) => (c.id === cmd.id ? { ...c, transform: cmd.transform } : c)),
      };
      break;
    case 'cue':
      result = { ...p, subtitles: [...p.subtitles.filter((c) => c.id !== cmd.cue.id), cmd.cue] };
      break;
    case 'deleteCue':
      result = { ...p, subtitles: p.subtitles.filter((c) => c.id !== cmd.id) };
      break;
    case 'settings':
      result = { ...p, ...cmd.patch };
      break;
  }
  if (duration(result) > MAX_DURATION_US)
    throw new Error('현재 버전은 프로젝트 길이 5분까지 편집합니다.');
  return result;
}

export type History = { present: Project; past: Project[]; future: Project[] };
export type HistoryAction =
  | { type: 'command'; command: Command }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'load'; project: Project };
export const initialHistory = (project: Project): History => ({
  present: project,
  past: [],
  future: [],
});
export function historyReducer(h: History, action: HistoryAction): History {
  if (action.type === 'load') return initialHistory(action.project);
  if (action.type === 'undo') {
    if (!h.past.length) return h;
    return { present: h.past.at(-1)!, past: h.past.slice(0, -1), future: [h.present, ...h.future] };
  }
  if (action.type === 'redo') {
    if (!h.future.length) return h;
    return {
      present: h.future[0],
      past: [...h.past, h.present].slice(-100),
      future: h.future.slice(1),
    };
  }
  const present = applyCommand(h.present, action.command);
  return present === h.present
    ? h
    : { present, past: [...h.past, h.present].slice(-100), future: [] };
}

export function trimAt(p: Project, id: string, side: 'in' | 'out', deltaUs: number) {
  const c = p.clips.find((x) => x.id === id)!;
  const a = p.assets.find((x) => x.id === c.assetId)!;
  const minimum = Math.min(clipDuration(c), Math.round(1_000_000 / p.fps));
  return {
    type: 'trim' as const,
    id,
    inUs: side === 'in' ? Math.max(0, Math.min(c.outUs - minimum, c.inUs + deltaUs)) : c.inUs,
    outUs:
      side === 'out'
        ? Math.min(a.durationUs, Math.max(c.inUs + minimum, c.outUs + deltaUs))
        : c.outUs,
  };
}
