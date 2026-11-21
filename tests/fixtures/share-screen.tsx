import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/outfit';
import '../../src/styles.css';
import { ShareScreenSheet } from '../../src/components/ShareScreenSheet';
function Preview() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');
  return <><button onClick={() => setOpen(true)}>Share your screen</button><output>{selected}</output>{open && <ShareScreenSheet onClose={() => setOpen(false)} onShare={sound => { setSelected(sound ? 'sound' : 'screen'); setOpen(false); }} />}</>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
