// SOHO Management site Worker: serves static files + /api/listings (reads public AppFolio listings)
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
    const imgTag = (b.match(/<img[^>]*listing-item__image[^>]*>/i) || b.match(/<img[^>]*>/i) || [''])[0];
    let img = (imgTag.match(/data-original="([^"]+)"/i) || imgTag.match(/data-src="([^"]+)"/i) || [])[1] || '';
    if (!img) { const sr = (imgTag.match(/\ssrc="([^"]+)"/i) || [])[1] || ''; img = /place_?holder/i.test(sr) ? '' : sr; }
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


async function listings() {
  try {
    const r = await fetch(HOST + '/listings', {
      headers: { 'User-Agent': 'SOHO-Website/1.0' },
      cf: { cacheTtl: 300, cacheEverything: true }
    });
    if (!r.ok) throw new Error('AppFolio ' + r.status);
    const items = parse(await r.text());
    return new Response(JSON.stringify({ updated: new Date().toISOString(), count: items.length, listings: items }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=120, s-maxage=300' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e), listings: [] }), {
      status: 502, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  }
}

// Google reviews (Places API New). Needs secret GOOGLE_PLACES_KEY and var GOOGLE_PLACE_ID. Only 5-star reviews are returned.
async function reviews(env, request) {
  const H = { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=21600' };
  if (!env.GOOGLE_PLACES_KEY || !env.GOOGLE_PLACE_ID) {
    return new Response(JSON.stringify({ configured: false, reviews: [] }), { headers: { ...H, 'Cache-Control': 'no-store' } });
  }
  try {
    const r = await fetch('https://places.googleapis.com/v1/places/' + encodeURIComponent(env.GOOGLE_PLACE_ID), {
      headers: { 'X-Goog-Api-Key': env.GOOGLE_PLACES_KEY, 'X-Goog-FieldMask': 'displayName,rating,userRatingCount,googleMapsUri,reviews' },
      cf: { cacheTtl: 21600, cacheEverything: true }
    });
    if (!r.ok) throw new Error('Places API ' + r.status);
    const d = await r.json();
    if (new URL(request.url).searchParams.get('debug')) return new Response(JSON.stringify({raw:(d.reviews||[]).map(v=>({rating:v.rating,len:(v.text&&v.text.text||'').length,orig:(v.originalText&&v.originalText.text||'').length}))}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    const list = (d.reviews || []).filter(v => v.rating === 5 && v.text && v.text.text && v.text.text.trim().length > 20).map(v => ({
      author: v.authorAttribution?.displayName || 'Google user',
      authorUrl: v.authorAttribution?.uri || '',
      when: v.relativePublishTimeDescription || '',
      text: v.text.text.trim()
    }));
    return new Response(JSON.stringify({ configured: true, name: d.displayName?.text || '', rating: d.rating || null, count: d.userRatingCount || 0, url: d.googleMapsUri || '', reviews: list }), { headers: H });
  } catch (e) {
    return new Response(JSON.stringify({ configured: true, error: String(e.message || e), reviews: [] }), { status: 200, headers: { ...H, 'Cache-Control': 'no-store' } });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/listings') return listings();
    if (url.pathname === '/api/reviews') return reviews(env, request);
    return env.ASSETS.fetch(request);
  }
};
