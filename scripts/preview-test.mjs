import { chromium } from 'playwright';
import { startStaticTestServer } from './static-test-server.mjs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import assert from 'node:assert/strict';

const mounts = ['/', '/devianns-clip-maker/', '/ssg-clip-maker/'];
const server = await startStaticTestServer('dist', mounts);
let browser;
const report = {
  origin: server.origin,
  mounts,
  outputs: [],
  errors: [],
  failures: [],
  externalRequests: [],
};
try {
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    headless: true,
  });
  for (const mount of mounts) {
    const base = server.origin + mount;
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
      const output = {
        mount,
        width: await video.getDisplayWidth(),
        height: await video.getDisplayHeight(),
        end: await video.computeDuration(),
        audio: await audio.getCodec(),
      };
      report.outputs.push(output);
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
    const blocked = await context.newPage();
    await blocked.route('**/assets/index-*.js', (route) =>
      route.fulfill({ status: 404, body: 'Not found' }),
    );
    await blocked.goto(base);
    await blocked.locator('#boot-status[role="alert"]').waitFor();
    assert.ok((await blocked.locator('#boot-status').innerText()).includes('dist'));
    report.failedBundleBanner = true;
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.failures, []);
  assert.deepEqual(report.externalRequests, []);
  report.success = true;
  console.log(
    'PASS production base / Worker / fonts / audio export / responsive / unsupported browser',
    report.outputs,
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
  await server.close();
}
