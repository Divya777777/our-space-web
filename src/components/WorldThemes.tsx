// World themes: rooms where every part is dressed for one world, with its own characters (all original to Our Space).
//   Spellbound — a moonlit tower library. Wick (a candle sprite) keeps you company; Page (a paper bird) carries messages.
//   Kira Kira  — an anime rooftop at sunset. Mochi (a round, sleepy companion) and Hoshi (a star-hooded kid) live here.
// This file draws the two backdrops and the characters, and runs the room's reactions (play, pause, messages, someone
// joining, a goal finished). The look of buttons, tabs, bubbles… is in worldThemes.css, switched on by <html data-room-theme>.
import { CSSProperties, useEffect, useRef, useState } from 'react';
import type { ThemeId } from './RoomTheme';

export type WorldId = 'spellbound' | 'kirakira';
export const isWorld = (id: ThemeId | string): id is WorldId => id === 'spellbound' || id === 'kirakira';

/** Things that happen in a room which a world theme reacts to. Safe to call anywhere: nothing listens outside a world theme. */
export type RoomFx = 'enter' | 'play' | 'pause' | 'send' | 'message' | 'join' | 'celebrate';
export function roomFx(kind: RoomFx) { window.dispatchEvent(new CustomEvent('ourspace:fx', { detail: kind })); }

type Mood = 'idle' | 'happy' | 'sleep';
const rnd = (i: number, salt: number) => { const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); };
function Bits({ n, cls, salt = 1 }: { n: number; cls: string; salt?: number }) {
  return <>{Array.from({ length: n }, (_, i) => <i key={i} className={cls} style={{ '--x': rnd(i, salt), '--y': rnd(i, salt + 1), '--s': rnd(i, salt + 2), '--t': rnd(i, salt + 3) } as CSSProperties}><b /></i>)}</>;
}
const SPARK = 'M10 0C10.6 6.6 13.4 9.4 20 10 13.4 10.6 10.6 13.4 10 20 9.4 13.4 6.6 10.6 0 10 6.6 9.4 9.4 6.6 10 0Z';
const Spark = ({ cls = '' }: { cls?: string }) => <svg className={`wt-spark ${cls}`} viewBox="0 0 20 20" aria-hidden="true"><path d={SPARK} /></svg>;

/* ───────── Characters ───────── */

/** Wick, the candle sprite (Spellbound). */
export function Wick({ mood = 'idle' }: { mood?: Mood }) {
  return <svg className={`ch ch-wick is-${mood}`} viewBox="0 0 64 80" aria-hidden="true">
    <circle className="wk-glow" cx="32" cy="22" r="20" />
    <g className="wk-flame">
      <path d="M32 4C40 14 44 20 44 25C44 31 38.6 35 32 35C25.4 35 20 31 20 25C20 20 24 14 32 4Z" fill="#FF9F2E" />
      <path d="M32 13C37 19 39 23 39 26C39 30 35.9 33 32 33C28.1 33 25 30 25 26C25 23 27 19 32 13Z" fill="#FFD76A" />
      <path d="M32 21C34.5 24 35.5 26 35.5 27.5C35.5 30 34 32 32 32C30 32 28.5 30 28.5 27.5C28.5 26 29.5 24 32 21Z" fill="#FFF7DA" />
    </g>
    <ellipse cx="32" cy="71" rx="21" ry="5.4" fill="#B37A22" />
    <path d="M51 70q10-1 8-10" stroke="#B37A22" strokeWidth="3.2" fill="none" strokeLinecap="round" />
    <g className="wk-body">
      <ellipse className="wk-arm l" cx="15.5" cy="56" rx="3.4" ry="5" fill="#F3DFB4" />
      <ellipse className="wk-arm r" cx="48.5" cy="56" rx="3.4" ry="5" fill="#F3DFB4" />
      <rect x="17" y="33" width="30" height="36" rx="9" fill="#FFF1D2" />
      <path d="M17 44v-2a9 9 0 0 1 9-9h12a9 9 0 0 1 9 9v5q-3 5-6 0q-2-4-5 0q-2 6-6 1q-3-5-6 0q-3 4-7-2Z" fill="#FFFBEF" />
      <g className="wk-face">
        <ellipse className="wk-eye" cx="26" cy="55" rx="2.3" ry="3" fill="#3A1E2E" />
        <ellipse className="wk-eye" cx="38" cy="55" rx="2.3" ry="3" fill="#3A1E2E" />
        <ellipse cx="21.6" cy="60" rx="3" ry="1.7" fill="#FF9FA8" opacity=".75" /><ellipse cx="42.4" cy="60" rx="3" ry="1.7" fill="#FF9FA8" opacity=".75" />
        <path className="wk-mouth" d="M29.4 60q2.6 2.6 5.2 0" stroke="#3A1E2E" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </g>
    </g>
    <ellipse cx="32" cy="69.4" rx="17" ry="3.4" fill="#E9B955" />
  </svg>;
}

