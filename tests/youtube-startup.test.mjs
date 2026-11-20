import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Exercise the component's actual sync callback, without network/YouTube timing.
const source = readFileSync(new URL('../src/components/YouTubePlayer.tsx', import.meta.url), 'utf8');
const body = source.split('    const apply = () => {')[1].split('\n    };\n    apply();')[0];
const apply = new Function('player', 'ad', 'videoId', 'playing', 'position', 'updatedAt', 'revision', 'intent', 'positionNow', 'st', 'mirror', 'isMirror', 'guardStartup', body);
function fixture(guardStartup) {
  let state = 5, time = 0;
  const calls = [], st = { current: { off: 0, expected: null, quietUntil: 0, lastTick: null, cued: '' } };
  const p = { getVideoData: () => ({ video_id: 'v' }), getPlayerState: () => state, getCurrentTime: () => time,
    seekTo: t => calls.push(['seek', t]), playVideo: () => calls.push(['play']), pauseVideo: () => calls.push(['pause']),
    loadVideoById: o => calls.push(['load', o.videoId]), cueVideoById: o => calls.push(['cue', o.videoId]) };
  return { calls, st, set: (s, t = 0) => { state = s; time = t; },
    run: (playing = true, position = 30, id = 'v', ad = false) => apply({ current: p }, { current: { on: ad } }, id, playing, position, 0, 1, { current: null }, () => position, st, { current: null }, false, guardStartup) };
}
test('only Windows Firefox enables startup mitigation', () => {
  const guard = new Function('navigator', `return ${source.match(/const guardStartup = (.*);/)[1]}`);
  assert.equal(guard({ userAgent: 'Windows NT 10.0 Firefox/145.0' }), true);
  for (const userAgent of ['Windows NT 10.0 Chrome/140.0', 'Macintosh Firefox/145.0', 'Linux Firefox/145.0', 'Macintosh Safari/605.1.15']) assert.equal(guard({ userAgent }), false);
});
test('other browsers retain their original play and seek sequence', () => {
  const f = fixture(false); f.run(); assert.deepEqual(f.calls, [['seek', 30], ['play']]);
});
test('Windows Firefox starts first, waits through buffering, then synchronizes', () => {
  const f = fixture(true); f.run(); assert.deepEqual(f.calls, [['play']]);
  f.set(3); f.run(true, 35); f.run(true, 40); assert.equal(f.calls.length, 1);
  f.set(1, 40); f.st.current.quietUntil = 0; f.run(true, 46);
  assert.deepEqual(f.calls.at(-1), ['seek', 46]);
  f.run(true, 47); assert.equal(f.calls.length, 2);
});
test('pause, video switching and ad hold still work while buffering', () => {
  const f = fixture(true); f.set(3); f.run(false); assert.deepEqual(f.calls, [['pause']]);
  f.run(true, 0, 'next'); assert.deepEqual(f.calls.at(-1), ['load', 'next']);
  f.run(true, 30, 'v', true); assert.equal(f.calls.length, 2);
});
