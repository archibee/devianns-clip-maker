import { useRef, useState, type PointerEvent } from 'react';
import { seconds, toUs, cueLane, type Cue, type Project } from '../project/model';
import { cueDragRange, validateCueRange, type CueGesture } from '../project/subtitles';
import type { Command } from '../project/commands';
import { useBlockDrag, type BlockDragPreview } from './useBlockDrag';

type Props = {
  selectedIds: string[];
  dragPreview?: BlockDragPreview;
  onDragPreview: (draft?: BlockDragPreview) => void;
  onGestureChange: (active: boolean, moved?: boolean) => void;
  onLaneChange: (lane: number) => void;
  project: Project;
  cue: Cue;
  selected: boolean;
  multiple: boolean;
  locked: boolean;
  zoom: number;
  onSelect: (id: string, additive?: boolean) => void;
  onCommand: (command: Command) => void;
};
export function SubtitleBlock(p: Props) {
  const move = useBlockDrag({
    project: p.project,
    id: p.cue.id,
    selectedIds: p.selectedIds,
    zoom: p.zoom,
    locked: p.locked,
    onSelect: (additive) => p.onSelect(p.cue.id, additive),
    onLaneChange: p.onLaneChange,
    onCommand: p.onCommand,
    onPreview: p.onDragPreview,
    onGestureChange: p.onGestureChange,
  });
  const preview = p.dragPreview?.ids.includes(p.cue.id) ? p.dragPreview : undefined;
  const element = useRef<HTMLDivElement>(null);
  const pointerSelected = useRef(false);
  const gesture = useRef<{
    pointerId: number;
    x: number;
    mode: CueGesture;
    cue: Cue;
    lane: number;
  } | null>(null);
  const [draft, setDraft] = useState<{ startUs: number; endUs: number; lane?: number }>();
  const range =
    draft ??
    (preview
      ? { startUs: p.cue.startUs + preview.deltaUs, endUs: p.cue.endUs + preview.deltaUs }
      : p.cue);
  let invalid = preview?.invalid ?? false;
  if (draft) {
    try {
      validateCueRange(p.project, { ...p.cue, ...draft });
    } catch {
      invalid = true;
    }
  }
  function candidate(clientX: number) {
    const g = gesture.current!;
    if (Math.abs(clientX - g.x) < 3) return { startUs: g.cue.startUs, endUs: g.cue.endUs };
    return cueDragRange(p.project, g.cue, g.mode, toUs((clientX - g.x) / p.zoom), toUs(6 / p.zoom));
  }
  function begin(e: PointerEvent<HTMLElement>, mode: CueGesture) {
    if (mode === 'move') {
      move.events.onPointerDown(e);
      return;
    }
    if (p.locked || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    pointerSelected.current = true;
    p.onSelect(p.cue.id, e.ctrlKey || e.metaKey);
    element.current!.focus();
    if (e.ctrlKey || e.metaKey) return;
    element.current!.setPointerCapture(e.pointerId);
    gesture.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      mode,
      cue: p.cue,
      lane: cueLane(p.cue),
    };
  }
  function clear() {
    const g = gesture.current;
    if (g && element.current?.hasPointerCapture(g.pointerId))
      element.current.releasePointerCapture(g.pointerId);
    gesture.current = null;
    setDraft(undefined);
  }
  return (
    <div
      ref={element}
      className={`subtitle-block ${p.selected ? 'selected' : ''} ${invalid ? 'invalid' : ''}`}
      role="button"
      tabIndex={p.locked ? -1 : 0}
      aria-label={`자막: ${p.cue.text || '(빈 자막)'}`}
      aria-pressed={p.selected}
      title={p.cue.text}
      onClick={(e) => {
        if (pointerSelected.current) {
          pointerSelected.current = false;
          return;
        }
        if (move.consumeClick()) return;
        if (!p.locked) p.onSelect(p.cue.id, e.ctrlKey || e.metaKey);
      }}
      style={{
        left: seconds(range.startUs) * p.zoom,
        width: Math.max(4, seconds(range.endUs - range.startUs) * p.zoom),
        transform: preview ? `translateY(${preview.offsetY}px)` : undefined,
        zIndex: preview ? 4 : undefined,
      }}
      onPointerDown={(e) => begin(e, 'move')}
      onPointerMove={(e) => {
        if (gesture.current?.pointerId === e.pointerId) {
          setDraft({ ...candidate(e.clientX), lane: gesture.current.lane });
        } else move.events.onPointerMove(e);
      }}
      onPointerUp={(e) => {
        if (gesture.current?.pointerId === e.pointerId) {
          const result = candidate(e.clientX);
          clear();
          p.onCommand({ type: 'cueRange', id: p.cue.id, ...result });
        } else move.events.onPointerUp(e);
      }}
      onPointerCancel={() => {
        clear();
        move.cancel();
      }}
      onLostPointerCapture={() => move.events.onLostPointerCapture()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          pointerSelected.current = false;
          p.onSelect(p.cue.id, e.ctrlKey || e.metaKey);
        } else if (e.key === 'Escape') {
          clear();
          move.cancel();
        }
      }}
    >
      <span className="subtitle-label">T {p.cue.text}</span>
      {!p.multiple && (
        <>
          <button
            className="trim-handle in"
            aria-label="자막 시작 트림 핸들"
            disabled={p.locked}
            onPointerDown={(e) => begin(e, 'start')}
          >
            ‖
          </button>
          <button
            className="trim-handle out"
            aria-label="자막 끝 트림 핸들"
            disabled={p.locked}
            onPointerDown={(e) => begin(e, 'end')}
          >
            ‖
          </button>
        </>
      )}
    </div>
  );
}
