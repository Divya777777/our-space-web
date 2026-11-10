// After `vite build`: makes the public pages readable by search engines and link previews.
//  1. Opens the built front page in headless Chromium (signed out) and saves the rendered front page into
//     dist/index.html, so the HTML itself contains the headline, features, privacy and FAQ text. The app still
//     starts normally on top of it (createRoot replaces the saved markup with the live page).
//  2. Adds FAQ structured data built from the FAQ shown on the page (so it never drifts from the page).
//  3. Copies the privacy / terms / support / delete-account pages from the backend onto this domain
//     (getourspace.com/privacy …), with forms still posting to the backend.
//  4. Writes sitemap.xml for the pages that exist.
// Needs: dist/ built and dist/404.html already copied from the plain index.html (room links must not show the
// front page). Uses Playwright (installed in CI with `npm i --no-save playwright` + `npx playwright install chromium`).
// Any failure leaves the normal build untouched.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const SITE = (process.env.SITE_URL || 'https://getourspace.com').replace(/\/$/, '');
const API = (process.env.VITE_API_URL || 'https://our-space-stg.onrender.com').replace(/\/$/, '').replace(/\/api$/, '');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.zip': 'application/zip' };
const today = new Date().toISOString().slice(0, 10);
const pages = [{ loc: '/', priority: '1.0' }];

async function serve() {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(DIST, path);
    try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch { file = join(DIST, 'index.html'); }
    try { res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(await readFile(file)); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return server;
}

async function frontPage() {
  const { chromium } = await import('playwright');
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    // Signed out, no backend calls needed; keep third-party requests from slowing the snapshot.
    await page.route('**/*', r => { const u = r.request().url(); return u.startsWith('http://127.0.0.1') || u.startsWith('data:') ? r.continue() : r.abort(); });
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
    await page.waitForSelector('#root h1', { timeout: 20000 });
    await page.waitForTimeout(1500);
    const { html, faq } = await page.evaluate(() => ({
      html: document.getElementById('root').innerHTML,
      faq: [...document.querySelectorAll('.lp-faq details')].map(d => ({ q: d.querySelector('summary')?.textContent?.trim() || '', a: d.querySelector('p')?.textContent?.trim() || '' })).filter(x => x.q && x.a),
    }));
    if (html.length < 2000) throw new Error(`front page looks empty (${html.length} chars)`);
    let index = await readFile(join(DIST, 'index.html'), 'utf8');
    index = index.replace('<div id="root"></div>', `<div id="root">${html}</div>`);
    if (faq.length) {
      const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
      index = index.replace('</head>', `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n</head>`);
    }
    await writeFile(join(DIST, 'index.html'), index);
    console.log(`prerender: front page saved (${html.length} chars, ${faq.length} FAQ entries)`);
  } finally { await browser.close(); server.close(); }
}

async function fetchText(url) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60000) }); // the free backend may need to wake up
      if (r.ok) return await r.text();
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 5000));
  }
  return null;
}

async function legalPages() {
  const DESC = {
    privacy: 'How Our Space handles your data: end-to-end encrypted chat, history on your own devices, no ads and no selling of data.',
    terms: 'The terms for using Our Space, the private room to watch together, call, chat, play and keep goals with your people.',
    support: 'Help with Our Space: notifications, calls, steps, reporting and blocking, and account deletion.',
    'delete-account': 'Delete your Our Space account and the data that belongs to it.',
  };
  for (const name of Object.keys(DESC)) {
    let html = await fetchText(`${API}/${name}`);
    if (!html || !/<html/i.test(html)) { console.log(`prerender: skipped /${name} (backend didn't answer)`); continue; }
    html = html.replace(/action="\//g, `action="${API}/`); // forms keep posting to the backend
    const head = `<link rel="canonical" href="${SITE}/${name}/" /><meta name="description" content="${DESC[name]}" /><link rel="icon" type="image/png" href="/favicon.png" />`;
    html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${head}</head>`) : head + html;
    await mkdir(join(DIST, name), { recursive: true });
    await writeFile(join(DIST, name, 'index.html'), html);
    if (name !== 'delete-account') pages.push({ loc: `/${name}/`, priority: '0.3' });
    console.log(`prerender: /${name}/ copied`);
  }
}

async function sitemap() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(p => `  <url><loc>${SITE}${p.loc}</loc><lastmod>${today}</lastmod><priority>${p.priority}</priority></url>`).join('\n')}\n</urlset>\n`;
  await writeFile(join(DIST, 'sitemap.xml'), xml);
  console.log(`prerender: sitemap.xml with ${pages.length} pages`);
}

let failed = false;
try { await frontPage(); } catch (e) { failed = true; console.log('prerender: front page skipped:', e.message); }
try { await legalPages(); } catch (e) { console.log('prerender: legal pages skipped:', e.message); }
await sitemap();
if (failed) console.log('prerender: the site still works; only the front-page snapshot is missing.');
