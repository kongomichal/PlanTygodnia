'use strict';

/**
 * Warstwa danych (localStorage + automatyczna synchronizacja czasu rzeczywistego z Google Firebase Firestore).
 * Obsługuje: Role (4 Nogi Stołu), Cele (Tygodniowe/Miesięczne/Kwartalne/Roczne z podziałem na lata),
 * Zadania z Matrycą Eisenhowera (Q1-Q4), Zakładkę „Na później”, Kalendarz przypomnień,
 * Ostrzenie Piły (dawne rutyny), Zbiór Myśli/Cytaty, Afirmacje, Moje Zasady oraz Archiwum wykonanych zadań.
 */
const Store = {
  KEY: 'kompas.v1',
  state: null,
  subs: new Set(),

  init() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) this.state = JSON.parse(raw);
    } catch (e) {
      console.warn(e);
    }

    if (!this.state || typeof this.state !== 'object') {
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

  /**
   * Upewnia się, że stan ma wszystkie nowe tablice i migruje ewentualne zadania/rutyny ze starego formatu.
   */
  normalizeState(s) {
    const def = Seed.build();
    if (!s.year) s.year = new Date().getFullYear();
    if (!s.theme) s.theme = 'light';
    if (!s.deleted) s.deleted = {};
    if (!s.fieldStamps) s.fieldStamps = {};

    // Role (4 Nogi Stołu)
    if (!Array.isArray(s.roles) || s.roles.length === 0) {
      s.roles = def.roles;
    } else {
      // Jeśli są tylko stare 3 role (r_saw, r_firm, r_home), uzupełnij do 4 nóg stołu
      const hasLegacyOnly = s.roles.every(r => ['r_saw', 'r_firm', 'r_home'].includes(r.id));
      if (hasLegacyOnly && s.roles.length === 3) {
        s.roles = def.roles;
      }
    }

    const defaultRoleId = s.roles[0]?.id || 'r_body';
    const workRoleId = s.roles.find(r => /praca|firma/i.test(r.name))?.id || s.roles[s.roles.length - 1]?.id || defaultRoleId;
    const mindRoleId = s.roles.find(r => /umysł|rozwój|studia/i.test(r.name))?.id || defaultRoleId;

    const mapLegacyRole = (oldId) => {
      if (!oldId) return workRoleId;
      if (s.roles.some(r => r.id === oldId)) return oldId;
      if (oldId === 'r_saw') return defaultRoleId;
      if (oldId === 'r_firm') return workRoleId;
      if (oldId === 'r_home') return workRoleId;
      return workRoleId;
    };

    if (!Array.isArray(s.tasks)) s.tasks = [];
    if (!Array.isArray(s.later)) s.later = [];
    if (!Array.isArray(s.reminders)) s.reminders = [];
    if (!Array.isArray(s.saw)) s.saw = [];
    if (!Array.isArray(s.rules)) s.rules = [];
    if (!Array.isArray(s.affirmations)) s.affirmations = [];
    if (!Array.isArray(s.quotes)) s.quotes = [];
    if (!Array.isArray(s.archive)) s.archive = [];
    if (!s.goals || typeof s.goals !== 'object') s.goals = def.goals;

    // Migracja zadań ze starej struktury (jeśli występują t.recur, t.done lub t.inbox w s.tasks)
    const remainingTasks = [];
    s.tasks.forEach(t => {
      if (!t || !t.title) return;

      // 1. Stare rutyny (t.recur) -> przenosimy do Ostrzenia Piły (s.saw)
      if (t.recur) {
        const sawId = 'saw_' + t.id;
        if (!s.saw.some(x => x.id === sawId || x.title.toLowerCase() === t.title.toLowerCase()) && !s.deleted['saw:' + sawId]) {
          let freqType = 'daily';
          let dow = null;
          let dayOfMonth = null;
          let cycleLabel = 'Codziennie';

          if (t.recur.unit === 'week') {
            freqType = 'weekly';
            dow = t.recur.dow != null ? t.recur.dow : (t.date ? D.dow(t.date) : 0);
            const dowNames = ['W każdy poniedziałek', 'W każdy wtorek', 'W każdą środę', 'W każdy czwartek', 'W każdy piątek', 'W każdą sobotę', 'W każdą niedzielę'];
            cycleLabel = dowNames[dow] || 'Co tydzień';
          } else if (t.recur.unit === 'month') {
            freqType = 'monthly';
            dayOfMonth = t.recur.dayOfMonth || (t.date ? D.parse(t.date).getDate() : 1);
            cycleLabel = `Co miesiąc (${dayOfMonth}. dzień)`;
          }

          s.saw.push({
            id: sawId,
            title: t.title,
            freqType,
            dow,
            dayOfMonth,
            cycleLabel,
            dim: t.roleId === 'r_saw' ? 'Ciało & Zdrowie' : 'Praca & System',
            doneDays: Array.isArray(t.history) ? [...t.history] : [],
            notes: t.notes || '',
            createdAt: t.createdAt || Date.now(),
            updatedAt: t.updatedAt || Date.now()
          });
        }
        return;
      }

      // 2. Stare zadania wykonane (t.done) -> przenosimy do Archiwum (s.archive)
      if (t.done) {
        const archId = 'arch_' + t.id;
        if (!s.archive.some(a => a.id === archId) && !s.deleted['archive:' + archId]) {
          const doneDate = t.doneAt || t.date || D.today();
          const yr = parseInt(String(doneDate).slice(0, 4), 10) || s.year;
          s.archive.unshift({
            id: archId,
            title: t.title,
            roleId: mapLegacyRole(t.roleId),
            q: t.q || (t.priority === 1 ? 1 : 2),
            doneAt: doneDate,
            year: yr,
            createdAt: t.createdAt || Date.now(),
            updatedAt: t.updatedAt || Date.now()
          });
        }
        return;
      }

      // 3. Stare zadania ze skrzynki (t.inbox) -> przenosimy do „Na później” (s.later)
      if (t.inbox) {
        const latId = 'lat_' + t.id;
        if (!s.later.some(l => l.id === latId) && !s.deleted['later:' + latId]) {
          s.later.push({
            id: latId,
            title: t.title,
            createdAt: t.createdAt || Date.now(),
            updatedAt: t.updatedAt || Date.now()
          });
        }
        return;
      }

      // 4. Aktywne zadanie tygodniowe
      remainingTasks.push({
        ...t,
        roleId: mapLegacyRole(t.roleId),
        q: Number(t.q) || (t.priority === 1 ? 1 : 2),
        year: t.year || (t.date ? parseInt(String(t.date).slice(0, 4), 10) : s.year) || s.year
      });
    });
    s.tasks = remainingTasks;

    // Gwarancja obecności przywróconych pozycji Ostrzenia Piły: „Wyjście na spacer” i „Pisanie dziennika”
    const hasWalk = s.saw.some(x => /spacer/i.test(x.title));
    if (!hasWalk && !s.deleted['saw:saw_walk']) {
      s.saw.unshift({
        id: 'saw_walk',
        title: 'Wyjście na spacer',
        freqType: 'daily',
        dow: null,
        dayOfMonth: null,
        cycleLabel: 'Codziennie',
        dim: 'Ciało & Zdrowie',
        doneDays: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    const hasJournal = s.saw.some(x => /dziennik/i.test(x.title));
    if (!hasJournal && !s.deleted['saw:saw_journal']) {
      s.saw.splice(1, 0, {
        id: 'saw_journal',
        title: 'Pisanie dziennika',
        freqType: 'daily',
        dow: null,
        dayOfMonth: null,
        cycleLabel: 'Codziennie',
        dim: 'Umysł & Rozwój',
        doneDays: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    // Upewnij się, że istnieją obiekty celów dla bieżącego roku
    if (!s.goals[s.year]) s.goals[s.year] = {};
    s.roles.forEach(r => {
      if (!s.goals[s.year][r.id]) {
        s.goals[s.year][r.id] = { weekly: '', monthly: '', quarterly: '', yearly: '' };
      }
    });

    return s;
  },

  /* ---- Śledzenie zmian per element (bezpieczna synchronizacja z Firebase) ---- */
  COLLECTIONS: ['tasks', 'roles', 'later', 'reminders', 'saw', 'archive', 'affirmations', 'quotes', 'rules'],
  baseline: {},

  _fp(item) {
    const c = { ...item };
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
      if (!it || !it.id) return;
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

  /**
   * Przemienne scalanie stanu lokalnego ze stanem z chmury Firebase.
   */
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

    // Scalanie celów (goals) według znaczników czasu
    const fa = a.fieldStamps || {};
    const fb = b.fieldStamps || {};
    out.fieldStamps = { ...fb, ...fa };
    Object.keys(fb).forEach(k => {
      if ((fb[k] || 0) > (fa[k] || 0)) {
        out.fieldStamps[k] = fb[k];
      }
    });

    // Scalanie obiektu goals[year][roleId][horizon]
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
    this.COLLECTIONS.forEach(col => {
      c[col] = [...(s[col] || [])].sort((x, y) => (String(x.id) > String(y.id) ? 1 : -1));
    });
    const norm = v => Array.isArray(v) ? v.map(norm)
      : (v && typeof v === 'object') ? Object.keys(v).sort().reduce((o, k) => (o[k] = norm(v[k]), o), {}) : v;
    return JSON.stringify(norm(c));
  },

  persist(emit = true, syncCloud = true) {
    this.stamp();
    this.state.updatedAt = Date.now();
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn(e);
    }
    if (emit) this.emit();
    const sync = (typeof Sync !== 'undefined' ? Sync : window.Sync);
    if (syncCloud && sync && typeof sync.pushToCloud === 'function') {
      sync.pushToCloud();
    }
  },

  emit() { this.subs.forEach(f => f()); },
  subscribe(f) { this.subs.add(f); },

  /* ---- Eksport i Import pełnego pliku JSON ---- */
  exportJSON() {
    return JSON.stringify(this.state, null, 2);
  },

  importJSON(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Nieprawidłowy plik JSON');
    const old = this.state;
    const now = Date.now() - 2;
    this.normalizeState(obj);
    obj.deleted = { ...(old.deleted || {}), ...(obj.deleted || {}) };

    this.COLLECTIONS.forEach(col => {
      const keep = new Set((obj[col] || []).map(it => it.id));
      (old[col] || []).forEach(it => {
        if (it && it.id && !keep.has(it.id)) {
          obj.deleted[col + ':' + it.id] = now;
        }
      });
    });

    this.state = obj;
    this.rebaseline();
    this.persist(true, true);
  }
};

window.Store = Store;
