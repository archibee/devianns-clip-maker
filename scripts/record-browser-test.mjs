import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.TEST_URL ?? 'http://127.0.0.1:5193';
await mkdir('test-results/record-v1', { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
  headless: true,
  ignoreDefaultArgs: ['--mute-audio'],
  args: [
    '--auto-select-tab-capture-source-by-title=Recorder Fixture',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ],
});
const checks = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const source = await context.newPage();
  await source.goto(origin);
  await source.evaluate(() => {
    document.title = 'Recorder Fixture';
    document.body.replaceChildren();
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    document.body.append(canvas);
    let frame = 0;
    const draw = () => {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = frame % 60 < 30 ? '#ca4539' : '#3b67bb';
      ctx.fillRect(0, 0, 640, 360);
      ctx.fillStyle = 'white';
      ctx.font = '32px sans-serif';
      ctx.fillText(`Capture fixture ${frame++}`, 40, 150);
      requestAnimationFrame(draw);
    };
    draw();
    const audio = new AudioContext();
    const oscillator = audio.createOscillator(),
      gain = audio.createGain();
    gain.gain.value = 0.02;
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    void audio.resume();
  });
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  await page.getByRole('button', { name: '탭·화면 녹화', exact: true }).click();
  await page.getByRole('button', { name: '녹화할 탭 선택', exact: true }).click();
  await page.getByRole('button', { name: '녹화 시작', exact: true }).waitFor({ timeout: 15000 });
  const audioLabel = await page.locator('.record-audio,.record-warning').innerText();
  await page.getByRole('button', { name: '녹화 시작', exact: true }).click();
  await page.waitForTimeout(2300);
  await page.getByRole('button', { name: '녹화 완료 · 에셋에 추가', exact: true }).click();
  await page
    .getByText('녹화 영상이 프로젝트 에셋에 추가됐습니다.', { exact: true })
    .waitFor({ timeout: 15000 });
  assert.equal(await page.locator('.asset-card').count(), 1);
  assert.equal(await page.locator('.asset-card.missing').count(), 0);
  checks.push({
    name: 'real tab capture to imported asset',
    audioLabel,
    file: await page.locator('.asset-info strong').innerText(),
  });
  const captured = await page.evaluate(async () => {
    const link = document.querySelector('.record-actions a');
    const bytes = Array.from(new Uint8Array(await (await fetch(link.href)).arrayBuffer()));
    const harness = await import('/tests/browser-harness.ts');
    const info = await harness.inspect(bytes);
    const rms = await harness.silenceRms(bytes, [[0, 30]]);
    const exported = await harness.runExport([{ bytes, name: 'captured.webm' }], {
      resolution: 480,
      fps: 30,
      format: 'mp4',
    });
    return {
      info,
      rms,
      exported: exported.supported
        ? {
            supported: true,
            info: exported.info,
            rms: await harness.silenceRms(exported.bytes, [[0, 30]]),
          }
        : exported,
    };
  });
  console.log(
    'CAPTURE AUDIO',
    JSON.stringify({
      duration: captured.info.duration,
      audioCodec: captured.info.audioCodec,
      rms: captured.rms,
      output: captured.exported.rms,
    }),
  );
  assert.ok(captured.info.duration > 0);
  assert.ok(captured.rms[0] > 0.0001, 'capture must contain decoded sound');
  assert.ok(captured.exported.supported, 'capture must be exportable');
  assert.ok(captured.exported.info.audioCodec, 'output audio must exist');
  assert.ok(captured.exported.rms[0] > 0.0001, 'output must contain decoded sound');
  checks.push({ name: 'recorded WebM and exported MP4 both have decoded video/audio', captured });
  await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).last().click();
  await page.locator('.add-asset').click();
  assert.equal(await page.locator('.timeline-clip').count(), 1);
  await page.getByRole('button', { name: '재생', exact: true }).click();
  await page.getByRole('button', { name: '일시 정지', exact: true }).waitFor();
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  checks.push({ name: 'captured asset timeline insertion and playback' });
  await page.getByRole('button', { name: '탭·화면 녹화', exact: true }).click();
  await page.getByRole('button', { name: '취소', exact: true }).click();
  assert.equal(await page.locator('.asset-card').count(), 1);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: 'test-results/record-v1/desktop.png', fullPage: true });
  for (const width of [320, 390, 600, 768, 1024]) {
    const mobile = await browser.newContext({
      viewport: { width, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const p = await mobile.newPage();
    await p.goto(origin);
    await p.getByRole('button', { name: '탭·화면 녹화', exact: true }).waitFor();
    const dimensions = await p.evaluate(() => {
      const rect = (s) => document.querySelector(s).getBoundingClientRect().toJSON();
      return {
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        brand: getComputedStyle(document.querySelector('.brand')).display,
        project: rect('.project-name'),
        toolbar: rect('.toolbar'),
        transport: rect('.transport'),
        buttons: [...document.querySelectorAll('.transport-buttons button')].map((e) =>
          e.getBoundingClientRect().toJSON(),
        ),
      };
    });
    assert.ok(dimensions.documentWidth <= width);
    assert.ok(dimensions.toolbar.height <= 39);
    assert.ok(dimensions.buttons.every((b) => b.width >= 36 && b.height >= 36));
    assert.ok(dimensions.buttons[2].width >= 44);
    assert.ok(dimensions.buttons.at(-1).right <= width);
    if (width <= 600) {
      assert.equal(dimensions.brand, 'none');
      assert.ok(dimensions.project.x <= 8);
    }
    await p.getByRole('button', { name: '탭·화면 녹화', exact: true }).tap();
    const dialog = p.getByRole('dialog');
    await dialog.waitFor();
    assert.ok(
      await dialog.evaluate(
        (e) => e.clientWidth <= innerWidth && e.scrollWidth <= e.clientWidth + 1,
      ),
    );
    await dialog.getByRole('button', { name: '취소', exact: true }).tap();
    await p.screenshot({ path: `test-results/record-v1/mobile-${width}.png`, fullPage: true });
    checks.push({ name: `responsive ${width}`, dimensions });
    await mobile.close();
  }
  const unsupported = await browser.newContext();
  await unsupported.addInitScript(() =>
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { value: undefined }),
  );
  const unsupportedPage = await unsupported.newPage();
  await unsupportedPage.goto(origin);
  await unsupportedPage.getByRole('button', { name: '탭·화면 녹화', exact: true }).click();
  assert.ok(await unsupportedPage.locator('.record-dialog-body .inline-error').isVisible());
  assert.ok(
    await unsupportedPage.getByRole('button', { name: '녹화할 탭 선택', exact: true }).isDisabled(),
  );
  await unsupportedPage.getByRole('button', { name: '취소', exact: true }).click();
  checks.push({ name: 'unsupported capture API is explained without affecting editor' });
  await unsupported.close();
  console.log(
    JSON.stringify(
      {
        browser: browser.version(),
        checks: checks.map((c) => ({
          name: c.name,
          ...(c.audioLabel ? { audio: c.audioLabel } : {}),
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await writeFile('test-results/record-v1/report.json', JSON.stringify(checks, null, 2));
  await browser.close();
}
