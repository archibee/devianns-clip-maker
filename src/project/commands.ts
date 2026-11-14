import {
  clipDuration,
  defaultTransform,
  duration,
  newId,
  layout,
  mediaLayout,
  clipLane,
  cueLane,
  laneCount,
  CUE_STYLE_KEYS,
  type Asset,
  type Clip,
  type Cue,
  type CueStyle,
  type Project,
} from './model';
import { validateCueRange } from './subtitles';
import { parseProject } from './validation';

export type Command =
  | { type: 'assets'; assets: Asset[] }
  | { type: 'insert'; assetId: string; index: number; lane?: number; timeUs?: number }
  | { type: 'addLane' }
  | { type: 'placeBlock'; id: string; lane: number; timeUs: number }
  | { type: 'deleteBlocks'; ids: string[] }
  | { type: 'pasteBlocks'; clips: Clip[]; cues: Cue[]; timeUs: number; lane: number }
  | { type: 'split'; timeUs: number }
  | { type: 'delete'; id: string }
  | { type: 'deleteClips'; ids: string[] }
  | { type: 'merge'; ids: string[] }
  | { type: 'pasteClips'; clips: Clip[]; timeUs: number }
  | { type: 'trim'; id: string; inUs: number; outUs: number }
  | { type: 'move'; id: string; index: number }
  | { type: 'transform'; id: string; transform: Clip['transform'] }
  | { type: 'transforms'; ids: string[]; patch: Partial<Clip['transform']> }
  | { type: 'cue'; cue: Cue }
  | { type: 'cueRange'; id: string; startUs: number; endUs: number }
  | { type: 'deleteCue'; id: string }
  | { type: 'deleteCues'; ids: string[] }
  | { type: 'cueStyle'; ids: string[]; patch: Partial<CueStyle> }
  | { type: 'replaceTimeline'; clips: Clip[]; subtitles: Cue[]; laneCount?: number }
  | { type: 'settings'; patch: Partial<Pick<Project, 'name' | 'aspect' | 'fps'>> };

