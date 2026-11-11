// Room themes: a living backdrop for the whole room (northern lights, falling petals, rain on a city…), picked from
// the room's ⋯ menu and shared by everyone in it. Each scene is drawn in code and sized with container units, so the
// same scene fills the screen behind a room and shrinks into the little preview cards in the picker.
import { CSSProperties, useEffect } from 'react';
import { Icon } from './Icon';

export type ThemeId = 'midnight' | 'aurora' | 'golden' | 'sakura' | 'sea' | 'rain' | 'fireflies';
export const THEMES: { id: ThemeId; name: string; line: string }[] = [
  { id: 'midnight', name: 'Midnight', line: 'The classic. Quiet and starry.' },
  { id: 'aurora', name: 'Aurora', line: 'Northern lights over a ridge.' },
  { id: 'golden', name: 'Golden hour', line: 'A slow sunset that never ends.' },
  { id: 'sakura', name: 'Sakura', line: 'Petals falling at dusk.' },
  { id: 'sea', name: 'Deep sea', line: 'Light rays, bubbles, a jellyfish.' },
  { id: 'rain', name: 'Rainy night', line: 'City lights through the rain.' },
  { id: 'fireflies', name: 'Fireflies', line: 'A forest clearing after dark.' },
];
export const themeId = (value?: string | null): ThemeId => (THEMES.some(t => t.id === value) ? value as ThemeId : 'midnight');

// The same "random" every render, so nothing jumps when React repaints.
const rnd = (i: number, salt: number) => { const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); };
function Bits({ n, cls, salt = 1 }: { n: number; cls: string; salt?: number }) {
  return <>{Array.from({ length: n }, (_, i) => <i key={i} className={cls} style={{ '--x': rnd(i, salt), '--y': rnd(i, salt + 1), '--s': rnd(i, salt + 2), '--t': rnd(i, salt + 3) } as CSSProperties}><b /></i>)}</>;
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

export function Scene({ id }: { id: ThemeId }) {
  return <div className={`scene scene-${id}`}>
    {id === 'midnight' && <><i className="sc-blob a" /><i className="sc-blob b" /><Stars n={40} /></>}

    {id === 'aurora' && <>
      <Stars n={54} />
      <i className="sc-ribbon a" /><i className="sc-ribbon b" /><i className="sc-ribbon c" />
      <svg className="sc-ground far" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true"><path d="M0 200V130L80 84l60 34 90-76 84 70 70-36 96 58 86-82 92 70 78-30 90-52 76 58 98-34v140Z" /></svg>
      <svg className="sc-ground" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true"><path d="M0 200v-52l110-46 70 30 120-64 96 62 104-30 120 50 100-66 110 58 170-40v98Z" /></svg>
    </>}

    {id === 'golden' && <>
      <i className="sc-sun" />
      <svg className="sc-birds" viewBox="0 0 120 40" aria-hidden="true"><path d="M4 16q7-8 13 0q7-8 13 0M46 8q6-7 11 0q6-7 11 0M78 24q5-6 9 0q5-6 9 0" /></svg>
      <svg className="sc-ground far" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true"><path d="M0 200V112C150 44 300 62 450 110S750 150 1000 72v128Z" /></svg>
      <svg className="sc-ground" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true"><path d="M0 200v-48c200-60 350 20 550-20s300-40 450 10v58Z" /></svg>
      <Bits n={18} cls="sc-mote" salt={3} />
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
      <i className="sc-ray" style={{ '--x': .12, '--s': .4 } as CSSProperties} /><i className="sc-ray" style={{ '--x': .3, '--s': .9 } as CSSProperties} /><i className="sc-ray" style={{ '--x': .52, '--s': .2 } as CSSProperties} /><i className="sc-ray" style={{ '--x': .7, '--s': .7 } as CSSProperties} /><i className="sc-ray" style={{ '--x': .88, '--s': .5 } as CSSProperties} />
      {[0, 1].map(k => <svg key={k} className={`sc-jelly j${k}`} viewBox="0 0 60 92" aria-hidden="true">
        <path className="bell" d="M2 30C2-8 58-8 58 30q-7-6-14 0q-7-6-14 0q-7-6-14 0q-7-6-14 0Z" />
        <g className="arms" fill="none" strokeLinecap="round"><path d="M12 32q6 14 0 28t0 26" /><path d="M24 33q-6 16 0 30t-2 26" /><path d="M36 33q6 16 0 30t2 26" /><path d="M48 32q-6 14 0 28t0 26" /></g>
      </svg>)}
      <svg className="sc-kelp" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true"><path d="M0 200v-30q30-40 14-80q44 30 30 86q24-60 60-70q-20 50 6 88q30-20 60-12q-18 20-10 48ZM1000 200v-44q-34-30-20-78q-40 36-30 90q-30-50-66-56q26 40 4 78q-30-16-56-6q22 16 16 46Z" /></svg>
      <Bits n={20} cls="sc-bubble" salt={4} />
    </>}

    {id === 'rain' && <>
      <svg className="sc-ground far" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true">
        {Array.from({ length: 26 }, (_, i) => { const h = 50 + rnd(i, 2) * 130; return <rect key={i} x={i * 39} y={200 - h} width={34 + rnd(i, 3) * 10} height={h} />; })}
        {Array.from({ length: 34 }, (_, i) => { const col = Math.floor(rnd(i, 5) * 26); const h = 50 + rnd(col, 2) * 130; return <rect key={`w${i}`} className={rnd(i, 8) > .5 ? 'win warm' : 'win'} x={col * 39 + 5 + Math.floor(rnd(i, 6) * 3) * 9} y={200 - h + 8 + Math.floor(rnd(i, 7) * Math.max(1, (h - 16) / 12)) * 12} width="4" height="5" />; })}
      </svg>
      <Bits n={16} cls="sc-bokeh" salt={6} />
      <Bits n={44} cls="sc-drop" salt={2} />
      <i className="sc-mist" />
    </>}

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
  return <div className="ambient room-theme" aria-hidden="true" key={theme}><Scene id={theme} /></div>;
}

/** The picker: live little previews of every scene. */
export function ThemePicker({ value, onPick }: { value: ThemeId; onPick: (id: ThemeId) => void }) {
  return <div className="theme-grid" role="radiogroup" aria-label="Room theme">
    {THEMES.map(t => <button key={t.id} role="radio" aria-checked={value === t.id} className={`theme-card${value === t.id ? ' on' : ''}`} onClick={() => onPick(t.id)}>
      <Scene id={t.id} />
      <span className="theme-card-text"><b>{t.name}</b><small>{t.line}</small></span>
      {value === t.id && <span className="theme-card-check"><Icon name="check" size={14} /></span>}
    </button>)}
  </div>;
}