/** Page, the paper bird (Spellbound). */
export function Page({ flying = false }: { flying?: boolean }) {
  return <svg className={`ch ch-page${flying ? ' is-flying' : ''}`} viewBox="0 0 64 48" aria-hidden="true">
    <polygon points="52,34 63,23 47,26" fill="#DCC79C" />
    <polygon className="pg-wing b" points="24,25 36,3 41,27" fill="#DFCBA0" />
    <polygon points="8,30 34,18 52,34 30,41" fill="#FFF6DF" />
    <polygon points="30,41 34,18 52,34" fill="#F1E2BF" />
    <polygon points="8,30 16,13 23,24" fill="#FFF6DF" />
    <polygon points="16,13 5,13 13.5,19" fill="#E9B955" />
    <polygon className="pg-wing a" points="25,25 45,5 47,31" fill="#F7EBCC" />
    <path d="M34 18 30 41M16 13l7 11" stroke="#CDB78A" strokeWidth=".8" fill="none" />
    <circle cx="15.6" cy="18.6" r="1.2" fill="#3A1E2E" />
  </svg>;
}

/** Mochi, the round sleepy companion (Kira Kira). */
export function Mochi({ mood = 'idle' }: { mood?: Mood }) {
  return <svg className={`ch ch-mochi is-${mood}`} viewBox="0 0 76 62" aria-hidden="true">
    <ellipse className="mc-shadow" cx="36" cy="57" rx="23" ry="3.4" />
    <g className="mc-all">
      <path className="mc-tail" d="M58 44q11-2 9-13" stroke="#1B1430" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path className="mc-tail-star" d={SPARK} transform="translate(61.5 22) scale(.55)" fill="#FFD23F" stroke="#1B1430" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M17 26l1-15 13 8Z" fill="#fff" stroke="#1B1430" strokeWidth="2.4" strokeLinejoin="round" /><path d="M20.5 22l.6-7 6 3.6Z" fill="#FF9FC2" />
      <path d="M55 26l-1-15-13 8Z" fill="#fff" stroke="#1B1430" strokeWidth="2.4" strokeLinejoin="round" /><path d="M51.5 22l-.6-7-6 3.6Z" fill="#FF9FC2" />
      <path d="M9 42C9 25 21 15 36 15C51 15 63 25 63 42C63 51 55 55 36 55C17 55 9 51 9 42Z" fill="#fff" stroke="#1B1430" strokeWidth="2.4" />
      <path d="M36 20.5l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3-3.3-1.2 3.3-1.2Z" fill="#FFD23F" stroke="#1B1430" strokeWidth="1" strokeLinejoin="round" />
      <g className="mc-open">
        <ellipse cx="26" cy="37" rx="2.8" ry="3.7" fill="#1B1430" /><circle cx="27" cy="35.6" r="1.05" fill="#fff" />
        <ellipse cx="46" cy="37" rx="2.8" ry="3.7" fill="#1B1430" /><circle cx="47" cy="35.6" r="1.05" fill="#fff" />
      </g>
      <g className="mc-shut" fill="none" stroke="#1B1430" strokeWidth="2" strokeLinecap="round"><path d="M22.5 37.5q3.5-3.6 7 0" /><path d="M42.5 37.5q3.5-3.6 7 0" /></g>
      <ellipse cx="19" cy="43" rx="3.6" ry="2.1" fill="#FF9FC2" /><ellipse cx="53" cy="43" rx="3.6" ry="2.1" fill="#FF9FC2" />
      <path d="M32.5 42q1.75 2.3 3.5 0q1.75 2.3 3.5 0" stroke="#1B1430" strokeWidth="1.7" fill="none" strokeLinecap="round" />
      <ellipse cx="27" cy="54" rx="4.4" ry="2.5" fill="#fff" stroke="#1B1430" strokeWidth="2" /><ellipse cx="45" cy="54" rx="4.4" ry="2.5" fill="#fff" stroke="#1B1430" strokeWidth="2" />
    </g>
  </svg>;
}

