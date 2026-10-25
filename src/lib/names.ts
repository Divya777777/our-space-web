// Fresh name ideas every time a create screen opens; tapping one fills the field.
const ROOM_IDEAS = [
  'Moonlit lounge', 'Our little universe', 'Late night talks', 'Movie nights', 'Long distance, short hearts', 'Sunday chai club', 'Starlight corner',
  'The cozy couch', 'Rainy day hideout', 'Midnight jam', 'Two moons', 'Popcorn & pillows', 'Study buddies', 'Family ghar', 'Squad hangout',
  'Golden hour', 'Our secret orbit', 'Velvet sky', 'Weekend vibes', 'The listening room', 'Chill zone', 'Dream deck', 'Sleepless in sync', 'Home away from home',
];
const PLAYLIST_IDEAS = [
  'Late-night favorites', 'Monsoon baarish', 'Sunday chai', 'Road trip anthems', 'Lofi study', 'Us forever', 'Gym beast mode', 'Goa sunset',
  'Bollywood retro', 'Dance till 2am', 'Heartbreak hotel', 'Winter cozy', 'Morning coffee', 'Party starters', 'Slow songs for slow days',
  'Songs that remind me of you', 'Main character energy', 'Rain on the window', 'Desi summer', 'Chill & scroll', 'Soft acoustic', 'Our song list',
];
function pick(pool: string[], count: number, avoid: string[] = []) {
  const options = pool.filter(name => !avoid.includes(name));
  for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [options[i], options[j]] = [options[j], options[i]]; }
  return options.slice(0, count);
}
export const roomIdeas = (count = 4, avoid?: string[]) => pick(ROOM_IDEAS, count, avoid);
export const playlistIdeas = (count = 4, avoid?: string[]) => pick(PLAYLIST_IDEAS, count, avoid);
