import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { startStaticTestServer } from './static-test-server.mjs';

// 기존 재배포 가능한 합성 fixture 사용. 사용자 영상은 읽지 않는다.
const server = await startStaticTestServer('dist', ['/devianns-clip-maker/']);
let browser;
try {
  browser = await chromium.launch({
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(server.origin + '/devianns-clip-maker/');
  assert.equal(await page.locator('.timeline-row').count(), 1);
  await page
    .getByTestId('import-input')
    .setInputFiles(['test-results/red.mp4', 'test-results/blue.mp4']);
  await page.getByRole('button', { name: 'red.mp4 타임라인에 추가', exact: true }).click();
  await page.getByRole('button', { name: '＋ 행 추가', exact: true }).click();
  await page.getByRole('button', { name: 'blue.mp4 타임라인에 추가', exact: true }).click();
  await page.getByRole('button', { name: '＋ 행 추가', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  const project = JSON.parse(await readFile(await (await downloadPromise).path(), 'utf8'));
  assert.equal(project.clips.length, 2);
  project.clips[1].transform.scale = 0.5;
  project.laneCount = 4;
  project.subtitles = [2, 3].map((lane, i) => ({
    id: `test-cue-${i}`,
    lane,
    startUs: 0,
    endUs: 2_000_000,
    text: i ? 'RIGHT' : 'LEFT',
    size: 0.05,
    color: '#ffffff',
    background: '#000000',
    x: i ? 0.8 : 0.2,
    y: 0.85,
  }));
  await page
    .getByTestId('project-input')
    .setInputFiles({
      name: 'timeline.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await page.waitForFunction(() => document.querySelectorAll('.timeline-row').length === 4);
  await page.locator('.timeline-clip').first().click();
  await page.keyboard.press('Control+x');
  await page.waitForFunction(() => document.querySelectorAll('.timeline-clip').length === 1);
  await page.locator('.lane-label').first().click();
  await page.keyboard.press('Control+v');
  await page.waitForFunction(() => document.querySelectorAll('.timeline-clip').length === 2);
  await page.locator('.subtitle-block').first().click();
  await page.keyboard.press('Control+a');
  assert.equal(await page.locator('.subtitle-block.selected').count(), 2);
  await page.keyboard.press('Control+x');
  await page.waitForFunction(() => document.querySelectorAll('.subtitle-block').length === 0);
  await page.locator('.lane-label').nth(2).click();
  await page.keyboard.press('Control+v');
  await page.waitForFunction(() => document.querySelectorAll('.subtitle-block').length === 2);
  await page.getByLabel('재생 위치', { exact: true }).fill('500000');
  await page.waitForFunction(() => {
    const c = document.querySelector('[data-testid="preview-canvas"]'),
      ctx = c.getContext('2d');
    const outer = ctx.getImageData(100, 350, 1, 1).data,
      inner = ctx.getImageData(500, 350, 1, 1).data;
    return outer[0] > outer[2] * 2 && inner[2] > inner[0] * 2;
  });
  await page.getByRole('button', { name: '내보내기 ↗', exact: true }).click();
  await page.getByLabel('출력 해상도', { exact: true }).selectOption('480');
  await page.getByRole('button', { name: '렌더링 시작 ↗', exact: true }).click();
  const link = page.getByRole('link', { name: '영상 다운로드 ↓' });
  await link.waitFor({ timeout: 60000 });
  const downloaded = page.waitForEvent('download');
  await link.click();
  const bytes = await readFile(await (await downloaded).path());
  const pixels = await page.evaluate(async (bytes) => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'video/mp4' }));
    const video = document.createElement('video');
    video.muted = true;
    video.src = url;
    try {
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = reject;
      });
      await new Promise((resolve) => {
        video.onseeked = resolve;
        video.currentTime = 0.5;
      });
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      const outer = Array.from(ctx.getImageData(100, 300, 1, 1).data),
        inner = Array.from(ctx.getImageData(500, 300, 1, 1).data);
      const white = (x) => {
        const data = ctx.getImageData(x, 390, 140, 40).data;
        let n = 0;
        for (let i = 0; i < data.length; i += 4)
          if (data[i] > 220 && data[i + 1] > 220 && data[i + 2] > 220) n++;
        return n;
      };
      return { outer, inner, left: white(100), right: white(610) };
    } finally {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    }
  }, Array.from(bytes));
  assert.ok(pixels.outer[0] > pixels.outer[2] * 2 && pixels.inner[2] > pixels.inner[0] * 2);
  assert.ok(pixels.left > 10 && pixels.right > 10, '다른 행의 자막 두 개가 출력에 함께 표시됨');
  const input = new Input({ source: new BlobSource(new Blob([bytes])), formats: ALL_FORMATS });
  try {
    assert.ok(await input.getPrimaryVideoTrack());
    const audio = await input.getPrimaryAudioTrack();
    assert.ok(audio);
    const peak = await page.evaluate(async (bytes) => {
      const context = new AudioContext();
      try {
        const decoded = await context.decodeAudioData(new Uint8Array(bytes).buffer);
        let peak = 0;
        for (const value of decoded.getChannelData(0)) peak = Math.max(peak, Math.abs(value));
        return peak;
      } finally {
        await context.close();
      }
    }, Array.from(bytes));
    assert.ok(peak > 0.5, `겹치는 원본 오디오 합산: peak=${peak}`);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        status: 'PASS',
        checks: [
          '행 추가',
          '영상/다중 자막 잘라내기·붙여넣기',
          '미리보기 레이어',
          '소리 포함 실제 MP4 출력',
        ],
        peak,
        browser: await browser.version(),
      }),
    );
  } finally {
    input.dispose();
  }
} finally {
  await browser?.close();
  await server.close();
}
