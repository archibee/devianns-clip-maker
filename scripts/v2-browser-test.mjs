import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.TEST_URL || 'http://127.0.0.1:5173/';
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
  headless: true,
});
const report = { base, checks: [], errors: [] };
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
function watch(p) {
  p.on('pageerror', (e) => report.errors.push(e.message));
}
watch(page);
async function check(name, run) {
  const result = await run();
  report.checks.push({ name, result });
  console.log('PASS', name, result ?? '');
  return result;
}
async function seek(p, n) {
  const input = p.getByRole('slider', { name: '재생 위치', exact: true });
  await input.fill(String(Math.round(n * 1_000_000)));
  await input.press('Enter');
}
async function number(p, label, n) {
  const input = p.getByRole('spinbutton', { name: label, exact: true });
  await input.fill(String(n));
  await input.press('Enter');
}
async function drag(p, locator, dx) {
  const box = await locator.boundingBox();
  assert.ok(box);
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.move(x + dx, y, { steps: 8 });
  await p.mouse.up();
  await p.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}
async function snapshot(p) {
  return p.getByTestId('preview-canvas').evaluate((canvas) => {
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(130, 100, 700, 100).data;
    let hash = 0;
    for (let i = 0; i < data.length; i += 7) hash = (hash * 31 + data[i]) >>> 0;
    return {
      hash,
      time: Number(document.querySelector('input[aria-label="\uC7AC\uC0DD \uC704\uCE58"]').value / 1_000_000),
      color: Array.from(ctx.getImageData(700, 300, 1, 1).data),
    };
  });
}
async function progress(p, count = 4) {
  await p.waitForFunction(
    () => Number(document.querySelector('input[aria-label="\uC7AC\uC0DD \uC704\uCE58"]').value / 1_000_000) > 0,
    null,
    { timeout: 12000 },
  );
  const samples = [];
  for (let n = 0; n < count; n++) {
    await p.waitForTimeout(180);
    samples.push(await snapshot(p));
  }
  assert.ok(samples.at(-1).time > samples[0].time + 0.2, '재생 시간이 진행되어야 함');
  assert.ok(
    new Set(samples.map((s) => s.hash)).size >= 2,
    '시간 표시뿐 아니라 실제 영상 프레임이 바뀌어야 함',
  );
  assert.ok(
    samples.every((s) => s.time === 0 || s.hash !== 0),
    '첫 프레임이 준비되기 전에 재생 시간이 진행되면 안 됨',
  );
  return samples;
}
try {
  await page.goto(base);
  const harness = `${base}tests/browser-harness.ts`;
  report.userAgent = await page.evaluate(() => navigator.userAgent);
  const red = await page.evaluate(async (url) => (await import(url)).fixture(), harness);
  const blue = await page.evaluate(
    async (url) => (await import(url)).fixture({ color: '#326be0', rate: 44100, vfr: true }),
    harness,
  );
  await writeFile('test-results/red.mp4', Buffer.from(red));
  await writeFile('test-results/blue.mp4', Buffer.from(blue));
  const muted = await page.evaluate(
    async (url) => (await import(url)).fixture({ audio: false }),
    harness,
  );
  await page.getByTestId('import-input').setInputFiles('test-results/red.mp4');
  await page.getByRole('button', { name: 'red.mp4 타임라인에 추가', exact: true }).click();
  await seek(page, 2);
  await page.getByTestId('import-input').setInputFiles('test-results/blue.mp4');
  await page.getByRole('button', { name: 'blue.mp4 타임라인에 추가', exact: true }).click();
  const blocks = page.locator('.subtitle-block');
  await check('타임라인 자막 선택과 기존 속성 패널 편집', async () => {
    await seek(page, 0.5);
    await page.getByRole('tab', { name: /자막/ }).click();
    await page.getByRole('button', { name: '＋ 추가', exact: true }).click();
    await page.getByRole('textbox', { name: '자막 내용' }).fill('v2 자막');
    await number(page, '자막 끝 (초)', 1.5);
    await page.locator('.timeline-clip').first().click();
    await blocks.first().click();
    assert.equal(await blocks.first().getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByRole('textbox', { name: '자막 내용' }).inputValue(), 'v2 자막');
    assert.equal(
      Number(
        await page.getByRole('spinbutton', { name: '자막 시작 (초)', exact: true }).inputValue(),
      ),
      0.5,
    );
    return '선택 공유 · 클릭만으로 시간 변경 없음';
  });
  await check('자막 이동·양끝 핸들 트림·시간 입력', async () => {
    await drag(page, blocks.first(), 52);
    assert.equal(
      Number(
        await page.getByRole('spinbutton', { name: '자막 시작 (초)', exact: true }).inputValue(),
      ),
      1.5,
    );
    assert.equal(
      Number(
        await page.getByRole('spinbutton', { name: '자막 끝 (초)', exact: true }).inputValue(),
      ),
      2.5,
    );
    await drag(
      page,
      blocks.first().getByRole('button', { name: '자막 끝 트림 핸들', exact: true }),
      26,
    );
    assert.equal(
      Number(
        await page.getByRole('spinbutton', { name: '자막 끝 (초)', exact: true }).inputValue(),
      ),
      3,
    );
    await drag(
      page,
      blocks.first().getByRole('button', { name: '자막 시작 트림 핸들', exact: true }),
      13,
    );
    assert.equal(
      Number(
        await page.getByRole('spinbutton', { name: '자막 시작 (초)', exact: true }).inputValue(),
      ),
      1.75,
    );
    await number(page, '자막 시작 (초)', 1);
    await number(page, '자막 끝 (초)', 2);
    return '1–2초로 편집 완료';
  });
  await check('복사/붙여넣기·인접 스냅·겹침 거부', async () => {
    await blocks.first().click();
    await page.keyboard.press('Control+c');
    await seek(page, 2.05);
    await page.keyboard.press('Control+v');
    assert.equal(await blocks.count(), 2);
    await drag(page, blocks.last(), -5);
    assert.equal(
      Number(
        await page.getByRole('spinbutton', { name: '자막 시작 (초)', exact: true }).inputValue(),
      ),
      2,
    );
    assert.equal(
      Number(
        await page.getByRole('spinbutton', { name: '자막 끝 (초)', exact: true }).inputValue(),
      ),
      3,
    );
    await drag(page, blocks.last(), -26);
    await page.getByRole('alert').filter({ hasText: '겹칩니다' }).waitFor();
    assert.equal(
      Number(
        await page.getByRole('spinbutton', { name: '자막 시작 (초)', exact: true }).inputValue(),
      ),
      2,
    );
    await page.getByRole('button', { name: '알림 닫기', exact: true }).click();
    return '1–2초 / 2–3초 인접 · 충돌 시 원본 유지';
  });
  await check('숫자 1 영상/자막 동시 분할·단일 undo/redo·경계 무시', async () => {
    await seek(page, 1.5);
    await page.locator('.timeline-panel h2').click();
    await page.keyboard.press('1');
    assert.equal(await page.locator('.timeline-clip').count(), 3);
    assert.equal(await blocks.count(), 3);
    await page.keyboard.press('1');
    assert.equal(await blocks.count(), 3);
    await page.keyboard.press('Control+z');
    assert.equal(await page.locator('.timeline-clip').count(), 2);
    assert.equal(await blocks.count(), 2);
    await page.keyboard.press('Control+Shift+z');
    assert.equal(await page.locator('.timeline-clip').count(), 3);
    assert.equal(await blocks.count(), 3);
    return '같은 1.5초 세로줄에서 영상·자막 동시 분할';
  });
  await check('숫자 2 선택 자막/영상 삭제·undo', async () => {
    await blocks.first().click();
    await page.keyboard.press('2');
    assert.equal(await blocks.count(), 2);
    assert.equal(await page.locator('.timeline-clip').count(), 3);
    await page.keyboard.press('Control+z');
    assert.equal(await blocks.count(), 3);
    await page.locator('.timeline-clip').first().click();
    await page.keyboard.press('2');
    assert.equal(await page.locator('.timeline-clip').count(), 2);
    assert.equal(await blocks.count(), 3);
    await page.keyboard.press('Control+z');
    assert.equal(await page.locator('.timeline-clip').count(), 3);
    return '선택 종류에 맞게 삭제';
  });
  await check('입력·수정키·대화상자 보호 및 숫자 단축키 화면 설명 없음', async () => {
    await blocks.first().click();
    const text = page.getByRole('textbox', { name: '자막 내용' });
    await text.fill('12');
    await text.press('1');
    await text.press('2');
    assert.equal(await blocks.count(), 3);
    assert.equal(await page.locator('.timeline-clip').count(), 3);
    await text.fill('v2 자막');
    await page.locator('.timeline-panel h2').click();
    await page.keyboard.press('Shift+Digit1');
    await page.keyboard.press('Shift+Digit2');
    assert.equal(await blocks.count(), 3);
    await page.getByRole('button', { name: '단축키 도움말', exact: true }).click();
    await page.keyboard.press('1');
    await page.keyboard.press('2');
    assert.equal(await blocks.count(), 3);
    assert.ok(!(await page.getByRole('dialog').innerText()).includes('숫자 1'));
    await page.keyboard.press('Escape');
    return '기존 UI·도움말 유지';
  });
  await check('재생 버튼 실제 프레임 진행·정지/재개·클립 경계', async () => {
    await seek(page, 0);
    await page.getByRole('button', { name: '재생', exact: true }).click();
    const first = await progress(page);
    await page.getByRole('button', { name: '일시 정지', exact: true }).click();
    const stopped = await snapshot(page);
    await page.waitForTimeout(250);
    assert.equal((await snapshot(page)).time, stopped.time);
    await page.getByRole('button', { name: '재생', exact: true }).click();
    await progress(page, 3);
    await page.getByRole('button', { name: '일시 정지', exact: true }).click();
    await seek(page, 1.8);
    await page.getByRole('button', { name: '재생', exact: true }).click();
    await page.waitForTimeout(900);
    const boundary = await snapshot(page);
    assert.ok(boundary.time > 2.1);
    assert.ok(boundary.color[2] > boundary.color[0] * 2);
    await page.getByRole('button', { name: '일시 정지', exact: true }).click();
    return { samples: first, boundary };
  });
  const references = [];
  for (const time of [1.25, 1.75, 2.5, 3.5]) {
    await seek(page, time);
    await page.waitForTimeout(450);
    const pixels = await page.getByTestId('preview-canvas').evaluate((canvas) => {
      const small = document.createElement('canvas');
      small.width = 160;
      small.height = 90;
      const ctx = small.getContext('2d');
      ctx.drawImage(canvas, 0, 0, 160, 90);
      return Array.from(ctx.getImageData(0, 0, 160, 90).data);
    });
    references.push({ time, pixels });
  }
  await check('자막 편집 저장 및 최종 출력/미리보기 일치', async () => {
    const [projectDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '저장', exact: true }).click(),
    ]);
    await projectDownload.saveAs('test-results/v2-project.json');
    const saved = JSON.parse(await readFile('test-results/v2-project.json', 'utf8'));
    assert.equal(saved.subtitles.length, 3);
    assert.deepEqual(
      saved.subtitles.map((c) => [c.startUs, c.endUs]).sort((a, b) => a[0] - b[0]),
      [
        [1_000_000, 1_500_000],
        [1_500_000, 2_000_000],
        [2_000_000, 3_000_000],
      ],
    );
    await page.getByRole('button', { name: '내보내기 ↗', exact: true }).click();
    await page.getByLabel('출력 해상도', { exact: true }).selectOption('480');
    await page.getByRole('button', { name: '렌더링 시작 ↗', exact: true }).click();
    const link = page.getByRole('link', { name: '영상 다운로드 ↓' });
    await link.waitFor({ timeout: 90000 });
    const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
    await download.saveAs('test-results/v2-export.mp4');
    const bytes = Array.from(await readFile('test-results/v2-export.mp4'));
    const comparison = await page.evaluate(
      async ({ url, bytes, references }) => (await import(url)).comparePreview(bytes, references),
      { url: harness, bytes, references },
    );
    assert.ok(
      comparison.every((c) => c.meanRgbError < 8),
      JSON.stringify(comparison),
    );
    await page.getByRole('button', { name: '닫기', exact: true }).last().click();
    await page.screenshot({ path: 'test-results/v2-editor.png', fullPage: true });
    return comparison;
  });
  await check('무음은 오디오 장치가 없어도 실제 영상 재생', async () => {
    const c = await browser.newContext();
    const p = await c.newPage();
    watch(p);
    await p.addInitScript(() => {
      window.AudioContext = class {
        constructor() {
          throw new Error('audio unavailable');
        }
      };
    });
    await p.goto(base);
    await p
      .getByTestId('import-input')
      .setInputFiles({ name: 'muted.mp4', mimeType: 'video/mp4', buffer: Buffer.from(muted) });
    await p.getByRole('button', { name: 'muted.mp4 타임라인에 추가', exact: true }).click();
    await p.getByRole('button', { name: '재생', exact: true }).click();
    const result = await progress(p);
    await c.close();
    return result;
  });
  await check('오디오 중단 감지·재시도·시작 대기 취소/시간 제한', async () => {
    const outcomes = [];
    for (const mode of ['suspended', 'pending']) {
      const c = await browser.newContext();
      const p = await c.newPage();
      watch(p);
      await p.addInitScript((mode) => {
        const Native = window.AudioContext;
        window.AudioContext = class extends Native {
          constructor(...args) {
            super(...args);
            window.v2Audio = this;
          }
          resume() {
            if (mode === 'pending') return new Promise(() => {});
            return super.resume().then(() => this.suspend());
          }
        };
        window.v2Restore = () => {
          window.AudioContext.prototype.resume = Native.prototype.resume;
        };
      }, mode);
      await p.goto(base);
      await p.getByTestId('import-input').setInputFiles('test-results/red.mp4');
      await p.getByRole('button', { name: 'red.mp4 타임라인에 추가', exact: true }).click();
      await p.getByRole('button', { name: '재생', exact: true }).click();
      if (mode === 'pending') {
        await p.getByRole('button', { name: '일시 정지', exact: true }).click();
        await p.getByRole('button', { name: '재생', exact: true }).click();
        await p.getByRole('alert').filter({ hasText: '지연' }).waitFor({ timeout: 7000 });
      } else await p.getByRole('alert').filter({ hasText: '오디오 장치' }).waitFor();
      assert.equal(await p.locator('.play-button').getAttribute('aria-label'), '재생');
      await p.evaluate(() => window.v2Restore());
      await p.getByRole('button', { name: '재생', exact: true }).click();
      const samples = await progress(p, 3);
      await p.evaluate(() => window.v2Audio.suspend());
      await p.getByRole('alert').filter({ hasText: '중단' }).waitFor();
      outcomes.push({ mode, samples, retry: true });
      await c.close();
    }
    return outcomes;
  });
  assert.deepEqual(report.errors, []);
  report.success = true;
} catch (error) {
  report.success = false;
  report.failure = error.stack;
  await page.screenshot({ path: 'test-results/v2-failure.png', fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile('test-results/v2-report.json', JSON.stringify(report, null, 2));
  await browser.close();
}
