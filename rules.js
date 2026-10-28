// Shared rules (mirror site/build/build.py). Rate-spread logic is dormant until per-agency rates exist.
const Rules = {
  RADIUS_MI: 25,
  miles(a, b, c, d) { const r = 3958.8, t = Math.PI / 180, h = Math.sin((c - a) * t / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin((d - b) * t / 2) ** 2; return 2 * r * Math.asin(Math.sqrt(h)); },
  confLabel(s) { return s >= 80 ? 'High' : s >= 50 ? 'Medium' : 'Low'; },
  // rates: [{agency_id, care_type, low_usd, high_usd, rate_kind}] for ONE zip. Returns per-care-type flags.
  rateSpread(rates) {
    const g = {}; for (const r of rates || []) if (r.rate_kind === 'agency_published' || r.rate_kind === 'agency_quoted') (g[r.care_type] ||= []).push(r);
    const out = [];
    for (const [ct, rs] of Object.entries(g)) {
      if (new Set(rs.map(r => r.agency_id)).size < 3) continue;
      const lo = Math.min(...rs.map(r => r.low_usd)), hi = Math.max(...rs.map(r => r.high_usd));
      if (lo > 0 && (hi / lo >= 1.5 || hi - lo >= 15)) out.push({ care_type: ct, min: lo, max: hi, n: rs.length });
    }
    return out;
  },
};
