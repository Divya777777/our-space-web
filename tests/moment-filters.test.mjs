import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const load = async rel => {
  const source = readFileSync(new URL(rel, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return { source, mod: await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`) };
};
const web = await load('../src/lib/momentFilters.ts');
const phone = readFileSync(new URL('../../mobile/src/lib/momentFilters.ts', import.meta.url), 'utf8');
const { FILTERS, applyFilter, resize, insetSelfie } = web.mod;

const photo = (w, h) => { const data = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { data[i * 4] = (i * 7) % 256; data[i * 4 + 1] = (i * 13) % 256; data[i * 4 + 2] = (i * 29) % 256; data[i * 4 + 3] = 255; } return { width: w, height: h, data }; };

test('web and phone use the very same filter code', () => assert.equal(phone, web.source));
test('ten filters, five of them Plus', () => { assert.equal(FILTERS.length, 10); assert.equal(FILTERS.filter(f => f.plus).length, 5); });
test('Original leaves the photo as it is; the input is never changed', () => {
  const src = photo(20, 30); const before = Uint8ClampedArray.from(src.data);
  assert.deepEqual([...applyFilter(src, 'original').data], [...before]);
  applyFilter(src, 'spell'); assert.deepEqual([...src.data], [...before]);
});
test('every filter keeps pixels in range and the size (Polaroid adds a frame)', () => {
  for (const f of FILTERS) {
    const out = applyFilter(photo(40, 60), f.id);
    if (f.id === 'polaroid') assert.ok(out.width > 40 && out.height > 60); else { assert.equal(out.width, 40); assert.equal(out.height, 60); }
    assert.equal(out.data.length, out.width * out.height * 4);
    assert.ok([...out.data].every(v => v >= 0 && v <= 255));
  }
});
test('Mono is grey, Cinema has black bars, Polaroid frame is cream', () => {
  const mono = applyFilter(photo(10, 10), 'mono');
  for (let i = 0; i < 100; i++) { const [r, g, b] = mono.data.subarray(i * 4, i * 4 + 3); assert.ok(Math.abs(r - g) <= 1 && Math.abs(g - b) <= 1); }
  const cine = applyFilter(photo(10, 100), 'cinema');
  assert.deepEqual([...cine.data.subarray(0, 4)], [0, 0, 0, 255]);
  assert.deepEqual([...cine.data.subarray((99 * 10) * 4, (99 * 10) * 4 + 4)], [0, 0, 0, 255]);
  const pol = applyFilter(photo(100, 100), 'polaroid');
  assert.deepEqual([...pol.data.subarray(0, 4)], [247, 243, 234, 255]);
});
test('resize never enlarges and keeps the shape; selfie inset keeps the size', () => {
  assert.equal(resize(photo(50, 50), 100, 100).width, 50);
  const r = resize(photo(400, 300), 200, 200); assert.equal(r.width, 200); assert.equal(r.height, 150);
  const both = insetSelfie(photo(300, 400), photo(90, 120)); assert.equal(both.width, 300); assert.equal(both.height, 400);
});
