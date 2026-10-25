import { backendUrl } from './account';
/** Link that opens the room: the backend's /j/:code page offers the app, and this site handles /join?code=. */
export const inviteLink = (code: string) => `${backendUrl}/j/${encodeURIComponent(code)}`;
export const webJoinLink = (code: string) => `${window.location.origin}${import.meta.env.BASE_URL}join?code=${encodeURIComponent(code)}`;
export const inviteMessage = (code: string, roomName?: string) =>
  `Come hang out with me in ${roomName ? `“${roomName}”` : 'my space'} on Our Space.\n\nOn your phone: ${inviteLink(code)}\nOn a computer: ${webJoinLink(code)}\n\nOr open Our Space → Join with code → ${code}`;
