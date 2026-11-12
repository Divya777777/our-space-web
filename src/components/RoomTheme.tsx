// Room themes: a living backdrop for the whole room (neon northern lights, falling petals, fish in sunlit water…), picked from
// the room's ⋯ menu and shared by everyone in it. Each scene is drawn in code and sized with container units, so the
// same scene fills the screen behind a room and shrinks into the little preview cards in the picker.
import { CSSProperties, useEffect, useRef } from 'react';
import { AURORA, SEA } from './sceneShaders';
import { Icon } from './Icon';
import { KiraScene, SpellboundScene } from './WorldThemes';

export type ThemeId = 'midnight' | 'aurora' | 'golden' | 'sakura' | 'sea' | 'fireflies' | 'spellbound' | 'kirakira';
/** `world`: a whole-room theme with its own characters (components/WorldThemes.tsx), not only a backdrop. */
export const THEMES: { id: ThemeId; name: string; line: string; world?: boolean }[] = [
  { id: 'midnight', name: 'Midnight', line: 'The classic. Quiet and starry.' },
  { id: 'aurora', name: 'Aurora', line: 'Northern lights, rippling live.' },
  { id: 'golden', name: 'Golden hour', line: 'Soft sunbeams pouring in.' },
  { id: 'sakura', name: 'Sakura', line: 'Petals falling at dusk.' },
  { id: 'sea', name: 'Deep sea', line: 'A sunlit reef, a turtle, shoals of fish.' },
  { id: 'fireflies', name: 'Fireflies', line: 'A forest clearing after dark.' },
  { id: 'spellbound', name: 'Spellbound', line: 'A moonlit tower library, with Wick and Page.', world: true },
  { id: 'kirakira', name: 'Kira Kira', line: 'An anime rooftop at sunset, with Hoshi and Mochi.', world: true },
];
export const themeId = (value?: string | null): ThemeId => (THEMES.some(t => t.id === value) ? value as ThemeId : 'midnight');

// The same "random" every render, so nothing jumps when React repaints.
const rnd = (i: number, salt: number) => { const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); };
function Bits({ n, cls, salt = 1 }: { n: number; cls: string; salt?: number }) {
  return <>{Array.from({ length: n }, (_, i) => <i key={i} className={cls} style={{ '--x': rnd(i, salt), '--y': rnd(i, salt + 1), '--s': rnd(i, salt + 2), '--t': rnd(i, salt + 3) } as CSSProperties}><b /></i>)}</>;
}
// One full-screen triangle and a fragment shader. Drawn small and stretched (the scenes are soft), about 30 times a
// second, paused while the tab is hidden. Without WebGL the scene's plain CSS background shows instead.
function Shader({ frag, scale = .5 }: { frag: string; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const gl = c.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) { c.style.display = 'none'; return; }
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }'));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { c.style.display = 'none'; return; }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(prog, 'r'), uT = gl.getUniformLocation(prog, 't');
    const frame = (time: number) => {
      const w = Math.max(2, Math.round(c.clientWidth * scale)), h = Math.max(2, Math.round(c.clientHeight * scale));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, time); gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    let raf = 0, last = 0; const t0 = performance.now();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { frame(40); const again = () => frame(40); window.addEventListener('resize', again); return () => window.removeEventListener('resize', again); }
    const loop = (now: number) => { raf = requestAnimationFrame(loop); if (document.hidden || now - last < 32) return; last = now; frame(40 + (now - t0) / 1000); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); gl.getExtension('WEBGL_lose_context')?.loseContext(); };
  }, [frag, scale]);
  return <canvas ref={ref} className="sc-gl" />;
}
const Stars = ({ n = 46, salt = 9 }: { n?: number; salt?: number }) => <Bits n={n} cls="sc-star" salt={salt} />;

