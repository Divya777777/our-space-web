import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/callQuality.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { newUploadQuality, updateUploadQuality, cameraBitrate, uploadSample } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const feedback = (at, loss, rtt = .15) => ({ feedback: { id: 'remote-video', at, loss, rtt } });

test('healthy Wi-Fi keeps original settings without repeated writes', () => {
  const s = newUploadQuality();
  for (const available of [1_500_000, 1_800_000, 1_600_000]) assert.equal(updateUploadQuality(s, { available }), false);
  assert.equal(s.cap, 0);
  assert.equal(cameraBitrate(1_500_000, s.cap, s.available), 1_500_000);
});

test('falling capacity updates the sender even inside the same tier', () => {
  const s = newUploadQuality();
  const actual = [];
  for (const available of [600_000, 350_000, 250_000, 80_000]) {
    assert.equal(updateUploadQuality(s, { available }), true);
    actual.push(cameraBitrate(1_500_000, s.cap, s.available));
  }
  assert.deepEqual(actual, [510_000, 297_500, 210_000, 40_000]);
});

test('small bandwidth noise does not rewrite the sender', () => {
  const s = newUploadQuality();
  updateUploadQuality(s, { available: 500_000 });
  for (const available of [490_000, 510_000, 480_000]) assert.equal(updateUploadQuality(s, { available }), false);
});

test('missing statistics are unknown and cannot trigger a downgrade or recovery', () => {
  const s = newUploadQuality();
  for (let i = 0; i < 10; i++) assert.equal(updateUploadQuality(s, {}), false);
  updateUploadQuality(s, { available: 200_000 });
  for (let i = 0; i < 10; i++) assert.equal(updateUploadQuality(s, {}), false);
  assert.equal(s.cap, 2);
});

test('fresh remote loss can downgrade when the bandwidth estimate is unavailable', () => {
  const s = newUploadQuality();
  assert.equal(updateUploadQuality(s, feedback(1, .15)), false);
  assert.equal(updateUploadQuality(s, feedback(2, .15)), true);
  assert.equal(s.cap, 1);
  updateUploadQuality(s, feedback(3, .25));
  updateUploadQuality(s, feedback(4, .25));
  assert.equal(s.cap, 2);
  assert.equal(cameraBitrate(1_500_000, s.cap, s.available), 180_000);
});

test('the same RTCP report cannot repeatedly downgrade a call', () => {
  const s = newUploadQuality();
  for (let i = 0; i < 10; i++) updateUploadQuality(s, feedback(1, .3));
  assert.equal(s.cap, 0);
  updateUploadQuality(s, feedback(2, .3));
  assert.equal(s.cap, 2);
});

test('recovery requires sustained capacity, one tier at a time', () => {
  const s = newUploadQuality();
  updateUploadQuality(s, { available: 200_000 });
  for (let i = 0; i < 4; i++) updateUploadQuality(s, { available: 1_500_000 });
  assert.equal(s.cap, 2);
  updateUploadQuality(s, { available: 1_500_000 });
  assert.equal(s.cap, 1);
  for (let i = 0; i < 5; i++) updateUploadQuality(s, { available: 1_500_000 });
  assert.equal(s.cap, 0);
});

test('feedback-only recovery requires fresh low-loss, low-RTT reports', () => {
  const s = newUploadQuality();
  updateUploadQuality(s, { available: 200_000 });
  for (let i = 1; i <= 5; i++) updateUploadQuality(s, feedback(i, .005));
  assert.equal(s.cap, 1);
  for (let i = 0; i < 10; i++) updateUploadQuality(s, feedback(5, .005));
  assert.equal(s.cap, 1);
  for (let i = 6; i <= 10; i++) updateUploadQuality(s, feedback(i, .005));
  assert.equal(s.cap, 0);
});

test('receiver feedback constrains video even with an optimistic estimate', () => {
  const s = newUploadQuality();
  for (let i = 1; i <= 2; i++) updateUploadQuality(s, { ...feedback(i, .3), available: 2_000_000 });
  assert.equal(s.cap, 2);
  assert.equal(cameraBitrate(1_500_000, s.cap, s.available), 220_000);
});

test('feedback belongs to the outgoing video, not unrelated audio', () => {
  const report = new Map([
    ['audio-feedback', { id: 'audio-feedback', type: 'remote-inbound-rtp', localId: 'audio', timestamp: 20, fractionLost: .9 }],
    ['video-feedback', { id: 'video-feedback', type: 'remote-inbound-rtp', localId: 'video', timestamp: 22, fractionLost: .01, roundTripTime: .2 }],
  ]);
  const sample = uploadSample(report, { id: 'video' }, { availableOutgoingBitrate: 500_000 });
  assert.equal(sample.feedback.id, 'video-feedback');
  assert.equal(sample.feedback.loss, .01);
  assert.equal(uploadSample(report, null, null).feedback, undefined);
});

test('each new connection starts with clean adaptation state', () => {
  const previous = newUploadQuality();
  updateUploadQuality(previous, { available: 80_000 });
  const next = newUploadQuality();
  assert.equal(next.cap, 0);
  assert.equal(next.available, 0);
});

test('cumulative packet counters supply fallback loss and tolerate resets', () => {
  const s = newUploadQuality();
  const report = (at, lost, sent) => ({ feedback: { id: 'r', at, lost, sent, rtt: .2 } });
  assert.equal(updateUploadQuality(s, report(1, 0, 100)), false);
  assert.equal(updateUploadQuality(s, report(2, 15, 200)), false);
  assert.equal(updateUploadQuality(s, report(3, 30, 300)), true);
  assert.equal(s.cap, 1);
  updateUploadQuality(s, report(4, 0, 0));
  assert.equal(s.good, 0);
  assert.equal(s.bad, 0);
  assert.equal(s.cap, 1);
});

// Exercise the real sender function with asynchronous WebRTC stand-ins.
const callSource = readFileSync(new URL('../src/components/Call.tsx', import.meta.url), 'utf8');
const tuneSource = callSource.slice(callSource.indexOf('const SEND ='), callSource.indexOf('const VIDEO_BUFFER ='));
const tuneJS = ts.transpileModule(tuneSource + '\nexport { tune };', { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const tuneModule = await import(`data:text/javascript;base64,${Buffer.from(`const cameraBitrate = ${cameraBitrate.toString()};\n${tuneJS}`).toString('base64')}`);
test('concurrent tuning serializes transactions and preserves healthy camera settings', async () => {
  let transaction = 0, active = false;
  const writes = [];
  const sender = {
    track: { kind: 'video' },
    getParameters() { assert.equal(active, false); return { transactionId: ++transaction, encodings: [{}] }; },
    async setParameters(p) {
      assert.equal(active, false); active = true;
      await new Promise(resolve => setTimeout(resolve, 5));
      assert.equal(p.transactionId, transaction);
      writes.push(p); active = false;
    },
  };
  await Promise.all([tuneModule.tune(sender, 1), tuneModule.tune(sender, 1, null, 2, 80_000)]);
  assert.deepEqual(writes[0].encodings[0], { maxBitrate: 1_500_000, maxFramerate: 30, scaleResolutionDownBy: 1, priority: 'high', networkPriority: 'high' });
  assert.equal(writes[0].degradationPreference, 'balanced');
  assert.equal(writes[1].encodings[0].maxBitrate, 40_000);
  assert.equal(writes[1].encodings[0].scaleResolutionDownBy, 3);
  assert.equal(writes[1].degradationPreference, 'maintain-framerate');
});
