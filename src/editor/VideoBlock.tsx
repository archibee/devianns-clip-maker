import type { ReactNode } from 'react';
import { seconds, timecode, type Clip, type Project } from '../project/model';
import { useBlockDrag, type BlockDragPreview } from './useBlockDrag';
import type { Command } from '../project/commands';
import { TimelineIcon } from './TimelineIcon';

type Props = {
  dragPreview?: BlockDragPreview;
  onDragPreview: (draft?: BlockDragPreview) => void;
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
export function VideoBlock(p: Props) {
  const move = useBlockDrag({
    project: p.project,
    id: p.clip.id,
    selectedIds: [...p.selectedIds, ...p.selectedCueIds],
    zoom: p.zoom,
    locked: p.locked,
    onSelect: (additive) => p.onSelect(p.clip.id, additive, false),
    onTap: () => p.onSeek(p.startUs),
    onLaneChange: p.onLaneChange,
    onCommand: p.onCommand,
    onPreview: p.onDragPreview,
    onGestureChange: p.onGestureChange,
  });
  const preview = p.dragPreview?.ids.includes(p.clip.id) ? p.dragPreview : undefined;
  const draft = preview
    ? { startUs: p.startUs + preview.deltaUs, offsetY: preview.offsetY }
    : undefined;
  const invalid = preview?.invalid ?? false;
  const asset = p.project.assets.find((a) => a.id === p.clip.assetId)!;
  const audioParts = (p.clip.parts ?? [p.clip]).filter(
    (part) => p.project.assets.find((a) => a.id === part.assetId)?.hasAudio,
  );
  const muted =
    audioParts.length > 0 && (p.clip.muted ?? audioParts.every((part) => part.muted === true));
  const selected = p.selectedIds.includes(p.clip.id);
  return (
    <div
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
      {...move.events}
      onClick={(e) => {
        if ((e.target as Element).closest('button')) return;
        if (move.consumeClick()) return;
        if (!p.locked) p.onSelect(p.clip.id, e.ctrlKey || e.metaKey);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          move.cancel();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
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
