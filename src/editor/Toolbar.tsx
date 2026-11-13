import type { Project } from '../project/model';

type Props = {
  project: Project;
  locked: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onName: (name: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpen: () => void;
  onSave: () => void;
  onExport: () => void;
  onHelp: () => void;
};
export function Toolbar(p: Props) {
  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark">▰</span>
        <span>
          SSG <strong>CLIP MAKER</strong>
          <small>LOCAL VIDEO STUDIO</small>
        </span>
      </div>
      <div className="project-name">
        <input
          aria-label="프로젝트 이름"
          maxLength={100}
          value={p.project.name}
          disabled={p.locked}
          onChange={(e) => p.onName(e.target.value)}
        />
        <span className="local-badge">
          <i /> 로컬 작업
        </span>
      </div>
      <nav aria-label="프로젝트 도구">
        <button disabled={p.locked} onClick={p.onOpen}>
          열기
        </button>
        <button disabled={p.locked} onClick={p.onSave}>
          저장
        </button>
        <span className="divider" />
        <button
          title="실행 취소 (Ctrl+Z)"
          aria-label="실행 취소"
          disabled={p.locked || !p.canUndo}
          onClick={p.onUndo}
        >
          ↶
        </button>
        <button
          title="다시 실행 (Ctrl+Shift+Z)"
          aria-label="다시 실행"
          disabled={p.locked || !p.canRedo}
          onClick={p.onRedo}
        >
          ↷
        </button>
        <button aria-label="단축키 도움말" onClick={p.onHelp}>
          ?
        </button>
        <button
          className="primary"
          disabled={p.locked || !p.project.clips.length}
          onClick={p.onExport}
        >
          내보내기 ↗
        </button>
      </nav>
    </header>
  );
}
