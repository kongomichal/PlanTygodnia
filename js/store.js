'use strict';

/**
 * Warstwa danych. Teraz: localStorage.
 * Później: wystarczy podmienić `persist()` / `init()` na adapter Firestore
 * (dokument users/{uid} z polami roles, tasks, lastReview) – reszta aplikacji
 * korzysta wyłącznie z metod tego obiektu.
 */
const Store = {
  KEY: 'kompas.v1',
  state: null,
  subs: new Set(),

  init() {
    try { const raw = localStorage.getItem(this.KEY); if (raw) this.state = JSON.parse(raw); } catch (e) { console.warn(e); }
    if (!this.state || !Array.isArray(this.state.tasks)) this.state = Seed.build();
    if (!Array.isArray(this.state.completedDays)) this.state.completedDays = [];
    this.cleanup();
    this.rebaseline();
    try { localStorage.setItem(this.KEY, JSON.stringify(this.state)); } catch (e) {}
    // synchronizacja między kartami przeglądarki
    window.addEventListener('storage', e => {
      if (e.key === this.KEY && e.newValue) { this.state = JSON.parse(e.newValue); this.rebaseline(); this.emit(); }
    });
  },

  /* ---- śledzenie zmian per element (podstawa bezpiecznej synchronizacji) ---- */
  _fp(item) { const c = { ...item }; delete c.updatedAt; return JSON.stringify(c); },
  baseline: { task: {}, role: {} },
  rebaseline() {
    const s = this.state;
    this.baseline = { task: {}, role: {} };
    (s.tasks || []).forEach(t => { this.baseline.task[t.id] = this._fp(t); });
    (s.roles || []).forEach(r => { this.baseline.role[r.id] = this._fp(r); });
  },
  /** Oznacza zmienione elementy znacznikiem czasu i zapisuje usunięcia jako „nagrobki”. */
  stamp() {
    const s = this.state, now = Date.now();
    if (!s.deleted) s.deleted = {};
    [['task', s.tasks || []], ['role', s.roles || []]].forEach(([kind, list]) => {
      const base = this.baseline[kind], seen = {};
      list.forEach(it => {
        seen[it.id] = true;
        const fp = this._fp(it);
        if (base[it.id] !== fp) { it.updatedAt = now; base[it.id] = fp; }
      });
      Object.keys(base).forEach(id => {
        if (!seen[id]) { s.deleted[kind + ':' + id] = now; delete base[id]; }
      });
    });
  },
  _stampOf(it) { return it.updatedAt || it.createdAt || 0; },
  _mergeItems(kind, la, lb, tombs) {
    const map = new Map();
    [...(la || []), ...(lb || [])].forEach(it => {
      const cur = map.get(it.id);
      if (!cur) { map.set(it.id, it); return; }
      const sa = this._stampOf(cur), sb = this._stampOf(it);
      if (sb > sa || (sb === sa && JSON.stringify(it) > JSON.stringify(cur))) map.set(it.id, it);
    });
    return [...map.values()].filter(it => {
      const ts = tombs[kind + ':' + it.id];
      return !(ts && ts >= this._stampOf(it));
    });
  },
  /** Przemienne scalanie dwóch stanów – nic nie ginie, wygrywa nowsza zmiana danego elementu. */
  merge(a, b) {
    if (!b) return a;
    if (!a) return b;
    const out = { ...b, ...a };
    const limit = Date.now() - 90 * 864e5;
    const tombs = {};
    [b.deleted, a.deleted].forEach(d => Object.keys(d || {}).forEach(k => {
      if (d[k] > (tombs[k] || 0)) tombs[k] = d[k];
    }));
    Object.keys(tombs).forEach(k => { if (tombs[k] < limit) delete tombs[k]; });
    out.deleted = tombs;
    out.tasks = this._mergeItems('task', a.tasks, b.tasks, tombs);
    out.roles = this._mergeItems('role', a.roles, b.roles, tombs);

    // pojedyncze ustawienia (autoRollover, lastReview…)
    const fa = a.fieldStamps || {}, fb = b.fieldStamps || {};
    out.fieldStamps = {};
    new Set([...Object.keys(fa), ...Object.keys(fb)]).forEach(k => {
      const winB = (fb[k] || 0) > (fa[k] || 0);
      out[k] = winB ? b[k] : a[k];
      out.fieldStamps[k] = Math.max(fa[k] || 0, fb[k] || 0);
    });

    // ukończone dni
    const da = a.dayStamps || {}, db = b.dayStamps || {};
    const ca = new Set(a.completedDays || []), cb = new Set(b.completedDays || []);
    out.dayStamps = {};
    const days = new Set([...ca, ...cb, ...Object.keys(da), ...Object.keys(db)]);
    const done = [];
    days.forEach(d => {
      const ta = da[d] || 0, tb = db[d] || 0;
      const on = ta > tb ? ca.has(d) : tb > ta ? cb.has(d) : (ca.has(d) || cb.has(d));
      if (on) done.push(d);
      if (ta || tb) out.dayStamps[d] = Math.max(ta, tb);
    });
    out.completedDays = done.sort();

    // cele tygodnia
    const wa = a.weekGoalStamps || {}, wb = b.weekGoalStamps || {};
    const ga = a.weekGoals || {}, gb = b.weekGoals || {};
    out.weekGoals = {}; out.weekGoalStamps = {};
    new Set([...Object.keys(ga), ...Object.keys(gb)]).forEach(k => {
      const ta = wa[k] || 0, tb = wb[k] || 0;
      let v;
      if (tb > ta) v = gb[k]; else if (ta > tb) v = ga[k];
      else v = (ga[k] || '') >= (gb[k] || '') ? ga[k] : gb[k];
      out.weekGoals[k] = v === undefined ? '' : v;
      if (ta || tb) out.weekGoalStamps[k] = Math.max(ta, tb);
    });

    out.createdAt = Math.min(a.createdAt || Infinity, b.createdAt || Infinity);
    if (!isFinite(out.createdAt)) out.createdAt = Date.now();
    out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
    return out;
  },
  /** Podpis stanu do porównań (niezależny od kolejności i znaczników globalnych). */
  sig(s) {
    const c = { ...s }; delete c.updatedAt;
    c.tasks = [...(c.tasks || [])].sort((x, y) => (x.id > y.id ? 1 : -1));
    c.roles = [...(c.roles || [])].sort((x, y) => (x.id > y.id ? 1 : -1));
    const norm = v => Array.isArray(v) ? v.map(norm)
      : (v && typeof v === 'object') ? Object.keys(v).sort().reduce((o, k) => (o[k] = norm(v[k]), o), {}) : v;
    return JSON.stringify(norm(c));
  },

  /* ---- ukończone dni i płynne okno 7 dni ---- */
  isDayCompleted(dateStr) {
    return Array.isArray(this.state.completedDays) && this.state.completedDays.includes(dateStr);
  },
  toggleDayCompleted(dateStr) {
    if (!Array.isArray(this.state.completedDays)) this.state.completedDays = [];
    const idx = this.state.completedDays.indexOf(dateStr);
    if (idx >= 0) {
      this.state.completedDays.splice(idx, 1);
    } else {
      this.state.completedDays.push(dateStr);
    }
    if (!this.state.dayStamps) this.state.dayStamps = {};
    this.state.dayStamps[dateStr] = Date.now();
    this.persist();
  },
  getWeekDays(offset = 0) {
    const today = D.today();
    const monday = D.addDays(D.weekStart(today), offset * 7);
    return [0, 1, 2, 3, 4, 5, 6].map(i => D.addDays(monday, i));
  },
  getWeekGoal(ws) {
    if (!this.state.weekGoals) this.state.weekGoals = {};
    return this.state.weekGoals[ws] || '';
  },
  setWeekGoal(ws, goal) {
    if (!this.state.weekGoals) this.state.weekGoals = {};
    this.state.weekGoals[ws] = goal;
    if (!this.state.weekGoalStamps) this.state.weekGoalStamps = {};
    this.state.weekGoalStamps[ws] = Date.now();
    this.persist();
  },
  getRollingDays(offset = 0) {
    const today = D.today();
    const baseMonday = D.weekStart(today);
    const completed = new Set(this.state.completedDays || []);

    // Znajdź pierwszy nieukończony dzień począwszy od początku bieżącego tygodnia
    let cur = baseMonday;
    while (completed.has(cur)) {
      cur = D.addDays(cur, 1);
    }
    const firstActive = cur;

    if (offset === 0) {
      const days = [];
      let scan = firstActive;
      while (days.length < 7) {
        if (!completed.has(scan)) {
          days.push(scan);
        }
        scan = D.addDays(scan, 1);
      }
      return { firstActive, start: days[0], days, baseMonday };
    } else if (offset > 0) {
      let scan = firstActive;
      let skipped = 0;
      const targetSkip = offset * 7;
      while (skipped < targetSkip) {
        if (!completed.has(scan)) {
          skipped++;
        }
        scan = D.addDays(scan, 1);
      }
      const days = [];
      while (days.length < 7) {
        if (!completed.has(scan)) {
          days.push(scan);
        }
        scan = D.addDays(scan, 1);
      }
      return { firstActive, start: days[0], days, baseMonday };
    } else {
      const start = D.addDays(firstActive, offset * 7);
      const days = [0, 1, 2, 3, 4, 5, 6].map(i => D.addDays(start, i));
      return { firstActive, start, days, baseMonday };
    }
  },

  /** Usuwa jednorazowe zadania zrobione ponad 60 dni temu – żeby lista nie puchła. */
  cleanup() {
    const limit = D.addDays(D.today(), -60);
    this.state.tasks = this.state.tasks.filter(t => !(t.done && !t.recur && t.doneAt && t.doneAt < limit));
  },

  persist(emit = true, syncCloud = true) {
    this.stamp();
    this.state.updatedAt = Date.now();
    try { localStorage.setItem(this.KEY, JSON.stringify(this.state)); } catch (e) { console.warn(e); }
    if (emit) this.emit();
    const sync = (typeof Sync !== 'undefined' ? Sync : window.Sync);
    if (syncCloud && sync && typeof sync.pushToCloud === 'function') {
      sync.pushToCloud();
    }
  },
  emit() { this.subs.forEach(f => f()); },
  subscribe(f) { this.subs.add(f); },

  /* ---- zadania ---- */
  get(id) { return this.state.tasks.find(t => t.id === id); },
  make(p) {
    return {
      id: uid(), title: '', notes: '', checklist: [], roleId: null, priority: 2, q: null, date: null, recur: null,
      inbox: false, done: false, doneAt: null, focus: null, rock: null, history: [], createdAt: Date.now(), ...p,
    };
  },
  add(p) { const t = this.make(p); this.state.tasks.unshift(t); this.persist(); return t; },
  addMany(list) { list.forEach(p => this.state.tasks.unshift(this.make(p))); this.persist(); },
  update(id, patch) {
    const t = this.get(id); if (!t) return null;
    Object.assign(t, patch, { updatedAt: Date.now() }); this.persist(); return t;
  },
  updateMany(ids, patch) {
    ids.forEach(id => { const t = this.get(id); if (t) Object.assign(t, patch, { updatedAt: Date.now() }); });
    this.persist();
  },
  replace(task) {
    const i = this.state.tasks.findIndex(t => t.id === task.id);
    if (i >= 0) this.state.tasks[i] = task; else this.state.tasks.unshift(task);
    this.persist();
  },
  remove(id) {
    const sId = String(id);
    this.state.tasks = this.state.tasks.filter(t => String(t.id) !== sId);
    this.persist();
  },

  /* ---- role ---- */
  role(id) { return this.state.roles.find(r => r.id === id); },
  saveRole(r) {
    const i = this.state.roles.findIndex(x => x.id === r.id);
    if (i >= 0) this.state.roles[i] = r; else this.state.roles.push({ ...r, id: r.id || 'r_' + uid() });
    this.persist();
  },
  removeRole(id) {
    this.state.roles = this.state.roles.filter(r => r.id !== id);
    this.state.tasks.forEach(t => { if (t.roleId === id) t.roleId = null; });
    this.persist();
  },

  set(key, val) {
    this.state[key] = val;
    if (!this.state.fieldStamps) this.state.fieldStamps = {};
    this.state.fieldStamps[key] = Date.now();
    this.persist();
  },

  /* ---- import / eksport ---- */
  exportJSON() { return JSON.stringify(this.state, null, 2); },
  importJSON(obj) {
    if (!obj || !Array.isArray(obj.tasks) || !Array.isArray(obj.roles)) throw new Error('Nieprawidłowy plik');
    // import = zastąpienie danych: stare elementy dostają nagrobki, nowe – świeże znaczniki
    const old = this.state, now = Date.now() - 2;
    obj.deleted = { ...(old.deleted || {}), ...(obj.deleted || {}) };
    const keep = new Set([...(obj.tasks || []).map(t => 'task:' + t.id), ...(obj.roles || []).map(r => 'role:' + r.id)]);
    (old.tasks || []).forEach(t => { if (!keep.has('task:' + t.id)) obj.deleted['task:' + t.id] = now; });
    (old.roles || []).forEach(r => { if (!keep.has('role:' + r.id)) obj.deleted['role:' + r.id] = now; });
    this.state = obj;
    this.baseline = { task: {}, role: {} };
    this.persist(true, true);
  },
  reset() {
    const old = this.state, now = Date.now() - 2, fresh = Seed.build();
    fresh.deleted = { ...(old.deleted || {}) };
    (old.tasks || []).forEach(t => { fresh.deleted['task:' + t.id] = now; });
    (old.roles || []).forEach(r => { fresh.deleted['role:' + r.id] = now; });
    this.state = fresh;
    this.baseline = { task: {}, role: {} };
    this.persist(true, true);
  },
};

window.Store = Store;
