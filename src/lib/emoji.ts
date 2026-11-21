// Emoji for the chat picker and the suggestions above the message box. No library: a curated set that covers what
// people actually send, with search words for each.
export type EmojiCat = { id: string; label: string; icon: string; list: string[] };

const split = (s: string): string[] => ('Segmenter' in Intl ? segment(s) : Array.from(s.replace(/\s+/g, ''))).filter(e => e.trim() && e !== '\uFE0F');
function segment(s: string) { return [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s.replace(/\s+/g, ''))].map(x => x.segment); }

export const EMOJI_CATS: EmojiCat[] = [
  { id: 'smileys', label: 'Smileys', icon: '😀', list: split('😀😃😄😁😆😅🤣😂🙂🙃🫠😉😊😇🥰😍🤩😘😗☺️😚😙🥲😋😛😜🤪😝🤑🤗🤭🫢🫣🤫🤔🫡🤐🤨😐😑😶🫥😏😒🙄😬😮‍💨🤥😌😔😪🤤😴😷🤒🤕🤢🤮🤧🥵🥶🥴😵🤯🤠🥳🥸😎🤓🧐😕🫤😟🙁☹️😮😯😲😳🥺🥹😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈👿💀☠️💩🤡👹👺👻👽👾🤖😺😸😹😻😼😽🙀😿😾') },
  { id: 'love', label: 'Love', icon: '❤️', list: split('❤️🧡💛💚💙💜🤎🖤🤍🩷🩵🩶❤️‍🔥❤️‍🩹💔❣️💕💞💓💗💖💘💝💟💌💋😘🥰😍💑💏👩‍❤️‍👨🌹💐🫶') },
  { id: 'hands', label: 'People', icon: '👋', list: split('👋🤚🖐️✋🖖🫱🫲🫳🫴👌🤌🤏✌️🤞🫰🤟🤘🤙👈👉👆🖕👇☝️🫵👍👎✊👊🤛🤜👏🙌🫶👐🤲🤝🙏✍️💅🤳💪🦾👀👁️👅👄🫦🧠👶🧒👦👧🧑👱👨🧔👩🧓👴👵🙍🙎🙅🙆💁🙋🧏🙇🤦🤷👮🕵️💂🥷👷🫅🤴👸👳👲🧕🤵👰🤰🫄🤱👼🎅🤶🦸🦹🧙🧚🧛🧜🧝🧞🧟💆💇🚶🧍🧎🏃💃🕺👯🧖🧘🛀🛌👭👫👬') },
  { id: 'animals', label: 'Animals & nature', icon: '🐶', list: split('🐶🐱🐭🐹🐰🦊🐻🐼🐻‍❄️🐨🐯🦁🐮🐷🐸🐵🙈🙉🙊🐒🐔🐧🐦🐤🦆🦅🦉🦇🐺🐗🐴🦄🐝🪱🐛🦋🐌🐞🐜🪲🐢🐍🦎🐙🦑🦐🦀🐡🐠🐟🐬🐳🐋🦈🐊🐅🐆🦓🦍🐘🦛🦏🐪🦒🦘🐃🐂🐄🐎🐖🐏🐑🐐🦌🐕🐩🐈🐈‍⬛🐓🦃🦚🦜🦢🕊️🐇🦝🦨🦡🦦🦥🐁🐀🐿️🦔🌵🎄🌲🌳🌴🌱🌿☘️🍀🍃🍂🍁🍄🌾💐🌷🌹🥀🌺🌸🌼🌻🌞🌝🌛🌜🌚🌕🌙🌎⭐🌟✨⚡☄️💥🔥🌈☀️⛅☁️🌧️⛈️❄️☃️⛄🌬️💨💧💦🌊') },
  { id: 'food', label: 'Food & drink', icon: '🍕', list: split('🍏🍎🍐🍊🍋🍌🍉🍇🍓🫐🍈🍒🍑🥭🍍🥥🥝🍅🍆🥑🥦🥬🥒🌶️🫑🌽🥕🧄🧅🥔🍠🥐🥯🍞🥖🥨🧀🥚🍳🧈🥞🧇🥓🥩🍗🍖🌭🍔🍟🍕🫓🥪🥙🧆🌮🌯🫔🥗🥘🫕🍝🍜🍲🍛🍣🍱🥟🍤🍙🍚🍘🍥🥠🍢🍡🍧🍨🍦🥧🧁🍰🎂🍮🍭🍬🍫🍿🍩🍪🌰🥜🍯🥛🍼☕🍵🧃🥤🧋🍶🍺🍻🥂🍷🥃🍸🍹🧉🍾🧊') },
  { id: 'activity', label: 'Activities', icon: '⚽', list: split('⚽🏀🏈⚾🥎🎾🏐🏉🥏🎱🪀🏓🏸🏒🏑🥍🏏🪃🥅⛳🪁🏹🎣🤿🥊🥋🎽🛹🛼🛷⛸️🥌🎿⛷️🏂🏋️🤼🤸⛹️🤺🤾🏌️🏇🧘🏄🏊🤽🚣🧗🚵🚴🏆🥇🥈🥉🏅🎖️🎗️🎫🎟️🎪🤹🎭🩰🎨🎬🎤🎧🎼🎹🥁🪘🎷🎺🪗🎸🪕🎻🎲♟️🎯🎳🎮🎰🧩') },
  { id: 'travel', label: 'Travel & places', icon: '✈️', list: split('🚗🚕🚙🚌🚎🏎️🚓🚑🚒🚐🛻🚚🚛🚜🏍️🛵🚲🛴🚨🚔🚍🚘🚖🚡🚠🚟🚃🚋🚞🚝🚄🚅🚈🚂🚆🚇🚊🚉✈️🛫🛬🛩️💺🛰️🚀🛸🚁🛶⛵🚤🛥️🛳️⛴️🚢⚓🗺️🗿🗽🗼🏰🏯🏟️🎡🎢🎠⛲⛱️🏖️🏝️🏜️🌋⛰️🏔️🗻🏕️⛺🏠🏡🏘️🏚️🏗️🏭🏢🏬🏣🏤🏥🏦🏨🏪🏫🏩💒🏛️⛪🕌🕍🛕🕋⛩️🌅🌄🌠🎇🎆🌇🌆🏙️🌃🌌🌉🌁') },
  { id: 'objects', label: 'Objects', icon: '💡', list: split('⌚📱💻⌨️🖥️🖨️🖱️💽💾💿📀📼📷📸📹🎥📽️🎞️📞☎️📺📻🎙️⏰⏳📡🔋🔌💡🔦🕯️🧯💸💵💴💶💷🪙💰💳💎⚖️🧰🔧🔨⚒️🛠️⛏️🔩⚙️🧱🔫💣🔪🗡️⚔️🛡️🔮📿🧿💈🔭🔬💊💉🩸🧬🦠🧫🧪🌡️🧹🧺🧻🚽🚿🛁🧼🪥🧽🛎️🔑🗝️🚪🪑🛋️🛏️🧸🖼️🛍️🛒🎁🎈🎏🎀🪄🎊🎉🎎🏮✉️📩📨📧💌📦🏷️📪📬📮📜📃📄📑📊📈📉📆📅🗓️📇🗃️🗳️🗄️📋📁📂🗂️📰📓📔📒📕📗📘📙📚📖🔖🔗📎🖇️📐📏📌📍✂️🖊️🖋️✒️🖌️🖍️📝✏️🔍🔎🔏🔐🔒🔓') },
  { id: 'symbols', label: 'Symbols', icon: '✅', list: split('✅☑️✔️❌❎➕➖➗✖️♾️‼️⁉️❓❔❕❗〰️💯🔟🔢#️⃣*️⃣0️⃣1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣9️⃣🆗🆕🆙🆒🆓🆘⛔🚫📵🔞☢️☣️⬆️↗️➡️↘️⬇️↙️⬅️↖️↕️↔️↩️↪️🔄🔃🔀🔁🔂▶️⏩⏭️⏯️◀️⏪⏮️🔼⏫🔽⏬⏸️⏹️⏺️🎦🔅🔆📶📳📴♀️♂️⚧️✳️✴️❇️©️®️™️🔴🟠🟡🟢🔵🟣🟤⚫⚪🟥🟧🟨🟩🟦🟪🟫⬛⬜🔶🔷🔸🔹🔺🔻💠🔘🔳🔲🏁🚩🎌🏴🏳️🏳️‍🌈🇮🇳🇺🇸🇬🇧🇨🇦🇦🇺') },
];

