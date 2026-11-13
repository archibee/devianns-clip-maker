import { useRef, useState, type PointerEvent } from 'react';
import { seconds, toUs, type Cue, type Project } from '../project/model';
import { cueDragRange, validateCueRange, type CueGesture } from '../project/subtitles';
import type { Command } from '../project/commands';

type Props = {
  project: Project;
  cue: Cue;
  selected: boolean;
  locked: boolean;
  zoom: number;
  onSelect: (id: string) => void;
  onCommand: (command: Command) => void;
};
export function SubtitleBlock(p: Props) {
  const element = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ pointerId: number; x: number; mode: CueGesture; cue: Cue } | null>(null);
  const [draft, setDraft] = useState<{ startUs: number; endUs: number }>();
  const range = draft ?? p.cue;
  let invalid = false;
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
  function begin(e: PointerEvent, mode: CueGesture) {
    if (p.locked || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    p.onSelect(p.cue.id);
    element.current!.focus();
    element.current!.setPointerCapture(e.pointerId);
    gesture.current = { pointerId: e.pointerId, x: e.clientX, mode, cue: p.cue };
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
      onClick={() => {
        if (!p.locked) p.onSelect(p.cue.id);
      }}
      style={{
        left: seconds(range.startUs) * p.zoom,
        width: Math.max(4, seconds(range.endUs - range.startUs) * p.zoom),
      }}
      onPointerDown={(e) => begin(e, 'move')}
      onPointerMove={(e) => {
        if (gesture.current?.pointerId === e.pointerId) setDraft(candidate(e.clientX));
      }}
      onPointerUp={(e) => {
        if (gesture.current?.pointerId === e.pointerId) {
          const result = candidate(e.clientX);
          clear();
          p.onCommand({ type: 'cueRange', id: p.cue.id, ...result });
        }
      }}
      onPointerCancel={clear}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          p.onSelect(p.cue.id);
        } else if (e.key === 'Escape') clear();
      }}
    >
      <span className="subtitle-label">T {p.cue.text}</span>
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
    </div>
  );
}