/** Hoshi, the star-hooded kid (Kira Kira). Sits on an edge with legs dangling. */
export function Hoshi({ mood = 'idle' }: { mood?: Mood }) {
  const ink = { stroke: '#1B1430', strokeWidth: 2.2, strokeLinejoin: 'round' as const };
  return <svg className={`ch ch-hoshi is-${mood}`} viewBox="0 0 76 88" aria-hidden="true">
    <path className="hs-scarf" d="M48 50q13 0 20-8q3 8-3 14q-8 6-18 1Z" fill="#29D3C2" {...ink} />
    <g className="hs-leg l"><rect x="25" y="62" width="9" height="16" rx="4.5" fill="#3A2E74" {...ink} /><ellipse cx="29" cy="80" rx="6.5" ry="4.2" fill="#FFD23F" {...ink} /></g>
    <g className="hs-leg r"><rect x="39" y="62" width="9" height="16" rx="4.5" fill="#3A2E74" {...ink} /><ellipse cx="44" cy="80" rx="6.5" ry="4.2" fill="#FFD23F" {...ink} /></g>
    <path d="M19 68C17 54 24 46 36.5 46C49 46 56 54 54 68Z" fill="#FF5FA2" {...ink} />
    <path d="M30 60q6.5 4 13 0" stroke="#1B1430" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    <ellipse className="hs-arm l" cx="20" cy="58" rx="4.8" ry="8" fill="#FF5FA2" {...ink} />
    <g className="hs-arm r"><ellipse cx="53" cy="58" rx="4.8" ry="8" fill="#FF5FA2" {...ink} /><circle cx="53" cy="66.5" r="3.2" fill="#FFF0E4" {...ink} /></g>
    <g className="hs-head">
      <path d="M17 18l-2-13 12 6Z" fill="#FF5FA2" {...ink} /><path d="M56 18l2-13-12 6Z" fill="#FF5FA2" {...ink} />
      <circle cx="36.5" cy="29" r="23" fill="#FF5FA2" {...ink} />
      <ellipse cx="36.5" cy="32" rx="17" ry="15.5" fill="#FFF0E4" stroke="#1B1430" strokeWidth="1.8" />
      <path d="M20.5 29q3-13 16-13q13 0 16 13q-6-6-10-1q-3-7-8 0q-5-6-14 1Z" fill="#6C4BD8" stroke="#1B1430" strokeWidth="1.8" strokeLinejoin="round" />
      <g className="hs-open">
        <ellipse cx="29" cy="35" rx="3.7" ry="5" fill="#1B1430" /><circle cx="30.3" cy="33" r="1.5" fill="#fff" /><circle cx="28" cy="37.3" r=".8" fill="#fff" />
        <ellipse cx="44" cy="35" rx="3.7" ry="5" fill="#1B1430" /><circle cx="45.3" cy="33" r="1.5" fill="#fff" /><circle cx="43" cy="37.3" r=".8" fill="#fff" />
      </g>
      <g className="hs-shut" fill="none" stroke="#1B1430" strokeWidth="2" strokeLinecap="round"><path d="M25.5 35.5q3.5-4 7 0" /><path d="M40.5 35.5q3.5-4 7 0" /></g>
      <ellipse cx="23.5" cy="40" rx="3" ry="1.8" fill="#FF9FC2" /><ellipse cx="49.5" cy="40" rx="3" ry="1.8" fill="#FF9FC2" />
      <path className="hs-mouth" d="M33.5 41.5q3 3 6 0" stroke="#1B1430" strokeWidth="1.7" fill="none" strokeLinecap="round" />
      <path d={SPARK} transform="translate(30 0) scale(.65)" fill="#FFD23F" stroke="#1B1430" strokeWidth="2.6" strokeLinejoin="round" />
    </g>
    <path d="M22 47q14.5 9 29 0l1.5 5.5q-16 9-32 0Z" fill="#29D3C2" {...ink} />
  </svg>;
}

