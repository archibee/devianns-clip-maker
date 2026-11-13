import { useEffect, useState } from 'react';
import { checkSupport, estimateBytes, MEMORY_LIMIT, type Support } from '../export/settings';
import type { ExportService, ExportState } from '../export/service';
import { cueErrors, dimensions, type ExportSettings, type Project } from '../project/model';
import type { MediaRegistry } from '../media/registry';
import { Dialog } from './Panel';

type Props = {
  project: Project;
  registry: MediaRegistry;
  service: ExportService;
  state: ExportState;
  onClose: () => void;
};
export function ExportDialog(p: Props) {
  const [settings, setSettings] = useState<ExportSettings>({
    resolution: 1080,
    fps: p.project.fps,
    format: 'mp4',
  });
  const [support, setSupport] = useState<Support>();
  const [direct, setDirect] = useState(false);
  const running = p.state.status === 'running';
  const [starting, setStarting] = useState(false);
  const locked = running || starting;
  const bytes = estimateBytes(p.project, settings);
  const size = dimensions(p.project.aspect, settings.resolution);
  const issues = cueErrors(p.project);
  const missing = p.project.clips.some((c) => !p.registry.has(c.assetId));
  useEffect(() => {
    let active = true;
    setSupport(undefined);
    void checkSupport(p.project, settings).then((result) => {
      if (active) setSupport(result);
    });
    return () => {
      active = false;
    };
  }, [p.project, settings]);
  return (
    <Dialog title="영상 내보내기" onClose={p.onClose} locked={locked}>
      <p className="dialog-intro">
        현재 편집 상태를 원본 에셋에서 렌더링합니다.
        <br />
        미리보기의 낮은 해상도는 출력 품질에 영향을 주지 않습니다.
      </p>
      <div className="export-summary">
        <span>최종 출력</span>
        <strong>
          {size.width} × {size.height}
        </strong>
        <small>
          {settings.fps} FPS · {p.project.clips.length} CLIPS
        </small>
      </div>
      <div className="field-pair">
        <label className="field">
          해상도
          <select
            aria-label="출력 해상도"
            value={settings.resolution}
            disabled={locked}
            onChange={(e) =>
              setSettings({
                ...settings,
                resolution: Number(e.target.value) as ExportSettings['resolution'],
              })
            }
          >
            <option value={1080}>1080p · Full HD</option>
            <option value={720}>720p · HD</option>
            <option value={480}>480p · SD</option>
          </select>
        </label>
        <label className="field">
          프레임
          <select
            aria-label="출력 프레임"
            value={settings.fps}
            disabled={locked}
            onChange={(e) =>
              setSettings({ ...settings, fps: Number(e.target.value) as ExportSettings['fps'] })
            }
          >
            {[30, 45, 60].map((f) => (
              <option key={f} value={f}>
                {f} fps
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        파일 형식
        <select
          aria-label="출력 형식"
          value={settings.format}
          disabled={locked}
          onChange={(e) =>
            setSettings({ ...settings, format: e.target.value as ExportSettings['format'] })
          }
        >
          <option value="mp4">MP4 · H.264 / AAC</option>
          <option value="webm">WebM · VP9 또는 VP8 / Opus</option>
        </select>
      </label>
      <p className={support?.supported ? 'support-ok' : 'support-status'} role="status">
        {support ? support.reason : '선택한 설정의 인코더 지원을 확인하는 중…'}
      </p>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={direct}
          disabled={locked || !('showSaveFilePicker' in window)}
          onChange={(e) => setDirect(e.target.checked)}
        />
        파일에 직접 저장 <small>지원 브라우저에서 메모리 사용량 절약</small>
      </label>
      <div className="export-estimate">
        <span>예상 용량</span>
        <strong>{(bytes / 1024 / 1024).toFixed(1)} MiB</strong>
      </div>
      {!direct && bytes > MEMORY_LIMIT && (
        <p className="inline-error">
          메모리 다운로드 한도 256MiB를 초과합니다. 직접 저장 또는 낮은 설정을 선택하세요.
        </p>
      )}
      {missing && <p className="inline-error">누락된 원본 파일을 먼저 연결하세요.</p>}
      {issues.map((issue) => (
        <p key={issue} className="inline-error">
          {issue}
        </p>
      ))}
      {p.state.status !== 'idle' && (
        <div className="export-progress" aria-live="polite">
          <div>
            <span>{p.state.stage}</span>
            <strong>{Math.round(p.state.progress * 100)}%</strong>
          </div>
          <progress max={1} value={p.state.progress} />
          {p.state.error && (
            <p className="inline-error" role="alert">
              {p.state.error}
            </p>
          )}
        </div>
      )}
      <footer className="dialog-footer">
        <button disabled={locked} onClick={p.onClose}>
          닫기
        </button>
        {running ? (
          <button className="danger" onClick={() => p.service.cancel()}>
            내보내기 취소
          </button>
        ) : (
          <button
            className="primary"
            disabled={
              starting ||
              !support?.supported ||
              missing ||
              !!issues.length ||
              (!direct && bytes > MEMORY_LIMIT)
            }
            onClick={() => {
              setStarting(true);
              void p.service
                .start(p.project, settings, p.registry, direct)
                .finally(() => setStarting(false));
            }}
          >
            {starting
              ? '저장 위치 선택 중…'
              : p.state.status === 'error'
                ? '다시 내보내기'
                : '렌더링 시작 ↗'}
          </button>
        )}
        {p.state.url && !running && (
          <a className="button primary" href={p.state.url} download={p.state.filename}>
            영상 다운로드 ↓
          </a>
        )}
      </footer>
    </Dialog>
  );
}
