import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '../../../src/project/model';
import { duration, seconds, timecode } from '../../../src/project/model';
import type { MediaRegistry } from '../../../src/media/registry';
import {
  PRESETS,
  MARGIN_PRESETS,
  MARGIN_FIELDS,
  DEFAULT_OPTIONS,
  optionsError,
  type Analysis,
  type Options,
  type Progress,
} from './contracts';
import { AnalysisClient } from './client';
import { buildProject, removals, union } from './cut-plan';
import { AutoCutPreview } from './Preview';
import './style.css';

type Props = {
  project: Project;
  registry: MediaRegistry;
  onCancel: () => void;
  onApply: (expected: Project, result: Project) => void;
};
const fields: { key: keyof Options; label: string; min: number; max: number; step: number }[] = [
  { key: 'positive', label: '음성 시작 확률', min: 0.05, max: 0.95, step: 0.01 },
  { key: 'negative', label: '음성 종료 확률', min: 0, max: 0.9, step: 0.01 },
  { key: 'beforeMs', label: '앞 여백 (ms)', min: 0, max: 2000, step: 10 },
  { key: 'afterMs', label: '뒤 여백 (ms)', min: 0, max: 2000, step: 10 },
  { key: 'silenceMs', label: '음성 종료 대기 (ms)', min: 100, max: 3000, step: 50 },
  { key: 'minSpeechMs', label: '최소 음성 길이 (ms, 0=필터 끔)', min: 0, max: 1000, step: 10 },
  { key: 'minRemoveMs', label: '최소 삭제 길이 (ms)', min: 100, max: 10000, step: 50 },
];
export default function AutoCutDialog(p: Props) {
  const [snapshot] = useState(() => p.project);
  const [client] = useState(() => new AnalysisClient());
  const [options, setOptions] = useState<Options>({ ...DEFAULT_OPTIONS });
  const [preset, setPreset] = useState('medium');
  const [marginPreset, setMarginPreset] = useState('medium');
  const [analysis, setAnalysis] = useState<Analysis>();
  const [retained, setRetained] = useState<number[]>([]);
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'ready' | 'applying'>('idle');
  const [progress, setProgress] = useState<Progress>({
    stage: '설정을 선택하고 음성 분석을 시작하세요.',
    progress: 0,
  });
  const [error, setError] = useState<string>();
  const [dropSubtitles, setDropSubtitles] = useState(false);
  const [generateSubtitles, setGenerateSubtitles] = useState(false);
  const [previewMode, setPreviewMode] = useState<'original' | 'result'>('original');
  const [seekUs, setSeekUs] = useState(0);
  const [page, setPage] = useState(0);
  const generation = useRef(0),
    section = useRef<HTMLElement>(null);
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  const busy = status === 'analyzing' || status === 'applying';
  const issue = optionsError(options);
  const removed = useMemo(
    () => (analysis ? removals(snapshot, analysis.keep) : []),
    [snapshot, analysis],
  );
  const keep = useMemo(
    () =>
      analysis
        ? union([...analysis.keep, ...retained.flatMap((i) => (removed[i] ? [removed[i]] : []))])
        : [],
    [analysis, retained, removed],
  );
  const candidate = useMemo(() => {
    if (!analysis) return { project: undefined, error: undefined };
    try {
      return { project: buildProject(snapshot, keep, true, generateSubtitles), error: undefined };
    } catch (error) {
      return { project: undefined, error: error instanceof Error ? error.message : String(error) };
    }
  }, [snapshot, analysis, keep, generateSubtitles]);
  useEffect(() => {
    section.current?.focus();
    return () => {
      generation.current++;
      client.cancel();
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
    };
  }, [client]);
  function update(next: Options) {
    generation.current++;
    client.cancel();
    setOptions(next);
    setAnalysis(undefined);
    setRetained([]);
    setPage(0);
    setPreviewMode('original');
    setStatus('idle');
    setError(undefined);
    setProgress({ stage: '설정이 변경됐습니다. 다시 분석하세요.', progress: 0 });
  }
  async function analyze() {
    if (issue || busy) return;
    const token = ++generation.current;
    setStatus('analyzing');
    setError(undefined);
    setAnalysis(undefined);
    setRetained([]);
    setPage(0);
    setPreviewMode('original');
    setProgress({ stage: '음성 분석 준비 중', progress: 0 });
    try {
      const result = await client.run(
        {
          project: snapshot,
          files: p.registry.files(),
          options: { ...options },
          assetBase: new URL(`${import.meta.env.BASE_URL}speech-auto-cut/`, document.baseURI).href,
        },
        (value) => {
          if (token === generation.current) setProgress(value);
        },
      );
      if (token !== generation.current) return;
      setAnalysis(result);
      setStatus('ready');
      setProgress({ stage: '분석 완료 · 삭제 후보를 확인하세요.', progress: 1 });
    } catch (error) {
      if (token === generation.current) {
        setError(error instanceof Error ? error.message : String(error));
        setStatus('idle');
      }
    }
  }
  function cancel() {
    if (status === 'applying') return;
    generation.current++;
    client.cancel();
    p.onCancel();
  }
  async function apply() {
    if (status !== 'ready' || !analysis || !candidate.project || issue) return;
    if (snapshot.subtitles.length && !dropSubtitles) {
      setError('기존 자막 제외에 동의해야 완료할 수 있습니다.');
      return;
    }
    setStatus('applying');
    setError(undefined);
    setProgress({ stage: '최종 컷 검증 및 타임라인 적용 중', progress: 0.98 });
    await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    try {
      const result = buildProject(snapshot, keep, dropSubtitles, generateSubtitles);
      p.onApply(snapshot, result);
    } catch (error) {
      setStatus('ready');
      setError(error instanceof Error ? error.message : String(error));
      setProgress({ stage: '적용 실패 · 기존 타임라인은 유지됩니다.', progress: 1 });
    }
  }
  function renderField(field: (typeof fields)[number]) {
    return (
      <label className="field" key={field.key}>
        {field.label}
        <input
          type="number"
          aria-label={field.label}
          min={field.min}
          max={field.max}
          step={field.step}
          value={Number.isFinite(options[field.key]) ? options[field.key] : ''}
          disabled={busy}
          onChange={(event) => {
            if (MARGIN_FIELDS.includes(field.key)) setMarginPreset('custom');
            else setPreset('custom');
            update({
              ...options,
              [field.key]: event.target.value === '' ? NaN : Number(event.target.value),
            });
          }}
        />
        <small>
          {field.min}–{field.max}
          {field.key === 'negative' ? ' · 시작 확률 미만' : ''}
        </small>
      </label>
    );
  }
  return (
    <div className="modal-backdrop auto-cut-backdrop">
      <section
        ref={section}
        className="dialog auto-cut-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auto-cut-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
          }
          if (event.key !== 'Tab') return;
          const targets = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]',
            ),
          ];
          const first = targets[0],
            last = targets.at(-1);
          if (!first) {
            event.preventDefault();
            return;
          }
          if (
            event.shiftKey &&
            (document.activeElement === first || document.activeElement === event.currentTarget)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (
            !event.shiftKey &&
            (document.activeElement === last || document.activeElement === event.currentTarget)
          ) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <header>
          <h2 id="auto-cut-title">Auto Cut · 음성 기반 자동 컷편집</h2>
          <p>프리셋 선택 → 분석 → 결과 확인 → 완료</p>
        </header>
        <div className="auto-cut-presets">
          <div className="auto-cut-preset-card">
            <label className="field">
              <span>01 · 음성 보존 강도</span>
              <select
                aria-label="음성 보존 강도"
                disabled={busy}
                value={preset}
                onChange={(event) => {
                  setPreset(event.target.value);
                  update({ ...options, ...PRESETS[event.target.value].options });
                }}
              >
                {Object.entries(PRESETS).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
                <option value="custom" disabled>
                  직접 설정
                </option>
              </select>
            </label>
            <p>{PRESETS[preset]?.description ?? '음성 판정 값을 직접 조절한 설정입니다.'}</p>
          </div>
          <div className="auto-cut-preset-card">
            <label className="field">
              <span>02 · 편집 여백</span>
              <select
                aria-label="편집 여백"
                disabled={busy}
                value={marginPreset}
                onChange={(event) => {
                  setMarginPreset(event.target.value);
                  update({ ...options, ...MARGIN_PRESETS[event.target.value].options });
                }}
              >
                {Object.entries(MARGIN_PRESETS).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
                <option value="custom" disabled>
                  직접 설정
                </option>
              </select>
            </label>
            <p>
              {MARGIN_PRESETS[marginPreset]?.description ??
                '앞뒤 여백과 최소 삭제 길이를 직접 조절한 설정입니다.'}{' '}
            </p>
          </div>
        </div>
        <p className="auto-cut-preset-note">
          강도가 높을수록 약한 음성을 더 보존합니다. 확률은 정확도 수치가 아니며, 여백은 빈 화면
          삽입이 아닌 원본 영상·소리의 보존 길이입니다.
        </p>
        <div className="auto-cut-body">
          <div className="auto-cut-settings">
            <h3 className="auto-cut-section-title">
              상세 설정 <small>직접 숫자 입력</small>
            </h3>
            <fieldset className="auto-cut-control-group">
              <legend>음성 판정</legend>
              <div className="auto-cut-fields">
                {fields.filter((f) => !MARGIN_FIELDS.includes(f.key)).map(renderField)}
              </div>
            </fieldset>
            <fieldset className="auto-cut-control-group">
              <legend>컷 편집 여백</legend>
              <div className="auto-cut-fields">
                {fields.filter((f) => MARGIN_FIELDS.includes(f.key)).map(renderField)}
              </div>
            </fieldset>
            {options.minSpeechMs > 0 && (
              <p className="auto-cut-warning">
                최소 음성 길이 필터는 짧은 응답을 제거할 수 있습니다.
              </p>
            )}
            {issue && (
              <p className="auto-cut-error" role="alert">
                {issue}
              </p>
            )}
            <button className="primary" disabled={busy || !!issue} onClick={() => void analyze()}>
              {analysis ? '다시 분석' : '음성 분석 시작'}
            </button>
            {status === 'analyzing' && (
              <button
                onClick={() => {
                  generation.current++;
                  client.cancel();
                  setStatus('idle');
                  setProgress({
                    stage: '분석 중지 · 변경사항은 적용되지 않았습니다.',
                    progress: 0,
                  });
                }}
              >
                분석 중지
              </button>
            )}
          </div>
          <div className="auto-cut-review">
            <div className="auto-cut-progress" aria-live="polite">
              <span>{progress.stage}</span>
              <b>{Math.round(progress.progress * 100)}%</b>
              <progress max={1} value={progress.progress} />
            </div>
            <p className="auto-cut-warning">
              음성을 놓치거나 음악을 오판할 수 있습니다. 결과를 들어보고 확인하세요. 완료 전에는
              적용되지 않습니다.
            </p>
            {analysis?.warnings.map((w) => (
              <p key={w} className="auto-cut-warning">
                {w}
              </p>
            ))}
            {(error || candidate.error) && (
              <p className="auto-cut-error" role="alert">
                {error || candidate.error}
              </p>
            )}
            {analysis && (
              <div className="auto-cut-summary">
                <span>
                  <small>원본 길이</small>
                  <strong>{seconds(duration(snapshot)).toFixed(2)}초</strong>
                </span>
                <span>
                  <small>결과 길이</small>
                  <strong>
                    {seconds(candidate.project ? duration(candidate.project) : 0).toFixed(2)}초
                  </strong>
                </span>
                <span>
                  <small>영상 블록</small>
                  <strong>{candidate.project?.clips.length ?? 0}개</strong>
                </span>
                <span>
                  <small>삭제 후보</small>
                  <strong>{removed.length - retained.length}개</strong>
                </span>
              </div>
            )}
            <div className="auto-cut-preview-mode">
              <button
                disabled={busy}
                aria-pressed={previewMode === 'original'}
                onClick={() => {
                  setPreviewMode('original');
                  setSeekUs(0);
                }}
              >
                원본 미리보기
              </button>
              <button
                disabled={busy || !candidate.project}
                aria-pressed={previewMode === 'result'}
                onClick={() => {
                  setPreviewMode('result');
                  setSeekUs(0);
                }}
              >
                편집 결과 미리보기
              </button>
            </div>
            <AutoCutPreview
              project={previewMode === 'result' && candidate.project ? candidate.project : snapshot}
              registry={p.registry}
              seekUs={seekUs}
              disabled={busy}
            />
            {analysis && (
              <div className="auto-cut-candidates">
                <h3>삭제 예정 구간 · 체크하면 보존</h3>
                {removed.length === 0 && (
                  <p>삭제할 긴 비음성 구간이 없습니다. 설정을 조정하거나 취소할 수 있습니다.</p>
                )}
                {removed.slice(page * 30, (page + 1) * 30).map((range, index) => {
                  const id = page * 30 + index;
                  return (
                    <div className="auto-cut-candidate" key={`${range.startUs}:${range.endUs}`}>
                      <label>
                        <input
                          type="checkbox"
                          checked={retained.includes(id)}
                          disabled={busy}
                          onChange={(event) =>
                            setRetained((ids) =>
                              event.target.checked ? [...ids, id] : ids.filter((i) => i !== id),
                            )
                          }
                        />
                        보존
                      </label>
                      <button
                        disabled={busy}
                        onClick={() => {
                          setPreviewMode('original');
                          setSeekUs(range.startUs);
                        }}
                      >
                        {timecode(range.startUs, snapshot.fps)}–
                        {timecode(range.endUs, snapshot.fps)}
                      </button>
                      <span>{seconds(range.endUs - range.startUs).toFixed(2)}초</span>
                    </div>
                  );
                })}
                {removed.length > 30 && (
                  <div className="auto-cut-pages">
                    <button disabled={busy || page === 0} onClick={() => setPage((n) => n - 1)}>
                      이전
                    </button>
                    <span>
                      {page + 1} / {Math.ceil(removed.length / 30)}
                    </span>
                    <button
                      disabled={busy || (page + 1) * 30 >= removed.length}
                      onClick={() => setPage((n) => n + 1)}
                    >
                      다음
                    </button>
                  </div>
                )}
              </div>
            )}
            <label className="auto-cut-subtitle">
              <input
                type="checkbox"
                aria-label="새 자막 자동 생성"
                checked={generateSubtitles}
                disabled={busy}
                onChange={(event) => setGenerateSubtitles(event.target.checked)}
              />
              새 자막 자동 생성 · 영상 블록마다 같은 길이의 빈 자막을 추가합니다.
              {generateSubtitles && candidate.project && (
                <span>({candidate.project.subtitles.length}개)</span>
              )}
            </label>
            {snapshot.subtitles.length > 0 && (
              <label className="auto-cut-subtitle">
                <input
                  type="checkbox"
                  checked={dropSubtitles}
                  disabled={busy}
                  onChange={(event) => setDropSubtitles(event.target.checked)}
                />
                기존 자막 {snapshot.subtitles.length}개를 제외하고 적용합니다. 기존 자막은 실행
                취소로 복구할 수 있습니다.
              </label>
            )}
            <a
              href={`${import.meta.env.BASE_URL}speech-auto-cut/licenses.txt`}
              target="_blank"
              rel="noreferrer"
            >
              모델·추론 엔진 라이선스
            </a>
          </div>
        </div>
        <footer className="dialog-footer">
          <button disabled={status === 'applying'} onClick={cancel}>
            취소
          </button>
          <button
            className="primary"
            disabled={
              status !== 'ready' ||
              !candidate.project ||
              !!issue ||
              (snapshot.subtitles.length > 0 && !dropSubtitles)
            }
            onClick={() => void apply()}
          >
            {status === 'applying' ? '적용 중…' : '완료 · 타임라인에 적용'}
          </button>
        </footer>
      </section>
    </div>
  );
}