/* ───────── Backdrops ───────── */

const SPINES = ['#7C2946', '#C99A3B', '#2E6F73', '#5A2A6E', '#E8D7B0', '#8E3B2F', '#3B4C8A', '#B5652F'];
function Shelf({ side }: { side: 'l' | 'r' }) {
  const rows = 7, salt = side === 'l' ? 21 : 37;
  return <svg className={`sb-shelf ${side}`} viewBox="0 0 120 420" preserveAspectRatio="none" aria-hidden="true">
    <rect width="120" height="420" fill="#1C0A1A" />
    {Array.from({ length: rows }, (_, r) => {
      let x = 4; const y = r * 60; const books: JSX.Element[] = [];
      for (let k = 0; x < 110; k++) {
        const w = 7 + rnd(k + r * 13, salt) * 9, h = 34 + rnd(k + r * 13, salt + 1) * 16, lean = rnd(k + r * 13, salt + 2) > .9;
        books.push(<g key={k} transform={lean ? `rotate(-9 ${x} ${y + 54})` : undefined}><rect x={x} y={y + 54 - h} width={w} height={h} rx="1.2" fill={SPINES[Math.floor(rnd(k + r * 13, salt + 3) * SPINES.length)]} /><rect x={x + 1} y={y + 54 - h + 6} width={w - 2} height="1.6" fill="rgba(255,225,160,.45)" /></g>);
        x += w + (lean ? 5 : 1.5);
      }
      return <g key={r}>{books}<rect x="0" y={y + 54} width="120" height="6" fill="#3A1830" /><rect x="0" y={y + 54} width="120" height="1.5" fill="#6B3A52" /></g>;
    })}
  </svg>;
}
// A made-up constellation for the window: points joined in order.
const SKY: [number, number][] = [[52, 64], [78, 44], [104, 58], [126, 36], [150, 62], [134, 92], [104, 58]];
export function SpellboundScene({ cast = true }: { cast?: boolean }) {
  return <>
    <i className="sb-wall" />
    <svg className="sb-window" viewBox="0 0 200 250" aria-hidden="true">
      <path d="M12 250V96a88 88 0 0 1 176 0v154Z" fill="#102C5A" />
      <circle className="sb-moon" cx="142" cy="128" r="20" fill="#FFF3CF" /><circle cx="150" cy="122" r="18" fill="#102C5A" />
      {Array.from({ length: 22 }, (_, i) => <circle key={i} className="sb-wstar" cx={24 + rnd(i, 61) * 152} cy={30 + rnd(i, 62) * 200} r={.7 + rnd(i, 63) * 1.1} fill="#fff" style={{ animationDelay: `${-rnd(i, 64) * 5}s` }} />)}
      <polyline className="sb-lines" points={SKY.map(p => p.join(',')).join(' ')} fill="none" stroke="#9FE9D8" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" pathLength={100} />
      {SKY.slice(0, 6).map(([x, y], i) => <circle key={i} className="sb-node" cx={x} cy={y} r="2.3" fill="#D9FFF6" style={{ animationDelay: `${i * .5}s` }} />)}
      <path d="M100 8v242M12 150h176M56 22v228M144 22v228" stroke="#2A1022" strokeWidth="4" fill="none" />
      <path d="M12 250V96a88 88 0 0 1 176 0v154" fill="none" stroke="#4A1F3A" strokeWidth="11" /><path d="M12 250V96a88 88 0 0 1 176 0v154" fill="none" stroke="#C99A3B" strokeWidth="1.6" opacity=".7" />
    </svg>
    <i className="sb-moonlight" />
    <Shelf side="l" /><Shelf side="r" />
    <svg className="sb-circle" viewBox="0 0 200 200" aria-hidden="true">
      <g fill="none" stroke="#F4C76B">
        <circle cx="100" cy="100" r="96" strokeWidth="1.2" /><circle cx="100" cy="100" r="84" strokeWidth=".7" strokeDasharray="2 7" /><circle cx="100" cy="100" r="58" strokeWidth=".9" />
        <polygon points="100,16 172.7,142 27.3,142" strokeWidth=".8" /><polygon points="100,184 27.3,58 172.7,58" strokeWidth=".8" />
        {Array.from({ length: 12 }, (_, i) => <path key={i} d="M100 4v9" strokeWidth="1.2" transform={`rotate(${i * 30} 100 100)`} />)}
      </g>
      {Array.from({ length: 6 }, (_, i) => <circle key={i} cx="100" cy="16" r="3" fill="#F4C76B" transform={`rotate(${i * 60} 100 100)`} />)}
    </svg>
    {[0, 1, 2].map(k => <i key={k} className={`sb-lantern n${k}`}><b className="chain" /><b className="lamp" /></i>)}
    {[0, 1].map(k => <svg key={k} className={`sb-book n${k}`} viewBox="0 0 60 34" aria-hidden="true">
      <path className="pg l" d="M30 30C22 23 12 22 2 26V8c10-4 20-3 28 4Z" fill="#FFF3D8" stroke="#CDB78A" strokeWidth="1" />
      <path className="pg r" d="M30 30c8-7 18-8 28-4V8C48 4 38 5 30 12Z" fill="#F4E4C1" stroke="#CDB78A" strokeWidth="1" />
      <path d="M30 11v20" stroke="#7C2946" strokeWidth="2.4" strokeLinecap="round" />
    </svg>)}
    <Bits n={26} cls="sb-dust" salt={5} />
    <i className="sb-shoot" />
    {cast && <><i className="sb-cast wick"><Wick /></i><i className="sb-cast page"><Page /></i></>}
  </>;
}

