// Living backdrop and the hero centrepiece, drawn on canvas.
// Starfield: slow parallax stars that drift with the pointer. Globe: a rotating point-cloud planet with two
// companion lights orbiting it (the brand's "two people, one space").
import { useEffect, useRef } from 'react';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number, pointer: { x: number; y: number }) => void, deps: unknown[] = []) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let w = 0, h = 0, raf = 0, visible = true;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const size = () => { const r = canvas.getBoundingClientRect(); const d = Math.min(2, devicePixelRatio || 1); w = r.width; h = r.height; canvas.width = w * d; canvas.height = h * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
    size();
    const ro = new ResizeObserver(size); ro.observe(canvas);
    const move = (e: PointerEvent) => { pointer.tx = e.clientX / innerWidth - 0.5; pointer.ty = e.clientY / innerHeight - 0.5; };
    addEventListener('pointermove', move, { passive: true });
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(canvas);
    const still = reduced();
    const start = performance.now();
    const frame = (now: number) => {
      pointer.x += (pointer.tx - pointer.x) * 0.04; pointer.y += (pointer.ty - pointer.y) * 0.04;
      if (visible && !document.hidden) { ctx.clearRect(0, 0, w, h); draw(ctx, w, h, still ? 0 : (now - start) / 1000, pointer); }
      if (!still) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); removeEventListener('pointermove', move); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/** Fixed full-screen star field with depth layers and the occasional shooting star. */
export function Starfield() {
  const stars = useRef(Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random(), tw: Math.random() * 6.28, hue: Math.random() < 0.18 ? 1 : 0 })));
  const shoot = useRef({ at: 4, x: 0, y: 0 });
  const ref = useCanvas((ctx, w, h, t, p) => {
    for (const s of stars.current) {
      const depth = 0.25 + s.z * 0.75;
      const x = ((s.x * w + t * 4 * depth - p.x * 40 * depth) % w + w) % w;
      const y = ((s.y * h - p.y * 30 * depth) % h + h) % h;
      const a = (0.25 + 0.55 * depth) * (0.7 + 0.3 * Math.sin(t * 1.4 + s.tw));
      ctx.fillStyle = s.hue ? `rgba(214,198,255,${a})` : `rgba(244,241,234,${a * 0.85})`;
      const r = 0.35 + depth * 1.05;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
    }
    // A shooting star every ~9 seconds.
    const sh = shoot.current; const k = t - sh.at;
    if (k > 0 && k < 1.1) {
      if (!sh.x) { sh.x = 0.2 + Math.random() * 0.6; sh.y = 0.05 + Math.random() * 0.3; }
      const x = sh.x * w + k * 520, y = sh.y * h + k * 210, len = 120;
      const g = ctx.createLinearGradient(x, y, x - len, y - len * 0.4);
      g.addColorStop(0, `rgba(244,241,234,${0.8 * (1 - k)})`); g.addColorStop(1, 'rgba(244,241,234,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len, y - len * 0.4); ctx.stroke();
    } else if (k >= 1.1) { sh.at = t + 6 + Math.random() * 7; sh.x = 0; }
  });
  return <canvas ref={ref} className="starfield" aria-hidden="true" />;
}

/** The hero planet: ~1400 points on a sphere, lit from the upper left, with two companion lights in orbit. */
export function OrbitGlobe({ size = 560 }: { size?: number }) {
  const pts = useRef((() => {
    const out: { lat: number; lon: number; c: number }[] = []; const n = 1500;
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.39996;
      // Continents: denser, warmer bands from a cheap noise.
      const lon = Math.atan2(Math.sin(th) * r, Math.cos(th) * r), lat = Math.asin(y);
      const land = Math.sin(lon * 3 + Math.sin(lat * 4) * 1.6) + Math.sin(lat * 5 + lon * 1.3) > 0.55 ? 1 : 0;
      out.push({ lat, lon, c: land });
    }
    return out;
  })());
  const ref = useCanvas((ctx, w, h, t, p) => {
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.36;
    // Atmosphere glow.
    const glow = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.2, cx, cy, R * 1.55);
    glow.addColorStop(0, 'rgba(200,182,255,0.30)'); glow.addColorStop(0.55, 'rgba(124,98,214,0.16)'); glow.addColorStop(1, 'rgba(124,98,214,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, R * 1.55, 0, 6.283); ctx.fill();
    const rot = t * 0.12 + p.x * 0.8, tilt = -0.32 + p.y * 0.3;
    const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
    // Back orbit ring (behind the planet).
    const ring = (front: boolean) => {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.38);
      ctx.strokeStyle = 'rgba(200,182,255,0.4)'; ctx.lineWidth = 1.2; ctx.setLineDash([1.5, 5]);
      ctx.beginPath(); ctx.ellipse(0, 0, R * 1.62, R * 0.42, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); ctx.stroke(); ctx.restore();
    };
    ring(false);
    for (const q of pts.current) {
      const lon = q.lon + rot;
      let x = Math.cos(q.lat) * Math.sin(lon), y = Math.sin(q.lat), z = Math.cos(q.lat) * Math.cos(lon);
      const y2 = y * cosT - z * sinT; z = y * sinT + z * cosT; y = y2;
      if (z < -0.05) continue;
      const light = Math.max(0, x * -0.55 + y * -0.5 + z * 0.67);
      const a = Math.min(1, (0.28 + 0.95 * light) * (0.5 + 0.6 * z));
      ctx.fillStyle = q.c ? `rgba(244,226,190,${a})` : `rgba(200,182,255,${a * 0.85})`;
      const r = (q.c ? 2.1 : 1.5) * (0.65 + 0.6 * z);
      x = cx + x * R; const py = cy + y * R;
      ctx.fillRect(x - r / 2, py - r / 2, r, r);
    }
    ring(true);
    // Two companion lights on the orbit.
    for (const [k, col] of [[0, '200,182,255'], [Math.PI * 0.86, '182,221,207']] as const) {
      const a = t * 0.35 + k; const ex = Math.cos(a) * R * 1.62, ey = Math.sin(a) * R * 0.42;
      const x = cx + ex * Math.cos(-0.38) - ey * Math.sin(-0.38), y = cy + ex * Math.sin(-0.38) + ey * Math.cos(-0.38);
      const behind = Math.sin(a) < 0 && Math.hypot(x - cx, y - cy) < R; if (behind) continue;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 16); g.addColorStop(0, `rgba(${col},0.95)`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 16, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 6.283); ctx.fill();
    }
  });
  return <canvas ref={ref} className="globe" style={{ width: '100%', maxWidth: size, aspectRatio: '1' }} aria-hidden="true" />;
}
