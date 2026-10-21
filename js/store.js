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
    this.persist(false);
    // synchronizacja między kartami przeglądarki
    window.addEventListener('storage', e => {
      if (e.key === this.KEY && e.newValue) { this.state = JSON.parse(e.newValue); this.emit(); }
    });
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
    this.persist();
  },
  getRollingDays(offset = 0) {
    const today = D.today();
    const baseMonday = D.weekStart(today);
    const completed = new Set(this.state.completedDays || []);

    let firstActive = baseMonday;
    while (completed.has(firstActive)) {
      firstActive = D.addDays(firstActive, 1);
    }

    const start = D.addDays(firstActive, offset * 7);
    const days = [0, 1, 2, 3, 4, 5, 6].map(i => D.addDays(start, i));
    return { firstActive, start, days, baseMonday };
  },

  /** Usuwa jednorazowe zadania zrobione ponad 60 dni temu – żeby lista nie puchła. */
  cleanup() {
    const limit = D.addDays(D.today(), -60);
    this.state.tasks = this.state.tasks.filter(t => !(t.done && !t.recur && t.doneAt && t.doneAt < limit));
  },

  persist(emit = true) {
    this.state.updatedAt = Date.now();
    localStorage.setItem(this.KEY, JSON.stringify(this.state));
    if (emit) this.emit();
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
  remove(id) { this.state.tasks = this.state.tasks.filter(t => t.id !== id); this.persist(); },

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

  set(key, val) { this.state[key] = val; this.persist(); },

  /* ---- import / eksport ---- */
  exportJSON() { return JSON.stringify(this.state, null, 2); },
  importJSON(obj) {
    if (!obj || !Array.isArray(obj.tasks) || !Array.isArray(obj.roles)) throw new Error('Nieprawidłowy plik');
    this.state = obj; this.persist();
  },
  reset() { this.state = Seed.build(); this.persist(); },
};
