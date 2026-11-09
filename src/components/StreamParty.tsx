// Netflix & Prime Video together: two glass tiles in the room, the one-time extension install (with a progress
// ring that finishes when Chrome has added it), the "Join" invite, and the live party card.
import { useEffect, useRef, useState } from 'react';
import { Button, IconButton, Sheet } from './ui';
import { Icon } from './Icon';
import { EXTENSION_URL, Party, SERVICES, Service, TEST_ZIP, browserSupported, isFirefox, clock, closeStore, extension, openStore, useExtension } from '../lib/watchParty';

function Mark({ service, size = 40 }: { service: Service; size?: number }) {
  // Our own tile mark (not the services' logos): the service name's first letters on its colour.
  return <span className={`svc-mark ${service}`} style={{ width: size, height: size, fontSize: size * .38 }} aria-hidden="true">{service === 'netflix' ? 'N' : 'PV'}</span>;
}

export function StreamTiles({ onPick }: { onPick: (s: Service) => void }) {
  return <section className="stream-tiles" aria-label="Watch Netflix or Prime Video together">
    <div className="row between"><p className="h3">Also watch together on</p><span className="tiny muted">Each of you uses your own account · on a computer</span></div>
    <div className="stream-row">
      {(Object.keys(SERVICES) as Service[]).map(s => <button key={s} className={`stream-tile ${s}`} onClick={() => onPick(s)}>
        <span className="stream-glow" aria-hidden="true" />
        <Mark service={s} />
        <span className="col" style={{ alignItems: 'flex-start', gap: 2 }}><span className="stream-name">{SERVICES[s].name}</span><span className="tiny muted">In sync, on a video call</span></span>
        <span className="stream-go" aria-hidden="true"><Icon name="play" size={14} /></span>
      </button>)}
    </div>
  </section>;
}

/** One-time install: the store opened in a small window from the same click; this ring finishes when the
 * extension answers, then the store window closes and the site opens by itself. */
export function InstallSheet({ service, onDone, onClose }: { service: Service; onDone: () => void; onClose: () => void }) {
  const installed = useExtension();
  const [pct, setPct] = useState(0);
  const done = useRef(false);
  useEffect(() => { const t = setInterval(() => extension.ping(), 700); return () => clearInterval(t); }, []);
  // Creeps towards 90% while Chrome adds it; 100% only when the extension really answers.
  useEffect(() => {
    if (installed) return;
    const t = setInterval(() => setPct(p => Math.min(90, p + Math.max(.35, (90 - p) * .04))), 250);
    return () => clearInterval(t);
  }, [installed]);
  useEffect(() => {
    if (!installed || done.current) return;
    done.current = true; setPct(100); closeStore();
    const t = setTimeout(onDone, 1000);
    return () => clearTimeout(t);
  }, [installed, onDone]);
  const R = 54, C = 2 * Math.PI * R;
  const name = SERVICES[service].name;
  if (!browserSupported) return <Sheet title={`${name} together`} sub="Works on a computer" onClose={onClose}>
    <p className="muted">Watching {name} together works in Chrome, Edge, Brave, Opera or Firefox on a computer. On a phone, keep watching YouTube together in the app.</p>
    <Button onClick={onClose}>OK</Button>
  </Sheet>;
  return <Sheet title={installed ? 'All set' : `Setting up ${name}`} sub={installed ? `Opening ${name}…` : 'Only the first time'} onClose={() => { closeStore(); onClose(); }}>
    <div className="install">
      <div className={`install-ring ${installed ? 'done' : 'busy'}`} style={{ ['--svc' as string]: SERVICES[service].color }}>
        <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden="true">
          <circle cx="70" cy="70" r={R} className="track" />
          <circle cx="70" cy="70" r={R} className="fill" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} />
        </svg>
        <span className="install-pct">{installed ? <Icon name="check" size={34} stroke={2.6} /> : `${Math.round(pct)}%`}</span>
      </div>
      <p className="small muted" role="status" style={{ textAlign: 'center', minHeight: 20 }}>{installed ? `Ready. Opening ${name}…` : (isFirefox ? 'Choose “Add to Firefox” in the window on top — Firefox asks once.' : 'Choose “Add to Chrome” in the window on top — Chrome asks once.')}</p>
      {!installed && EXTENSION_URL && <button className="btn ghost sm" onClick={() => openStore()}>Show the window again</button>}
      {!installed && !EXTENSION_URL && <div className="col gap-8" style={{ width: '100%' }}>
        {/* Test version only — goes away once the extension is on the Chrome Web Store (VITE_EXTENSION_URL). */}
        <p className="small" style={{ fontWeight: 600 }}>Test version — add it once:</p>
        {isFirefox ? <ol className="install-steps small">
          <li>It’s downloading now (<b>{TEST_ZIP}</b>).</li>
          <li>Open a new tab and go to <b>about:debugging#/runtime/this-firefox</b>.</li>
          <li>Click <b>Load Temporary Add-on…</b> and pick the downloaded zip. This page carries on by itself. (Test versions last until Firefox restarts.)</li>
        </ol> : <ol className="install-steps small">
          <li>It’s downloading now (<b>{TEST_ZIP}</b>). Double-click it in Downloads to unzip.</li>
          <li>Open a new tab, go to <b>chrome://extensions</b> and turn on <b>Developer mode</b> (top right).</li>
          <li>Click <b>Load unpacked</b> and pick the <b>ourspace-extension</b> folder. This page carries on by itself.</li>
        </ol>}
        <a className="btn ghost sm" href={`${import.meta.env.BASE_URL}${TEST_ZIP}`} download>Download again</a>
      </div>}
    </div>
  </Sheet>;
}

