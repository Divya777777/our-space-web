// A soft, blurred glow of video thumbnails behind a whole page (the room's video, or on Home the featured room's
// videos, one after another with a slow cross-fade). Purely decorative.
import { useEffect, useState } from 'react';

export function Ambient({ ids, every = 9000 }: { ids: string[]; every?: number }) {
  const list = ids.slice(0, 6);
  const key = list.join(',');
  const [i, setI] = useState(0);
  useEffect(() => { setI(0); if (list.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return; const t = setInterval(() => setI(n => (n + 1) % list.length), every); return () => clearInterval(t); }, [key, every]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!list.length) return null;
  return <div className="ambient" aria-hidden="true">
    {list.map((id, n) => <img key={id} className={n === i ? 'on' : ''} src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" />)}
  </div>;
}
