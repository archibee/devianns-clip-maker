import { useEffect, useRef, useState, type RefObject } from 'react';
import { containRect, type RecordRegion } from './geometry';
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export function RegionSelector(p: {
  video: RefObject<HTMLVideoElement | null>;
  region: RecordRegion;
  onChange: (region: RecordRegion) => void;
}) {
  const [box, setBox] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const gesture = useRef<
    { id: number; x: number; y: number; region: RecordRegion; mode: string } | undefined
  >(undefined);
  useEffect(() => {
    const video = p.video.current;
    if (!video) return;
    const measure = () => {
      const rect = video.getBoundingClientRect();
      setBox(
        video.videoWidth
          ? containRect(video.videoWidth, video.videoHeight, rect.width, rect.height)
          : { x: 0, y: 0, width: 0, height: 0 },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(video);
    video.addEventListener('resize', measure);
    video.addEventListener('loadedmetadata', measure);
    measure();
    return () => {
      observer.disconnect();
      video.removeEventListener('resize', measure);
      video.removeEventListener('loadedmetadata', measure);
    };
  }, [p.video]);
  if (!box.width) return null;
  return (
    <div
      className="record-region-overlay"
      aria-label="녹화 사각형 영역 드래그 선택"
      style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        gesture.current = {
          id: event.pointerId,
          x: clamp((event.clientX - rect.x) / rect.width, 0, 1),
          y: clamp((event.clientY - rect.y) / rect.height, 0, 1),
          region: { ...p.region },
          mode: (event.target as HTMLElement).dataset.handle ?? 'draw',
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const g = gesture.current;
        if (!g || g.id !== event.pointerId) return;
        const rect = event.currentTarget.getBoundingClientRect(),
          x = clamp((event.clientX - rect.x) / rect.width, 0, 1),
          y = clamp((event.clientY - rect.y) / rect.height, 0, 1);
        if (g.mode === 'move') {
          p.onChange({
            ...g.region,
            x: clamp(g.region.x + x - g.x, 0, 1 - g.region.width),
            y: clamp(g.region.y + y - g.y, 0, 1 - g.region.height),
          });
          return;
        }
        if (g.mode === 'draw') {
          if (Math.abs(x - g.x) >= 0.02 && Math.abs(y - g.y) >= 0.02)
            p.onChange({
              x: Math.min(x, g.x),
              y: Math.min(y, g.y),
              width: Math.abs(x - g.x),
              height: Math.abs(y - g.y),
            });
          return;
        }
        let left = g.region.x,
          right = left + g.region.width,
          top = g.region.y,
          bottom = top + g.region.height;
        if (g.mode.includes('w')) left = clamp(x, 0, right - 0.02);
        else right = clamp(x, left + 0.02, 1);
        if (g.mode.includes('n')) top = clamp(y, 0, bottom - 0.02);
        else bottom = clamp(y, top + 0.02, 1);
        p.onChange({ x: left, y: top, width: right - left, height: bottom - top });
      }}
      onPointerUp={(event) => {
        gesture.current = undefined;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        gesture.current = undefined;
      }}
    >
      <div
        className="record-region-box"
        data-handle="move"
        style={{
          left: `${p.region.x * 100}%`,
          top: `${p.region.y * 100}%`,
          width: `${p.region.width * 100}%`,
          height: `${p.region.height * 100}%`,
        }}
      >
        {['nw', 'ne', 'sw', 'se'].map((corner) => (
          <span key={corner} data-handle={corner} className={`record-region-handle ${corner}`} />
        ))}
      </div>
    </div>
  );
}
