import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = {};
try {
  const page = await browser.newPage();
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5174/');
  const source = JSON.parse(await readFile('test-results/v6-project-1.json', 'utf8'));
  const t = { fit: 'contain', scale: 1, x: 0, y: 0 };
  const project = {
    ...source,
    clips: [
      {
        id: 'merged-av',
        assetId: source.assets[0].id,
        startUs: 1_000_000,
        inUs: 500_000,
        outUs: 3_500_000,
        transform: t,
        parts: source.assets.map((a) => ({
          assetId: a.id,
          inUs: 0,
          outUs: 2_000_000,
          transform: t,
        })),
      },
    ],
    subtitles: [
      {
        id: 'tail',
        startUs: 4_000_000,
        endUs: 5_000_000,
        text: '끝 자막',
        size: 0.05,
        x: 0.5,
        y: 0.9,
        color: '#ffffff',
        background: '#000000',
      },
    ],
  };
  const files = await Promise.all(
    ['red.mp4', 'blue.mp4'].map(async (name) => ({
      name,
      bytes: Array.from(await readFile('test-results/' + name)),
    })),
  );
  const result = await page.evaluate(
    async ({ project, files }) => {
      const h = await import('/tests/browser-harness.ts');
      const out = await h.runExport(files, { resolution: 480, fps: 45, format: 'mp4' }, project);
      return {
        ...out,
        rms: out.bytes
          ? await h.silenceRms(out.bytes, [
              [0.2, 0.8],
              [4.2, 4.8],
            ])
          : [],
      };
    },
    { project, files },
  );
  assert.ok(result.supported);
  assert.ok(result.info.audioCodec);
  assert.equal(result.info.videoEnd, 5);
  assert.equal(result.info.avErrorsMs.length, 3);
  assert.ok(result.info.avErrorsMs.every((n) => n < 50));
  assert.ok(result.rms.every((n) => n >= 0 && n < 0.001));
  report.success = true;
  report.info = result.info;
  report.silenceRms = result.rms;
  console.log('PASS merged trim + gaps + subtitle tail A/V', JSON.stringify(report));
} catch (e) {
  report.success = false;
  report.failure = e.stack;
  console.error(e);
  process.exitCode = 1;
} finally {
  await writeFile('test-results/v6-merged-report.json', JSON.stringify(report, null, 2));
  await browser.close();
}
