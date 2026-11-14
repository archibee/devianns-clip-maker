import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startStaticTestServer } from './static-test-server.mjs';

// 기존 합성 fixture만 사용하며 실제 Silero Worker로 선택 블록을 분석한다.
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
  project.clips.forEach((c) => (c.startUs = 5_000_000));
  project.clips.push({ ...project.clips[0], id: 'tail', startUs: 7_000_000 });
  project.subtitles = [
    {
      id: 'old',
      lane: 2,
      startUs: 5_000_000,
      endUs: 9_000_000,
      text: '기존 자막',
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
      name: 'v2.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await page.waitForFunction(() => document.querySelectorAll('.timeline-clip').length === 3);
  const button = page.getByRole('button', { name: 'AUTO CUT', exact: true });
  await page.locator('.timeline-clip').first().click();
  assert.equal(await button.isEnabled(), true);
  await page
    .locator('.timeline-clip')
    .nth(1)
    .click({ modifiers: ['Control'] });
  assert.equal(await button.isDisabled(), true);
  await page.locator('.timeline-clip').first().click();
  await button.click();
  const modal = page.getByRole('dialog', { name: 'Auto Cut · 음성 기반 자동 컷편집' });
  await modal.waitFor();
  console.log('Auto Cut 모달 열림');
  assert.equal(await modal.getByText('기존 자막 제외', { exact: false }).count(), 0);
  await modal.getByLabel('새 자막 자동 생성', { exact: true }).check();
  await modal.getByRole('button', { name: '음성 분석 시작', exact: true }).click();
  const complete = modal.getByRole('button', { name: '완료 · 타임라인에 적용', exact: true });
  await page.waitForFunction(
    () => {
      const buttons = [...document.querySelectorAll('.auto-cut-dialog button')];
      return buttons.some((b) => b.textContent.trim() === '완료 · 타임라인에 적용' && !b.disabled);
    },
    {},
    { timeout: 60000 },
  );
  console.log('실제 분석 완료');
  await complete.click();
  await modal.waitFor({ state: 'detached' });
  const applied = await save();
  assert.equal(applied.laneCount, 4);
  for (const id of [project.clips[1].id, 'tail'])
    assert.deepEqual(
      applied.clips.find((c) => c.id === id),
      project.clips.find((c) => c.id === id),
    );
  assert.deepEqual(applied.subtitles[0], project.subtitles[0]);
  const cuts = applied.clips.filter((c) => !project.clips.some((old) => old.id === c.id));
  const cues = applied.subtitles.filter((c) => c.id !== 'old');
  assert.ok(cuts.length > 0);
  assert.equal(cues.length, cuts.length);
  assert.equal(cuts[0].startUs, 5_000_000);
  assert.ok(cues.every((c) => c.lane === 3 && c.text === ''));
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => document.querySelectorAll('.timeline-row').length === 3);
  await page.locator('.lane-label').first().click();
  await page.getByRole('button', { name: '라인 삭제', exact: true }).click();
  let confirm = page.getByRole('dialog', { name: '라인 T1 삭제' });
  await confirm.waitFor();
  await confirm.getByRole('button', { name: '취소', exact: true }).click();
  assert.equal(await page.locator('.timeline-clip').count(), 3);
  await page.getByRole('button', { name: '라인 삭제', exact: true }).click();
  confirm = page.getByRole('dialog', { name: '라인 T1 삭제' });
  await confirm.getByRole('button', { name: '확인 · 라인 삭제', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.timeline-clip').length === 1);
  assert.equal(await page.locator('.timeline-row').count(), 2);
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => document.querySelectorAll('.timeline-clip').length === 3);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      status: 'PASS',
      browser: await browser.version(),
      cuts: cuts.length,
      checks: [
        '다중 라인 단일 선택 Auto Cut 활성화',
        '실제 Silero 분석·새 자막 라인 적용',
        '다른 영상/기존 자막 절대시간 보존',
        'Auto Cut undo',
        '라인 삭제 취소/확인/undo',
      ],
    }),
  );
} catch (error) {
  if (page) {
    console.log(await page.locator('body').innerText());
    await page.screenshot({ path: 'test-results/timeline-v2-error.png' });
  }
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
