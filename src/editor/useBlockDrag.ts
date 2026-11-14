import { useEffect, useRef, type PointerEvent } from 'react';
import { toUs, type Project } from '../project/model';
import { dragGroup, moveGroup, resolveMoveStart } from '../project/block-placement';
import type { Command } from '../project/commands';

export type BlockDragPreview = {
  ids: string[];
  deltaUs: number;
  lane: number;
  offsetY: number;
  invalid: boolean;
};
type Props = {
  project: Project;
  id: string;
  selectedIds: string[];
  zoom: number;
  locked: boolean;
  onSelect: (additive: boolean) => void;
  onTap?: () => void;
  onLaneChange: (lane: number) => void;
  onCommand: (command: Command) => void;
  onPreview: (draft?: BlockDragPreview) => void;
  onGestureChange: (active: boolean, moved?: boolean) => void;
};
export function useBlockDrag(p: Props) {
  const skip = useRef(false),
    gesture = useRef<
      | {
          pointerId: number;
          el: HTMLElement;
          x: number;
          y: number;
          scrollLeft: number;
          ids: string[];
          startUs: number;
          lane: number;
          lastLane: number;
          project: Project;
          moved: boolean;
        }
      | undefined
    >(undefined);
  function clear(suppress = false) {
    const g = gesture.current;
    gesture.current = undefined;
    if (g) {
      p.onPreview();
      p.onGestureChange(false, suppress && g.moved);
      if (g.el.hasPointerCapture(g.pointerId)) g.el.releasePointerCapture(g.pointerId);
    }
  }
  useEffect(
    () => () => {
      if (gesture.current) {
        gesture.current = undefined;
        p.onPreview();
        p.onGestureChange(false);
      }
    },
    [],
  );
  useEffect(() => {
    if (gesture.current && (p.locked || gesture.current.project !== p.project)) clear();
  }, [p.locked, p.project]);
  function candidate(x: number, y: number): BlockDragPreview {
    const g = gesture.current!,
      scroller = g.el.closest<HTMLElement>('.timeline-scroll')!,
      dx = x - g.x + scroller.scrollLeft - g.scrollLeft;
    g.moved ||= Math.hypot(dx, y - g.y) >= 3;
    if (!g.moved) return { ids: g.ids, deltaUs: 0, lane: g.lane, offsetY: 0, invalid: false };
    const rows = [...scroller.querySelectorAll<HTMLElement>('[data-lane]')],
      bounds = scroller.getBoundingClientRect(),
      ruler = scroller.querySelector('.ruler')!.getBoundingClientRect();
    const target =
      x >= bounds.left && x <= bounds.right && y >= ruler.bottom && y <= bounds.bottom
        ? rows.find((row) => {
            const box = row.getBoundingClientRect();
            return y >= box.top && y < box.bottom;
          })
        : undefined;
    const lane = g.ids.length > 1 ? g.lane : target ? Number(target.dataset.lane) : g.lastLane;
    g.lastLane = lane;
    let startUs = g.startUs + toUs(dx / p.zoom),
      invalid = false;
    try {
      startUs = resolveMoveStart(g.project, g.ids, lane, startUs, toUs(6 / p.zoom));
    } catch {
      invalid = true;
    }
    const from = rows.find((row) => Number(row.dataset.lane) === g.lane),
      to = rows.find((row) => Number(row.dataset.lane) === lane);
    return {
      ids: g.ids,
      deltaUs: startUs - g.startUs,
      lane,
      offsetY: from && to ? to.getBoundingClientRect().top - from.getBoundingClientRect().top : 0,
      invalid,
    };
  }
  return {
    consumeClick: () => {
      const value = skip.current;
      skip.current = false;
      return value;
    },
    cancel: () => clear(),
    events: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (p.locked || e.button !== 0 || (e.target as Element).closest('button')) return;
        e.preventDefault();
        e.stopPropagation();
        skip.current = true;
        e.currentTarget.focus({ preventScroll: true });
        if (e.ctrlKey || e.metaKey) {
          p.onSelect(true);
          return;
        }
        const ids = dragGroup(p.project, p.selectedIds, p.id),
          group = moveGroup(p.project, ids);
        if (ids.length === 1) p.onSelect(false);
        gesture.current = {
          pointerId: e.pointerId,
          el: e.currentTarget,
          x: e.clientX,
          y: e.clientY,
          scrollLeft: e.currentTarget.closest('.timeline-scroll')!.scrollLeft,
          ids,
          startUs: group.startUs,
          lane: group.lane,
          lastLane: group.lane,
          project: p.project,
          moved: false,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        p.onGestureChange(true);
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        if (gesture.current?.pointerId === e.pointerId)
          p.onPreview(candidate(e.clientX, e.clientY));
      },
      onPointerUp: (e: PointerEvent<HTMLElement>) => {
        if (gesture.current?.pointerId !== e.pointerId) return;
        e.preventDefault();
        e.stopPropagation();
        const draft = candidate(e.clientX, e.clientY),
          g = gesture.current;
        clear(true);
        if (g.moved && (draft.deltaUs || draft.lane !== g.lane)) {
          p.onLaneChange(draft.lane);
          p.onCommand({
            type: 'moveBlocks',
            ids: g.ids,
            lane: draft.lane,
            timeUs: g.startUs + draft.deltaUs,
          });
        } else if (!g.moved) {
          if (g.ids.length > 1) p.onSelect(false);
          p.onTap?.();
        }
      },
      onPointerCancel: () => clear(),
      onLostPointerCapture: () => {
        if (gesture.current) clear();
      },
    },
  };
}
