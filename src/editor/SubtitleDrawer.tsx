import { useRef, useState, type ReactNode } from 'react';

export function SubtitleDrawer({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; height: number; moved: boolean } | undefined>(undefined);
  const suppressClick = useRef(false);
  const [height, setHeight] = useState(28);
  const limit = () => Math.max(28, (root.current?.parentElement?.clientHeight ?? 300) * 0.5);
  const update = (value: number) => setHeight(Math.min(limit(), Math.max(28, value)));
  const expanded = height > 40;
  return (
    <div ref={root} className="subtitle-drawer" style={{ height: expanded ? height : 28 }}>
      <button
        className="subtitle-drawer-grip"
        aria-label="자막 목록 펼치기 또는 접기"
        aria-expanded={expanded}
        title="위로 끌어 펼치기 · 아래로 끌어 접기"
        onClick={() => {
          if (suppressClick.current) { suppressClick.current = false; return; }
          update(expanded ? 28 : 140);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          suppressClick.current = false;
          drag.current = { y: event.clientY, height: root.current!.getBoundingClientRect().height, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current) return;
          const delta = current.y - event.clientY;
          if (Math.abs(delta) > 3) current.moved = true;
          if (current.moved) update(current.height + delta);
        }}
        onPointerUp={() => {
          suppressClick.current = drag.current?.moved ?? false;
          drag.current = undefined;
        }}
        onPointerCancel={() => { drag.current = undefined; }}
        onLostPointerCapture={() => { drag.current = undefined; }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          event.stopPropagation();
          update(height + (event.key === 'ArrowUp' ? 30 : -30));
        }}
      >
        <span className="drawer-grip-mark" aria-hidden="true" />
        <span>자막 목록</span>
        <span aria-hidden="true">{expanded ? '⌄' : '⌃'}</span>
      </button>
      <div className="subtitle-list-region" aria-label="자막 목록" hidden={!expanded}>
        {children}
      </div>
    </div>
  );
}
