import { useEffect, useRef, useState } from 'react';
import { AssetPanel } from '../editor/AssetPanel';
import { ExportDialog } from '../editor/ExportDialog';
import { Inspector, NumberField } from '../editor/Inspector';
import { Dialog } from '../editor/Panel';
import { PreviewPanel } from '../editor/PreviewPanel';
import { Timeline } from '../editor/Timeline';
import { Toolbar } from '../editor/Toolbar';
import { useShortcuts } from '../editor/useShortcuts';
import { ExportService, type ExportState } from '../export/service';
import { MediaRegistry } from '../media/registry';
import { PlaybackService, type PlaybackState } from '../playback/service';
import {
  historyReducer,
  initialHistory,
  type Command,
  type HistoryAction,
} from '../project/commands';
import {
  duration,
  emptyProject,
  layout,
  seconds,
  toUs,
  newId,
  type Asset,
  type Cue,
  type Project,
} from '../project/model';
import { parseProject } from '../project/validation';
import { autosave, recover, saveProject } from '../storage/project-storage';

export function App() {
  const [history, setHistory] = useState(() => initialHistory(emptyProject()));
  const historyRef = useRef(history);
  historyRef.current = history;
  const project = history.present;
  const [registry] = useState(() => new MediaRegistry());
  const [playState, setPlayState] = useState<PlaybackState>({
    timeUs: 0,
    playing: false,
    buffering: false,
  });
  const [playback] = useState(() => new PlaybackService(registry, setPlayState));
  const [exportState, setExportState] = useState<ExportState>({
    status: 'idle',
    progress: 0,
    stage: '',
  });
  const [exporter] = useState(() => new ExportService(setExportState));
  const [selected, setSelected] = useState<string>();
  const [selectedCue, setSelectedCue] = useState<string>();
  const [inspectorTab, setInspectorTab] = useState<'clip' | 'subtitle'>('clip');
  const cueClipboard = useRef<Cue | undefined>(undefined);
  const [importing, setImporting] = useState(false);
  const importRef = useRef(false);
  const [message, setMessage] = useState<string>();
  const [notice, setNotice] = useState('영상 파일은 서버로 전송되지 않습니다.');
  const [modal, setModal] = useState<'export' | 'help' | 'recover'>();
  const [recovery, setRecovery] = useState<Project>();
  const [restoreReady, setRestoreReady] = useState(false);
  const [registryVersion, setRegistryVersion] = useState(0);
  const projectPicker = useRef<HTMLInputElement>(null);
  const reconnectPicker = useRef<HTMLInputElement>(null);
  const reconnectAsset = useRef<Asset | undefined>(undefined);
  const locked = exportState.status === 'running' || importing;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const supported =
    globalThis.isSecureContext &&
    typeof globalThis.VideoDecoder === 'function' &&
    typeof globalThis.OffscreenCanvas === 'function';
  function act(action: HistoryAction) {
    if (lockedRef.current) return false;
    try {
      const next = historyReducer(historyRef.current, action);
      if (next === historyRef.current) return false;
      playback.pause();
      historyRef.current = next;
      setHistory(next);
      setMessage(undefined);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return false;
    }
  }
  function command(cmd: Command) {
    return act({ type: 'command', command: cmd });
  }
  function split() {
    command({ type: 'split', timeUs: playState.timeUs });
  }
  function remove() {
    if (selectedCue) {
      command({ type: 'deleteCue', id: selectedCue });
      setSelectedCue(undefined);
    } else if (selected) {
      command({ type: 'delete', id: selected });
      setSelected(undefined);
    }
  }
  function selectClip(id: string) {
    playback.pause();
    setSelected(id);
    setSelectedCue(undefined);
    setInspectorTab('clip');
  }
  function selectCue(id?: string) {
    playback.pause();
    setSelectedCue(id);
    setSelected(undefined);
    setInspectorTab('subtitle');
  }
  function copyCue() {
    const cue = project.subtitles.find((c) => c.id === selectedCue);
    if (!cue) return false;
    cueClipboard.current = { ...cue };
    return true;
  }
  function pasteCue() {
    const source = cueClipboard.current;
    if (!source) return false;
    const cue = {
      ...source,
      id: newId(),
      startUs: playState.timeUs,
      endUs: playState.timeUs + source.endUs - source.startUs,
    };
    if (command({ type: 'cue', cue })) selectCue(cue.id);
    return true;
  }
  function toggle() {
    if (playState.playing) playback.pause();
    else void playback.play();
  }
  function seekFrame(delta: number) {
    playback.seek(playState.timeUs + Math.round((delta * 1_000_000) / project.fps));
  }
  function undo() {
    act({ type: 'undo' });
  }
  function redo() {
    act({ type: 'redo' });
  }
  function insert(assetId: string) {
    const rows = layout(historyRef.current.present);
    const index = rows.findIndex((x) => playState.timeUs < (x.startUs + x.endUs) / 2);
    command({ type: 'insert', assetId, index: index < 0 ? rows.length : index });
  }
  useShortcuts({
    locked,
    modal: !!modal,
    toggle,
    seekFrame,
    split,
    remove,
    undo,
    redo,
    copyCue,
    pasteCue,
  });
  useEffect(() => {
    if (selected && !project.clips.some((c) => c.id === selected)) setSelected(undefined);
    if (selectedCue && !project.subtitles.some((c) => c.id === selectedCue))
      setSelectedCue(undefined);
  }, [project, selected, selectedCue]);
  useEffect(() => {
    playback.bind(project);
  }, [playback, project, registryVersion]);
  useEffect(() => {
    const ids = new Set(
      [...history.past, history.present, ...history.future].flatMap((p) =>
        p.assets.map((a) => a.id),
      ),
    );
    registry.retain(ids);
  }, [history, registry]);
  useEffect(() => {
    if (exportState.status === 'running') playback.suspendPreview();
    else playback.refresh();
  }, [exportState.status, playback]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) playback.pause();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  }, [playback]);
  useEffect(() => {
    let active = true;
    void recover()
      .then((p) => {
        if (active && p && (p.clips.length || p.assets.length)) {
          setRecovery(p);
          setModal('recover');
        }
      })
      .catch(() => {
        if (active) setNotice('자동 복구를 읽지 못했습니다. JSON으로 프로젝트를 저장하세요.');
      })
      .finally(() => {
        if (active) setRestoreReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!restoreReady || modal === 'recover') return;
    const timer = setTimeout(() => {
      void autosave(project)
        .then(() => setNotice('편집 상태 자동 저장됨 · 원본은 별도로 보관하세요.'))
        .catch(() => setNotice('자동 저장 실패 · JSON 프로젝트를 저장하세요.'));
    }, 700);
    return () => clearTimeout(timer);
  }, [project, restoreReady, modal]);
  useEffect(
    () => () => {
      playback.dispose();
      exporter.dispose();
      registry.dispose();
    },
    [playback, exporter, registry],
  );

  async function importFiles(files: File[]) {
    if (!files.length || importRef.current || exportState.status === 'running') return;
    if (historyRef.current.present.assets.length + files.length > 500) {
      setMessage('에셋은 최대 500개까지 추가할 수 있습니다.');
      return;
    }
    importRef.current = true;
    setImporting(true);
    playback.pause();
    const assets: Asset[] = [],
      failures: string[] = [];
    for (const file of files) {
      try {
        assets.push(await registry.add(file));
      } catch (error) {
        failures.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (assets.length) {
      const next = historyReducer(historyRef.current, {
        type: 'command',
        command: { type: 'assets', assets },
      });
      historyRef.current = next;
      setHistory(next);
    }
    setMessage(failures.length ? failures.join('\n') : undefined);
    setNotice(`${assets.length}개 에셋을 가져왔습니다. 타임라인에 추가하세요.`);
    setRegistryVersion((v) => v + 1);
    setImporting(false);
    importRef.current = false;
  }
  async function reconnect(file: File) {
    const asset = reconnectAsset.current;
    if (!asset) return;
    setImporting(true);
    try {
      await registry.add(file, asset);
      setMessage(undefined);
      setRegistryVersion((v) => v + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setImporting(false);
      reconnectAsset.current = undefined;
    }
  }
  return (
    <div className="app-shell">
      <Toolbar
        project={project}
        locked={locked}
        canUndo={!!history.past.length}
        canRedo={!!history.future.length}
        onName={(name) => command({ type: 'settings', patch: { name } })}
        onUndo={undo}
        onRedo={redo}
        onOpen={() => projectPicker.current?.click()}
        onSave={() => saveProject(project)}
        onExport={() => {
          playback.pause();
          setExportState({ status: 'idle', progress: 0, stage: '' });
          setModal('export');
        }}
        onHelp={() => setModal('help')}
      />
      <input
        ref={projectPicker}
        type="file"
        accept=".json"
        hidden
        data-testid="project-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          if (file.size > 2_000_000) {
            setMessage('프로젝트 파일은 2MB 이하만 지원합니다.');
            return;
          }
          void file
            .text()
            .then((text) => {
              act({ type: 'load', project: parseProject(text) });
              setSelected(undefined);
              setSelectedCue(undefined);
              playback.seek(0);
            })
            .catch((error) => setMessage(error.message));
        }}
      />
      <input
        ref={reconnectPicker}
        type="file"
        hidden
        accept="video/*,.mkv"
        data-testid="reconnect-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void reconnect(file);
        }}
      />
      {!supported && (
        <div className="banner-error" role="alert">
          HTTPS 또는 localhost의 최신 Chrome·Edge에서 여세요. 이 환경은 WebCodecs/OffscreenCanvas를
          지원하지 않습니다.
        </div>
      )}
      {message && (
        <div className="banner-error" role="alert">
          <span>{message}</span>
          <button aria-label="알림 닫기" onClick={() => setMessage(undefined)}>
            ×
          </button>
        </div>
      )}
      <main className="workspace" aria-busy={locked}>
        <AssetPanel
          project={project}
          registry={registry}
          importing={importing}
          locked={locked || !supported}
          onImport={(files) => void importFiles(files)}
          onInsert={insert}
          onReconnect={(asset) => {
            reconnectAsset.current = asset;
            reconnectPicker.current?.click();
          }}
        />
        <PreviewPanel
          project={project}
          state={playState}
          playback={playback}
          locked={locked}
          onSeek={(us) => playback.seek(us)}
          onToggle={toggle}
        />
        <Inspector
          project={project}
          selected={selected}
          selectedCue={selectedCue}
          tab={inspectorTab}
          onTabChange={setInspectorTab}
          onSelectCue={selectCue}
          timeUs={playState.timeUs}
          locked={locked}
          onCommand={command}
          onSeek={(us) => playback.seek(us)}
        />
        <Timeline
          project={project}
          selected={selected}
          selectedCue={selectedCue}
          timeUs={playState.timeUs}
          locked={locked}
          onSelect={selectClip}
          onSelectCue={selectCue}
          onSeek={(us) => playback.seek(us)}
          onCommand={command}
          onSplit={split}
          onDelete={remove}
        />
      </main>
      <footer className="statusbar">
        <span>
          <i className="status-dot" />
          {notice}
        </span>
        <div className="precise-seek">
          <NumberField
            label="이동 (초)"
            value={seconds(playState.timeUs)}
            min={0}
            max={seconds(duration(project))}
            disabled={locked}
            onCommit={(n) => playback.seek(toUs(n))}
          />
        </div>
        <span>
          WEB CODECS <b>·</b> LOCAL FIRST
        </span>
      </footer>
      {modal === 'export' && (
        <ExportDialog
          project={project}
          registry={registry}
          service={exporter}
          state={exportState}
          onClose={() => setModal(undefined)}
        />
      )}
      {modal === 'help' && (
        <Dialog title="편집 가이드 & 단축키" onClose={() => setModal(undefined)}>
          <p>
            ① 임포트 → ② 에셋을 타임라인으로 드래그 → ③ 재생 위치에서 분할 → ④ 순서·원본 구간 조정 →
            ⑤ 내보내기
          </p>
          <dl className="shortcut-list">
            {[
              ['Space', '재생 / 정지'],
              ['← / →', '이전 / 다음 프레임'],
              ['S', '재생 위치에서 분할'],
              ['Delete', '선택한 클립 삭제'],
              ['Ctrl / ⌘ + Z', '실행 취소'],
              ['Ctrl / ⌘ + Shift + Z', '다시 실행'],
            ].map(([key, text]) => (
              <div key={key}>
                <dt>
                  <kbd>{key}</kbd>
                </dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
          <p className="hint">
            텍스트 입력 중에는 편집 단축키가 실행되지 않습니다. 에셋 우클릭 또는 ＋ 버튼으로도
            삽입할 수 있습니다. 원본 오디오는 영상과 함께 편집되며 독립 오디오 편집은 제공하지
            않습니다.
          </p>
          <button className="primary" onClick={() => setModal(undefined)}>
            편집으로 돌아가기
          </button>
          <p className="hint">
            <a
              href={`${import.meta.env.BASE_URL}THIRD_PARTY_LICENSES.txt`}
              target="_blank"
              rel="noreferrer"
            >
              오픈소스 라이선스 및 원본 안내
            </a>
          </p>
        </Dialog>
      )}
      {modal === 'recover' && (
        <Dialog
          title="이전 편집을 복구할까요?"
          onClose={() => {
            setModal(undefined);
            setRecovery(undefined);
          }}
        >
          <p>
            이 브라우저에 저장한 프로젝트가 있습니다. 원본 영상은 포함되지 않으므로 파일을 다시
            연결해야 할 수 있습니다.
          </p>
          <strong>{recovery?.name}</strong>
          <footer className="dialog-footer">
            <button
              onClick={() => {
                setModal(undefined);
                setRecovery(undefined);
              }}
            >
              새로 시작
            </button>
            <button
              className="primary"
              onClick={() => {
                if (recovery) act({ type: 'load', project: recovery });
                setModal(undefined);
                setRecovery(undefined);
              }}
            >
              편집 복구
            </button>
          </footer>
        </Dialog>
      )}
    </div>
  );
}
