import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../baa-music-map.js', import.meta.url), 'utf8');
assert.doesNotMatch(src, /localStorage|gasPost|submitProfile/);
const BaaMusicMap = new Function(src + '\nreturn globalThis.BaaMusicMap;')();

assert.deepEqual(BaaMusicMap.axes.find((axis) => axis.id === 'reading').tags, ['C-1']);
assert.deepEqual(BaaMusicMap.axes.find((axis) => axis.id === 'solfege').tags, ['C-1', 'C-4']);
assert.deepEqual(BaaMusicMap.axes.find((axis) => axis.id === 'harmony').tags, ['C']);
assert.deepEqual(BaaMusicMap.axes.find((axis) => axis.id === 'rhythm').tags, ['C-1']);
assert.deepEqual(BaaMusicMap.axes.find((axis) => axis.id === 'theory').tags, ['C-2']);
assert.deepEqual(BaaMusicMap.axes.find((axis) => axis.id === 'instruments').tags, ['C-3']);
assert.deepEqual(BaaMusicMap.axes.find((axis) => axis.id === 'listening').tags, ['C-4']);
assert.equal(BaaMusicMap.axes.some((axis) => axis.tags.some((tag) => tag.startsWith('A'))), false);

const html = BaaMusicMap.legendHtml();
assert.match(html, /教師補錄/);
assert.match(html, /readonly/);
assert.match(html, /未由本平台評核/);
assert.match(html, /已提供創作入口，未由本平台自動評核/);
assert.match(html, /部分涵蓋 B-1、B-2、B-3、B-4/);
assert.match(html, /B-5 同儕互評/);
assert.match(html, /不是基本學力達標/);
assert.equal(BaaMusicMap.STUDIO_ENTRY, true);
assert.equal(BaaMusicMap.domains.find((domain) => domain.id === 'A').status, BaaMusicMap.UNAUDITED);
assert.equal(BaaMusicMap.domains.find((domain) => domain.id === 'D').status, BaaMusicMap.STUDIO_STATUS);

console.log('baa-music-map tests passed');
