# Our Space — web app

The browser version of Our Space. It signs in with the same Google account and talks to the same backend and
database as the phone app (`backend-mobile`, `/api/mobile/*`), so rooms, members, playlists, goals, games and plans
are shared between phone and web.

**Everything the app does, on the web:** Google sign-in, home with the active room and upcoming plans, create / join
by code (with live "waiting for the admin"), approve / decline requests, synced YouTube (search or paste, play/pause/seek
for everyone, Up next with drag to reorder, shared volume, "Join in" when you arrive mid-video), save to personal or room
playlists, Library with "Play here" and "Play in a room", private end-to-end encrypted chat with photos and files up to
16 MB, voice and video calls (one-to-one and the whole room) that interoperate with the phone app, Goals (rings, add
goal in two steps, cheers, monthly record), Play (Scribble live or draw-and-send, Truth or Dare on a call, quiz,
monthly scores), plans, rename / leave / delete rooms, remove member, report & block, display name, delete account.

Not on the web (phone only): automatic step counting (add steps by hand here), push notifications when the site is
closed (an open tab shows a browser notification for incoming calls if allowed).

**Picture-in-picture:** the room video and/or the call pop out into a small always-on-top window (Document
Picture-in-Picture, Chrome / Edge / Brave / Opera on a computer). Controls inside it act for everyone. Newer Chrome
opens it by itself when you switch tabs or apps during a call or while a video plays, and closes it when you come back
(there is no pop-out button; the room menu has "Pop out the video now"). Safari: the call video floats by itself; Firefox / Safari use the browser’s
video picture-in-picture; the YouTube video can’t float there.

## Run it

```bash
cd web
npm install
cp .env.example .env.local   # values already point at the staging backend
npm run dev                  # http://localhost:5173
npm run build                # production files in web/dist
```

## Deploy on GitHub Pages (current)

Live at https://divya777777.github.io/our-space-web/ from its own **public** repo, `Divya777777/our-space-web`
(the backend repos stay private). The repo root is this folder; workflows: `deploy-web.yml` (build + Pages) and
`keep-warm.yml` (pings the backend every 10 minutes — free in a public repo).

- Publish after editing `web/`: `bash scripts/publish-web.sh` (mirrors `web/` into a fresh clone and pushes; GitHub
  builds with `VITE_BASE=/our-space-web/` and publishes in about two minutes).
- One-time move from the old `our-space-stg` site: `bash scripts/move-web-out.sh`.
- Pages source for `our-space-web` must be **GitHub Actions** (Settings → Pages).
- Optional repo variables: `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`.

Room and invite links (`/our-space-web/room/…`, `/our-space-web/join?code=…`) work because the build copies
`index.html` to `404.html`.

## Deploy on Netlify (alternative)

New site → base directory `web`, build command `npm run build`, publish directory `web/dist`.
`netlify.toml` already sends every path to `index.html`. Set `VITE_API_URL` and `VITE_GOOGLE_CLIENT_ID`
in the site's environment variables if they differ from `.env.example`.

## One-time setup outside the code

1. **Google Cloud → Credentials → the Web client** (`351421523260-04n8…`): add the site's address
   (`https://divya777777.github.io` and `http://localhost:5173` — the origin only, no path) under **Authorized JavaScript origins**.
   Without this, the Google button shows an "origin not allowed" error.
2. **Render → backend environment**: add the same addresses to `CORS_ORIGIN` (comma-separated), e.g.
   `CORS_ORIGIN=https://divya777777.github.io,http://localhost:5173` (keep any origins already there). Without this, the browser blocks every request.
3. **Release the backend** with the device-key change (below) before people use private chat on the web.

## Private chat on more than one device

Before this change every account had one chat key (the phone's). The web app now adds a key per browser
(`PUT /api/mobile/keys` with `deviceId`), the room view lists each member's `devices`, and a message carries one
envelope per key: `userId` for the phone and `userId:deviceId` for each browser, plus `sd` (which browser sent it).
The phone key is never replaced, so older phone builds keep working with each other.

- Phone builds **with** the matching `mobile/src/lib` change read web messages and seal for browsers too.
- Older phone builds can't read messages written on the web, and their messages can't be read on the web.
  Ship a new app build alongside the web launch.
- A browser only sees messages sent after it signed in (history is never stored on the server unencrypted).

## Files

- `src/lib/` — API store (`space.tsx`), encryption (`e2e.ts`), browser chat history in IndexedDB (`chatStore.ts`),
  and the same goals / games / planner / call protocol helpers as the phone app.
- `src/components/` — `Call.tsx` (WebRTC calls), `YouTubePlayer.tsx` (sync rules match the app), room panels.
- `src/pages/` — Welcome, Home, Rooms, Join, Room, Library, You.
- `src/styles.css` — the spatial design system (glass windows over deep space, brand lavender/ivory/mint).
