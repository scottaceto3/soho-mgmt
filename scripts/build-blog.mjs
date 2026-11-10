// Builds static blog pages from content/posts/*.json -> public/blog/**, plus sitemap.xml and posts.json.
// Run: node scripts/build-blog.mjs   (no dependencies)
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SITE = 'https://soho-mgmt.com';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const dir = path.join(ROOT, 'content/posts');
const posts = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
  .sort((a, b) => b.date.localeCompare(a.date));
const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

const head = (title, desc, url, extra = '') => `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${url}">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="96x96" href="/favicon-96.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#1A1A1A">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="article"><meta property="og:url" content="${SITE}${url}"><meta property="og:image" content="${SITE}/icon-512.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Albert+Sans:wght@200;300;400;600&family=Figtree:wght@300;400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/blog/blog.css">${extra}</head><body>
<nav class="bnav"><a href="/" class="blogo"><img src="/assets/soho-logo-dark.png" alt="SOHO by Smith &amp; Oak" width="1797" height="282"></a>
<div class="blinks"><a href="/#vacancies">Find a Home</a><a href="/#owners">For Owners</a><a href="/blog/" class="on">Blog</a><a href="/#contact">Contact</a><a class="bbtn" href="https://smithoakre.appfolio.com/connect" target="_blank" rel="noopener">Portal Login</a></div></nav>`;
const foot = `<footer class="bfoot"><p>© ${new Date().getFullYear()} SOHO Management LLC · Rhode Island &amp; Southern Massachusetts · <a href="/">soho-mgmt.com</a> · <a href="https://smithoakre.appfolio.com/listings" target="_blank" rel="noopener">Available Homes</a></p></footer></body></html>`;

const card = p => `<a class="card" href="/blog/${p.slug}/"><span class="tag">${esc(p.area || 'Local Guide')}</span><h2>${esc(p.title)}</h2><p>${esc(p.excerpt || p.metaDescription)}</p><span class="meta">${fmt(p.date)}</span></a>`;

fs.mkdirSync(path.join(ROOT, 'public/blog'), { recursive: true });
// index
fs.writeFileSync(path.join(ROOT, 'public/blog/index.html'),
  head('SOHO Local Guides | Life Around Our Rentals in Rhode Island & Southern Massachusetts', 'Coffee shops, things to do, schools and neighborhood life around SOHO Management rentals across Rhode Island & Southern Massachusetts.', '/blog/') +
  `<header class="hero"><span class="tag">SOHO Local Guides</span><h1>Life Around Our Homes</h1><p>Neighborhood spotlights, local businesses and things to do near SOHO Management rentals across Rhode Island and Southern Massachusetts.</p></header>
<main class="grid">${posts.map(card).join('') || '<p class="empty">First guide coming soon.</p>'}</main>` + foot);

// posts
for (const p of posts) {
  const d = path.join(ROOT, 'public/blog', p.slug); fs.mkdirSync(d, { recursive: true });
  const ld = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.metaDescription, datePublished: p.date, dateModified: p.date,
    author: { '@type': 'Organization', name: 'SOHO Management LLC' }, publisher: { '@type': 'Organization', name: 'SOHO Management LLC', logo: { '@type': 'ImageObject', url: SITE + '/icon-512.png' } },
    mainEntityOfPage: `${SITE}/blog/${p.slug}/` };
  const biz = (p.businesses || []).length ? `<aside class="biz"><h3>Local spots mentioned</h3><ul>${p.businesses.map(b => `<li>${b.url ? `<a href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.name)}</a>` : esc(b.name)}${b.note ? ` — ${esc(b.note)}` : ''}</li>`).join('')}</ul></aside>` : '';
  const cta = p.listing ? `<aside class="cta"><h3>Live here</h3><p>${esc(p.listing.address)} is currently available through SOHO Management.</p><a class="bbtn" href="${esc(p.listing.url || 'https://smithoakre.appfolio.com/listings')}" target="_blank" rel="noopener">View this home</a> <a class="bbtn ghost" href="/#vacancies">Browse all homes</a></aside>` : '';
  fs.writeFileSync(path.join(d, 'index.html'),
    head(`${p.title} | SOHO Management`, p.metaDescription, `/blog/${p.slug}/`, `<script type="application/ld+json">${JSON.stringify(ld)}</script>`) +
    `<article class="post"><span class="tag">${esc(p.area || 'Local Guide')}</span><h1>${esc(p.title)}</h1><div class="meta">${fmt(p.date)} · SOHO Management</div>
<p class="lead">${esc(p.intro)}</p>${(p.sections || []).map(s => `<h2>${esc(s.heading)}</h2>${s.html}`).join('')}${biz}${cta}
<p class="back"><a href="/blog/">← All local guides</a></p></article>` + foot);
}
fs.writeFileSync(path.join(ROOT, 'public/blog/posts.json'), JSON.stringify(posts.map(({ slug, title, date, area, excerpt, listing }) => ({ slug, title, date, area, excerpt, listingId: listing?.id, address: listing?.address })), null, 1));

// sitemap
const urls = ['/', '/blog/', ...posts.map(p => `/blog/${p.slug}/`)];
fs.writeFileSync(path.join(ROOT, 'public/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${SITE}${u}</loc></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(ROOT, 'public/robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`Built ${posts.length} post(s).`);
