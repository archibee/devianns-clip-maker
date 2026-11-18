import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import {
  clamp,
  fitColumns,
  resizeRows,
  workspaceMode,
  type WorkspaceMode,
} from './workspace-layout';
import './workspace-resize.css';
type Layout = { mode: WorkspaceMode; rows: number[]; columns: [number, number] };
type Handle = {
  id: string;
  axis: 'x' | 'y';
  index: number;
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
};
type Metrics = {
  mode: WorkspaceMode;
  width: number;
  height: number;
  gap: number;
  rows: number[];
  columns: [number, number];
  handles: Handle[];
};
export function useWorkspaceResize(locked: boolean) {
  const ref = useRef<HTMLElement>(null),
    grab = useRef<
      | {
          id: number;
          element: HTMLElement;
          handle: Handle;
          x: number;
          y: number;
          layout: Layout;
          before: Layout | undefined;
        }
      | undefined
    >(undefined);
  const [custom, setCustom] = useState<Layout>(),
    [metrics, setMetrics] = useState<Metrics>(),
    [isResizing, setResizing] = useState(false);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    let frame = 0;
    const measure = () => {
      const nodes = ['.asset-panel', '.preview-panel', '.inspector-panel', '.timeline-panel'].map(
        (selector) => root.querySelector<HTMLElement>(selector),
      );
      if (nodes.some((node) => !node)) return;
      const [asset, preview, inspector, timeline] = nodes.map((node) =>
          node!.getBoundingClientRect(),
        ),
        bounds = root.getBoundingClientRect(),
        css = getComputedStyle(root);
      const mode = workspaceMode(innerWidth),
        gap = parseFloat(css.gap) || 8,
        handles: Handle[] = [];
      const vertical = (left: DOMRect, right: DOMRect, index: number, label: string) =>
        handles.push({
          id: `x-${index}`,
          axis: 'x',
          index,
          label,
          left: (left.right + right.left) / 2 - bounds.left - 4,
          top: left.top - bounds.top,
          width: 8,
          height: left.height,
        });
      const horizontal = (top: DOMRect, bottom: DOMRect, index: number, label: string) =>
        handles.push({
          id: `y-${index}`,
          axis: 'y',
          index,
          label,
          left: parseFloat(css.paddingLeft),
          top: (top.bottom + bottom.top) / 2 - bounds.top - 4,
          width: root.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight),
          height: 8,
        });
      if (mode === 'desktop') {
        vertical(asset, preview, 0, '미디어·미리보기 너비 조절');
        vertical(preview, inspector, 1, '미리보기·속성 너비 조절');
        horizontal(preview, timeline, 0, '위쪽 패널·타임라인 높이 조절');
      } else if (mode === 'tablet') {
        vertical(asset, preview, 0, '미디어·미리보기 너비 조절');
        horizontal(preview, timeline, 0, '미리보기·타임라인 높이 조절');
        horizontal(timeline, inspector, 1, '타임라인·속성 높이 조절');
      } else {
        horizontal(preview, timeline, 0, '미리보기·타임라인 높이 조절');
        horizontal(timeline, inspector, 1, '타임라인·속성 높이 조절');
        horizontal(inspector, asset, 2, '속성·미디어 높이 조절');
      }
      const next: Metrics = {
        mode,
        gap,
        width: root.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight),
        height: root.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom),
        rows:
          mode === 'desktop'
            ? [preview.height, timeline.height]
            : mode === 'tablet'
              ? [preview.height, timeline.height, inspector.height]
              : [preview.height, timeline.height, inspector.height, asset.height],
        columns: [asset.width, mode === 'desktop' ? inspector.width : 0],
        handles,
      };
      setMetrics((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
      setCustom((previous) => (previous?.mode !== mode ? undefined : previous));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    root.querySelectorAll('.panel').forEach((node) => observer.observe(node));
    window.addEventListener('resize', schedule);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  }, []);
  const snapshot = (): Layout | undefined =>
    metrics
      ? { mode: metrics.mode, rows: [...metrics.rows], columns: [...metrics.columns] }
      : undefined;
  const resize = (layout: Layout, handle: Handle, delta: number) => {
    if (!metrics) return;
    if (handle.axis === 'y')
      setCustom({ ...layout, rows: resizeRows(layout.rows, handle.index, delta, layout.mode) });
    else {
      const columns: [number, number] = [...layout.columns];
      const available = metrics.width - metrics.gap * (layout.mode === 'desktop' ? 2 : 1);
      if (handle.index === 0)
        columns[0] = clamp(
          columns[0] + delta,
          layout.mode === 'desktop' ? 160 : 140,
          available - (layout.mode === 'desktop' ? columns[1] + 280 : 240),
        );
      else columns[1] = clamp(columns[1] - delta, 200, available - columns[0] - 280);
      setCustom({
        ...layout,
        columns: fitColumns(
          columns,
          metrics.width - metrics.gap * (layout.mode === 'desktop' ? 2 : 1),
          layout.mode,
        ),
      });
    }
  };
  const clear = (restore = false) => {
    const current = grab.current;
    grab.current = undefined;
    setResizing(false);
    if (current) {
      if (restore) setCustom(current.before);
      if (current.element.hasPointerCapture(current.id))
        current.element.releasePointerCapture(current.id);
    }
  };
  let style: CSSProperties | undefined;
  if (custom && metrics && custom.mode === metrics.mode) {
    if (custom.mode === 'desktop') {
      const columns = fitColumns(custom.columns, metrics.width - 2 * metrics.gap, custom.mode);
      const timeline = clamp(
        custom.rows[1],
        190,
        Math.max(190, metrics.height - metrics.gap - 260),
      );
      style = {
        gridTemplateColumns: `${columns[0]}px minmax(280px,1fr) ${columns[1]}px`,
        gridTemplateRows: `minmax(260px,1fr) ${timeline}px`,
      };
    } else {
      const left = fitColumns(custom.columns, metrics.width - metrics.gap, custom.mode)[0];
      style = {
        gridTemplateColumns:
          custom.mode === 'mobile' ? 'minmax(0,1fr)' : `${left}px minmax(240px,1fr)`,
        gridTemplateRows: custom.rows.map((row) => `${row}px`).join(' '),
      };
    }
  }
  return {
    ref,
    style,
    isResizing,
    handles: metrics?.handles.map((handle) => (
      <div
        key={handle.id}
        role="separator"
        aria-orientation={handle.axis === 'x' ? 'vertical' : 'horizontal'}
        aria-label={handle.label}
        aria-valuenow={Math.round(
          handle.axis === 'x'
            ? handle.index === 0
              ? metrics.columns[0]
              : metrics.width - metrics.gap * 2 - metrics.columns[1]
            : metrics.rows[handle.index],
        )}
        aria-valuemin={0}
        aria-valuemax={Math.round(handle.axis === 'x' ? metrics.width : metrics.height)}
        aria-disabled={locked}
        tabIndex={locked ? -1 : 0}
        className={`workspace-splitter ${handle.axis}`}
        style={{ left: handle.left, top: handle.top, width: handle.width, height: handle.height }}
        title={`${handle.label} · 더블클릭 또는 Home으로 배치 초기화`}
        onDoubleClick={() => {
          if (!locked) setCustom(undefined);
        }}
        onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
          if (locked || event.button !== 0) return;
          const layout = snapshot();
          if (!layout) return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          grab.current = {
            id: event.pointerId,
            element: event.currentTarget,
            handle,
            x: event.clientX,
            y: event.clientY + scrollY,
            layout,
            before: custom,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          setResizing(true);
        }}
        onPointerMove={(event) => {
          const current = grab.current;
          if (current?.id === event.pointerId)
            resize(
              current.layout,
              current.handle,
              handle.axis === 'x' ? event.clientX - current.x : event.clientY + scrollY - current.y,
            );
        }}
        onPointerUp={() => clear()}
        onPointerCancel={() => clear(true)}
        onLostPointerCapture={() => {
          if (grab.current) clear(true);
        }}
        onKeyDown={(event) => {
          if (locked) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            clear(true);
            return;
          }
          if (event.key === 'Home') {
            event.preventDefault();
            event.stopPropagation();
            setCustom(undefined);
            return;
          }
          const direction =
            handle.axis === 'x'
              ? event.key === 'ArrowLeft'
                ? -1
                : event.key === 'ArrowRight'
                  ? 1
                  : 0
              : event.key === 'ArrowUp'
                ? -1
                : event.key === 'ArrowDown'
                  ? 1
                  : 0;
          const layout = snapshot();
          if (direction && layout) {
            event.preventDefault();
            event.stopPropagation();
            resize(layout, handle, direction * (event.shiftKey ? 50 : 10));
          }
        }}
      >
        <span aria-hidden="true" />
      </div>
    )),
  };
}
