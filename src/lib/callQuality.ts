/** Application caps supplement (never replace) the browser's congestion controller. */
export type UploadQuality = {
  cap: number; available: number; appliedAvailable: number;
  bad: number; good: number; feedbackKey: string; feedbackAt: number;
  lost?: number; sent?: number;
};
export type UploadSample = {
  available?: number;
  feedback?: { id: string; at: number; loss?: number; rtt?: number; lost?: number; sent?: number };
};
export const newUploadQuality = (): UploadQuality => ({ cap: 0, available: 0, appliedAvailable: 0, bad: 0, good: 0, feedbackKey: '', feedbackAt: 0 });
const valid = (n: number | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/** Mutates per-connection state; returns true only when sender settings need updating. */
export function updateUploadQuality(s: UploadQuality, sample: UploadSample): boolean {
  const old = s.cap;
  const available = valid(sample.available) && sample.available > 0 ? sample.available : undefined;
  const f = sample.feedback;
  const fresh = !!f && (f.id !== s.feedbackKey || f.at > s.feedbackAt);
  let bad = false, good = false, severe = false;
  if (fresh) {
    const sameStream = f.id === s.feedbackKey;
    let loss = valid(f.loss) ? f.loss : undefined;
    // Some browsers expose cumulative remote loss but not fractionLost. Approximate
    // the interval fraction using packets sent between fresh receiver reports.
    if (loss === undefined && sameStream && valid(f.lost) && valid(f.sent) && valid(s.lost) && valid(s.sent) && f.sent > s.sent && f.lost >= s.lost) {
      loss = Math.min(1, (f.lost - s.lost) / (f.sent - s.sent));
    }
    s.lost = valid(f.lost) ? f.lost : undefined;
    s.sent = valid(f.sent) ? f.sent : undefined;
    s.feedbackKey = f.id; s.feedbackAt = f.at;
    const rtt = valid(f.rtt) ? f.rtt : undefined;
    bad = (loss !== undefined && loss > .08) || (rtt !== undefined && rtt > .8);
    severe = loss !== undefined && loss > .2;
    // No measurements is unknown. Low RTT alone is not evidence of loss-free delivery.
    good = loss !== undefined && loss < .02 && rtt !== undefined && rtt < .4;
    s.bad = bad ? s.bad + 1 : 0;
  }
  if (available !== undefined) {
    s.available = available;
    const want = available < 300_000 ? 2 : available < 700_000 ? 1 : 0;
    if (want > s.cap) { s.cap = want; s.good = 0; }
    // Don't restore quality on a single optimistic bandwidth estimate.
    const recovering = s.cap > 0 && available > (s.cap === 2 ? 450_000 : 1_000_000);
    s.good = recovering && !bad && s.bad === 0 ? s.good + 1 : 0;
    if (s.good >= 5) { s.cap--; s.good = 0; }
  } else {
    // Forget the old path's estimate, but hold its quality tier while evidence is missing.
    s.available = 0;
    if (fresh) {
      s.good = good ? s.good + 1 : 0;
      if (s.good >= 5 && s.cap > 0) { s.cap--; s.good = 0; }
    }
  }
  if (fresh && s.bad >= 2) {
    s.cap = Math.min(2, Math.max(s.cap + 1, severe ? 2 : 1));
    s.bad = 0; s.good = 0;
  }
  // Update a falling cap even within the same tier. Ignore small estimate noise and
  // do not increase bitrate until capacity has improved by a meaningful amount.
  const baseline = s.appliedAvailable;
  const moved = available !== undefined && (baseline === 0 || Math.abs(available - baseline) >= Math.max(20_000, baseline * .2));
  const changed = s.cap !== old || (s.cap > 0 && moved);
  if (changed) s.appliedAvailable = available ?? 0;
  return changed;
}

/** Reserve room for voice on poor links; healthy links keep the existing maximum. */
export function cameraBitrate(maximum: number, cap: number, available: number): number {
  if (!cap) return maximum;
  const budget = available > 0 ? Math.max(10_000, Math.min(available * .85, available - 40_000)) : cap === 2 ? 180_000 : 425_000;
  return Math.min(maximum, cap === 2 ? 220_000 : 600_000, Math.round(budget));
}

type Stat = Record<string, unknown>;
const number = (s: Stat | undefined, k: string) => typeof s?.[k] === 'number' ? s[k] as number : undefined;
/** Follow stats IDs: the nominated pair or another stream may not be the active video transport. */
export function uploadSample(report: Map<string, Stat>, outbound: Stat | null, pair: Stat | null): UploadSample {
  const remote = outbound ? report.get(String(outbound.remoteId)) || [...report.values()].find(s => s.type === 'remote-inbound-rtp' && s.localId === outbound.id) : undefined;
  return {
    available: number(pair ?? undefined, 'availableOutgoingBitrate'),
    feedback: remote && remote.type === 'remote-inbound-rtp' && typeof remote.timestamp === 'number'
      ? { id: String(remote.id), at: remote.timestamp, loss: number(remote, 'fractionLost'), rtt: number(remote, 'roundTripTime'), lost: number(remote, 'packetsLost'), sent: number(outbound ?? undefined, 'packetsSent') } : undefined,
  };
}
