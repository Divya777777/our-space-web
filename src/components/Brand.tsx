// The Our Space star mark and lowercase wordmark (brand kit: lavender star, ivory "our space").
let n = 0;
export function Star({ size = 28, glow = false }: { size?: number; glow?: boolean }) {
  const id = `star-${++n}`;
  return <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={glow ? { filter: 'drop-shadow(0 0 18px rgba(200,182,255,.55))' } : undefined}>
    <defs>
      <linearGradient id={id} x1="0.25" y1="0" x2="0.75" y2="1">
        <stop offset="0" stopColor="#FFFFFF" /><stop offset="0.38" stopColor="#ECE3FF" /><stop offset="0.72" stopColor="#C8B6FF" /><stop offset="1" stopColor="#B49BFF" />
      </linearGradient>
    </defs>
    <path d="M50 2 C53 38 62 47 98 50 C62 53 53 62 50 98 C47 62 38 53 2 50 C38 47 47 38 50 2 Z" fill={`url(#${id})`} />
  </svg>;
}
export function Wordmark({ size = 22 }: { size?: number }) {
  return <span className="row" style={{ gap: size * 0.45 }} aria-label="Our Space">
    <Star size={size * 1.25} />
    <span style={{ fontSize: size, fontWeight: 700, letterSpacing: '-0.04em', color: 'var(--text)', lineHeight: 1 }}>our space</span>
  </span>;
}
