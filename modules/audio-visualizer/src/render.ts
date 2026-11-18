import type { Cue } from '../../../src/project/model';
type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export function drawVisualizer(ctx: Context, cue: Cue, timeUs: number) {
  const data = cue.visualizer;
  if (!data) return;
  const time = Math.max(0, timeUs - cue.startUs + data.offsetUs);
  const frame = time / data.stepUs,
    index = Math.floor(frame),
    mix = frame - index;
  const { width, height } = ctx.canvas,
    w = width * data.width,
    cx = width * cue.x,
    cy = height * cue.y;
  const bar = w / (data.bands * 2),
    amplitude = height * cue.size * data.gain;
  ctx.save();
  ctx.globalAlpha = cue.colorOpacity ?? 1;
  ctx.fillStyle = cue.color;
  ctx.shadowColor = cue.color;
  ctx.shadowBlur = height * 0.012;
  ctx.fillRect(cx - w / 2, cy - 0.5, w, Math.max(1, height / 1080));
  for (let i = 0; i < data.bands * 2; i++) {
    const b = i < data.bands ? data.bands - 1 - i : i - data.bands;
    const a = data.values[index * data.bands + b] ?? 0;
    const next = data.values[(index + 1) * data.bands + b] ?? a;
    const h = Math.max(1, ((a * (1 - mix) + next * mix) / 255) ** 1.7 * amplitude);
    ctx.fillRect(cx - w / 2 + i * bar, cy - h / 2, Math.max(1, bar * 0.55), h);
  }
  if (data.showTime) {
    const seconds = Math.floor(time / 1_000_000);
    ctx.font = `500 ${Math.max(10, height * 0.027)}px "Clip Noto", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`,
      cx,
      cy - amplitude / 2 - height * 0.012,
    );
  }
  ctx.restore();
}
