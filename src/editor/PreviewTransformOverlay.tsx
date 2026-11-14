import { useRef, useState } from 'react';
import type { Asset, Transform } from '../project/model';
import { imageRect } from '../render/compositor';

export type PreviewTool = 'crop' | 'move' | 'resize';
type Box = { x: number; y: number; width: number; height: number };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export function PreviewTransformOverlay(p: {
  mode: PreviewTool;
  transform: Transform;
  asset: Asset;
  width: number;
  height: number;
  onCommit: (t: Transform) => void;
  onCropDraft: (t: Transform) => void;
}) {
  const drag = useRef<
    { x: number; y: number; transform: Transform; handle: string; selection: Box } | undefined
  >(undefined);
  const [draft, setDraft] = useState<Transform>();
  const [selection, setSelection] = useState<Box>({ x: 0, y: 0, width: 1, height: 1 });
  const t = draft ?? p.transform;
  const crop = t.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const rect = imageRect(
    p.asset.width * crop.width,
    p.asset.height * crop.height,
    p.width,
    p.height,
    t,
  );
  const outline =
    p.mode === 'crop'
      ? {
          x: rect.x + selection.x * rect.width,
          y: rect.y + selection.y * rect.height,
          width: selection.width * rect.width,
          height: selection.height * rect.height,
        }
      : rect;
  function updateCrop(box: Box) {
    setSelection(box);
    const nextCrop = {
      x: crop.x + box.x * crop.width,
      y: crop.y + box.y * crop.height,
      width: crop.width * box.width,
      height: crop.height * box.height,
    };
    const fitted = imageRect(
      p.asset.width * nextCrop.width,
      p.asset.height * nextCrop.height,
      p.width,
      p.height,
      { ...p.transform, scale: 1, x: 0, y: 0 },
    );
    p.onCropDraft({
      ...p.transform,
      crop: nextCrop,
      scale: clamp((rect.width * box.width) / fitted.width, 0.1, 5),
      x: clamp((rect.x + (box.x + box.width / 2) * rect.width - p.width / 2) / p.width, -1, 1),
      y: clamp((rect.y + (box.y + box.height / 2) * rect.height - p.height / 2) / p.height, -1, 1),
    });
  }
  return (
    <div
      className={`transform-overlay tool-${p.mode}`}
      aria-label={`${p.mode} 영상 조정`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const handle = (e.target as HTMLElement).dataset.handle;
        if (p.mode !== 'move' && !handle) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const box = e.currentTarget.getBoundingClientRect();
        drag.current = {
          x: ((e.clientX - box.left) / box.width) * p.width,
          y: ((e.clientY - box.top) / box.height) * p.height,
          transform: structuredClone(p.transform),
          handle: handle ?? '',
          selection: { ...selection },
        };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const box = e.currentTarget.getBoundingClientRect();
        const dx = ((e.clientX - box.left) / box.width) * p.width - d.x,
          dy = ((e.clientY - box.top) / box.height) * p.height - d.y;
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
          const horizontal = (d.handle.includes('w') ? -dx : dx) / original.width;
          const vertical = (d.handle.includes('n') ? -dy : dy) / original.height;
          const delta = Math.abs(horizontal) > Math.abs(vertical) ? horizontal : vertical;
          setDraft({ ...d.transform, scale: clamp(d.transform.scale * (1 + delta), 0.1, 5) });
        } else {
          const s = d.selection;
          let left = s.x,
            top = s.y,
            right = s.x + s.width,
            bottom = s.y + s.height;
          if (d.handle.includes('w')) left = clamp(s.x + dx / rect.width, 0, right - 0.02);
          if (d.handle.includes('e'))
            right = clamp(s.x + s.width + dx / rect.width, left + 0.02, 1);
          if (d.handle.includes('n')) top = clamp(s.y + dy / rect.height, 0, bottom - 0.02);
          if (d.handle.includes('s'))
            bottom = clamp(s.y + s.height + dy / rect.height, top + 0.02, 1);
          updateCrop({ x: left, y: top, width: right - left, height: bottom - top });
        }
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        if (p.mode !== 'crop' && draft) p.onCommit(draft);
        drag.current = undefined;
        setDraft(undefined);
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        if (drag.current && p.mode === 'crop') updateCrop(drag.current.selection);
        drag.current = undefined;
        setDraft(undefined);
      }}
    >
      <div
        className={`transform-outline ${p.mode === 'crop' ? 'crop-selection' : ''}`}
        style={{
          left: `${(outline.x / p.width) * 100}%`,
          top: `${(outline.y / p.height) * 100}%`,
          width: `${(outline.width / p.width) * 100}%`,
          height: `${(outline.height / p.height) * 100}%`,
        }}
      >
        {p.mode !== 'move' &&
          (p.mode === 'crop'
            ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
            : ['nw', 'ne', 'sw', 'se']
          ).map((handle) => (
            <span key={handle} data-handle={handle} className={`resize-handle ${handle}`} />
          ))}
      </div>
    </div>
  );
}
