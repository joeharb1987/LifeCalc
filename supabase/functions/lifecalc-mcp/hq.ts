// Ariel's HQ tools for the LifeCalc MCP bridge.
// Self-contained module so it can be ported onto the live bridge source (which has diverged from main).
// Calculations are a faithful port of budget/js/hq/core.js; keep the two in step.
// Writes only ever replace data.hqLocations, using an optimistic version check; nothing else in the household changes.

// deno-lint-ignore no-explicit-any
type Any = Record<string, any>;

// ---------- Port of budget/js/hq/core.js ----------
const rates: Record<string, number> = { weekly: 52, monthly: 12, yearly: 1 };
const present = (v: unknown) => v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v));
export const annual = (v: unknown, f?: string) => present(v) ? Number(v) * rates[f || "weekly"] : null;
export const convert = (v: number | null, view?: string) => v == null ? null : v / rates[view || "weekly"];
export function sydneyToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
export function tax(value: number | null, mode?: string) {
  if (value == null) return { net: null, gst: null, gross: null } as { net: number | null; gst: number | null; gross: number | null };
  const net = mode === "included" ? value / 1.1 : value;
  const gst = mode === "none" ? 0 : net * .1;
  return { net, gst, gross: net + gst } as { net: number | null; gst: number | null; gross: number | null };
}
export function current(list: Any[] | undefined, date: string) { return (list || []).filter((x) => !x.start || x.start <= date).sort((a, b) => (a.start || "").localeCompare(b.start || "")).at(-1); }
export function calculate(cafe: Any, date = sydneyToday()) {
  const sale = current(cafe.sales, date);
  const sales = sale ? tax(annual(sale.amount, sale.frequency), sale.gst) : tax(null);
  const fee = current(cafe.fees, date);
  let amount: number | null = null;
  if (fee) {
    const base = sales[fee.basis === "included" ? "gross" : "net"];
    amount = fee.type === "fixed" ? annual(fee.amount, fee.frequency) : (base == null ? null : base * Number(fee.amount) / 100);
  }
  const discount = (cafe.discounts || []).find((x: Any) => x.start <= date && date <= x.end);
  if (amount != null && discount) {
    if (discount.type === "percent") amount *= 1 - Number(discount.amount) / 100;
    else if (discount.type === "replace") amount = annual(discount.amount, discount.frequency);
    else amount -= annual(discount.amount, discount.frequency) as number;
    amount = Math.max(0, amount as number);
  }
  const fees = tax(amount, fee && fee.gst);
  const costs = (cafe.costs || []).map((c: Any) => ({ ...c, ...tax(c.included ? 0 : annual(c.amount, c.frequency), c.gst) }));
  const known = costs.some((c: Any) => c.net != null);
  const complete = costs.length > 0 && costs.every((c: Any) => c.net != null);
  const occupancy = known ? costs.reduce((n: number, c: Any) => n + (c.net || 0), 0) : null;
  const occupancyGST = known ? costs.reduce((n: number, c: Any) => n + (c.gst || 0), 0) : null;
  return { sales, fees, fee, sale, discount, costs, occupancy, occupancyGST, complete, ratio: complete && (sales.net as number) > 0 ? (occupancy as number) / (sales.net as number) * 100 : null };
}
const day = (iso: string) => Date.parse(iso + "T12:00:00Z");
export function countdown(iso: string, now = sydneyToday()) {
  if (!iso) return "Date not entered";
  const days = Math.round((day(iso) - day(now)) / 86400000);
  if (days < 0) return Math.abs(days) + (days === -1 ? " day overdue" : " days overdue");
  if (!days) return "Today";
  const a = new Date(day(now)), b = new Date(day(iso));
  let years = b.getUTCFullYear() - a.getUTCFullYear();
  const anniversary = new Date(a); anniversary.setUTCFullYear(a.getUTCFullYear() + years);
  if (anniversary > b) { years--; anniversary.setUTCFullYear(a.getUTCFullYear() + years); }
  const rest = Math.round((b.getTime() - anniversary.getTime()) / 86400000);
  return (years ? years + (years === 1 ? " year" : " years") + (rest ? ", " : "") : "") + (rest ? rest + (rest === 1 ? " day" : " days") : "");
}
export function actions(cafe: Any, now = sydneyToday()): Any[] {
  const l = cafe.lease || {}, out: Any[] = [];
  (l.options || []).forEach((o: Any) => {
    if (o.status !== "confirmed" && o.deadline) out.push({ label: o.status === "sent" ? "Confirm option receipt" : "Option deadline", date: o.deadline });
    if (o.status === "pending" && o.opens && o.opens > now) out.push({ label: "Option notice window opens", date: o.opens });
  });
  if (l.expiry) out.push({ label: "Lease expiry", date: l.expiry });
  if (l.reminder) out.push({ label: "Lease negotiation", date: l.reminder });
  if (l.review) out.push({ label: "Rent review", date: l.review });
  (cafe.fees || []).filter((f: Any) => f.start > now).forEach((f: Any) => out.push({ label: "Fee change", date: f.start }));
  (cafe.discounts || []).filter((d: Any) => d.end >= now).forEach((d: Any) => out.push({ label: "Discount ends", date: d.end }));
  if (cafe.agreementExpiry) out.push({ label: "Franchise agreement expiry", date: cafe.agreementExpiry });
  return out.sort((a, b) => a.date.localeCompare(b.date)).map((a) => ({ ...a, days: Math.round((day(a.date) - day(now)) / 86400000) }));
}
export function validate(c: Any) {
  if (!String(c.name || "").trim()) return "Enter a location name.";
  for (const group of ["sales", "fees"]) {
    const dates = new Set();
    for (const r of c[group] || []) {
      if (!r.start) return "Enter an effective date for every sales estimate and fee.";
      if (dates.has(r.start)) return "Use different effective dates for each " + (group === "fees" ? "fee" : "sales estimate") + ".";
      dates.add(r.start);
      if (!present(r.amount) || Number(r.amount) < 0) return "Enter a valid amount for every sales estimate and fee.";
      if (group === "fees" && r.type === "percent" && Number(r.amount) > 100) return "Fee percentages must be between 0 and 100.";
    }
  }
  const ds = [...(c.discounts || [])].sort((a: Any, b: Any) => String(a.start || "").localeCompare(String(b.start || "")));
  for (let i = 0; i < ds.length; i++) {
    const d = ds[i];
    if (!d.start || !d.end || d.end < d.start) return "Every discount needs a valid start and end date.";
    if (!present(d.amount) || Number(d.amount) < 0 || (d.type === "percent" && Number(d.amount) > 100)) return "Enter a valid discount amount.";
    if (i && d.start <= ds[i - 1].end) return "Discount dates overlap. Only one discount can apply at a time.";
  }
  for (const r of c.costs || []) if (present(r.amount) && Number(r.amount) < 0) return "Occupancy costs cannot be negative.";
  const l = c.lease || {};
  if (l.start && l.expiry && l.expiry < l.start) return "Lease expiry must follow commencement.";
  for (const o of l.options || []) {
    if (!present(o.years) || Number(o.years) <= 0) return "Enter the length of each lease option.";
    if (o.opens && o.deadline && o.opens > o.deadline) return "Option notice window must open before its deadline.";
  }
  return "";
}

