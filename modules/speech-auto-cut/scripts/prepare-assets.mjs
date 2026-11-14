import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const source = join(root, 'modules/speech-auto-cut/assets'),
  dest = join(root, 'public/speech-auto-cut');
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
const model = await readFile(join(source, 'silero_vad.onnx'));
if (createHash('sha256').update(model).digest('hex') !== manifest.silero.sha256)
  throw new Error('Auto Cut 모델 해시가 일치하지 않습니다.');
const runtime = join(root, 'node_modules/onnxruntime-web');
const runtimePackage = JSON.parse(await readFile(join(runtime, 'package.json'), 'utf8'));
if (runtimePackage.version !== manifest.onnxruntime.version)
  throw new Error('Auto Cut 런타임 버전 불일치. npm ci를 실행하세요.');
await mkdir(dest, { recursive: true });
for (const name of [
  'ort.wasm.min.mjs',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
])
  await copyFile(join(runtime, 'dist', name), join(dest, name));
await copyFile(join(source, 'silero_vad.onnx'), join(dest, 'silero_vad.onnx'));
await copyFile(join(source, 'manifest.json'), join(dest, 'manifest.json'));
const notices = [];
for (const name of ['SILERO_LICENSE.txt', 'ORT_LICENSE.txt', 'ORT_ThirdPartyNotices.txt'])
  notices.push(`=== ${name} ===\n${await readFile(join(source, name), 'utf8')}`);
const visited = new Set();
async function collect(directory) {
  if (visited.has(directory)) return;
  visited.add(directory);
  const path = join(directory, 'package.json'),
    pkg = JSON.parse(await readFile(path, 'utf8'));
  for (const entry of await readdir(directory, { withFileTypes: true }))
    if (entry.isFile() && /^(licen[cs]e|copying|notice|copyright)([._-].*)?$/i.test(entry.name))
      notices.push(
        `=== ${pkg.name}@${pkg.version} / ${entry.name} ===\n${await readFile(join(directory, entry.name), 'utf8')}`,
      );
  const require = createRequire(path);
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    let dep;
    try {
      dep = dirname(require.resolve(name));
    } catch {
      dep = join(root, 'node_modules', name);
    }
    while (dirname(dep) !== dep) {
      if (
        existsSync(join(dep, 'package.json')) &&
        JSON.parse(await readFile(join(dep, 'package.json'), 'utf8')).name === name
      )
        break;
      dep = dirname(dep);
    }
    if (existsSync(join(dep, 'package.json'))) await collect(dep);
  }
}
await collect(runtime);
await writeFile(join(dest, 'licenses.txt'), notices.join('\n\n'));
console.log('Auto Cut: 공식 모델·단일 스레드 WASM·라이선스 자산 준비 완료');