// Search words → emoji. Also drives the suggestions while typing (the last word you typed).
const WORDS: Record<string, string> = {
  happy: '😀😊😄🥳', smile: '🙂😊😄', lol: '😂🤣😆', haha: '😂🤣😆', hahaha: '😂🤣', funny: '😂🤣😆', laugh: '😂🤣', rofl: '🤣😂', lmao: '🤣😂', joke: '😂😜',
  love: '❤️😍🥰😘💕', loveyou: '❤️😘🥰', heart: '❤️💖💕🧡', miss: '🥺💔😢', cute: '🥰🥹😍', kiss: '😘💋😚', hug: '🤗🫂', crush: '😍🥰💘', baby: '👶🥺🍼', babe: '❤️😘🥰',
  sad: '😢😭😔💔', cry: '😭😢', sorry: '🙏😔🥺', hurt: '💔😢', tired: '😴🥱😩', sleep: '😴🛌💤', sleepy: '😴🥱', night: '🌙😴🌃', goodnight: '🌙😴💤', gn: '🌙😴',
  morning: '☀️🌅☕', gm: '☀️🌅', coffee: '☕', tea: '🍵☕', food: '🍕🍔😋', hungry: '🤤🍕🍔', pizza: '🍕', burger: '🍔', cake: '🎂🍰', party: '🥳🎉🎊', birthday: '🎂🥳🎉🎁',
  angry: '😡😠🤬', mad: '😡😤', ugh: '😩🙄', annoyed: '🙄😤', wow: '😮🤩😲', omg: '😱😮🤯', shock: '😱😲', scared: '😨😱', cool: '😎🆒', nice: '👌👍😎', great: '👍🙌💯',
  ok: '👌👍', okay: '👌👍', yes: '✅👍😄', no: '❌🙅', thanks: '🙏😊💐', thank: '🙏😊', thankyou: '🙏😊', please: '🙏🥺', hi: '👋😊', hello: '👋😊', hey: '👋😄', bye: '👋😘',
  fire: '🔥', lit: '🔥🙌', hot: '🔥🥵', cold: '🥶❄️', rain: '🌧️☔', sun: '☀️😎', star: '⭐🌟✨', stars: '✨🌟⭐', moon: '🌙🌕', sky: '🌌✨', space: '🌌🚀🪐',
  music: '🎵🎶🎧', song: '🎶🎵🎤', dance: '💃🕺', movie: '🎬🍿', watch: '🍿📺', film: '🎬🎥', game: '🎮🕹️', win: '🏆🥇🎉', congrats: '🎉🥳👏', clap: '👏', strong: '💪',
  think: '🤔💭', idk: '🤷', what: '🤨😳', sure: '👍👌', done: '✅👍', money: '💸💰', work: '💼💻😩', study: '📚✍️', exam: '📚😩', travel: '✈️🌍', home: '🏠🏡',
  dog: '🐶🐕', cat: '🐱🐈', flower: '🌸🌹🌷', rose: '🌹', gift: '🎁', kill: '💀😵', dead: '💀😂', cringe: '😬🫠', shy: '🙈☺️', wink: '😉', sick: '🤒🤧', pray: '🙏',
  beautiful: '😍🥰✨', pretty: '😍🌸', handsome: '😎😍', sexy: '🔥😏', proud: '🥹👏', crazy: '🤪', silly: '🤪😜', yum: '😋🤤', yummy: '😋🤤', drink: '🍻🥂', beer: '🍺🍻',
};
export const EMOJI_WORDS = WORDS;

