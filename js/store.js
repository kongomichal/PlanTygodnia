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
    try { localStorage.setItem(this.KEY, JSON.stringify(this.state)); } catch (e) {}
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

  persist(emit = true, syncCloud = true, immediate = false) {
    this.state.updatedAt = Date.now();
    try { localStorage.setItem(this.KEY, JSON.stringify(this.state)); } catch (e) { console.warn(e); }
    if (emit) this.emit();
    const sync = (typeof Sync !== 'undefined' ? Sync : window.Sync);
    if (syncCloud && sync && typeof sync.pushToCloud === 'function') {
      sync.pushToCloud(immediate);
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
  add(p) { const t = this.make(p); this.state.tasks.unshift(t); this.persist(true, true, true); return t; },
  addMany(list) { list.forEach(p => this.state.tasks.unshift(this.make(p))); this.persist(true, true, true); },
  update(id, patch) {
    const t = this.get(id); if (!t) return null;
    Object.assign(t, patch, { updatedAt: Date.now() }); this.persist(true, true, true); return t;
  },
  updateMany(ids, patch) {
    ids.forEach(id => { const t = this.get(id); if (t) Object.assign(t, patch, { updatedAt: Date.now() }); });
    this.persist(true, true, true);
  },
  replace(task) {
    const i = this.state.tasks.findIndex(t => t.id === task.id);
    if (i >= 0) this.state.tasks[i] = task; else this.state.tasks.unshift(task);
    this.persist(true, true, true);
  },
  remove(id) { this.state.tasks = this.state.tasks.filter(t => t.id !== id); this.persist(true, true, true); },

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
    this.state = obj;
    this.persist(true, true);
    if (window.Sync && typeof window.Sync.pushToCloud === 'function') {
      window.Sync.pushToCloud(true);
    }
  },
  reset() { this.state = Seed.build(); this.persist(true, true); },
};

window.Store = Store;