export function PartyInvite({ invite, onJoin, onDismiss }: { invite: NonNullable<Party['invite']>; onJoin: () => void; onDismiss: () => void }) {
  return <div className={`party-invite glass ${invite.service}`} role="status">
    <Mark service={invite.service} size={36} />
    <span className="grow"><b>{invite.fromName.split(' ')[0]}</b> wants to watch {SERVICES[invite.service].name} together<span className="tiny muted" style={{ display: 'block' }}>Opens in a new tab, in sync, with your faces on top</span></span>
    <Button size="sm" onClick={onJoin}>Join</Button>
    <IconButton size="sm" variant="plain" icon="x" label="Not now" onClick={onDismiss} />
  </div>;
}

export function PartyCard({ party, onToggle, onResync, onEnd }: { party: Party; onToggle: () => void; onResync: () => void; onEnd: () => void }) {
  if (!party.service) return null;
  const svc = SERVICES[party.service];
  const waitingFor = party.peers.filter(p => !(p.ready && p.sameTitle)).map(p => p.name.split(' ')[0]);
  const line = party.status === 'synced' ? `In sync with ${party.peers.map(p => p.name.split(' ')[0]).join(' & ') || 'everyone'}`
    : party.status === 'syncing' ? 'Starting together…'
      : party.status === 'choosing' ? `Pick something on ${svc.name} — everyone follows`
        : !party.peers.length ? 'Waiting for the others to join…'
          : waitingFor.length ? `Waiting for ${waitingFor.join(' & ')} to open it…` : 'Getting ready…';
  const l = party.local;
  return <section className={`party-card glass ${party.service} ${party.status}`} aria-label={`${svc.name} together`}>
    <span className="party-aura" aria-hidden="true" />
    <div className="row gap-16">
      <Mark service={party.service} size={52} />
      <div className="grow" style={{ minWidth: 0 }}>
        <p className="tiny muted" style={{ letterSpacing: '.12em', textTransform: 'uppercase' }}>{svc.name} together</p>
        <p className="h2 ellipsis">{party.title || (party.status === 'choosing' ? 'Choosing…' : 'Opening…')}</p>
        <p className="small row gap-8"><span className={`sync-dot ${party.status}`} />{line}</p>
      </div>
    </div>
    {l && l.duration > 0 && <div className="party-progress"><i style={{ width: `${Math.min(100, l.t / l.duration * 100)}%` }} /><span className="tiny muted">{clock(l.t)} / {clock(l.duration)}</span></div>}
    {party.note && <p className="small gold">{party.note}</p>}
    <div className="row gap-8 wrap">
      <Button size="sm" icon={l && !l.paused ? 'pause' : 'play'} disabled={party.status !== 'synced'} onClick={onToggle}>{l && !l.paused ? 'Pause for both' : 'Play for both'}</Button>
      <Button size="sm" variant="secondary" icon="undo" disabled={!l} onClick={onResync}>Sync again</Button>
      <Button size="sm" variant="secondary" icon="expand" onClick={() => extension.send({ type: 'focus' })}>Go to {svc.name}</Button>
      <span className="grow" />
      <Button size="sm" variant="quiet-danger" onClick={onEnd}>End</Button>
    </div>
  </section>;
}
