import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog } from '../../../src/editor/Panel';
import { dimensions, newId, type Cue, type Project } from '../../../src/project/model';
import type { MediaRegistry } from '../../../src/media/registry';
import { appendVisualizer } from './plan';
import { drawVisualizer } from './render';
import './style.css';

export class VisualizerBoundary extends Component<
  { children: ReactNode; onClose: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <Dialog title="Visualizer 오류" onClose={this.props.onClose}>
        <p role="alert">비주얼라이저를 열지 못했습니다. 기존 프로젝트는 변경되지 않았습니다.</p>
        <button onClick={this.props.onClose}>취소</button>
      </Dialog>
    ) : (
      this.props.children
    );
  }
}
export function VisualizerDialog(p: {
  project: Project;
  lane: number;
  registry: MediaRegistry;
  onClose: () => void;
  onApply: (expected: Project, result: Project) => void;
}) {
  const [snapshot] = useState(p.project),
    [lane] = useState(p.lane);
  const previewSize = dimensions(snapshot.aspect, 480);
  const worker = useRef<Worker | undefined>(undefined),
    canvas = useRef<HTMLCanvasElement>(null);
  const [analysis, setAnalysis] = useState<Cue>();
  const [busy, setBusy] = useState(false),
    [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState(0),
    [error, setError] = useState<string>();
  const [color, setColor] = useState('#e4b5ff'),
    [width, setWidth] = useState(0.65);
  const [y, setY] = useState(0.8),
    [gain, setGain] = useState(1),
    [showTime, setShowTime] = useState(true);
  const cue = analysis && {
    ...analysis,
    color,
    y,
    visualizer: { ...analysis.visualizer!, width, gain, showTime },
  };
  useEffect(
    () => () => {
      worker.current?.terminate();
      worker.current = undefined;
    },
    [],
  );
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx || !cue) return;
    let frame = 0;
    const start = performance.now();
    const draw = () => {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      const span = cue.endUs - cue.startUs;
      drawVisualizer(ctx, cue, cue.startUs + (((performance.now() - start) * 1000) % span));
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [analysis, color, width, y, gain, showTime]);
  function analyze() {
    if (busy || applying) return;
    worker.current?.terminate();
    setAnalysis(undefined);
    setError(undefined);
    setProgress(0);
    setBusy(true);
    try {
      const current = new Worker(new URL('./analyze.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.current = current;
      const fail = (message: string) => {
        if (worker.current !== current) return;
        current.terminate();
        worker.current = undefined;
        setBusy(false);
        setError(message);
      };
      current.onerror = () =>
        fail('오디오 분석 중 오류가 발생했습니다. 원본과 지원 코덱을 확인하세요.');
      current.onmessageerror = () => fail('오디오 분석 결과를 읽지 못했습니다.');
      current.onmessage = (
        event: MessageEvent<
          | { type: 'progress'; value: number }
          | { type: 'error'; message: string }
          | { type: 'done'; startUs: number; endUs: number; stepUs: number; values: number[] }
        >,
      ) => {
        if (worker.current !== current) return;
        const message = event.data;
        if (message.type === 'progress') {
          setProgress(message.value);
          return;
        }
        if (message.type === 'error') {
          fail(message.message);
          return;
        }
        setAnalysis({
          id: newId(),
          startUs: message.startUs,
          endUs: message.endUs,
          text: '',
          color: '#e4b5ff',
          background: '#000000',
          backgroundOpacity: 0,
          size: 0.16,
          x: 0.5,
          y: 0.8,
          visualizer: {
            version: 1,
            bands: 32,
            stepUs: message.stepUs,
            offsetUs: 0,
            values: message.values,
            width: 0.65,
            gain: 1,
            showTime: true,
          },
        });
        setProgress(1);
        setBusy(false);
        current.terminate();
        worker.current = undefined;
      };
      current.postMessage({ project: snapshot, lane, files: p.registry.files() });
    } catch (error) {
      worker.current?.terminate();
      worker.current = undefined;
      setBusy(false);
      setError(error instanceof Error ? error.message : String(error));
    }
  }
  function apply() {
    if (!cue || busy || applying) return;
    setApplying(true);
    setError(undefined);
    try {
      p.onApply(snapshot, appendVisualizer(snapshot, cue));
    } catch (error) {
      setApplying(false);
      setError(error instanceof Error ? error.message : String(error));
    }
  }
  return (
    <Dialog title="AUDIO VISUALIZER · Beta" onClose={p.onClose} locked={applying}>
      <div className="visualizer-body">
        <p>
          라인 {lane + 1}의 소리를 분석해 투명 배경의 막대 이펙트를 새 라인에 추가합니다. 기존
          영상과 소리는 유지됩니다.
        </p>
        <canvas
          ref={canvas}
          width={previewSize.width}
          height={previewSize.height}
          className="visualizer-preview"
          aria-label="비주얼라이저 이펙트 미리보기"
        />
        <small className="muted">
          체크무늬는 투명 영역입니다. 이 미리보기는 무음이며 실제 영상은 타임라인에서 재생하세요.
        </small>
        <div className="visualizer-fields">
          <label className="field">
            색상
            <input
              type="color"
              value={color}
              disabled={applying}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <label className="field">
            위치
            <select value={y} disabled={applying} onChange={(e) => setY(Number(e.target.value))}>
              <option value={0.2}>위쪽</option>
              <option value={0.5}>가운데</option>
              <option value={0.8}>아래쪽</option>
            </select>
          </label>
          <label className="field">
            가로 너비
            <input
              type="range"
              min={0.2}
              max={0.9}
              step={0.01}
              value={width}
              disabled={applying}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
          </label>
          <label className="field">
            반응 크기
            <input
              type="range"
              min={0.25}
              max={4}
              step={0.05}
              value={gain}
              disabled={applying}
              onChange={(e) => setGain(Number(e.target.value))}
            />
          </label>
        </div>
        <label>
          <input
            type="checkbox"
            checked={showTime}
            disabled={applying}
            onChange={(e) => setShowTime(e.target.checked)}
          />{' '}
          경과 시간 표시
        </label>
        <button disabled={busy || applying} onClick={analyze}>
          {analysis ? '다시 분석' : '오디오 분석'}
        </button>
        <progress max={1} value={progress} aria-label="비주얼라이저 분석 진행률" />
        <p role="status">
          {busy
            ? `소리 분석 중 · ${Math.round(progress * 100)}%`
            : analysis
              ? '분석 완료 · 완료를 누르면 새 라인에 적용됩니다.'
              : '오디오 분석을 시작하세요.'}
        </p>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="dialog-footer">
        <button disabled={applying} onClick={p.onClose}>
          취소
        </button>
        <button className="primary" disabled={!analysis || busy || applying} onClick={apply}>
          완료 · 새 라인에 추가
        </button>
      </footer>
    </Dialog>
  );
}
