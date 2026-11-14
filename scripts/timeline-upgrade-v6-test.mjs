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
  const project = await save();
  project.laneCount = 2;
  project.clips[0].muted = true;
  project.subtitles = [
    {
      id: 'caption',
      lane: 1,
      startUs: 28_000_000,
      endUs: 29_000_000,
      text: 's',
      size: 0.05,
      color: '#ffffff',
      background: '#000000',
      x: 0.5,
      y: 0.9,
    },
  ];
  await page
    .getByTestId('project-input')
    .setInputFiles({
      name: 'v6.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await page.waitForFunction(() => document.querySelectorAll('.timeline-row').length === 2);
  await page.getByLabel('타임라인 확대', { exact: true }).fill('150');
  let block = page.locator('.timeline-clip'),
    before = await block.boundingBox();
  const lane0 = await page.locator('.timeline-row').first().boundingBox(),
    lane1 = await page.locator('.timeline-row').nth(1).boundingBox(),
    dy = lane1.y - lane0.y;
  assert.equal(await block.getAttribute('draggable'), 'false');
  await page.mouse.move(before.x + 40, before.y + 12);
  await page.mouse.down();
  await page.mouse.move(before.x + 340, before.y + 12 + dy, { steps: 12 });
  assert.equal(await page.locator('.timeline-clip.dragging').count(), 1);
  const during = await block.boundingBox();
  assert.ok(Math.abs(during.x - before.x - 300) < 2);
  assert.ok(Math.abs(during.y - before.y - dy) < 2);
  assert.equal(await block.locator('xpath=ancestor::*[@data-lane]').getAttribute('data-lane'), '0');
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('[data-lane="1"] .timeline-clip'));
  assert.equal(await page.locator('.timeline-clip.selected').count(), 1);
  const moved = await save();
  assert.deepEqual(moved.clips[0], { ...project.clips[0], lane: 1, startUs: 2_000_000 });
  assert.deepEqual(moved.subtitles, project.subtitles);
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => document.querySelector('[data-lane="0"] .timeline-clip'));
  before = await block.boundingBox();
  await page.mouse.move(before.x + 40, before.y + 12);
  await page.mouse.down();
  await page.mouse.move(before.x + 240, before.y + 12, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  assert.equal(await page.locator('.timeline-clip.dragging').count(), 0);
  assert.deepEqual((await save()).clips, project.clips);
  const zoom = 150;
  let previous = 0;
  for (let i = 0; i < 3; i++) {
    const size = await page.locator('.timeline-scroll').evaluate((el) => el.clientWidth);
    const time = Math.round(((previous + size - 72 + 40) / zoom) * 1_000_000);
    await page.getByLabel('재생 위치', { exact: true }).fill(String(time));
    await page.waitForFunction(
      (left) => document.querySelector('.timeline-scroll').scrollLeft > left,
      previous,
    );
    previous = await page.locator('.timeline-scroll').evaluate((el) => el.scrollLeft);
    const frame = await page.locator('.timeline-scroll').boundingBox(),
      grip = await page.locator('.playhead-grip').boundingBox();
    assert.ok(
      grip.x + grip.width / 2 >= frame.x + 72 && grip.x + grip.width / 2 < frame.x + frame.width,
    );
  }
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('.timeline-scroll'),
      grip = document.querySelector('.playhead-grip');
    return grip.getBoundingClientRect().right <= el.getBoundingClientRect().right;
  });
  await page.locator('.timeline-scroll').evaluate((el) => (el.scrollLeft = 0));
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  assert.equal(await page.locator('.timeline-scroll').evaluate((el) => el.scrollLeft), 0);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      status: 'PASS',
      checks: [
        '영상 블록 포인터 초안 이동',
        '라인 이동 확정·원본/음소거 보존',
        'undo·Escape 취소',
        '진행바 다음 화면 3회 따라가기',
        '폭 변경·일시 정지 수동 스크롤 유지',
      ],
      browser: await browser.version(),
    }),
  );
} catch (error) {
  if (page) await page.screenshot({ path: 'test-results/timeline-v6-error.png' });
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