const CLOUD = 'M14 46a12 12 0 0 1 3-23.5A17 17 0 0 1 49 15a13 13 0 0 1 24 4a12.5 12.5 0 0 1 21 8.5A10 10 0 0 1 96 46Z';
const TOWERS: [number, number, number][] = [[0, 70, 60], [66, 50, 96], [120, 84, 44], [208, 58, 120], [270, 44, 70], [318, 90, 52], [412, 60, 104], [476, 76, 64], [556, 48, 132], [608, 86, 58], [698, 64, 88], [766, 52, 112], [822, 92, 48], [918, 82, 76]];
export function KiraScene({ cast = true }: { cast?: boolean }) {
  return <>
    <i className="kk-sun"><b className="rays" /><b className="disc" /></i>
    <Bits n={18} cls="kk-twinkle" salt={14} />
    {[0, 1, 2, 3, 4].map(k => <svg key={k} className={`kk-cloud n${k}`} viewBox="0 0 110 50" aria-hidden="true"><path d={CLOUD} fill="#FFC1D9" transform="translate(0 3)" /><path d={CLOUD} fill="#fff" /></svg>)}
    <i className="kk-streak a" /><i className="kk-streak b" />
    <svg className="kk-plane" viewBox="0 0 40 24" aria-hidden="true"><path d="M2 10 38 2 22 22 17 14Z" fill="#fff" stroke="#1B1430" strokeWidth="1.6" strokeLinejoin="round" /><path d="M17 14 38 2" stroke="#1B1430" strokeWidth="1.2" /></svg>
    <svg className="kk-city far" viewBox="0 0 1000 140" preserveAspectRatio="none" aria-hidden="true">{TOWERS.map(([x, w, h], i) => <rect key={i} x={x + 30} y={140 - h * .8} width={w * .9} height={h} />)}</svg>
    <i className="kk-rail"><b className="train" /></i>
    <svg className="kk-city" viewBox="0 0 1000 140" preserveAspectRatio="none" aria-hidden="true">
      {TOWERS.map(([x, w, h], i) => <g key={i}><rect x={x} y={140 - h} width={w} height={h} />
        {Array.from({ length: Math.floor(h / 16) * 3 }, (_, k) => rnd(k + i * 17, 91) > .45 ? <rect key={k} className="win" x={x + 8 + (k % 3) * ((w - 22) / 2)} y={140 - h + 9 + Math.floor(k / 3) * 16} width="6" height="8" style={{ animationDelay: `${-rnd(k + i * 17, 92) * 9}s` }} /> : null)}</g>)}
    </svg>
    <svg className="kk-wires" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true"><path d="M-10 40Q160 96 410 30M-10 62Q170 124 410 58M-10 84Q180 150 410 86" fill="none" stroke="#3B2A7A" strokeWidth="1.4" vectorEffect="non-scaling-stroke" /></svg>
    <i className="kk-pole" />
    <i className="kk-dots a" /><i className="kk-dots b" />
    <i className="kk-burst" />
    {cast && <><i className="kk-ledge" /><i className="kk-cast hoshi"><Hoshi /></i><i className="kk-cast mochi"><Mochi /></i></>}
  </>;
}