// ---------- Presentation helpers ----------
const STATUS: Record<string, string> = { trading: "Trading", opening: "Opening soon", closed: "Temporarily closed", archived: "Archived" };
const r2 = (n: number | null | undefined) => n == null ? null : Math.round(n * 100) / 100;
const per = (n: number | null, view: string) => r2(convert(n, view));
const VIEWS = ["weekly", "monthly", "yearly"];
const locations = (S: Any): Any[] => Array.isArray(S.hqLocations) ? S.hqLocations : [];
function findLocation(S: Any, key: unknown) {
  const q = String(key || "").trim(), list = locations(S);
  if (!q) throw new Error("Give a location id or name (see get_hq_overview).");
  const hit = list.find((c) => c.id === q) || list.find((c) => String(c.name || "").toLowerCase() === q.toLowerCase());
  if (hit) return hit;
  const part = list.filter((c) => String(c.name || "").toLowerCase().includes(q.toLowerCase()));
  if (part.length === 1) return part[0];
  if (part.length > 1) throw new Error(`"${q}" matches several locations: ${part.map((c) => c.name).join(", ")}. Use the id.`);
  throw new Error(`No HQ location matches "${q}".`);
}
function figures(c: Any, view: string, date: string) {
  const n = calculate(c, date);
  return {
    period: view,
    sales_incl_gst: per(n.sales.gross, view), sales_excl_gst: per(n.sales.net, view),
    sales_estimate_effective: n.sale?.start || null,
    franchise_fee_excl_gst: per(n.fees.net, view), franchise_fee_gst: per(n.fees.gst, view),
    fee_basis: n.fee ? (n.fee.type === "fixed" ? `fixed ${n.fee.amount} ${n.fee.frequency || "weekly"}` : `${n.fee.amount}% of sales ${n.fee.basis === "included" ? "incl" : "excl"} GST`) : null,
    discount_applied: n.discount ? { type: n.discount.type, amount: n.discount.amount, start: n.discount.start, end: n.discount.end } : null,
    occupancy_cost_excl_gst: per(n.occupancy, view), occupancy_gst: per(n.occupancyGST, view),
    occupancy_costs_complete: n.complete,
    occupancy_ratio_pct: n.ratio == null ? null : Math.round(n.ratio * 10) / 10,
    cost_lines: n.costs.map((x: Any) => ({ name: x.name, amount: x.amount ?? null, frequency: x.frequency, included_in_rent: !!x.included || undefined, excl_gst: per(x.net, view) })),
  };
}
const counts = (c: Any) => c.status === "trading";

