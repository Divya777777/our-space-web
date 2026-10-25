import { useEffect, useState } from 'react';
import { networkHooks } from '../lib/request';
import { Icon } from './Icon';

/** "You're offline" while the browser or the server can't be reached, then "Back online" for a moment. */
export function OfflineBar() {
  const [state, setState] = useState<'online' | 'offline' | 'back'>(navigator.onLine ? 'online' : 'offline');
  useEffect(() => {
    let failures = 0; let timer: ReturnType<typeof setTimeout>;
    const back = () => setState(s => { if (s === 'offline') { clearTimeout(timer); timer = setTimeout(() => setState('online'), 2000); return 'back'; } return s; });
    networkHooks.success = () => { failures = 0; back(); };
    networkHooks.failure = () => { if (++failures >= 2 || !navigator.onLine) setState('offline'); };
    const on = () => back(); const off = () => setState('offline');
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearTimeout(timer); };
  }, []);
  if (state === 'online') return null;
  return <div role="status" className="glass" style={{ position: 'fixed', zIndex: 100, top: 14, left: '50%', transform: 'translateX(-50%)', padding: '8px 16px', borderRadius: 999, display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
    <Icon name="wifi" size={16} />{state === 'offline' ? 'You’re offline · reconnecting automatically' : 'Back online'}
  </div>;
}
