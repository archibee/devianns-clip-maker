export type WorkspaceMode = 'desktop' | 'tablet' | 'mobile';
export const workspaceMode = (width: number): WorkspaceMode =>
  width > 1150 ? 'desktop' : width > 600 ? 'tablet' : 'mobile';
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
export const rowMinimums = (mode: WorkspaceMode) =>
  mode === 'desktop' ? [260, 190] : mode === 'tablet' ? [240, 190, 260] : [220, 190, 260, 160];
export function resizeRows(rows: number[], index: number, delta: number, mode: WorkspaceMode) {
  const result = [...rows],
    total = rows[index] + rows[index + 1],
    minimums = rowMinimums(mode);
  const first = clamp(rows[index] + delta, minimums[index], total - minimums[index + 1]);
  result[index] = first;
  result[index + 1] = total - first;
  return result;
}
export function fitColumns(
  columns: [number, number],
  available: number,
  mode: WorkspaceMode,
): [number, number] {
  if (mode === 'tablet') return [clamp(columns[0], 140, Math.max(140, available - 240)), 0];
  const right = clamp(columns[1], 200, Math.max(200, available - 160 - 280));
  return [clamp(columns[0], 160, Math.max(160, available - right - 280)), right];
}
