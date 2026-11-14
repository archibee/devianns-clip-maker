import { fontAccess, registerLocalFont, type LocalFontData } from '../render/local-fonts';
import { useEffect, useRef, useState } from 'react';
import { cueErrors, newId, seconds, toUs, type Cue, type Project } from '../project/model';
import type { Command } from '../project/commands';
import { PanelTitle } from './Panel';
import { subtitleSizes, subtitlePositions, subtitleStyles } from './subtitle-presets';

export function NumberField({
  label,
  value,
  min,
  max,
  step = 0.001,
  onCommit,
  disabled,
  slider = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (n: number) => void;
  disabled?: boolean;
  slider?: boolean;
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
          if (draft !== '' && Number.isFinite(n) && n >= min && n <= max) {
            if (n !== value) onCommit(n);
          } else setDraft(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      {slider && (
        <input
          type="range"
          aria-label={`${label} 슬라이더`}
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(Number(draft)) ? Number(draft) : value}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onPointerUp={(e) => {
            const n = Number(e.currentTarget.value);
            if (n !== value) onCommit(n);
          }}
          onKeyUp={(e) => {
            if (
              [
                'ArrowLeft',
                'ArrowRight',
                'ArrowUp',
                'ArrowDown',
                'Home',
                'End',
                'PageUp',
                'PageDown',
              ].includes(e.key)
            ) {
              const n = Number(e.currentTarget.value);
              if (n !== value) onCommit(n);
            }
          }}
          onBlur={(e) => {
            const n = Number(e.currentTarget.value);
            if (n !== value) onCommit(n);
          }}
        />
      )}
    </label>
  );
}

