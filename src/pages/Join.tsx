// /join?code=ABC123 — asks to join, then waits (live) for the admin's answer.
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSpace } from '../lib/space';
import { Button, Notice } from '../components/ui';
import { Star } from '../components/Brand';
import { JoinRoomSheet } from '../components/RoomBits';

export default function Join() {
  const space = useSpace();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const code = (params.get('code') || '').toUpperCase();
  const [state, setState] = useState<'asking' | 'waiting' | 'declined' | 'error'>('asking');
  const [error, setError] = useState('');
  const [again, setAgain] = useState(0);
  useEffect(() => {
    if (!/^[A-Z0-9]{6}$/.test(code)) { setState('error'); setError('That isn’t a valid room code.'); return; }
    if (space.rooms.some(r => r.code === code)) { nav(`/room/${code}`, { replace: true }); return; }
    const abort = new AbortController(); let alive = true;
    (async () => {
      try {
        setState('asking');
        if (await space.join(code)) { nav(`/room/${code}`, { replace: true }); return; }
        setState('waiting');
        let cursor: number | undefined;
        while (alive) {
          try {
            const r = await space.joinStatus(code, cursor, abort.signal);
            cursor = r.cursor;
            if (r.status === 'approved') { await space.getRoom(code); nav(`/room/${code}`, { replace: true }); return; }
            if (r.status === 'declined') { setState('declined'); return; }
          } catch (e) { if (!alive) return; if ((e as { status?: number }).status === 404) throw e; await new Promise(r => setTimeout(r, 2000)); }
        }
      } catch (e) { if (alive) { setState('error'); setError((e as { status?: number }).status === 404 ? 'We couldn’t find a room with that code. Check it with the person who sent it.' : (e as Error).message); } }
    })();
    return () => { alive = false; abort.abort(); };
    // Run once per code (and on retry).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, again]);
  const [enter, setEnter] = useState(false);
  return <div className="page narrow">
    <div className="glass window col gap-20" style={{ padding: 40, marginTop: '8vh', alignItems: 'center', textAlign: 'center' }}>
      <div className={state === 'waiting' ? 'ring' : ''}><Star size={56} glow /></div>
      <p className="muted small">Room code</p>
      <p style={{ fontSize: 32, letterSpacing: '.3em', fontWeight: 600, marginTop: -12 }}>{code || '——'}</p>
      {state === 'asking' && <p className="lead">Asking to join…</p>}
      {state === 'waiting' && <><h1 className="title">Waiting for the admin</h1><p className="lead">They’ve been told you’re here. This page opens the room by itself as soon as they let you in — you can keep it open in a tab.</p></>}
      {state === 'declined' && <><h1 className="title">Not this time</h1><p className="lead">The admin didn’t let you in. If that seems wrong, ask them and try again.</p><Button onClick={() => setAgain(n => n + 1)}>Ask again</Button></>}
      {state === 'error' && <><Notice tone="error">{error}</Notice><Button variant="secondary" onClick={() => setEnter(true)}>Enter a different code</Button></>}
      <Button variant="ghost" onClick={() => nav('/')}>Back home</Button>
    </div>
    {enter && <JoinRoomSheet onClose={() => setEnter(false)} />}
  </div>;
}
