import { chromium } from 'playwright';
import { startStaticTestServer } from './static-test-server.mjs';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const server = await startStaticTestServer('dist', ['/']);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { checks: [], errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.goto(server.origin);
  await page.getByTestId('import-input').setInputFiles('test-results/red.mp4');
  const insert = page.getByRole('button', { name: 'red.mp4 타임라인에 추가', exact: true });
  await insert.click();
  await insert.click();
  await page.locator('.timeline-clip').first().click();
  await page
    .locator('.timeline-clip')
    .nth(1)
    .click({ modifiers: ['Control'] });
  await page.keyboard.press('3');
  assert.equal(await page.locator('.timeline-clip').count(), 1);
  await page.keyboard.press('Control+z');
  assert.equal(await page.locator('.timeline-clip').count(), 2);
  await page.locator('.timeline-clip').first().click();
  await page
    .locator('.timeline-clip')
    .nth(1)
    .click({ modifiers: ['Control'] });
  await page.getByRole('textbox', { name: '프로젝트 이름', exact: true }).press('3');
  assert.equal(await page.locator('.timeline-clip').count(), 2);
  await page.locator('.timeline-panel h2').click();
  await page.keyboard.press('Shift+Digit3');
  assert.equal(await page.locator('.timeline-clip').count(), 2);
  await page.getByRole('button', { name: '단축키 도움말', exact: true }).click();
  await page.keyboard.press('3');
  assert.equal(await page.locator('.timeline-clip').count(), 2);
  await page.keyboard.press('Escape');
  report.checks.push('숫자 3 합치기·undo·입력/수정키/대화상자 보호');
  await page.getByRole('button', { name: '처음으로', exact: true }).click();
  await page.getByRole('tab', { name: /자막/ }).click();
  const add = page.getByRole('button', { name: '＋ 추가', exact: true });
  await add.click();
  const before = await page.locator('.workspace').boundingBox();
  await add.click();
  const toast = page.locator('.toast[role="alert"]');
  await toast.waitFor();
  assert.ok((await toast.innerText()).includes('겹칩니다'));
  const after = await page.locator('.workspace').boundingBox();
  assert.deepEqual(after, before);
  assert.equal(
    await page.locator('.toast-region').evaluate((el) => getComputedStyle(el).position),
    'fixed',
  );
  await page.getByRole('button', { name: '알림 닫기', exact: true }).click();
  assert.equal(await toast.count(), 0);
  await add.click();
  await toast.waitFor();
  await toast.waitFor({ state: 'hidden', timeout: 8000 });
  report.checks.push('겹침 토스트·화면 배치 불변·직접 닫기·6초 자동 닫기');
  assert.deepEqual(report.errors, []);
  report.success = true;
  console.log('PASS', JSON.stringify(report));
} catch (e) {
  report.success = false;
  report.failure = e.stack;
  console.error(e);
  process.exitCode = 1;
} finally {
  await writeFile('test-results/v7-report.json', JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}