function Blossom({ x, y, s = 1, r = 0, tone = '#F9B9D0' }: { x: number; y: number; s?: number; r?: number; tone?: string }) {
  return <g transform={`translate(${x} ${y}) scale(${s}) rotate(${r})`}>
    {[0, 1, 2, 3, 4].map(k => <ellipse key={k} cx="0" cy="-7.5" rx="5.2" ry="7.5" transform={`rotate(${k * 72})`} fill={tone} />)}
    <circle r="2.6" fill="#FFE7A6" />
  </g>;
}
const BLOSSOMS: [number, number, number, number, string?][] = [
  [356, 30, 1.25, 10], [318, 22, .9, 40, '#FFD3E2'], [292, 52, 1.15, 0], [262, 44, .8, 20, '#FFD3E2'], [236, 74, 1.3, 30], [206, 70, .85, 5, '#F59ABB'],
  [176, 100, 1.1, 50], [148, 118, .9, 15, '#FFD3E2'], [112, 128, 1.25, 25], [74, 140, .95, 0, '#F59ABB'], [44, 152, 1.1, 35],
  [252, 96, 1, 12, '#FFD3E2'], [226, 122, 1.2, 44], [198, 142, .9, 8, '#F59ABB'], [150, 62, 1.05, 30], [118, 48, 1.2, 0, '#FFD3E2'], [96, 42, .8, 22],
];
function Pine({ x, h, w }: { x: number; h: number; w: number }) {
  const y = 400 - h; const tiers = 4;
  return <g>
    <rect x={x - w * .06} y={400 - h * .2} width={w * .12} height={h * .2} />
    {Array.from({ length: tiers }, (_, k) => { const top = y + (h * .72 * k) / tiers; const half = (w / 2) * (.45 + (.55 * (k + 1)) / tiers); const base = top + h * .36; return <polygon key={k} points={`${x},${top} ${x - half},${base} ${x + half},${base}`} />; })}
  </g>;
}

