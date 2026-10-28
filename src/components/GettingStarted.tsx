// Home for a brand-new account (no rooms yet), and a short checklist afterwards until the basics are done.
import { useState } from 'react';
import { useSpace } from '../lib/space';
import { Button, IconButton, firstName } from './ui';
import { Icon, IconName } from './Icon';
import { OrbitGlobe } from './Space';

/** Shown on Home when the account has no rooms: what Our Space is, in three steps, and how to start. */
export function FirstRun({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  const space = useSpace();
  const steps: [IconName, string, string][] = [
    ['plus', 'Create a room', 'Give it a name. It’s private — only people you let in can see it.'],
    ['share', 'Invite your person', 'Send them the link or the six-letter code. You approve them once.'],
    ['play', 'Press play together', 'Pick any YouTube video. It plays for both of you at the same moment. Call on top.'],
  ];
  return <section className="first-run glass window">
    <div className="first-run-globe" aria-hidden="true"><OrbitGlobe size={420} /></div>
    <div className="first-run-copy">
      <p className="muted">Welcome, {firstName(space.user.name)}</p>
      <h2 className="featured-title">Your space<br />is ready.</h2>
      <ol className="journey">
        {steps.map(([icon, title, body], i) => <li key={title} className={i === 0 ? 'now' : ''}>
          <span className="journey-dot"><Icon name={icon} size={16} stroke={2.2} /></span>
          <span><b>{title}</b><span className="small muted">{body}</span></span>
        </li>)}
      </ol>
      <div className="row gap-8 wrap"><Button icon="plus" onClick={onCreate}>Create your first room</Button><Button variant="secondary" icon="enter" onClick={onJoin}>I have a code</Button></div>
    </div>
  </section>;
}

const KEY = 'ourspace.gettingStarted.hidden';
/** After the first room: a dismissible checklist that ticks itself off and disappears when everything is done. */
export function Checklist({ onInvite, onPlay }: { onInvite: () => void; onPlay: () => void }) {
  const space = useSpace();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(KEY) === space.user.id; } catch { return false; } });
  const items: { done: boolean; label: string; hint: string; action?: () => void; cta?: string }[] = [
    { done: space.rooms.length > 0, label: 'Create a room', hint: 'Done' },
    { done: space.rooms.some(r => r.members.length > 1), label: 'Invite your person', hint: 'Send the link from a room', action: onInvite, cta: 'Invite' },
    { done: space.rooms.some(r => !!r.playback), label: 'Watch something together', hint: 'Search YouTube inside a room', action: onPlay, cta: 'Open room' },
    { done: space.playlists.some(p => p.tracks.length > 0), label: 'Save a favourite', hint: 'Tap the bookmark under the video' },
  ];
  const left = items.filter(i => !i.done).length;
  if (hidden || left === 0) return null;
  const pct = Math.round((items.length - left) / items.length * 100);
  return <section className="glass panel checklist" aria-label="Getting started">
    <div className="row between"><div><p className="h3">Getting started</p><p className="tiny muted">{left} step{left === 1 ? '' : 's'} left</p></div>
      <IconButton size="sm" variant="plain" icon="x" label="Hide getting started" onClick={() => { setHidden(true); try { localStorage.setItem(KEY, space.user.id); } catch { /* fine */ } }} /></div>
    <div className="bar" style={{ height: 5 }}><i style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--lav), var(--mint))' }} /></div>
    <div className="checklist-items">{items.map(i => {
      const go = !i.done && i.action;
      const inner = <>
        <span className="check-dot">{i.done && <Icon name="check" size={13} stroke={3} />}</span>
        <span className="grow"><span className="small" style={{ fontWeight: 600, display: 'block' }}>{i.label}</span><span className="tiny muted" style={{ display: 'block' }}>{i.done ? 'Done' : i.hint}</span>{go && <span className="lav tiny" style={{ fontWeight: 600, display: 'block', marginTop: 4 }}>{i.cta} →</span>}</span>
      </>;
      return go ? <button key={i.label} className="check-item go" onClick={i.action}>{inner}</button> : <div key={i.label} className={`check-item ${i.done ? 'done' : ''}`}>{inner}</div>;
    })}</div>
  </section>;
}
