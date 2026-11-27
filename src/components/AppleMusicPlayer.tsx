// The shared Apple Music player (web). Same sync rules as the YouTube player: the room state is the truth, your own
// taps go to the room, and your intent wins over older room snapshots until the server echoes it.
// Apple's rules: each person starts listening themselves (one tap on "Listen along"), and there are normal controls.
import { useEffect, useRef, useState } from 'react';
import type { Playback } from '../lib/model';
import { positionNow } from '../lib/model';
import { useSpace } from '../lib/space';
import type { PlayerEvents } from './YouTubePlayer';
import { appleCatalogId, appleSong, connectAppleMusic, loadMusicKit, lookupSongs, musicKit, NOTE_ART, useAppleMusic, useAppleSongs } from '../lib/appleMusic';
import type { MusicKitInstance } from '../lib/appleMusic';
import { Icon } from './Icon';

const fmt = (s: number) => { const t = Math.max(0, Math.floor(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

export default function AppleMusicPlayer({ playback, volume = 100, events }: { playback: Playback; volume?: number; events: PlayerEvents; nudge?: number }) {
  const space = useSpace();
  const am = useAppleMusic(); useAppleSongs();
  const [joined, setJoined] = useState(false);
  const [time, setTime] = useState(positionNow(playback));
  const [dur, setDur] = useState(0);
  const [note, setNote] = useState('');
  const ev = useRef(events); useEffect(() => { ev.current = events; });
  const intent = useRef<{ playing: boolean; position: number; at: number } | null>(null);
  const st = useRef({ expected: null as null | boolean, quietUntil: 0, loading: '' });
  const { videoId, playing, position, updatedAt, revision } = playback;
  const playingRef = useRef(playing); useEffect(() => { playingRef.current = playing; });
  // The song that just finished here: don't load it again while the room moves on to Up next.
  const done = useRef('');
  const song = appleSong(videoId);

  useEffect(() => { lookupSongs(space.api, [videoId]); void loadMusicKit(space.api).catch(() => {}); }, [videoId, space.api]);
  useEffect(() => { if (song?.title) ev.current.onTitle?.(videoId, song.title); }, [videoId, song?.title]);

  const user = (action: 'play' | 'pause' | 'seek', at: number) => {
    intent.current = { playing: action === 'seek' ? (intent.current?.playing ?? playing) : action === 'play', position: at, at: Date.now() };
    ev.current.onUserControl?.(action, at);
  };

  // Events from MusicKit: the song finished, or someone used the keyboard's media keys / the browser's controls.
  useEffect(() => {
    const mk = musicKit(); if (!mk || !joined) return;
    const states = window.MusicKit?.PlaybackStates || {};
    const id = appleCatalogId(videoId);
    // Last thing heard from the player: when the last song in MusicKit's queue ends, nowPlayingItem is already gone,
    // so "it was our song and it was near its end" is how we know it finished (then the room plays Up next).
    const last = { id: '', time: 0, dur: 0, sent: false, idle: 0 };
    const finished = () => { if (last.sent) return; last.sent = true; done.current = videoId; ev.current.onEnded?.(videoId); };
    const nearEnd = () => last.id === id && last.dur > 0 && last.time > last.dur - 3;
    const onState = (e: { state?: number }) => {
      if (e.state === states.completed || e.state === states.ended || (e.state === states.stopped && nearEnd())) { if (mk.nowPlayingItem?.id === id || nearEnd()) finished(); return; }
      if (Date.now() < st.current.quietUntil) return;
      if (e.state === states.paused && st.current.expected !== false) { st.current.expected = false; user('pause', mk.currentPlaybackTime); }
      else if (e.state === states.playing && st.current.expected === false) { st.current.expected = true; user('play', mk.currentPlaybackTime); }
    };
    mk.addEventListener('playbackStateDidChange', onState);
    const tick = setInterval(() => {
      const t = mk.currentPlaybackTime || 0, d = mk.currentPlaybackDuration || 0, now = mk.nowPlayingItem?.id;
      if (now === id) { last.id = id; if (t > 0) last.time = t; if (d > 0) last.dur = d; }
      // Safety net: the room says playing, our song was at its end and the player has gone quiet for ~2 s.
      if (playingRef.current && nearEnd() && !mk.isPlaying && Date.now() > st.current.quietUntil) { if (++last.idle >= 3) finished(); } else last.idle = 0;
      setTime(t); setDur(d); ev.current.onPosition?.(t);
    }, 700);
    return () => { mk.removeEventListener('playbackStateDidChange', onState); clearInterval(tick); };
  }, [joined, videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const mk = musicKit(); if (mk && joined) mk.volume = Math.max(0, Math.min(1, volume / 100)); }, [volume, joined]);

  // Start a song in one step: MusicKit loads it already at the right second and starts as soon as it can.
  // (It used to load paused, then seek — a second buffering — then press play: 3–4 s before any sound.)
  // Loading takes a moment, so it lands on where the room is *now*, not where it was when loading began.
  async function startSong(mk: MusicKitInstance, id: string, state: Playback) {
    const at = positionNow(state);
    await mk.setQueue({ song: id, startPlaying: state.playing, ...(at > 1 ? { startTime: at } : {}) });
    const now = positionNow(state);
    if (Math.abs((mk.currentPlaybackTime || 0) - now) > 2) await mk.seekToTime(now);
    if (state.playing && !mk.isPlaying) await mk.play();
    else if (!state.playing && mk.isPlaying) mk.pause();
  }

  // Follow the room.
  useEffect(() => {
    if (!joined) return;
    let alive = true;
    const apply = async () => {
      const mk = musicKit(); if (!mk || !alive) return;
      const state = { videoId, playing, position, updatedAt, revision, updatedBy: '' };
      const mine = intent.current;
      if (mine) {
        const age = Date.now() - mine.at, expectedPos = mine.position + (mine.playing ? age / 1000 : 0);
        if ((state.playing === mine.playing && Math.abs(positionNow(state) - expectedPos) < 3) || age > 8000) intent.current = null; else return;
      }
      const pos = positionNow(state), id = appleCatalogId(videoId), s = st.current;
      s.expected = playing;
      try {
        if (mk.nowPlayingItem?.id !== id) {
          if (done.current === videoId && pos < 5) done.current = ''; // the room started it again from the top
          if (s.loading === id || done.current === videoId) return;
          s.loading = id; s.quietUntil = Date.now() + 4000;
          await startSong(mk, id, state);
          s.loading = '';
          setNote(mk.previewOnly ? 'You’re hearing a preview. With an Apple Music subscription you hear the full song.' : '');
          return;
        }
        if (Math.abs((mk.currentPlaybackTime || 0) - pos) > 2) { s.quietUntil = Date.now() + 1500; await mk.seekToTime(pos); }
        if (playing && !mk.isPlaying) { s.quietUntil = Date.now() + 1500; await mk.play(); }
        else if (!playing && mk.isPlaying) { s.quietUntil = Date.now() + 1500; mk.pause(); }
      } catch (e) {
        s.loading = '';
        ev.current.onError?.(/CONTENT_RESTRICTED|CONTENT_UNAVAILABLE|not available/i.test(String((e as Error)?.message || e)) ? 'This song isn’t available on Apple Music in your country. Pick another one.' : 'Apple Music couldn’t play this song right now.');
      }
    };
    void apply(); const t = setInterval(() => { void apply(); }, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [joined, videoId, playing, position, updatedAt, revision]);

  // Leaving the room or switching to a YouTube video: stop the music on this computer.
  useEffect(() => () => { try { musicKit()?.pause(); } catch { /* not started */ } }, []);

  // Browsers only start sound from a tap, so the first song starts right here (Apple's sign-in window, if it was
  // needed, uses up that tap; then the button says "Listen along" and the next tap starts the music).
  const join = async () => {
    setNote('');
    if (!am.connected) { await connectAppleMusic(space.api); return; }
    try {
      const mk = await loadMusicKit(space.api), id = appleCatalogId(videoId);
      st.current.loading = id; st.current.quietUntil = Date.now() + 4000; st.current.expected = playing;
      await startSong(mk, id, playback);
      setNote(mk.previewOnly ? 'You’re hearing a preview. With an Apple Music subscription you hear the full song.' : '');
      setJoined(true);
    } catch { ev.current.onError?.('Apple Music couldn’t play this song right now.'); }
    finally { st.current.loading = ''; }
  };
  const shownTime = joined ? time : positionNow(playback);
  const length = dur || song?.durationSeconds || 0;
  return <div className="am-player" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,auto) minmax(0,1fr)', gap: 18, alignItems: 'center', padding: 18, height: '100%', background: 'linear-gradient(135deg, rgba(250,92,124,.18), rgba(169,139,255,.18))', borderRadius: 'inherit' }}>
    <img src={song?.art || NOTE_ART} alt="" style={{ width: 'min(38vw, 220px)', aspectRatio: '1', borderRadius: 14, objectFit: 'cover', boxShadow: '0 10px 30px rgba(0,0,0,.35)' }} />
    <div className="col gap-8" style={{ minWidth: 0 }}>
      <p className="tiny muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="music" size={14} /> Apple Music</p>
      <p className="ellipsis" style={{ fontSize: 20, fontWeight: 700 }}>{song?.title || 'Loading song…'}</p>
      {song?.artist && <p className="small muted ellipsis">{song.artist}</p>}
      {!joined ? <div className="col gap-8" style={{ marginTop: 6 }}>
        <button type="button" className="btn primary" disabled={am.loading} onClick={() => void join()}>{am.connected ? 'Listen along' : 'Connect Apple Music'}</button>
        <p className="tiny muted">{am.server === 'off' ? 'Apple Music isn’t switched on for this server yet.' : am.connected ? 'Plays on this computer with your Apple Music, in sync with the room.' : 'Sign in with your Apple Music account once. Everyone listens with their own subscription.'}</p>
        {am.error && <p className="tiny" style={{ color: 'var(--danger, #ff6b6b)' }}>{am.error}</p>}
      </div> : <>
        <input type="range" aria-label="Song position" min={0} max={Math.max(1, Math.round(length))} step={1} value={Math.min(Math.round(shownTime), Math.round(length) || 0)} onChange={e => user('seek', Number(e.target.value))} style={{ width: '100%', accentColor: '#fa5c7c' }} />
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="tiny muted">{fmt(shownTime)}</span><span className="tiny muted">{length ? fmt(length) : ''}</span></div>
        <div className="row gap-8">
          <button type="button" className="btn primary" aria-label={playing ? 'Pause for everyone' : 'Play for everyone'} onClick={() => user(playing ? 'pause' : 'play', musicKit()?.currentPlaybackTime || shownTime)}><Icon name={playing ? 'pause' : 'play'} size={18} /> {playing ? 'Pause' : 'Play'}</button>
        </div>
        {note && <p className="tiny muted">{note}</p>}
      </>}
    </div>
  </div>;
}
export type { MusicKitInstance };