const FISH: { y: number; size: number; dur: number; delay: number; c: string; c2: string; left?: boolean; plain?: boolean }[] = [
  { y: .16, size: 11, dur: 36, delay: .1, c: '#FF8A3D', c2: '#F2622A' },
  { y: .34, size: 8, dur: 48, delay: .55, c: '#FFD23F', c2: '#FFAE1A', left: true },
  { y: .56, size: 13, dur: 42, delay: .32, c: '#3B7BFF', c2: '#FFD23F', plain: true },
  { y: .66, size: 7, dur: 40, delay: .8, c: '#FF7FA8', c2: '#FF5C8D', left: true },
  { y: .44, size: 9, dur: 38, delay: .93, c: '#FF8A3D', c2: '#F2622A', left: true },
  { y: .26, size: 6.5, dur: 52, delay: .42, c: '#8E7BFF', c2: '#FF8FB8', plain: true },
  { y: .74, size: 8.5, dur: 46, delay: .68, c: '#FFD23F', c2: '#FFAE1A' },
];
// A loose shoal: [left %, top %, width %] inside the shoal's box.
const SCHOOL: [number, number, number][] = [[0, 30, 16], [14, 8, 14], [20, 52, 17], [36, 26, 15], [44, 70, 14], [56, 2, 15], [60, 44, 17], [78, 22, 14], [80, 62, 15]];
function Reef({ flip }: { flip?: boolean }) {
  return <svg className={`sc-reef${flip ? ' flip' : ''}`} viewBox="0 0 320 200" aria-hidden="true">
    <g className="sway" fill="none" stroke="#3FB79A" strokeWidth="7" strokeLinecap="round"><path d="M22 200q-16-44 4-84q-18 40 6 84" /><path d="M292 200q16-36-2-70q20 32 10 70" /><path d="M188 200q-10-30 6-56" stroke="#63CDAE" /></g>
    <path d="M0 200v-26q70-26 170-12t150 38Z" fill="#F7E8C6" />
    <g fill="none" stroke="#FF7285" strokeWidth="9" strokeLinecap="round"><path d="M72 178v-58M72 152q-24-8-28-38M72 142q24-10 28-42M72 120q-13-16-9-38M72 120q15-13 15-34" /></g>
    <g fill="#FFC2CB"><circle cx="44" cy="112" r="4" /><circle cx="100" cy="98" r="4" /><circle cx="63" cy="80" r="4" /><circle cx="87" cy="84" r="4" /></g>
    <g fill="none" stroke="#FFA24D" strokeWidth="13" strokeLinecap="round"><path d="M132 182v-44M150 184v-62M168 182v-38" /></g>
    <g fill="#FFD9A8"><circle cx="132" cy="138" r="4" /><circle cx="150" cy="122" r="4" /><circle cx="168" cy="144" r="4" /></g>
    <path d="M222 184c-32-30-22-72 6-86c28 14 38 56 6 86Z" fill="#A98BFF" /><path d="M228 182v-78M228 160l-18-22M228 150l18-24M228 132l-12-16M228 126l12-14" fill="none" stroke="#D5C6FF" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="272" cy="182" r="22" fill="#FF93BE" /><path d="M256 176q8-8 16 0t16 0M258 188q7-7 14 0t14 0" fill="none" stroke="#FFD0E4" strokeWidth="2.5" strokeLinecap="round" />
    <g fill="none" stroke="#35C6D6" strokeWidth="5" strokeLinecap="round" className="sway"><path d="M196 190q-8-14-4-26M204 190q0-16 4-28M212 190q8-12 12-22" /></g>
    <path d="M-4 200q40-20 120-10t210 10Z" fill="#FBF1D8" />
  </svg>;
}
/** `cast`: draw the world's characters into the scene (previews). In a room they live in the room itself instead. */
export function Scene({ id, cast = true }: { id: ThemeId; cast?: boolean }) {
  return <div className={`scene scene-${id}`}>
    {id === 'midnight' && <><i className="sc-blob a" /><i className="sc-blob b" /><Stars n={40} /></>}

    {id === 'aurora' && <Shader frag={AURORA} scale={.6} />}

    {id === 'golden' && <>
      <i className="sc-glow" />
      <i className="sc-rays a" /><i className="sc-rays b" />
      <i className="sc-haze" />
      <Bits n={26} cls="sc-mote" salt={3} />
    </>}

    {id === 'sakura' && <>
      <i className="sc-moon" />
      <Stars n={26} salt={5} />
      <svg className="sc-branch" viewBox="0 0 400 190" aria-hidden="true">
        <g fill="none" stroke="#4A2A3C" strokeLinecap="round">
          <path strokeWidth="9" d="M408 4C330 26 262 40 204 80S104 132 34 154" />
          <path strokeWidth="5" d="M272 50c-14 40-34 62-78 94" />
          <path strokeWidth="4.5" d="M186 92c-20-24-44-42-92-48" />
        </g>
        {BLOSSOMS.map(([x, y, s, r, tone], i) => <Blossom key={i} x={x} y={y} s={s} r={r} tone={tone} />)}
      </svg>
      <Bits n={24} cls="sc-petal" salt={7} />
    </>}

    {id === 'sea' && <>
      <Shader frag={SEA} scale={.5} />
      <i className="sc-sand" />
      <i className="sc-school" style={{ '--y': .2, '--d': 64, '--t': .2 } as CSSProperties}>{SCHOOL.map(([x, y, k], i) => <svg key={i} viewBox="0 0 30 14" style={{ left: `${x}%`, top: `${y}%`, width: `${k}%` }} aria-hidden="true"><path d="M8 7C11 1 22 1 28 7 22 13 11 13 8 7ZM9 7 1 1v12Z" /></svg>)}</i>
      <i className="sc-school far" style={{ '--y': .5, '--d': 90, '--t': .65 } as CSSProperties}>{SCHOOL.map(([x, y, k], i) => <svg key={i} viewBox="0 0 30 14" style={{ left: `${x}%`, top: `${y}%`, width: `${k}%` }} aria-hidden="true"><path d="M8 7C11 1 22 1 28 7 22 13 11 13 8 7ZM9 7 1 1v12Z" /></svg>)}</i>
      {[0, 1].map(k => <svg key={k} className={`sc-jelly j${k}`} viewBox="0 0 60 92" aria-hidden="true">
        <path className="bell" d="M2 30C2-8 58-8 58 30q-7-6-14 0q-7-6-14 0q-7-6-14 0q-7-6-14 0Z" />
        <g className="arms" fill="none" strokeLinecap="round"><path d="M12 32q6 14 0 28t0 26" /><path d="M24 33q-6 16 0 30t-2 26" /><path d="M36 33q6 16 0 30t2 26" /><path d="M48 32q-6 14 0 28t0 26" /></g>
      </svg>)}
      <i className="sc-turtle"><svg viewBox="0 0 120 74" aria-hidden="true">
        <path className="flip back" d="M32 44q-16 6-24 20q18 0 30-12Z" fill="#6FBF9A" />
        <path d="M22 42C26 14 84 10 94 40Q58 54 22 42Z" fill="#4FA98A" />
        <path d="M40 21l8 24M58 15l2 31M76 20l-7 25M29 34q31-11 60-1" fill="none" stroke="#3A8A70" strokeWidth="2" strokeLinecap="round" />
        <path d="M22 42q36 14 72-2q-6 10-36 11T22 42Z" fill="#F3E2A9" />
        <ellipse cx="103" cy="36" rx="11" ry="8" fill="#7CCBA5" /><circle cx="107" cy="34" r="1.7" fill="#0E3A4F" />
        <path className="flip" d="M72 46q4 16 22 24q0-16-10-28Z" fill="#6FBF9A" />
      </svg></i>
      {FISH.map((f, i) => <i key={i} className={`sc-fish${f.left ? ' left' : ''}${f.plain ? ' plain' : ''}`} style={{ '--y': f.y, '--s': f.size, '--d': f.dur, '--t': f.delay, '--c': f.c, '--c2': f.c2 } as CSSProperties}>
        <svg viewBox="0 0 72 44" aria-hidden="true">
          <path className="tail" d="M17 22 2 7q7 15 0 30Z" /><path className="fin2" d="M27 10q11-11 24-1Z" /><path className="fin2" d="M30 35q8 8 16 1Z" />
          <path className="body" d="M12 22C18 6 46 4 62 22 46 40 18 38 12 22Z" />
          <path className="stripe" d="M28 10q-5 12 0 24M43 9.5q5 12.5 0 25" />
          <circle cx="53" cy="18" r="3" fill="#fff" /><circle cx="53.6" cy="18" r="1.6" fill="#0E2A3A" />
        </svg>
      </i>)}
      <Reef /><Reef flip />
      <Bits n={26} cls="sc-bubble" salt={4} />
    </>}

    {id === 'spellbound' && <SpellboundScene cast={cast} />}
    {id === 'kirakira' && <KiraScene cast={cast} />}

    {id === 'fireflies' && <>
      <i className="sc-moon haze" />
      <Stars n={22} salt={12} />
      <svg className="sc-ground far" viewBox="0 0 1000 400" preserveAspectRatio="none" aria-hidden="true">
        {[[60, 250, 120], [170, 320, 150], [290, 210, 110], [700, 230, 120], [820, 330, 150], [940, 260, 130]].map(([x, h, w], i) => <Pine key={i} x={x} h={h} w={w} />)}
      </svg>
      <svg className="sc-ground" viewBox="0 0 1000 400" preserveAspectRatio="none" aria-hidden="true">
        {[[10, 330, 170], [115, 240, 130], [230, 160, 100], [770, 170, 100], [880, 280, 150], [990, 360, 180]].map(([x, h, w], i) => <Pine key={i} x={x} h={h} w={w} />)}
        <path d="M0 400v-28q120-22 260-10t260 6t250-8t230 4v36Z" />
      </svg>
      <Bits n={30} cls="sc-fly" salt={8} />
    </>}
  </div>;
}

