import { useEffect, useRef, useState } from 'react';
import { duration, resolve, timecode, type Project, type Transform } from '../project/model';
import type { PlaybackService, PlaybackState } from '../playback/service';
import { previewSize } from '../render/compositor';
import { PreviewTransformOverlay, type PreviewTool } from './PreviewTransformOverlay';
import { PanelTitle } from './Panel';

type Props = {
  project: Project;
  selected?: string;
  onTransform: (id: string, transform: Transform) => void;
  playback: PlaybackService;
  state: PlaybackState;
  locked: boolean;
  onSeek: (us: number) => void;
  onToggle: () => void;
};
export function PreviewPanel(p: Props) {
  const [tool, setTool] = useState<PreviewTool>();
  const clip = p.project.clips.find((c) => c.id === p.selected);
  const current = resolve(p.project, p.state.timeUs);
  const asset = p.project.assets.find(
    (a) => a.id === (current?.clip.id === clip?.id ? current?.clip.assetId : clip?.assetId),
  );
  const size = previewSize(p.project.aspect);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current) p.playback.attach(canvas.current);
  }, [p.playback]);
  return (
    <section className="preview-panel panel">
      <PanelTitle number="02" title="프로그램 미리보기">
        <div className="preview-tools">
          {(['crop', 'move', 'resize'] as const).map((mode) => (
            <button
              key={mode}
              className={tool === mode ? 'active' : ''}
              aria-pressed={tool === mode}
              disabled={p.locked || !clip}
              onClick={() => setTool(tool === mode ? undefined : mode)}
            >
              {mode}
            </button>
          ))}
        </div>
        <span className="quality-badge">½ 해상도</span>
      </PanelTitle>
      <div className="preview-stage">
        <div
          className="preview-surface"
          style={{ aspectRatio: p.project.aspect.replace(':', '/') }}
        >
          <canvas
            ref={canvas}
            width={960}
            height={540}
            aria-label="편집 영상 미리보기"
            data-testid="preview-canvas"
          />
          {tool && clip && asset && !p.locked && (
            <PreviewTransformOverlay
              key={clip.id + tool}
              mode={tool}
              transform={clip.transform}
              asset={asset}
              width={size.width}
              height={size.height}
              onCommit={(t) => p.onTransform(clip.id, t)}
            />
          )}
          {!duration(p.project) && (
            <div className="preview-placeholder">
              <span>▷</span>
              <strong>여기서 이야기가 시작됩니다</strong>
              <small>미디어를 타임라인에 추가해 편집하세요</small>
            </div>
          )}
        </div>
        {p.state.buffering && <span className="buffering">미리 읽는 중…</span>}
      </div>
      {p.state.error && (
        <p className="inline-error" role="alert">
          {p.state.error}
        </p>
      )}
      <div className="transport">
        <span className="timecode">
          {timecode(p.state.timeUs, p.project.fps)}{' '}
          <span>/ {timecode(duration(p.project), p.project.fps)}</span>
        </span>
        <div className="transport-buttons">
          <button
            title="처음으로"
            aria-label="처음으로"
            disabled={p.locked}
            onClick={() => p.onSeek(0)}
          >
            ⏮
          </button>
          <button
            title="이전 프레임 (←)"
            aria-label="이전 프레임"
            disabled={p.locked}
            onClick={() => p.onSeek(p.state.timeUs - Math.round(1_000_000 / p.project.fps))}
          >
            ‹
          </button>
          <button
            className="play-button"
            title="재생/정지 (Space)"
            aria-label={p.state.playing ? '일시 정지' : '재생'}
            disabled={p.locked || !duration(p.project)}
            onClick={p.onToggle}
          >
            {p.state.playing ? 'Ⅱ' : '▶'}
          </button>
          <button
            title="다음 프레임 (→)"
            aria-label="다음 프레임"
            disabled={p.locked}
            onClick={() => p.onSeek(p.state.timeUs + Math.round(1_000_000 / p.project.fps))}
          >
            ›
          </button>
          <button
            title="끝으로"
            aria-label="끝으로"
            disabled={p.locked}
            onClick={() => p.onSeek(duration(p.project))}
          >
            ⏭
          </button>
        </div>
        <span className="preview-meta">
          {p.project.aspect} <span>·</span> {p.project.fps} FPS
        </span>
      </div>
    </section>
  );
}
