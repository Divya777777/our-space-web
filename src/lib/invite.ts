/** The one invite link for every device: getourspace.com/j/CODE (pages/Invite.tsx). Phones with the app open the
 *  room's join screen in the app straight away (Universal Links / App Links); others get the store or the website. */
const SITE = (import.meta.env.VITE_SITE_URL as string | undefined) || 'https://getourspace.com';
export const inviteLink = (code: string) => `${SITE}/j/${encodeURIComponent(code)}`;
export const webJoinLink = (code: string) => `${window.location.origin}${import.meta.env.BASE_URL}join?code=${encodeURIComponent(code)}`;
export const inviteMessage = (code: string, roomName?: string) =>
  `Come hang out with me in ${roomName ? `“${roomName}”` : 'my space'} on Our Space. Tap to join: ${inviteLink(code)}\n\nOr open Our Space → Join a room → ${code}`;
