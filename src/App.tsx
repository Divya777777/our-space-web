import { useState } from 'react';
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SpaceProvider, useSpace } from './lib/space';
import { ConfirmProvider, Notice, Sheet, ToastProvider, Button } from './components/ui';
import { Icon, IconName } from './components/Icon';
import { Star } from './components/Brand';
import { Starfield } from './components/Space';
import { CallProvider } from './components/Call';
import { OfflineBar } from './components/OfflineBar';
import Welcome from './pages/Welcome';
import Home from './pages/Home';
import Rooms from './pages/Rooms';
import Library from './pages/Library';
import You from './pages/You';
import RoomPage from './pages/Room';
import Join from './pages/Join';

export default function App() {
  return <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
    <ToastProvider><ConfirmProvider><SpaceProvider><Gate /></SpaceProvider></ConfirmProvider></ToastProvider>
  </BrowserRouter>;
}

function Gate() {
  const space = useSpace();
  const location = useLocation();
  if (!space.signedIn) {
    // Keep invite links working through sign-in.
    if (location.pathname === '/join') sessionStorage.setItem('ourspace.afterSignIn', location.pathname + location.search);
    return <><div className="space" /><Starfield /><Welcome /></>;
  }
  const after = sessionStorage.getItem('ourspace.afterSignIn');
  if (after) { sessionStorage.removeItem('ourspace.afterSignIn'); return <Navigate to={after} replace />; }
  return <CallProvider>
    <div className="space" /><Starfield />
    <OfflineBar />
    <div className="shell">
      <Rail />
      <main className="main" id="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/rooms" element={<Rooms />} />
          <Route path="/library" element={<Library />} />
          <Route path="/you" element={<You />} />
          <Route path="/join" element={<Join />} />
          <Route path="/room/:code" element={<RoomPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
    <TabBar />
    {space.needsName && <NameSetup />}
  </CallProvider>;
}

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Home', icon: 'home' }, { to: '/rooms', label: 'Rooms', icon: 'rooms' },
  { to: '/library', label: 'Library', icon: 'library' }, { to: '/you', label: 'You', icon: 'user' },
];
function useRequests() { const space = useSpace(); return space.rooms.some(r => r.hostId === space.user.id && r.requests.length > 0); }
function Rail() {
  const requests = useRequests();
  return <nav className="rail" aria-label="Main">
    <div className="rail-inner glass">
      <NavLink to="/" className="rail-brand" aria-label="Our Space home"><Star size={30} /></NavLink>
      {NAV.map(n => <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => isActive ? 'active' : ''}>
        <Icon name={n.icon} size={22} /><span className="tip">{n.label}</span>{n.to === '/rooms' && requests && <span className="badge" />}
      </NavLink>)}
    </div>
  </nav>;
}
function TabBar() {
  const requests = useRequests();
  const { pathname } = useLocation();
  if (pathname.startsWith('/room/')) return null;
  return <nav className="tabbar glass" aria-label="Main">
    {NAV.map(n => <NavLink key={n.to} to={n.to} end={n.to === '/'} aria-label={n.label} className={({ isActive }) => isActive ? 'active' : ''}>
      <Icon name={n.icon} size={22} />{n.to === '/rooms' && requests && <span className="badge" />}
    </NavLink>)}
  </nav>;
}

function NameSetup() {
  const space = useSpace();
  const [name, setName] = useState(space.user.name);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); setError(''); try { await space.setDisplayName(name); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  return <Sheet title="What should we call you?" sub="This is the name your people see in rooms, chat and calls." onClose={() => void save()}
    footer={<Button block busy={busy} onClick={() => void save()}>Save name</Button>}>
    <div className="field"><label htmlFor="display-name">Your name</label><input id="display-name" className="input" value={name} maxLength={30} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void save(); }} /></div>
    {error && <Notice tone="error">{error}</Notice>}
  </Sheet>;
}
