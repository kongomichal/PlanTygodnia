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
    if (!Array.isArray(s.tasks)) s.tasks = [];
    if (!Array.isArray(s.later)) s.later = [];
    if (!Array.isArray(s.reminders)) s.reminders = [];
    if (!Array.isArray(s.saw)) s.saw = def.saw;
    s.saw.forEach(item => {
      if (!item || typeof item !== 'object') return;
      if (!item.roleId || !s.roles.some(r => r.id === item.roleId)) {
        const d = String(item.dim || '').toLowerCase();
        if (d.includes('umysł') || d.includes('studia') || d.includes('duch') || /dziennik|planowanie/i.test(item.title)) item.roleId = 'r2';
        else if (d.includes('relacje') || d.includes('bliscy')) item.roleId = 'r3';
        else if (d.includes('praca') || d.includes('finanse') || /faktur|ksef|rozlicz/i.test(item.title)) item.roleId = 'r4';
        else item.roleId = 'r1';
      }
      if (!item.q) item.q = 2;
      if (!item.cycleKey) {
        const c = String(item.cycle || item.cycleLabel || 'Codziennie').toLowerCase();
        if (c.includes('poniedziałek')) item.cycleKey = 'weekly_0';
        else if (c.includes('wtorek')) item.cycleKey = 'weekly_1';
        else if (c.includes('środ')) item.cycleKey = 'weekly_2';
        else if (c.includes('czwartek')) item.cycleKey = 'weekly_3';
        else if (c.includes('piątek')) item.cycleKey = 'weekly_4';
        else if (c.includes('sobot')) item.cycleKey = 'weekly_5';
        else if (c.includes('niedziel')) item.cycleKey = 'weekly_6';
        else if (c.includes('robocz')) item.cycleKey = 'workdays';
        else if (c.includes('miesiąc')) item.cycleKey = 'monthly_10';
        else item.cycleKey = 'daily';
      }
    });
    if (!Array.isArray(s.rules)) s.rules = def.rules;
    if (!Array.isArray(s.affirmations)) s.affirmations = def.affirmations;
    if (!Array.isArray(s.quotes)) s.quotes = def.quotes;
    if (!Array.isArray(s.archive)) s.archive = [];
    if (!s.goals || typeof s.goals !== 'object') s.goals = def.goals;
    if (!s.goals[s.year]) s.goals[s.year] = def.goals[2026];
    return s;
  },

  COLLECTIONS: ['tasks', 'roles', 'later', 'reminders', 'saw', 'archive', 'affirmations', 'quotes'],
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
    this.normalizeState(a);
    this.normalizeState(b);

    const out = { ...b, ...a };
    const limit = Date.now() - 90 * 864e5;
    const tombs = {};
    [b.deleted, a.deleted].forEach(d => Object.keys(d || {}).forEach(k => {
      if (d[k] > (tombs[k] || 0)) tombs[k] = d[k];
    }));
    Object.keys(tombs).forEach(k => { if (tombs[k] < limit) delete tombs[k]; });
    out.deleted = tombs;

    this.COLLECTIONS.forEach(col => {
      out[col] = this._mergeList(col, a[col], b[col], tombs);
    });

    const fa = a.fieldStamps || {};
    const fb = b.fieldStamps || {};
    out.fieldStamps = { ...fb, ...fa };

    out.goals = {};
    const allYears = new Set([...Object.keys(a.goals || {}), ...Object.keys(b.goals || {})]);
    allYears.forEach(yr => {
      out.goals[yr] = {};
      const ga = (a.goals && a.goals[yr]) || {};
      const gb = (b.goals && b.goals[yr]) || {};
      const roleIds = new Set([...Object.keys(ga), ...Object.keys(gb)]);
      roleIds.forEach(rId => {
        out.goals[yr][rId] = {};
        ['weekly', 'monthly', 'quarterly', 'yearly'].forEach(h => {
          const stampKey = `goal:${yr}:${rId}:${h}`;
          const ta = fa[stampKey] || 0;
          const tb = fb[stampKey] || 0;
          const va = ga[rId]?.[h] || '';
          const vb = gb[rId]?.[h] || '';
          if (tb > ta) out.goals[yr][rId][h] = vb;
          else if (ta > tb) out.goals[yr][rId][h] = va;
          else out.goals[yr][rId][h] = va.length >= vb.length ? va : vb;
        });
      });
    });

    out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
    return this.normalizeState(out);
  },

  sig(s) {
    if (!s) return '';
    const c = { ...s };
    delete c.updatedAt;
    return JSON.stringify(c);
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
