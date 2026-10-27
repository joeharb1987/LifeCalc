// deno test supabase/functions/lifecalc-mcp/hq_test.ts — checks hq.ts against budget/js/hq/core.js.
// deno-lint-ignore-file no-explicit-any
import { createRequire } from "node:module";
import { actions, calculate, countdown, hqApply, hqRead, hqTool, validate } from "./hq.ts";
const core = createRequire(import.meta.url)("../../../budget/js/hq/core.js");
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(m + "\n" + JSON.stringify(a) + "\n" + JSON.stringify(b)); };
const D = "2026-10-27";
const cafes = [
  { id: "a", name: "Bondi", status: "trading", sales: [{ start: "2026-01-01", amount: 20000, frequency: "weekly", gst: "included" }, { start: "2027-01-01", amount: 25000, frequency: "weekly", gst: "included" }],
    fees: [{ id: "f1", start: "2026-01-01", type: "percent", amount: 6, basis: "excluded", gst: "excluded" }, { start: "2026-12-01", type: "fixed", amount: 1500, frequency: "weekly", gst: "excluded" }],
    discounts: [{ start: "2026-10-01", end: "2026-11-30", type: "percent", amount: 50 }],
    costs: [{ name: "Base rent", amount: 8000, frequency: "monthly", gst: "excluded" }, { name: "Outgoings", amount: 500, frequency: "weekly", gst: "included" }, { name: "Mkt", amount: 100, frequency: "weekly", included: true }],
    lease: { start: "2022-01-01", expiry: "2027-01-01", reminder: "2026-11-15", options: [{ id: "o1", years: 5, opens: "2026-11-01", deadline: "2026-12-31", status: "pending" }] }, agreementExpiry: "2030-06-30" },
  { id: "b", name: "Manly", status: "opening", sales: [{ start: "2026-01-01", amount: 60000, frequency: "monthly", gst: "excluded" }], fees: [{ start: "2026-01-01", type: "fixed", amount: 1000, frequency: "monthly", gst: "none" }], costs: [{ name: "Rent", amount: null }] },
  { id: "c", name: "Old", status: "archived" },
];
Deno.test("calculate/actions/countdown/validate match core.js", () => {
  for (const c of cafes) for (const d of [D, "2026-12-15", "2027-02-01"]) {
    eq(calculate(c, d), core.calculate(c, d), "calc " + c.name + d);
    eq(actions(c, d), core.actions(c, d), "actions " + c.name + d);
    eq(validate(c), core.validate(c), "validate " + c.name);
  }
  for (const d of ["2026-10-27", "2026-10-28", "2027-10-27", "2029-01-05", "2026-01-01"]) eq(countdown(d, D), core.countdown(d, D), "countdown " + d);
  eq(validate({ name: "x", discounts: [{ start: "2026-01-01", end: "2026-02-01", amount: 1 }, { start: "2026-01-15", end: "2026-03-01", amount: 1 }] }), core.validate({ name: "x", discounts: [{ start: "2026-01-01", end: "2026-02-01", amount: 1 }, { start: "2026-01-15", end: "2026-03-01", amount: 1 }] }), "overlap");
});
Deno.test("read tools", () => {
  const o = JSON.parse(hqRead("get_hq_overview", { period: "weekly" }, { hqLocations: cafes }, D));
  eq(o.group_totals.locations_counted, 1, "only trading counted");
  eq(o.locations.length, 2, "archived hidden");
  const n = core.calculate(cafes[0], D);
  eq(o.group_totals.sales_incl_gst, Math.round(n.sales.gross / 52 * 100) / 100, "weekly sales");
  eq(JSON.parse(hqRead("get_hq_overview", { include_opening: true }, { hqLocations: cafes }, D)).group_totals.locations_counted, 2, "forecast");
  eq(JSON.parse(hqRead("get_hq_location", { location: "bon" }, { hqLocations: cafes }, D)).location.id, "a", "find");
  const dl = JSON.parse(hqRead("get_hq_deadlines", { within_days: 60 }, { hqLocations: cafes }, D));
  eq(dl.actions.map((x: { label: string }) => x.label), ["Option notice window opens", "Lease negotiation", "Discount ends", "Fee change"], "deadlines");
});
Deno.test("writes touch only hqLocations and validate", async () => {
  const S = { items: [{ id: "i" }], hqLocations: cafes };
  let saved: Record<string, unknown> | null = null;
  const store = { load: () => Promise.resolve({ data: structuredClone(S), version: 3 }), save: (d: Record<string, unknown>, v: number) => { saved = d; return Promise.resolve(v === 3); } };
  await hqTool("add_hq_entry", { location: "Bondi", collection: "costs", fields: { name: "Water", amount: 20, frequency: "weekly" } }, S, store);
  eq((saved as unknown as Record<string, any>).items, S.items, "items untouched");
  eq((saved as unknown as Record<string, any>).hqLocations[0].costs.length, 4, "added");
  eq(cafes[0].costs!.length, 3, "input not mutated");
  let threw = false; try { hqApply("add_hq_entry", { location: "a", collection: "fees", fields: { start: "2026-01-01", type: "fixed", amount: 1 } }, S); } catch { threw = true; }
  eq(threw, true, "duplicate fee date rejected");
  eq(hqApply("delete_hq_location", { location: "a", confirm: true }, S).list[0].status, "archived", "archive default");
  eq((await hqTool("update_hq_location", { location: "a", fields: { notes: "x" }, dry_run: true }, S)).startsWith("Dry run"), true, "dry run");
  eq(hqApply("update_hq_entry", { location: "a", collection: "options", entry_id: "o1", fields: { status: "sent" } }, S).list[0].lease.options[0].status, "sent", "option update");
});
