// Covers that are never blank: real video artwork when a room or playlist has any (one poster, or a 2×2 mosaic),
// otherwise a slow animated "orbit" artwork generated from the name.
import React, { useRef, useState } from 'react';
import type { Playlist, Room } from '../lib/model';
import { Star } from './Brand';

const PALETTES = [
  ['#1C1440', '#5A44A8', '#E9B8D8'], ['#0B2230', '#2E6F78', '#B6DDCF'], ['#22122E', '#8A4B7A', '#F2AAAA'],
  ['#141B36', '#4F5FA8', '#C8B6FF'], ['#221A0E', '#8C6A2E', '#E6C994'], ['#0B1A2A', '#2B4F86', '#A9C8F5'],
];
const MOODS: [RegExp, number][] = [[/movie|film|cinema|popcorn/i, 3], [/rain|monsoon|baarish|blue/i, 5], [/sun|golden|chai|summer|goa/i, 4], [/love|heart|us\b|dil/i, 2], [/study|focus|lofi|calm/i, 1], [/night|moon|star|midnight|dream/i, 0]];
const hash = (s: string) => [...s].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 5381);
export const paletteFor = (name: string) => PALETTES[MOODS.find(([re]) => re.test(name))?.[1] ?? hash(name || 'space') % PALETTES.length];

/** Distinct videos that represent a room: what's playing, what's queued, then its shared playlists. */
export function roomVideos(room: Room, playlists: Playlist[]) {
  const ids = [room.playback?.videoId, ...(room.queue || []).map(q => q.videoId), ...playlists.filter(p => p.roomCode === room.code).flatMap(p => p.tracks.map(t => t.videoId))];
  return [...new Set(ids.filter(Boolean) as string[])];
}

function Thumb({ id, onFail }: { id: string; onFail: () => void }) {
  const [src, setSrc] = useState(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
  return <img src={src} alt="" loading="lazy" decoding="async" draggable={false}
    onError={() => { if (src.includes('hqdefault')) setSrc(`https://i.ytimg.com/vi/${id}/mqdefault.jpg`); else onFail(); }} />;
}

export function CoverArt({ name, videos = [], videoId }: { name: string; videos?: string[]; videoId?: string | null }) {
  const [failed, setFailed] = useState<string[]>([]);
  const list = [...new Set([videoId, ...videos].filter(Boolean) as string[])].filter(v => !failed.includes(v));
  const fail = (id: string) => setFailed(f => [...f, id]);
  if (list.length >= 4) return <div className="cover-art mosaic">{list.slice(0, 4).map(id => <Thumb key={id} id={id} onFail={() => fail(id)} />)}</div>;
  if (list.length) return <div className="cover-art poster"><Thumb id={list[0]} onFail={() => fail(list[0])} /></div>;
  return <OrbitArt name={name} />;
}

/** Generated artwork: aurora wash, dotted orbits turning at different speeds, a planet and the star. */
export function OrbitArt({ name }: { name: string }) {
  const h = hash(name || 'space');
  const [a, b, c] = paletteFor(name);
  const x = 30 + (h % 40), y = 30 + ((h >> 5) % 35), planet = 22 + (h % 16);
  return <div className="cover-art orbit" style={{ '--a': a, '--b': b, '--c': c, '--x': `${x}%`, '--y': `${y}%` } as React.CSSProperties}>
    <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g style={{ transformOrigin: `${x * 1.6}px ${y * 0.9}px` }}>
        {[34, 52, 74].map((r, i) => <ellipse key={r} className={`ring r${i}`} cx={x * 1.6} cy={y * 0.9} rx={r} ry={r * 0.36} fill="none" stroke={c} strokeOpacity={0.5 - i * 0.12} strokeWidth="0.7" strokeDasharray="0.6 2.6" strokeLinecap="round" style={{ transformOrigin: `${x * 1.6}px ${y * 0.9}px` }} />)}
      </g>
      <circle cx={x * 1.6} cy={y * 0.9} r={planet / 2} fill={`url(#p${h})`} />
      <defs><radialGradient id={`p${h}`} cx="35%" cy="30%"><stop offset="0" stopColor="#fff" stopOpacity=".9" /><stop offset=".35" stopColor={c} /><stop offset="1" stopColor={b} /></radialGradient></defs>
      {Array.from({ length: 14 }, (_, i) => { const sx = (h >> i) % 160, sy = ((h * (i + 3)) >> 3) % 90; return <circle key={i} className="twinkle" style={{ animationDelay: `${i * 0.37}s` }} cx={sx} cy={sy} r={0.5 + (i % 3) * 0.3} fill="#F4F1EA" />; })}
    </svg>
    <span className="orbit-star"><Star size={22} glow /></span>
  </div>;
}

/** Hover depth for cards: tilts toward the pointer and moves a soft light across the surface. */
export function useTilt<T extends HTMLElement>(strength = 7) {
  const ref = useRef<T>(null);
  const onPointerMove = (e: React.PointerEvent) => {
    const el = ref.current; if (!el || e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${(0.5 - py) * strength}deg`); el.style.setProperty('--ry', `${(px - 0.5) * strength}deg`);
    el.style.setProperty('--mx', `${px * 100}%`); el.style.setProperty('--my', `${py * 100}%`);
  };
  const onPointerLeave = () => { const el = ref.current; if (!el) return; el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); };
  return { ref, onPointerMove, onPointerLeave };
}
