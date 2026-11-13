import { useRef, useState } from 'react';
import type { Asset, Transform } from '../project/model';
import { imageRect } from '../render/compositor';

export type PreviewTool = 'crop' | 'move' | 'resize';
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export function PreviewTransformOverlay(p: {
  mode: PreviewTool;
  transform: Transform;
  asset: Asset;
  width: number;
  height: number;
  onCommit: (t: Transform) => void;
}) {
  const drag = useRef<{ x: number; y: number; transform: Transform; handle: string } | undefined>(
    undefined,
  );
  const [draft, setDraft] = useState<Transform>();
  const [selection, setSelection] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>();
  const t = draft ?? p.transform;
  const crop = t.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const rect = imageRect(
    p.asset.width * crop.width,
    p.asset.height * crop.height,
    p.width,
    p.height,
    t,
  );
  return (
    <div
      className={`transform-overlay tool-${p.mode}`}
      aria-label={`${p.mode} 영상 조정`}
      onDoubleClick={() => {
        if (p.mode === 'crop') p.onCommit({ ...p.transform, crop: undefined });
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const box = e.currentTarget.getBoundingClientRect();
        drag.current = {
          x: ((e.clientX - box.left) / box.width) * p.width,
          y: ((e.clientY - box.top) / box.height) * p.height,
          transform: structuredClone(p.transform),
          handle: (e.target as HTMLElement).dataset.handle ?? 'se',
        };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const box = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - box.left) / box.width) * p.width,
          y = ((e.clientY - box.top) / box.height) * p.height;
        const dx = x - d.x,
          dy = y - d.y;
        if (p.mode === 'move')
          setDraft({
            ...d.transform,
            x: clamp(d.transform.x + dx / p.width, -1, 1),
            y: clamp(d.transform.y + dy / p.height, -1, 1),
          });
        else if (p.mode === 'resize') {
          const c = d.transform.crop ?? { width: 1, height: 1 };
          const original = imageRect(
            p.asset.width * c.width,
            p.asset.height * c.height,
            p.width,
            p.height,
            d.transform,
          );
          const sign = d.handle.includes('w') ? -1 : 1;
          setDraft({
            ...d.transform,
            scale: clamp(
              d.transform.scale * (1 + (sign * dx) / Math.max(1, original.width)),
              0.1,
              5,
            ),
          });
        } else {
          const x1 = clamp(Math.min(d.x, x), rect.x, rect.x + rect.width),
            y1 = clamp(Math.min(d.y, y), rect.y, rect.y + rect.height);
          const x2 = clamp(Math.max(d.x, x), rect.x, rect.x + rect.width),
            y2 = clamp(Math.max(d.y, y), rect.y, rect.y + rect.height);
          setSelection({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 });
        }
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        if (p.mode === 'crop' && selection && selection.width > 2 && selection.height > 2) {
          p.onCommit({
            ...p.transform,
            crop: {
              x: crop.x + ((selection.x - rect.x) / rect.width) * crop.width,
              y: crop.y + ((selection.y - rect.y) / rect.height) * crop.height,
              width: (selection.width / rect.width) * crop.width,
              height: (selection.height / rect.height) * crop.height,
            },
          });
        } else if (draft) p.onCommit(draft);
        drag.current = undefined;
        setDraft(undefined);
        setSelection(undefined);
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = undefined;
        setDraft(undefined);
        setSelection(undefined);
      }}
    >
      <div
        className="transform-outline"
        style={{
          left: `${(rect.x / p.width) * 100}%`,
          top: `${(rect.y / p.height) * 100}%`,
          width: `${(rect.width / p.width) * 100}%`,
          height: `${(rect.height / p.height) * 100}%`,
        }}
      >
        {p.mode === 'resize' &&
          ['nw', 'ne', 'sw', 'se'].map((handle) => (
            <span key={handle} data-handle={handle} className={`resize-handle ${handle}`} />
          ))}
      </div>
      {selection && (
        <div
          className="crop-selection"
          style={{
            left: `${(selection.x / p.width) * 100}%`,
            top: `${(selection.y / p.height) * 100}%`,
            width: `${(selection.width / p.width) * 100}%`,
            height: `${(selection.height / p.height) * 100}%`,
          }}
        />
      )}
    </div>
  );
}
