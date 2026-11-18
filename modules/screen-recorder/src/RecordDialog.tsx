import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../../../src/editor/Panel';
import { recordingUnavailable, ScreenRecordingService, type RecordingState } from './service';
import './style.css';
import { FULL_REGION, type RecordRegion } from './geometry';
import { RegionSelector } from './RegionSelector';
export function RecordDialog(p: {
  onClose: () => void;
  onImport: (file: File) => Promise<boolean>;
}) {
  const [state, setState] = useState<RecordingState>({ status: 'idle', bytes: 0 });
  const [file, setFile] = useState<File>(),
    [importing, setImporting] = useState(false),
    [imported, setImported] = useState(false),
    [error, setError] = useState<string>();
  const [elapsed, setElapsed] = useState(0);
  const [mode, setMode] = useState<'full' | 'region'>('full');
  const [region, setRegion] = useState<RecordRegion>({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 });
  const [service] = useState(() => new ScreenRecordingService(setState, setFile));
  const video = useRef<HTMLVideoElement>(null),
    props = useRef(p),
    alive = useRef(true);
  props.current = p;
  const issue = recordingUnavailable();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      service.cancel();
    };
  }, [service]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = state.stream ?? null;
    if (state.stream) void element.play().catch(() => {});
    return () => {
      element.srcObject = null;
    };
  }, [state.stream]);
  useEffect(() => {
    if (state.status !== 'recording') return;
    const start = performance.now();
    setElapsed(0);
    const timer = setInterval(
      () => setElapsed(Math.floor((performance.now() - start) / 1000)),
      500,
    );
    return () => clearInterval(timer);
  }, [state.status]);
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setImporting(true);
    void props.current
      .onImport(file)
      .then((success) => {
        if (cancelled || !alive.current) return;
        setImported(success);
        if (!success)
          setError(
            '녹화 파일을 에셋으로 가져오지 못했습니다. 파일을 저장하고 지원 코덱을 확인하세요.',
          );
      })
      .catch(() => {
        if (!cancelled && alive.current)
          setError('녹화 파일을 가져오지 못했습니다. 파일을 저장해 다시 가져올 수 있습니다.');
      })
      .finally(() => {
        if (!cancelled && alive.current) setImporting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file]);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!file) return;
    const value = URL.createObjectURL(file);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);
  function close() {
    if (importing || state.status === 'finishing') return;
    service.cancel();
    p.onClose();
  }
  const locked =
    importing ||
    state.status === 'recording' ||
    state.status === 'preparing' ||
    state.status === 'finishing' ||
    state.status === 'selecting';
  return (
    <Dialog title="탭·화면 녹화" onClose={close} locked={locked}>
      <div className="record-dialog-body">
        <p>
          탭·창·전체 화면을 선택해 녹화합니다. 소리도 필요하면 브라우저 공유창에서 탭 오디오 또는
          시스템 오디오 공유를 켜세요.
        </p>
        {issue && (
          <p className="inline-error" role="alert">
            {issue}
          </p>
        )}
        <div className="record-preview-surface">
          <video
            ref={video}
            autoPlay
            playsInline
            muted
            aria-label="녹화할 공유 화면 미리보기"
            className="record-preview"
          />
          {state.status === 'ready' && mode === 'region' && (
            <RegionSelector video={video} region={region} onChange={setRegion} />
          )}
        </div>
        {state.status === 'ready' && (
          <fieldset className="record-mode">
            <legend>녹화 범위</legend>
            <label>
              <input
                type="radio"
                name="record-mode"
                value="full"
                checked={mode === 'full'}
                onChange={() => setMode('full')}
              />
              전체
            </label>
            <label>
              <input
                type="radio"
                name="record-mode"
                value="region"
                checked={mode === 'region'}
                onChange={() => setMode('region')}
              />
              사각형 지정
            </label>
            {mode === 'region' && (
              <button onClick={() => setRegion({ ...FULL_REGION })}>영역 초기화</button>
            )}
          </fieldset>
        )}
        {state.status === 'ready' && mode === 'region' && (
          <p className="record-warning">
            미리보기 위에서 드래그해 영역을 그리거나 사각형·모서리를 움직이세요. 선택 위치는 영상
            요소를 자동 추적하지 않으며 탭 배치가 바뀌면 다시 선택해야 합니다.
          </p>
        )}
        {state.status === 'ready' && mode === 'region' && (
          <details>
            <summary>영역 수치 조정</summary>
            <div className="record-region-fields">
              {(['x', 'y', 'width', 'height'] as const).map((key, index) => {
                const min = key === 'x' || key === 'y' ? 0 : 2;
                const max =
                  (key === 'x'
                    ? 1 - region.width
                    : key === 'y'
                      ? 1 - region.height
                      : key === 'width'
                        ? 1 - region.x
                        : 1 - region.y) * 100;
                const label = ['X', 'Y', '너비', '높이'][index];
                return (
                  <label className="field" key={key}>
                    {label} (%)
                    <input
                      type="number"
                      aria-label={`녹화 영역 ${label} (%)`}
                      min={min}
                      max={Math.floor(max * 100) / 100}
                      step={1}
                      value={Math.round(region[key] * 10000) / 100}
                      onChange={(event) => {
                        const value = event.target.valueAsNumber;
                        if (Number.isFinite(value))
                          setRegion({
                            ...region,
                            [key]: Math.min(max, Math.max(min, value)) / 100,
                          });
                      }}
                    />
                  </label>
                );
              })}
            </div>
          </details>
        )}
        {state.hasAudio !== undefined && (
          <p className={state.hasAudio ? 'record-audio' : 'record-warning'}>
            {state.hasAudio
              ? '브라우저 공유 오디오 포함'
              : '브라우저가 오디오 트랙을 공유하지 않았습니다. 소리 공유를 켜 다시 선택하세요. 그대로 시작하면 무음 영상으로 녹화됩니다.'}
          </p>
        )}
        <p className="record-status" role="status">
          {importing
            ? '완성된 영상을 프로젝트 에셋에 추가하는 중…'
            : imported
              ? '녹화 영상이 프로젝트 에셋에 추가됐습니다.'
              : state.status === 'preparing'
                ? '녹화 크기를 고정하고 영상을 준비하는 중…'
                : state.status === 'recording'
                  ? `● 녹화 중 · ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')} · ${(state.bytes / 1024 / 1024).toFixed(1)} MiB`
                  : state.status === 'finishing'
                    ? '녹화 파일을 마무리하는 중…'
                    : state.status === 'selecting'
                      ? '브라우저에서 공유할 탭을 선택하세요.'
                      : state.status === 'ready'
                        ? '공유 화면과 소리를 확인한 뒤 녹화를 시작하세요.'
                        : '녹화할 탭을 선택하세요.'}
        </p>
        {state.outputSize && (
          <small>
            녹화 크기 {state.outputSize.width} × {state.outputSize.height} · 비율 유지
          </small>
        )}
        <small className="muted">
          최대 128 MiB / 30분 · 시스템 소리가 들리더라도 브라우저·OS에서 오디오 공유를 지원해야
          녹음됩니다. 원본은 외부로 전송하지 않습니다.
        </small>
        {state.reason && <p>{state.reason}</p>}
        {(state.error || error) && (
          <p role="alert" className="inline-error">
            {state.error || error}
          </p>
        )}
      </div>
      <footer className="dialog-footer record-actions">
        <button disabled={importing || state.status === 'finishing'} onClick={close}>
          {file ? '닫기' : '취소'}
        </button>
        {(state.status === 'idle' || state.status === 'error') && (
          <button className="primary" disabled={!!issue} onClick={() => void service.choose()}>
            녹화할 탭 선택
          </button>
        )}
        {state.status === 'ready' && (
          <>
            <button onClick={() => void service.choose()}>다시 선택</button>
            <button
              className="primary"
              onClick={() => void service.start(mode === 'region' ? region : FULL_REGION)}
            >
              녹화 시작
            </button>
          </>
        )}
        {state.status === 'recording' && (
          <button className="primary" onClick={() => service.stop()}>
            녹화 완료 · 에셋에 추가
          </button>
        )}
        {file && url && (
          <a className="button" href={url} download={file.name}>
            녹화 파일 저장
          </a>
        )}
      </footer>
    </Dialog>
  );
}