/* ───────── In the room ───────── */

/** The little friend who sits on top of the side panel, next to the room's name row. */
export function WorldPerch({ theme }: { theme: ThemeId }) {
  if (!isWorld(theme)) return null;
  return <span className="wt-perch" aria-hidden="true">{theme === 'spellbound' ? <Page /> : <Hoshi />}</span>;
}

/** What the empty screen shows in a world theme (before anything is playing). */
export function WorldEmpty({ theme }: { theme: WorldId }) {
  if (theme === 'spellbound') return <div className="wt-empty sb" aria-hidden="true">
    <svg className="wt-tome" viewBox="0 0 150 86">
      <ellipse cx="75" cy="80" rx="62" ry="5" fill="rgba(0,0,0,.35)" />
      <path d="M75 76C56 62 30 60 6 68V20C30 12 56 14 75 28Z" fill="#FFF3D8" /><path d="M75 76c19-14 45-16 69-8V20c-24-8-50-6-69 8Z" fill="#F4E4C1" />
      <path className="leaf" d="M75 76C60 60 40 54 22 54V10c18 0 38 6 53 18Z" fill="#FFFAEA" stroke="#DCC79C" strokeWidth="1" />
      <g stroke="#CDB78A" strokeWidth="1.6" strokeLinecap="round"><path d="M16 32q22-7 46 4M16 42q22-7 46 4M16 52q22-7 46 4M88 36q24-11 46-4M88 46q24-11 46-4M88 56q24-11 46-4" fill="none" /></g>
      <path d="M75 27v51" stroke="#7C2946" strokeWidth="4" strokeLinecap="round" /><path d="M6 68c24-8 50-6 69 8c19-14 45-16 69-8" fill="none" stroke="#7C2946" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
    <i className="rise a"><Spark /></i><i className="rise b"><Spark /></i><i className="rise c"><Spark /></i>
    <i className="who"><Wick mood="happy" /></i>
  </div>;
  return <div className="wt-empty kk" aria-hidden="true">
    <i className="pop a"><Spark /></i><i className="pop b"><Spark /></i>
    <i className="who"><Mochi mood="happy" /></i>
    <svg className="wt-clap" viewBox="0 0 110 86">
      <g className="arm"><rect x="8" y="6" width="94" height="17" rx="3.5" fill="#fff" stroke="#1B1430" strokeWidth="3" /><path d="M24 6l-9 17M46 6l-9 17M68 6l-9 17M90 6l-9 17" stroke="#1B1430" strokeWidth="6" /></g>
      <rect x="8" y="27" width="94" height="52" rx="6" fill="#FF4F9A" stroke="#1B1430" strokeWidth="3" />
      <path d="M48 42v22l19-11Z" fill="#fff" stroke="#1B1430" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  </div>;
}

/**
 * The room's companion and its reactions. Draws nothing over the video: the companion lives in the corner under the
 * side rail, bursts stay over the side panel, and the rest is done by <html data-room-fx / data-room-play> in CSS.
 */
