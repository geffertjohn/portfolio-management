// client/src/lib/supabase.ts
var import_supabase_js = require("@supabase/supabase-js");
var import_meta = {};
function env(key) {
  const viteEnv = import_meta.env;
  return viteEnv?.[key] ?? (typeof process !== "undefined" ? process.env?.[key] : void 0);
}
var supabaseUrl = env("VITE_SUPABASE_URL");
var supabaseAnonKey = env("VITE_SUPABASE_ANON_KEY");
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}
var supabase = (0, import_supabase_js.createClient)(supabaseUrl, supabaseAnonKey);

// client/src/lib/fmpClient.ts
var import_meta2 = {};
var FMP_STABLE = "https://financialmodelingprep.com/stable";
function apiKey() {
  const viteEnv = import_meta2.env;
  const key = viteEnv?.VITE_FMP_API_KEY ?? (typeof process !== "undefined" ? process.env?.VITE_FMP_API_KEY : void 0);
  if (!key) throw new Error("Missing VITE_FMP_API_KEY");
  return key;
}
function num(v) {
  if (v === null || v === void 0) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function str(v) {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
async function fmpFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FMP ${res.status}: ${url}`);
  return res.json();
}

// client/src/lib/holdingProfiles.ts
var STALE_DAYS = 30;
var CONCURRENCY = 4;
function isCusipLike(symbol) {
  return /^\d[0-9A-Z]{8}$/.test(symbol);
}
function isCashLike(symbol) {
  return /\s/.test(symbol) || /^M:/i.test(symbol) || /\bcash\b/i.test(symbol);
}
function isProfileable(symbol) {
  const s = symbol.trim();
  return s !== "" && !isCusipLike(s) && !isCashLike(s);
}
function fmpQuerySymbol(symbol) {
  const base = symbol.trim().replace(/:DL$/i, "");
  return base.replace(/\.([A-Z])$/i, "-$1");
}
async function fetchHoldingProfile(symbol) {
  const queried = fmpQuerySymbol(symbol);
  const empty = {
    symbol,
    company_name: null,
    sector: null,
    industry: null,
    country: null,
    market_cap: null,
    unresolved: true,
    queried_as: queried
  };
  try {
    const url = `${FMP_STABLE}/profile?symbol=${encodeURIComponent(queried)}&apikey=${apiKey()}`;
    const raw = await fmpFetch(url);
    const row = Array.isArray(raw) ? raw[0] : void 0;
    if (!row || str(row.sector) == null && str(row.companyName) == null) return empty;
    return {
      symbol,
      company_name: str(row.companyName),
      sector: str(row.sector),
      industry: str(row.industry),
      country: str(row.country),
      market_cap: num(row.marketCap),
      unresolved: false,
      queried_as: queried === symbol ? null : queried
    };
  } catch {
    return { ...empty, unresolved: false, queried_as: null, company_name: "__FETCH_FAILED__" };
  }
}
async function refreshHoldingProfiles() {
  const out = { asked: 0, resolved: 0, unresolved: 0, failed: 0, skipped: 0 };
  const { data: syms, error: symErr } = await supabase.from("fund_holdings").select("holding_symbol").not("holding_symbol", "is", null);
  if (symErr) throw symErr;
  const all = [...new Set((syms ?? []).map((r) => (r.holding_symbol ?? "").trim()).filter(Boolean))];
  const askable = all.filter(isProfileable);
  out.skipped = all.length - askable.length;
  const { data: known, error: knownErr } = await supabase.from("holding_profiles").select("symbol, refreshed_at, unresolved");
  if (knownErr) throw knownErr;
  const cutoff = Date.now() - STALE_DAYS * 864e5;
  const fresh = new Set(
    (known ?? []).filter((r) => r.unresolved || new Date(r.refreshed_at).getTime() > cutoff).map((r) => r.symbol)
  );
  const todo = askable.filter((s) => !fresh.has(s));
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(fetchHoldingProfile));
    const rows = results.filter((r) => r.company_name !== "__FETCH_FAILED__");
    out.failed += results.length - rows.length;
    out.asked += batch.length;
    for (const r of rows) {
      if (r.unresolved) out.unresolved++;
      else out.resolved++;
    }
    if (rows.length > 0) {
      const { error } = await supabase.from("holding_profiles").upsert(rows.map((r) => ({ ...r, refreshed_at: (/* @__PURE__ */ new Date()).toISOString() })), { onConflict: "symbol" });
      if (error) throw error;
    }
  }
  return out;
}

// scripts/refresh/fill-holding-profiles.ts
refreshHoldingProfiles().then((r) => {
  console.log(
    `asked ${r.asked} \xB7 resolved ${r.resolved} \xB7 not in FMP ${r.unresolved} \xB7 failed ${r.failed} \xB7 skipped ${r.skipped} (CUSIPs and cash)`
  );
}).catch((e) => {
  console.error(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
