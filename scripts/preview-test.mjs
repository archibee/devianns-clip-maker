import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:4173/ssg-clip-maker/';
const child = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '4173',
    '--strictPort',
  ],
  { windowsHide: true, stdio: 'pipe' },
);
let logs = '';
child.stdout.on('data', (data) => {
  logs += data;
});
child.stderr.on('data', (data) => {
  logs += data;
});
let browser;
const report = { base, errors: [], failures: [], externalRequests: [] };
try {
  let ready = false;
  for (let n = 0; n < 100; n++) {
    if (child.exitCode !== null) throw new Error(logs);
    try {
      const response = await fetch(base);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, `preview server did not start: ${logs}`);
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) report.failures.push(`${response.status()} ${response.url()}`);
  });
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith(new URL(base).origin))
      report.externalRequests.push(request.url());
  });
  await page.goto(base);
  await page.getByTestId('import-input').setInputFiles('test-results/red.mp4');
  await page.getByRole('button', { name: 'red.mp4 타임라인에 추가', exact: true }).click();
  await page.getByRole('button', { name: '다음 프레임', exact: true }).click();
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector('[data-testid="preview-canvas"]');
      if (!canvas) return false;
      const pixel = canvas.getContext('2d').getImageData(400, 100, 1, 1).data;
      return pixel[0] > 100;
    },
    { timeout: 30000 },
  );
  await page.getByRole('button', { name: '내보내기 ↗', exact: true }).click();
  await page.getByLabel('출력 해상도', { exact: true }).selectOption('480');
  await page.getByRole('button', { name: '렌더링 시작 ↗', exact: true }).click();
  const link = page.getByRole('link', { name: '영상 다운로드 ↓' });
  await link.waitFor({ timeout: 90000 });
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  await download.saveAs('test-results/production.mp4');
  const bytes = await readFile('test-results/production.mp4');
  const input = new Input({ source: new BlobSource(new Blob([bytes])), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack(),
      audio = await input.getPrimaryAudioTrack();
    assert.ok(video && audio);
    assert.equal(await video.getDisplayHeight(), 480);
    assert.equal(await audio.getCodec(), 'aac');
    report.output = {
      width: await video.getDisplayWidth(),
      height: await video.getDisplayHeight(),
      end: await video.computeDuration(),
      audio: await audio.getCodec(),
    };
  } finally {
    input.dispose();
  }
  await page.getByRole('button', { name: '닫기', exact: true }).last().click();
  await page.screenshot({ path: 'test-results/production.png', fullPage: true });
  for (const width of [900, 560, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    assert.equal(overflow, false, `${width}px viewport overflow`);
  }
  const unsupported = await context.newPage();
  await unsupported.addInitScript(() => {
    Object.defineProperty(globalThis, 'VideoDecoder', { configurable: true, value: undefined });
  });
  await unsupported.goto(base);
  await unsupported.getByRole('alert').filter({ hasText: 'WebCodecs/OffscreenCanvas' }).waitFor();
  report.unsupportedBanner = true;
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.failures, []);
  assert.deepEqual(report.externalRequests, []);
  report.success = true;
  console.log(
    'PASS production base / Worker / fonts / audio export / responsive / unsupported browser',
    report.output,
  );
} catch (error) {
  report.success = false;
  report.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/production-report.json', JSON.stringify(report, null, 2));
  await browser?.close();
  child.kill();
}
