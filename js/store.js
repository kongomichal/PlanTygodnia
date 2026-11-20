'use strict';

const Store = {
  KEY: 'kompas_v2_clean',
  state: null,
  subs: new Set(),

  init() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) this.state = JSON.parse(raw);
    } catch (e) {}

    if (!this.state || !Array.isArray(this.state.roles) || this.state.roles.length !== 4) {
      this.state = Seed.build();
    } else {
      this.normalizeState(this.state);
    }

    this.rebaseline();
    try { localStorage.setItem(this.KEY, JSON.stringify(this.state)); } catch (e) {}

    window.addEventListener('storage', e => {
      if (e.key === this.KEY && e.newValue) {
        try {
          this.state = JSON.parse(e.newValue);
          this.normalizeState(this.state);
          this.rebaseline();
          this.emit();
        } catch (err) {}
      }
    });
  },

  normalizeState(s) {
    const def = Seed.build();
    if (!s.year) s.year = 2026;
    if (!s.theme) s.theme = 'light';
    if (!s.deleted) s.deleted = {};
    if (!s.fieldStamps) s.fieldStamps = {};
    if (!Array.isArray(s.roles) || s.roles.length !== 4) s.roles = def.roles;
    const todayStr = (typeof D !== 'undefined' && D.today) ? D.today() : new Date().toISOString().slice(0, 10);
    if (!Array.isArray(s.tasks)) s.tasks = [];
    s.tasks.forEach(t => {
      if (!t || typeof t !== 'object') return;
      if (!t.scheduledDate) {
        t.scheduledDate = t.fromCalendarDate || t.sawDate || t.date || (t.createdAt ? new Date(t.createdAt).toISOString().slice(0, 10) : todayStr);
      }
    });
    if (!Array.isArray(s.later)) s.later = [];
    if (!Array.isArray(s.reminders)) s.reminders = [];
    if (!Array.isArray(s.saw)) s.saw = def.saw;
    s.saw.forEach(item => {
      if (!item || typeof item !== 'object') return;
      if (!item.startDate) item.startDate = todayStr;
      if (!Array.isArray(item.spawnedDates)) item.spawnedDates = [];
      if (!Array.isArray(item.doneDays)) item.doneDays = [];
      if (!item.roleId || !s.roles.some(r => r.id === item.roleId)) {
        const d = String(item.dim || '').toLowerCase();
        if (d.includes('umysł') || d.includes('studia') || d.includes('duch') || /dziennik|planowanie/i.test(item.title)) item.roleId = 'r2';
        else if (d.includes('relacje') || d.includes('bliscy')) item.roleId = 'r3';
        else if (d.includes('praca') || d.includes('finanse') || /faktur|ksef|rozlicz/i.test(item.title)) item.roleId = 'r4';
        else item.roleId = 'r1';
      }
      if (!item.q) item.q = 2;
      if (!Array.isArray(item.activeDays)) {
        const c = String(item.cycleKey || item.cycle || item.cycleLabel || 'daily').toLowerCase();
        if (c.includes('weekly_0') || c.includes('poniedziałek')) item.activeDays = [0];
        else if (c.includes('weekly_1') || c.includes('wtorek')) item.activeDays = [1];
        else if (c.includes('weekly_2') || c.includes('środ')) item.activeDays = [2];
        else if (c.includes('weekly_3') || c.includes('czwartek')) item.activeDays = [3];
        else if (c.includes('weekly_4') || c.includes('piątek')) item.activeDays = [4];
        else if (c.includes('weekly_5') || c.includes('sobot')) item.activeDays = [5];
        else if (c.includes('weekly_6') || c.includes('niedziel')) item.activeDays = [6];
        else if (c.includes('workdays') || c.includes('robocz')) item.activeDays = [0, 1, 2, 3, 4];
        else item.activeDays = [0, 1, 2, 3, 4, 5, 6];
      }
    });
    if (!Array.isArray(s.rules)) s.rules = def.rules;
    if (!Array.isArray(s.affirmations)) s.affirmations = def.affirmations;
    if (!Array.isArray(s.quotes)) s.quotes = def.quotes;
    if (!Array.isArray(s.archive)) s.archive = [];
    if (!Array.isArray(s.goalsArchive)) s.goalsArchive = [];
    if (!s.goals || typeof s.goals !== 'object') s.goals = def.goals;
    if (!s.goals[s.year]) s.goals[s.year] = def.goals[2026];

    // Ujednolicenie kluczy celów dla każdego roku i roli (tylko weekly i quarterly)
    Object.keys(s.goals).forEach(yr => {
      if (!s.goals[yr] || typeof s.goals[yr] !== 'object') s.goals[yr] = {};
      s.roles.forEach(r => {
        const cur = s.goals[yr][r.id] || {};
        s.goals[yr][r.id] = {
          weekly: String(cur.weekly || ''),
          quarterly: String(cur.quarterly || '')
        };
      });
    });

    delete s.completedDays;
    return s;
  },

  COLLECTIONS: ['tasks', 'roles', 'later', 'reminders', 'saw', 'archive', 'goalsArchive', 'affirmations', 'quotes'],
  baseline: {},

  _fp(item) {
    const c = typeof item === 'object' ? { ...item } : { val: item };
    delete c.updatedAt;
    return JSON.stringify(c);
  },

  rebaseline() {
    const s = this.state;
    this.baseline = {};
    this.COLLECTIONS.forEach(col => {
      this.baseline[col] = {};
      (s[col] || []).forEach(it => {
        if (it && it.id) this.baseline[col][it.id] = this._fp(it);
      });
    });
  },

  stamp() {
    const s = this.state;
    const now = Date.now();
    if (!s.deleted) s.deleted = {};
    this.COLLECTIONS.forEach(col => {
      const list = s[col] || [];
      const base = this.baseline[col] || {};
      const seen = {};
      list.forEach(it => {
        if (!it || !it.id) return;
        seen[it.id] = true;
        const fp = this._fp(it);
        if (base[it.id] !== fp) {
          it.updatedAt = now;
          base[it.id] = fp;
        }
      });
      Object.keys(base).forEach(id => {
        if (!seen[id]) {
          s.deleted[col + ':' + id] = now;
          delete base[id];
        }
      });
      this.baseline[col] = base;
    });
  },

  _stampOf(it) {
    return (it && (it.updatedAt || it.createdAt)) || 0;
  },

  _mergeList(col, la, lb, tombs) {
    const map = new Map();
    [...(la || []), ...(lb || [])].forEach(it => {
      if (!it || typeof it !== 'object' || !it.id) return;
      const cur = map.get(it.id);
      if (!cur) {
        map.set(it.id, it);
        return;
      }
      const sa = this._stampOf(cur);
      const sb = this._stampOf(it);
      const win = (sb > sa || (sb === sa && JSON.stringify(it) > JSON.stringify(cur))) ? it : cur;
      map.set(it.id, win);
    });
    return [...map.values()].filter(it => {
      const ts = tombs[col + ':' + it.id];
      return !(ts && ts >= this._stampOf(it));
    });
  },

  merge(a, b) {
    if (!b) return a;
    if (!a) return b;
    const ca = JSON.parse(JSON.stringify(a));
    const cb = JSON.parse(JSON.stringify(b));
    this.normalizeState(ca);
    this.normalizeState(cb);

    const out = { ...cb, ...ca };
    const limit = Date.now() - 90 * 864e5;
    const tombs = {};
    [cb.deleted, ca.deleted].forEach(d => Object.keys(d || {}).forEach(k => {
      if (d[k] > (tombs[k] || 0)) tombs[k] = d[k];
    }));
    Object.keys(tombs).forEach(k => { if (tombs[k] < limit) delete tombs[k]; });
    out.deleted = tombs;

    this.COLLECTIONS.forEach(col => {
      out[col] = this._mergeList(col, ca[col], cb[col], tombs);
    });

    const fa = ca.fieldStamps || {};
    const fb = cb.fieldStamps || {};
    out.fieldStamps = { ...fb, ...fa };
    Object.keys(fb).forEach(k => {
      if ((fb[k] || 0) > (fa[k] || 0)) out.fieldStamps[k] = fb[k];
    });

    out.goals = {};
    const allYears = new Set([...Object.keys(ca.goals || {}), ...Object.keys(cb.goals || {})]);
    allYears.forEach(yr => {
      out.goals[yr] = {};
      const ga = (ca.goals && ca.goals[yr]) || {};
      const gb = (cb.goals && cb.goals[yr]) || {};
      const roleIds = new Set([...Object.keys(ga), ...Object.keys(gb)]);
      roleIds.forEach(rId => {
        out.goals[yr][rId] = {};
        ['weekly', 'quarterly'].forEach(h => {
          const stampKey = `goal:${yr}:${rId}:${h}`;
          const ta = fa[stampKey] || 0;
          const tb = fb[stampKey] || 0;
          const va = ga[rId]?.[h] ?? '';
          const vb = gb[rId]?.[h] ?? '';
          if (tb > ta) out.goals[yr][rId][h] = vb;
          else if (ta > tb) out.goals[yr][rId][h] = va;
          else out.goals[yr][rId][h] = va.length >= vb.length ? va : vb;
        });
      });
    });

    out.updatedAt = Math.max(ca.updatedAt || 0, cb.updatedAt || 0);
    return this.normalizeState(out);
  },

  sig(s) {
    if (!s) return '';
    const c = JSON.parse(JSON.stringify(s));
    this.normalizeState(c);
    delete c.updatedAt;
    delete c.createdAt;
    delete c.fieldStamps;
    delete c.deleted;
    delete c.completedDays;
    this.COLLECTIONS.forEach(col => {
      c[col] = [...(c[col] || [])].map(it => {
        if (!it || typeof it !== 'object') return it;
        const copy = { ...it };
        delete copy.updatedAt;
        delete copy.createdAt;
        return copy;
      }).sort((x, y) => (String(x?.id) > String(y?.id) ? 1 : -1));
    });
    const norm = v => Array.isArray(v) ? v.map(norm)
      : (v && typeof v === 'object') ? Object.keys(v).sort().reduce((o, k) => (o[k] = norm(v[k]), o), {}) : v;
    return JSON.stringify(norm(c));
  },

  persist(emit = true, syncCloud = true) {
    this.stamp();
    this.state.updatedAt = Date.now();
    try { localStorage.setItem(this.KEY, JSON.stringify(this.state)); } catch (e) {}
    if (emit) this.emit();
    const sync = (typeof Sync !== 'undefined' ? Sync : window.Sync);
    if (syncCloud && sync && typeof sync.pushToCloud === 'function') {
      sync.pushToCloud();
    }
  },

  emit() { this.subs.forEach(f => f()); },
  subscribe(f) { this.subs.add(f); }
};

window.Store = Store;
