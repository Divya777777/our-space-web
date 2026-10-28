export type Device = { id: string; key: string };
export type Person = { id: string; name: string; key?: string; devices?: Device[] };
export type Message = { id: string; userId: string; name: string; text: string; at: number };
export type Playback = { videoId: string; playing: boolean; position: number; updatedAt: number; updatedBy: string; revision: number };
export type QueueItem = { id: string; videoId: string; title: string; source: 'manual' | 'playlist'; addedBy?: string };
/** Message status per member: `d` newest chat message their app downloaded, `r` newest one they have seen. */
export type Receipts = Record<string, { d: number; r: number }>;
export type Room = { receipts?: Receipts; volume?: number; e2eCursor?: number; queue?: QueueItem[]; updateCursor?: number; playlistVersion?: number; goalsVersion?: number; code: string; name: string; hostId: string; members: Person[]; requests: Person[]; messages: Message[]; playback: Playback | null };
export type Track = { videoId: string; title: string };
export type Playlist = { id: string; name: string; scope: 'personal' | 'room'; ownerId: string; roomCode: string | null; tracks: Track[] };
export type Session = Person & { token: string };
export function youtubeId(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const id = host === 'youtu.be' ? url.pathname.slice(1) : ['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host) ? (url.searchParams.get('v') || (/^\/(shorts|embed|live)\//.test(url.pathname) ? url.pathname.split('/')[2] : '')) : '';
    return /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
export function positionNow(playback: Playback) {
  return playback.position + (playback.playing ? Math.max(0, Date.now() - playback.updatedAt) / 1000 : 0);
}
