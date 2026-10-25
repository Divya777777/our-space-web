// The shared YouTube player. Same sync rules as the phone app: the room state is the truth, the person's own taps on
// the player are sent to the room, and their intent wins over older room snapshots until the server echoes it.
import { useEffect, useRef, useState } from 'react';
import { Playback, positionNow } from '../lib/model';

type YTPlayer = {
  getCurrentTime(): number; getPlayerState(): number; getVideoData(): { video_id: string; title: string };
  loadVideoById(o: { videoId: string; startSeconds?: number }): void; cueVideoById(o: { videoId: string; startSeconds?: number }): void;
  seekTo(s: number, allow: boolean): void; playVideo(): void; pauseVideo(): void; setVolume(v: number): void; destroy(): void;
};
type YTNamespace = { Player: new (el: HTMLElement, o: Record<string, unknown>) => YTPlayer };
declare global { interface Window { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void } }
let apiPromise: Promise<YTNamespace> | null = null;
function loadApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) apiPromise = new Promise(resolve => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT!); };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s);
  });
  return apiPromise;
}

export type PlayerEvents = {
  onTitle?: (videoId: string, title: string) => void;
  onPosition?: (seconds: number) => void;
  onEnded?: (videoId: string) => void;
  onUserControl?: (action: 'play' | 'pause' | 'seek', position: number) => void;
  onError?: (message: string) => void;
};
export default function YouTubePlayer({ playback, volume = 100, events }: { playback: Playback; volume?: number; events: PlayerEvents }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const ev = useRef(events); useEffect(() => { ev.current = events; });
  const st = useRef({ expected: null as number | null, quietUntil: 0, lastTick: null as null | { t: number; at: number; st: number }, cued: '', lastTitle: '' });
  const intent = useRef<{ playing: boolean; position: number; at: number } | null>(null);
  const initial = useRef(playback);

  useEffect(() => {
    let alive = true; let timer: ReturnType<typeof setInterval>;
    const reportTitle = () => { const p = player.current; if (!p?.getVideoData) return; const d = p.getVideoData(); if (d?.title && st.current.lastTitle !== d.video_id + d.title) { st.current.lastTitle = d.video_id + d.title; ev.current.onTitle?.(d.video_id, d.title); } };
    const user = (action: 'play' | 'pause' | 'seek', position: number) => {
      intent.current = { playing: action === 'seek' ? (intent.current?.playing ?? initial.current.playing) : action === 'play', position, at: Date.now() };
      ev.current.onUserControl?.(action, position);
    };
    void loadApi().then(YT => {
      if (!alive || !host.current) return;
      const el = document.createElement('div'); host.current.appendChild(el);
      const start = initial.current;
      player.current = new YT.Player(el, {
        videoId: start.videoId, width: '100%', height: '100%',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: window.location.origin, start: Math.floor(positionNow(start)) },
        events: {
          onReady: () => { if (!alive) return; setReady(true); reportTitle(); },
          onStateChange: (e: { data: number }) => {
            const p = player.current!; reportTitle();
            if (e.data === 0) { ev.current.onEnded?.(p.getVideoData().video_id); return; }
            if (Date.now() < st.current.quietUntil) return;
            if (e.data === 2 && st.current.expected !== 2) { st.current.expected = 2; user('pause', p.getCurrentTime()); }
            else if (e.data === 1 && st.current.expected === 2) { st.current.expected = 1; user('play', p.getCurrentTime()); }
          },
          onError: (e: { data: number }) => ev.current.onError?.(e.data === 101 || e.data === 150 ? 'The owner of this video doesn’t allow it to play outside YouTube. Pick another one.' : `YouTube can’t play this video here (error ${e.data}).`),
        },
      });
      // Seek detection: YouTube has no seek event. Compare against the last settled sample, skipping buffering.
      timer = setInterval(() => {
        const p = player.current; if (!p?.getCurrentTime) return;
        const t = p.getCurrentTime(), n = Date.now(), s = p.getPlayerState?.() ?? -1, last = st.current.lastTick;
        if (s === 1 || s === 2) {
          if (last && n > st.current.quietUntil) { const el = last.st === 1 ? (n - last.at) / 1000 : 0; if (t < last.t - 1.5 || t > last.t + el + 2.5) { st.current.quietUntil = n + 1500; user('seek', t); } }
          st.current.lastTick = { t, at: n, st: s };
        }
        ev.current.onPosition?.(t); reportTitle();
      }, 700);
    });
    return () => { alive = false; clearInterval(timer); try { player.current?.destroy(); } catch { /* gone */ } player.current = null; };
  }, []);

  useEffect(() => { if (ready) player.current?.setVolume(Math.max(0, Math.min(100, volume))); }, [ready, volume]);

  const { videoId, playing, position, updatedAt, revision } = playback;
  useEffect(() => {
    if (!ready) return;
    const apply = () => {
      const p = player.current; if (!p?.getVideoData) return;
      const state = { videoId, playing, position, updatedAt, revision, updatedBy: '' };
      const mine = intent.current;
      if (mine) {
        const age = Date.now() - mine.at;
        const expectedPos = mine.position + (mine.playing ? age / 1000 : 0);
        if ((state.playing === mine.playing && Math.abs(positionNow(state) - expectedPos) < 3) || age > 8000) intent.current = null; else return;
      }
      const s = st.current; const pos = positionNow(state);
      s.expected = playing ? 1 : 2; s.lastTick = null;
      const id = p.getVideoData().video_id; const ps = p.getPlayerState?.() ?? -1;
      if (id !== videoId) {
        s.quietUntil = Date.now() + 2500; s.cued = '';
        if (playing) p.loadVideoById({ videoId, startSeconds: pos }); else { s.quietUntil = 0; s.cued = videoId; p.cueVideoById({ videoId, startSeconds: pos }); }
        return;
      }
      if (!playing && (ps === -1 || ps === 5)) { if (s.cued !== videoId) { s.cued = videoId; p.cueVideoById({ videoId, startSeconds: pos }); } return; }
      s.cued = '';
      if (Math.abs(p.getCurrentTime() - pos) > 2) { s.quietUntil = Date.now() + 1200; p.seekTo(pos, true); }
      if (playing) { if (ps !== 1 && ps !== 3) { s.quietUntil = Date.now() + 1200; p.playVideo(); } }
      else if (ps === 1 || ps === 3) { s.quietUntil = Date.now() + 1200; p.pauseVideo(); }
    };
    apply(); const t = setInterval(apply, 5000); return () => clearInterval(t);
  }, [ready, videoId, playing, position, updatedAt, revision]);

  return <div className="yt-host" ref={host} />;
}
