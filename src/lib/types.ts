export type CallPeer = { id: string; name: string };
export type CallSignal = {
  code?: string; sentAt?: number; id: number; from: string; name: string;
  type: 'invite' | 'accept' | 'reject' | 'offer' | 'answer' | 'candidate' | 'end' | 'hello';
  payload: Record<string, unknown>;
};
export type IceServer = { urls: string | string[]; username?: string; credential?: string };
export type PlanLimits = { rooms: number; personalPlaylists: number; roomPlaylistsPerRoom: number };
export type PlanInfo = { plan: 'free' | 'plus'; limits: PlanLimits | null; usage: { rooms: number; personalPlaylists: number } };
export type SearchResult = { videoId: string; title: string; channel: string; thumbnail: string; live?: boolean };
export const FREE_LIMITS: PlanLimits = { rooms: 7, personalPlaylists: 2, roomPlaylistsPerRoom: 1 };
/** The server refused an action because it needs Plus. */
export function plusLimit(error: unknown): keyof PlanLimits | null {
  const e = error as { code?: string; limit?: keyof PlanLimits };
  return e?.code === 'plus_required' ? e.limit || 'rooms' : null;
}
