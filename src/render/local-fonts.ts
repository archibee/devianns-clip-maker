import type { Project } from '../project/model';

export type LocalFontData = { postscriptName: string; fullName: string; blob(): Promise<Blob> };
export type LocalFontPayload = { postscriptName: string; blob: Blob };
const cache = new Map<string, Blob>();
export const localFontFamily = (name: string) =>
  `ClipLocal_${Array.from(name)
    .map((c) => c.codePointAt(0)!.toString(16))
    .join('_')}`;
export function fontAccess() {
  return (window as unknown as { queryLocalFonts?: () => Promise<LocalFontData[]> })
    .queryLocalFonts;
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('devianns-clip-maker-fonts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('fonts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function stored(name: string, value?: Blob): Promise<Blob | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('fonts', value ? 'readwrite' : 'readonly');
      const request = value
        ? tx.objectStore('fonts').put(value, name)
        : tx.objectStore('fonts').get(name);
      tx.oncomplete = () => resolve(value ?? request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function registerLocalFont(font: LocalFontData) {
  const blob = await font.blob();
  cache.set(font.postscriptName, blob);
  await stored(font.postscriptName, blob);
}
export async function prepareLocalFonts(project: Project) {
  for (const cue of project.subtitles)
    if (cue.font && !cache.has(cue.font.postscriptName)) {
      const blob = await stored(cue.font.postscriptName);
      if (!blob) throw new Error(`로컬 폰트를 다시 선택하세요: ${cue.font.label}`);
      cache.set(cue.font.postscriptName, blob);
    }
}
export function localFontPayload(project: Project): LocalFontPayload[] {
  return [
    ...new Set(project.subtitles.flatMap((c) => (c.font ? [c.font.postscriptName] : []))),
  ].flatMap((postscriptName) => {
    const blob = cache.get(postscriptName);
    return blob ? [{ postscriptName, blob }] : [];
  });
}
