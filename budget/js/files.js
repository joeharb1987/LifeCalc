/* LifeCalc Budget — Files vault. Private household files (statements, CSVs, screenshots, bills, payslips)
   stored in Supabase Storage; each gets a one-off AI summary from the process-file edge function.
   Files can be grouped in the household's own folders (one level). Files never change budget numbers.
   Needs Live sharing (the files belong to the shared household). */
(function (root) {
  'use strict';
  var BUCKET = 'household-files', MAX_BYTES = 20 * 1024 * 1024;
  var TYPES = [['statement', 'Statement'], ['investment', 'Investment'], ['bill', 'Bill'], ['payslip', 'Payslip'], ['other', 'Other']];
  var TYPE_ICON = { statement: 'bank', investment: 'chart', bill: 'bolt', payslip: 'wallet', other: 'tag' };
  var TYPE_TINT = { statement: 'blue', investment: 'green', bill: 'orange', payslip: 'purple', other: 'slate' };
  var FOLDER_ICONS = ['folder', 'bank', 'wallet', 'card', 'bolt', 'chart', 'coins', 'home', 'car', 'health', 'shield', 'briefcase', 'kids', 'book', 'gift', 'star', 'heart', 'tag'];
  var SUGGESTED = [['Bank statements', 'bank'], ['Payslips', 'wallet'], ['Bills', 'bolt'], ['Investments', 'chart'], ['Tax', 'briefcase'], ['Insurance', 'shield']];
  var KEY_MISSING = /ANTHROPIC_API_KEY|AI isn't set up/;
  var COLS = 'id,original_name,mime_type,size_bytes,sha256,uploaded_at,as_at_date,file_type,summary,status,error,linked_item_id,linked_asset_id,ai_note,storage_path,folder_id';
  var st = { files: [], folders: [], loaded: false, loading: false, filter: 'all', upTotal: 0, upDone: 0, err: null, poll: null, sel: null, autoRetried: {}, folder: null, retryOnLoad: false };

  function B() { return root.LCBudget; }
  function U() { return B().ui; }
  function icon(k, s, x) { return root.HF.icon(k, s, x); }
  function sync() { return root.HF && root.HF.sync; }
  function sb() { var s = sync(); return s && s.client && s.client(); }
  function hid() { var s = sync(); return s && s.state().householdId; }
  function ready() { var s = sync(), x = s && s.state(); return !!(x && x.ready && x.signedIn && x.householdId); }
  function typeName(t) { return (TYPES.filter(function (x) { return x[0] === t; })[0] || TYPES[4])[1]; }
  function fmtDate(iso) { return iso ? root.HF.fmtDate(String(iso).slice(0, 10), true) : 'No date'; }
  function kb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function byId(id) { return st.files.filter(function (f) { return f.id === id; })[0]; }
  function folderById(id) { return st.folders.filter(function (f) { return f.id === id; })[0]; }
  function inFolder(id) { return st.files.filter(function (f) { return f.folder_id === id; }); }
  function stuck(f) { return f.status === 'processing' && Date.now() - new Date(f.uploaded_at).getTime() > 3 * 60 * 1000; }
  function waitingForKey(f) { return f.status === 'failed' && KEY_MISSING.test(f.error || ''); }
  function needsRetry(f) { return f.status === 'failed' || stuck(f); }

  // ---------- Data ----------
  function load() {
    if (!ready() || st.loading) return Promise.resolve();
    st.loading = true;
    var c = sb(), h = hid();
    return Promise.all([
      c.from('files').select(COLS).eq('household_id', h).order('as_at_date', { ascending: false, nullsFirst: false }).order('uploaded_at', { ascending: false }),
      c.from('file_folders').select('id,name,icon,sort_order').eq('household_id', h).order('sort_order').order('name')
    ]).then(function (r) {
      st.loading = false;
      var err = r[0].error || r[1].error;
      if (err) { st.err = err.message; } else { st.files = r[0].data || []; st.folders = r[1].data || []; st.loaded = true; st.err = null; }
      refresh(); schedulePoll();
      if (st.retryOnLoad) { st.retryOnLoad = false; autoRetry(); }
    }, function (e) { st.loading = false; st.err = (e && e.message) || 'Offline'; refresh(); });
  }
  // While anything is being read, check again every few seconds.
  function schedulePoll() {
    clearTimeout(st.poll);
    var busy = st.files.some(function (f) { return f.status === 'processing' && !stuck(f); });
    if (busy && onPage()) st.poll = setTimeout(load, 4000);
  }
  // Files that failed only because the AI key wasn't set yet are tried again (once per file per visit) when Files is opened,
  // so they fix themselves as soon as the key is added.
  function autoRetry() {
    if (!onPage()) return;
    st.files.filter(function (f) { return waitingForKey(f) && !st.autoRetried[f.id]; }).forEach(function (f) {
      st.autoRetried[f.id] = true; retry(f.id, true);
    });
  }
  function onPage() { return !!document.querySelector('[data-files-page]'); }
  function refresh() {
    if (onPage()) B().render();
    var d = document.getElementById('fxDetail'); if (d) fillDetail(d.getAttribute('data-id'));
  }

  function sha256(buf) {
    return crypto.subtle.digest('SHA-256', buf).then(function (h) {
      return Array.prototype.map.call(new Uint8Array(h), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }
  function safeName(n) { return String(n).replace(/[^\w.\-]+/g, '_').slice(-80) || 'file'; }

  function uploadOne(file, folderId) {
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
            size_bytes: file.size, sha256: hash, status: 'processing', folder_id: folderId || null }).select('id').single().then(function (ins) {
            if (ins.error) {
              c.storage.from(BUCKET).remove([path]);
              if (ins.error.code === '23505') { U().toast('Already uploaded: ' + file.name); return; }
              throw ins.error;
            }
            return c.functions.invoke('process-file', { body: { file_id: ins.data.id } });
          });
        });
      });
    }).catch(function (e) { U().toast('Upload failed: ' + file.name + ' (' + ((e && e.message) || e) + ')'); });
  }
  function uploadMany(list, folderId) {
    var files = Array.prototype.slice.call(list || []);
    if (!files.length) return;
    st.upTotal += files.length; refresh();
    var chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () { return uploadOne(f, folderId); }).then(function () {
        st.upDone++;
        if (st.upDone >= st.upTotal) { st.upDone = st.upTotal = 0; }
        return load();
      });
    });
  }
  function retry(id, quiet) {
    var f = byId(id); if (f) { f.status = 'processing'; f.error = null; f.uploaded_at = new Date().toISOString(); }
    if (!quiet) refresh();
    return sb().functions.invoke('process-file', { body: { file_id: id } }).then(function (r) {
      if (r.error && !quiet) U().toast('Retry failed: ' + r.error.message);
      return load();
    });
  }
  function retryAll() {
    var ids = st.files.filter(needsRetry).map(function (f) { return f.id; });
    if (!ids.length) return;
    ids.forEach(function (id) { var f = byId(id); f.status = 'processing'; f.error = null; f.uploaded_at = new Date().toISOString(); });
    refresh(); U().toast('Reading ' + ids.length + ' file' + (ids.length > 1 ? 's' : '') + ' again');
    var chain = Promise.resolve();
    ids.forEach(function (id) { chain = chain.then(function () { return sb().functions.invoke('process-file', { body: { file_id: id } }); }); });
    chain.then(load, load);
  }
  function signedUrl(f, download) {
    return sb().storage.from(BUCKET).createSignedUrl(f.storage_path, 600, download ? { download: f.original_name } : undefined)
      .then(function (r) { if (r.error) throw r.error; return r.data.signedUrl; });
  }
  function removeFiles(ids) {
    var list = ids.map(byId).filter(Boolean); if (!list.length) return Promise.resolve();
    return sb().storage.from(BUCKET).remove(list.map(function (f) { return f.storage_path; })).then(function () {
      return sb().from('files').delete().in('id', ids);
    }).then(function (r) {
      if (r && r.error) throw r.error;
      st.files = st.files.filter(function (x) { return ids.indexOf(x.id) < 0; });
    });
  }
  function remove(id) {
    var f = byId(id); if (!f || !confirm('Delete “' + f.original_name + '”? This can’t be undone.')) return;
    removeFiles([id]).then(function () { U().closeSheet(); U().toast('Deleted'); refresh(); })
      .catch(function (e) { U().toast('Delete failed: ' + e.message); });
  }
  function moveFiles(ids, folderId) {
    return sb().from('files').update({ folder_id: folderId || null }).in('id', ids).then(function (r) {
      if (r.error) throw r.error;
      ids.forEach(function (id) { var f = byId(id); if (f) f.folder_id = folderId || null; });
    });
  }

  // ---------- Folders ----------
  function createFolder(name, ic) {
    name = String(name || '').trim().slice(0, 60);
    if (!name) return Promise.reject(new Error('Give the folder a name'));
    var order = st.folders.reduce(function (m, f) { return Math.max(m, f.sort_order || 0); }, 0) + 1;
    return sb().from('file_folders').insert({ household_id: hid(), name: name, icon: ic || 'folder', sort_order: order }).select('id,name,icon,sort_order').single()
      .then(function (r) {
        if (r.error) throw r.error.code === '23505' ? new Error('You already have a folder called “' + name + '”') : r.error;
        st.folders.push(r.data); return r.data;
      });
  }
  function askNewFolder() {
    var name = prompt('New folder name'); if (!name || !name.trim()) return Promise.resolve(null);
    return createFolder(name, 'folder').catch(function (e) { U().toast(e.message); return null; });
  }
  function openFolderForm(id) {
    var f = id ? folderById(id) : null, u = U(), cur = f ? f.icon : 'folder';
    var h = '<label class="field"><span>Name</span><input id="fxFName" maxlength="60" placeholder="e.g. Bank statements" value="' + (f ? u.esc(f.name) : '') + '"></label>' +
      '<div class="field"><span>Icon</span><div class="icon-pick">' + FOLDER_ICONS.map(function (k) {
        return '<label><input type="radio" name="fxFIcon" value="' + k + '"' + (k === cur ? ' checked' : '') + ' aria-label="' + k + '"><span>' + icon(k, 20) + '</span></label>';
      }).join('') + '</div></div>' +
      '<button class="btn accent block" data-fx="folder-save" data-id="' + (id || '') + '">' + (f ? 'Save' : 'Create folder') + '</button>';
    if (f) h += '<button class="btn danger-text block mt12" data-fx="folder-del" data-id="' + id + '">' + icon('trash', 18) + ' Delete folder</button>' +
      '<p class="muted small" style="text-align:center">Its files stay in Files, just not in a folder.</p>';
    u.openSheet(f ? 'Edit folder' : 'New folder', h, function (el) { var i = el.querySelector('#fxFName'); if (i && !f) setTimeout(function () { i.focus(); }, 300); });
  }
  function saveFolder(id) {
    var name = (document.getElementById('fxFName').value || '').trim(), el = document.querySelector('input[name="fxFIcon"]:checked'), ic = el ? el.value : 'folder';
    if (!name) { U().toast('Give the folder a name'); return; }
    if (!id) {
      createFolder(name, ic).then(function (f) { U().closeSheet(); U().toast('Folder created'); refresh(); go(f.id); }).catch(function (e) { U().toast(e.message); });
      return;
    }
    sb().from('file_folders').update({ name: name, icon: ic }).eq('id', id).then(function (r) {
      if (r.error) { U().toast(r.error.code === '23505' ? 'You already have a folder called “' + name + '”' : 'Save failed: ' + r.error.message); return; }
      Object.assign(folderById(id), { name: name, icon: ic }); U().closeSheet(); U().toast('Saved'); refresh();
    });
  }
  function deleteFolder(id) {
    var f = folderById(id); if (!f) return;
    var n = inFolder(id).length;
    if (!confirm('Delete the folder “' + f.name + '”?' + (n ? ' Its ' + n + ' file' + (n > 1 ? 's stay' : ' stays') + ' in Files.' : ''))) return;
    sb().from('file_folders').delete().eq('id', id).then(function (r) {
      if (r.error) { U().toast('Delete failed: ' + r.error.message); return; }
      st.folders = st.folders.filter(function (x) { return x.id !== id; });
      st.files.forEach(function (x) { if (x.folder_id === id) x.folder_id = null; });
      U().closeSheet(); U().toast('Folder deleted');
      if (st.folder === id && B().back) B().back(); else refresh();
    });
  }
  function go(folderId) {
    var b = document.createElement('button'); b.setAttribute('data-act', 'page'); b.setAttribute('data-val', 'files'); b.setAttribute('data-id', folderId);
    b.hidden = true; document.body.appendChild(b); b.click(); b.remove();
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
    if (waitingForKey(f)) return '<span class="badge fx-wait">Waiting for AI</span>';
    if (needsRetry(f)) return '<span class="badge fx-fail">' + (stuck(f) ? 'Stuck' : 'Failed') + '</span>';
    return '';
  }
  function uploadInput() { return '<input type="file" multiple class="fx-input" hidden>'; }
  function fileRow(f, showFolder) {
    var u = U(), sel = st.sel, on = sel && sel[f.id], fo = showFolder && f.folder_id && folderById(f.folder_id), ln = linkName(f);
    var sub = typeName(f.file_type) + ' · ' + fmtDate(f.as_at_date) + (fo ? ' · ' + u.esc(fo.name) : '');
    var text = waitingForKey(f) ? 'Saved. Ask Claude to “summarise my LifeCalc files” to read it.' :
      f.status === 'failed' ? (f.error || 'Couldn’t read this file') : f.summary || (f.status === 'processing' ? 'Reading the file…' : '');
    return '<div class="row fx-row' + (on ? ' fx-on' : '') + '" role="button" tabindex="0" data-fx="' + (sel ? 'toggle' : 'open') + '" data-id="' + f.id + '">' +
      (sel ? '<div class="fx-check">' + (on ? icon('check', 16) : '') + '</div>' :
        '<div class="ico t-' + (TYPE_TINT[f.file_type] || 'slate') + '">' + icon(TYPE_ICON[f.file_type] || 'tag', 20) + '</div>') +
      '<div class="main"><div class="name">' + u.esc(f.original_name) + '</div><div class="sub"><span>' + sub + '</span>' + statusBadge(f) + (f.ai_note ? '<span class="badge flag">Check</span>' : '') + '</div>' +
      '<div class="fx-sum">' + u.esc(text) + (ln ? ' · Linked: ' + u.esc(ln) : '') + '</div></div>' +
      (sel ? '' : icon('chev', 18, 'chev')) + '</div>';
  }
  function problemsBanner(list) {
    var keyWait = list.filter(waitingForKey).length, failed = list.filter(needsRetry).length;
    if (!failed) return '';
    if (keyWait === failed) return '<div class="card pad fx-banner"><b>AI reading is off</b><p class="muted small">Your ' + (keyWait > 1 ? keyWait + ' files are' : 'file is') +
      ' safely stored. To read them now, open Claude (with the LifeCalc connector) and say <b>“Summarise my LifeCalc files”</b>. Summaries and folders appear here. Or add an <code>ANTHROPIC_API_KEY</code> secret in Supabase to have every upload read automatically.</p>' +
      '<button class="btn block" data-fx="retry-all">Try again now</button></div>';
    return '<div class="card pad fx-banner"><b>' + failed + ' file' + (failed > 1 ? 's' : '') + ' couldn’t be read</b><p class="muted small">Tap a file to see why, or try them all again.</p>' +
      '<button class="btn block" data-fx="retry-all">Retry all</button></div>';
  }
  function chipsFor(list, withUnfiled) {
    var counts = { all: list.length, none: 0 };
    list.forEach(function (f) { counts[f.file_type] = (counts[f.file_type] || 0) + 1; if (!f.folder_id) counts.none++; });
    var opts = [['all', 'All']];
    if (withUnfiled && st.folders.length && counts.none && counts.none < list.length) opts.push(['none', 'Not in a folder']);
    var types = TYPES.filter(function (t) { return counts[t[0]]; });
    if (types.length > 1) opts = opts.concat(types);
    if (opts.length < 2) return '';
    return '<div class="chips">' + opts.map(function (t) {
      return '<button class="chip' + (st.filter === t[0] ? ' on' : '') + '" data-fx="filter" data-v="' + t[0] + '">' + t[1] + ' ' + counts[t[0]] + '</button>';
    }).join('') + '</div>';
  }
  function applyFilter(list) {
    if (st.filter === 'all') return list;
    if (st.filter === 'none') return list.filter(function (f) { return !f.folder_id; });
    return list.filter(function (f) { return f.file_type === st.filter; });
  }
  function folderGrid() {
    var u = U();
    if (!st.folders.length) {
      return '<div class="card pad fx-start"><b>Group your files</b><p class="muted small">Make your own folders, like Bank statements or Payslips. New uploads are filed into the right one automatically.</p>' +
        '<div class="chips wrap">' + SUGGESTED.map(function (s) { return '<button class="chip" data-fx="folder-quick" data-v="' + s[0] + '" data-icon="' + s[1] + '">+ ' + s[0] + '</button>'; }).join('') +
        '<button class="chip" data-fx="folder-new">+ Custom…</button></div></div>';
    }
    return '<div class="section-head"><h2>Folders</h2><button class="link" data-fx="folder-new">' + icon('plus', 16) + ' New</button></div>' +
      '<div class="fx-folders">' + st.folders.map(function (f) {
        var n = inFolder(f.id).length;
        return '<button class="fx-folder" data-act="page" data-val="files" data-id="' + f.id + '"><span class="ico">' + icon(f.icon || 'folder', 20) + '</span>' +
          '<b>' + u.esc(f.name) + '</b><span>' + n + ' file' + (n === 1 ? '' : 's') + '</span></button>';
      }).join('') + '</div>';
  }
  function selectBar(list) {
    if (!st.sel) return '';
    var n = Object.keys(st.sel).length;
    return '<div class="fx-selbar"><div class="fx-selbar-in"><button class="link" data-fx="sel-all">' + (n === list.length ? 'None' : 'All') + '</button><b>' + n + ' selected</b>' +
      '<button class="btn sm" data-fx="move"' + (n ? '' : ' disabled') + '>' + icon('folder', 16) + ' Move</button>' +
      '<button class="btn sm danger-text" data-fx="sel-del"' + (n ? '' : ' disabled') + ' aria-label="Delete selected">' + icon('trash', 16) + '</button></div></div>';
  }

  function render(folderId) {
    var u = U();
    if (st.folder !== (folderId || null)) { st.folder = folderId || null; st.filter = 'all'; st.sel = null; }
    var folder = folderId ? folderById(folderId) : null;
    var sx = sync() && sync().state();
    if (sx && sx.householdId && !sx.ready) {
      // Still connecting (the sign-in library loads in the background), or offline.
      var off = !navigator.onLine || sx.status === 'unavailable';
      if (!off) { clearTimeout(st.wait); st.wait = setTimeout(refresh, 800); }
      return u.top('Files', { back: true }) + '<div data-files-page></div><div class="card">' + (off ?
        u.empty('folder', 'You’re offline', 'Files are kept online for you and Zhila. Connect to the internet to see them.') :
        '<div class="pad muted"><i class="fx-spin"></i> Connecting…</div>') + '</div>';
    }
    if (!ready()) {
      return u.top('Files', { back: true }) + '<div data-files-page></div><div class="card pad"><b>Files need Live sharing</b><p class="muted small">Files are stored privately for your household (you and Zhila), so sign in under Live sharing first.</p>' +
        '<button class="btn accent block" data-act="sync">Open Live sharing</button></div>';
    }
    // Opening Files (not just re-drawing it) fetches a fresh copy, then retries files that were waiting for the AI key.
    if (!onPage()) { st.retryOnLoad = true; st.autoRetried = {}; if (!st.loading) setTimeout(load, 0); }
    else if (!st.loaded && !st.loading) load();
    if (folderId && st.loaded && !folder) return u.top('Folder', { back: true }) + '<div data-files-page></div><div class="card">' + u.empty('folder', 'Folder not found', 'It may have been deleted on another phone.') + '</div>';

    var actions = '<label class="icon-btn" aria-label="Upload files">' + icon('plus', 22) + uploadInput() + '</label>' +
      (folder ? '<button class="icon-btn" data-fx="folder-edit" data-id="' + folder.id + '" aria-label="Edit folder">' + icon('edit', 20) + '</button>' : '');
    var h = u.top(folder ? folder.name : folderId ? 'Folder' : 'Files', { back: true, actions: actions, sub: folder ? 'Folder' : '' });
    h += '<div data-files-page' + (st.sel ? ' class="fx-selecting"' : '') + '></div>';
    h += '<label class="btn accent block fx-upload">' + icon('upload', 18) + (folder ? ' Upload to ' + u.esc(folder.name) : ' Upload files') + uploadInput() + '</label>';
    h += '<p class="muted small fx-hint">' + (folder ? 'Pick as many as you like: statements, CSVs, screenshots, PDFs. Up to 20 MB each.' :
      'Pick as many as you like, up to 20 MB each. Each one gets a short AI summary' + (st.folders.length ? ' and is filed into the right folder.' : '.')) + '</p>';
    if (st.upTotal) h += '<div class="fx-uploading"><i class="fx-spin"></i>Uploading ' + Math.min(st.upDone + 1, st.upTotal) + ' of ' + st.upTotal + '…</div>';
    if (st.err) return h + '<div class="card pad neg">Couldn’t load files: ' + u.esc(st.err) + '</div>';
    if (!st.loaded) return h + '<div class="card pad muted">Loading…</div>';

    var scope = folder ? inFolder(folder.id) : st.files;
    h += problemsBanner(scope);
    if (!folder) h += folderGrid();
    var list = applyFilter(scope);
    h += '<div class="section-head fx-list-head"><h2>' + (folder ? 'In this folder' : 'All files') + '</h2>' +
      (scope.length ? '<button class="link" data-fx="' + (st.sel ? 'sel-done' : 'select') + '">' + (st.sel ? 'Done' : 'Select') + '</button>' : '') + '</div>';
    h += chipsFor(scope, !folder);
    if (!list.length) h += '<div class="card">' + u.empty('upload', scope.length ? 'Nothing here' : folder ? 'This folder is empty' : 'No files yet',
      folder ? 'Upload files here, or tap Select in All files to move some in.' : 'Upload a statement, CSV, screenshot or bill.') + '</div>';
    else h += '<div class="list">' + list.map(function (f) { return fileRow(f, !folder); }).join('') + '</div>';
    h += selectBar(list);
    schedulePoll();
    return h;
  }

  // ---------- Move sheet (one file or a selection) ----------
  function openMove(ids) {
    var u = U(), cur = ids.length === 1 ? (byId(ids[0]) || {}).folder_id || '' : null;
    var opt = function (id, name, ic) {
      return '<button class="row fx-move' + (cur === id ? ' fx-on' : '') + '" data-fx="move-to" data-v="' + id + '"><div class="ico">' + icon(ic, 20) + '</div><div class="main"><div class="name">' + u.esc(name) + '</div></div>' +
        (cur === id ? icon('check', 18) : '') + '</button>';
    };
    var h = '<div class="list" data-ids="' + ids.join(',') + '" id="fxMove">' + st.folders.map(function (f) { return opt(f.id, f.name, f.icon || 'folder'); }).join('') +
      opt('', 'Not in a folder', 'close') + '</div><button class="btn block mt12" data-fx="move-new">' + icon('plus', 18) + ' New folder</button>';
    u.openSheet('Move ' + (ids.length === 1 ? 'file' : ids.length + ' files') + ' to…', h);
  }
  function moveIds() { var el = document.getElementById('fxMove'); return el ? el.getAttribute('data-ids').split(',').filter(Boolean) : []; }
  function doMove(ids, folderId) {
    moveFiles(ids, folderId).then(function () {
      var f = folderById(folderId);
      U().closeSheet(); U().toast((ids.length === 1 ? 'Moved' : ids.length + ' files moved') + (f ? ' to ' + f.name : ' out of the folder'));
      st.sel = null; refresh();
    }).catch(function (e) { U().toast('Move failed: ' + e.message); });
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
  function folderOptions(f) {
    var u = U(), cur = f.folder_id || '';
    return '<option value=""' + (cur ? '' : ' selected') + '>Not in a folder</option>' + st.folders.map(function (x) {
      return '<option value="' + x.id + '"' + (x.id === cur ? ' selected' : '') + '>' + u.esc(x.name) + '</option>';
    }).join('') + '<option value="__new">+ New folder…</option>';
  }
  function fillDetail(id) {
    var el = document.getElementById('fxDetail'), f = byId(id), u = U();
    if (!el || !f) return;
    var keepPrev = el.querySelector('#fxPrev'), busy = f.status === 'processing' && !stuck(f);
    var h = '<div class="fx-preview" id="fxPrev"><span class="muted small">Loading preview…</span></div>';
    h += '<div class="card pad mt12"><div class="fx-meta">' + typeName(f.file_type) + ' · as at ' + fmtDate(f.as_at_date) + ' · ' + kb(f.size_bytes) + '</div>';
    if (busy) h += '<p class="muted"><i class="fx-spin"></i> Reading the file. This usually takes under a minute.</p>';
    else if (waitingForKey(f)) h += '<p class="muted">Saved. To read it, ask Claude (with the LifeCalc connector): “Summarise my LifeCalc files”.</p><button class="btn block" data-fx="retry" data-id="' + id + '">Try again</button>';
    else if (needsRetry(f)) h += '<p class="neg">' + u.esc(f.error || 'This is taking too long.') + '</p><button class="btn block" data-fx="retry" data-id="' + id + '">Retry</button>';
    else h += '<p class="fx-summary">' + u.esc(f.summary || 'No summary.') + '</p>';
    if (f.ai_note) h += '<div class="note fx-note"><b>Check:</b> ' + u.esc(f.ai_note) + '<br><span class="muted small">Nothing in your budget was changed.</span></div>';
    h += '</div>';
    h += '<div class="card pad mt12"><label class="field"><span>Folder</span><select id="fxFolder">' + folderOptions(f) + '</select></label>' +
      '<label class="field"><span>As at</span><input type="date" id="fxDate" value="' + (f.as_at_date || '') + '"></label>' +
      '<label class="field"><span>Type</span><select id="fxType">' + TYPES.map(function (t) { return '<option value="' + t[0] + '"' + (t[0] === f.file_type ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>Linked to</span><select id="fxLink">' + linkOptions(f) + '</select></label>' +
      '<button class="btn accent block" data-fx="save" data-id="' + id + '">Save changes</button></div>';
    h += '<div class="btn-row mt12"><button class="btn" data-fx="download" data-id="' + id + '">' + icon('download', 18) + ' Download</button>' +
      (!busy && f.status === 'ready' ? '<button class="btn" data-fx="retry" data-id="' + id + '">Re-read</button>' : '') + '</div>';
    h += '<button class="btn danger-text block mt12" data-fx="delete" data-id="' + id + '">' + icon('trash', 18) + ' Delete file</button>';
    // Keep the loaded preview when the sheet refreshes (polling), so a PDF doesn't reload every few seconds.
    var prevHtml = keepPrev && keepPrev.getAttribute('data-done') ? keepPrev.outerHTML : null;
    el.innerHTML = h;
    if (prevHtml) el.querySelector('#fxPrev').outerHTML = prevHtml; else preview(f);
  }
  function preview(f) {
    var box = document.getElementById('fxPrev'), u = U(); if (!box) return;
    var m = (f.mime_type || '').toLowerCase(), n = f.original_name.toLowerCase();
    var isImg = /^image\/(png|jpe?g|gif|webp)$/.test(m) || /\.(png|jpe?g|gif|webp)$/.test(n);
    var isPdf = m === 'application/pdf' || /\.pdf$/.test(n);
    var isText = /^text\/|csv/.test(m) || /\.(csv|tsv|txt|ofx|qif)$/.test(n);
    var done = function () { box.setAttribute('data-done', '1'); };
    if (!isImg && !isPdf && !isText) { box.innerHTML = '<span class="muted small">No preview for this file type. Use Download.</span>'; done(); return; }
    signedUrl(f).then(function (url) {
      if (!document.getElementById('fxPrev')) return;
      if (isImg) box.innerHTML = '<img src="' + url + '" alt="">';
      else if (isPdf) box.innerHTML = '<iframe src="' + url + '#view=FitH" title="PDF preview"></iframe><a class="link" href="' + url + '" target="_blank" rel="noopener">Open full PDF</a>';
      else return fetch(url).then(function (r) { return r.text(); }).then(function (t) { box.innerHTML = '<pre>' + u.esc(t.slice(0, 4000)) + (t.length > 4000 ? '\n…' : '') + '</pre>'; done(); });
      done();
    }).catch(function () { box.innerHTML = '<span class="muted small">Preview unavailable offline.</span>'; });
  }
  function save(id) {
    var f = byId(id); if (!f) return;
    var link = document.getElementById('fxLink').value, folder = document.getElementById('fxFolder').value, upd = {
      as_at_date: document.getElementById('fxDate').value || null,
      file_type: document.getElementById('fxType').value,
      linked_item_id: link.indexOf('item:') === 0 ? link.slice(5) : null,
      linked_asset_id: link.indexOf('asset:') === 0 ? link.slice(6) : null,
      folder_id: folder && folder !== '__new' ? folder : null
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
    var b = e.target.closest && e.target.closest('[data-fx]'); if (!b || b.disabled) return;
    var a = b.getAttribute('data-fx'), id = b.getAttribute('data-id'), v = b.getAttribute('data-v');
    if (a === 'filter') { st.filter = v; refresh(); }
    else if (a === 'open') open(id);
    else if (a === 'retry') retry(id);
    else if (a === 'retry-all') retryAll();
    else if (a === 'save') save(id);
    else if (a === 'download') download(id);
    else if (a === 'delete') remove(id);
    else if (a === 'folder-new') openFolderForm(null);
    else if (a === 'folder-edit') openFolderForm(id);
    else if (a === 'folder-save') saveFolder(id);
    else if (a === 'folder-del') deleteFolder(id);
    else if (a === 'folder-quick') createFolder(v, b.getAttribute('data-icon')).then(function () { U().toast('Folder “' + v + '” added'); refresh(); }).catch(function (er) { U().toast(er.message); });
    else if (a === 'select') { st.sel = {}; refresh(); }
    else if (a === 'sel-done') { st.sel = null; refresh(); }
    else if (a === 'toggle') { if (st.sel[id]) delete st.sel[id]; else st.sel[id] = true; refresh(); }
    else if (a === 'sel-all') {
      var scope = applyFilter(st.folder ? inFolder(st.folder) : st.files);
      st.sel = Object.keys(st.sel).length === scope.length ? {} : scope.reduce(function (m, f) { m[f.id] = true; return m; }, {}); refresh();
    }
    else if (a === 'move') openMove(Object.keys(st.sel));
    else if (a === 'move-to') doMove(moveIds(), v);
    else if (a === 'move-new') { var ids = moveIds(); askNewFolder().then(function (f) { if (f) doMove(ids, f.id); }); }
    else if (a === 'sel-del') {
      var del = Object.keys(st.sel);
      if (!del.length || !confirm('Delete ' + del.length + ' file' + (del.length > 1 ? 's' : '') + '? This can’t be undone.')) return;
      removeFiles(del).then(function () { st.sel = null; U().toast('Deleted ' + del.length); refresh(); }).catch(function (er) { U().toast('Delete failed: ' + er.message); });
    }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.classList && t.classList.contains('fx-input')) { uploadMany(t.files, st.folder); t.value = ''; }
    else if (t.id === 'fxFolder' && t.value === '__new') {
      var d = document.getElementById('fxDetail'), f = d && byId(d.getAttribute('data-id'));
      askNewFolder().then(function (nf) {
        var sel = document.getElementById('fxFolder'); if (!sel) return;
        sel.innerHTML = folderOptions(f || {}); sel.value = nf ? nf.id : (f && f.folder_id) || '';
      });
    }
  });

  root.HF = Object.assign(root.HF || {}, { files: { render: render, load: load, count: function () { return st.loaded ? st.files.length : null; }, _state: st } });
})(typeof window !== 'undefined' ? window : globalThis);
