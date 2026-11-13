import { useRef, useState, type DragEvent, type PointerEvent } from 'react';
import { layout, duration, timecode, seconds, toUs, type Project } from '../project/model';
import { trimAt, type Command } from '../project/commands';
import { ASSET_DRAG, CLIP_DRAG } from './AssetPanel';
import { PanelTitle } from './Panel';

type Props = {
  project: Project;
  timeUs: number;
  selected?: string;
  locked: boolean;
  onSelect: (id: string) => void;
  onSeek: (us: number) => void;
  onCommand: (command: Command) => void;
  onSplit: () => void;
  onDelete: () => void;
};
export function Timeline(p: Props) {
  const scroll = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(52);
  const [dropIndex, setDropIndex] = useState<number>();
  const [trim, setTrim] = useState<{
    id: string;
    side: 'in' | 'out';
    startX: number;
    delta: number;
  }>();
  const rows = layout(p.project);
  const total = duration(p.project);
  const visibleSeconds = Math.max(16, seconds(total) + 4);
  const width = Math.max(700, visibleSeconds * zoom);
  const currentIndex = p.project.clips.findIndex((c) => c.id === p.selected);
  const position = (e: { clientX: number }) => {
    const rect = scroll.current!.getBoundingClientRect();
    return Math.max(0, e.clientX - rect.left + scroll.current!.scrollLeft - 72);
  };
  const insertion = (x: number) => {
    let cursor = 0;
    for (let i = 0; i < rows.length; i++) {
      const end = seconds(rows[i].endUs) * zoom;
      if (x < (cursor + end) / 2) return i;
      cursor = end;
    }
    return rows.length;
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDropIndex(undefined);
    if (p.locked) return;
    const index = insertion(position(e));
    const assetId = e.dataTransfer.getData(ASSET_DRAG),
      clipId = e.dataTransfer.getData(CLIP_DRAG);
    if (assetId) p.onCommand({ type: 'insert', assetId, index });
    else if (clipId) {
      const oldIndex = p.project.clips.findIndex((c) => c.id === clipId);
      p.onCommand({ type: 'move', id: clipId, index: index - (oldIndex < index ? 1 : 0) });
    }
  };
  const seekPointer = (e: PointerEvent<HTMLDivElement>) => {
    if (p.locked || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    p.onSeek(Math.min(total, toUs(position(e) / zoom)));
  };
  const trimHandle = (id: string, side: 'in' | 'out') => (
    <button
      className={`trim-handle ${side}`}
      title={side === 'in' ? '시작 트림' : '끝 트림'}
      aria-label={side === 'in' ? '시작 트림 핸들' : '끝 트림 핸들'}
      disabled={p.locked}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setTrim({ id, side, startX: e.clientX, delta: 0 });
        p.onSelect(id);
      }}
      onPointerMove={(e) => {
        if (trim?.id === id && trim.side === side && e.currentTarget.hasPointerCapture(e.pointerId))
          setTrim({ ...trim, delta: toUs((e.clientX - trim.startX) / zoom) });
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        if (trim?.id === id) {
          p.onCommand(trimAt(p.project, id, side, trim.delta));
          setTrim(undefined);
        }
      }}
      onPointerCancel={() => setTrim(undefined)}
      onDragStart={(e) => e.preventDefault()}
    >
      ‖
    </button>
  );
  const ticksStep = zoom < 30 ? 5 : zoom < 70 ? 2 : 1;
  const ticks = Array.from(
    { length: Math.ceil(width / zoom / ticksStep) },
    (_, i) => i * ticksStep,
  );
  const dropX =
    dropIndex === undefined
      ? 0
      : dropIndex === rows.length
        ? seconds(total) * zoom
        : seconds(rows[dropIndex].startUs) * zoom;
  return (
    <section className="timeline-panel panel">
      <PanelTitle number="04" title="타임라인">
        <span className="quality-badge">영상 + 원본 오디오 연결</span>
        <div className="timeline-tools">
          <button
            disabled={p.locked || !rows.length}
            onClick={p.onSplit}
            title="재생 위치에서 분할 (S)"
          >
            ✂ 분할
          </button>
          <button
            disabled={p.locked || !p.selected}
            onClick={p.onDelete}
            title="선택 클립 삭제 (Delete)"
          >
            삭제
          </button>
          <button
            aria-label="선택 클립 왼쪽 이동"
            disabled={p.locked || currentIndex <= 0}
            onClick={() => p.onCommand({ type: 'move', id: p.selected!, index: currentIndex - 1 })}
          >
            ← 이동
          </button>
          <button
            aria-label="선택 클립 오른쪽 이동"
            disabled={p.locked || currentIndex < 0 || currentIndex >= rows.length - 1}
            onClick={() => p.onCommand({ type: 'move', id: p.selected!, index: currentIndex + 1 })}
          >
            이동 →
          </button>
        </div>
        <label className="zoom-control">
          −
          <input
            aria-label="타임라인 확대"
            type="range"
            min={16}
            max={150}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          ＋
        </label>
      </PanelTitle>
      <div
        className="timeline-scroll"
        ref={scroll}
        onDragOver={(e) => {
          if (
            !p.locked &&
            (e.dataTransfer.types.includes(ASSET_DRAG) || e.dataTransfer.types.includes(CLIP_DRAG))
          ) {
            e.preventDefault();
            e.dataTransfer.dropEffect = e.dataTransfer.types.includes(ASSET_DRAG) ? 'copy' : 'move';
            setDropIndex(insertion(position(e)));
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropIndex(undefined);
        }}
        onDrop={onDrop}
      >
        <div className="timeline-content" style={{ width: width + 72 }}>
          <div
            className="ruler"
            style={{ width }}
            onPointerDown={seekPointer}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                p.onSeek(Math.min(total, toUs(position(e) / zoom)));
            }}
          >
            {ticks.map((t) => (
              <span key={t} style={{ left: t * zoom }}>
                {timecode(toUs(t), p.project.fps).slice(0, 5)}
              </span>
            ))}
            <div className="playhead-grip" style={{ left: seconds(p.timeUs) * zoom }} />
          </div>
          <div className="track-label video-label">
            V1<small>영상</small>
          </div>
          <div className="track-label audio-label">
            A1<small>연결</small>
          </div>
          <div className="track-bed" style={{ width }}>
            {rows.map(({ clip, startUs, endUs }, index) => {
              const asset = p.project.assets.find((a) => a.id === clip.assetId)!;
              return (
                <div
                  key={clip.id}
                  className={`timeline-clip ${p.selected === clip.id ? 'selected' : ''}`}
                  style={{
                    left: seconds(startUs) * zoom,
                    width: Math.max(5, seconds(endUs - startUs) * zoom),
                  }}
                  draggable={!p.locked && !trim}
                  role="button"
                  tabIndex={p.locked ? -1 : 0}
                  aria-label={`클립 ${index + 1}: ${asset.name}`}
                  aria-pressed={p.selected === clip.id}
                  onClick={() => p.onSelect(clip.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation();
                      p.onSelect(clip.id);
                      p.onSeek(startUs);
                    }
                  }}
                  onDragStart={(e) => {
                    if (trim) {
                      e.preventDefault();
                      return;
                    }
                    e.dataTransfer.setData(CLIP_DRAG, clip.id);
                    e.dataTransfer.effectAllowed = 'move';
                    p.onSelect(clip.id);
                  }}
                  onDragEnd={() => setDropIndex(undefined)}
                >
                  <div className="clip-video">
                    <span className="clip-number">{String(index + 1).padStart(2, '0')}</span>
                    <strong>{asset.name}</strong>
                    <small>{timecode(endUs - startUs, p.project.fps)}</small>
                  </div>
                  <div className={`clip-audio ${!asset.hasAudio ? 'silent' : ''}`}>
                    <span>⌁ {asset.hasAudio ? '원본 오디오 · 연결됨' : '무음'}</span>
                    <span className="link-icon">⛓</span>
                  </div>
                  {trimHandle(clip.id, 'in')}
                  {trimHandle(clip.id, 'out')}
                </div>
              );
            })}
            {!rows.length && (
              <div className="timeline-empty">
                ＋ 에셋을 여기에 드래그하거나 에셋의 추가 버튼을 누르세요
              </div>
            )}
            <div className="playhead-line" style={{ left: seconds(p.timeUs) * zoom }} />
            {dropIndex !== undefined && <div className="drop-marker" style={{ left: dropX }} />}
          </div>
          <div className="subtitle-lane" style={{ width }}>
            {p.project.subtitles.map((c) => (
              <span
                key={c.id}
                style={{
                  left: seconds(c.startUs) * zoom,
                  width: Math.max(4, seconds(c.endUs - c.startUs) * zoom),
                }}
                title={c.text}
              >
                T {c.text}
              </span>
            ))}
          </div>
        </div>
      </div>
      <footer className="timeline-footer">
        <span>
          {rows.length} 클립 <span className="muted">· 빈틈 없이 연결</span>
        </span>
        <label>
          재생 위치{' '}
          <input
            aria-label="재생 위치"
            type="range"
            min={0}
            max={Math.max(1, total)}
            step={1}
            value={p.timeUs}
            disabled={p.locked}
            onChange={(e) => p.onSeek(Number(e.target.value))}
          />
        </label>
        <span>
          {trim
            ? `트림 ${seconds(trim.delta).toFixed(2)}초`
            : 'S 분할 · Space 재생 · ← → 프레임 이동'}
        </span>
      </footer>
    </section>
  );
}