export function WorldLayer({ theme, hasVideo, playing, members, chatCount, lastMine }: { theme: ThemeId; hasVideo: boolean; playing: boolean; members: number; chatCount: number; lastMine: boolean }) {
  const world = isWorld(theme) ? theme : null;
  const [mood, setMood] = useState<Mood>('idle');
  const [note, setNote] = useState<{ id: number; icon: string } | null>(null);
  const [burst, setBurst] = useState(0);
  const calm = useRef<ReturnType<typeof setTimeout>>();
  const fxOff = useRef<ReturnType<typeof setTimeout>>();
  const layer = useRef<HTMLDivElement>(null);

  // One reaction at a time: the page gets data-room-fx for a moment (CSS does the rest), the companion perks up.
  useEffect(() => {
    if (!world) return;
    const root = document.documentElement;
    const react = (kind: RoomFx) => {
      delete root.dataset.roomFx; void root.offsetWidth; root.dataset.roomFx = kind;
      clearTimeout(fxOff.current); fxOff.current = setTimeout(() => { delete root.dataset.roomFx; }, kind === 'celebrate' ? 2400 : 1500);
      const icon = kind === 'play' ? '♪' : kind === 'pause' ? '…' : kind === 'celebrate' ? '★' : kind === 'join' || kind === 'enter' ? '♥' : kind === 'message' ? '!' : '';
      if (icon) setNote({ id: Date.now(), icon });
      if (kind === 'celebrate') setBurst(Date.now());
      setMood(kind === 'pause' ? 'idle' : 'happy');
      clearTimeout(calm.current); calm.current = setTimeout(() => { setMood('idle'); setNote(null); }, kind === 'celebrate' ? 2400 : 1700);
    };
    const onFx = (e: Event) => react((e as CustomEvent<RoomFx>).detail);
    window.addEventListener('ourspace:fx', onFx);
    const hello = setTimeout(() => react('enter'), 500);
    return () => { window.removeEventListener('ourspace:fx', onFx); clearTimeout(hello); clearTimeout(calm.current); clearTimeout(fxOff.current); delete root.dataset.roomFx; };
  }, [world]);

  // Play and pause for the whole room: the backdrop holds still while the video is paused.
  const state = !hasVideo ? '' : playing ? 'playing' : 'paused';
  const was = useRef<string | null>(null);
  useEffect(() => {
    if (!world) return;
    const root = document.documentElement;
    if (state) root.dataset.roomPlay = state; else delete root.dataset.roomPlay;
    if (was.current !== null && was.current !== state && state) roomFx(state === 'playing' ? 'play' : 'pause');
    was.current = state;
    return () => { delete root.dataset.roomPlay; };
  }, [world, state]);

  // Someone new in the room; a message sent or arriving.
  const seen = useRef({ members, chatCount });
  useEffect(() => {
    const before = seen.current; seen.current = { members, chatCount };
    if (!world) return;
    if (members > before.members && before.members > 0) roomFx('join');
    if (chatCount === before.chatCount + 1) roomFx(lastMine ? 'send' : 'message');
  }, [world, members, chatCount, lastMine]);

  // Five quiet minutes and the companion nods off; any movement wakes it. A small spark where you click.
  useEffect(() => {
    if (!world) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let nap: ReturnType<typeof setTimeout>;
    const awake = () => { clearTimeout(nap); setMood(m => (m === 'sleep' ? 'idle' : m)); nap = setTimeout(() => setMood('sleep'), 5 * 60_000); };
    const click = (e: PointerEvent) => {
      awake();
      const el = e.target as HTMLElement | null; const host = layer.current;
      if (still || !host || !el?.closest?.('.room') || el.closest('.screen')) return;
      const dot = document.createElement('i'); dot.className = 'wt-click'; dot.style.left = `${e.clientX}px`; dot.style.top = `${e.clientY}px`;
      host.appendChild(dot); setTimeout(() => dot.remove(), 600);
    };
    awake();
    window.addEventListener('pointerdown', click); window.addEventListener('keydown', awake);
    return () => { clearTimeout(nap); window.removeEventListener('pointerdown', click); window.removeEventListener('keydown', awake); };
  }, [world]);

  if (!world) return null;
  return <div className={`wt-layer wt-${world}`} ref={layer} aria-hidden="true">
    <div className={`wt-pet is-${mood}`}>
      {world === 'spellbound' ? <Wick mood={mood} /> : <Mochi mood={mood} />}
      {mood === 'sleep' ? <span className="wt-zzz"><b>z</b><b>z</b><b>z</b></span> : note && <span className="wt-note" key={note.id}>{note.icon}</span>}
    </div>
    {burst > 0 && <div className="wt-burst" key={burst}>{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ '--x': rnd(i, 3), '--y': rnd(i, 4), '--s': rnd(i, 5), '--t': rnd(i, 6) } as CSSProperties}><Spark /></i>)}{world === 'kirakira' && <b className="wt-yay">NICE!</b>}</div>}
    <i className="wt-courier">{world === 'spellbound' ? <Page flying /> : <Spark />}</i>
  </div>;
}
