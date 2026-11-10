/* Shared helpers for the hidden owner tools: /rental-analysis/ and /roi/ */
const LEAD_ENDPOINT='https://script.google.com/macros/s/AKfycbxiUPWW_3LP4Nr4z1VssKjqdEwWFOIvFDvCP9stkwJX-ytIjW3n00L7NV02nkXOpYPm/exec';
const RENT_MAP={'0':1100,'1':1400,'2':1750,'3':2200,'4':2700,'5':3200}; // regional fallback only when too few comps
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>(n<0?'−':'')+'$'+Math.abs(Math.round(n)).toLocaleString();
const num=id=>{const v=parseFloat(String($(id).value).replace(/[^0-9.\-]/g,''));return isNaN(v)?0:v;};
const bedTxt=b=>b==null?'—':(+b===0?'Studio':b+' bd');
function median(a){const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length%2?s[m]:Math.round((s[m-1]+s[m])/2);}
async function getJSON(u){try{const r=await fetch(u,{cache:'no-cache'});if(!r.ok)throw 0;return await r.json();}catch(e){return null;}}
async function loadProps(){const d=await getJSON('/api/listings');return (d&&d.listings||[]).filter(p=>p.rent);}
function saveA(o){try{localStorage.setItem('sohoAnalysis',JSON.stringify(o));}catch(e){}try{sessionStorage.setItem('sohoAnalysis',JSON.stringify(o));}catch(e){}}
function loadA(){for(const s of [()=>sessionStorage,()=>localStorage]){try{const v=s().getItem('sohoAnalysis');if(v)return JSON.parse(v);}catch(e){}}return null;}
function sendLead(lead){return fetch(LEAD_ENDPOINT,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(lead)}).then(()=>true).catch(()=>false);}
/* Comps: manual MLS comps in /market-rents.json (city -> beds -> {rent, comps[]}) win; otherwise live SOHO listings; regional fallback last */
function cityOf(addr,props,over){const a=addr.toLowerCase();const cities=[...new Set([...props.map(p=>p.city),...Object.keys(over||{}).filter(k=>k[0]!=='_')].filter(Boolean))];return cities.find(c=>a.includes(c.toLowerCase()))||'';}
function pickComps(props,over,beds,addr,target){
  const b=+beds,city=cityOf(addr,props,over);
  const ov=over&&city&&over[city]&&over[city][String(b>=5?5:b)];
  const match=p=>b>=5?p.beds>=5:p.beds===b;
  const score=p=>Math.abs((p.rent||target)-target)/100+Math.abs((p.beds||0)-b)*30+((city&&p.city!==city)?8:0);
  const same=props.filter(match).sort((x,y)=>score(x)-score(y));
  const rest=props.filter(p=>!match(p)).sort((x,y)=>score(x)-score(y));
  let comps=same.slice(0,5);
  if(comps.length<3)comps=[...comps,...rest.slice(0,3-comps.length)];
  let rent,basis,sure;
  if(ov&&ov.rent){rent=ov.rent;basis='MLS comparables';sure=true;comps=[...(ov.comps||[]).map(c=>({address:c.address,city:c.city||city,beds:c.beds==null?b:c.beds,baths:c.baths,rent:c.rent,url:c.url||'',image:''})),...comps].slice(0,5);}
  else if(same.length>=2){rent=median(same.slice(0,5).map(p=>p.rent));basis='current asking rents on '+Math.min(same.length,5)+' comparable SOHO listings';sure=true;}
  else{rent=RENT_MAP[String(Math.min(b,5))]||1500;basis='a regional estimate (few exact comps available right now)';sure=false;}
  return {rent,comps,basis,sure,city};
}
function compHTML(c){const inner=`${c.image?`<img src="${esc(c.image)}" alt="" loading="lazy" onerror="this.style.display='none'">`:''}<span class="t"><strong style="font-weight:500">${esc(c.address)}</strong><br><span>${esc(c.city||'')} · ${bedTxt(c.beds)}${c.baths!=null?' · '+c.baths+' ba':''}</span></span><span class="p">${money(c.rent)}<small style="font-size:11px;color:var(--conc)">/mo</small></span>`;return c.url?`<a class="comp" href="${esc(c.url)}" target="_blank" rel="noopener">${inner}</a>`:`<div class="comp">${inner}</div>`;}
