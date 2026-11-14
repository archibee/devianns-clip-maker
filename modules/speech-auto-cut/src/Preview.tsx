import { useEffect, useRef, useState } from 'react';
import type { Project } from '../../../src/project/model';
import type { MediaRegistry } from '../../../src/media/registry';
import { PlaybackService, type PlaybackState } from '../../../src/playback/service';
import { prepareLocalFonts } from '../../../src/render/local-fonts';
import { duration, seconds, timecode } from '../../../src/project/model';

export function AutoCutPreview(p: {
  project: Project;
  registry: MediaRegistry;
  seekUs: number;
  disabled: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<PlaybackState>({
    timeUs: 0,
    playing: false,
    buffering: false,
  });
  const [playback] = useState(() => new PlaybackService(p.registry, setState));
  useEffect(() => {
    if (canvas.current) playback.attach(canvas.current);
    return () => playback.dispose();
  }, [playback]);
  useEffect(() => {
    let active = true;
    void prepareLocalFonts(p.project)
      .catch((error) => {
        if (active) setState((s) => ({ ...s, error: String(error) }));
      })
      .then(() => {
        if (active) {
          playback.bind(p.project);
          playback.seek(Math.min(p.seekUs, duration(p.project)));
        }
      });
    return () => {
      active = false;
      playback.pause();
    };
  }, [p.project, playback, p.seekUs]);
  useEffect(() => {
    if (p.disabled) playback.pause();
  }, [p.disabled, playback]);
  return (
    <div className="auto-cut-preview">
      <canvas
        ref={canvas}
        width={960}
        height={540}
        style={{ aspectRatio: p.project.aspect.replace(':', '/') }}
        aria-label="Auto Cut 미리보기"
      />
      <div className="auto-cut-transport">
        <button
          disabled={p.disabled}
          onClick={() => {
            if (state.playing) playback.pause();
            else void playback.play();
          }}
        >
          {state.playing ? '일시 정지' : '재생'}
        </button>
        <input
          type="range"
          aria-label="Auto Cut 미리보기 위치"
          min={0}
          max={Math.max(1, duration(p.project))}
          value={state.timeUs}
          onChange={(e) => playback.seek(Number(e.target.value))}
          disabled={p.disabled}
        />
        <span>
          {timecode(state.timeUs, p.project.fps)} / {seconds(duration(p.project)).toFixed(2)}s
        </span>
      </div>
      {state.buffering && <small>미리 읽는 중…</small>}
      {state.error && (
        <p className="auto-cut-error" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}
