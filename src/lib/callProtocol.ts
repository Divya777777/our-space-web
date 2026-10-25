import type { CallSignal } from './types';
type Session = { id: string; code: string; peer: { id: string } };
export function signalBelongsToCall(signal: CallSignal, call: Session | null) {
  if (!call || signal.from !== call.peer.id || signal.code !== call.code) return false;
  // Legacy inbound calls have no session ID. New sessions always require it,
  // so a delayed hangup/candidate from an earlier call cannot affect this one.
  return signal.payload.callId === call.id || (!signal.payload.callId && call.id.startsWith('legacy-'));
}
export function actionableSignals(signals: CallSignal[]) {
  return signals.filter((signal, index) => signal.type !== 'invite' || !signals.slice(index + 1).some(later =>
    later.type === 'end' && later.code === signal.code && later.from === signal.from && later.payload.callId === signal.payload.callId));
}
