import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const document = readFileSync(new URL('../CHECKLIST.md', import.meta.url), 'utf8');
const normalized = document
  .replace(/^\uFEFF/, '')
  .replace(/\r\n/g, '\n')
  .replace(/\[v\]/g, '[ ]');
const actual = createHash('sha256').update(normalized).digest('hex');
const expected = readFileSync(new URL('../CHECKLIST.sha256', import.meta.url), 'utf8').trim();
if (actual !== expected) {
  throw new Error(
    'CHECKLIST.md의 최초 문구/순서가 변경되었습니다. [ ] → [v] 완료 표기만 허용합니다. 기준 해시는 변경하지 마세요.',
  );
}
console.log(
  `CHECKLIST 원문 유지 확인 · ${document.match(/^- \[v\]/gm)?.length ?? 0}/${document.match(/^- \[[ v]\]/gm)?.length ?? 0} 완료`,
);