// ---------- Tool definitions ----------
const VIEW = { type: "string", enum: VIEWS, description: "Period for amounts (default weekly). Monthly/yearly are annualised current estimates, not history." };
const LOC = { type: "string", description: "Location id or name (partial match ok if unique)" };
const COLLECTIONS = ["sales", "fees", "discounts", "costs", "options", "documents"];
const ONLY = " Only when the user asks. Nothing else changes.";
export const HQ_TOOLS = [
  { name: "get_hq_overview", description: "Ariel's HQ café group: every location with status, current sales estimate (incl/excl GST), franchise fee, occupancy cost and occupancy ratio for the period, plus group totals (trading locations; opening ones optionally as forecast; closed/archived excluded) and actions due within 90 days. Same maths as the app.", inputSchema: { type: "object", properties: { period: VIEW, include_opening: { type: "boolean", description: "Include 'opening' locations in group totals as forecast" }, include_archived: { type: "boolean", description: "List archived locations too" } } } },
  { name: "get_hq_location", description: "One Ariel's HQ location in full (franchisee/contact details, sales estimates, fee schedule, discounts, cost lines, lease and options, documents, notes) plus calculated current figures and upcoming actions.", inputSchema: { type: "object", properties: { location: LOC, period: VIEW }, required: ["location"] } },
  { name: "get_hq_deadlines", description: "Upcoming Ariel's HQ actions (option deadlines and notice windows, lease expiry, negotiation reminders, rent reviews, scheduled fee changes, discount ends, franchise agreement expiry) with days remaining from today's Sydney date. Overdue items included.", inputSchema: { type: "object", properties: { within_days: { type: "number", description: "Only actions due within this many days (default 365). Overdue always shown." }, location: LOC, include_archived: { type: "boolean" } } } },
  { name: "add_hq_location", description: "Add a new Ariel's HQ location." + ONLY, inputSchema: { type: "object", properties: { fields: { type: "object", description: "name (required), status (trading|opening|closed|archived, default trading), franchisees, company, abn, phone, email, address, openingDate, agreementExpiry (YYYY-MM-DD), notes, lease {start, expiry, term, contact, reminder, review, reviewType, options[]}, sales[], fees[], discounts[], costs[], documents[]" }, dry_run: { type: "boolean", description: "Preview without saving" } }, required: ["fields"] } },
  { name: "update_hq_location", description: "Change top-level fields of an Ariel's HQ location (name, status, contact details, openingDate, agreementExpiry, notes, lease dates). Lease fields merge into the existing lease (options are kept; use the *_hq_entry tools for them). Use the entry tools for sales/fees/discounts/costs/documents." + ONLY, inputSchema: { type: "object", properties: { location: LOC, fields: { type: "object" }, dry_run: { type: "boolean" } }, required: ["location", "fields"] } },
  { name: "delete_hq_location", description: "Remove an Ariel's HQ location. Prefer archiving (default): it keeps the records and excludes them from totals. Permanent delete needs permanent:true and confirm:true." + ONLY, inputSchema: { type: "object", properties: { location: LOC, permanent: { type: "boolean" }, confirm: { type: "boolean", description: "Must be true" }, dry_run: { type: "boolean" } }, required: ["location", "confirm"] } },
  { name: "add_hq_entry", description: "Add an entry to a location's list. sales: {start, amount, frequency weekly|monthly|yearly, gst included|excluded|none}; fees: {start, type fixed|percent, amount, frequency, basis included|excluded, gst}; discounts: {start, end, type percent|amount|replace, amount, frequency}; costs: {name, amount, frequency, gst, included}; options (lease options): {years, opens, deadline, status pending|sent|confirmed}; documents: {name, url}." + ONLY, inputSchema: { type: "object", properties: { location: LOC, collection: { type: "string", enum: COLLECTIONS }, fields: { type: "object" }, dry_run: { type: "boolean" } }, required: ["location", "collection", "fields"] } },
  { name: "update_hq_entry", description: "Change one entry in a location's sales/fees/discounts/costs/options/documents list, by its id (see get_hq_location)." + ONLY, inputSchema: { type: "object", properties: { location: LOC, collection: { type: "string", enum: COLLECTIONS }, entry_id: { type: "string" }, fields: { type: "object" }, dry_run: { type: "boolean" } }, required: ["location", "collection", "entry_id", "fields"] } },
  { name: "delete_hq_entry", description: "Remove one entry from a location's sales/fees/discounts/costs/options/documents list. Needs confirm:true." + ONLY, inputSchema: { type: "object", properties: { location: LOC, collection: { type: "string", enum: COLLECTIONS }, entry_id: { type: "string" }, confirm: { type: "boolean" }, dry_run: { type: "boolean" } }, required: ["location", "collection", "entry_id", "confirm"] } },
];
export const HQ_TOOL_NAMES = HQ_TOOLS.map((t) => t.name);
export const HQ_WRITE_TOOLS = HQ_TOOL_NAMES.filter((n) => !n.startsWith("get_"));

