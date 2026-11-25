// Public oEmbed lookup (no key): titles for pasted links.
export async function fetchVideoTitle(videoId: string, timeoutMs = 8000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`, { signal: controller.signal });
    if (!r.ok) return '';
    const data = await r.json();
    return typeof data.title === 'string' ? data.title : '';
  } catch { return ''; } finally { clearTimeout(timer); }
}
import { appleSong, NOTE_ART } from './appleMusic';
/** Picture for a video, or the cover of an Apple Music song ("am:<id>"). */
export const thumbnail = (videoId: string, art?: string) => videoId.startsWith('am:') ? (art || appleSong(videoId)?.art || NOTE_ART) : `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
