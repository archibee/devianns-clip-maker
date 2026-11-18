import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Project } from '../../../src/project/model';
import { timecode } from '../../../src/project/model';
import type { MediaRegistry } from '../../../src/media/registry';
import { AnalysisClient } from '../../speech-auto-cut/src/client';
import type { Analysis, Progress } from '../../speech-auto-cut/src/contracts';
import { buildCaptions, captionOptions, captionScope, CAPTION_PRESETS } from './plan';
import './style.css';

type Props = { project: Project; lane: number; registry: MediaRegistry;
  onCancel: () => void; onApply: (expected: Project, result: Project) => void };

export class AutoCaptionBoundary extends Component<{children: ReactNode; onCancel: () => void}, {error?: string}> {
  state: {error?: string} = {};
  static getDerivedStateFromError(error: unknown) {
    return {error: error instanceof Error ? error.message : String(error)};
  }
  render() {
    return this.state.error ? <div className="modal-backdrop"><section className="dialog" role="dialog" aria-modal="true" aria-label="빈 자막 생성 오류">
      <h2>빈 자막 생성을 열지 못했습니다</h2><p role="alert">{this.state.error}</p>
      <button autoFocus onClick={this.props.onCancel}>취소</button>
    </section></div> : this.props.children;
  }
}

export default function AutoCaptionDialog(p: Props) {
  const [snapshot] = useState(p.project);
  const [lane] = useState(p.lane);
  const scope = useMemo(() => captionScope(snapshot, lane), [snapshot, lane]);
  const [client] = useState(() => new AnalysisClient());
  const [preset, setPreset] = useState(2);
  const [analysis, setAnalysis] = useState<Analysis>();
  const [status, setStatus] = useState<'idle'|'analyzing'|'ready'|'applying'>('idle');
  const [progress, setProgress] = useState<Progress>({stage: '강도를 선택하고 음성 분석을 시작하세요.', progress: 0});
  const [error, setError] = useState<string>();
  const [page, setPage] = useState(0);
  const generation = useRef(0), section = useRef<HTMLElement>(null);
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  const busy = status === 'analyzing' || status === 'applying';
  useEffect(() => {
    section.current?.focus();
    return () => { generation.current++; client.cancel(); if (previousFocus.current?.isConnected) previousFocus.current.focus(); };
  }, [client]);
  async function analyze() {
    if (busy) return;
    const token = ++generation.current;
    setStatus('analyzing'); setAnalysis(undefined); setError(undefined); setPage(0);
    setProgress({stage: '음성 분석 준비 중', progress: 0});
    try {
      const result = await client.run({purpose: 'caption', project: scope, files: p.registry.files(),
        options: captionOptions(preset),
        assetBase: new URL(`${import.meta.env.BASE_URL}speech-auto-cut/`, document.baseURI).href,
      }, value => { if (token === generation.current) setProgress(value); });
      if (token !== generation.current) return;
      setAnalysis(result); setStatus('ready');
      setProgress({stage: result.keep.length ? `분석 완료 · 빈 자막 ${result.keep.length}개` : '감지된 음성 구간이 없습니다. 생성할 자막이 없습니다.', progress: 1});
    } catch (error) {
      if (token === generation.current) { setError(error instanceof Error ? error.message : String(error)); setStatus('idle'); }
    }
  }
  function cancel() {
    if (status === 'applying') return;
    generation.current++; client.cancel(); p.onCancel();
  }
  async function apply() {
    if (status !== 'ready' || !analysis) return;
    setStatus('applying'); setError(undefined); setProgress({stage: '새 자막 라인 적용 중', progress: 1});
    await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    try { p.onApply(snapshot, buildCaptions(snapshot, lane, analysis.keep)); }
    catch (error) { setStatus('ready'); setError(error instanceof Error ? error.message : String(error)); }
  }
  return <div className="modal-backdrop"><section ref={section} className="dialog auto-caption-dialog"
    role="dialog" aria-modal="true" aria-labelledby="auto-caption-title" tabIndex={-1}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
      if (event.key !== 'Tab') return;
      const targets = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),a[href]')];
      const first = targets[0], last = targets.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) { event.preventDefault(); first.focus(); }
    }}>
    <header><h2 id="auto-caption-title">빈 자막 생성 · 음성 구간 기반</h2></header>
    <p>라인 {lane + 1}의 음성 구간에 빈 자막을 만듭니다. 영상과 기존 자막의 위치는 유지됩니다.</p>
    <label className="field">음성 인식 강도
      <select value={preset} disabled={busy} onChange={event => {
        setPreset(Number(event.target.value)); setAnalysis(undefined); setStatus('idle'); setError(undefined); setPage(0);
        setProgress({stage: '설정이 변경됐습니다. 다시 분석하세요.', progress: 0});
      }}>{CAPTION_PRESETS.map((item, index) => <option key={item.label} value={index}>{item.label}</option>)}</select>
    </label>
    <p className="muted">높을수록 약한 음성을 더 감지합니다. 시작 임계값은 매우 높음 0.3부터 매우 낮음 0.7까지입니다. 음성 내용을 글자로 변환하지 않습니다.</p>
    <button className="primary" disabled={busy} onClick={() => void analyze()}>{analysis ? '다시 분석' : '음성 분석 시작'}</button>
    <div className="auto-caption-progress" aria-live="polite"><span>{progress.stage}</span>
      <progress max={1} value={progress.progress} aria-label="음성 분석 진행률" />
    </div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {analysis?.warnings.map(warning => <p key={warning}>{warning}</p>)}
    {analysis && <div className="auto-caption-results">
      {analysis.keep.slice(page * 30, (page + 1) * 30).map(range => <div key={`${range.startUs}:${range.endUs}`}>
        {timecode(range.startUs, snapshot.fps)} – {timecode(range.endUs, snapshot.fps)}
      </div>)}
      {analysis.keep.length > 30 && <div className="auto-caption-pages">
        <button disabled={busy || page === 0} onClick={() => setPage(n => n - 1)}>이전</button>
        <span>{page + 1} / {Math.ceil(analysis.keep.length / 30)}</span>
        <button disabled={busy || (page + 1) * 30 >= analysis.keep.length} onClick={() => setPage(n => n + 1)}>다음</button>
      </div>}
    </div>}
    <a href={`${import.meta.env.BASE_URL}speech-auto-cut/licenses.txt`} target="_blank" rel="noreferrer">모델·추론 엔진 라이선스</a>
    <footer className="dialog-footer"><button disabled={status === 'applying'} onClick={cancel}>취소</button>
      <button className="primary" disabled={status !== 'ready'} onClick={() => void apply()}>{status === 'applying' ? '적용 중…' : '완료 · 타임라인에 적용'}</button>
    </footer>
  </section></div>;
}