// ---------- Read tools (pure) ----------
export function hqRead(name: string, a: Any, S: Any, date = sydneyToday()): string {
  const view = VIEWS.includes(a.period) ? a.period : "weekly";
  if (name === "get_hq_overview") {
    const all = locations(S);
    if (!all.length) return "No Ariel's HQ locations recorded yet.";
    const inTotals = (c: Any) => counts(c) || (a.include_opening && c.status === "opening");
    const rows = all.filter((c) => a.include_archived || c.status !== "archived").map((c) => ({ id: c.id, name: c.name, status: STATUS[c.status] || c.status, in_group_totals: !!inTotals(c), ...figures(c, view, date), cost_lines: undefined }));
    const list = all.filter(inTotals).map((c) => calculate(c, date));
    const sum = (f: (n: Any) => number | null) => per(list.reduce((t, n) => t + (f(n) || 0), 0), view);
    const salesNet = list.reduce((t, n) => t + (n.sales.net || 0), 0), occ = list.reduce((t, n) => t + (n.occupancy || 0), 0);
    const due = all.filter((c) => c.status !== "archived").flatMap((c) => actions(c, date).filter((x) => x.days <= 90).map((x) => ({ location: c.name, ...x })));
    return JSON.stringify({ as_of_sydney: date, period: view, note: "Sales incl GST; HQ revenue (fees) excl GST; occupancy ratio = costs excl GST / sales excl GST.", locations: rows,
      group_totals: { locations_counted: list.length, includes_opening_forecast: !!a.include_opening, sales_incl_gst: sum((n) => n.sales.gross), sales_excl_gst: sum((n) => n.sales.net), franchise_fees_excl_gst: sum((n) => n.fees.net), franchise_fee_gst: sum((n) => n.fees.gst), occupancy_cost_excl_gst: sum((n) => n.occupancy), occupancy_ratio_pct: salesNet > 0 ? Math.round(occ / salesNet * 1000) / 10 : null },
      actions_within_90_days: due }, null, 1);
  }
  if (name === "get_hq_location") {
    const c = findLocation(S, a.location);
    return JSON.stringify({ as_of_sydney: date, location: c, status_label: STATUS[c.status] || c.status, calculated: figures(c, view, date),
      lease_countdown: c.lease?.expiry ? countdown(c.lease.expiry, date) : null,
      upcoming_actions: actions(c, date).map((x) => ({ ...x, countdown: countdown(x.date, date) })) }, null, 1);
  }
  if (name === "get_hq_deadlines") {
    const within = Number(a.within_days) > 0 ? Number(a.within_days) : 365;
    const list = a.location ? [findLocation(S, a.location)] : locations(S).filter((c) => a.include_archived || c.status !== "archived");
    const rows: Any[] = list.flatMap((c) => actions(c, date).map((x) => ({ location: c.name, location_id: c.id, ...x, countdown: countdown(x.date, date), overdue: x.days < 0 || undefined })))
      .filter((x: Any) => x.days <= within).sort((x: Any, y: Any) => x.date.localeCompare(y.date));
    return rows.length ? JSON.stringify({ as_of_sydney: date, within_days: within, actions: rows }, null, 1) : `No HQ actions due within ${within} days (as of ${date}, Sydney).`;
  }
  throw new Error("Unknown tool: " + name);
}

