// Cloudflare Pages Function: GET /api/listings
// Reads SOHO's public AppFolio listings page (no API key) and returns clean JSON.
const HOST = 'https://smithoakre.appfolio.com';

const decode = s => (s || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

const grab = (block, cls) => {
  const m = block.match(new RegExp('class="[^"]*' + cls + '[^"]*"[^>]*>([\\s\\S]*?)</(?:span|dd|div|p|h\\d|a)>', 'i'));
  return m ? decode(m[1]) : '';
};

function parse(html) {
  const starts = [];
  const re = /<div[^>]+class="[^"]*\blisting-item\b[^"]*"/g;
  let m;
  while ((m = re.exec(html))) starts.push(m.index);
  const byId = new Map();
  starts.forEach((s, i) => {
    const b = html.slice(s, starts[i + 1] || html.length);
    const id = (b.match(/\/listings\/detail\/([0-9a-f-]{36})/i) || [])[1];
    if (!id) return;
    const rent = parseInt((grab(b, 'js-listing-blurb-rent').replace(/[^0-9]/g, '')) || '0', 10) || null;
    const bb = grab(b, 'js-listing-blurb-bed-bath');
    const bedM = bb.match(/(\d+(?:\.\d+)?)\s*bd/i);
    const bathM = bb.match(/(\d+(?:\.\d+)?)\s*ba/i);
    const studio = /studio/i.test(bb);
    const addrFull = grab(b, 'js-listing-address');
    const parts = addrFull.split(',').map(x => x.trim());
    const stZip = (parts[parts.length - 1] || '').match(/([A-Z]{2})\s*(\d{5})/);
    const city = parts.length >= 3 ? parts[parts.length - 2] : '';
    const street = parts.slice(0, parts.length - 2).join(', ');
    const titleM = b.match(/<a[^>]+href="\/listings\/detail\/[^"]+"[^>]*>\s*([^<\s][^<]*)<\/a>/i);
    const img = (b.match(/<img[^>]+(?:data-original|data-src|src)="([^"]+)"/i) || [])[1] || '';
    const sq = (b.match(/([\d,]{3,6})\s*(?:sq\.?\s*ft|sf)\b/i) || [])[1];
    const avail = grab(b, 'js-listing-available').replace(/^Available\s*/i, '');
    const rec = {
      id,
      url: HOST + '/listings/detail/' + id,
      title: titleM ? decode(titleM[1]) : '',
      address: street,
      city,
      state: stZip ? stZip[1] : 'RI',
      zip: stZip ? stZip[2] : '',
      rent,
      beds: studio ? 0 : (bedM ? parseFloat(bedM[1]) : null),
      baths: bathM ? parseFloat(bathM[1]) : null,
      sqft: sq ? parseInt(sq.replace(/,/g, ''), 10) : null,
      available: avail,
      description: grab(b, 'js-listing-description'),
      image: img ? (img.startsWith('http') ? img : HOST + img) : '',
      order: i
    };
    const prev = byId.get(id);
    if (!prev) { byId.set(id, rec); return; }
    // AppFolio splits a listing across blocks: merge, keeping first non-empty value
    Object.keys(rec).forEach(k => {
      if (k === 'order') return;
      if (prev[k] === '' || prev[k] === null || prev[k] === undefined) prev[k] = rec[k];
    });
  });
  const out = [...byId.values()];
  out.forEach(x => { if (/^now$/i.test(x.available)) x.available = 'Now'; });
  return out.filter(x => x.rent || x.address);
}

export async function onRequestGet() {
  try {
    const r = await fetch(HOST + '/listings', {
      headers: { 'User-Agent': 'SOHO-Website/1.0' },
      cf: { cacheTtl: 300, cacheEverything: true }
    });
    if (!r.ok) throw new Error('AppFolio ' + r.status);
    const listings = parse(await r.text());
    return new Response(JSON.stringify({ updated: new Date().toISOString(), count: listings.length, listings }), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=120, s-maxage=300',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e), listings: [] }), {
      status: 502, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  }
}
