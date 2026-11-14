import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { clipLane, seconds, timecode, toUs, type Clip, type Project } from '../project/model';
import { snapBlockStart, validateBlockPlacement } from '../project/block-placement';
import type { Command } from '../project/commands';
import { TimelineIcon } from './TimelineIcon';

type Props = {
  project: Project;
  clip: Clip;
  startUs: number;
  endUs: number;
  index: number;
  zoom: number;
  locked: boolean;
  selectedIds: string[];
  selectedCueIds: string[];
  handles: ReactNode;
  onSelect: (id: string, additive?: boolean, seek?: boolean) => void;
  onSeek: (us: number) => void;
  onLaneChange: (lane: number) => void;
  onCommand: (command: Command) => void;
  onGestureChange: (active: boolean, moved?: boolean) => void;
};
type Draft = { startUs: number; lane: number; offsetY: number };
export function VideoBlock(p: Props) {
  const element = useRef<HTMLDivElement>(null),
    pointerSelected = useRef(false);
  const gesture = useRef<
    | {
        pointerId: number;
        x: number;
        y: number;
        scrollLeft: number;
        project: Project;
        moved: boolean;
      }
    | undefined
  >(undefined);
  const [draft, setDraft] = useState<Draft>();
  useEffect(
    () => () => {
      gesture.current = undefined;
      p.onGestureChange(false);
    },
    [],
  );
  const asset = p.project.assets.find((a) => a.id === p.clip.assetId)!;
  const audioParts = (p.clip.parts ?? [p.clip]).filter(
    (part) => p.project.assets.find((a) => a.id === part.assetId)?.hasAudio,
  );
  const muted =
    audioParts.length > 0 && (p.clip.muted ?? audioParts.every((part) => part.muted === true));
  const selected = p.selectedIds.includes(p.clip.id);
  let invalid = false;
  if (draft) {
    try {
      validateBlockPlacement(p.project, p.clip.id, draft.lane, draft.startUs);
    } catch {
      invalid = true;
    }
  }
  function clear(suppressClick = false) {
    const g = gesture.current;
    gesture.current = undefined;
    setDraft(undefined);
    if (g) {
      p.onGestureChange(false, suppressClick && g.moved);
      if (element.current?.hasPointerCapture(g.pointerId))
        element.current.releasePointerCapture(g.pointerId);
    }
  }
  useEffect(() => {
    if (gesture.current && (p.locked || gesture.current.project !== p.project)) clear();
  }, [p.locked, p.project]);
  function candidate(clientX: number, clientY: number): Draft {
    const g = gesture.current!,
      el = element.current!,
      scroller = el.closest<HTMLElement>('.timeline-scroll')!;
    const dx = clientX - g.x + scroller.scrollLeft - g.scrollLeft;
    g.moved ||= Math.hypot(dx, clientY - g.y) >= 3;
    if (!g.moved) return { startUs: p.startUs, lane: clipLane(p.clip), offsetY: 0 };
    const lineElements = [...scroller.querySelectorAll<HTMLElement>('[data-lane]')];
    const bounds = scroller.getBoundingClientRect(),
      ruler = scroller.querySelector('.ruler')!.getBoundingClientRect();
    const target =
      clientX >= bounds.left &&
      clientX <= bounds.right &&
      clientY >= ruler.bottom &&
      clientY <= bounds.bottom
        ? lineElements.find((row) => {
            const rect = row.getBoundingClientRect();
            return clientY >= rect.top && clientY < rect.bottom;
          })
        : undefined;
    const lane = target ? Number(target.dataset.lane) : (draft?.lane ?? clipLane(p.clip));
    const from = lineElements.find((row) => Number(row.dataset.lane) === clipLane(p.clip));
    const to = lineElements.find((row) => Number(row.dataset.lane) === lane);
    return {
      startUs: snapBlockStart(
        g.project,
        p.clip.id,
        lane,
        p.startUs + toUs(dx / p.zoom),
        toUs(6 / p.zoom),
      ),
      lane,
      offsetY: from && to ? to.getBoundingClientRect().top - from.getBoundingClientRect().top : 0,
    };
  }
  function begin(e: PointerEvent<HTMLDivElement>) {
    if (p.locked || e.button !== 0 || (e.target as Element).closest('button')) return;
    e.preventDefault();
    e.stopPropagation();
    pointerSelected.current = true;
    p.onSelect(p.clip.id, e.ctrlKey || e.metaKey, false);
    e.currentTarget.focus({ preventScroll: true });
    if (e.ctrlKey || e.metaKey) return;
    gesture.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      scrollLeft: e.currentTarget.closest('.timeline-scroll')!.scrollLeft,
      project: p.project,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    p.onGestureChange(true);
  }
  return (
    <div
      ref={element}
      className={`timeline-clip ${selected ? 'selected' : ''} ${draft ? 'dragging' : ''} ${invalid ? 'invalid' : ''}`}
      role="button"
      tabIndex={p.locked ? -1 : 0}
      aria-label={`클립 ${p.index + 1}: ${asset.name}`}
      aria-pressed={selected}
      draggable={false}
      style={{
        left: seconds(draft?.startUs ?? p.startUs) * p.zoom,
        width: Math.max(5, seconds(p.endUs - p.startUs) * p.zoom),
        transform: draft ? `translateY(${draft.offsetY}px)` : undefined,
      }}
      onPointerDown={begin}
      onPointerMove={(e) => {
        if (gesture.current?.pointerId === e.pointerId) setDraft(candidate(e.clientX, e.clientY));
      }}
      onPointerUp={(e) => {
        if (gesture.current?.pointerId !== e.pointerId) return;
        e.preventDefault();
        e.stopPropagation();
        const result = candidate(e.clientX, e.clientY),
          g = gesture.current;
        clear(true);
        if (g.moved && (result.startUs !== p.startUs || result.lane !== clipLane(p.clip))) {
          p.onLaneChange(result.lane);
          p.onCommand({
            type: 'placeBlock',
            id: p.clip.id,
            lane: result.lane,
            timeUs: result.startUs,
          });
        } else if (!g.moved) p.onSeek(p.startUs);
      }}
      onPointerCancel={() => clear()}
      onLostPointerCapture={() => {
        if (gesture.current) clear();
      }}
      onClick={(e) => {
        if ((e.target as Element).closest('button')) return;
        if (pointerSelected.current) {
          pointerSelected.current = false;
          return;
        }
        if (!p.locked) p.onSelect(p.clip.id, e.ctrlKey || e.metaKey);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          clear();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          pointerSelected.current = false;
          p.onSelect(p.clip.id, e.ctrlKey || e.metaKey);
        }
      }}
    >
      <div className="clip-video">
        <span className="clip-number">{String(p.index + 1).padStart(2, '0')}</span>
        <strong>{asset.name}</strong>
        <small>{timecode(p.endUs - p.startUs, p.project.fps)}</small>
      </div>
      <div className={`clip-audio ${!audioParts.length || muted ? 'silent' : ''}`}>
        <span>{audioParts.length ? (muted ? '음소거됨' : '원본 오디오') : '무음 원본'}</span>
        <button
          className="clip-mute"
          aria-label={`클립 ${p.index + 1} ${muted ? '음소거 해제' : '음소거'}`}
          aria-pressed={muted}
          disabled={p.locked || !audioParts.length}
          draggable={false}
          title={
            selected && p.selectedIds.length > 1
              ? '선택 영상 전체에 적용'
              : muted
                ? '이 블록 음소거 해제'
                : '이 블록 음소거'
          }
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.code === 'Space') e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            p.onCommand({
              type: 'muteClips',
              ids: selected ? [...p.selectedIds, ...p.selectedCueIds] : [p.clip.id],
              muted: !muted,
            });
          }}
        >
          <TimelineIcon name={muted ? 'mute' : 'volume'} />
          <span>{muted ? '해제' : '음소거'}</span>
        </button>
      </div>
      {p.handles}
    </div>
  );
}
