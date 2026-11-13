import fontUrl from '/fonts/NotoSansKR.ttf?url';
import { FONT_FAMILY } from './compositor';

let fontPromise: Promise<void> | undefined;
export function loadFont() {
  return (fontPromise ??= (async () => {
    // Vite resolves this relative to the emitted chunk, including Worker chunks.
    const font = new FontFace(FONT_FAMILY, `url(${fontUrl})`);
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
