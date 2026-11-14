import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const page = fs.readFileSync(path.join(root, 'rhythm/index.html'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'rhythm/_next/static/chunks/0rhp3r8kt7bjb.js'), 'utf8');
const turbo = fs.readFileSync(path.join(root, 'rhythm/_next/static/chunks/turbopack-09vjf0qeprduq.js'), 'utf8');
const composer = fs.readFileSync(path.join(root, 'rhythm/_next/static/chunks/0tol3umj23ymt.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'rhythm/manifest.json'), 'utf8'));

assert.equal(page.includes('/noteschallenge'), false);
assert.match(page, /href="\/rhythm\/_next\/static\/chunks\/2etrih5d8jkz5\.css\?v=2"/);
assert.match(page, /src="\/rhythm\/_next\/static\/chunks\/0tol3umj23ymt\.js\?v=3"/);
assert.match(page, /href="\/\?g2=setup"/);
assert.match(page, /返回節奏識辨/);
assert.match(page, /href="\/"/);
assert.doesNotMatch(page, /href="\/noteschallenge/);

assert.equal(runtime.includes('/noteschallenge'), false);
assert.match(runtime, /"\/rhythm"/);
assert.equal(turbo.includes('/noteschallenge'), false);
assert.match(turbo, /"\/rhythm\/_next\/"/);
assert.match(composer, /href:"\/\?g2=setup"/);
assert.match(composer, /返回節奏識辨/);
assert.equal(composer.includes('href:"/"'), false);
assert.equal(composer.includes('/noteschallenge'), false);

assert.equal(manifest.start_url, '/rhythm/');
assert.equal(manifest.scope, '/rhythm/');

const urls = [...page.matchAll(/(?:src|href)="(\/rhythm\/[^"]+)"/g)].map((m) => m[1]);
assert.ok(urls.length > 5);
for (const url of urls) {
  const file = url.split('?')[0].replace(/^\//, '');
  assert.equal(fs.existsSync(path.join(root, file)), true, file);
}

function filesUnder(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full, base));
    else out.push(path.relative(base, full));
  }
  return out.sort();
}
const rhythmRoot = path.join(root, 'rhythm');
const appRhythm = path.join(root, 'www/rhythm');
const rhythmFiles = filesUnder(rhythmRoot);
assert.deepEqual(filesUnder(appRhythm), rhythmFiles);
for (const rel of rhythmFiles) {
  const a = fs.readFileSync(path.join(rhythmRoot, rel));
  const b = fs.readFileSync(path.join(appRhythm, rel));
  assert.equal(a.equals(b), true, rel);
}

console.log('rhythm-route: ok', urls.length, 'assets');
