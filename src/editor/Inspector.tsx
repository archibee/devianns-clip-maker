import { useEffect, useState } from 'react';
import {
  cueErrors,
  duration,
  newId,
  seconds,
  toUs,
  type Cue,
  type Project,
} from '../project/model';
import type { Command } from '../project/commands';
import { PanelTitle } from './Panel';

export function NumberField({
  label,
  value,
  min,
  max,
  step = 0.001,
  onCommit,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (n: number) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="field">
      {label}
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft);
          if (draft !== '' && Number.isFinite(n) && n >= min && n <= max) onCommit(n);
          else setDraft(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}

type Props = {
  project: Project;
  selected?: string;
  timeUs: number;
  locked: boolean;
  onCommand: (command: Command) => void;
  onSeek: (us: number) => void;
};
export function Inspector(p: Props) {
  const [tab, setTab] = useState<'clip' | 'subtitle'>('clip');
  const [cueId, setCueId] = useState<string>();
  const clip = p.project.clips.find((c) => c.id === p.selected);
  const asset = p.project.assets.find((a) => a.id === clip?.assetId);
  const cue = p.project.subtitles.find((c) => c.id === cueId);
  const updateCue = (patch: Partial<Cue>) =>
    cue && p.onCommand({ type: 'cue', cue: { ...cue, ...patch } });
  const addCue = () => {
    const startUs = Math.max(
      0,
      Math.min(p.timeUs, duration(p.project) - Math.round(1_000_000 / p.project.fps)),
    );
    const cue: Cue = {
      id: newId(),
      startUs,
      endUs: Math.min(duration(p.project), startUs + 2_000_000),
      text: '새 자막',
      size: 0.05,
      color: '#ffffff',
      background: '#000000',
      x: 0.5,
      y: 0.9,
    };
    p.onCommand({ type: 'cue', cue });
    setCueId(cue.id);
  };
  return (
    <section className="inspector-panel panel">
      <PanelTitle number="03" title="속성">
        <span className="quality-badge">편집</span>
      </PanelTitle>
      <div className="tab-bar" role="tablist" aria-label="속성 종류">
        <button role="tab" aria-selected={tab === 'clip'} onClick={() => setTab('clip')}>
          클립
        </button>
        <button role="tab" aria-selected={tab === 'subtitle'} onClick={() => setTab('subtitle')}>
          자막 <small>{p.project.subtitles.length}</small>
        </button>
      </div>
      <div className="inspector-body">
        {tab === 'clip' ? (
          <>
            <h3>프로젝트 화면</h3>
            <label className="field">
              화면 비율
              <select
                aria-label="화면 비율"
                disabled={p.locked}
                value={p.project.aspect}
                onChange={(e) =>
                  p.onCommand({
                    type: 'settings',
                    patch: { aspect: e.target.value as Project['aspect'] },
                  })
                }
              >
                <option value="16:9">16:9 · 가로</option>
                <option value="9:16">9:16 · 세로</option>
                <option value="1:1">1:1 · 정사각</option>
              </select>
            </label>
            <label className="field">
              편집 프레임
              <select
                aria-label="편집 프레임"
                disabled={p.locked}
                value={p.project.fps}
                onChange={(e) =>
                  p.onCommand({
                    type: 'settings',
                    patch: { fps: Number(e.target.value) as Project['fps'] },
                  })
                }
              >
                {[30, 45, 60].map((fps) => (
                  <option key={fps} value={fps}>
                    {fps} fps
                  </option>
                ))}
              </select>
            </label>
            <div className="section-rule" />
            {clip && asset ? (
              <>
                <h3>선택한 클립</h3>
                <p className="selected-name" title={asset.name}>
                  {asset.name}
                </p>
                <div className="field-pair">
                  <NumberField
                    label="원본 시작 (초)"
                    value={seconds(clip.inUs)}
                    min={0}
                    max={seconds(clip.outUs) - 0.000001}
                    disabled={p.locked}
                    onCommit={(n) =>
                      p.onCommand({ type: 'trim', id: clip.id, inUs: toUs(n), outUs: clip.outUs })
                    }
                  />
                  <NumberField
                    label="원본 끝 (초)"
                    value={seconds(clip.outUs)}
                    min={seconds(clip.inUs) + 0.000001}
                    max={seconds(asset.durationUs)}
                    disabled={p.locked}
                    onCommit={(n) =>
                      p.onCommand({ type: 'trim', id: clip.id, inUs: clip.inUs, outUs: toUs(n) })
                    }
                  />
                </div>
                <p className="hint">영상과 원본 소리가 함께 잘리고 이동합니다.</p>
                <h3>프레임 배치</h3>
                <label className="field">
                  맞춤
                  <select
                    disabled={p.locked}
                    aria-label="클립 맞춤"
                    value={clip.transform.fit}
                    onChange={(e) =>
                      p.onCommand({
                        type: 'transform',
                        id: clip.id,
                        transform: {
                          ...clip.transform,
                          fit: e.target.value as 'contain' | 'cover',
                        },
                      })
                    }
                  >
                    <option value="contain">전체 보기 · Contain</option>
                    <option value="cover">화면 채우기 · Cover</option>
                  </select>
                </label>
                <NumberField
                  label="배율"
                  value={clip.transform.scale}
                  min={0.1}
                  max={5}
                  step={0.1}
                  disabled={p.locked}
                  onCommit={(scale) =>
                    p.onCommand({
                      type: 'transform',
                      id: clip.id,
                      transform: { ...clip.transform, scale },
                    })
                  }
                />
                <div className="field-pair">
                  <NumberField
                    label="가로 위치"
                    value={clip.transform.x}
                    min={-1}
                    max={1}
                    step={0.05}
                    disabled={p.locked}
                    onCommit={(x) =>
                      p.onCommand({
                        type: 'transform',
                        id: clip.id,
                        transform: { ...clip.transform, x },
                      })
                    }
                  />
                  <NumberField
                    label="세로 위치"
                    value={clip.transform.y}
                    min={-1}
                    max={1}
                    step={0.05}
                    disabled={p.locked}
                    onCommit={(y) =>
                      p.onCommand({
                        type: 'transform',
                        id: clip.id,
                        transform: { ...clip.transform, y },
                      })
                    }
                  />
                </div>
                <button
                  disabled={p.locked}
                  onClick={() =>
                    p.onCommand({
                      type: 'transform',
                      id: clip.id,
                      transform: { fit: 'contain', scale: 1, x: 0, y: 0 },
                    })
                  }
                >
                  배치 초기화
                </button>
              </>
            ) : (
              <div className="inspector-empty">
                <span>⌖</span>
                <p>
                  타임라인에서 클립을 선택하면
                  <br />
                  원본 구간과 배치를 조정할 수 있습니다.
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="section-heading">
              <h3>수동 자막</h3>
              <button
                className="subtle"
                disabled={p.locked || !p.project.clips.length}
                onClick={addCue}
              >
                ＋ 추가
              </button>
            </div>
            <p className="hint">
              자막은 프로젝트 시간에 고정됩니다. 클립을 이동한 뒤 시간을 확인하세요.
            </p>
            <div className="cue-list">
              {p.project.subtitles.map((c) => (
                <button
                  className={c.id === cueId ? 'active' : ''}
                  key={c.id}
                  onClick={() => {
                    setCueId(c.id);
                    if (!p.locked) p.onSeek(c.startUs);
                  }}
                >
                  <small>
                    {seconds(c.startUs).toFixed(2)}–{seconds(c.endUs).toFixed(2)}s
                  </small>
                  <span>{c.text || '(빈 자막)'}</span>
                </button>
              ))}
            </div>
            {cue && (
              <div className="cue-editor">
                <label className="field">
                  내용
                  <textarea
                    aria-label="자막 내용"
                    value={cue.text}
                    maxLength={2000}
                    disabled={p.locked}
                    onChange={(e) => updateCue({ text: e.target.value })}
                  />
                </label>
                <div className="field-pair">
                  <NumberField
                    label="자막 시작 (초)"
                    value={seconds(cue.startUs)}
                    min={0}
                    max={seconds(cue.endUs) - 0.000001}
                    disabled={p.locked}
                    onCommit={(n) => updateCue({ startUs: toUs(n) })}
                  />
                  <NumberField
                    label="자막 끝 (초)"
                    value={seconds(cue.endUs)}
                    min={seconds(cue.startUs) + 0.000001}
                    max={Math.max(seconds(duration(p.project)), seconds(cue.endUs))}
                    disabled={p.locked}
                    onCommit={(n) => updateCue({ endUs: toUs(n) })}
                  />
                </div>
                <NumberField
                  label="글자 크기 (화면 높이 %)"
                  value={Math.round(cue.size * 100)}
                  min={1}
                  max={20}
                  step={1}
                  disabled={p.locked}
                  onCommit={(n) => updateCue({ size: n / 100 })}
                />
                <div className="field-pair">
                  <label className="field">
                    글자색
                    <input
                      aria-label="자막 글자색"
                      type="color"
                      value={cue.color}
                      disabled={p.locked}
                      onChange={(e) => updateCue({ color: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    배경색
                    <input
                      aria-label="자막 배경색"
                      type="color"
                      value={cue.background}
                      disabled={p.locked}
                      onChange={(e) => updateCue({ background: e.target.value })}
                    />
                  </label>
                </div>
                <div className="field-pair">
                  <NumberField
                    label="자막 가로 위치"
                    value={cue.x}
                    min={0}
                    max={1}
                    step={0.05}
                    disabled={p.locked}
                    onCommit={(x) => updateCue({ x })}
                  />
                  <NumberField
                    label="자막 세로 위치"
                    value={cue.y}
                    min={0}
                    max={1}
                    step={0.05}
                    disabled={p.locked}
                    onCommit={(y) => updateCue({ y })}
                  />
                </div>
                <button
                  className="danger"
                  disabled={p.locked}
                  onClick={() => {
                    p.onCommand({ type: 'deleteCue', id: cue.id });
                    setCueId(undefined);
                  }}
                >
                  자막 삭제
                </button>
              </div>
            )}
            {cueErrors(p.project).map((error) => (
              <p key={error} className="inline-error">
                {error}
              </p>
            ))}
          </>
        )}
      </div>
      <footer className="panel-footer">
        비파괴 편집<small>원본 파일은 수정되지 않습니다.</small>
      </footer>
    </section>
  );
}