// ---------- Write tools ----------
const TOP_FIELDS = ["name", "status", "franchisees", "company", "abn", "phone", "email", "address", "openingDate", "agreementExpiry", "notes", "contacts"];
const LEASE_FIELDS = ["start", "expiry", "term", "contact", "reminder", "review", "reviewType"];
const ENTRY_FIELDS: Record<string, string[]> = {
  sales: ["start", "amount", "frequency", "gst", "notes"],
  fees: ["start", "type", "amount", "frequency", "basis", "gst", "notes"],
  discounts: ["start", "end", "type", "amount", "frequency", "notes"],
  costs: ["name", "amount", "frequency", "gst", "included", "notes"],
  options: ["years", "opens", "deadline", "status", "notes"],
  documents: ["name", "url", "fileId", "notes"],
};
const DATE_KEYS = ["start", "end", "expiry", "reminder", "review", "opens", "deadline", "openingDate", "agreementExpiry"];
function clean(fields: Any, allowed: string[]) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw new Error("Give fields as an object.");
  const out: Any = {}, bad: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (!allowed.includes(k)) { bad.push(k); continue; }
    if (DATE_KEYS.includes(k) && v !== "" && v != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new Error(`${k} must be YYYY-MM-DD.`);
    out[k] = v;
  }
  if (bad.length) throw new Error(`Unknown field(s): ${bad.join(", ")}. Allowed: ${allowed.join(", ")}.`);
  return out;
}
const uid = () => crypto.randomUUID();
const listOf = (c: Any, coll: string): Any[] => coll === "options" ? ((c.lease ||= {}).options ||= []) : (c[coll] ||= []);
function checkColl(coll: unknown) { if (!COLLECTIONS.includes(String(coll))) throw new Error(`collection must be one of ${COLLECTIONS.join(", ")}.`); return String(coll); }