/** The full-screen backdrop behind a room, plus the room's accent colours while you're in it. */
export function RoomThemeLayer({ theme }: { theme: ThemeId }) {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'midnight') delete root.dataset.roomTheme; else root.dataset.roomTheme = theme;
    return () => { delete root.dataset.roomTheme; };
  }, [theme]);
  if (theme === 'midnight') return null;
  return <div className="ambient room-theme" aria-hidden="true" key={theme}><Scene id={theme} cast={false} /></div>;
}

/** The picker: live little previews of every scene. Worlds get their own cards on top. */
export function ThemePicker({ value, onPick }: { value: ThemeId; onPick: (id: ThemeId) => void }) {
  const card = (t: typeof THEMES[number]) => <button key={t.id} role="radio" aria-checked={value === t.id} className={`theme-card${t.world ? ' world' : ''}${value === t.id ? ' on' : ''}`} onClick={() => onPick(t.id)}>
    <Scene id={t.id} />
    {t.world && <span className="theme-card-tag">World</span>}
    <span className="theme-card-text"><b>{t.name}</b><small>{t.line}</small></span>
    {value === t.id && <span className="theme-card-check"><Icon name="check" size={14} /></span>}
  </button>;
  return <div className="col gap-16" role="radiogroup" aria-label="Room theme">
    <div className="col gap-8">
      <p className="small muted">Worlds · the whole room changes, with characters who react to what you do</p>
      <div className="theme-grid worlds">{THEMES.filter(t => t.world).map(card)}</div>
    </div>
    <div className="col gap-8">
      <p className="small muted">Backdrops</p>
      <div className="theme-grid">{THEMES.filter(t => !t.world).map(card)}</div>
    </div>
  </div>;
}
