import type { Cue } from '../../../src/project/model';
export function VisualizerProperties(p: {
  cue: Cue;
  disabled: boolean;
  onChange: (cue: Cue) => void;
  onDelete: () => void;
}) {
  const data = p.cue.visualizer!;
  return (
    <div className="cue-editor">
      <h3>오디오 비주얼라이저</h3>
      <label className="field">
        색상
        <input
          type="color"
          disabled={p.disabled}
          value={p.cue.color}
          onChange={(e) => p.onChange({ ...p.cue, color: e.target.value })}
        />
      </label>
      {(['x', 'y'] as const).map((key) => (
        <label className="field" key={key}>
          위치 {key.toUpperCase()}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            disabled={p.disabled}
            value={p.cue[key]}
            onChange={(e) => p.onChange({ ...p.cue, [key]: Number(e.target.value) })}
          />
        </label>
      ))}
      <label className="field">
        가로 너비
        <input
          type="range"
          min={0.1}
          max={0.95}
          step={0.01}
          disabled={p.disabled}
          value={data.width}
          onChange={(e) =>
            p.onChange({ ...p.cue, visualizer: { ...data, width: Number(e.target.value) } })
          }
        />
      </label>
      <label className="field">
        반응 크기
        <input
          type="range"
          min={0.25}
          max={4}
          step={0.05}
          disabled={p.disabled}
          value={data.gain}
          onChange={(e) =>
            p.onChange({ ...p.cue, visualizer: { ...data, gain: Number(e.target.value) } })
          }
        />
      </label>
      <label className="field">
        불투명도
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          disabled={p.disabled}
          value={p.cue.colorOpacity ?? 1}
          onChange={(e) => p.onChange({ ...p.cue, colorOpacity: Number(e.target.value) })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          disabled={p.disabled}
          checked={data.showTime}
          onChange={(e) =>
            p.onChange({ ...p.cue, visualizer: { ...data, showTime: e.target.checked } })
          }
        />{' '}
        경과 시간 표시
      </label>
      <button className="danger" disabled={p.disabled} onClick={p.onDelete}>
        이펙트 삭제
      </button>
    </div>
  );
}