export function applyCommand(p: Project, cmd: Command): Project {
  let result = p;
  switch (cmd.type) {
    case 'addLane':
      if (laneCount(p) >= 32) throw new Error('타임라인은 최대 32행까지 추가할 수 있습니다.');
      result = { ...p, laneCount: laneCount(p) + 1 };
      break;
    case 'deleteBlocks':
      result = {
        ...p,
        clips: layout(p)
          .filter((r) => !cmd.ids.includes(r.clip.id))
          .map((r) => ({ ...r.clip, startUs: r.startUs })),
        subtitles: p.subtitles.filter((c) => !cmd.ids.includes(c.id)),
      };
      break;
    case 'placeBlock': {
      if (
        !Number.isInteger(cmd.lane) ||
        cmd.lane < 0 ||
        cmd.lane >= laneCount(p) ||
        !Number.isSafeInteger(cmd.timeUs) ||
        cmd.timeUs < 0
      )
        throw new Error('블록 위치가 올바르지 않습니다.');
      result = {
        ...p,
        clips: layout(p).map((r) => ({
          ...r.clip,
          startUs: r.clip.id === cmd.id ? cmd.timeUs : r.startUs,
          ...(r.clip.id === cmd.id ? { lane: cmd.lane } : {}),
        })),
        subtitles: p.subtitles.map((c) =>
          c.id === cmd.id
            ? { ...c, lane: cmd.lane, startUs: cmd.timeUs, endUs: cmd.timeUs + c.endUs - c.startUs }
            : c,
        ),
      };
      result = parseProject(JSON.stringify(result));
      break;
    }
    case 'pasteBlocks': {
      if (!cmd.clips.length && !cmd.cues.length) return p;
      const first = Math.min(
        ...cmd.clips.map((c) => c.startUs ?? 0),
        ...cmd.cues.map((c) => c.startUs),
      );
      const firstLane = Math.min(...cmd.clips.map(clipLane), ...cmd.cues.map(cueLane));
      const clips = cmd.clips.map((c) => ({
        ...structuredClone(c),
        id: newId(),
        lane: cmd.lane + clipLane(c) - firstLane,
        startUs: cmd.timeUs + (c.startUs ?? 0) - first,
      }));
      const cues = cmd.cues.map((c) => ({
        ...structuredClone(c),
        id: newId(),
        lane: cmd.lane + cueLane(c) - firstLane,
        startUs: cmd.timeUs + c.startUs - first,
        endUs: cmd.timeUs + c.endUs - first,
      }));
      const count = Math.max(
        laneCount(p),
        ...clips.map((c) => c.lane + 1),
        ...cues.map((c) => c.lane + 1),
      );
      result = parseProject(
        JSON.stringify({
          ...p,
          laneCount: count,
          clips: [...layout(p).map((r) => ({ ...r.clip, startUs: r.startUs })), ...clips],
          subtitles: [...p.subtitles, ...cues],
        }),
      );
      break;
    }
    case 'assets':
      result = { ...p, assets: [...p.assets, ...cmd.assets] };
      break;
    case 'insert': {
      const asset = p.assets.find((a) => a.id === cmd.assetId);
      if (!asset) throw new Error('에셋을 찾을 수 없습니다.');
      if (cmd.lane !== undefined) {
        if (cmd.lane < 0 || cmd.lane >= laneCount(p)) throw new Error('대상 행이 없습니다.');
        result = parseProject(
          JSON.stringify({
            ...p,
            clips: [
              ...layout(p).map((r) => ({ ...r.clip, startUs: r.startUs })),
              {
                id: newId(),
                assetId: asset.id,
                inUs: 0,
                outUs: asset.durationUs,
                transform: defaultTransform(),
                lane: cmd.lane,
                startUs: cmd.timeUs ?? 0,
              },
            ],
          }),
        );
        break;
      }
      const rows = layout(p);
      const index = Math.max(0, Math.min(rows.length, cmd.index));
      const startUs = rows[index]?.startUs ?? rows.at(-1)?.endUs ?? 0;
      const clips = rows.map((row, i) => ({
        ...row.clip,
        startUs: row.startUs + (i >= index ? asset.durationUs : 0),
      }));
      clips.splice(index, 0, {
        id: newId(),
        assetId: asset.id,
        inUs: 0,
        outUs: asset.durationUs,
        transform: defaultTransform(),
        startUs,
      });
      result = { ...p, clips };
      break;
    }
    case 'split': {
      if (!Number.isSafeInteger(cmd.timeUs) || cmd.timeUs <= 0 || cmd.timeUs >= duration(p))
        return p;
      let changedClip = false;
      const splitClips = layout(p).flatMap((item) => {
        if (item.startUs < cmd.timeUs && cmd.timeUs < item.endUs) {
          changedClip = true;
          const sourceUs = item.clip.inUs + cmd.timeUs - item.startUs;
          return [
            { ...item.clip, startUs: item.startUs, outUs: sourceUs },
            { ...item.clip, id: newId(), startUs: cmd.timeUs, inUs: sourceUs },
          ];
        }
        return [{ ...item.clip, startUs: item.startUs }];
      });
      const clips = changedClip ? splitClips : p.clips;
      let changedCue = false;
      const subtitles = p.subtitles.flatMap((cue) => {
        if (cue.startUs < cmd.timeUs && cmd.timeUs < cue.endUs) {
          changedCue = true;
          return [
            { ...cue, endUs: cmd.timeUs },
            { ...cue, id: newId(), startUs: cmd.timeUs },
          ];
        }
        return [cue];
      });
      if (clips === p.clips && !changedCue) return p;
      result = { ...p, clips, subtitles: changedCue ? subtitles : p.subtitles };
      break;
    }
    case 'delete':
      result = {
        ...p,
        clips: layout(p)
          .filter((row) => row.clip.id !== cmd.id)
          .map((row) => ({ ...row.clip, startUs: row.startUs })),
      };
      break;
    case 'deleteClips':
      result = {
        ...p,
        clips: layout(p)
          .filter((row) => !cmd.ids.includes(row.clip.id))
          .map((row) => ({ ...row.clip, startUs: row.startUs })),
      };
      break;
    case 'pasteClips': {
      if (
        cmd.clips.some((c) =>
          (c.parts ?? [c]).some((part) => !p.assets.some((a) => a.id === part.assetId)),
        )
      )
        throw new Error('복사한 영상의 원본이 현재 프로젝트에 없습니다. 영상을 다시 복사하세요.');
      if (!Number.isSafeInteger(cmd.timeUs) || cmd.timeUs < 0)
        throw new Error('붙여넣기 위치가 올바르지 않습니다.');
      let cursor = cmd.timeUs;
      const copies = cmd.clips.map((c) => {
        const copy = { ...structuredClone(c), id: newId(), startUs: cursor };
        cursor += clipDuration(c);
        return copy;
      });
      if (!Number.isSafeInteger(cursor)) throw new Error('타임라인 시간이 너무 큽니다.');
      if (layout(p).some((c) => c.startUs < cursor && c.endUs > cmd.timeUs))
        throw new Error('영상이 겹칩니다. 빈 위치나 타임라인 끝에 붙여넣으세요.');
      const existing = layout(p).map((c) => ({ ...c.clip, startUs: c.startUs }));
      result = { ...p, clips: [...existing, ...copies].sort((a, b) => a.startUs! - b.startUs!) };
      break;
    }
    case 'merge': {
      const selected = p.clips.filter((c) => cmd.ids.includes(c.id));
      if (selected.length < 2) return p;
      const rows = layout(p);
      const selectedRows = rows.filter((row) => cmd.ids.includes(row.clip.id));
      selectedRows.sort((a, b) => a.startUs - b.startUs);
      if (selectedRows.some((r) => clipLane(r.clip) !== clipLane(selectedRows[0].clip)))
        throw new Error('같은 행의 영상만 합칠 수 있습니다.');
      if (selectedRows.some((row, i) => i > 0 && row.startUs !== selectedRows[i - 1].endUs))
        throw new Error(
          '서로 맞닿은 영상 블록을 선택해 합치세요. 빈 구간이나 다른 영상은 이동하지 않습니다.',
        );
      const parts = mediaLayout(p)
        .filter((c) => cmd.ids.includes(c.clip.id))
        .sort((a, b) => a.startUs - b.startUs)
        .map((c) => ({
          assetId: c.clip.assetId,
          inUs: c.clip.inUs,
          outUs: c.clip.outUs,
          transform: structuredClone(c.clip.transform),
        }));
      const length = parts.reduce((sum, c) => sum + c.outUs - c.inUs, 0);
      const merged: Clip = {
        lane: selectedRows[0].clip.lane,
        id: newId(),
        assetId: parts[0].assetId,
        inUs: 0,
        outUs: length,
        transform: structuredClone(parts[0].transform),
        parts,
        startUs: selectedRows[0].startUs,
      };
      const index = p.clips.findIndex((c) => cmd.ids.includes(c.id));
      const clips: Clip[] = rows
        .filter((row) => !cmd.ids.includes(row.clip.id))
        .map((row) => ({ ...row.clip, startUs: row.startUs }));
      clips.splice(index, 0, merged);
      result = { ...p, clips };
      break;
    }
    case 'trim': {
      const clip = p.clips.find((c) => c.id === cmd.id);
      if (!clip) return p;
      if (clip.inUs === cmd.inUs && clip.outUs === cmd.outUs) return p;
      const asset = p.assets.find((a) => a.id === clip.assetId)!;
      if (
        !Number.isSafeInteger(cmd.inUs) ||
        !Number.isSafeInteger(cmd.outUs) ||
        cmd.inUs < 0 ||
        cmd.outUs <= cmd.inUs ||
        cmd.outUs >
          (clip.parts ? clip.parts.reduce((sum, c) => sum + c.outUs - c.inUs, 0) : asset.durationUs)
      ) {
        throw new Error('원본 범위 안에서 시작 < 끝으로 지정하세요.');
      }
      result = {
        ...p,
        clips: layout(p).map((row) => {
          const delta = cmd.outUs - cmd.inUs - clipDuration(clip);
          const selectedEnd = layout(p).find((r) => r.clip.id === clip.id)!.endUs;
          return row.clip.id === cmd.id
            ? { ...row.clip, startUs: row.startUs, inUs: cmd.inUs, outUs: cmd.outUs }
            : {
                ...row.clip,
                startUs:
                  row.startUs +
                  (row.startUs >= selectedEnd && clipLane(row.clip) === clipLane(clip) ? delta : 0),
              };
        }),
      };
      break;
    }
    case 'move': {
      const clip = p.clips.find((c) => c.id === cmd.id);
      if (!clip) return p;
      if (p.clips.some((c) => c.lane !== undefined)) {
        const laneRows = layout(p)
          .filter((r) => clipLane(r.clip) === clipLane(clip))
          .sort((a, b) => a.startUs - b.startUs);
        const old = p.clips.indexOf(clip);
        const direction = cmd.index < old ? -1 : 1;
        const i = laneRows.findIndex((r) => r.clip.id === clip.id),
          other = laneRows[i + direction];
        if (!other) return p;
        const ordered = laneRows.map((r) => r.clip);
        [ordered[i], ordered[i + direction]] = [ordered[i + direction], ordered[i]];
        let cursor = laneRows[0].startUs;
        const starts = new Map<string, number>();
        ordered.forEach((c, j) => {
          if (j) cursor += laneRows[j].startUs - laneRows[j - 1].endUs;
          starts.set(c.id, cursor);
          cursor += clipDuration(c);
        });
        result = parseProject(
          JSON.stringify({
            ...p,
            clips: layout(p)
              .map((r) => ({ ...r.clip, startUs: starts.get(r.clip.id) ?? r.startUs }))
              .sort((a, b) => a.startUs - b.startUs),
          }),
        );
        break;
      }
      const clips = p.clips.filter((c) => c.id !== cmd.id);
      clips.splice(Math.max(0, Math.min(clips.length, cmd.index)), 0, clip);
      const rows = layout(p);
      let cursor = rows[0]?.startUs ?? 0;
      result = {
        ...p,
        clips: clips.map((c, i) => {
          if (i) cursor += rows[i].startUs - rows[i - 1].endUs;
          const next = { ...c, startUs: cursor };
          cursor += clipDuration(c);
          return next;
        }),
      };
      break;
    }
    case 'transforms': {
      const keys = ['fit', 'scale', 'x', 'y', 'crop'] as const;
      const patch = Object.fromEntries(
        keys
          .filter((key) => Object.prototype.hasOwnProperty.call(cmd.patch, key))
          .map((key) => [key, cmd.patch[key]]),
      );
      if (!Object.keys(patch).length || !p.clips.some((c) => cmd.ids.includes(c.id))) return p;
      result = parseProject(
        JSON.stringify({
          ...p,
          clips: p.clips.map((c) =>
            cmd.ids.includes(c.id)
              ? {
                  ...c,
                  transform: { ...c.transform, ...patch },
                  ...(c.parts
                    ? {
                        parts: c.parts.map((part) => ({
                          ...part,
                          transform: { ...part.transform, ...patch },
                        })),
                      }
                    : {}),
                }
              : c,
          ),
        }),
      );
      break;
    }
    case 'transform':
      result = {
        ...p,
        clips: p.clips.map((c) =>
          c.id === cmd.id
            ? {
                ...c,
                transform: cmd.transform,
                ...(c.parts
                  ? { parts: c.parts.map((part) => ({ ...part, transform: cmd.transform })) }
                  : {}),
              }
            : c,
        ),
      };
      break;
    case 'cue': {
      const previous = p.subtitles.find((c) => c.id === cmd.cue.id);
      if (!previous || previous.startUs !== cmd.cue.startUs || previous.endUs !== cmd.cue.endUs)
        validateCueRange(p, cmd.cue);
      result = { ...p, subtitles: [...p.subtitles.filter((c) => c.id !== cmd.cue.id), cmd.cue] };
      break;
    }
    case 'cueRange': {
      const cue = p.subtitles.find((c) => c.id === cmd.id);
      if (!cue || (cue.startUs === cmd.startUs && cue.endUs === cmd.endUs)) return p;
      const updated = { ...cue, startUs: cmd.startUs, endUs: cmd.endUs };
      validateCueRange(p, updated);
      result = { ...p, subtitles: p.subtitles.map((c) => (c.id === cue.id ? updated : c)) };
      break;
    }
    case 'deleteCue':
      result = { ...p, subtitles: p.subtitles.filter((c) => c.id !== cmd.id) };
      break;
    case 'deleteCues':
      result = { ...p, subtitles: p.subtitles.filter((c) => !cmd.ids.includes(c.id)) };
      break;
    case 'cueStyle': {
      const patch = Object.fromEntries(
        CUE_STYLE_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(cmd.patch, key)).map(
          (key) => [key, cmd.patch[key]],
        ),
      );
      if (!Object.keys(patch).length || !p.subtitles.some((c) => cmd.ids.includes(c.id))) return p;
      result = parseProject(
        JSON.stringify({
          ...p,
          subtitles: p.subtitles.map((c) => (cmd.ids.includes(c.id) ? { ...c, ...patch } : c)),
        }),
      );
      break;
    }
    case 'settings':
      result = { ...p, ...cmd.patch };
      break;
    case 'replaceTimeline':
      result = {
        ...p,
        laneCount: cmd.laneCount ?? laneCount({ ...p, clips: cmd.clips, subtitles: cmd.subtitles }),
        clips: cmd.clips,
        subtitles: cmd.subtitles,
      };
      break;
  }
  if (!Number.isSafeInteger(duration(result))) throw new Error('타임라인 시간이 너무 큽니다.');
  if (cmd.type === 'trim' || cmd.type === 'move') return parseProject(JSON.stringify(result));
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
        ? Math.min(
            c.parts ? c.parts.reduce((sum, p) => sum + p.outUs - p.inUs, 0) : a.durationUs,
            Math.max(c.inUs + minimum, c.outUs + deltaUs),
          )
        : c.outUs,
  };
}