type Props = {
  project: Project;
  selected?: string;
  selectedCue?: string;
  tab: 'clip' | 'subtitle';
  onTabChange: (tab: 'clip' | 'subtitle') => void;
  onSelectCue: (id?: string) => void;
  timeUs: number;
  locked: boolean;
  onCommand: (command: Command) => boolean;
  onSeek: (us: number) => void;
};
export function Inspector(p: Props) {
  const [fonts, setFonts] = useState<LocalFontData[]>([]);
  const [fontError, setFontError] = useState('');
  const tab = p.tab;
  const clip = p.project.clips.find((c) => c.id === p.selected);
  const asset = p.project.assets.find((a) => a.id === clip?.assetId);
  const cue = p.project.subtitles.find((c) => c.id === p.selectedCue);
  const activeCue = useRef(cue);
  activeCue.current = cue;
  const activeProject = useRef(p.project.id);
  activeProject.current = p.project.id;
  const updateCue = (patch: Partial<Cue>) =>
    cue && p.onCommand({ type: 'cue', cue: { ...cue, ...patch } });
  const addCue = () => {
    const startUs = Math.max(0, p.timeUs);
    const cue: Cue = {
      id: newId(),
      startUs,
      endUs: startUs + 2_000_000,
      text: '새 자막',
      size: 0.05,
      color: '#ffffff',
      background: '#000000',
      x: 0.5,
      y: 0.9,
    };
    if (p.onCommand({ type: 'cue', cue })) p.onSelectCue(cue.id);
  };
  return (
    <section className="inspector-panel panel">
      <PanelTitle number="03" title="속성">
        <span className="quality-badge">편집</span>
      </PanelTitle>
      <div className="tab-bar" role="tablist" aria-label="속성 종류">
        <button role="tab" aria-selected={tab === 'clip'} onClick={() => p.onTabChange('clip')}>
          클립
        </button>
        <button
          role="tab"
          aria-selected={tab === 'subtitle'}
          onClick={() => p.onTabChange('subtitle')}
        >
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
                    max={seconds(
                      clip.parts
                        ? clip.parts.reduce((n, c) => n + c.outUs - c.inUs, 0)
                        : asset.durationUs,
                    )}
                    disabled={p.locked}
                    onCommit={(n) =>
                      p.onCommand({ type: 'trim', id: clip.id, inUs: clip.inUs, outUs: toUs(n) })
                    }
                  />
                </div>
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
                <p>클립을 선택하세요</p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="section-heading">
              <h3>수동 자막</h3>
              <button className="subtle" disabled={p.locked} onClick={addCue}>
                ＋ 추가
              </button>
            </div>
            <div className="cue-list">
              {p.project.subtitles.map((c) => (
                <button
                  className={c.id === p.selectedCue ? 'active' : ''}
                  key={c.id}
                  onClick={() => {
                    p.onSelectCue(c.id);
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
                <div className="field-pair">
                  <label className="field">
                    크기 프리셋
                    <select
                      aria-label="크기 프리셋"
                      value=""
                      disabled={p.locked}
                      onChange={(e) => {
                        const preset = subtitleSizes[Number(e.target.value)];
                        if (preset) updateCue({ size: preset.size });
                      }}
                    >
                      <option value="" disabled>
                        선택
                      </option>
                      {subtitleSizes.map((preset, i) => (
                        <option key={preset.label} value={i}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    위치 프리셋
                    <select
                      aria-label="위치 프리셋"
                      value=""
                      disabled={p.locked}
                      onChange={(e) => {
                        const preset = subtitlePositions[Number(e.target.value)];
                        if (preset) updateCue({ x: preset.x, y: preset.y });
                      }}
                    >
                      <option value="" disabled>
                        선택
                      </option>
                      {subtitlePositions.map((preset, i) => (
                        <option key={preset.label} value={i}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field">
                  색상 프리셋
                  <select
                    aria-label="색상 프리셋"
                    value=""
                    disabled={p.locked}
                    onChange={(e) => {
                      const preset = subtitleStyles[Number(e.target.value)];
                      if (preset) updateCue(preset.patch);
                    }}
                  >
                    <option value="" disabled>
                      선택
                    </option>
                    {subtitleStyles.map((preset, i) => (
                      <option key={preset.label} value={i}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
                {fontAccess() && (
                  <button
                    disabled={p.locked}
                    onClick={() => {
                      void fontAccess()!()
                        .then((list) => {
                          if (!list.length)
                            throw new Error(
                              '접근 가능한 로컬 폰트가 없습니다. 브라우저의 로컬 폰트 권한을 확인하거나 기본 폰트를 사용하세요.',
                            );
                          setFonts(list.sort((a, b) => a.fullName.localeCompare(b.fullName)));
                          setFontError('');
                        })
                        .catch((error) => setFontError(String(error)));
                    }}
                  >
                    로컬 폰트 불러오기
                  </button>
                )}
                <label className="field">
                  자막 폰트
                  <select
                    aria-label="자막 폰트"
                    disabled={p.locked}
                    value={cue.font?.postscriptName ?? ''}
                    onChange={(e) => {
                      const id = e.target.value;
                      if (!id) {
                        updateCue({ font: undefined });
                        return;
                      }
                      const font = fonts.find((f) => f.postscriptName === id);
                      if (font)
                        void registerLocalFont(font)
                          .then(() => {
                            if (
                              !activeCue.current ||
                              activeCue.current.id !== cue.id ||
                              activeProject.current !== p.project.id
                            )
                              return;
                            p.onCommand({
                              type: 'cue',
                              cue: {
                                ...activeCue.current,
                                font: { postscriptName: id, label: font.fullName },
                              },
                            });
                            setFontError('');
                          })
                          .catch((error) => setFontError(String(error)));
                    }}
                  >
                    <option value="">기본 폰트</option>
                    {cue.font &&
                      !fonts.some((f) => f.postscriptName === cue.font!.postscriptName) && (
                        <option value={cue.font.postscriptName}>{cue.font.label}</option>
                      )}
                    {fonts.map((f) => (
                      <option key={f.postscriptName} value={f.postscriptName}>
                        {f.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                {fontError && (
                  <p role="alert" className="inline-error">
                    {fontError}
                  </p>
                )}
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
                    max={seconds(Number.MAX_SAFE_INTEGER)}
                    disabled={p.locked}
                    onCommit={(n) => updateCue({ endUs: toUs(n) })}
                  />
                </div>
                <NumberField
                  label="글자 크기 (화면 높이 %)"
                  slider
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
                    label="글자 불투명도 (%)"
                    value={Math.round((cue.colorOpacity ?? 1) * 100)}
                    min={0}
                    max={100}
                    step={1}
                    slider
                    disabled={p.locked}
                    onCommit={(n) => updateCue({ colorOpacity: n / 100 })}
                  />
                  <NumberField
                    label="배경 불투명도 (%)"
                    value={Math.round((cue.backgroundOpacity ?? 0.7) * 100)}
                    min={0}
                    max={100}
                    step={1}
                    slider
                    disabled={p.locked}
                    onCommit={(n) => updateCue({ backgroundOpacity: n / 100 })}
                  />
                </div>
                <div className="field-pair">
                  <NumberField
                    label="자막 가로 위치"
                    slider
                    value={cue.x}
                    min={0}
                    max={1}
                    step={0.01}
                    disabled={p.locked}
                    onCommit={(x) => updateCue({ x })}
                  />
                  <NumberField
                    label="자막 세로 위치"
                    slider
                    value={cue.y}
                    min={0}
                    max={1}
                    step={0.01}
                    disabled={p.locked}
                    onCommit={(y) => updateCue({ y })}
                  />
                </div>
                <button
                  className="danger"
                  disabled={p.locked}
                  onClick={() => {
                    p.onCommand({ type: 'deleteCue', id: cue.id });
                    p.onSelectCue(undefined);
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
      {tab === 'subtitle' && cue && !p.locked && (
        <div className="cue-quick-editor">
          <label>
            <span className="cue-quick-heading">
              선택 자막 바로 편집{' '}
              <small>
                {seconds(cue.startUs).toFixed(2)}–{seconds(cue.endUs).toFixed(2)}s
              </small>
            </span>
            <textarea
              key={cue.id}
              aria-label="선택 자막 빠른 편집"
              data-cue-id={cue.id}
              value={cue.text}
              maxLength={2000}
              rows={2}
              placeholder="선택한 자막 내용을 입력하세요"
              onChange={(event) => updateCue({ text: event.target.value })}
            />
          </label>
        </div>
      )}
    </section>
  );
}