/** Applies a write to a deep copy of hqLocations. Returns the new list and a message. Pure: no I/O. */
export function hqApply(name: string, a: Any, S: Any): { list: Any[]; message: string } {
  const list: Any[] = structuredClone(locations(S));
  const pick = () => { const c = findLocation({ hqLocations: list }, a.location); return c; };
  let c: Any, msg: string;
  if (name === "add_hq_location") {
    const f = a.fields || {};
    const base = clean(Object.fromEntries(Object.entries(f).filter(([k]) => TOP_FIELDS.includes(k))), TOP_FIELDS);
    const extra = Object.keys(f).filter((k) => !TOP_FIELDS.includes(k) && !["lease", ...COLLECTIONS.filter((x) => x !== "options")].includes(k));
    if (extra.length) throw new Error(`Unknown field(s): ${extra.join(", ")}.`);
    if (base.status && !STATUS[base.status]) throw new Error("status must be trading, opening, closed or archived.");
    c = { id: uid(), status: "trading", ...base, sales: [], fees: [], discounts: [], costs: [], documents: [], lease: { options: [] } };
    if (f.lease) { Object.assign(c.lease, clean(Object.fromEntries(Object.entries(f.lease).filter(([k]) => k !== "options")), LEASE_FIELDS)); for (const o of f.lease.options || []) c.lease.options.push({ id: uid(), ...clean(o, ENTRY_FIELDS.options) }); }
    for (const k of ["sales", "fees", "discounts", "costs", "documents"]) for (const e of f[k] || []) c[k].push({ id: uid(), ...clean(e, ENTRY_FIELDS[k]) });
    list.push(c); msg = `Added HQ location "${c.name}" (id ${c.id}).`;
  } else if (name === "update_hq_location") {
    c = pick();
    const f = { ...(a.fields || {}) }, lease = f.lease; delete f.lease;
    const ch = clean(f, TOP_FIELDS);
    if (ch.status && !STATUS[ch.status]) throw new Error("status must be trading, opening, closed or archived.");
    Object.assign(c, ch);
    if (lease) { if ("options" in lease) throw new Error("Change lease options with add/update/delete_hq_entry (collection options)."); c.lease = { ...(c.lease || {}), ...clean(lease, LEASE_FIELDS) }; }
    msg = `Updated HQ location "${c.name}": ${[...Object.keys(ch), ...(lease ? Object.keys(lease).map((k) => "lease." + k) : [])].join(", ")}.`;
  } else if (name === "delete_hq_location") {
    if (a.confirm !== true) throw new Error("Set confirm:true to remove a location.");
    c = pick();
    if (a.permanent === true) { list.splice(list.indexOf(c), 1); msg = `Permanently deleted HQ location "${c.name}".`; return { list, message: msg }; }
    c.status = "archived"; msg = `Archived HQ location "${c.name}" (records kept, excluded from totals; restore with update_hq_location status trading).`;
  } else if (name === "add_hq_entry") {
    const coll = checkColl(a.collection); c = pick();
    const e = { id: uid(), ...clean(a.fields, ENTRY_FIELDS[coll]) };
    listOf(c, coll).push(e); msg = `Added ${coll} entry ${e.id} to "${c.name}".`;
  } else if (name === "update_hq_entry" || name === "delete_hq_entry") {
    const coll = checkColl(a.collection); c = pick();
    const arr = listOf(c, coll), i = arr.findIndex((x) => x.id === a.entry_id);
    if (i < 0) throw new Error(`No ${coll} entry with id "${a.entry_id}" at "${c.name}". Entries without ids can't be targeted; see get_hq_location.`);
    if (name === "delete_hq_entry") { if (a.confirm !== true) throw new Error("Set confirm:true to remove an entry."); arr.splice(i, 1); msg = `Removed ${coll} entry ${a.entry_id} from "${c.name}".`; }
    else { Object.assign(arr[i], clean(a.fields, ENTRY_FIELDS[coll])); msg = `Updated ${coll} entry ${a.entry_id} at "${c.name}".`; }
  } else throw new Error("Unknown tool: " + name);
  const err = validate(c);
  if (err) throw new Error(`Not saved: ${err}`);
  return { list, message: msg };
}

export interface HqStore {
  /** Re-reads {data, version} for the household. */
  load(): Promise<{ data: Any; version: number }>;
  /** Saves data if version still matches; returns false on conflict. */
  save(data: Any, version: number): Promise<boolean>;
}

/** Runs any HQ tool. Writes re-read the household, change only data.hqLocations and save with a version check (retries once on conflict). */
export async function hqTool(name: string, a: Any, S: Any, store?: HqStore): Promise<string> {
  if (!HQ_WRITE_TOOLS.includes(name)) return hqRead(name, a, S);
  if (a.dry_run) { const r = hqApply(name, a, S); return "Dry run, nothing saved. " + r.message; }
  if (!store) throw new Error("HQ writes are not available on this connection.");
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, version } = await store.load();
    const r = hqApply(name, a, data || {});
    if (await store.save({ ...(data || {}), hqLocations: r.list }, version)) return r.message + " Nothing else changed.";
  }
  throw new Error("The household changed while saving. Nothing was saved; try again.");
}

/** Default store using PostgREST with an optimistic version check on households.version. */
export function restStore(sbUrl: string, headers: Record<string, string>, householdId: string): HqStore {
  const base = `${sbUrl}/rest/v1/households?id=eq.${householdId}`;
  return {
    async load() {
      const r = await fetch(`${base}&select=data,version`, { headers });
      if (!r.ok) throw new Error(`Couldn't load the household (${r.status}).`);
      const row = (await r.json())[0];
      if (!row) throw new Error("Household not found.");
      return { data: row.data || {}, version: Number(row.version) || 0 };
    },
    async save(data, version) {
      const r = await fetch(`${base}&version=eq.${version}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ data, version: version + 1, updated_at: new Date().toISOString() }) });
      if (!r.ok) throw new Error(`Couldn't save (${r.status}).`);
      return (await r.json()).length === 1;
    },
  };
}
