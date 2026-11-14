import { prepareLocalFonts } from '../render/local-fonts';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { autoCutUnavailable } from '../../modules/speech-auto-cut/src/eligibility';
import { AutoCutBoundary, AutoCutPending } from '../../modules/speech-auto-cut/src/ModuleBoundary';
import { AssetPanel } from '../editor/AssetPanel';
import { ExportDialog } from '../editor/ExportDialog';
import { Inspector, NumberField } from '../editor/Inspector';
import { HelpDialog } from '../editor/HelpDialog';
import { Dialog } from '../editor/Panel';
import { PreviewPanel } from '../editor/PreviewPanel';
import { Timeline } from '../editor/Timeline';
import { Toolbar } from '../editor/Toolbar';
import { Toast } from '../editor/Toast';
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
  emptyProject,
  layout,
  seconds,
  toUs,
  newId,
  type Asset,
  type Cue,
  type Clip,
  type Project,
} from '../project/model';
import { parseProject } from '../project/validation';
import { autosave, recover, saveProject } from '../storage/project-storage';

const AutoCutDialog = lazy(() => import('../../modules/speech-auto-cut/src/AutoCutDialog'));

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
  const [selectedCueIds, setSelectedCueIds] = useState<string[]>([]);
  const [inspectorTab, setInspectorTab] = useState<'clip' | 'subtitle'>('clip');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const cueClipboard = useRef<
    { kind: 'cue'; cue: Cue } | { kind: 'clips'; clips: Clip[] } | undefined
  >(undefined);
  const pendingSeek = useRef<number | undefined>(undefined);
  const [importing, setImporting] = useState(false);
  const importRef = useRef(false);
  const [message, setMessage] = useState<string>();
  const dismissMessage = useCallback(() => setMessage(undefined), []);
  const [notice, setNotice] = useState('영상 파일은 서버로 전송되지 않습니다.');
  const [modal, setModal] = useState<'export' | 'help' | 'recover' | 'autoCut'>();
  const [recovery, setRecovery] = useState<Project>();
  const [restoreReady, setRestoreReady] = useState(false);
  const [registryVersion, setRegistryVersion] = useState(0);
  const projectPicker = useRef<HTMLInputElement>(null);
  const reconnectPicker = useRef<HTMLInputElement>(null);
  const reconnectAsset = useRef<Asset | undefined>(undefined);
  const locked = exportState.status === 'running' || importing || modal === 'autoCut';
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const supported =
    globalThis.isSecureContext &&
    typeof globalThis.VideoDecoder === 'function' &&
    typeof globalThis.OffscreenCanvas === 'function';
  const autoCutReason = useMemo(
    () =>
      supported
        ? autoCutUnavailable(project, registry)
        : '이 브라우저는 음성 분석을 지원하지 않습니다.',
    [supported, project, registry, registryVersion],
  );
  function act(action: HistoryAction) {
    if (lockedRef.current) return false;
    try {
      const next = historyReducer(historyRef.current, action);
      if (next === historyRef.current) return false;
      if (action.type === 'load') {
        setSelectedCueIds([]);
        cueClipboard.current = undefined;
        pendingSeek.current = undefined;
      }
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
  function applyAutoCut(expected: Project, result: Project) {
    if (
      modal !== 'autoCut' ||
      historyRef.current.present !== expected ||
      importing ||
      exportState.status === 'running'
    )
      throw new Error('분석 중 프로젝트 상태가 변경됐습니다. 취소하고 다시 분석하세요.');
    const current = historyRef.current.present;
    const validated = parseProject(
      JSON.stringify({ ...current, clips: result.clips, subtitles: result.subtitles }),
    );
    if (!validated.clips.length) throw new Error('남길 영상이 없어 완료할 수 없습니다.');
    const next = historyReducer(historyRef.current, {
      type: 'command',
      command: { type: 'replaceTimeline', clips: validated.clips, subtitles: validated.subtitles },
    });
    playback.pause();
    historyRef.current = next;
    pendingSeek.current = 0;
    cueClipboard.current = undefined;
    setHistory(next);
    setSelected(undefined);
    setSelectedIds([]);
    setSelectedCue(undefined);
    setSelectedCueIds([]);
    setInspectorTab('clip');
    setMessage(undefined);
    setModal(undefined);
    setNotice('Auto Cut 적용 완료 · 실행 취소로 원래 타임라인을 복구할 수 있습니다.');
  }
  function split() {
    command({ type: 'split', timeUs: playState.timeUs });
  }
  function merge() {
    if (selectedCue || selectedIds.length < 2) return;
    command({ type: 'merge', ids: selectedIds });
  }
  function remove() {
    if (selectedCueIds.length) {
      command({ type: 'deleteCues', ids: selectedCueIds });
      setSelectedCue(undefined);
      setSelectedCueIds([]);
    } else if (selected) {
      command({ type: 'deleteClips', ids: selectedIds.length ? selectedIds : [selected] });
      setSelectedIds([]);
      setSelected(undefined);
    }
  }
  function selectClip(id: string, additive = false) {
    playback.pause();
    const ids = additive
      ? selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
      : [id];
    setSelectedIds(ids);
    setSelected(ids.at(-1));
    const row = layout(project).find((c) => c.clip.id === id);
    if (row) playback.seek(row.startUs);
    setSelectedCue(undefined);
    setSelectedCueIds([]);
    setInspectorTab('clip');
  }
  function selectCue(id?: string, additive = false) {
    playback.pause();
    const ids = !id
      ? []
      : additive
        ? selectedCueIds.includes(id)
          ? selectedCueIds.filter((value) => value !== id)
          : [...selectedCueIds, id]
        : [id];
    setSelectedCueIds(ids);
    setSelectedCue(ids.length === 1 ? ids[0] : undefined);
    setSelectedIds([]);
    setSelected(undefined);
    setInspectorTab('subtitle');
  }
  function copyCue() {
    if (selectedCueIds.length > 1) return false;
    const cue = project.subtitles.find((c) => c.id === selectedCue);
    if (!cue) {
      const clips = project.clips.filter((c) => selectedIds.includes(c.id) || c.id === selected);
      if (!clips.length) return false;
      cueClipboard.current = { kind: 'clips', clips: structuredClone(clips) };
      return true;
    }
    cueClipboard.current = { kind: 'cue', cue: structuredClone(cue) };
    return true;
  }
  function pasteCue() {
    const copied = cueClipboard.current;
    if (!copied) return false;
    if (copied.kind === 'clips') {
      const before = new Set(project.clips.map((c) => c.id));
      if (command({ type: 'pasteClips', clips: copied.clips, timeUs: playState.timeUs })) {
        const ids = historyRef.current.present.clips
          .filter((c) => !before.has(c.id))
          .map((c) => c.id);
        setSelectedIds(ids);
        setSelected(ids.at(-1));
        setSelectedCue(undefined);
        setSelectedCueIds([]);
        setInspectorTab('clip');
        pendingSeek.current =
          playState.timeUs + copied.clips.reduce((n, c) => n + c.outUs - c.inUs, 0);
      }
      return true;
    }
    const source = copied.cue;
    const cue = {
      ...source,
      id: newId(),
      startUs: playState.timeUs,
      endUs: playState.timeUs + source.endUs - source.startUs,
    };
    if (command({ type: 'cue', cue })) {
      selectCue(cue.id);
      pendingSeek.current = cue.endUs;
    }
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
    merge,
    remove,
    undo,
    redo,
    copyCue,
    pasteCue,
  });
  useEffect(() => {
    const cueIds = selectedCueIds.filter((id) => project.subtitles.some((c) => c.id === id));
    if (cueIds.length !== selectedCueIds.length) setSelectedCueIds(cueIds);
    setSelectedCue(cueIds.length === 1 ? cueIds[0] : undefined);
    if (selected && !project.clips.some((c) => c.id === selected)) setSelected(undefined);
    setSelectedIds((ids) =>
      ids.every((id) => project.clips.some((c) => c.id === id))
        ? ids
        : ids.filter((id) => project.clips.some((c) => c.id === id)),
    );
    if (selectedCue && !project.subtitles.some((c) => c.id === selectedCue))
      setSelectedCue(undefined);
  }, [project, selected, selectedCue, selectedCueIds]);
  useEffect(() => {
    let active = true;
    void prepareLocalFonts(project)
      .catch((error) => {
        if (active) setMessage(String(error));
      })
      .then(() => {
        if (!active) return;
        playback.bind(project);
        if (pendingSeek.current !== undefined) {
          playback.seek(pendingSeek.current);
          pendingSeek.current = undefined;
        }
      });
    return () => {
      active = false;
    };
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
        if (active && p && (p.clips.length || p.assets.length || p.subtitles.length)) {
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
      <div className="toast-region" role="region" aria-label="알림">
        {!supported && (
          <Toast message="HTTPS 또는 localhost의 최신 Chrome·Edge에서 여세요. 이 환경은 WebCodecs/OffscreenCanvas를 지원하지 않습니다." />
        )}
        {message && <Toast message={message} onDismiss={dismissMessage} />}
      </div>
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
          selectedIds={selectedIds}
          project={project}
          selected={selected}
          onTransform={(id, transform, mode) =>
            selectedIds.length > 1
              ? command({
                  type: 'transforms',
                  ids: selectedIds,
                  patch:
                    mode === 'move'
                      ? { x: transform.x, y: transform.y }
                      : mode === 'resize'
                        ? { scale: transform.scale }
                        : {
                            crop: transform.crop,
                            scale: transform.scale,
                            x: transform.x,
                            y: transform.y,
                          },
                })
              : command({ type: 'transform', id, transform })
          }
          state={playState}
          playback={playback}
          locked={locked}
          onSeek={(us) => playback.seek(us)}
          onToggle={toggle}
        />
        <Inspector
          selectedIds={selectedIds}
          selectedCueIds={selectedCueIds}
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
          selectedCueIds={selectedCueIds}
          autoCutUnavailable={autoCutReason}
          onAutoCut={() => {
            if (!locked && !autoCutUnavailable(project, registry)) {
              playback.pause();
              setModal('autoCut');
            }
          }}
          selectedIds={selectedIds}
          onMerge={merge}
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
            max={seconds(Number.MAX_SAFE_INTEGER)}
            disabled={locked}
            onCommit={(n) => playback.seek(toUs(n))}
          />
        </div>
        <span>
          WEB CODECS <b>·</b> LOCAL FIRST
        </span>
      </footer>
      {modal === 'autoCut' && (
        <AutoCutBoundary onCancel={() => setModal(undefined)}>
          <Suspense fallback={<AutoCutPending onCancel={() => setModal(undefined)} />}>
            <AutoCutDialog
              project={project}
              registry={registry}
              onCancel={() => setModal(undefined)}
              onApply={applyAutoCut}
            />
          </Suspense>
        </AutoCutBoundary>
      )}
      {modal === 'export' && (
        <ExportDialog
          project={project}
          registry={registry}
          service={exporter}
          state={exportState}
          onClose={() => setModal(undefined)}
        />
      )}
      {modal === 'help' && <HelpDialog onClose={() => setModal(undefined)} />}
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
