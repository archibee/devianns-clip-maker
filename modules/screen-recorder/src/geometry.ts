export type RecordRegion = { x: number; y: number; width: number; height: number };
export const FULL_REGION: RecordRegion = { x: 0, y: 0, width: 1, height: 1 };
export function validRegion(region: RecordRegion) {
  return (
    Object.values(region).every(Number.isFinite) &&
    region.x >= 0 &&
    region.y >= 0 &&
    region.width >= 0.02 &&
    region.height >= 0.02 &&
    region.x + region.width <= 1.000001 &&
    region.y + region.height <= 1.000001
  );
}
export function recordingSize(width: number, height: number, region: RecordRegion) {
  if (!validRegion(region) || width <= 0 || height <= 0)
    throw new Error('녹화 영역을 올바르게 선택하세요.');
  const w = width * region.width,
    h = height * region.height,
    scale = Math.min(1, 1920 / w, 1080 / h);
  return {
    width: Math.max(2, Math.floor((w * scale) / 2) * 2),
    height: Math.max(2, Math.floor((h * scale) / 2) * 2),
  };
}
export function containRect(
  width: number,
  height: number,
  outputWidth: number,
  outputHeight: number,
) {
  const scale = Math.min(outputWidth / width, outputHeight / height);
  return {
    x: (outputWidth - width * scale) / 2,
    y: (outputHeight - height * scale) / 2,
    width: width * scale,
    height: height * scale,
  };
}
