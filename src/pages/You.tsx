import { useEffect, useState } from 'react';
import { useSpace } from '../lib/space';
import { backendUrl } from '../lib/account';
import { unblockUser, useBlocked } from '../lib/safety';
import { Avatar, Button, Notice, Sheet, useConfirm, useToast } from '../components/ui';
import { Icon, IconName } from '../components/Icon';
import { LinkSheet } from '../components/LinkSheet';

export default function You() {
  const space = useSpace();
  const toast = useToast();
  const confirm = useConfirm();
  const blocked = useBlocked(space.api);
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(space.user.name);
  const [error, setError] = useState('');
  const [perm, setPerm] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const [del, setDel] = useState(false); const [typed, setTyped] = useState('');
  const [linking, setLinking] = useState(false);
  useEffect(() => setName(space.user.name), [space.user.name]);
  const row = (icon: IconName, title: string, sub: string, action?: React.ReactNode, href?: string) => {
    const body = <><span className="center" style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,.06)', flex: 'none' }}><Icon name={icon} /></span><span className="grow"><span className="h3" style={{ display: 'block' }}>{title}</span><span className="small muted">{sub}</span></span>{action}</>;
    return href ? <a className="list-row" href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--text)' }}>{body}<Icon name="fwd" size={16} /></a> : <div className="list-row">{body}</div>;
  };
  const limits = space.plan.limits;
  return <div className="page narrow">
    <div className="glass window row gap-20" style={{ padding: 28 }}>
      <Avatar name={space.user.name} size={72} />
      <div className="grow"><h1 className="title">{space.user.name}</h1><p className="small muted">{space.plan.plan === 'plus' ? 'Our Space Plus' : 'Free plan'}</p></div>
      <Button variant="secondary" icon="edit" onClick={() => setEdit(true)}>Edit name</Button>
    </div>

    <div className="section-head"><h2 className="h2">Your plan</h2></div>
    <div className="glass panel col gap-16" style={{ padding: 20 }}>
      {limits ? <>
        <Usage label="Rooms you host" used={space.plan.usage.rooms} max={limits.rooms} />
        <Usage label="Personal playlists" used={space.plan.usage.personalPlaylists} max={limits.personalPlaylists} />
        <p className="small muted">Watching, calls, private chat, games and goals are free. Plus — with unlimited rooms and playlists — is coming soon.</p>
      </> : <p className="muted">Plus: unlimited rooms and playlists. Thank you for supporting Our Space.</p>}
    </div>

    <div className="section-head"><h2 className="h2">This browser</h2></div>
    <div className="glass panel list" style={{ padding: 8 }}>
      {row('bell', 'Call alerts', perm === 'granted' ? 'On — you’ll see a notification when someone calls while this tab is in the background. To turn it off, click the icon left of the address bar → Notifications.' : perm === 'denied' ? 'Off. To turn it on, click the icon left of the address bar → Notifications → Allow, then reload.' : 'Get a notification when someone calls while this tab is in the background.',
        perm === 'default' ? <Button size="sm" variant="secondary" onClick={async () => setPerm(await Notification.requestPermission())}>Turn on</Button> : undefined)}
      {row('phone', 'Bring chats from your phone', 'Scan a QR code with Our Space on your phone to copy your older private messages here.', <Button size="sm" variant="secondary" onClick={() => setLinking(true)}>Show QR code</Button>)}
      {row('lock', 'Private chat on this browser', 'Messages are end-to-end encrypted. New messages arrive here and on your phone automatically.')}
    </div>

    <div className="section-head"><h2 className="h2">Safety and help</h2></div>
    <div className="glass panel list" style={{ padding: 8 }}>
      {blocked.length > 0 && blocked.map(b => row('shield', b.name, 'Blocked', <Button size="sm" variant="secondary" onClick={() => void unblockUser(space.api, b.id).then(() => toast('Unblocked.'))}>Unblock</Button>))}
      {row('shield', 'Privacy policy', 'What we keep and why', undefined, `${backendUrl}/privacy`)}
      {row('book', 'Terms', 'The rules for using Our Space', undefined, `${backendUrl}/terms`)}
      {row('chat', 'Help and support', 'Questions, problems or ideas', undefined, `${backendUrl}/support`)}
    </div>

    <div className="col gap-8" style={{ marginTop: 32, alignItems: 'flex-start' }}>
      <Button variant="secondary" icon="logout" onClick={async () => { if (await confirm({ title: 'Sign out of this browser?', body: 'Chat history saved in this browser stays here encrypted. Your phone isn’t affected.', confirmLabel: 'Sign out' })) await space.signOut(); }}>Sign out</Button>
      <Button variant="quiet-danger" icon="trash" onClick={() => setDel(true)}>Delete account</Button>
    </div>

    {linking && <LinkSheet onClose={() => setLinking(false)} />}
    {edit && <Sheet title="Your name" sub="The name your people see in rooms, chat and calls." onClose={() => setEdit(false)} footer={<Button block onClick={async () => { setError(''); try { await space.setDisplayName(name); setEdit(false); toast('Name saved.'); } catch (e) { setError((e as Error).message); } }}>Save name</Button>}>
      <input aria-label="Your name" className="input" maxLength={30} value={name} onChange={e => setName(e.target.value)} />{error && <Notice tone="error">{error}</Notice>}
    </Sheet>}
    {del && <Sheet title="Delete your account?" sub="This removes your account, the rooms you host and your playlists, on every device. It can’t be undone." onClose={() => setDel(false)}
      footer={<Button block variant="danger" disabled={typed !== 'DELETE'} onClick={async () => { try { await space.deleteAccount(); } catch (e) { toast((e as Error).message, { tone: 'error' }); } }}>Delete my account</Button>}>
      <div className="field"><label htmlFor="del">Type DELETE to confirm</label><input id="del" className="input" value={typed} onChange={e => setTyped(e.target.value)} /></div>
    </Sheet>}
  </div>;
}
function Usage({ label, used, max }: { label: string; used: number; max: number }) {
  return <div className="col gap-8"><div className="row between small"><span>{label}</span><span className="muted">{used} of {max}</span></div><div className="bar"><i style={{ width: `${Math.min(100, used / max * 100)}%`, background: used >= max ? 'var(--gold)' : 'var(--lav)' }} /></div></div>;
}
