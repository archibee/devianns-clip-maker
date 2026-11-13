import { dimensions, type Aspect, type Cue, type Transform } from '../project/model';

export const FONT_FAMILY = 'Clip Noto';
let fontPromise: Promise<void> | undefined;
export function loadFont() {
  return (fontPromise ??= (async () => {
    const font = new FontFace(FONT_FAMILY, `url(${import.meta.env.BASE_URL}fonts/NotoSansKR.ttf)`);
    await font.load();
    const scope = globalThis as unknown as { fonts?: FontFaceSet; document?: Document };
    const fonts = scope.fonts ?? scope.document?.fonts;
    if (!fonts) throw new Error('이 환경은 편집용 폰트 로딩을 지원하지 않습니다.');
    fonts.add(font);
  })().catch((error) => {
    fontPromise = undefined;
    throw error;
  }));
}

export function imageRect(
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  t: Transform,
) {
  const factor =
    (t.fit === 'cover'
      ? Math.max(width / sourceWidth, height / sourceHeight)
      : Math.min(width / sourceWidth, height / sourceHeight)) * t.scale;
  const w = sourceWidth * factor,
    h = sourceHeight * factor;
  return {
    x: (width - w) / 2 + t.x * width,
    y: (height - h) / 2 + t.y * height,
    width: w,
    height: h,
  };
}

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export function renderFrame(
  ctx: Context,
  image: CanvasImageSource | null,
  sourceWidth: number,
  sourceHeight: number,
  transform: Transform,
  cues: Cue[],
  timeUs: number,
) {
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  if (image && sourceWidth && sourceHeight) {
    const rect = imageRect(sourceWidth, sourceHeight, width, height, transform);
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  }
  const cue = cues.find((c) => timeUs >= c.startUs && timeUs < c.endUs);
  if (cue?.text) renderCue(ctx, cue, width, height);
  ctx.restore();
}

function renderCue(ctx: Context, cue: Cue, width: number, height: number) {
  const fontSize = Math.max(8, cue.size * height);
  ctx.font = `500 ${fontSize}px "${FONT_FAMILY}"`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const lines: string[] = [];
  for (const paragraph of cue.text.split('\n')) {
    let line = '';
    for (const character of Array.from(paragraph)) {
      if (line && ctx.measureText(line + character).width > width * 0.9) {
        lines.push(line);
        line = '';
      }
      line += character;
    }
    lines.push(line);
  }
  const lineHeight = fontSize * 1.4;
  const textHeight = lines.length * lineHeight;
  const cx = cue.x * width;
  const top = Math.max(0, Math.min(height - textHeight, cue.y * height - textHeight / 2));
  lines.forEach((line, index) => {
    const y = top + lineHeight * (index + 0.5);
    const w = ctx.measureText(line).width;
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = cue.background;
    ctx.fillRect(cx - w / 2 - fontSize * 0.3, y - lineHeight / 2, w + fontSize * 0.6, lineHeight);
    ctx.globalAlpha = 1;
    ctx.lineJoin = 'round';
    ctx.lineWidth = fontSize * 0.09;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(line, cx, y);
    ctx.fillStyle = cue.color;
    ctx.fillText(line, cx, y);
  });
}

export function previewSize(aspect: Aspect) {
  const full = dimensions(aspect, 1080);
  return { width: full.width / 2, height: full.height / 2 };
}
