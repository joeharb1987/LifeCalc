/* Ariel's HQ: estimates are annualised with the same 52-week / 12-month convention as Budget. */
(function (root) {
  'use strict';
  const rates = {weekly:52, monthly:12, yearly:1};
  const present = v => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));
  const annual = (v, f) => present(v) ? Number(v) * rates[f || 'weekly'] : null;
  const convert = (v, view) => v == null ? null : v / rates[view || 'weekly'];
  function today() { return new Intl.DateTimeFormat('en-CA', {timeZone:'Australia/Sydney', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date()); }
  function tax(value, mode) {
    if (value == null) return {net:null, gst:null, gross:null};
    const net = mode === 'included' ? value / 1.1 : value;
    const gst = mode === 'none' ? 0 : net * .1;
    return {net, gst, gross:net + gst};
  }
  function current(list, date) { return (list || []).filter(x => !x.start || x.start <= date).sort((a,b) => (a.start || '').localeCompare(b.start || '')).at(-1); }
  function calculate(cafe, date = today()) {
    const sale = current(cafe.sales, date);
    const sales = sale ? tax(annual(sale.amount, sale.frequency), sale.gst) : tax(null);
    const fee = current(cafe.fees, date);
    let amount = null;
    if (fee) amount = fee.type === 'fixed' ? annual(fee.amount, fee.frequency) : (sales[fee.basis === 'included' ? 'gross' : 'net'] == null ? null : sales[fee.basis === 'included' ? 'gross' : 'net'] * Number(fee.amount) / 100);
    const discount = (cafe.discounts || []).find(x => x.start <= date && date <= x.end);
    if (amount != null && discount) {
      if (discount.type === 'percent') amount *= 1 - Number(discount.amount) / 100;
      else if (discount.type === 'replace') amount = annual(discount.amount, discount.frequency);
      else amount -= annual(discount.amount, discount.frequency);
      amount = Math.max(0, amount);
    }
    const fees = tax(amount, fee && fee.gst);
    const costs = (cafe.costs || []).map(c => ({...c, ...tax(c.included ? 0 : annual(c.amount,c.frequency),c.gst)}));
    const known = costs.some(c => c.net != null);
    const complete = costs.length > 0 && costs.every(c => c.net != null);
    const occupancy = known ? costs.reduce((n,c) => n + (c.net || 0),0) : null;
    const occupancyGST = known ? costs.reduce((n,c) => n + (c.gst || 0),0) : null;
    return {sales, fees, fee, sale, discount, costs, occupancy, occupancyGST, complete, ratio:complete && sales.net > 0 ? occupancy / sales.net * 100 : null};
  }
  const day = iso => Date.parse(iso + 'T12:00:00Z');
  function countdown(iso, now = today()) {
    if (!iso) return 'Date not entered';
    const days = Math.round((day(iso) - day(now)) / 86400000);
    if (days < 0) return Math.abs(days) + (days === -1 ? ' day overdue' : ' days overdue');
    if (!days) return 'Today';
    const a = new Date(day(now)), b = new Date(day(iso));
    let years = b.getUTCFullYear() - a.getUTCFullYear();
    const anniversary = new Date(a); anniversary.setUTCFullYear(a.getUTCFullYear() + years);
    if (anniversary > b) { years--; anniversary.setUTCFullYear(a.getUTCFullYear() + years); }
    const rest = Math.round((b - anniversary) / 86400000);
    return (years ? years + (years === 1 ? ' year' : ' years') + (rest ? ', ' : '') : '') + (rest ? rest + (rest === 1 ? ' day' : ' days') : '');
  }
  function actions(cafe, now = today()) {
    const l = cafe.lease || {}, out = [];
    (l.options || []).forEach(o => {
      if (o.status !== 'confirmed' && o.deadline) out.push({label:o.status === 'sent' ? 'Confirm option receipt' : 'Option deadline', date:o.deadline});
      if (o.status === 'pending' && o.opens && o.opens > now) out.push({label:'Option notice window opens',date:o.opens});
    });
    if (l.expiry) out.push({label:'Lease expiry',date:l.expiry});
    if (l.reminder) out.push({label:'Lease negotiation',date:l.reminder});
    if (l.review) out.push({label:'Rent review',date:l.review});
    (cafe.fees || []).filter(f=>f.start > now).forEach(f=>out.push({label:'Fee change',date:f.start}));
    (cafe.discounts || []).filter(d=>d.end >= now).forEach(d=>out.push({label:'Discount ends',date:d.end}));
    if (cafe.agreementExpiry) out.push({label:'Franchise agreement expiry',date:cafe.agreementExpiry});
    return out.sort((a,b)=>a.date.localeCompare(b.date)).map(a=>({...a,days:Math.round((day(a.date)-day(now))/86400000)}));
  }
  function validate(c) {
    if (!c.name.trim()) return 'Enter a location name.';
    for (const group of ['sales','fees']) {
      const dates = new Set();
      for (const r of c[group] || []) {
        if (!r.start) return 'Enter an effective date for every sales estimate and fee.';
        if (dates.has(r.start)) return 'Use different effective dates for each ' + (group === 'fees' ? 'fee' : 'sales estimate') + '.';
        dates.add(r.start);
        if (!present(r.amount) || Number(r.amount) < 0) return 'Enter a valid amount for every sales estimate and fee.';
        if (group === 'fees' && r.type === 'percent' && Number(r.amount)>100) return 'Fee percentages must be between 0 and 100.';
      }
    }
    const ds = [...(c.discounts || [])].sort((a,b)=>a.start.localeCompare(b.start));
    for(let i=0;i<ds.length;i++) {
      const d=ds[i];
      if(!d.start || !d.end || d.end<d.start) return 'Every discount needs a valid start and end date.';
      if(!present(d.amount) || Number(d.amount)<0 || (d.type==='percent' && Number(d.amount)>100)) return 'Enter a valid discount amount.';
      if(i && d.start<=ds[i-1].end) return 'Discount dates overlap. Only one discount can apply at a time.';
    }
    for(const r of c.costs || []) if(present(r.amount) && Number(r.amount)<0) return 'Occupancy costs cannot be negative.';
    const l=c.lease || {};
    if(l.start && l.expiry && l.expiry<l.start) return 'Lease expiry must follow commencement.';
    for(const o of l.options || []) {
      if(!present(o.years) || Number(o.years)<=0) return 'Enter the length of each lease option.';
      if(o.opens && o.deadline && o.opens>o.deadline) return 'Option notice window must open before its deadline.';
    }
    return '';
  }
  const api={annual,convert,today,tax,current,calculate,countdown,actions,validate};
  if(typeof module !== 'undefined' && module.exports) module.exports=api;
  else { root.HF=root.HF || {}; root.HF.hqCore=api; }
})(typeof window !== 'undefined' ? window : globalThis);
