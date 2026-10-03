/* LifeCalc Budget — Files vault. Private household files (statements, CSVs, screenshots, bills, payslips)
   stored in Supabase Storage; each gets a one-off AI summary from the process-file edge function.
   Files never change budget numbers. Needs Live sharing (the files belong to the shared household). */
(function (root) {
  'use strict';
  var BUCKET = 'household-files', MAX_BYTES = 20 * 1024 * 1024;
  var TYPES = [['statement', 'Statement'], ['investment', 'Investment'], ['bill', 'Bill'], ['payslip', 'Payslip'], ['other', 'Other']];
  var TYPE_ICON = { statement: 'bank', investment: 'chart', bill: 'bolt', payslip: 'wallet', other: 'tag' };
  var COLS = 'id,original_name,mime_type,size_bytes,sha256,uploaded_at,as_at_date,file_type,summary,status,error,linked_item_id,linked_asset_id,ai_note,storage_path';
  var st = { files: [], loaded: false, loading: false, filter: 'all', uploading: 0, err: null, poll: null };

  function B() { return root.LCBudget; }
  function U() { return B().ui; }
  function sync() { return root.HF && root.HF.sync; }
  function sb() { var s = sync(); return s && s.client && s.client(); }
  function hid() { var s = sync(); return s && s.state().householdId; }
  function ready() { var s = sync(), x = s && s.state(); return !!(x && x.ready && x.signedIn && x.householdId); }
  function typeName(t) { return (TYPES.filter(function (x) { return x[0] === t; })[0] || TYPES[4])[1]; }
  function fmtDate(iso) { return iso ? root.HF.fmtDate(String(iso).slice(0, 10), true) : 'No date'; }
  function kb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function byId(id) { return st.files.filter(function (f) { return f.id === id; })[0]; }
  function stuck(f) { return f.status === 'processing' && Date.now() - new Date(f.uploaded_at).getTime() > 3 * 60 * 1000; }

  // ---------- Data ----------
  function load() {
    if (!ready() || st.loading) return Promise.resolve();
    st.loading = true;
    return sb().from('files').select(COLS).eq('household_id', hid())
      .order('as_at_date', { ascending: false, nullsFirst: false }).order('uploaded_at', { ascending: false })
      .then(function (r) {
        st.loading = false;
        if (r.error) { st.err = r.error.message; } else { st.files = r.data || []; st.loaded = true; st.err = null; }
        refresh(); schedulePoll();
      });
  }
  // While anything is being read, check again every few seconds.
  function schedulePoll() {
    clearTimeout(st.poll);
    var busy = st.files.some(function (f) { return f.status === 'processing' && !stuck(f); });
    if (busy && onPage()) st.poll = setTimeout(load, 4000);
  }
  function onPage() { return !!document.querySelector('[data-files-page]'); }
  function refresh() { if (onPage()) B().render(); var d = document.getElementById('fxDetail'); if (d) fillDetail(d.getAttribute('data-id')); }

  function sha256(buf) {
    return crypto.subtle.digest('SHA-256', buf).then(function (h) {
      return Array.prototype.map.call(new Uint8Array(h), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }
  function safeName(n) { return String(n).replace(/[^\w.\-]+/g, '_').slice(-80) || 'file'; }

  function uploadOne(file) {
    if (file.size > MAX_BYTES) { U().toast(file.name + ' is over 20 MB'); return Promise.resolve(); }
    if (!file.size) { U().toast(file.name + ' is empty'); return Promise.resolve(); }
    var c = sb(), h = hid(), uid = sync().state().userId;
    return file.arrayBuffer().then(sha256).then(function (hash) {
      return c.from('files').select('id,original_name').eq('household_id', h).eq('sha256', hash).limit(1).then(function (r) {
        if (r.data && r.data[0]) { U().toast('Already uploaded: ' + r.data[0].original_name); return; }
        var path = h + '/' + (crypto.randomUUID ? crypto.randomUUID() : Date.now()) + '-' + safeName(file.name);
        return c.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false }).then(function (up) {
          if (up.error) throw up.error;
          return c.from('files').insert({ household_id: h, uploaded_by: uid, storage_path: path, original_name: file.name, mime_type: file.type || null,
            size_bytes: file.size, sha256: hash, status: 'processing' }).select('id').single().then(function (ins) {
            if (ins.error) {
              c.storage.from(BUCKET).remove([path]);
              if (ins.error.code === '23505') { U().toast('Already uploaded: ' + file.name); return; }
              throw ins.error;
            }
            return c.functions.invoke('process-file', { body: { file_id: ins.data.id } });
          });
        });
      });
    }).catch(function (e) { U().toast('Upload failed: ' + ((e && e.message) || e)); });
  }
  function uploadMany(list) {
    var files = Array.prototype.slice.call(list || []);
    if (!files.length) return;
    st.uploading += files.length; refresh();
    var chain = Promise.resolve();
    files.forEach(function (f) { chain = chain.then(function () { return uploadOne(f); }).then(function () { st.uploading--; refresh(); return load(); }); });
  }
  function retry(id) {
    var f = byId(id); if (f) { f.status = 'processing'; f.error = null; f.uploaded_at = new Date().toISOString(); }
    refresh();
    return sb().functions.invoke('process-file', { body: { file_id: id } }).then(function (r) {
      if (r.error) U().toast('Retry failed: ' + r.error.message);
      return load();
    });
  }
  function signedUrl(f, download) {
    return sb().storage.from(BUCKET).createSignedUrl(f.storage_path, 600, download ? { download: f.original_name } : undefined)
      .then(function (r) { if (r.error) throw r.error; return r.data.signedUrl; });
  }
  function remove(id) {
    var f = byId(id); if (!f || !confirm('Delete “' + f.original_name + '”? This can’t be undone.')) return;
    sb().storage.from(BUCKET).remove([f.storage_path]).then(function () {
      return sb().from('files').delete().eq('id', id);
    }).then(function (r) {
      if (r && r.error) throw r.error;
      st.files = st.files.filter(function (x) { return x.id !== id; });
      U().closeSheet(); U().toast('Deleted'); refresh();
    }).catch(function (e) { U().toast('Delete failed: ' + e.message); });
  }

  // ---------- Page ----------
  function linkName(f) {
    var S = B().get(), it, as;
    if (f.linked_item_id && (it = (S.items || []).filter(function (x) { return x.id === f.linked_item_id; })[0])) return it.name;
    if (f.linked_asset_id && (as = (S.assets || []).filter(function (x) { return x.id === f.linked_asset_id; })[0])) return as.name;
    return '';
  }
  function statusBadge(f) {
    if (f.status === 'processing' && !stuck(f)) return '<span class="badge fx-busy"><i class="fx-spin"></i>Reading…</span>';
    if (f.status === 'failed' || stuck(f)) return '<span class="badge fx-fail">' + (stuck(f) ? 'Stuck' : 'Failed') + '</span>';
    return '';
  }
  function render() {
    var u = U(), icon = root.HF.icon;
    var h = u.top('Files', { back: true, actions: ready() ? '<label class="icon-btn" aria-label="Upload files">' + icon('plus', 22) + '<input type="file" multiple class="fx-input" hidden></label>' : '' });
    h += '<div data-files-page></div>';
    if (!ready()) {
      return h + '<div class="card pad"><b>Files need Live sharing</b><p class="muted small">Files are stored privately for your household (you and Zhila), so sign in under Live sharing first.</p>' +
        '<button class="btn accent block" data-act="sync">Open Live sharing</button></div>';
    }
    if (!st.loaded && !st.loading) load();
    h += '<label class="btn accent block fx-upload">' + icon('upload', 18) + ' Upload files<input type="file" multiple class="fx-input" hidden></label>';
    h += '<p class="muted small fx-hint">Statements, CSVs, screenshots, bills, payslips: any file up to 20 MB. Each one gets a short AI summary.</p>';
    if (st.uploading) h += '<div class="fx-uploading"><i class="fx-spin"></i>Uploading ' + st.uploading + ' file' + (st.uploading > 1 ? 's' : '') + '…</div>';
    var counts = { all: st.files.length };
    st.files.forEach(function (f) { counts[f.file_type] = (counts[f.file_type] || 0) + 1; });
    h += '<div class="chips">' + [['all', 'All']].concat(TYPES).map(function (t) {
      if (t[0] !== 'all' && !counts[t[0]]) return '';
      return '<button class="chip' + (st.filter === t[0] ? ' on' : '') + '" data-fx="filter" data-v="' + t[0] + '">' + t[1] + (counts[t[0]] ? ' ' + counts[t[0]] : '') + '</button>';
    }).join('') + '</div>';
    var list = st.files.filter(function (f) { return st.filter === 'all' || f.file_type === st.filter; });
    if (st.err) h += '<div class="card pad neg">Couldn’t load files: ' + u.esc(st.err) + '</div>';
    else if (!st.loaded) h += '<div class="card pad muted">Loading…</div>';
    else if (!list.length) h += '<div class="card">' + u.empty('upload', st.files.length ? 'Nothing of this type' : 'No files yet', 'Upload a statement, CSV, screenshot or bill.') + '</div>';
    else h += '<div class="list">' + list.map(function (f) {
      var sub = typeName(f.file_type) + ' · ' + fmtDate(f.as_at_date), ln = linkName(f);
      return '<div class="row fx-row" role="button" tabindex="0" data-fx="open" data-id="' + f.id + '">' +
        '<div class="ico t-' + ({ statement: 'blue', investment: 'green', bill: 'orange', payslip: 'purple', other: 'slate' }[f.file_type] || 'slate') + '">' + icon(TYPE_ICON[f.file_type] || 'tag', 20) + '</div>' +
        '<div class="main"><div class="name">' + u.esc(f.original_name) + '</div><div class="sub"><span>' + sub + '</span>' + statusBadge(f) + (f.ai_note ? '<span class="badge flag">Check</span>' : '') + '</div>' +
        '<div class="fx-sum">' + u.esc(f.status === 'failed' ? (f.error || 'Couldn’t read this file') : f.summary || (f.status === 'processing' ? 'Reading the file…' : '')) + (ln ? ' · Linked: ' + u.esc(ln) : '') + '</div></div>' +
        root.HF.icon('chev', 18, 'chev') + '</div>';
    }).join('') + '</div>';
    schedulePoll();
    return h;
  }

  // ---------- Detail sheet ----------
  function open(id) {
    var f = byId(id); if (!f) return;
    U().openSheet(f.original_name, '<div id="fxDetail" data-id="' + id + '"></div>', function () { fillDetail(id); });
  }
  function linkOptions(f) {
    var S = B().get(), u = U(), cur = f.linked_item_id ? 'item:' + f.linked_item_id : f.linked_asset_id ? 'asset:' + f.linked_asset_id : '';
    var opt = function (v, label) { return '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + u.esc(label) + '</option>'; };
    return opt('', 'Not linked') +
      '<optgroup label="Budget lines">' + (S.items || []).filter(function (i) { return i.active !== false; }).map(function (i) { return opt('item:' + i.id, i.name); }).join('') + '</optgroup>' +
      '<optgroup label="Assets">' + (S.assets || []).map(function (a) { return opt('asset:' + a.id, a.name); }).join('') + '</optgroup>';
  }
  function fillDetail(id) {
    var el = document.getElementById('fxDetail'), f = byId(id), u = U();
    if (!el || !f) return;
    var busy = f.status === 'processing' && !stuck(f);
    var h = '<div class="fx-preview" id="fxPrev"><span class="muted small">Loading preview…</span></div>';
    h += '<div class="card pad mt12"><div class="fx-meta">' + typeName(f.file_type) + ' · as at ' + fmtDate(f.as_at_date) + ' · ' + kb(f.size_bytes) + '</div>';
    if (busy) h += '<p class="muted"><i class="fx-spin"></i> Reading the file. This usually takes under a minute.</p>';
    else if (f.status === 'failed' || stuck(f)) h += '<p class="neg">' + u.esc(f.error || 'This is taking too long.') + '</p><button class="btn block" data-fx="retry" data-id="' + id + '">Retry</button>';
    else h += '<p class="fx-summary">' + u.esc(f.summary || 'No summary.') + '</p>';
    if (f.ai_note) h += '<div class="note fx-note"><b>Check:</b> ' + u.esc(f.ai_note) + '<br><span class="muted small">Nothing in your budget was changed.</span></div>';
    h += '</div>';
    h += '<div class="card pad mt12"><label class="field"><span>As at</span><input type="date" id="fxDate" value="' + (f.as_at_date || '') + '"></label>' +
      '<label class="field"><span>Type</span><select id="fxType">' + TYPES.map(function (t) { return '<option value="' + t[0] + '"' + (t[0] === f.file_type ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>Linked to</span><select id="fxLink">' + linkOptions(f) + '</select></label>' +
      '<button class="btn accent block" data-fx="save" data-id="' + id + '">Save changes</button></div>';
    h += '<div class="btn-row mt12"><button class="btn" data-fx="download" data-id="' + id + '">' + root.HF.icon('download', 18) + ' Download</button>' +
      (!busy && f.status === 'ready' ? '<button class="btn" data-fx="retry" data-id="' + id + '">Re-read</button>' : '') + '</div>';
    h += '<button class="btn danger-text block mt12" data-fx="delete" data-id="' + id + '">' + root.HF.icon('trash', 18) + ' Delete file</button>';
    el.innerHTML = h;
    preview(f);
  }
  function preview(f) {
    var box = document.getElementById('fxPrev'), u = U(); if (!box) return;
    var m = (f.mime_type || '').toLowerCase(), n = f.original_name.toLowerCase();
    var isImg = /^image\/(png|jpe?g|gif|webp)$/.test(m) || /\.(png|jpe?g|gif|webp)$/.test(n);
    var isPdf = m === 'application/pdf' || /\.pdf$/.test(n);
    var isText = /^text\/|csv/.test(m) || /\.(csv|tsv|txt|ofx|qif)$/.test(n);
    if (!isImg && !isPdf && !isText) { box.innerHTML = '<span class="muted small">No preview for this file type. Use Download.</span>'; return; }
    signedUrl(f).then(function (url) {
      if (!document.getElementById('fxPrev')) return;
      if (isImg) box.innerHTML = '<img src="' + url + '" alt="">';
      else if (isPdf) box.innerHTML = '<iframe src="' + url + '#view=FitH" title="PDF preview"></iframe><a class="link" href="' + url + '" target="_blank" rel="noopener">Open full PDF</a>';
      else fetch(url).then(function (r) { return r.text(); }).then(function (t) { box.innerHTML = '<pre>' + u.esc(t.slice(0, 4000)) + (t.length > 4000 ? '\n…' : '') + '</pre>'; });
    }).catch(function () { box.innerHTML = '<span class="muted small">Preview unavailable offline.</span>'; });
  }
  function save(id) {
    var f = byId(id); if (!f) return;
    var link = document.getElementById('fxLink').value, upd = {
      as_at_date: document.getElementById('fxDate').value || null,
      file_type: document.getElementById('fxType').value,
      linked_item_id: link.indexOf('item:') === 0 ? link.slice(5) : null,
      linked_asset_id: link.indexOf('asset:') === 0 ? link.slice(6) : null
    };
    var oldLink = f.linked_item_id ? 'item:' + f.linked_item_id : f.linked_asset_id ? 'asset:' + f.linked_asset_id : '';
    if (link !== oldLink) upd.ai_note = null;   // the old comparison no longer applies; "Re-read" makes a new one
    sb().from('files').update(upd).eq('id', id).then(function (r) {
      if (r.error) { U().toast('Save failed: ' + r.error.message); return; }
      Object.assign(f, upd); U().toast(link !== oldLink && link ? 'Saved. Tap Re-read to compare with the link' : 'Saved'); refresh();
    });
  }
  function download(id) {
    var f = byId(id); if (!f) return;
    signedUrl(f, true).then(function (url) { var a = document.createElement('a'); a.href = url; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); })
      .catch(function (e) { U().toast('Download failed: ' + e.message); });
  }

  // ---------- Events (data-fx, separate from the app's data-act) ----------
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-fx]'); if (!b) return;
    var a = b.getAttribute('data-fx'), id = b.getAttribute('data-id');
    if (a === 'filter') { st.filter = b.getAttribute('data-v'); refresh(); }
    else if (a === 'open') open(id);
    else if (a === 'retry') retry(id);
    else if (a === 'save') save(id);
    else if (a === 'download') download(id);
    else if (a === 'delete') remove(id);
  });
  document.addEventListener('change', function (e) {
    if (e.target.classList && e.target.classList.contains('fx-input')) { uploadMany(e.target.files); e.target.value = ''; }
  });

  root.HF = Object.assign(root.HF || {}, { files: { render: render, load: load, count: function () { return st.loaded ? st.files.length : null; }, _state: st } });
})(typeof window !== 'undefined' ? window : globalThis);
