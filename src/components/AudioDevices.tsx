// Call audio on the web: pick the microphone and the speaker separately. "Automatic" follows the computer's
// default (so a Bluetooth headset that connects becomes the mic and speaker by itself).
import { useEffect, useState } from 'react';
import { Sheet } from './ui';

const KEY = 'ourspace.audioDevices.v1';
export type AudioChoice = { mic: string; speaker: string }; // '' = automatic
export function loadAudioChoice(): AudioChoice {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return { mic: String(v.mic || ''), speaker: String(v.speaker || '') }; }
  catch { return { mic: '', speaker: '' }; }
}
export function saveAudioChoice(c: AudioChoice) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* private window */ } }
export const canPickSpeaker = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

/** The computer's microphones and speakers, kept current when something is plugged in or connects. */
export function useAudioDevices(active: boolean) {
  const [list, setList] = useState<{ mics: MediaDeviceInfo[]; speakers: MediaDeviceInfo[]; defaultMic: string }>({ mics: [], speakers: [], defaultMic: '' });
  useEffect(() => {
    if (!active || !navigator.mediaDevices?.enumerateDevices) return;
    let alive = true;
    const read = () => { void navigator.mediaDevices.enumerateDevices().then(all => {
      if (!alive) return;
      const real = (d: MediaDeviceInfo) => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications';
      // Chrome lists the computer's current default as "Default - <name>"; its name changing means a new default
      // (for example a Bluetooth headset just connected).
      const def = all.find(d => d.kind === 'audioinput' && d.deviceId === 'default');
      setList({ mics: all.filter(d => d.kind === 'audioinput' && real(d)), speakers: all.filter(d => d.kind === 'audiooutput' && real(d)), defaultMic: def ? def.label : String(all.filter(d => d.kind === 'audioinput').length) });
    }).catch(() => {}); };
    read();
    navigator.mediaDevices.addEventListener('devicechange', read);
    return () => { alive = false; navigator.mediaDevices.removeEventListener('devicechange', read); };
  }, [active]);
  return list;
}

export function AudioDeviceSheet({ devices, choice, onChange, onClose }: { devices: ReturnType<typeof useAudioDevices>; choice: AudioChoice; onChange: (c: AudioChoice) => void; onClose: () => void }) {
  const name = (d: MediaDeviceInfo, i: number, kind: string) => d.label || `${kind} ${i + 1}`;
  return <Sheet title="Audio" sub="Microphone and speaker for calls" onClose={onClose}>
    <div className="col gap-16">
      <div className="field"><label htmlFor="call-mic">Microphone</label>
        <select id="call-mic" className="input" value={choice.mic} onChange={e => onChange({ ...choice, mic: e.target.value })}>
          <option value="">Automatic (computer’s default)</option>
          {devices.mics.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{name(d, i, 'Microphone')}</option>)}
        </select></div>
      <div className="field"><label htmlFor="call-speaker">Speaker</label>
        {canPickSpeaker ? <select id="call-speaker" className="input" value={choice.speaker} onChange={e => onChange({ ...choice, speaker: e.target.value })}>
          <option value="">Automatic (computer’s default)</option>
          {devices.speakers.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{name(d, i, 'Speaker')}</option>)}
        </select> : <p className="small muted">This browser always uses the computer’s default speaker. Change it in your computer’s sound settings.</p>}</div>
      <p className="small muted">With Automatic, a Bluetooth headset or headphones you connect are used straight away.</p>
    </div>
  </Sheet>;
}
