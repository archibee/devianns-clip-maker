import { duration, MAX_DURATION_US, type Project } from './model';

export function parseProject(text: string): Project {
  if (text.length > 2_000_000) throw new Error('프로젝트 JSON은 2MB 이하만 지원합니다.');
  const p: unknown = JSON.parse(text);
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  const fail = (): never => {
    throw new Error('지원하지 않거나 손상된 프로젝트입니다. (schemaVersion 1 필요)');
  };
  const str = (v: unknown, max = 1000) => typeof v === 'string' && v.length <= max;
  const num = (v: unknown, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const us = (v: unknown) => Number.isSafeInteger(v) && num(v, 0, Number.MAX_SAFE_INTEGER);
  const color = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  if (
    !object(p) ||
    p.schemaVersion !== 1 ||
    !str(p.id) ||
    !str(p.name, 100) ||
    !['16:9', '9:16', '1:1'].includes(String(p.aspect)) ||
    typeof p.fps !== 'number' ||
    ![30, 45, 60].includes(p.fps)
  )
    return fail();
  if (
    !Array.isArray(p.assets) ||
    !Array.isArray(p.clips) ||
    !Array.isArray(p.subtitles) ||
    p.assets.length > 500 ||
    p.clips.length > 2000 ||
    p.subtitles.length > 2000
  )
    return fail();
  const ids = new Set<string>();
  const unique = (id: unknown) => {
    if (!str(id) || ids.has(id as string)) return false;
    ids.add(id as string);
    return true;
  };
  for (const a of p.assets) {
    if (
      !object(a) ||
      !unique(a.id) ||
      !str(a.name) ||
      !us(a.size) ||
      !us(a.lastModified) ||
      !us(a.durationUs) ||
      a.durationUs === 0 ||
      !num(a.width, 1, 16384) ||
      !num(a.height, 1, 16384) ||
      typeof a.hasAudio !== 'boolean' ||
      !str(a.videoCodec) ||
      (a.audioCodec !== undefined && !str(a.audioCodec))
    )
      return fail();
  }
  for (const c of p.clips) {
    if (
      !object(c) ||
      !unique(c.id) ||
      !us(c.inUs) ||
      !us(c.outUs) ||
      Number(c.inUs) >= Number(c.outUs) ||
      !object(c.transform)
    )
      return fail();
    const a = p.assets.find((x: Record<string, unknown>) => x.id === c.assetId);
    const t = c.transform;
    if (
      !a ||
      Number(c.outUs) > a.durationUs ||
      !['contain', 'cover'].includes(String(t.fit)) ||
      !num(t.scale, 0.1, 5) ||
      !num(t.x, -1, 1) ||
      !num(t.y, -1, 1)
    )
      return fail();
  }
  for (const c of p.subtitles) {
    if (
      !object(c) ||
      !unique(c.id) ||
      !us(c.startUs) ||
      !us(c.endUs) ||
      Number(c.endUs) <= Number(c.startUs) ||
      !str(c.text, 2000) ||
      !num(c.size, 0.01, 0.2) ||
      !color(c.color) ||
      !color(c.background) ||
      !num(c.x, 0, 1) ||
      !num(c.y, 0, 1)
    )
      return fail();
  }
  const result = p as Project;
  if (duration(result) > MAX_DURATION_US) return fail();
  return result;
}
