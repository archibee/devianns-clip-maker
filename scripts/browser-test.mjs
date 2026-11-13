import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.TEST_URL || 'http://127.0.0.1:5173/ssg-clip-maker/';
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [],
  requests = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => {
  if (/^https?:/.test(request.url()) && !request.url().startsWith(new URL(base).origin))
    requests.push(request.url());
});
const report = {
  date: new Date().toISOString(),
  base,
  checks: [],
  errors,
  externalRequests: requests,
};
async function check(name, run) {
  const start = Date.now();
  const result = await run();
  const summary = Array.isArray(result) && result.length > 100 ? `${result.length} bytes` : result;
  report.checks.push({ name, ms: Date.now() - start, result: summary });
  console.log(`PASS ${name}`, summary ?? '');
  return result;
}
try {
  await page.goto(base);
  await page.getByRole('heading', { name: '미디어', exact: true }).waitFor();
  const harness = `${base}tests/browser-harness.ts`;
  // Vite는 base 아래의 저장소 테스트 모듈을 개발 중에만 제공한다.
  report.capabilities = await page.evaluate(
    async (url) => (await import(url)).capabilities(),
    harness,
  );
  console.log('CAPABILITIES', report.capabilities);
  const red = await check('합성 영상/동기 오디오 fixture 생성', () =>
    page.evaluate(async (url) => (await import(url)).fixture(), harness),
  );
  const blue = await page.evaluate(
    async (url) => (await import(url)).fixture({ color: '#326be0', rate: 44100, vfr: true }),
    harness,
  );
  await writeFile('test-results/red.mp4', Buffer.from(red));
  await writeFile('test-results/blue.mp4', Buffer.from(blue));
  await check('임포트·에셋 목록·버튼 및 우클릭 삽입', async () => {
    await page
      .getByTestId('import-input')
      .setInputFiles(['test-results/red.mp4', 'test-results/blue.mp4']);
    await page
      .getByRole('button', { name: 'red.mp4 타임라인에 추가', exact: true })
      .waitFor({ timeout: 30000 });
    await page
      .locator('.asset-card')
      .filter({ hasText: 'red.mp4' })
      .dragTo(page.locator('.track-bed'), { targetPosition: { x: 150, y: 20 } });
    await page.locator('.asset-card').filter({ hasText: 'blue.mp4' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: '타임라인에 삽입' }).click();
    assert.equal(await page.locator('.timeline-clip').count(), 2);
    return '2 clips';
  });
  await check('시킹·분할·트림·재배열·실행 취소', async () => {
    const seek = page.getByRole('spinbutton', { name: '이동 (초)', exact: true });
    await seek.fill('1');
    await seek.press('Enter');
    await page.locator('h2').filter({ hasText: '타임라인' }).click();
    await page.keyboard.press('s');
    assert.equal(await page.locator('.timeline-clip').count(), 3);
    await page.locator('.timeline-clip').first().click();
    const out = page.getByRole('spinbutton', { name: '원본 끝 (초)', exact: true });
    await out.fill('0.8');
    await out.press('Enter');
    await page.getByRole('button', { name: '선택 클립 오른쪽 이동', exact: true }).click();
    await page.getByRole('button', { name: '실행 취소', exact: true }).click();
    await page.getByRole('button', { name: '다시 실행', exact: true }).click();
    const trimHandle = page.locator('.timeline-clip.selected .trim-handle.in');
    const handleBox = await trimHandle.boundingBox();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 20);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + 12, handleBox.y + 20, { steps: 5 });
    await page.mouse.up();
    assert.ok(
      Number(
        await page.getByRole('spinbutton', { name: '원본 시작 (초)', exact: true }).inputValue(),
      ) > 0,
    );
    await page.getByRole('button', { name: '실행 취소', exact: true }).click();
    await page
      .locator('.timeline-clip')
      .first()
      .dragTo(page.locator('.track-bed'), { targetPosition: { x: 300, y: 20 } });
    assert.ok((await page.locator('.timeline-clip').last().innerText()).includes('blue.mp4'));
    await page.getByRole('button', { name: '실행 취소', exact: true }).click();
    return '3 clips, linked source ranges';
  });
  await check('자막·미리보기·키보드 포커스 보호', async () => {
    await page.getByRole('tab', { name: /자막/ }).click();
    await page.getByRole('button', { name: '＋ 추가', exact: true }).click();
    await page.getByRole('textbox', { name: '자막 내용' }).fill('한글 클립 테스트\nSSG Clip Maker');
    await page.getByRole('textbox', { name: '자막 내용' }).press('s');
    assert.equal(await page.locator('.timeline-clip').count(), 3);
    await page.getByRole('textbox', { name: '자막 내용' }).fill('한글 클립 테스트\nSSG Clip Maker');
    const seek = page.getByRole('spinbutton', { name: '이동 (초)', exact: true });
    await seek.fill('1.2');
    await seek.press('Enter');
    await page.waitForTimeout(1500);
    const pixel = await page
      .getByTestId('preview-canvas')
      .evaluate((canvas) => Array.from(canvas.getContext('2d').getImageData(400, 100, 1, 1).data));
    assert.ok(pixel[0] + pixel[1] + pixel[2] > 40);
    return pixel;
  });
  await check('미리보기 재생·정지', async () => {
    await page.getByRole('button', { name: '처음으로', exact: true }).click();
    await page.keyboard.press('Space');
    await page.getByRole('button', { name: '일시 정지', exact: true }).waitFor();
    await page.waitForTimeout(800);
    await page.keyboard.press('Space');
    assert.ok(
      Number(await page.getByRole('spinbutton', { name: '이동 (초)', exact: true }).inputValue()) >
        0.1,
    );
    return 'audio-clock advanced';
  });
  await page.screenshot({ path: 'test-results/editor.png', fullPage: true });
  const references = [];
  for (const time of [0.2, 1.2, 2.2]) {
    const seek = page.getByRole('spinbutton', { name: '이동 (초)', exact: true });
    await seek.fill(String(time));
    await seek.press('Enter');
    await page.waitForTimeout(600);
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
  await check('UI 최종 편집 상태 내보내기·다운로드', async () => {
    await page.getByRole('button', { name: '내보내기 ↗', exact: true }).click();
    await page.getByLabel('출력 해상도', { exact: true }).selectOption('480');
    await page.getByRole('button', { name: '렌더링 시작 ↗', exact: true }).click();
    const download = page.getByRole('link', { name: '영상 다운로드 ↓' });
    await download.waitFor({ timeout: 90000 });
    const [event] = await Promise.all([page.waitForEvent('download'), download.click()]);
    await event.saveAs('test-results/ui-export.mp4');
    const bytes = Array.from(await readFile('test-results/ui-export.mp4'));
    const result = await page.evaluate(
      async ({ url, bytes }) => (await import(url)).inspect(bytes),
      { url: harness, bytes },
    );
    assert.ok(result.audioCodec, '오디오 트랙 보존');
    assert.ok(Math.abs(result.videoEnd - 3.8) < 1 / 30 + 0.002, `출력 길이 ${result.videoEnd}`);
    assert.ok(
      result.avErrorsMs.length >= 3 && Math.max(...result.avErrorsMs) < 50,
      '컷/재배열 후 A/V 동기 오차 50ms 이내',
    );
    const comparison = await page.evaluate(
      async ({ url, bytes, refs }) => (await import(url)).comparePreview(bytes, refs),
      { url: harness, bytes, refs: references },
    );
    assert.ok(
      comparison.every((c) => c.meanRgbError < 8),
      `미리보기/출력 오차: ${JSON.stringify(comparison)}`,
    );
    await page.getByRole('button', { name: '닫기', exact: true }).last().click();
    return { ...result, comparison };
  });
  if (process.env.TEST_MATRIX !== '0') {
    for (const resolution of [480, 720, 1080])
      for (const fps of [30, 45, 60]) {
        await check(`원본 출력 ${resolution}p ${fps}fps`, async () => {
          const result = await page.evaluate(
            async ({ url, files, settings }) => (await import(url)).runExport(files, settings),
            {
              url: harness,
              files: [
                { bytes: red, name: 'red.mp4' },
                { bytes: blue, name: 'blue.mp4' },
              ],
              settings: { resolution, fps, format: 'mp4' },
            },
          );
          assert.ok(result.supported, result.reason);
          assert.equal(result.info.height, resolution);
          assert.ok(Math.abs(result.info.videoEnd - 4) <= 1 / fps + 0.002);
          assert.ok(result.info.audioCodec);
          assert.ok(Math.abs(result.info.fps - fps) < 0.5);
          assert.ok(
            result.info.avErrorsMs.length === 4 && Math.max(...result.info.avErrorsMs) < 50,
          );
          return result.info;
        });
      }
  }
  await check('100회 시킹·최신 요청 프레임·50% 크기', async () => {
    const result = await page.evaluate(
      async ({ url, files }) => (await import(url)).stressPlayback(files),
      {
        url: harness,
        files: [
          { bytes: red, name: 'red.mp4' },
          { bytes: blue, name: 'blue.mp4' },
        ],
      },
    );
    assert.deepEqual(result.failures, []);
    assert.equal(result.width, 960);
    assert.equal(result.height, 540);
    assert.ok(result.pixel[2] > result.pixel[0] * 2, '마지막 시킹은 파란 클립이어야 함');
    return result;
  });
  await check('취소 후 재시도·연속 3회 출력·직접 저장·저장 실패·원본 누락', async () => {
    const result = await page.evaluate(
      async ({ url, bytes }) => (await import(url)).stressExport(bytes),
      { url: harness, bytes: red },
    );
    assert.deepEqual(result.states, [
      'cancelled',
      'completed',
      'completed',
      'completed',
      'error',
      'error',
    ]);
    assert.ok(result.disk.size > 1000 && result.disk.audioCodec === 'aac');
    assert.ok(result.memory[2] - result.memory[0] < 64 * 1024 * 1024);
    return result;
  });
  await check('무음·회전·다른 해상도·WebM 대안', async () => {
    const muted = await page.evaluate(
      async (url) =>
        (await import(url)).fixture({ audio: false, width: 320, height: 240, rotated: true }),
      harness,
    );
    const result = await page.evaluate(
      async ({ url, bytes }) =>
        (await import(url)).runExport([{ bytes, name: 'rotated.mp4' }], {
          resolution: 480,
          fps: 45,
          format: 'webm',
        }),
      { url: harness, bytes: muted },
    );
    assert.ok(result.supported, result.reason);
    assert.equal(result.info.audioCodec, undefined);
    assert.equal(result.info.videoEnd, 2);
    return result.info;
  });
  await check('손상 파일 오류 안내', async () => {
    await page.getByTestId('import-input').setInputFiles({
      name: 'broken.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('not a video'),
    });
    await page.getByRole('alert').filter({ hasText: 'broken.mp4' }).waitFor();
    await page.getByRole('button', { name: '알림 닫기' }).click();
    return 'invalid container rejected';
  });
  await check('자동 저장 복구·누락 원본·재연결', async () => {
    await page.waitForTimeout(1000);
    await page.reload();
    await page.getByRole('button', { name: '편집 복구', exact: true }).click();
    assert.equal(await page.locator('.timeline-clip').count(), 3);
    assert.equal(
      await page.getByRole('button', { name: '원본 다시 연결', exact: true }).count(),
      2,
    );
    await page.getByRole('button', { name: '원본 다시 연결', exact: true }).first().click();
    await page.getByTestId('reconnect-input').setInputFiles('test-results/red.mp4');
    await page.getByRole('button', { name: 'red.mp4 타임라인에 추가', exact: true }).waitFor();
    return 'restored 3 clips and reconnected source';
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  report.success = true;
} catch (error) {
  report.success = false;
  report.failure = error.stack;
  await page.screenshot({ path: 'test-results/failure.png', fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile('test-results/browser-report.json', JSON.stringify(report, null, 2));
  await browser.close();
}
