import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (...args) {
      if (this.download.endsWith('.json')) {
        window.saved = fetch(this.href).then((r) => r.json());
        return;
      }
      return click.apply(this, args);
    };
  });
  await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5193');
  const bytes = await page.evaluate(async () =>
    (await import('/tests/browser-harness.ts')).fixture(),
  );
  await page
    .getByTestId('import-input')
    .setInputFiles({ name: 'tone.mp4', mimeType: 'video/mp4', buffer: Buffer.from(bytes) });
  await page.getByRole('button', { name: 'tone.mp4 타임라인에 추가', exact: true }).click();
  const save = async () => {
    await page.evaluate(() => {
      window.saved = undefined;
    });
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await page.waitForFunction(() => !!window.saved);
    return page.evaluate(() => window.saved);
  };
  const before = await save();
  await page.getByRole('button', { name: 'VISUALIZER', exact: true }).click();
  await page.getByRole('button', { name: '취소', exact: true }).click();
  assert.deepEqual(await save(), before);
  await page.getByRole('button', { name: 'VISUALIZER', exact: true }).click();
  await page.getByRole('button', { name: '오디오 분석', exact: true }).click();
  await page.getByRole('button', { name: '완료 · 새 라인에 추가', exact: true }).waitFor();
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('button')].find(
        (b) => b.textContent === '완료 · 새 라인에 추가',
      ).disabled,
  );
  const preview = await page.getByLabel('비주얼라이저 이펙트 미리보기').evaluate((canvas) => {
    const ctx = canvas.getContext('2d');
    return {
      clear: ctx.getImageData(10, 10, 1, 1).data[3],
      line: ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.8), 1, 1)
        .data[3],
    };
  });
  assert.equal(preview.clear, 0);
  assert.ok(preview.line > 0);
  await page.getByRole('button', { name: '완료 · 새 라인에 추가', exact: true }).click();
  const after = await save();
  assert.deepEqual(after.clips, before.clips);
  assert.deepEqual(after.assets, before.assets);
  assert.equal(after.laneCount, before.laneCount + 1);
  assert.equal(after.subtitles.length, before.subtitles.length + 1);
  assert.ok(after.subtitles.at(-1).visualizer.values.some((n) => n > 0));
  assert.equal(
    await page.getByRole('button', { name: '오디오 비주얼라이저', exact: true }).count(),
    1,
  );
  await page.getByRole('button', { name: '오디오 비주얼라이저', exact: true }).click();
  await page.getByRole('heading', { name: '오디오 비주얼라이저', exact: true }).waitFor();
  const exported = await page.evaluate(
    async ({ bytes, project }) => {
      const harness = await import('/tests/browser-harness.ts');
      const result = await harness.runExport(
        [{ bytes, name: 'tone.mp4' }],
        { resolution: 480, fps: 30, format: 'mp4' },
        project,
      );
      if (!result.supported) return result;
      const { Input, BlobSource, ALL_FORMATS, CanvasSink } =
        await import('/node_modules/.vite/deps/mediabunny.js');
      const input = new Input({
        source: new BlobSource(new Blob([new Uint8Array(result.bytes)])),
        formats: ALL_FORMATS,
      });
      try {
        const track = await input.getPrimaryVideoTrack();
        const frame = await new CanvasSink(track, {
          width: 640,
          height: 360,
          fit: 'contain',
          poolSize: 1,
        }).getCanvas(0.05);
        const ctx = frame.canvas.getContext('2d');
        return {
          supported: true,
          info: result.info,
          rms: await harness.silenceRms(result.bytes, [[0, 0.1]]),
          line: Array.from(ctx.getImageData(320, 288, 1, 1).data),
          outside: Array.from(ctx.getImageData(600, 200, 1, 1).data),
        };
      } finally {
        input.dispose();
      }
    },
    { bytes, project: after },
  );
  assert.ok(exported.supported);
  assert.ok(exported.info.audioCodec);
  assert.ok(exported.rms[0] > 0.001);
  assert.ok(exported.line[2] > exported.outside[2] + 50);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        browser: browser.version(),
        preview,
        exportAudio: exported.info.audioCodec,
        line: exported.line,
        outside: exported.outside,
        checks:
          'cancel, analysis, transparent preview, atomic new line, properties, audio/video export',
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
