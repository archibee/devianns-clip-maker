import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startStaticTestServer } from './static-test-server.mjs';
const server = await startStaticTestServer('dist', ['/devianns-clip-maker/']);
let browser, page;
try {
  browser = await chromium.launch({
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    headless: true,
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(server.origin + '/devianns-clip-maker/');
  await page.getByTestId('import-input').setInputFiles('test-results/red.mp4');
  await page.getByRole('button', { name: 'red.mp4 타임라인에 추가', exact: true }).click();
  const save = async () => {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  };
  const project = await save(),
    base = project.clips[0];
  project.laneCount = 2;
  base.id = 'v1';
  base.muted = true;
  base.transform = {
    ...base.transform,
    scale: 0.5,
    crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  };
  project.clips = [
    base,
    { ...base, id: 'v2', startUs: 2_000_000 },
    { ...base, id: 'other', lane: 1, startUs: 0 },
  ];
  project.subtitles = [
    ['c0', 0, 4],
    ['c2', 0, 8],
    ['c1', 1, 2],
  ].map(([id, lane, start]) => ({
    id,
    lane,
    startUs: start * 1_000_000,
    endUs: (start + 1) * 1_000_000,
    text: id,
    size: 0.05,
    color: '#ffffff',
    background: '#000000',
    x: 0.5,
    y: 0.9,
  }));
  await page
    .getByTestId('project-input')
    .setInputFiles({
      name: 'v7.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await page.waitForFunction(() => document.querySelectorAll('.timeline-clip').length === 3);
  await page.getByLabel('타임라인 확대', { exact: true }).fill('150');
  const v1 = page.getByRole('button', { name: '클립 1: red.mp4', exact: true }),
    v2 = page.getByRole('button', { name: '클립 2: red.mp4', exact: true }),
    cue = page.getByRole('button', { name: '자막: c0', exact: true });
  await v1.click();
  await page.keyboard.press('Control+a');
  assert.equal(await page.locator('.timeline-clip.selected').count(), 2);
  assert.equal(await page.locator('[data-lane="1"] .timeline-clip.selected').count(), 0);
  await cue.click();
  await page.keyboard.press('Control+a');
  assert.equal(await page.locator('.subtitle-block.selected').count(), 2);
  assert.equal(await page.locator('[data-lane="1"] .subtitle-block.selected').count(), 0);
  await v1.click();
  await v2.click({ modifiers: ['Control'] });
  await cue.click({ modifiers: ['Control'] });
  const first = await v1.boundingBox(),
    second = await v2.boundingBox(),
    text = await cue.boundingBox();
  await page.mouse.move(second.x + 40, second.y + 12);
  await page.mouse.down();
  await page.mouse.move(second.x + 190, second.y + 12, { steps: 8 });
  assert.ok(Math.abs((await v1.boundingBox()).x - first.x - 150) < 2);
  assert.ok(Math.abs((await cue.boundingBox()).x - text.x - 150) < 2);
  await page.mouse.up();
  let saved = await save();
  assert.equal(saved.clips.find((c) => c.id === 'v1').startUs, 1_000_000);
  assert.equal(saved.clips.find((c) => c.id === 'v2').startUs, 3_000_000);
  assert.equal(saved.subtitles.find((c) => c.id === 'c0').startUs, 5_000_000);
  assert.deepEqual(
    saved.clips.find((c) => c.id === 'other'),
    project.clips[2],
  );
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => document.querySelector('.timeline-clip').style.left === '0px');
  await v1.click();
  let box = await v1.boundingBox();
  await page.mouse.move(box.x + 40, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + 760, box.y + 12, { steps: 12 });
  await page.mouse.up();
  saved = await save();
  assert.equal(saved.clips.find((c) => c.id === 'v1').startUs, 5_000_000);
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => document.querySelector('.timeline-clip').style.left === '0px');
  const c2 = page.getByRole('button', { name: '자막: c2', exact: true });
  box = await c2.boundingBox();
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x - 610, box.y + 20, { steps: 12 });
  await page.mouse.up();
  saved = await save();
  assert.equal(saved.subtitles.find((c) => c.id === 'c2').startUs, 5_000_000);
  await page.keyboard.press('Control+z');
  await v1.click();
  await page.getByRole('button', { name: 'MOVE', exact: true }).click();
  const overlay = page.locator('.transform-overlay.tool-move');
  await overlay.waitFor();
  box = await overlay.boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25 + 2, box.y + box.height * 0.75 - 2, { steps: 10 });
  assert.equal(await page.locator('.move-guide').count(), 10);
  assert.equal(await page.locator('.move-guide.snapped').count(), 2);
  await page.mouse.up();
  assert.equal(await page.locator('.move-grid').count(), 0);
  saved = await save();
  const transformed = saved.clips.find((c) => c.id === 'v1').transform;
  assert.ok(Math.abs(transformed.x + 0.25) < 1e-8);
  assert.ok(Math.abs(transformed.y - 0.25) < 1e-8);
  assert.deepEqual(transformed.crop, base.transform.crop);
  assert.equal(transformed.scale, 0.5);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      status: 'PASS',
      checks: [
        '라인/종류별 Ctrl+A',
        '영상/자막 연속 묶음 초안·확정·undo',
        '영상/자막 겹친 드롭 인접 경계 보정',
        'Crop/Resize 중심 MOVE 격자·교차 스냅·확정',
      ],
      browser: await browser.version(),
    }),
  );
} catch (error) {
  if (page) await page.screenshot({ path: 'test-results/timeline-v7-error.png' });
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
