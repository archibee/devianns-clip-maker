import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../../../src/editor/Panel';
import { recordingUnavailable, ScreenRecordingService, type RecordingState } from './service';
import './style.css';
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
    state.status === 'finishing' ||
    state.status === 'selecting';
  return (
    <Dialog title="탭·화면 녹화" onClose={close} locked={locked}>
      <div className="record-dialog-body">
        <p>
          다른 탭이나 창을 선택해 녹화합니다. 탭의 소리도 필요하면 브라우저 공유창에서 소리 공유를
          켜세요.
        </p>
        {issue && (
          <p className="inline-error" role="alert">
            {issue}
          </p>
        )}
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          aria-label="녹화할 공유 화면 미리보기"
          className="record-preview"
        />
        {state.hasAudio !== undefined && (
          <p className={state.hasAudio ? 'record-audio' : 'record-warning'}>
            {state.hasAudio ? '공유 소리 포함' : '공유 소리 없음 · 무음 영상으로 녹화됩니다.'}
          </p>
        )}
        <p className="record-status" role="status">
          {importing
            ? '완성된 영상을 프로젝트 에셋에 추가하는 중…'
            : imported
              ? '녹화 영상이 프로젝트 에셋에 추가됐습니다.'
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
        <small className="muted">
          최대 128 MiB / 30분 · 탭 녹화 지원과 공유 소리는 브라우저에 따라 다릅니다. 원본은 외부로
          전송하지 않습니다.
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
            <button className="primary" onClick={() => service.start()}>
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
