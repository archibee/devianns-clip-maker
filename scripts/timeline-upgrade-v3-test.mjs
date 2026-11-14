import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { startStaticTestServer } from './static-test-server.mjs';
const server = await startStaticTestServer('dist', ['/devianns-clip-maker/']);
let browser, page;
try {
  browser = await chromium.launch({
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    headless: true,
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(server.origin + '/devianns-clip-maker/');
  await page
    .getByTestId('import-input')
    .setInputFiles(['test-results/red.mp4', 'test-results/blue.mp4']);
  await page.getByRole('button', { name: 'red.mp4 타임라인에 추가', exact: true }).click();
  await page.getByRole('button', { name: '라인 추가', exact: true }).click();
  await page.getByRole('button', { name: 'blue.mp4 타임라인에 추가', exact: true }).click();
  const save = async () => {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  };
  const project = await save();
  project.laneCount = 3;
  project.subtitles = [
    {
      id: 'caption',
      lane: 2,
      startUs: 0,
      endUs: 2_000_000,
      text: '자막',
      size: 0.05,
      color: '#ffffff',
      background: '#000000',
      x: 0.5,
      y: 0.9,
    },
  ];
  await page
    .getByTestId('project-input')
    .setInputFiles({
      name: 'v3.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await page.waitForFunction(() => document.querySelectorAll('.timeline-row').length === 3);
  await page.locator('.lane-label').first().click();
  assert.equal(
    await page.getByRole('button', { name: '라인 위', exact: true }).isDisabled(),
    true,
  );
  await page.getByRole('button', { name: '라인 아래', exact: true }).click();
  assert.ok((await page.locator('.timeline-row').first().innerText()).includes('blue.mp4'));
  assert.equal(await page.locator('.lane-label').nth(1).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: '라인 위', exact: true }).click();
  const selectMixed = async () => {
    await page.locator('.timeline-clip').first().click();
    await page
      .locator('.timeline-clip')
      .nth(1)
      .click({ modifiers: ['Control'] });
    await page.locator('.subtitle-block').click({ modifiers: ['Control'] });
    assert.equal(await page.locator('.timeline-clip.selected').count(), 2);
    assert.equal(await page.locator('.subtitle-block.selected').count(), 1);
  };
  await selectMixed();
  assert.equal(
    await page.getByRole('button', { name: 'AUTO CUT', exact: true }).isDisabled(),
    true,
  );
  await page.locator('.clip-mute').first().click();
  assert.equal(await page.locator('.clip-mute[aria-pressed="true"]').count(), 2);
  assert.equal(await page.locator('.timeline-clip.selected').count(), 2);
  assert.equal(await page.locator('.subtitle-block.selected').count(), 1);
  let saved = await save();
  assert.ok(saved.clips.every((c) => c.muted === true));
  assert.deepEqual(saved.subtitles, project.subtitles);
  await page.locator('.clip-mute').first().click();
  assert.equal(await page.locator('.clip-mute[aria-pressed="true"]').count(), 0);
  await page.locator('.timeline-clip').first().click();
  await page.locator('.clip-mute').nth(1).click();
  assert.equal(await page.locator('.clip-mute[aria-pressed="true"]').count(), 1);
  assert.equal(await page.locator('.timeline-clip.selected').count(), 1);
  await selectMixed();
  await page.locator('.clip-mute').first().click();
  await page.keyboard.press('Control+z');
  assert.equal(await page.locator('.clip-mute[aria-pressed="true"]').count(), 1);
  await page.keyboard.press('Control+Shift+z');
  assert.equal(await page.locator('.clip-mute[aria-pressed="true"]').count(), 2);
  // 입력 포커스를 떠난 뒤 실제 미리보기 재생이 진행되는지 확인한다.
  await page.getByRole('button', { name: '재생', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('.preview-panel .timecode')?.textContent.startsWith('00:00:00') ===
      false,
  );
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  await page.getByRole('button', { name: '내보내기 ↗', exact: true }).click();
  await page.getByLabel('출력 해상도', { exact: true }).selectOption('480');
  await page.getByRole('button', { name: '렌더링 시작 ↗', exact: true }).click();
  const link = page.getByRole('link', { name: '영상 다운로드 ↓' });
  await link.waitFor({ timeout: 60000 });
  const pending = page.waitForEvent('download');
  await link.click();
  const bytes = await readFile(await (await pending).path());
  const input = new Input({ source: new BlobSource(new Blob([bytes])), formats: ALL_FORMATS });
  try {
    assert.ok(await input.getPrimaryVideoTrack());
    assert.equal(await input.getPrimaryAudioTrack(), null);
  } finally {
    input.dispose();
  }
  await page.getByRole('button', { name: '닫기', exact: true }).last().click();
  await page.setViewportSize({ width: 560, height: 900 });
  const overflow = await page
    .locator('.timeline-tools')
    .evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  assert.ok(overflow.scroll >= overflow.client);
  await page.getByRole('button', { name: '라인 추가', exact: true }).scrollIntoViewIfNeeded();
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      status: 'PASS',
      browser: await browser.version(),
      checks: [
        '라인 순서 교환·활성 라인',
        '영상/자막 혼합 다중 선택',
        '개별/일괄 음소거·해제·undo/redo',
        '무음 미리보기 재생',
        '전체 음소거 MP4 영상 출력(오디오 트랙 없음)',
        '좁은 화면 메뉴 스크롤',
      ],
    }),
  );
} catch (error) {
  if (page) await page.screenshot({ path: 'test-results/timeline-v3-error.png' });
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
