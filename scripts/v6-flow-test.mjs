import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.TEST_URL || 'http://127.0.0.1:5174/';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { checks: [], errors: [] };
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.goto(base);
  await page.getByTestId('import-input').setInputFiles('test-results/red.mp4');
  await page.getByRole('button', { name: 'red.mp4 타임라인에 추가', exact: true }).click();
  await page.locator('.timeline-clip').click();
  async function save() {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '저장', exact: true }).click(),
    ]);
    await download.saveAs('test-results/v6-flow-project.json');
    return JSON.parse(await readFile('test-results/v6-flow-project.json', 'utf8'));
  }
  async function drag(locator, dx, dy) {
    const b = await locator.boundingBox();
    assert.ok(b);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(250);
  }
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await drag(page.locator('.transform-overlay'), 45, 25);
  const moved = await save();
  assert.ok(moved.clips[0].transform.x > 0.03);
  assert.ok(moved.clips[0].transform.y > 0.02);
  await page.getByRole('button', { name: 'Resize', exact: true }).click();
  // 이동 후 우하단 핸들이 화면 바깥이면 좌상단 핸들로 축소한다.
  await drag(page.locator('.transform-overlay [data-handle="nw"]'), 40, 25);
  const resized = await save();
  assert.ok(resized.clips[0].transform.scale < 1);
  await page.getByRole('button', { name: 'Resize', exact: true }).click();
  report.checks.push({
    name: 'Move/Resize 실제 마우스 조작',
    moved: moved.clips[0].transform,
    resized: resized.clips[0].transform,
  });
  await page.getByRole('tab', { name: /자막/ }).click();
  await page.getByRole('button', { name: '＋ 추가', exact: true }).click();
  const slider = page.getByRole('slider', {
    name: '글자 크기 (화면 높이 %) 슬라이더',
    exact: true,
  });
  const box = await slider.boundingBox();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  const styled = await save();
  assert.ok(styled.subtitles[0].size > 0.1);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  assert.equal((await save()).subtitles[0].size, 0.05);
  report.checks.push({
    name: '실제 슬라이더 드래그와 한 번의 undo',
    size: styled.subtitles[0].size,
  });
  const cdp = await context.newCDPSession(page),
    browserContextId = (await cdp.send('Target.getTargetInfo')).targetInfo.browserContextId;
  await cdp.send('Browser.setPermission', {
    permission: { name: 'local-fonts' },
    setting: 'granted',
    origin: new URL(base).origin,
    browserContextId,
  });
  await page.evaluate(async () => {
    const native = window.queryLocalFonts.bind(window),
      font = (await native())[0];
    window.queryLocalFonts = async () => [
      {
        postscriptName: 'V6DelayedFont',
        fullName: 'V6 Delayed Font',
        blob: () =>
          new Promise((resolve) => {
            window.releaseFont = async () => resolve(await font.blob());
          }),
      },
    ];
  });
  await page.getByRole('button', { name: '로컬 폰트 불러오기', exact: true }).click();
  await page.getByLabel('자막 폰트', { exact: true }).selectOption('V6DelayedFont');
  const project = await save();
  const changed = {
    ...project,
    id: 'new-project-font-race',
    subtitles: project.subtitles.map((q) => ({ ...q, text: '새 프로젝트 자막' })),
  };
  await page
    .getByTestId('project-input')
    .setInputFiles({
      name: 'new.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(changed)),
    });
  await page.waitForTimeout(200);
  await page.evaluate(() => window.releaseFont());
  await page.waitForTimeout(400);
  const after = await save();
  assert.equal(after.id, changed.id);
  assert.equal(after.subtitles[0].font, undefined);
  assert.equal(after.subtitles[0].text, '새 프로젝트 자막');
  report.checks.push({
    name: '이전 프로젝트의 지연된 실제 폰트 blob 완료 무시',
    projectId: after.id,
  });
  await page.locator('.subtitle-block').click();
  await page.evaluate(() =>
    Object.defineProperty(window, 'queryLocalFonts', { value: undefined, configurable: true }),
  );
  await page.getByRole('tab', { name: '클립', exact: true }).click();
  await page.getByRole('tab', { name: /자막/ }).click();
  assert.equal(
    await page.getByRole('button', { name: '로컬 폰트 불러오기', exact: true }).count(),
    0,
  );
  assert.equal(await page.getByLabel('자막 폰트', { exact: true }).inputValue(), '');
  report.checks.push({ name: '폰트 API 미지원 분기에서 기본 폰트 편집 유지' });
  assert.deepEqual(report.errors, []);
  report.success = true;
  console.log('PASS', JSON.stringify(report));
} catch (e) {
  report.success = false;
  report.failure = e.stack;
  console.error(e);
  process.exitCode = 1;
} finally {
  await writeFile('test-results/v6-flow-report.json', JSON.stringify(report, null, 2));
  await browser.close();
}
