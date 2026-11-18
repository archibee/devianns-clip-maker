import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.TEST_URL || 'http://127.0.0.1:5174/';
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || 'msedge',
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const report = { checks: [], errors: [], externalRequests: [], unverified: [] };
page.on('pageerror', (e) => report.errors.push(e.message));
page.on('request', (r) => {
  if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(base).origin)
    report.externalRequests.push(r.url());
});
const harness = base + 'tests/browser-harness.ts';
let savedIndex = 0;
async function save(p = page) {
  const [download] = await Promise.all([
    p.waitForEvent('download'),
    p.getByRole('button', { name: '저장', exact: true }).click(),
  ]);
  const path = `test-results/v6-project-${++savedIndex}.json`;
  await download.saveAs(path);
  return JSON.parse(await readFile(path, 'utf8'));
}
async function load(project, p = page) {
  await p
    .getByTestId('project-input')
    .setInputFiles({
      name: 'v6.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await p.waitForTimeout(180);
}
async function seek(n, p = page) {
  const input = p.getByRole('slider', { name: '재생 위치', exact: true });
  await input.fill(String(Math.round(n * 1_000_000)));
  await input.press('Enter');
  await p.waitForTimeout(180);
}
async function number(name, n, p = page) {
  const input = p.getByRole('spinbutton', { name, exact: true });
  await input.fill(String(n));
  await input.press('Enter');
}
async function hash(p = page) {
  return p.getByTestId('preview-canvas').evaluate((c) => {
    let hash = 0;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < d.length; i += 13) hash = (hash * 31 + d[i]) >>> 0;
    return hash;
  });
}
async function stable(p = page) {
  let last = await hash(p);
  for (let i = 0; i < 25; i++) {
    await p.waitForTimeout(100);
    const next = await hash(p);
    if (next === last && i > 1) return next;
    last = next;
  }
  return last;
}
async function pixels(p = page) {
  return p.getByTestId('preview-canvas').evaluate((c) => {
    const tiny = document.createElement('canvas');
    tiny.width = 160;
    tiny.height = 90;
    const ctx = tiny.getContext('2d');
    ctx.drawImage(c, 0, 0, 160, 90);
    return Array.from(ctx.getImageData(0, 0, 160, 90).data);
  });
}
async function dragHandle(handle, dx, dy) {
  const b = await page.locator(`.transform-overlay [data-handle="${handle}"]`).boundingBox();
  assert.ok(b);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
  await stable();
}
async function check(name, run) {
  if (process.env.V6_CHECK_FILTER && !new RegExp(process.env.V6_CHECK_FILTER).test(name)) return;
  console.log('START', name);
  try {
    const result = await run();
    report.checks.push({ name, result });
    console.log('PASS', name, JSON.stringify(result ?? ''));
  } catch (e) {
    report.checks.push({ name, error: e.stack });
    throw e;
  }
}
async function exportUI(p = page) {
  await p.getByRole('button', { name: '내보내기 ↗', exact: true }).click();
  await p.getByLabel('출력 해상도', { exact: true }).selectOption('480');
  await p.getByRole('button', { name: '렌더링 시작 ↗', exact: true }).click();
  const link = p.getByRole('link', { name: '영상 다운로드 ↓' });
  await link.waitFor({ timeout: 90000 });
  const [download] = await Promise.all([p.waitForEvent('download'), link.click()]);
  const path = `test-results/v6-output-${savedIndex}.mp4`;
  await download.saveAs(path);
  const bytes = Array.from(await readFile(path));
  await p.getByRole('button', { name: '닫기', exact: true }).last().click();
  return bytes;
}
try {
  await page.goto(base);
  report.userAgent = await page.evaluate(() => navigator.userAgent);
  await page
    .getByTestId('import-input')
    .setInputFiles(['test-results/red.mp4', 'test-results/blue.mp4']);
  await page.getByRole('button', { name: 'red.mp4 타임라인에 추가', exact: true }).click();
  await seek(2);
  await page.getByRole('button', { name: 'blue.mp4 타임라인에 추가', exact: true }).click();
  const original = await save();
  await check('긴 타임라인 눈금·스크롤 및 프로젝트 전환 클립보드', async () => {
    await seek(100000);
    assert.ok((await page.locator('.ruler > span').count()) < 80);
    await page.locator('.timeline-scroll').evaluate((el) => {
      el.scrollLeft = 100000 * 52 - 400;
    });
    await page.waitForTimeout(150);
    assert.ok((await page.locator('.ruler > span').count()) < 80);
    await page.locator('.timeline-scroll').evaluate((el) => {
      el.scrollLeft = 0;
    });
    await page.locator('.timeline-clip').first().click();
    await page.keyboard.press('Control+c');
    await load({ ...original, id: 'new-project', assets: [], clips: [] });
    await page.locator('.timeline-panel h2').click();
    await page.keyboard.press('Control+v');
    assert.equal(await page.locator('.timeline-clip').count(), 0);
    await load(original);
    // 원본 파일 연결은 새 프로젝트에서 다시 요청한다.
    for (const name of ['red.mp4', 'blue.mp4']) {
      const reconnect = page
        .locator('.asset-card')
        .filter({ hasText: name })
        .getByRole('button', { name: '원본 다시 연결', exact: true });
      if (await reconnect.count()) {
        await reconnect.click();
        await page.getByTestId('reconnect-input').setInputFiles('test-results/' + name);
        await page.getByRole('button', { name: name + ' 타임라인에 추가', exact: true }).waitFor();
      }
    }
    await seek(0.35);
    return '100000초에서도 눈금 수 제한·스크롤 가능·오래된 영상 붙여넣기 없음';
  });
  await check('화면 비율·반응형·중앙 슬라이더·로고/제목·대비', async () => {
    assert.equal(await page.locator('.brand-mark').count(), 0);
    await page.getByRole('heading', { name: '미리보기', exact: true }).waitFor();
    const center = await page.locator('.timeline-footer').evaluate((el) => {
      const a = el.getBoundingClientRect(),
        b = el.querySelector('label').getBoundingClientRect();
      return Math.abs(a.x + a.width / 2 - b.x - b.width / 2);
    });
    assert.ok(center < 2);
    const ratios = [];
    for (const aspect of ['16:9', '9:16', '1:1']) {
      await load({ ...original, aspect });
      const box = await page.locator('.preview-surface').boundingBox();
      assert.ok(box && box.width > 20 && box.height > 20);
      const [w, h] = aspect.split(':').map(Number);
      assert.ok(Math.abs(box.width / box.height - w / h) < 0.02);
      ratios.push({ aspect, width: box.width, height: box.height });
    }
    for (const width of [900, 560, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
      );
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await load(original);
    const contrast = await page.evaluate(() => {
      const luminance = (color) => {
        const rgb = color
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number)
          .map((v) => {
            v /= 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          });
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      const s = getComputedStyle(document.querySelector('.toolbar .primary')),
        a = luminance(s.color),
        b = luminance(s.backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    assert.ok(contrast >= 4.5);
    return { center, contrast, ratios };
  });
  let cropped;
  await check('Crop 임시 렌더·테두리·확정·취소·저장', async () => {
    await page.locator('.timeline-clip').first().click();
    await seek(0.35);
    const before = await stable();
    await page.getByRole('button', { name: 'Crop', exact: true }).click();
    const outline = await page.locator('.transform-outline').boundingBox();
    await dragHandle('se', -outline.width * 0.22, -outline.height * 0.18);
    const preview = await hash();
    assert.notEqual(preview, before, 'Crop 중 실제 영상이 변경되어야 함');
    const measured = await page.locator('.transform-outline').boundingBox();
    await page.getByRole('button', { name: 'Crop', exact: true }).click();
    await stable();
    assert.equal(await hash(), preview, '확정 전후 렌더 결과 동일');
    cropped = await save();
    assert.ok(cropped.clips[0].transform.crop.width < 0.9);
    const geometry = await page.evaluate(
      async ({ base, project }) => {
        const { imageRect, previewSize } = await import(base + 'src/render/compositor.ts');
        const c = project.clips[0],
          a = project.assets.find((a) => a.id === c.assetId),
          s = previewSize(project.aspect),
          crop = c.transform.crop;
        const r = imageRect(
          a.width * crop.width,
          a.height * crop.height,
          s.width,
          s.height,
          c.transform,
        );
        const surface = document.querySelector('.preview-surface').getBoundingClientRect();
        return {
          x: surface.x + (r.x / s.width) * surface.width,
          y: surface.y + (r.y / s.height) * surface.height,
          width: (r.width / s.width) * surface.width,
          height: (r.height / s.height) * surface.height,
        };
      },
      { base, project: cropped },
    );
    for (const key of ['x', 'y', 'width', 'height'])
      assert.ok(Math.abs(measured[key] - geometry[key]) < 2, `${key} 테두리 불일치`);
    await page.getByRole('button', { name: 'Crop', exact: true }).click();
    await dragHandle('se', -40, -25);
    assert.notEqual(await hash(), preview);
    await page.getByRole('button', { name: 'Move', exact: true }).click();
    assert.equal(await stable(), preview, '다른 도구는 미확정 Crop 취소');
    await page.getByRole('button', { name: 'Move', exact: true }).click();
    const bytes = await exportUI();
    const comparisons = await page.evaluate(
      async ({ url, bytes, reference }) =>
        (await import(url)).comparePreview(bytes, [{ time: 0.35, pixels: reference }]),
      { url: harness, bytes, reference: await pixels() },
    );
    assert.ok(comparisons[0].meanRgbError < 8);
    return { geometry, comparisons };
  });
  await check('Crop 중 시킹·재생·클립 전환은 임시 편집을 취소하고 재생을 유지한다', async () => {
    await page.locator('.timeline-clip').first().click();
    await seek(0.35);
    const baseline = await save();
    await page.getByRole('button', { name: 'Crop', exact: true }).click();
    await dragHandle('se', -30, -20);
    await seek(0.6);
    await page.locator('.transform-overlay').waitFor({ state: 'hidden' });
    assert.deepEqual((await save()).clips[0].transform, baseline.clips[0].transform);
    await page.getByRole('button', { name: 'Crop', exact: true }).click();
    await dragHandle('se', -30, -20);
    await page.getByRole('button', { name: '재생', exact: true }).click();
    await page.waitForFunction(
      () => Number(document.querySelector('input[aria-label="\uC7AC\uC0DD \uC704\uCE58"]').value / 1_000_000) > 0.9,
      null,
      { timeout: 12000 },
    );
    await page.getByRole('button', { name: '일시 정지', exact: true }).click();
    assert.deepEqual((await save()).clips[0].transform, baseline.clips[0].transform);
    await page.locator('.timeline-clip').first().click();
    await page.getByRole('button', { name: 'Crop', exact: true }).click();
    await dragHandle('se', -30, -20);
    await page.locator('.timeline-clip').nth(1).click();
    assert.deepEqual((await save()).clips[0].transform, baseline.clips[0].transform);
    await page.getByRole('button', { name: 'Crop', exact: true }).click();
    await page.locator('.timeline-clip').first().click();
    await seek(0.35);
    return '시킹/재생/다른 클립 선택 후 원본 편집값 유지';
  });
  await check('반복 Crop 최소값·복원·출력', async () => {
    for (let i = 0; i < 5; i++) {
      await page.getByRole('button', { name: 'Crop', exact: true }).click();
      const b = await page.locator('.transform-outline').boundingBox();
      await dragHandle('se', -b.width * 0.8, -b.height * 0.8);
      await page.getByRole('button', { name: 'Crop', exact: true }).click();
      await stable();
    }
    const p = await save();
    const crop = p.clips[0].transform.crop;
    assert.ok(crop.width >= 0.001 - 1e-12 && crop.height >= 0.001 - 1e-12);
    await load(p);
    await seek(0.35);
    await exportUI();
    return crop;
  });
  await load(original);
  await check('다중 선택·합치기·분할·undo/redo·서로 다른 원본 출력', async () => {
    await page.locator('.timeline-clip').first().click();
    await page
      .locator('.timeline-clip')
      .nth(1)
      .click({ modifiers: ['Control'] });
    assert.equal(await page.locator('.timeline-clip.selected').count(), 2);
    await page.getByRole('button', { name: '합치기', exact: true }).click();
    assert.equal(await page.locator('.timeline-clip').count(), 1);
    const p = await save();
    assert.equal(p.clips[0].parts.length, 2);
    const refs = [];
    for (const time of [0.35, 2.35]) {
      await seek(time);
      await stable();
      refs.push({ time, pixels: await pixels() });
    }
    const bytes = await exportUI();
    const comparisons = await page.evaluate(
      async ({ url, bytes, refs }) => (await import(url)).comparePreview(bytes, refs),
      { url: harness, bytes, refs },
    );
    assert.ok(comparisons.every((c) => c.meanRgbError < 8));
    await seek(2.5);
    await page.locator('.timeline-panel h2').click();
    await page.keyboard.press('1');
    assert.equal(await page.locator('.timeline-clip').count(), 2);
    await page.keyboard.press('Control+z');
    assert.equal(await page.locator('.timeline-clip').count(), 1);
    await page.keyboard.press('Control+Shift+z');
    assert.equal(await page.locator('.timeline-clip').count(), 2);
    return comparisons;
  });
  await load(original);
  await check('영상 복사·연속 붙여넣기·겹침 거부·자막 끝 연장', async () => {
    await page.locator('.timeline-clip').first().click();
    await page.keyboard.press('Control+c');
    await seek(4);
    await page.locator('.timeline-panel h2').click();
    await page.keyboard.press('Control+v');
    await page.waitForFunction(
      () => Number(document.querySelector('input[aria-label="\uC7AC\uC0DD \uC704\uCE58"]').value / 1_000_000) > 5.9,
    );
    await page.keyboard.press('Control+v');
    await page.waitForFunction(
      () => Number(document.querySelector('input[aria-label="\uC7AC\uC0DD \uC704\uCE58"]').value / 1_000_000) > 7.9,
    );
    assert.equal(await page.locator('.timeline-clip').count(), 4);
    await seek(1);
    await page.locator('.timeline-panel h2').click();
    await page.keyboard.press('Control+v');
    await page.getByRole('alert').filter({ hasText: '겹칩니다' }).waitFor();
    assert.equal(await page.locator('.timeline-clip').count(), 4);
    await page.getByRole('button', { name: '알림 닫기' }).click();
    await seek(9);
    await page.getByRole('tab', { name: /자막/ }).click();
    await page.getByRole('button', { name: '＋ 추가', exact: true }).click();
    const p = await save();
    assert.equal(p.subtitles[0].endUs, 11_000_000);
    return { clips: p.clips.length, end: p.subtitles[0].endUs };
  });
  await load(original);
  await check('영상 빈 구간·자막만 남는 끝의 출력·오디오 무음', async () => {
    const clips = original.clips.map((c, i) => ({
      ...c,
      startUs: i * 2_000_000,
      outUs: c.inUs + 1_000_000,
    }));
    const q = {
      id: 'gap-caption',
      startUs: 3_200_000,
      endUs: 4_000_000,
      text: '영상 뒤 자막',
      size: 0.06,
      x: 0.5,
      y: 0.5,
      color: '#ffffff',
      background: '#000000',
    };
    await load({ ...original, clips, subtitles: [q] });
    const refs = [];
    for (const time of [0.35, 1.35, 2.35, 3.5]) {
      await seek(time);
      await stable();
      refs.push({ time, pixels: await pixels() });
    }
    assert.ok(
      refs[1].pixels.every((v, i) => i % 4 === 3 || v === 0),
      '영상 없는 구간은 검은 화면',
    );
    const bytes = await exportUI();
    const result = await page.evaluate(
      async ({ url, bytes, refs }) => {
        const h = await import(url);
        return {
          comparison: await h.comparePreview(bytes, refs),
          rms: await h.silenceRms(bytes, [
            [1.2, 1.8],
            [3.3, 3.8],
          ]),
          info: await h.inspect(bytes),
        };
      },
      { url: harness, bytes, refs },
    );
    assert.ok(result.comparison.every((c) => c.meanRgbError < 8));
    assert.ok(result.rms.every((n) => n >= 0 && n < 0.001));
    assert.ok(Math.abs(result.info.videoEnd - 4) < 0.04);
    return result;
  });
  await load(original);
  await check('자막 슬라이더·프리셋·투명도·텍스트 선택 보호', async () => {
    await seek(0.3);
    await page.getByRole('tab', { name: /자막/ }).click();
    await page.getByRole('button', { name: '＋ 추가', exact: true }).click();
    await page.getByLabel('크기 프리셋', { exact: true }).selectOption('2');
    await page.getByLabel('위치 프리셋', { exact: true }).selectOption('4');
    await page.getByLabel('색상 프리셋', { exact: true }).selectOption('7');
    const slider = page.getByRole('slider', {
      name: '글자 크기 (화면 높이 %) 슬라이더',
      exact: true,
    });
    await slider.focus();
    await slider.press('ArrowRight');
    await slider.blur();
    const p = await save();
    assert.equal(p.subtitles[0].size, 0.08);
    assert.equal(p.subtitles[0].x, 0.5);
    assert.equal(p.subtitles[0].y, 0.5);
    assert.equal(p.subtitles[0].colorOpacity, 0.65);
    assert.equal(p.subtitles[0].backgroundOpacity, 0);
    const text = page.getByRole('textbox', { name: '자막 내용' });
    await text.fill('v6 자막 12');
    await text.press('Control+a');
    await text.press('1');
    await text.press('2');
    assert.equal(await text.inputValue(), '12');
    assert.equal(await page.locator('.timeline-clip').count(), 2);
    const selection = await page.evaluate(() => ({
      body: getComputedStyle(document.body).userSelect,
      input: getComputedStyle(document.querySelector('textarea')).userSelect,
    }));
    assert.equal(selection.body, 'none');
    assert.equal(selection.input, 'text');
    return selection;
  });
  await check('실제 로컬 폰트·IndexedDB 복원·출력·권한 거부', async () => {
    if (!(await page.locator('.subtitle-block').count())) {
      await seek(0.3);
      await page.getByRole('tab', { name: /자막/ }).click();
      await page.getByRole('button', { name: '＋ 추가', exact: true }).click();
    }
    const cdp = await context.newCDPSession(page);
    const browserContextId = (await cdp.send('Target.getTargetInfo')).targetInfo.browserContextId;
    await cdp.send('Browser.setPermission', {
      permission: { name: 'local-fonts' },
      setting: 'granted',
      origin: new URL(base).origin,
      browserContextId,
    });
    await page.getByRole('button', { name: '로컬 폰트 불러오기', exact: true }).click();
    const fonts = page.getByLabel('자막 폰트', { exact: true });
    await page.waitForFunction(
      () => document.querySelector('select[aria-label="자막 폰트"]')?.options.length > 1,
    );
    const name = await fonts.locator('option').nth(1).getAttribute('value');
    await fonts.selectOption(name);
    await page.waitForTimeout(400);
    let p = await save();
    assert.equal(p.subtitles[0].font.postscriptName, name);
    await seek(0.5);
    await stable();
    const ref = await pixels();
    const bytes = await exportUI();
    const comparison = await page.evaluate(
      async ({ url, bytes, ref }) =>
        (await import(url)).comparePreview(bytes, [{ time: 0.5, pixels: ref }]),
      { url: harness, bytes, ref },
    );
    assert.ok(comparison[0].meanRgbError < 8);
    await page.waitForTimeout(900);
    await page.reload();
    await page.getByRole('button', { name: '편집 복구', exact: true }).click();
    await page.locator('.subtitle-block').first().click();
    assert.equal(await page.getByLabel('자막 폰트', { exact: true }).inputValue(), name);
    await cdp.send('Browser.setPermission', {
      permission: { name: 'local-fonts' },
      setting: 'denied',
      origin: new URL(base).origin,
      browserContextId,
    });
    await page.getByRole('button', { name: '로컬 폰트 불러오기', exact: true }).click();
    await page.locator('.cue-editor .inline-error').waitFor();
    report.localFontProject = p;
    return { font: name, comparison, restored: true, denied: true };
  });
  await check('다른 브라우저 컨텍스트의 원본/폰트 누락·기본 폰트 복구', async () => {
    const other = await browser.newContext({ acceptDownloads: true });
    const p = await other.newPage();
    await p.goto(base);
    await load(report.localFontProject, p);
    assert.ok((await p.getByRole('button', { name: '원본 다시 연결', exact: true }).count()) > 0);
    await p.getByRole('alert').filter({ hasText: '로컬 폰트' }).first().waitFor();
    await p.locator('.subtitle-block').first().click();
    await p.getByLabel('자막 폰트', { exact: true }).selectOption('');
    const recovered = await save(p);
    assert.equal(recovered.subtitles[0].font, undefined);
    await other.close();
    return '누락 안내·기본 폰트 재선택 후 저장 가능';
  });
  await context.close();
  const fresh = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const p = await fresh.newPage();
  await p.goto(base);
  await check('자막만 있는 프로젝트의 검은 배경·출력·자동 복구', async () => {
    const project = {
      ...original,
      assets: [],
      clips: [],
      subtitles: [
        {
          id: 'caption-only',
          startUs: 500000,
          endUs: 1500000,
          text: '자막만',
          size: 0.06,
          x: 0.5,
          y: 0.5,
          color: '#ffffff',
          background: '#000000',
          backgroundOpacity: 0,
        },
      ],
    };
    await load(project, p);
    await seek(0.8, p);
    await stable(p);
    const colors = await p.getByTestId('preview-canvas').evaluate((c) => {
      const ctx = c.getContext('2d');
      return {
        corner: Array.from(ctx.getImageData(5, 5, 1, 1).data),
        center: [...ctx.getImageData(350, 200, 260, 140).data].some(
          (v, i) => i % 4 !== 3 && v > 100,
        ),
      };
    });
    assert.equal(colors.corner[0], 0);
    assert.equal(colors.center, true);
    const bytes = await exportUI(p);
    const info = await p.evaluate(async ({ url, bytes }) => (await import(url)).inspect(bytes), {
      url: harness,
      bytes,
    });
    assert.ok(!info.audioCodec);
    assert.ok(Math.abs(info.videoEnd - 1.5) < 0.04);
    await p.waitForTimeout(900);
    await p.reload();
    await p.getByRole('button', { name: '편집 복구', exact: true }).click();
    assert.equal(await p.locator('.subtitle-block').count(), 1);
    return { colors, info };
  });
  await fresh.close();
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.externalRequests, []);
  report.success = true;
} catch (e) {
  report.success = false;
  report.failure = e.stack;
  console.error(e);
  if (!page.isClosed())
    await page.screenshot({ path: 'test-results/v6-failure.png', fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  delete report.localFontProject;
  await writeFile('test-results/v6-browser-report.json', JSON.stringify(report, null, 2));
  await browser.close();
}
