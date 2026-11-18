import { expect, it } from 'vitest';
import { fitColumns, resizeRows, workspaceMode } from '../src/editor/workspace-layout';
it('uses the same layout breakpoints as responsive styles', () => {
  expect([320, 600, 601, 1150, 1151].map(workspaceMode)).toEqual([
    'mobile',
    'mobile',
    'tablet',
    'tablet',
    'desktop',
  ]);
});
it('row resizing preserves total space and both adjacent minimum sizes', () => {
  expect(resizeRows([400, 260], 0, 40, 'desktop')).toEqual([440, 220]);
  expect(resizeRows([400, 260], 0, 9999, 'desktop')).toEqual([470, 190]);
  expect(resizeRows([400, 260], 0, -9999, 'desktop')).toEqual([260, 400]);
  expect(resizeRows([300, 320, 380, 320], 1, 9999, 'mobile')).toEqual([300, 440, 260, 320]);
});
it('keeps media, preview and properties within the current available width', () => {
  const [left, right] = fitColumns([900, 900], 1100, 'desktop');
  expect(left).toBeGreaterThanOrEqual(160);
  expect(right).toBeGreaterThanOrEqual(200);
  expect(1100 - left - right).toBeGreaterThanOrEqual(280);
  expect(fitColumns([900, 0], 560, 'tablet')).toEqual([320, 0]);
});
