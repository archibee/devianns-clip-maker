import fontUrl from '/fonts/NotoSansKR.ttf?url';
import { FONT_FAMILY } from './compositor';
import { localFontFamily, type LocalFontPayload } from './local-fonts';
import type { Project } from '../project/model';

const loaded = new Set<string>();
export async function loadProvidedFonts(project: Project, payload: LocalFontPayload[]) {
  for (const cue of project.subtitles)
    if (cue.font && !loaded.has(cue.font.postscriptName)) {
      const source = payload.find((f) => f.postscriptName === cue.font!.postscriptName);
      if (!source) throw new Error(`로컬 폰트를 다시 선택하세요: ${cue.font.label}`);
      const face = new FontFace(
        localFontFamily(source.postscriptName),
        await source.blob.arrayBuffer(),
      );
      await face.load();
      const scope = globalThis as unknown as { fonts?: FontFaceSet; document?: Document };
      (scope.fonts ?? scope.document?.fonts)!.add(face);
      loaded.add(source.postscriptName);
    }
}

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
