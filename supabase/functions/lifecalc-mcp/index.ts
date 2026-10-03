// LifeCalc connector for Claude / ChatGPT (Model Context Protocol, streamable HTTP, read-only).
// URL: https://<project>.supabase.co/functions/v1/lifecalc-mcp/<ai_token>
// The token (Settings → Connect AI in the app) picks the household; without a valid token nothing is returned.

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, mcp-session-id, mcp-protocol-version, authorization",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// ---------- Budget maths (same rules as the app) ----------
type Any = Record<string, any>;
const PER_YEAR: Record<string, number> = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, term: 4, yearly: 1, oneoff: 1 };
const FREQ_LABEL: Record<string, string> = { weekly: "weekly", fortnightly: "fortnightly", monthly: "monthly", quarterly: "quarterly", term: "per term", yearly: "yearly", oneoff: "one-off" };
const SOURCE: Record<string, string> = { statement: "Statement", statement_avg: "Statement avg", cash: "Manual cash", manual: "Manual", imported: "Imported", calculated: "Calculated", assumption: "Assumption" };
const EXCLUDED_TYPES: Record<string, boolean> = { transfer: true, investment: true };

function annual(amount: unknown, freq: string, weeks?: unknown) {
  const a = Number(amount) || 0;
  if (freq === "everyX") { const x = Number(weeks) || 0; return x > 0 ? a * 52 / x : 0; }
  return a * (PER_YEAR[freq] || 0);
}
function per(amount: unknown, freq: string, weeks: unknown, view: string) {
  const y = annual(amount, freq, weeks);
  return view === "weekly" ? y / 52 : view === "monthly" ? y / 12 : y;
}
const today = () => new Date().toISOString().slice(0, 10);
const money = (n: number, dp = 0) => (n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const SHORT: Record<string, string> = { weekly: "/wk", monthly: "/mo", yearly: "/yr" };

function catOf(S: Any, id: string) { return (S.categories || []).find((c: Any) => c.id === id); }
function isOneOff(S: Any, it: Any) { const c = catOf(S, it.categoryId); return it.frequency === "oneoff" || it.kind === "oneoff" || (c && c.type === "oneoff"); }
function excluded(S: Any, it: Any) {
  const d = today();
  if (!it.active) return "inactive";
  if (it.startDate && it.startDate > d) return "not started";
  if (it.endDate && it.endDate < d) return "ended";
  if (!(S.settings || {}).includeCash && it.source === "cash") return "cash hidden";
  if (it.direction === "out" && isOneOff(S, it)) return "one-off";
  return "";
}
function byOrder<T extends Any>(list: T[]) {
  return list.map((x, i) => ({ x, i })).sort((a, b) => (a.x.order ?? 1e6 + a.i) - (b.x.order ?? 1e6 + b.i)).map((o) => o.x);
}
function summary(S: Any, view: string) {
  let income = 0, expenses = 0; const byCat: Record<string, number> = {};
  for (const it of S.items || []) {
    if (excluded(S, it)) continue;
    const v = per(it.amount, it.frequency, it.customWeeks, view);
    if (it.direction === "in") income += v; else { expenses += v; byCat[it.categoryId] = (byCat[it.categoryId] || 0) + v; }
  }
  return { income, expenses, left: income - expenses, byCat };
}
function netWorth(S: Any) {
  let assets = 0, debts = 0; const missing: string[] = [];
  for (const a of S.assets || []) assets += Number(a.value) || 0;
  for (const d of S.debts || []) {
    if (d.active === false) continue;
    if (d.balance == null || d.balance === "") missing.push(d.name); else debts += Number(d.balance) || 0;
  }
  return { assets, debts, net: assets - debts, missing };
}
function txExcluded(S: Any, t: Any) {
  if (t.internal_transfer || t.cash_deposit) return true;
  const c = catOf(S, t.category_id);
  if (c && EXCLUDED_TYPES[c.type]) return true;
  if (!(S.settings || {}).includeCash && t.source === "cash") return true;
  return false;
}

function summaryText(S: Any, view: string, name: string) {
  const s = summary(S, view), nw = netWorth(S), p = SHORT[view], out: string[] = [];
  const line = (it: Any) => {
    const bits = [money(Number(it.amount) || 0, 2) + " " + (it.frequency === "everyX" ? `every ${it.customWeeks} wks` : FREQ_LABEL[it.frequency] || it.frequency)];
    if (it.frequency !== "oneoff") bits.push("= " + money(per(it.amount, it.frequency, it.customWeeks, view)) + p);
    bits.push(SOURCE[it.source] || it.source);
    if (it.endDate) bits.push("ends " + it.endDate);
    if (it.review) bits.push("needs review");
    if (it.notes) bits.push("note: " + it.notes);
    return "- " + it.name + ": " + bits.join(" · ");
  };
  out.push(`# ${name} budget (live from LifeCalc, ${today()})`, `Amounts in AUD, ${view} unless noted.`, "");
  out.push("## Totals", `- Income: ${money(s.income)}${p}`, `- Expenses: ${money(s.expenses)}${p}`, `- Left over: ${money(s.left)}${p}`, "");
  out.push("## Income");
  byOrder((S.items || []).filter((i: Any) => i.direction === "in" && !excluded(S, i))).forEach((i) => out.push(line(i)));
  out.push("", "## Expenses by category");
  for (const c of [...(S.categories || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    if (["income", "transfer", "investment", "oneoff"].includes(c.type)) continue;
    const items = byOrder((S.items || []).filter((i: Any) => i.direction === "out" && i.categoryId === c.id && !excluded(S, i)));
    if (!items.length) continue;
    const v = s.byCat[c.id] || 0;
    out.push(`### ${c.name} — ${money(v)}${p}${s.expenses ? ` (${Math.round(v / s.expenses * 100)}%)` : ""}`);
    items.forEach((i) => out.push(line(i)));
  }
  const ones = (S.items || []).filter((i: Any) => i.direction === "out" && i.active && isOneOff(S, i));
  if (ones.length) { out.push("", "## One-off costs (not in the totals)"); ones.forEach((i: Any) => out.push(line(i))); }
  const debts = byOrder((S.debts || []).filter((d: Any) => d.active !== false));
  if (debts.length) {
    out.push("", "## Debts");
    for (const d of debts) {
      const bits = [d.balance == null || d.balance === "" ? "balance not set" : "balance " + money(Number(d.balance), 2)];
      if (d.rate != null && d.rate !== "") bits.push(d.rate + "% p.a.");
      if (Number(d.payment)) bits.push(`repaying ${money(Number(d.payment), 2)} ${d.frequency || "monthly"}`);
      if (d.limit) bits.push("limit " + money(Number(d.limit)));
      if (d.endDate) bits.push("ends " + d.endDate);
      if (d.notes) bits.push("note: " + d.notes);
      out.push(`- ${d.name}: ${bits.join(" · ")}`);
    }
  }
  out.push("", "## Assets");
  const cats = byOrder(S.assetCats || []);
  for (const g of cats) {
    const list = (S.assets || []).filter((a: Any) => a.type === g.id);
    if (!list.length) continue;
    out.push(`- ${g.name}: ${money(list.reduce((t: number, a: Any) => t + (Number(a.value) || 0), 0))} (${list.map((a: Any) => `${a.name} ${money(Number(a.value) || 0)}`).join(", ")})`);
  }
  out.push("", "## Net worth", `- Assets ${money(nw.assets)} − debts ${money(nw.debts)} = ${money(nw.net)}` +
    (nw.missing.length ? ` (no balance yet for: ${nw.missing.join(", ")})` : ""));
  out.push("", `Bank transactions available: ${(S.transactions || []).length}. Use get_transactions or get_monthly_spending for actual spending.`);
  return out.join("\n");
}

// ---------- Tools ----------
const VIEW = { type: "string", enum: ["weekly", "monthly", "yearly"], description: "Period for amounts (default weekly)" };
const TOOLS = [
  { name: "get_budget_summary", description: "The household budget as readable text: totals (income, expenses, left over), every income and expense line by category with notes, one-offs, debts, assets and net worth. Start here.", inputSchema: { type: "object", properties: { period: VIEW } } },
  { name: "get_items", description: "Budget lines as JSON with amount, frequency, per-period value, category, source, dates and notes.", inputSchema: { type: "object", properties: { direction: { type: "string", enum: ["in", "out"], description: "in = income, out = expenses" }, category: { type: "string", description: "Category name (partial match)" }, include_inactive: { type: "boolean" }, period: VIEW } } },
  { name: "get_debts", description: "All debts as JSON: balance, interest rate, repayment, frequency, limit, end date, notes, active.", inputSchema: { type: "object", properties: {} } },
  { name: "get_assets", description: "All assets as JSON with category, value and date last updated, plus totals and net worth.", inputSchema: { type: "object", properties: {} } },
  { name: "get_transactions", description: "Imported bank transactions (negative = money out). Filter by date range, category name or text search.", inputSchema: { type: "object", properties: { from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD" }, category: { type: "string" }, search: { type: "string" }, limit: { type: "number", description: "Default 200, max 2000" } } } },
  { name: "get_monthly_spending", description: "Actual bank spending by category for each month (excludes internal transfers, cash deposits and investments), plus money in.", inputSchema: { type: "object", properties: { months: { type: "number", description: "How many recent months (default 6)" } } } },
];

function callTool(name: string, a: Any, S: Any, hname: string): string {
  const view = ["weekly", "monthly", "yearly"].includes(a.period) ? a.period : "weekly";
  const catName = (id: string) => (catOf(S, id) || {}).name || "Uncategorised";
  if (name === "get_budget_summary") return summaryText(S, view, hname);
  if (name === "get_items") {
    const q = String(a.category || "").toLowerCase();
    const rows = byOrder(S.items || []).filter((i: Any) =>
      (!a.direction || i.direction === a.direction) && (a.include_inactive || !excluded(S, i) || excluded(S, i) === "one-off") &&
      (!q || catName(i.categoryId).toLowerCase().includes(q)))
      .map((i: Any) => ({ name: i.name, direction: i.direction, category: catName(i.categoryId), amount: Number(i.amount) || 0, frequency: i.frequency, every_weeks: i.customWeeks || undefined,
        [view]: Math.round(per(i.amount, i.frequency, i.customWeeks, view) * 100) / 100, source: SOURCE[i.source] || i.source, counted: !excluded(S, i), not_counted_reason: excluded(S, i) || undefined,
        start: i.startDate || undefined, end: i.endDate || undefined, needs_review: i.review || undefined, notes: i.notes || undefined }));
    return JSON.stringify(rows, null, 1);
  }
  if (name === "get_debts") return JSON.stringify(byOrder(S.debts || []).map((d: Any) => ({ name: d.name, balance: d.balance ?? null, rate_pct: d.rate ?? null, repayment: d.payment ?? null, frequency: d.frequency, limit: d.limit || null, end: d.endDate || null, active: d.active !== false, notes: d.notes || undefined })), null, 1);
  if (name === "get_assets") {
    const cats = Object.fromEntries((S.assetCats || []).map((c: Any) => [c.id, c.name]));
    return JSON.stringify({ assets: (S.assets || []).map((x: Any) => ({ name: x.name, category: cats[x.type] || x.type, value: Number(x.value) || 0, updated: x.updated || null, notes: x.notes || undefined })), totals: Object.fromEntries(Object.entries(netWorth(S)).map(([k, v]) => [k, typeof v === "number" ? Math.round(v * 100) / 100 : v])) }, null, 1);
  }
  if (name === "get_transactions") {
    const q = String(a.search || "").toLowerCase(), c = String(a.category || "").toLowerCase();
    const lim = Math.min(2000, Number(a.limit) || 200);
    const rows = (S.transactions || []).filter((t: Any) => (!a.from || t.date >= a.from) && (!a.to || t.date <= a.to) &&
      (!c || catName(t.category_id).toLowerCase().includes(c)) &&
      (!q || `${t.merchant || ""} ${t.description_raw || ""}`.toLowerCase().includes(q)))
      .sort((x: Any, y: Any) => (x.date < y.date ? 1 : -1));
    return JSON.stringify({ total_matching: rows.length, shown: Math.min(lim, rows.length), transactions: rows.slice(0, lim).map((t: Any) => ({ date: t.date, amount: t.amount, merchant: t.merchant || t.description_raw, category: catName(t.category_id), excluded_from_spending: txExcluded(S, t) || undefined, one_off: t.one_off || undefined })) }, null, 1);
  }
  if (name === "get_monthly_spending") {
    const months: Record<string, Any> = {};
    for (const t of S.transactions || []) {
      if (txExcluded(S, t)) continue;
      const m = String(t.date).slice(0, 7), b = months[m] ||= { money_in: 0, money_out: 0, by_category: {} as Record<string, number> };
      if (t.amount > 0) b.money_in += t.amount; else { b.money_out -= t.amount; const k = catName(t.category_id); b.by_category[k] = (b.by_category[k] || 0) - t.amount; }
    }
    const keys = Object.keys(months).sort().slice(-(Number(a.months) || 6));
    const round = (o: Any) => { for (const k in o) o[k] = typeof o[k] === "number" ? Math.round(o[k] * 100) / 100 : round(o[k]); return o; };
    return keys.length ? JSON.stringify(Object.fromEntries(keys.map((k) => [k, round(months[k])])), null, 1) : "No bank transactions imported yet.";
  }
  throw new Error("Unknown tool: " + name);
}

// ---------- MCP over HTTP ----------
async function loadHousehold(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const r = await fetch(`${SB_URL}/rest/v1/households?ai_token=eq.${token}&select=name,data`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}
function reply(id: unknown, result: unknown) { return { jsonrpc: "2.0", id, result }; }
function fail(id: unknown, code: number, message: string) { return { jsonrpc: "2.0", id, error: { code, message } }; }

async function handle(msg: Any, token: string) {
  const { id, method, params = {} } = msg;
  if (method === "initialize") {
    return reply(id, {
      protocolVersion: params.protocolVersion || "2025-03-26",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "lifecalc", title: "LifeCalc Budget", version: "1.0.0" },
      instructions: "Read-only access to the user's household budget in LifeCalc (amounts in AUD). Call get_budget_summary first, then the other tools for detail. Give practical, specific advice using the actual figures.",
    });
  }
  if (method === "ping") return reply(id, {});
  if (method === "tools/list") return reply(id, { tools: TOOLS });
  if (method === "tools/call") {
    const h = await loadHousehold(token);
    if (!h) return reply(id, { content: [{ type: "text", text: "This LifeCalc link is no longer valid. Create a new one in LifeCalc → Settings → Connect AI." }], isError: true });
    try {
      return reply(id, { content: [{ type: "text", text: callTool(params.name, params.arguments || {}, h.data || {}, h.name || "Household") }] });
    } catch (e) {
      return reply(id, { content: [{ type: "text", text: String((e as Error).message || e) }], isError: true });
    }
  }
  if (method === "resources/list") return reply(id, { resources: [] });
  if (method === "prompts/list") return reply(id, { prompts: [] });
  return fail(id, -32601, "Method not found: " + method);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const token = new URL(req.url).pathname.split("/").filter(Boolean).pop() || "";
  if (req.method === "GET") return new Response("LifeCalc connector: add this URL to Claude as a custom connector.", { status: 405, headers: { ...CORS, Allow: "POST" } });
  if (req.method !== "POST") return new Response(null, { status: 405, headers: CORS });
  // Unknown tokens get nothing (not even the tool list), so the URL can't be probed.
  if (!(await loadHousehold(token))) return new Response(JSON.stringify(fail(null, -32001, "Invalid or revoked LifeCalc link")), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
  let body: unknown;
  try { body = await req.json(); } catch { return new Response(JSON.stringify(fail(null, -32700, "Parse error")), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }); }
  const msgs = Array.isArray(body) ? body : [body];
  const out = [];
  for (const m of msgs as Any[]) { if (m && m.id !== undefined && m.method) out.push(await handle(m, token)); }
  if (!out.length) return new Response(null, { status: 202, headers: CORS });   // notifications only
  return new Response(JSON.stringify(Array.isArray(body) ? out : out[0]), { headers: { ...CORS, "Content-Type": "application/json" } });
});
