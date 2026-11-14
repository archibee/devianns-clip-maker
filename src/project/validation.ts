import {
  duration,
  layout,
  cueErrors,
  clipLane,
  cueLane,
  MIN_CROP_SIZE,
  type Project,
} from './model';

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
  const transform = (t: unknown): boolean => {
    if (
      !object(t) ||
      !['contain', 'cover'].includes(String(t.fit)) ||
      !num(t.scale, 0.1, 5) ||
      !num(t.x, -1, 1) ||
      !num(t.y, -1, 1)
    )
      return false;
    if (t.crop !== undefined) {
      const c = t.crop;
      if (
        !object(c) ||
        !num(c.x, 0, 1) ||
        !num(c.y, 0, 1) ||
        !num(c.width, MIN_CROP_SIZE - 1e-12, 1) ||
        !num(c.height, MIN_CROP_SIZE - 1e-12, 1) ||
        Number(c.x) + Number(c.width) > 1.000001 ||
        Number(c.y) + Number(c.height) > 1.000001
      )
        return false;
    }
    return true;
  };
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
    p.assets.length > 500
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
    if (!a || !transform(t) || (c.startUs !== undefined && !us(c.startUs))) return fail();
    if (c.parts !== undefined) {
      if (!Array.isArray(c.parts) || !c.parts.length) return fail();
      let total = 0;
      for (const part of c.parts) {
        if (
          !object(part) ||
          !us(part.inUs) ||
          !us(part.outUs) ||
          Number(part.outUs) <= Number(part.inUs) ||
          !transform(part.transform)
        )
          return fail();
        const source = p.assets.find((x: Record<string, unknown>) => x.id === part.assetId);
        if (!source || Number(part.outUs) > source.durationUs) return fail();
        total += Number(part.outUs) - Number(part.inUs);
      }
      if (Number(c.outUs) > total) return fail();
    } else if (Number(c.outUs) > a.durationUs) return fail();
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
      (c.colorOpacity !== undefined && !num(c.colorOpacity, 0, 1)) ||
      (c.backgroundOpacity !== undefined && !num(c.backgroundOpacity, 0, 1)) ||
      !num(c.x, 0, 1) ||
      !num(c.y, 0, 1)
    )
      return fail();
  }
  for (const c of p.subtitles)
    if (
      c.font !== undefined &&
      (!object(c.font) || !str(c.font.postscriptName) || !str(c.font.label))
    )
      return fail();
  const result = p as Project;
  if (
    result.laneCount !== undefined &&
    (!Number.isInteger(result.laneCount) || result.laneCount < 1 || result.laneCount > 32)
  )
    return fail();
  for (const c of [...result.clips, ...result.subtitles])
    if (
      c.lane !== undefined &&
      (!Number.isInteger(c.lane) ||
        c.lane < 0 ||
        c.lane >= 32 ||
        (result.laneCount !== undefined && c.lane >= result.laneCount))
    )
      return fail();
  if (cueErrors(result).length) return fail();
  if (!Number.isSafeInteger(duration(result))) return fail();
  const rows = layout(result).sort((a, b) => a.startUs - b.startUs);
  const blocks = [
    ...rows.map((r) => ({ startUs: r.startUs, endUs: r.endUs, lane: clipLane(r.clip) })),
    ...result.subtitles.map((c) => ({ ...c, lane: cueLane(c) })),
  ];
  for (let i = 0; i < blocks.length; i++)
    if (
      blocks
        .slice(0, i)
        .some(
          (b) =>
            b.lane === blocks[i].lane && b.startUs < blocks[i].endUs && b.endUs > blocks[i].startUs,
        )
    )
      throw new Error('같은 타임라인 행에 블록이 겹칩니다. 빈 위치나 다른 행을 선택하세요.');
  return result;
}
