import { useRef, useState, type DragEvent } from 'react';
import type { Asset, Project } from '../project/model';
import { timecode } from '../project/model';
import type { MediaRegistry } from '../media/registry';
import { PanelTitle } from './Panel';

export const ASSET_DRAG = 'application/x-ssg-asset';
type Props = {
  project: Project;
  registry: MediaRegistry;
  importing: boolean;
  locked: boolean;
  onImport: (files: File[]) => void;
  onRecord: () => void;
  onInsert: (id: string) => void;
  onRemove:(id:string)=>void;
  onReconnect: (asset: Asset) => void;
};
export function AssetPanel(p: Props) {
  const picker = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<string>();
  const [over, setOver] = useState(false);
  const acceptDrop = (e: DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      setOver(true);
    }
  };
  return (
    <section
      className={`asset-panel panel ${over ? 'drag-over' : ''}`}
      onDragOver={acceptDrop}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!p.locked) p.onImport([...e.dataTransfer.files]);
      }}
    >
      <PanelTitle number="01" title="미디어">
        <button className="subtle record-open" disabled={p.locked || p.importing} onClick={p.onRecord} title="다른 탭·창·화면을 녹화해 에셋에 추가" aria-label="탭·화면 녹화">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2" y="3" width="16" height="11" rx="2"/><path d="M6 18h8m-4-4v4"/><circle cx="10" cy="8.5" r="2.5" fill="currentColor" stroke="none"/></svg>
          녹화
        </button>
        <span className="count">{p.project.assets.length}</span>
      </PanelTitle>
      <div className="asset-tools">
        <span>프로젝트 에셋</span>
        <button
          className="subtle"
          onClick={() => picker.current?.click()}
          disabled={p.locked || p.importing}
        >
          ＋ 임포트
        </button>
      </div>
      <input
        ref={picker}
        type="file"
        accept="video/*,.mkv,.mov,.webm,.mp4"
        multiple
        hidden
        data-testid="import-input"
        onChange={(e) => {
          if (e.target.files) p.onImport([...e.target.files]);
          e.target.value = '';
        }}
      />
      <div className="asset-list" onClick={() => menu && setMenu(undefined)}>
        {p.project.assets.map((asset) => {
          const entry = p.registry.get(asset.id);
          return (
            <article
              key={asset.id}
              className={`asset-card ${!entry ? 'missing' : ''}`}
              draggable={!p.locked && !!entry}
              onDragStart={(e) => {
                e.dataTransfer.setData(ASSET_DRAG, asset.id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu(asset.id);
              }}
            >
              <div className="asset-thumb">
                {entry?.thumbnail ? <img src={entry.thumbnail} alt="" /> : <span>▱</span>}
                <span className="asset-duration">{timecode(asset.durationUs, p.project.fps)}</span>
              </div>
              <div className="asset-info">
                <strong title={asset.name}>{asset.name}</strong>
                <small>
                  {asset.width} × {asset.height} <span>{asset.hasAudio ? 'V + ♪' : '무음'}</span>
                </small>
              </div>
              {!entry ? (
                <button
                  className="reconnect-asset"
                  disabled={p.locked}
                  onClick={() => p.onReconnect(asset)}
                >
                  원본 다시 연결
                </button>
              ) : (
                <button
                  className="add-asset"
                  disabled={p.locked}
                  aria-label={`${asset.name} 타임라인에 추가`}
                  title="현재 재생 위치의 가까운 경계에 삽입"
                  onClick={() => p.onInsert(asset.id)}
                >
                  ＋
                </button>
              )}
              <button className="remove-asset" aria-label={`${asset.name} 에셋 삭제`} title="에셋 삭제" disabled={p.locked||p.importing} draggable={false}
                onPointerDown={e=>e.stopPropagation()} onDragStart={e=>{e.preventDefault();e.stopPropagation();}}
                onClick={e=>{e.stopPropagation();setMenu(undefined);p.onRemove(asset.id);}}>×</button>
              {menu === asset.id && (
                <div className="context-menu" role="menu">
                  <button
                    role="menuitem"
                    disabled={p.locked || !entry}
                    onClick={() => {
                      p.onInsert(asset.id);
                      setMenu(undefined);
                    }}
                  >
                    타임라인에 삽입
                  </button>
                  <button role="menuitem" onClick={() => setMenu(undefined)}>
                    닫기
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {!p.project.assets.length && (
          <button
            className="import-empty"
            onClick={() => picker.current?.click()}
            disabled={p.locked || p.importing}
          >
            <span className="upload-symbol">↥</span>
            <strong>영상을 가져오세요</strong>
            <span>파일을 끌어놓거나 클릭해 선택</span>
          </button>
        )}
      </div>
    </section>
  );
}
