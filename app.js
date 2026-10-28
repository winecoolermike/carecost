(() => {
  const $ = s => document.querySelector(s);
  const PAGE = 20;
  const TULIP = 'https://tulip.hhs.texas.gov/TULIP/s/ltc-provider-search';
  let META, ZIPS, shardCache = {}, groups = [], view = [], shown = 0, cur = null, repTarget = null;
  const ct = new Set();
  const KIND = {
    both: ['Medicare + TX licensed', 'b-both'],
    licensed_home_care: ['TX licensed home care', 'b-hc'],
    licensed_home_health: ['TX licensed home health', 'b-hh'],
    medicare_home_health: ['Medicare home health', 'b-mc'],
  };
  const OFF = { n: 'Nursing', p: 'Physical therapy', o: 'Occupational therapy', s: 'Speech therapy', a: 'Home health aide', m: 'Medical social work' };
  const STATUS = { 'ENFORCEMENT ACTION PEND': 'Licensed · enforcement action pending', 'RENEWAL IN PROCESS': 'Licensed · renewal in process' };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const title = s => String(s || '').toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase()).replace(/\b(Llc|Inc|Lp|Ltd|Pllc|Tx)\b/g, m => m.toUpperCase());
  const fmtPhone = p => p && p.length === 10 ? `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}` : (p || '');
  const fmtDate = d => d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const starTxt = v => v == null ? '' : '★'.repeat(Math.floor(v)) + (v % 1 ? '½' : '');
  const gq = q => 'https://www.google.com/search?q=' + encodeURIComponent(q);
  const mi = d => d == null ? '' : `~${d.toFixed(d < 10 ? 1 : 0)} mi`;

  async function init() {
    [META, ZIPS] = await Promise.all([fetch('data/meta.json').then(r => r.json()), fetch('data/zips.json').then(r => r.json())]);
    const s = META.sources;
    $('#built').innerHTML = `<b>Last built:</b> ${fmtDate(META.built_at)}. Texas list as of ${fmtDate(s.tx_hcssa.as_of)}; CMS release ${fmtDate(s.provider.released)} (<a href="${esc(s.provider.url)}">file</a>, <a href="${esc(s.hhcahps.url)}">survey file</a>).`;
    const sp = new URLSearchParams(location.search);
    if (sp.get('r') === '25') $('#rad').value = '25';
    if (sp.get('zip')) { $('#zip').value = sp.get('zip'); run(sp.get('zip')); }
  }
  const shard = p => (shardCache[p] ||= fetch(`data/p${p}.json`).then(r => r.ok ? r.json() : []));
  function msg(html) { const m = $('#msg'); m.hidden = !html; m.innerHTML = html || ''; }

  async function run(zip) {
    zip = (zip || '').trim();
    if (!/^\d{5}$/.test(zip)) return msg('Please enter a 5-digit ZIP code.');
    const c = ZIPS[zip];
    if (!c) { $('#list').innerHTML = ''; $('#top').hidden = $('#lhead').hidden = true; $('#bench').hidden = true; $('#count').textContent = ''; $('#rule').textContent = ''; $('#more').hidden = true; return msg(`We couldn't find <b>${esc(zip)}</b> in our Texas ZIP list. This version covers Texas only (some PO-box-only ZIPs have no map center).`); }
    msg(''); medOnly = false; $('#count').textContent = 'Searching…';
    const R = +$('#rad').value;
    history.replaceState(null, '', `?zip=${zip}${R !== 10 ? '&r=' + R : ''}`);
    const rows = await shard(zip.slice(0, 3));
    // Match rule: Medicare agencies (have CMS service-area data) only if CMS lists the ZIP;
    // TX-licensed agencies without CMS service-area data if an office is within R miles.
    const byG = new Map();
    for (const a of rows) {
      const d = a.y != null ? Rules.miles(c[0], c[1], a.y, a.x) : null;
      const hasCms = !!a.m;
      const serves = hasCms && (a.sz || []).includes(zip);
      const near = !hasCms && d != null && d <= R;
      if (!(serves || near)) continue;
      let g = byG.get(a.gk);
      if (!g) byG.set(a.gk, g = { gk: a.gk, locs: [], serves: false, d: null });
      g.locs.push({ a, d }); g.serves ||= serves;
      if (d != null && (g.d == null || d < g.d)) g.d = d;
    }
    groups = [...byG.values()];
    for (const g of groups) {
      g.locs.sort((x, y) => (x.a.t?.[4] === 'P' ? -1 : 0) - (y.a.t?.[4] === 'P' ? -1 : 0) || (x.d ?? 999) - (y.d ?? 999));
      g.a = g.locs[0].a; // parent agency row first, else nearest
      g.near = g.locs.reduce((m, l) => (l.d ?? 1e9) < (m.d ?? 1e9) ? l : m, g.locs[0]).a;
      g.ct = [...new Set(g.locs.flatMap(l => [...l.a.ct]))].join('');
    }
    cur = { zip, R, locs: groups.reduce((n, g) => n + g.locs.length, 0) };
    render();
  }

  function render() {
    if (!cur) return;
    view = groups.filter(g => [...ct].every(k => g.ct.includes(k)));
    const st = a => a.m ? (a.m[2] ?? -1) * 10 + (a.m[1] ?? -1) : -99;
    view.sort($('#sort').value === 'stars' ? (x, y) => (st(y.a) - st(x.a)) || ((x.d ?? 999) - (y.d ?? 999)) : (x, y) => (x.d ?? 999) - (y.d ?? 999));
    const nl = view.reduce((n, g) => n + g.locs.length, 0);
    const nm = view.filter(g => g.serves).length;
    $('#count').innerHTML = `<b>${view.length}</b> agenc${view.length === 1 ? 'y' : 'ies'} · ${nl} location${nl === 1 ? '' : 's'}` + (ct.size ? ' (filtered)' : '');
    $('#rule').textContent = `${nm} Medicare agenc${nm === 1 ? 'y lists' : 'ies list'} ${cur.zip} as served · ${view.length - nm} Texas-licensed agenc${view.length - nm === 1 ? 'y has an office' : 'ies have an office'} within ${cur.R} mi.`;
    const b = META.benchmark;
    $('#bench').hidden = false;
    $('#bench').innerHTML = `<span class="est">ESTIMATE</span> Typical Texas price: <b>$${b.non_medical_hourly_usd}/hr</b> non-medical caregiver${ct.has('S') ? `, <b>$${b.private_duty_nurse_hourly_usd}/hr</b> private-duty nurse` : ''}. State median from <a href="${esc(b.source_url)}" target="_blank" rel="noopener">CareScout Cost of Care Survey 2025</a> — not a quote from any agency below. Medicare-covered home health is usually billed to Medicare, not hourly.`;
    // Verified live 2026-10-27 (PT); no eligibility rules or amounts stated on purpose
    $('#bench').innerHTML += `<div class="pay">This is a private-pay estimate. Some families may qualify for reduced-cost or subsidized care through Texas Medicaid or other programs.<br><b>Ways to pay less:</b> ` +
      [['https://www.hhs.texas.gov/services/health/medicaid-chip/medicaid-chip-members/starplus', 'Texas Medicaid (STAR+PLUS)'],
       ['https://resources.hhs.texas.gov/pages/find-services', 'Local aging office (Texas HHS)'],
       ['https://eldercare.acl.gov/home', 'Eldercare Locator'],
       ['https://www.va.gov/geriatrics/pages/Homemaker_and_Home_Health_Aide_Care.asp', 'VA home care for Veterans']]
      .map(([u, t]) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`).join(' · ') + `</div>`;
    if (Rules.rateSpread([]).length) $('#bench').innerHTML += `<br>⚠️ Prices vary a lot here — get several quotes.`; // dormant until rates exist
    // Nearest sort: a small "Medicare agencies serving this ZIP" section on top so they don't sink below nearby offices
    const top = $('#top'), lh = $('#lhead'); top.hidden = lh.hidden = true; top.innerHTML = '';
    if (medOnly) {
      view = view.filter(g => g.serves);
      lh.hidden = false; lh.innerHTML = `Medicare agencies serving ${cur.zip} (${view.length}) <button class="link" id="back">Back to all agencies</button>`;
    } else if ($('#sort').value === 'dist' && nm && nm < view.length) {
      const t3 = view.filter(g => g.serves).slice(0, 3);
      top.hidden = lh.hidden = false;
      top.innerHTML = `<h2 class="sec">Medicare agencies serving ${cur.zip}</h2>` + t3.map(card).join('') +
        (nm > t3.length ? `<button class="ghost wide" id="allmed">See all ${nm} Medicare agencies serving ${cur.zip}</button>` : '');
      view = view.filter(g => !t3.includes(g));
      lh.textContent = `All other agencies, nearest first`;
    }
    $('#list').innerHTML = ''; shown = 0; more();
    msg(view.length ? '' : `No agencies match. Try ${cur.R === 10 ? '25 mi, ' : ''}removing a care-type filter, or a nearby ZIP.`);
  }

  let medOnly = false;
  function more() {
    $('#list').insertAdjacentHTML('beforeend', view.slice(shown, shown + PAGE).map(card).join(''));
    shown += PAGE; $('#more').hidden = shown >= view.length;
    $('#more').textContent = `Show more (${Math.max(0, view.length - shown)} left)`;
  }

  // Residential-looking addresses are blanked at build time (r.ra); show city + ZIP only
  const addr = r => (r.a ? title(r.a) + ', ' : '') + title(r.c) + ' ' + r.z;
  const asOf = r => r.t?.[2] ? fmtDate(r.t[2]) : null;
  function card(g, idx) {
    const a = g.a, [kl, kc] = KIND[a.k], city = title(a.c), gi = groups.indexOf(g);
    const svc = [];
    if (g.ct.includes('C')) svc.push(`<span class="inf" title="Inferred from TX Personal Assistance Services license">🤝 Companionship</span>`);
    if (g.ct.includes('P')) svc.push(`<span class="inf" title="Inferred from TX Personal Assistance Services license">🛁 Personal care</span>`);
    if (g.ct.includes('S')) svc.push(`<span class="${a.sf ? '' : 'inf'}" title="${a.sf ? 'CMS: offers nursing care' : 'Inferred from TX Licensed Home Health Services'}">🩺 Skilled nursing</span>`);
    if (a.m) for (const k of a.m[4]) if (k !== 'n') svc.push(`<span title="CMS fact">${OFF[k]}</span>`);
    let stars;
    if (a.m) {
      const [, q, s, n] = a.m;
      stars = `<div class="stars">` + (q != null ? `Quality <b>${starTxt(q)}</b> ${q}/5` : `<span class="nr">Quality: not rated</span>`) + ' · ' +
        (s != null ? `Patients <b>${starTxt(s)}</b> ${s}/5 <span class="nr">(${n ?? '?'} surveys)</span>` : `<span class="nr">Patient survey: not rated</span>`) + `</div>`;
    } else stars = `<div class="nr">Not Medicare-rated</div>`;
    const sts = [...new Set(g.locs.map(l => l.a.t?.[1]).filter(Boolean))];
    const ao = asOf(a) || fmtDate(META.sources.tx_hcssa.as_of);
    const stBadge = sts.filter(x => x !== 'LICENSED FACILITY').map(x => `<span class="badge b-note">${esc(STATUS[x] || title(x))}</span>`).join('');
    const stNote = sts.includes('ENFORCEMENT ACTION PEND') ? `<div class="stnote">Texas HHSC lists this license as active with an enforcement action pending, as of ${ao}. HHSC does not publish what the action is or whether it will be upheld. Ask the agency, or verify on Texas HHSC.</div>`
      : sts.includes('RENEWAL IN PROCESS') ? `<div class="stnote">Texas HHSC lists this license renewal as in process, as of ${ao}.</div>` : '';
    const n = g.near, pre = g.locs.length > 1 ? 'Nearest office' : 'Office';
    const off = n.g && n.z === cur.zip ? `${pre} in ${cur.zip}` : `${pre} ${mi(g.d)} away${n.g ? ' (approx.)' : ''}`;
    const where = g.serves ? `Serves ${cur.zip} (per CMS) · ${off.replace('Office', 'office')}` : off;
    const lbl = Rules.confLabel(a.cf);
    const lic = a.t?.[0];
    const locs = g.locs.length > 1 ? `<details class="locs"><summary>${g.locs.length} locations</summary><ul>${g.locs.map(({ a: l, d }) =>
      `<li>${esc(addr(l))}${d != null ? ' · ' + mi(d) : ''}${l.p ? ` · <a href="tel:+1${esc(l.p)}">${fmtPhone(l.p)}</a>` : ''}${l.t ? (l.t[4] === 'P' ? ' · main office' : ' · branch') : ''}</li>`).join('')}</ul></details>` : '';
    return `<article class="card">
      <div><span class="badge ${kc}">${kl}</span>${stBadge}</div>
      <h3>${esc(title(a.n))}</h3>
      ${stNote}
      <div class="meta">${esc(addr(g.near))} · ${esc(where)}</div>
      ${locs}
      <div class="svc">${svc.join('')}</div>
      ${stars}
      <div class="price">Call for price</div>
      <div class="conf">Confidence: <span class="c-${lbl}">${lbl}</span> (${a.cf}) · Verified ${fmtDate(a.lv)}${a.t ? ` · TX list as of ${ao}` : ''}${a.q ? ' · <span title="Texas and Medicare records disagree on some details">records conflict</span>' : ''}${lic ? ` · TX lic. ${esc(lic)}` : ''}${a.m ? ` · CCN ${esc(a.m[0])}` : ''}</div>
      <div class="acts">
        ${a.p ? `<a class="call" href="tel:+1${esc(a.p)}" aria-label="Call ${esc(title(a.n))} ${fmtPhone(a.p)}">📞 Call</a>` : '<a aria-disabled="true">No phone</a>'}
        <a href="${gq(`${a.n} ${city} TX`)}" target="_blank" rel="noopener" title="Google search for the agency's website">🌐 Website</a>
        <a href="${gq(`${a.n} ${city} TX reviews`)}" target="_blank" rel="noopener">⭐ Reviews</a>
      </div>
      <div class="links">
        ${lic ? `<a href="${TULIP}" target="_blank" rel="noopener" data-lic="${esc(lic)}" class="verify" title="Opens HHSC's TULIP provider search; enter license ${esc(lic)} (copied for you)">✔ Verify on Texas HHSC (lic. ${esc(lic)})</a>` : a.m ? `<a href="https://www.medicare.gov/care-compare/details/home-health/${esc(a.m[0])}" target="_blank" rel="noopener">✔ Verify on Medicare Care Compare</a>` : ''}
        <a href="#" class="report" data-g="${gi}">⚑ Report an error</a>
      </div>
    </article>`;
  }

  // Verify: copy license number to clipboard, then let the link open TULIP (no deep link exists)
  ['#list', '#top'].forEach(s => $(s).addEventListener('click', e => {
    if (e.target.id === 'allmed') { medOnly = true; render(); $('#lhead').scrollIntoView(); return; }
    const v = e.target.closest('a.verify');
    if (v) { navigator.clipboard?.writeText(v.dataset.lic).catch(() => {}); return; }
    const r = e.target.closest('a.report');
    if (r) { e.preventDefault(); openReport(groups[+r.dataset.g]); }
  }));
  $('#lhead').addEventListener('click', e => { if (e.target.id === 'back') { medOnly = false; render(); } });
  function openReport(g) {
    repTarget = g; $('#rep-out').hidden = true; $('#rep-text').value = '';
    $('#rep-who').textContent = `${title(g.a.n)} · ${g.a.t ? 'TX lic. ' + g.a.t[0] : ''}${g.a.m ? ' · CCN ' + g.a.m[0] : ''}`;
    $('#rep').showModal();
  }
  $('#rep-save').addEventListener('click', e => {
    e.preventDefault();
    const g = repTarget; if (!g) return;
    const item = { entity: 'agency', entity_id: g.a.i, reason: 'user_report', priority: 'normal', status: 'open', created_at: new Date().toISOString(),
      detail: { field: $('#rep-field').value, text: $('#rep-text').value.trim().slice(0, 600), name: g.a.n, license_no: g.a.t?.[0] || null, ccn: g.a.m?.[0] || null, searched_zip: cur?.zip } };
    const k = 'carecost_reports'; const all = JSON.parse(localStorage.getItem(k) || '[]'); all.push(item); localStorage.setItem(k, JSON.stringify(all));
    $('#rep-out').textContent = JSON.stringify(item, null, 1); $('#rep-out').hidden = false;
    $('#rep-save').textContent = 'Saved ✓';
    setTimeout(() => { $('#rep-save').textContent = 'Save report'; }, 1500);
    // TODO(worker): POST /api/report -> D1 review_queue
  });

  $('#f').addEventListener('submit', e => { e.preventDefault(); run($('#zip').value); });
  $('#sort').addEventListener('change', () => { medOnly = false; render(); });
  $('#rad').addEventListener('change', () => cur && run(cur.zip));
  $('#more').addEventListener('click', more);
  document.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.ct; ct.has(k) ? ct.delete(k) : ct.add(k); b.setAttribute('aria-pressed', ct.has(k)); render();
  }));
  $('#loc').addEventListener('click', () => {
    if (!navigator.geolocation) return msg('Location is not available in this browser.');
    msg('Finding your location…');
    navigator.geolocation.getCurrentPosition(p => {
      const { latitude: la, longitude: lo } = p.coords; let best = null, bd = 1e9;
      for (const [z, [y, x]] of Object.entries(ZIPS)) { const d = Rules.miles(la, lo, y, x); if (d < bd) { bd = d; best = z; } }
      if (bd > 60) return msg('You appear to be outside Texas. This version covers Texas only.');
      $('#zip').value = best; run(best);
    }, () => msg('Could not get your location. Please type a ZIP code.'), { timeout: 10000, maximumAge: 600000 });
  });
  init();
})();
