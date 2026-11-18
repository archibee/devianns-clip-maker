import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.TEST_URL ?? 'http://127.0.0.1:5193';
await mkdir('test-results/record-v2', { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
  headless: true,
  ignoreDefaultArgs: ['--mute-audio'],
  args: [
    '--auto-select-tab-capture-source-by-title=Region Recorder Fixture',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ],
});
const report = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const source = await context.newPage();
  await source.setViewportSize({ width: 800, height: 600 });
  await source.goto(origin);
  await source.evaluate(() => {
    document.title = 'Region Recorder Fixture';
    document.body.replaceChildren();
    document.body.style.margin = '0';
    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    document.body.append(canvas);
    canvas.addEventListener('click', () => {
      void document.documentElement.requestFullscreen();
    });
    let frame = 0;
    const draw = () => {
      if (canvas.width !== innerWidth || canvas.height !== innerHeight) {
        canvas.width = innerWidth;
        canvas.height = innerHeight;
      }
      const ctx = canvas.getContext('2d'),
        w = canvas.width,
        h = canvas.height;
      ctx.fillStyle = '#dc3020';
      ctx.fillRect(0, 0, w / 2, h);
      ctx.fillStyle = '#2040dc';
      ctx.fillRect(w / 2, 0, w / 2, h);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(w / 4, h / 2, Math.min(w / 2, h) * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#00aa00';
      ctx.fillRect((frame++ * 5) % (w / 2), h - 16, 10, 10);
      requestAnimationFrame(draw);
    };
    draw();
    const audio = new AudioContext(),
      tone = audio.createOscillator(),
      gain = audio.createGain();
    gain.gain.value = 0.02;
    tone.connect(gain).connect(audio.destination);
    tone.start();
    void audio.resume();
  });
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin);
  for (const mode of ['full', 'region']) {
    await source.evaluate(async () => {
      if (document.fullscreenElement) await document.exitFullscreen();
    });
    await source.setViewportSize({ width: 800, height: 600 });
    await page.getByRole('button', { name: '탭·화면 녹화', exact: true }).click();
    await page.getByRole('button', { name: '녹화할 탭 선택', exact: true }).click();
    await page.getByRole('button', { name: '녹화 시작', exact: true }).waitFor();
    const initial = await page
      .locator('.record-preview')
      .evaluate((v) => ({ width: v.videoWidth, height: v.videoHeight }));
    if (mode === 'region') {
      await page.getByLabel('사각형 지정', { exact: true }).check();
      const overlay = page.locator('.record-region-overlay');
      await overlay.waitFor();
      const b = await overlay.boundingBox();
      await page.mouse.move(b.x + b.width * 0.01, b.y + b.height * 0.01);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.99, { steps: 8 });
      await page.mouse.up();
      await page.getByText('영역 수치 조정', { exact: true }).click();
      for (const [label, value] of [
        ['X', '0'],
        ['Y', '0'],
        ['너비', '50'],
        ['높이', '100'],
      ])
        await page.getByLabel(`녹화 영역 ${label} (%)`, { exact: true }).fill(value);
    }
    await page.screenshot({ path: `test-results/record-v2/${mode}-selection.png`, fullPage: true });
    await page.getByRole('button', { name: '녹화 시작', exact: true }).click();
    await page.getByRole('button', { name: '녹화 완료 · 에셋에 추가', exact: true }).waitFor();
    const declared = (await page.getByText(/^녹화 크기 /).innerText()).match(/(\d+) × (\d+)/);
    assert.ok(declared);
    const expectedWidth = Number(declared[1]),
      expectedHeight = Number(declared[2]);
    await page.waitForTimeout(800);
    await source.bringToFront();
    await source.setViewportSize({ width: 1200, height: 600 });
    await source.locator('canvas').click({ position: { x: 10, y: 10 } });
    assert.ok(await source.evaluate(() => !!document.fullscreenElement));
    await page.waitForTimeout(1600);
    await page.getByRole('button', { name: '녹화 완료 · 에셋에 추가', exact: true }).click();
    await page.getByText('녹화 영상이 프로젝트 에셋에 추가됐습니다.', { exact: true }).waitFor();
    const result = await page.evaluate(async () => {
      const link = document.querySelector('.record-actions a'),
        bytes = Array.from(new Uint8Array(await (await fetch(link.href)).arrayBuffer()));
      const harness = await import('/tests/browser-harness.ts');
      return {
        info: await harness.inspect(bytes),
        samples: await harness.inspectRecordingRegion(bytes, [0.3, 1.7, 2.1]),
        rms: await harness.silenceRms(bytes, [[0, 30]]),
      };
    });
    assert.ok(result.rms[0] > 0.0001);
    assert.equal(result.info.width, expectedWidth);
    assert.equal(result.info.height, expectedHeight);
    assert.ok(
      result.samples.every((s) => s.width === expectedWidth && s.height === expectedHeight),
    );
    for (const sample of result.samples)
      if (sample.whiteBox.width > 10)
        assert.ok(
          Math.abs(sample.whiteBox.width / sample.whiteBox.height - 1) < 0.12,
          'circle must not be stretched',
        );
    if (mode === 'region') {
      assert.ok(
        result.samples.every((s) => s.center[0] > s.center[2] + 80),
        'selected left red region must exclude the right blue region',
      );
      assert.ok(
        result.samples
          .at(-1)
          .top.slice(0, 3)
          .every((value) => value < 20),
        'source aspect change should add letterboxing',
      );
    }
    report.push({ mode, initial, ...result });
    console.log(
      `PASS ${mode}: ${expectedWidth}x${expectedHeight}, fullscreen resize, crop pixels, audio`,
    );
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '닫기', exact: true })
      .last()
      .click();
  }
  for (const width of [320, 768]) {
    await source.evaluate(async () => {
      if (document.fullscreenElement) await document.exitFullscreen();
    });
    await source.setViewportSize({ width: 800, height: 600 });
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('button', { name: '탭·화면 녹화', exact: true }).click();
    await page.getByRole('button', { name: '녹화할 탭 선택', exact: true }).click();
    await page.getByRole('button', { name: '녹화 시작', exact: true }).waitFor();
    await page.getByLabel('사각형 지정', { exact: true }).check();
    const overlay = page.locator('.record-region-overlay');
    await overlay.scrollIntoViewIfNeeded();
    const box = await overlay.boundingBox();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width * 0.02, y: box.y + box.height * 0.02 }],
    });
    for (let i = 1; i <= 8; i++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: box.x + box.width * (0.02 + (0.48 * i) / 8),
            y: box.y + box.height * (0.02 + (0.78 * i) / 8),
          },
        ],
      });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const selected = await page
      .locator('.record-region-box')
      .evaluate((e) => ({ width: parseFloat(e.style.width), height: parseFloat(e.style.height) }));
    assert.ok(Math.abs(selected.width - 48) < 2 && Math.abs(selected.height - 78) < 2);
    assert.ok(await page.getByRole('dialog').evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
    await page.screenshot({ path: `test-results/record-v2/touch-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: '취소', exact: true }).click();
    await cdp.detach();
    report.push({ mode: `touch region ${width}`, selected });
    console.log(`PASS ${width}: touch rectangle selection and modal layout`);
  }
  assert.deepEqual(errors, []);
} finally {
  await writeFile('test-results/record-v2/report.json', JSON.stringify(report, null, 2));
  await browser.close();
}
