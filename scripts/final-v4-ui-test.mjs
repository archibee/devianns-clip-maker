import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin = process.env.TEST_URL ?? 'http://127.0.0.1:5193';
await mkdir('test-results/final-v4', { recursive: true });
const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const output = [];
try {
  let fixture;
  for (const [name, width, height, touch] of [
    ['desktop', 1440, 1000, false],
    ['phone-small', 320, 740, true],
    ['phone', 390, 844, true],
    ['tablet', 768, 1024, true],
    ['tablet-wide', 1024, 768, true],
    ['phone-landscape', 740, 360, true],
  ]) {
    if (process.env.V4_ONLY && name !== process.env.V4_ONLY) continue;
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: touch,
      isMobile: touch,
      acceptDownloads: true,
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.setDefaultTimeout(10_000);
    // Capture generated project JSON before Edge's mobile download UI replaces the page.
    await page.addInitScript(() => {
      window.__events = [];
      for (const type of ['pointerdown', 'pointerup', 'click'])
        document.addEventListener(
          type,
          (e) => {
            window.__events.push({
              type,
              target: e.target?.closest('button')?.textContent ?? e.target?.tagName,
              x: e.clientX,
              y: e.clientY,
            });
            window.__events = window.__events.slice(-12);
          },
          true,
        );
      const native = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function (...args) {
        if (this.download.endsWith('.json') && this.href.startsWith('blob:')) {
          window.__savedProject = fetch(this.href).then((r) => r.json());
          return;
        }
        return native.apply(this, args);
      };
    });
    const activate = async (locator) => {
      if (touch) await locator.tap();
      else await locator.click();
    };
    const save = async () => {
      await page.evaluate(() => {
        window.__savedProject = undefined;
      });
      await activate(page.getByRole('button', { name: '저장', exact: true }));
      await page
        .waitForFunction(() => !!window.__savedProject)
        .catch(async (error) => {
          console.log(
            'SAVE FAILURE',
            await page.evaluate(() => ({
              events: window.__events,
              scrollY,
              visual: { offsetTop: visualViewport.offsetTop, pageTop: visualViewport.pageTop },
              nav: document.querySelector('.toolbar nav').getBoundingClientRect().toJSON(),
            })),
          );
          throw error;
        });
      return page.evaluate(() => window.__savedProject);
    };
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
    const project = await save();
    project.laneCount = 2;
    project.subtitles = Array.from({ length: 40 }, (_, i) => ({
      id: `cue-${i}`,
      lane: 1,
      startUs: i * 40000,
      endUs: (i + 1) * 40000,
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
        name: 'project.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(project)),
      });
    await page.getByRole('tab', { name: /자막/ }).click();
    await page.locator('.cue-list button').first().click();
    const quick = page.getByLabel('선택 자막 빠른 편집', { exact: true });
    await quick.fill('Edited subtitle');
    const before = await page.evaluate(() => {
      const box = (s) => {
        const e = document.querySelector(s),
          r = e.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          client: e.clientHeight,
          scroll: e.scrollHeight,
          overflow: getComputedStyle(e).overflow,
        };
      };
      const toolbar = document.querySelector('.toolbar'),
        r = toolbar.getBoundingClientRect();
      return {
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        toolbar: box('.toolbar'),
        nav: box('.toolbar nav'),
        preview: box('.preview-panel'),
        transport: box('.transport'),
        timeline: box('.timeline-panel'),
        tools: box('.timeline-tools'),
        quick: box('.cue-quick-editor'),
        textarea: box('.cue-quick-editor textarea'),
        properties: box('.inspector-body'),
        list: box('.subtitle-list-region'),
        toolbarChildren: [...toolbar.children].map((e) => ({
          tag: e.className,
          y: e.getBoundingClientRect().y - r.y,
          h: e.getBoundingClientRect().height,
        })),
        value: document.querySelector('.cue-quick-editor textarea').value,
      };
    });
    assert.ok(before.documentWidth <= width, `${name}: document overflow`);
    assert.ok(before.toolbar.h <= 39, `${name}: toolbar should remain compact`);
    assert.ok(before.textarea.h <= (touch ? 34 : 30), `${name}: single-row editor`);
    assert.ok(
      before.quick.scroll <= before.quick.client + 1,
      `${name}: unnecessary quick-editor scrolling`,
    );
    assert.ok(before.properties.scroll > before.properties.client, `${name}: property scrolling`);
    assert.ok(before.list.scroll > before.list.client, `${name}: caption list scrolling`);
    assert.ok(
      before.timeline.scroll <= before.timeline.client + 1,
      `${name}: clipped timeline footer`,
    );
    await page.screenshot({ path: `test-results/final-v4/${name}.png`, fullPage: true });
    await quick.fill('Edited subtitle\nsecond line');
    const edited = await save();
    assert.equal(
      edited.subtitles.find((c) => c.id === 'cue-0').text,
      'Edited subtitle\nsecond line',
    );
    assert.deepEqual(
      edited.subtitles.map((c) => c.id),
      project.subtitles.map((c) => c.id),
      'editing must preserve subtitle list order',
    );
    await activate(page.getByRole('button', { name: '재생', exact: true }));
    await page.getByRole('button', { name: '일시 정지', exact: true }).waitFor();
    await activate(page.getByRole('button', { name: '일시 정지', exact: true }));
    if (touch) {
      const cdp = await context.newCDPSession(page);
      async function drag(locator, dx, dy) {
        await locator.scrollIntoViewIfNeeded();
        const b = await locator.boundingBox();
        const x = b.x + Math.min(b.width / 2, 40),
          y = b.y + Math.min(b.height / 2, 20);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let i = 1; i <= 8; i++)
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: x + (dx * i) / 8, y: y + (dy * i) / 8 }],
          });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        // Let Chromium finish native touch/click suppression before the next gesture.
        await page.waitForTimeout(350);
      }
      const clip = page.locator('.timeline-clip').first();
      await drag(clip, 45, 0);
      assert.ok((await save()).clips[0].startUs > 0, `${name}: touch video drag`);
      await activate(page.getByRole('tab', { name: /자막/ }));
      const list = page.locator('.subtitle-list-region');
      await list.scrollIntoViewIfNeeded();
      const oldTop = await list.evaluate((e) => e.scrollTop);
      await drag(list, 0, -45);
      await page.waitForFunction(
        (old) => document.querySelector('.subtitle-list-region').scrollTop > old,
        oldTop,
      );
      await activate(page.locator('.cue-list button').last());
      assert.equal(await quick.getAttribute('data-cue-id'), 'cue-39');
      await page.getByLabel('크기 프리셋', { exact: true }).selectOption('0');
      assert.equal(
        (await save()).subtitles.find((c) => c.id === 'cue-39').size,
        await page.evaluate(
          async () => (await import('/src/editor/subtitle-presets.ts')).subtitleSizes[0].size,
        ),
      );
      await activate(page.getByRole('button', { name: '단축키 도움말', exact: true }));
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      assert.ok(
        await dialog.evaluate((e) => e.clientWidth <= innerWidth && e.clientHeight <= innerHeight),
      );
      await activate(dialog.getByRole('button', { name: '편집으로 돌아가기', exact: true }));
      await activate(page.locator('.timeline-clip .clip-video').first());
      for (const [button, selector] of [
        ['AUTO CAPTION', '.auto-caption-dialog'],
        ['AUTO CUT', '.auto-cut-dialog'],
      ]) {
        await activate(page.getByRole('button', { name: button, exact: true }));
        const modal = page.locator(selector);
        await modal.waitFor();
        assert.ok(
          await modal.evaluate(
            (e) =>
              e.clientWidth <= innerWidth &&
              e.clientHeight <= innerHeight &&
              e.scrollWidth <= e.clientWidth + 1,
          ),
          `${name}: ${button} modal overflow`,
        );
        await activate(modal.getByRole('button', { name: '취소', exact: true }));
      }
      await cdp.detach();
    }
    assert.deepEqual(errors, [], `${name}: browser errors`);
    output.push({ name, errors, ...before });
    console.log(
      `PASS ${name} ${width}x${height}: layout, subtitle editing, playback${touch ? ', touch drag/scroll/style/help/auto dialogs' : ''}`,
    );
    await context.close();
  }
} catch (error) {
  for (const context of browser.contexts())
    for (const page of context.pages())
      await page
        .screenshot({ path: 'test-results/final-v4/failure.png', fullPage: true })
        .catch(() => {});
  throw error;
} finally {
  await browser.close();
  await writeFile('test-results/final-v4/probe.json', JSON.stringify(output, null, 2));
}
