import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve('dist');
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const name = decodeURIComponent(url.pathname).replace(/^\/repo\//, '');
    const file = resolve(root, name === '' ? 'index.html' : name);
    if (!file.startsWith(root + sep)) throw new Error('outside dist');
    const data = await readFile(file);
    response.setHeader('content-type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream');
    response.end(data);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/repo/`;
let browser;
try {
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
  await mkdir('test-results/startup', { recursive: true });
  for (const width of [1440, 768, 390]) {
    const context = await browser.newContext({viewport: {width, height: 850}, reducedMotion: 'reduce'});
    const page = await context.newPage();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/assets/index-*.js', async route => { await gate; await route.continue(); });
    await page.goto(url, {waitUntil: 'commit'});
    await page.locator('#boot-screen').waitFor({state: 'visible'});
    await page.getByRole('progressbar', {name: '편집기 로딩'}).waitFor();
    assert.equal(await page.locator('.boot-logo').count(), 1);
    assert.equal(await page.locator('.boot-screen').evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(16, 16, 16)');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({path: `test-results/startup/loading-${width}.png`});
    release();
    await page.locator('#boot-screen').waitFor({state: 'hidden'});
    await page.getByRole('heading', {name: '미디어', exact: true}).waitFor();
    assert.equal(await page.locator('#boot-screen').getAttribute('data-state'), 'ready');
    await context.close();
    console.log(`PASS loading -> editor at ${width}px and subdirectory deployment`);
  }
  for (const scenario of ['http500', 'css', 'runtime', 'promise', 'timeout']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    if (scenario === 'css') await page.route('**/assets/index-*.css', route => route.fulfill({status: 404, body: ''}));
    else await page.route('**/assets/index-*.js', route => route.fulfill({
      status: scenario === 'http500' ? 500 : 200,
      contentType: 'text/javascript',
      body: scenario === 'runtime' ? 'throw new Error("startup fixture");' : scenario === 'promise' ? 'Promise.reject(new Error("startup fixture"));' : '',
    }));
    if (scenario === 'timeout') await page.addInitScript(() => {
      const original = window.setTimeout;
      window.setTimeout = (fn, delay, ...args) => original(fn, delay === 45000 ? 20 : delay, ...args);
    });
    await page.goto(url);
    await page.locator('#boot-screen[data-state="error"]').waitFor();
    assert.equal(await page.locator('#boot-status').getAttribute('role'), 'alert');
    await page.getByRole('button', {name: '다시 시도', exact: true}).waitFor();
    if (scenario === 'http500') {
      await page.screenshot({path: 'test-results/startup/error.png'});
      await page.unroute('**/assets/index-*.js');
      await page.getByRole('button', {name: '다시 시도', exact: true}).click();
      await page.locator('#boot-screen').waitFor({state: 'hidden'});
    }
    await context.close();
    console.log(`PASS startup error: ${scenario}`);
  }
  const context = await browser.newContext({javaScriptEnabled: false});
  const page = await context.newPage();
  await page.goto(url);
  await page.locator('noscript p').waitFor();
  assert.match(await page.locator('noscript p').innerText(), /JavaScript/);
  assert.equal(await page.locator('.boot-progress').isVisible(), false);
  await context.close();
  console.log('PASS JavaScript-disabled guidance');
} finally { await browser?.close(); server.close(); }
