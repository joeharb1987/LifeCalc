/* Additive HQ page. Uses the existing Budget state, sheets, theme and sync hooks. */
(function(){
  'use strict';
  const H=window.HF, C=H.hqCore;
  const app=()=>window.LCBudget, U=()=>app().ui, esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let selected=null, forecast=false, archived=false, view='weekly';
  const words={weekly:'week',monthly:'month',yearly:'year'}, short={weekly:'/wk',monthly:'/mo',yearly:'/yr'};
  const money=n=>n==null?'Not entered':H.money(n,{dp:0});
  const value=n=>money(C.convert(n,view));
  const uid=()=>crypto.randomUUID();
  const cafes=()=>app().get().hqLocations || [];
  const find=id=>cafes().find(c=>c.id===id);
  const status={trading:'Trading',opening:'Opening soon',closed:'Temporarily closed',archived:'Archived'};
  const button=(label,act,id='',cls='link')=>`<button type="button" class="${cls}" data-hq="${act}" data-id="${esc(id)}">${label}</button>`;
  const row=(label,right,act,id,sub='')=>button(`<span>${label}${sub?`<small>${sub}</small>`:''}</span><span>${right} ${H.icon('chev',16)}</span>`,act,id,'hq-line');
  const date=s=>s?new Date(s+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}):'Not entered';
  const due=a=>a.days<0?`${a.label} · ${C.countdown(a.date)}`:a.days===0?`${a.label} today`:`${a.label} in ${C.countdown(a.date)}`;
  function currentLocations(){return cafes().filter(c=>c.status==='trading'||(forecast&&c.status==='opening'));}
  function totals(){const list=currentLocations().map(c=>C.calculate(c));return {list,sales:list.reduce((a,c)=>a+(c.sales.gross||0),0),fees:list.reduce((a,c)=>a+(c.fees.net||0),0),gst:list.reduce((a,c)=>a+(c.fees.gst||0),0)};}
  function card(c){
    const n=C.calculate(c), next=C.actions(c).find(a=>!['Fee change','Discount ends','Franchise agreement expiry'].includes(a.label)), l=c.lease||{}, opts=(l.options||[]).filter(o=>o.status!=='confirmed');
    return `<article class="card hq-card"><div class="hq-card-head"><div>${button(esc(c.name),'detail',c.id,'hq-name')}<div class="muted small">${esc(c.franchisees||'Add franchisee details')}</div></div><span class="badge">${status[c.status]||'Trading'}</span></div>
      <div class="hq-metrics"><button class="hq-metric" data-hq="edit" data-id="${esc(c.id)}"><small>Estimated sales · inc GST</small><strong>${value(n.sales.gross)}</strong><small>${short[view]}</small></button><button class="hq-metric" data-hq="fees" data-id="${esc(c.id)}"><small>Franchise fee · ex GST</small><strong class="pos">${value(n.fees.net)}</strong><small>${n.fee?(n.fee.type==='percent'?esc(n.fee.amount)+'% of sales':'Fixed fee'):'Set fee'}${n.discount?' · Discount active':''} ${short[view]}</small></button></div>
      ${row('Rent',value(n.occupancy)+' '+short[view],'rent',c.id,`Rent, outgoings + marketing · ${n.ratio==null?'—':n.ratio.toFixed(1)+'%'} of sales${n.complete?'':' · Incomplete'} · ex GST`)}
      ${row(next?`<span class="${next.days<=90?'hq-alert':''}">${esc(due(next))}</span>`:'Add lease dates','', 'lease',c.id,(next?date(next.date)+' · ':'')+(l.expiry && next && next.label!=='Lease expiry'?'Lease ends '+date(l.expiry)+' · ':'')+(opts.length?opts.map(o=>esc(o.years)+'-year').join(' + ')+' options remaining':'No renewal option recorded'))}
      <div class="hq-meta">${c.status==='opening'?'Forecast only · ':''}${n.sale?'Sales estimate effective '+date(n.sale.start):'Sales not entered'}</div></article>`;
  }
  function render(){
    if(selected&&!find(selected)) selected=null;
    if(selected)return detail(find(selected));
    const t=totals(), visible=cafes().filter(c=>archived||c.status!=='archived'), actions=cafes().filter(c=>c.status!=='archived').flatMap(c=>C.actions(c).filter(a=>a.days<=90).map(a=>({...a,name:c.name,id:c.id})));
    const missing=t.list.filter(n=>n.sales.gross==null||n.fees.net==null).length;
    return `<div class="hq">${U().top('Ariel’s HQ',{sub:'Your café group at a glance'})}<div class="seg" role="tablist" aria-label="Financial period">${Object.keys(words).map(v=>`<button role="tab" aria-selected="${v===view}" class="${v===view?'on':''}" data-hq="view" data-id="${v}">${v[0].toUpperCase()+v.slice(1)}</button>`).join('')}</div>
    <div class="hq-stats"><div class="stat"><div class="lbl">HQ revenue</div><div class="val pos">${money(C.convert(t.fees,view))}</div><div class="per">Franchise fees · ex GST</div><div class="per">Estimated per ${words[view]}</div></div><div class="stat"><div class="lbl">Group sales</div><div class="val">${money(C.convert(t.sales,view))}</div><div class="per">${currentLocations().length} included locations · inc GST</div><div class="per">Estimated per ${words[view]}</div></div></div>
    <div class="card pad">${row('GST on franchise fees',money(C.convert(t.gst,view)),'gst','')}</div>
    ${missing?`<p class="hq-meta">${missing} included location(s) have missing sales or fees. Totals are partial.</p>`:''}
    ${actions.length?button(`${actions.length} lease or fee action${actions.length===1?' needs':'s need'} attention ›`,'attention','','hq-line hq-banner'):''}
    <label class="small muted"><input type="checkbox" data-hq="forecast" ${forecast?'checked':''}> Include opening locations in forecast</label>
    <section class="section"><div class="section-head"><h2>Locations (${cafes().filter(c=>c.status!=='archived').length})</h2>${button('+ Add','add')}</div>
    ${visible.length?visible.map(card).join(''):`<div class="card hq-empty"><h2>Add your first café</h2><p class="muted">Enter sales, franchise fees and lease details. Add more information whenever you’re ready.</p>${button('+ Add location','add')}</div>`}</section>
    ${cafes().some(c=>c.status==='archived')?button(archived?'Hide archived':'Show archived','archived'):''}
    <div class="hq-tabs"><a class="link" href="#budget">‹ Budget</a><span class="link">Ariel’s HQ</span></div><p class="hq-meta">Current estimates annualised to 52 weeks / 12 months. HQ revenue is calculated fees, not payments received.</p></div>`;
  }
  function detail(c){
    const n=C.calculate(c), l=c.lease||{};
    return `<div class="hq hq-detail">${U().top(c.name,{actions:button('Edit','edit',c.id)})}${button('‹ All locations','home')}<p>${esc(c.franchisees||'Franchisee names not entered')} · ${status[c.status]}</p>
    <div class="card hq-card">${row('Estimated sales',value(n.sales.gross),'edit',c.id,'Including GST · '+words[view])}${row('Franchise fee',value(n.fees.net),'fees',c.id,'Excluding GST · '+words[view])}${row('Rent',value(n.occupancy),'rent',c.id,(n.ratio==null?'—':n.ratio.toFixed(1)+'%')+' of sales · excluding GST')}${row('Lease and options',l.expiry?date(l.expiry):'Add dates','lease',c.id)}</div>
    <section class="card hq-card"><h2 class="h2">Contacts</h2><p>${esc(c.company||'Company not entered')}${c.abn?'<br>ABN '+esc(c.abn):''}</p><p>${esc(c.address||'Address not entered')}</p><p>${esc(c.phone||'Phone not entered')}<br>${esc(c.email||'Email not entered')}</p><p>Landlord / agent: ${esc(l.contact||'Not entered')}</p></section>
    <section class="card hq-card"><h2 class="h2">Documents and notes</h2>${(c.documents||[]).map(d=>`<a class="hq-doc" href="${esc(safeURL(d.url))}" target="_blank" rel="noopener noreferrer">${esc(d.name||'Document')} ↗</a>`).join('')}<p class="muted">${esc(c.notes||'No notes yet.').replace(/\n/g,'<br>')}</p><button class="link" data-act="page" data-val="files">Open Files vault ›</button><p class="hq-meta">Upload documents in Files, or add document links when editing this café.</p></section>
    <section class="card hq-card"><h2 class="h2">Other dates</h2><p>Opening: ${date(c.openingDate)}<br>Franchise agreement expiry: ${date(c.agreementExpiry)}</p></section>
    ${button(c.status==='archived'?'Restore location':'Archive location','archive',c.id)}</div>`;
  }
  function safeURL(s){try{const u=new URL(s);return /^https?:$/.test(u.protocol)?u.href:'#';}catch(e){return '#';}}
  function sheet(title,html){U().openSheet(title,`<div class="hq hq-detail">${html}</div>`);}
  function rent(c){const n=C.calculate(c);sheet(c.name+' · Rent',`<p class="muted">Occupancy costs per ${words[view]} · excluding GST</p>${n.costs.map(r=>`<div class="hq-line"><span>${esc(r.name)}<small>${r.included?'Included in base rent':esc(r.frequency)}</small></span><b>${r.included?'Included':value(r.net)}</b></div>`).join('')}<div class="hq-line"><b>Total excluding GST</b><b>${value(n.occupancy)}</b></div><div class="hq-line"><span>GST</span><b>${value(n.occupancyGST)}</b></div><div class="hq-line"><b>Total including GST</b><b>${value(n.occupancy==null?null:n.occupancy+n.occupancyGST)}</b></div><p>${n.ratio==null?'—':n.ratio.toFixed(1)+'%'} of sales (both excluding GST). ${n.complete?'':'Some occupancy amounts are missing.'}</p>${button('Edit occupancy costs','edit',c.id)}`);}
  function fees(c){const n=C.calculate(c);sheet(c.name+' · Franchise fee',`<div class="hq-line"><span>Fee excluding GST</span><b>${value(n.fees.net)}</b></div><div class="hq-line"><span>GST on fee</span><b>${value(n.fees.gst)}</b></div><div class="hq-line"><span>Total including GST</span><b>${value(n.fees.gross)}</b></div><p class="muted">Per ${words[view]}. ${n.discount?'Temporary discount active until '+date(n.discount.end)+'.':''}</p><h3>Fee history and scheduled changes</h3>${(c.fees||[]).slice().sort((a,b)=>a.start.localeCompare(b.start)).map(f=>`<p><b>${date(f.start)}</b><br>${f.type==='fixed'?money(Number(f.amount))+' '+esc(f.frequency):esc(f.amount)+'% of sales '+(f.basis==='included'?'including':'excluding')+' GST'} · GST ${esc(f.gst)}</p>`).join('')||'<p>No fee configured.</p>'}${button('Edit fees and discounts','edit',c.id)}`);}
  function lease(c){const l=c.lease||{};sheet(c.name+' · Lease',`<p>Commencement: <b>${date(l.start)}</b><br>Expiry: <b>${date(l.expiry)}</b><br>Current term: ${esc(l.term||'Not entered')}</p>${l.expiry?`<p><b>Lease ${l.expiry<C.today()?'expired':'ends in'} ${C.countdown(l.expiry)}</b></p>`:''}<h3>Renewal options</h3>${(l.options||[]).map(o=>`<div class="card pad"><b>${esc(o.years)}-year option · ${esc(o.status)}</b><p>Notice opens: ${date(o.opens)}<br>Deadline: ${date(o.deadline)}<br>${o.deadline?C.countdown(o.deadline):'Add option deadline'}</p></div>`).join('')||'<p>No renewal option recorded.</p>'}<p>Negotiation reminder: ${date(l.reminder)}<br>Next rent review: ${date(l.review)}<br>Review type: ${esc(l.reviewType||'Not entered')}</p><p>${esc(l.contact||'Landlord / agent not entered')}</p>${button('Edit lease details','edit',c.id)}<p class="hq-meta">Confirm a renewed lease’s actual commencement and expiry dates when updating it. Options do not automatically extend the lease.</p>`);}
  const freqs=[['weekly','Weekly'],['monthly','Monthly'],['yearly','Yearly']];
  const gst=[['excluded','GST added'],['included','GST included'],['none','No GST applicable']];
  function input(label,name,v='',type='text',required=false){return `<label>${label}<input name="${name}" type="${type}" value="${esc(v)}" ${required?'required':''} ${type==='number'?'min="0" step="any" inputmode="decimal"':''}></label>`;}
  function select(label,name,v,opts){return `<label>${label}<select name="${name}">${opts.map(([k,t])=>`<option value="${k}" ${k===v?'selected':''}>${t}</option>`).join('')}</select></label>`;}
  function record(kind,r={}){
    let fields='';
    if(kind==='sales')fields=input('Estimated sales','amount',r.amount??'','number')+select('Frequency','frequency',r.frequency||'weekly',freqs)+select('Sales GST basis','gst',r.gst||'included',gst)+input('Effective date','start',r.start||C.today(),'date');
    if(kind==='fees')fields=select('Fee type','type',r.type||'fixed',[['fixed','Fixed amount'],['percent','Percentage of sales']])+input('Amount ($) / rate (%)','amount',r.amount??'','number')+select('Fixed fee frequency','frequency',r.frequency||'weekly',freqs)+select('Percentage applies to','basis',r.basis||'excluded',[['excluded','Sales excluding GST'],['included','Sales including GST']])+select('Fee GST treatment','gst',r.gst||'excluded',gst)+input('Effective date','start',r.start||C.today(),'date');
    if(kind==='discounts')fields=select('Discount type','type',r.type||'percent',[['percent','Percentage reduction'],['amount','Dollar reduction'],['replace','Temporary replacement fee']])+input('Reduction / replacement','amount',r.amount??'','number')+select('Dollar amount frequency','frequency',r.frequency||'weekly',freqs)+input('Start date','start',r.start||'','date')+input('End date (inclusive)','end',r.end||'','date');
    if(kind==='costs')fields=input('Charge name','name',r.name||'')+input('Amount','amount',r.amount??'','number')+select('Frequency','frequency',r.frequency||'weekly',freqs)+select('GST treatment','gst',r.gst||'excluded',gst)+`<label class="hq-wide"><input name="included" type="checkbox" ${r.included?'checked':''}> Included in base rent (do not add again)</label>`;
    if(kind==='options')fields=input('Option term (years)','years',r.years??'','number')+input('Notice window opens','opens',r.opens||'','date')+input('Final notice deadline','deadline',r.deadline||'','date')+select('Status','status',r.status||'pending',[['pending','Not exercised'],['sent','Notice sent'],['confirmed','Confirmed / exercised']]);
    if(kind==='documents')fields=input('Document title','name',r.name||'')+input('Document URL','url',r.url||'','url');
    return `<div class="hq-record" data-kind="${kind}"><div class="hq-fields">${fields}</div>${button('Remove','remove-record')}</div>`;
  }
  function records(title,kind,list,help=''){return `<fieldset><legend>${title}</legend>${help?`<p class="hq-help">${help}</p>`:''}<div data-records="${kind}">${list.map(r=>record(kind,r)).join('')}</div>${button('+ Add '+({fees:'fee or scheduled change',sales:'sales estimate',discounts:'discount',costs:'charge',options:'option',documents:'document link'}[kind]),'add-record',kind)}</fieldset>`;}
  function edit(c){
    c=c||{id:uid(),name:'',status:'trading',sales:[],fees:[],discounts:[],costs:[{name:'Base rent'},{name:'Outgoings'},{name:'Marketing fund'}],lease:{options:[]},documents:[]};
    const l=c.lease||{};
    const body=`<form class="hq-form" id="hqForm"><div class="form-bar"><button type="button" class="cancel" data-act="close-sheet">Cancel</button><button type="submit" class="save">Save</button></div><h2 class="form-title">${c.name?'Edit location':'Add location'}</h2><p class="hq-error" role="alert" id="hqError"></p>
    <fieldset><legend>Location and franchisee</legend><div class="hq-fields">${input('Location name','name',c.name,'text',true)}${select('Status','status',c.status,Object.entries(status))}${input('Franchisee names','franchisees',c.franchisees)}${input('Company name','company',c.company)}${input('ABN','abn',c.abn)}${input('Phone','phone',c.phone,'tel')}${input('Email','email',c.email,'email')}${input('Address','address',c.address)}${input('Opening date','openingDate',c.openingDate,'date')}${input('Franchise agreement expiry','agreementExpiry',c.agreementExpiry,'date')}</div></fieldset>
    ${records('Sales estimates','sales',c.sales||[],'Keep dated estimates. Future estimates apply from their effective date. Enter 0 explicitly when appropriate.')}
    ${records('Franchise fees','fees',c.fees||[],'Add a future effective date to schedule an increase. Keep earlier entries for history.')}
    ${records('Temporary discounts','discounts',c.discounts||[],'Dollar reductions and replacement fees use the current fee’s GST treatment. After the end date, the normal fee schedule resumes.')}
    <div class="hq-preview" id="hqPreview" aria-live="polite"></div>
    ${records('Rent and occupancy','costs',c.costs||[],'Mark charges included in base rent to avoid double counting. Enter 0 for charges that do not apply.')}
    <fieldset><legend>Lease</legend><div class="hq-fields">${input('Commencement','lease.start',l.start,'date')}${input('Expiry','lease.expiry',l.expiry,'date')}${input('Current term (e.g. 5 years)','lease.term',l.term)}${input('Landlord / agent contact','lease.contact',l.contact)}${input('Negotiation reminder','lease.reminder',l.reminder,'date')}${input('Next rent review','lease.review',l.review,'date')}${input('Review type / increase','lease.reviewType',l.reviewType)}</div></fieldset>
    ${records('Lease options','options',l.options||[],'Leave empty if there are no renewal options. Enter notice dates from your lease. Confirmed options do not automatically change lease dates.')}
    ${records('Documents','documents',c.documents||[],'Link a lease or other document. You can also upload files through the existing Files vault.')}
    <label>Notes<textarea name="notes" rows="4">${esc(c.notes||'')}</textarea></label><p class="hq-help">Saved with your existing Life Calc household data. Forecasts and lease details do not change your personal budget.</p></form>`;
    U().openSheet('Location',body,el=>{
      const f=el.querySelector('form'); f.dataset.id=c.id;
      f.addEventListener('submit',e=>{
        e.preventDefault(); const next=readForm(f,c); const error=C.validate(next);
        if(error){f.querySelector('#hqError').textContent=error;f.querySelector('#hqError').scrollIntoView({block:'center'});return;}
        if(next.documents.some(d=>safeURL(d.url)==='#')){f.querySelector('#hqError').textContent='Use a valid http or https document link.';return;}
        if(app().saveHQ(next)){U().closeSheet();U().toast('Location saved');}
      });
      const preview=()=>{
        const n=C.calculate(readForm(f,c));
        f.querySelector('#hqPreview').textContent=`Current fee preview: ${money(C.convert(n.fees.net,'weekly'))}/week excluding GST + ${money(C.convert(n.fees.gst,'weekly'))} GST${n.discount?' · discount active':''}.`;
        f.querySelectorAll('[data-kind="fees"]').forEach(r=>{const fixed=r.querySelector('[name="type"]').value==='fixed';r.querySelector('[name="frequency"]').closest('label').hidden=!fixed;r.querySelector('[name="basis"]').closest('label').hidden=fixed;});
      };
      f.addEventListener('input',preview); f.addEventListener('change',preview); f.addEventListener('hq-record-change',preview); preview();
    },{full:true});
  }
  function readForm(f,original){
    const out={...original,lease:{...(original.lease||{})},updatedAt:new Date().toISOString()};
    f.querySelectorAll('input,select,textarea').forEach(el=>{
      if(el.closest('[data-kind]'))return;
      if(el.name.startsWith('lease.'))out.lease[el.name.slice(6)]=el.value;
      else out[el.name]=el.value;
    });
    for(const kind of ['sales','fees','discounts','costs','options','documents']){
      const rows=[...f.querySelectorAll(`[data-kind="${kind}"]`)].map(r=>{const v={};r.querySelectorAll('[name]').forEach(e=>v[e.name]=e.type==='checkbox'?e.checked:e.value);return v;});
      if(kind==='options')out.lease.options=rows;else out[kind]=rows;
    }
    return out;
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-hq]');if(!b)return;
    const id=b.dataset.id,c=find(id), act=b.dataset.hq;
    if(act==='view'){view=id;app().render();}
    if(act==='forecast'){forecast=b.checked;app().render();}
    if(act==='archived'){archived=!archived;app().render();}
    if(act==='add')edit();
    if(act==='edit'&&c)edit(c);
    if(act==='detail'){selected=id;app().render();window.scrollTo(0,0);}
    if(act==='home'){selected=null;app().render();window.scrollTo(0,0);}
    if(act==='rent'&&c)rent(c);
    if(act==='fees'&&c)fees(c);
    if(act==='lease'&&c)lease(c);
    if(act==='archive'&&c){if(c.status!=='archived'&&!confirm('Archive '+c.name+'? Its records will be kept and excluded from totals.'))return;app().saveHQ({...c,status:c.status==='archived'?'trading':'archived'});selected=null;app().render();}
    if(act==='gst')sheet('GST on franchise fees',`${currentLocations().map(c=>`<div class="hq-line"><span>${esc(c.name)}</span><b>${value(C.calculate(c).fees.gst)}</b></div>`).join('')}<p class="muted">Estimated per ${words[view]}. This is GST on HQ fees, separate from each café’s sales GST.</p>`);
    if(act==='attention')sheet('Upcoming actions',cafes().filter(c=>c.status!=='archived').flatMap(c=>C.actions(c).filter(a=>a.days<=90).map(a=>({c,a}))).sort((x,y)=>x.a.date.localeCompare(y.a.date)).map(({c,a})=>row(esc(c.name),esc(due(a)),a.label.includes('Fee')||a.label.includes('Discount')?'fees':'lease',c.id,date(a.date))).join(''));
    if(act==='add-record'){b.previousElementSibling.insertAdjacentHTML('beforeend',record(id));b.closest('form').dispatchEvent(new Event('hq-record-change'));}
    if(act==='remove-record'){const f=b.closest('form');b.closest('[data-kind]').remove();f.dispatchEvent(new Event('hq-record-change'));}
  });
  // Swiping between Budget and HQ is handled by the shared page carousel (nav-swipe.js).
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&app().get().settings.tab==='hq')app().render();});
  setInterval(()=>{if(app().get().settings.tab==='hq'&&!document.getElementById('sheet'))app().render();},60000);
  H.hq={render,hasDetail:()=>!!selected,back:()=>{if(!selected)return false;selected=null;app().render();return true;}};
})();