/** Emoji matching a search (words like "love", "sad", "pizza"). */
export function searchEmoji(q: string): string[] {
  const s = q.trim().toLowerCase().replace(/[^a-z]/g, ''); if (!s) return [];
  const out: string[] = [];
  for (const [w, list] of Object.entries(WORDS)) if (w.startsWith(s) || (s.length > 3 && w.includes(s))) out.push(...split(list));
  return [...new Set(out)].slice(0, 60);
}
/** Up to 6 emoji for the word being typed at the end of the message. */
export function suggestEmoji(text: string): string[] {
  const m = text.toLowerCase().match(/([a-z]{2,})\s*$/); if (!m) return [];
  const w = m[1];
  const exact = WORDS[w] ? split(WORDS[w]) : [];
  const near = w.length >= 3 ? Object.entries(WORDS).filter(([k]) => k !== w && k.startsWith(w)).flatMap(([, v]) => split(v)) : [];
  return [...new Set([...exact, ...near])].slice(0, 6);
}

const RECENT = 'ourspace.recentEmoji';
export function recentEmoji(): string[] { try { return JSON.parse(localStorage.getItem(RECENT) || '[]'); } catch { return []; } }
export function rememberEmoji(e: string) { try { localStorage.setItem(RECENT, JSON.stringify([e, ...recentEmoji().filter(x => x !== e)].slice(0, 24))); } catch { /* fine */ } }

/** GIFs from GIPHY when a key is set (VITE_GIPHY_KEY); without one the GIF tab is hidden. */
export const GIPHY_KEY = (import.meta.env as Record<string, string | undefined>).VITE_GIPHY_KEY || '';
export type Gif = { id: string; preview: string; send: string; w: number; h: number; title: string };
export async function gifs(q: string, signal?: AbortSignal): Promise<Gif[]> {
  if (!GIPHY_KEY) return [];
  const u = q.trim() ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q.trim())}&limit=24&rating=pg-13`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=24&rating=pg-13`;
  const r = await fetch(u, { signal }); if (!r.ok) throw new Error('GIFs aren’t loading right now.');
  const j = await r.json() as { data: { id: string; title: string; images: Record<string, { url: string; width: string; height: string }> }[] };
  return j.data.map(g => ({ id: g.id, title: g.title, preview: g.images.fixed_width?.url || g.images.downsized.url, send: g.images.downsized?.url || g.images.original.url, w: Number(g.images.fixed_width?.width || 200), h: Number(g.images.fixed_width?.height || 200) }));
}
