import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.TEST_URL ?? 'http://127.0.0.1:5193';
await mkdir('test-results/ui-upgrade-v2', { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const report = [];
try {
  let fixture;
  for (const [width, height] of [
    [1440, 1000],
    [1024, 768],
    [768, 1024],
    [390, 844],
    [320, 740],
  ]) {
    const touch = width <= 1150,
      context = await browser.newContext({
        viewport: { width, height },
        hasTouch: touch,
        isMobile: touch,
      });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const native = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function (...args) {
        if (this.download.endsWith('.json') && this.href.startsWith('blob:')) {
          window.__savedProject = fetch(this.href).then((r) => r.json());
          return;
        }
        return native.apply(this, args);
      };
    });
    await page.goto(origin);
    await page.getByRole('heading', { name: '미디어', exact: true }).waitFor();
    if (!fixture)
      fixture = Buffer.from(
        await page.evaluate(async () => (await import('/tests/browser-harness.ts')).fixture()),
      );
    await page
      .getByTestId('import-input')
      .setInputFiles({ name: 'fixture.mp4', mimeType: 'video/mp4', buffer: fixture });
    await page.getByRole('button', { name: 'fixture.mp4 타임라인에 추가', exact: true }).click();
    const save = async () => {
      await page.evaluate(() => {
        window.__savedProject = undefined;
      });
      await page.getByRole('button', { name: '저장', exact: true }).click();
      await page.waitForFunction(() => !!window.__savedProject);
      return page.evaluate(() => window.__savedProject);
    };
    const original = await save();
    original.laneCount = 2;
    original.subtitles = Array.from({ length: 30 }, (_, i) => ({
      id: `cue-${i}`,
      lane: 1,
      startUs: i * 50000,
      endUs: (i + 1) * 50000,
      text: `caption ${i}`,
      size: 0.05,
      color: '#ffffff',
      background: '#000000',
      x: 0.5,
      y: 0.9,
    }));
    await page
      .getByTestId('project-input')
      .setInputFiles({
        name: 'layout.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(original)),
      });
    await page.waitForFunction(() => document.querySelectorAll('.subtitle-block').length === 30);
    assert.equal(await page.locator('.statusbar').count(), 0);
    assert.equal(await page.getByLabel('이동 (초)', { exact: true }).count(), 0);
    await page.waitForFunction(() => document.querySelectorAll('.workspace-splitter').length === 3);
    const before = await page.evaluate(() => ({
      timeline: document.querySelector('.timeline-panel').getBoundingClientRect().height,
      toolbar: document.querySelector('.toolbar').getBoundingClientRect().height,
    }));
    assert.ok(before.timeline >= (width > 1150 ? 260 : 300));
    assert.ok(before.toolbar <= 36);
    const cdp = touch ? await context.newCDPSession(page) : undefined;
    const handles = await page.getByRole('separator').all();
    for (const handle of handles) {
      await handle.scrollIntoViewIfNeeded();
      const box = await handle.boundingBox(),
        axis = await handle.getAttribute('aria-orientation'),
        old = await handle.getAttribute('aria-valuenow');
      const x = box.x + box.width / 2,
        y = box.y + box.height / 2,
        dx = axis === 'vertical' ? 35 : 0,
        dy = axis === 'horizontal' ? 35 : 0;
      if (touch) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let i = 1; i <= 8; i++)
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: x + (dx * i) / 8, y: y + (dy * i) / 8 }],
          });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(350);
      } else {
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + dx, y + dy, { steps: 8 });
        await page.mouse.up();
      }
      await page.waitForFunction(
        ({ label, value }) =>
          document.querySelector(`[aria-label="${label}"]`).getAttribute('aria-valuenow') !== value,
        { label: await handle.getAttribute('aria-label'), value: old },
      );
    }
    assert.deepEqual(await save(), original, 'panel resize must not modify project state');
    const geometry = await page.evaluate(() => {
      const r = document.querySelector('.preview-surface').getBoundingClientRect();
      return {
        ratio: r.width / r.height,
        width: document.documentElement.scrollWidth,
        panels: [...document.querySelectorAll('.workspace>.panel')].map((e) => ({
          className: e.className,
          width: e.clientWidth,
          height: e.clientHeight,
        })),
      };
    });
    assert.ok(Math.abs(geometry.ratio - 16 / 9) < 0.02);
    assert.ok(geometry.width <= width);
    for (const handle of await page.locator('[role="separator"][aria-orientation="horizontal"]').all()) {
      await handle.focus();
      for (const key of ['Shift+ArrowDown', 'Shift+ArrowUp']) {
        for (let n = 0; n < 30; n++) await handle.press(key);
        const minimums = await page.evaluate(() => ({
          timeline: document.querySelector('.timeline-panel').getBoundingClientRect().height,
          inspector: document.querySelector('.inspector-panel').getBoundingClientRect().height,
        }));
        assert.ok(minimums.timeline >= 189);
        assert.ok(minimums.inspector >= 259);
      }
      await handle.press('Home');
    }
    await page.getByRole('tab', { name: /자막/ }).click();
    await page.locator('.cue-list button').first().click();
    await page.getByLabel('선택 자막 빠른 편집', { exact: true }).fill('Edited after resize');
    assert.equal(
      (await save()).subtitles.find((c) => c.id === 'cue-0').text,
      'Edited after resize',
    );
    await page.getByRole('button', { name: '재생', exact: true }).click();
    await page.getByRole('button', { name: '일시 정지', exact: true }).waitFor();
    await page.getByRole('button', { name: '일시 정지', exact: true }).click();
    const reset = page.getByRole('separator').first();
    await reset.focus();
    await reset.press('Home');
    await page.waitForFunction(() => !document.querySelector('.workspace').style.gridTemplateRows);
    await reset.press(
      (await reset.getAttribute('aria-orientation')) === 'vertical' ? 'ArrowRight' : 'ArrowDown',
    );
    await page.waitForFunction(() => !!document.querySelector('.workspace').style.gridTemplateRows);
    const saved = await save();
    const switched = width > 1150 ? 390 : 1440;
    await page.setViewportSize({ width: switched, height: 900 });
    await page.waitForFunction(() => !document.querySelector('.workspace').style.gridTemplateRows);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(await save(), saved);
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `test-results/ui-upgrade-v2/${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    report.push({ width, height, before, geometry });
    console.log(
      `PASS ${width}: boundary drag, minimums, aspect, editing, playback, reset, breakpoint change`,
    );
    await cdp?.detach();
    await context.close();
  }
} finally {
  await writeFile('test-results/ui-upgrade-v2/report.json', JSON.stringify(report, null, 2));
  await browser.close();
}
