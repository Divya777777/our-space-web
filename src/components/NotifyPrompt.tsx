// Asks once (dismissible) to turn on notifications on this computer, so calls and messages reach you when the site is closed.
import { useState } from 'react';
import { useSpace } from '../lib/space';
import { enableNotifications, notifySupported } from '../lib/webNotify';
import { Button, IconButton } from './ui';
import { Icon } from './Icon';

const KEY = 'ourspace.notifyPrompt.dismissed';
export function NotifyPrompt() {
  const space = useSpace();
  const [hidden, setHidden] = useState(() => { try { return !notifySupported || Notification.permission !== 'default' || localStorage.getItem(KEY) === '1'; } catch { return true; } });
  const [busy, setBusy] = useState(false);
  if (hidden) return null;
  const dismiss = () => { setHidden(true); try { localStorage.setItem(KEY, '1'); } catch { /* fine */ } };
  return <div className="glass panel row gap-12 notify-prompt" role="status">
    <span className="lav"><Icon name="bell" size={20} /></span>
    <span className="grow small"><b>Never miss a call.</b> Get calls and messages on this computer, even when Our Space is closed.</span>
    <Button size="sm" busy={busy} onClick={async () => { setBusy(true); await enableNotifications(space.api, true); setBusy(false); setHidden(true); }}>Turn on</Button>
    <IconButton size="sm" variant="plain" icon="x" label="Not now" onClick={dismiss} />
  </div>;
}
