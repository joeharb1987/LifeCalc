/* LifeCalc Budget — live sharing between household members (Supabase).
   The whole budget is one JSON document per household. Each phone keeps working offline;
   changes are saved with a version number and merged record-by-record if both phones edited. */
(function (root) {
  'use strict';
  var URL = 'https://qfcislqcszymihvyjrud.supabase.co';
  var KEY = 'sb_publishable_3Urb12GywQQyZwq1pwqRzw_kn9Oz7Vd';   // publishable: safe in the browser, data is protected by row-level security
  var LKEY = 'lifecalc_sync_v1', BKEY = 'lifecalc_sync_base_v1';
  var APP_URL = 'https://joeharb1987.github.io/LifeCalc/budget/';
  // Settings that stay per phone (each person's name, view, theme, open tab).
  var LOCAL_ONLY = ['tab', 'theme', 'view', 'userName', 'expView', 'mode'];
  var COLLECTIONS = ['categories', 'items', 'accounts', 'transactions', 'rules', 'debts', 'assets', 'assetCats'];

  var sb = null, session = null, channel = null, timer = null, applying = false, pending = false;
  var status = 'off', lastSync = null, st = read(LKEY) || {};

  function read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function write(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function app() { return root.LCBudget; }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function setStatus(s) { status = s; if (app() && app().syncChanged) app().syncChanged(); }
  function active() { return !!(sb && session && st.householdId); }

  function shareable(S) { var d = clone(S); d.settings = d.settings || {}; LOCAL_ONLY.forEach(function (k) { delete d.settings[k]; }); return d; }

  // Three-way merge: start from the server copy, then re-apply what this phone changed since the last sync.
  function merge(base, local, remote) {
    if (!base) return remote;
    var out = clone(remote);
    COLLECTIONS.forEach(function (key) {
      var b = index(base[key]), l = index(local[key]), list = (out[key] || []).slice();
      Object.keys(l).forEach(function (id) {
        if (!b[id]) { if (!list.some(function (x) { return x.id === id; })) list.push(l[id]); }      // added here
        else if (!same(l[id], b[id])) list = list.map(function (x) { return x.id === id ? l[id] : x; }); // edited here
      });
      Object.keys(b).forEach(function (id) { if (!l[id]) list = list.filter(function (x) { return x.id !== id; }); }); // deleted here
      out[key] = list;
    });
    var bs = base.settings || {}, ls = local.settings || {};
    out.settings = out.settings || {};
    Object.keys(ls).forEach(function (k) { if (!same(ls[k], bs[k])) out.settings[k] = ls[k]; });
    return out;
  }
  function index(list) { var m = {}; (list || []).forEach(function (x) { if (x && x.id != null) m[x.id] = x; }); return m; }

  function applyData(data, version) {
    applying = true;
    app().replace(data, LOCAL_ONLY);
    applying = false;
    st.version = version; write(LKEY, st); write(BKEY, data);
  }

  function pull() {
    if (!active()) return Promise.resolve();
    setStatus('syncing');
    return sb.from('households').select('data,version,invite_code,name').eq('id', st.householdId).single().then(function (r) {
      if (r.error) { setStatus(navigator.onLine ? 'error' : 'offline'); return; }
      st.invite = r.data.invite_code; st.name = r.data.name;
      if (r.data.version === st.version) { write(LKEY, st); return pending ? push() : done(); }
      var remote = r.data.data || {};
      if (pending) {
        var merged = merge(read(BKEY), shareable(app().get()), remote);
        applyData(merged, r.data.version); write(BKEY, remote);
        return push();
      }
      applyData(remote, r.data.version);
      done();
    });
  }
  function done() { lastSync = new Date(); setStatus('synced'); }

  function push() {
    if (!active()) return Promise.resolve();
    clearTimeout(timer);
    var data = shareable(app().get());
    setStatus('saving');
    return sb.rpc('save_household', { p_id: st.householdId, p_data: data, p_version: st.version }).then(function (r) {
      if (r.error) { setStatus(navigator.onLine ? 'error' : 'offline'); return; }
      if (r.data === -1) return pull();                       // the other phone saved first: merge, then save again
      pending = false; st.version = r.data; write(LKEY, st); write(BKEY, data); done();
    });
  }

  function changed() {
    if (applying || !active()) return;
    pending = true; setStatus('saving');
    clearTimeout(timer); timer = setTimeout(push, 1200);
  }

  function live() {
    stopLive();
    if (!active()) return;
    channel = sb.channel('household-' + st.householdId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'households', filter: 'id=eq.' + st.householdId }, function (p) {
        if (p.new && p.new.version !== st.version) pull();
      })
      .subscribe();
  }
  function stopLive() { if (channel && sb) { sb.removeChannel(channel); } channel = null; }

  function init() {
    if (sb) return;
    if (!root.supabase || !root.supabase.createClient) { status = 'unavailable'; return; }
    sb = root.supabase.createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'lifecalc-auth' } });
    sb.auth.onAuthStateChange(function (ev, s) { session = s; if (!s) stopLive(); setStatus(active() ? status : 'off'); });
    sb.auth.getSession().then(function (r) {
      session = r.data.session;
      if (active()) { pending = !!st.pending; pull().then(live); } else setStatus('off');
    });
    root.addEventListener('online', function () { if (active()) pull(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && active()) pull(); });
    root.addEventListener('pagehide', function () { st.pending = pending; write(LKEY, st); });
  }

  // ---------- Account & household actions ----------
  function signUp(email, password) {
    return sb.auth.signUp({ email: email, password: password, options: { emailRedirectTo: APP_URL } }).then(function (r) {
      if (r.error) throw r.error;
      session = r.data.session;
      return session ? 'signed-in' : 'confirm';
    });
  }
  function signIn(email, password) {
    return sb.auth.signInWithPassword({ email: email, password: password }).then(function (r) {
      if (r.error) throw r.error;
      session = r.data.session;
      // Already in a household (e.g. a new phone)? Find it.
      return sb.from('household_members').select('household_id').eq('user_id', session.user.id).limit(1).then(function (m) {
        return m.data && m.data[0] ? m.data[0].household_id : null;
      });
    });
  }
  function useHousehold(id) {
    return sb.from('households').select('id,data,version,invite_code,name').eq('id', id).single().then(function (r) {
      if (r.error) throw r.error;
      st = { householdId: r.data.id, version: r.data.version, invite: r.data.invite_code, name: r.data.name };
      applyData(r.data.data, r.data.version); pending = false; live(); done();
    });
  }
  function start(name) {
    var data = shareable(app().get());
    return sb.rpc('create_household', { p_name: name, p_data: data }).then(function (r) {
      if (r.error) throw r.error;
      st = { householdId: r.data.id, version: r.data.version, invite: r.data.invite_code, name: r.data.name };
      write(LKEY, st); write(BKEY, data); pending = false; live(); done();
    });
  }
  function join(code) {
    return sb.rpc('join_household', { p_code: code }).then(function (r) {
      if (r.error) throw r.error;
      st = { householdId: r.data.id, version: r.data.version, invite: r.data.invite_code, name: r.data.name };
      applyData(r.data.data, r.data.version); pending = false; live(); done();
    });
  }
  function members() {
    if (!active()) return Promise.resolve([]);
    return sb.from('household_members').select('email,role').eq('household_id', st.householdId).then(function (r) { return r.data || []; });
  }
  function signOut() {
    stopLive(); st = {}; pending = false; write(LKEY, null); write(BKEY, null);
    return sb ? sb.auth.signOut().then(function () { session = null; setStatus('off'); }) : Promise.resolve();
  }

  function label() {
    if (status === 'unavailable') return 'Needs internet';
    if (!session) return 'Off';
    if (!st.householdId) return 'Signed in · not sharing yet';
    return { syncing: 'Syncing…', saving: 'Saving…', offline: 'Offline · will sync later', error: 'Couldn’t sync · will retry' }[status] ||
      ('On · ' + (lastSync ? 'synced ' + ago(lastSync) : 'connected'));
  }
  function ago(d) { var s = Math.round((Date.now() - d) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : Math.round(s / 3600) + ' h ago'; }

  root.HF = Object.assign(root.HF || {}, {
    sync: {
      init: init, changed: changed, pull: pull, label: label, signUp: signUp, signIn: signIn, signOut: signOut, start: start, join: join,
      useHousehold: useHousehold, members: members, merge: merge,
      state: function () { return { ready: !!sb, signedIn: !!session, email: session && session.user.email, householdId: st.householdId, invite: st.invite, name: st.name, status: status, appUrl: APP_URL }; }
    }
  });
  if (root.supabase) init();
})(typeof window !== 'undefined' ? window : globalThis);
