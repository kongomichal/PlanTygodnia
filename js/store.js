'use strict';

const Store = {
  KEY: 'kompas_v2_clean',
  UNSYNCED_KEY: 'kompas_unsynced_v1',
  BACKUPS_KEY: 'kompas_backups_v1',
  state: null,
  subs: new Set(),
  editGeneration: 0,

  hasUnsyncedChanges() {
    try { return localStorage.getItem(this.UNSYNCED_KEY) === '1'; } catch (e) { return false; }
  },

  markUnsynced(flag) {
    try {
      if (flag) localStorage.setItem(this.UNSYNCED_KEY, '1');
      else localStorage.setItem(this.UNSYNCED_KEY, '0');
    } catch (e) {}
  },

  saveLocalBackup(reason = 'Zapis automatyczny') {
    if (!this.state || this.state._isSeedOnly) return;
    try {
      const raw = localStorage.getItem(this.BACKUPS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const curSig = this.sig(this.state);
      if (list.length > 0 && list[0].sig === curSig) return;

      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
      list.unshift({
        id: 'bk_' + Date.now(),
        savedAt: stamp,
        reason,
        sig: curSig,
        tasksCount: (this.state.tasks || []).length,
        archiveCount: (this.state.archive || []).length,
        state: JSON.parse(JSON.stringify(this.state))
      });
      while (list.length > 8) list.pop();
      localStorage.setItem(this.BACKUPS_KEY, JSON.stringify(list));
    } catch (e) {}
  },

  getLocalBackups() {
    try {
      const raw = localStorage.getItem(this.BACKUPS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  },

  init() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) this.state = JSON.parse(raw);
    } catch (e) {}

    if (!this.state || !Array.isArray(this.state.roles) || this.state.roles.length !== 4) {
      this.state = Seed.build();
      this.markUnsynced(false);
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
    if (!Array.isArray(s.laterFolders)) s.laterFolders = [];
    if (!Array.isArray(s.reminders)) s.reminders = [];
    if (!Array.isArray(s.saw)) s.saw = def.saw;
    // Jeśli przed wprowadzeniem potwierdzenia usunięto domyślny Spacer lub Dziennik — przywróć je z niskim znacznikiem czasu (1), aby nie nadpisywały chmury
    if (!s.restoredDefaultSawV135) {
      if (!s.saw.some(x => /spacer/i.test(x.title))) {
        delete s.deleted['saw:s1'];
        s.saw.unshift({ id: 's1', title: '🚶‍♂️ Wyjście na spacer', roleId: 'r1', q: 2, activeDays: [0, 1, 2, 3, 4, 5, 6], doneDays: [], dismissedDays: [], startDate: todayStr, spawnedDates: [], createdAt: 1, updatedAt: 1 });
      }
      if (!s.saw.some(x => /dziennik/i.test(x.title))) {
        delete s.deleted['saw:s2'];
        s.saw.splice(1, 0, { id: 's2', title: '📓 Pisanie dziennika', roleId: 'r2', q: 2, activeDays: [0, 1, 2, 3, 4, 5, 6], doneDays: [], dismissedDays: [], startDate: todayStr, spawnedDates: [], createdAt: 1, updatedAt: 1 });
      }
      s.restoredDefaultSawV135 = true;
    }
    s.saw.forEach(item => {
      if (!item || typeof item !== 'object') return;
      if (!item.startDate) item.startDate = todayStr;
      if (!item.freq) item.freq = 'weekdays';
      if (typeof item.leadDays !== 'number' || isNaN(item.leadDays)) item.leadDays = parseInt(item.leadDays, 10) || 0;
      if (!Array.isArray(item.spawnedDates)) item.spawnedDates = [];
      if (!Array.isArray(item.doneDays)) item.doneDays = [];
      if (!Array.isArray(item.dismissedDays)) item.dismissedDays = [];
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
    if (typeof s.quickNote !== 'string') s.quickNote = '';
    delete s.quickNotePos;

    // Lata działają wyłącznie na zasadzie zapisanego tekstu w miesiącach danego roku
    const savedYears = this.getSavedYears(s);
    if (!savedYears.includes(Number(s.year))) {
      s.year = savedYears.includes(2026) ? 2026 : (savedYears[savedYears.length - 1] || 2026);
    }
    if (!s.goals[s.year]) {
      s.goals[s.year] = s.year === 2026 ? def.goals[2026] : {};
    }

    // Usuń puste lata, w których żaden miesiąc nie ma zapisanych zadań/przypomnień/archiwum
    Object.keys(s.goals).forEach(yr => {
      if (!savedYears.includes(Number(yr))) {
        delete s.goals[yr];
      }
    });

    // Ujednolicenie kluczy celów dla każdego aktywnego roku i roli (weekly, quarterly + opcjonalne notatki)
    Object.keys(s.goals).forEach(yr => {
      if (!s.goals[yr] || typeof s.goals[yr] !== 'object') s.goals[yr] = {};
      s.roles.forEach(r => {
        const cur = s.goals[yr][r.id] || {};
        s.goals[yr][r.id] = {
          weekly: String(cur.weekly || ''),
          quarterly: String(cur.quarterly || ''),
          weeklyNote: String(cur.weeklyNote || ''),
          quarterlyNote: String(cur.quarterlyNote || '')
        };
      });
    });

    delete s.completedDays;
    return s;
  },

  getSavedYears(s) {
    const years = new Set();
    const addFromDateStr = (dStr, fallbackYear) => {
      const str = String(dStr || '').trim();
      if (/^\d{4}-\d{2}/.test(str)) {
        const y = parseInt(str.slice(0, 4), 10);
        if (y >= 2020 && y <= 2100) {
          years.add(y);
          return;
        }
      }
      const fy = Number(fallbackYear);
      if (fy >= 2020 && fy <= 2100) years.add(fy);
    };

    (s?.tasks || []).forEach(t => {
      if (!t || !String(t.title || '').trim()) return;
      addFromDateStr(t.scheduledDate || t.fromCalendarDate || t.sawDate || t.date, t.year);
    });

    (s?.reminders || []).forEach(r => {
      if (!r || !String(r.title || '').trim()) return;
      addFromDateStr(r.date);
    });

    (s?.archive || []).forEach(a => {
      if (!a || !String(a.title || '').trim()) return;
      addFromDateStr(a.doneAt || a.scheduledDate, a.year);
    });

    (s?.goalsArchive || []).forEach(g => {
      if (!g || !String(g.title || '').trim()) return;
      addFromDateStr(g.doneAt, g.year);
    });

    (s?.saw || []).forEach(sw => {
      if (!sw || !String(sw.title || '').trim()) return;
      addFromDateStr(sw.startDate);
    });

    if (years.size === 0) {
      years.add(new Date().getFullYear() || 2026);
    }

    return [...years].sort((a, b) => a - b);
  },

  COLLECTIONS: ['tasks', 'roles', 'later', 'laterFolders', 'reminders', 'saw', 'archive', 'goalsArchive', 'affirmations', 'quotes'],
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
        map.set(it.id, { ...it });
        return;
      }
      const sa = this._stampOf(cur);
      const sb = this._stampOf(it);
      const win = { ...((sb > sa || (sb === sa && JSON.stringify(it) > JSON.stringify(cur))) ? it : cur) };

      // Dla Ostrzenia Piły zawsze łączymy (unia) wykonane dni, wygenerowane daty oraz odrzucone dni
      if (col === 'saw') {
        win.doneDays = [...new Set([...(cur.doneDays || []), ...(it.doneDays || [])])];
        win.spawnedDates = [...new Set([...(cur.spawnedDates || []), ...(it.spawnedDates || [])])];
        win.dismissedDays = [...new Set([...(cur.dismissedDays || []), ...(it.dismissedDays || [])])];
      }

      // Dla przypomnień kalendarza: jeśli na którymkolwiek urządzeniu zostało odhaczone jako wykonane, pozostaje wykonane
      if (col === 'reminders') {
        win.done = Boolean(cur.done || it.done);
        win.activatedTaskId = win.activatedTaskId || cur.activatedTaskId || it.activatedTaskId || null;
      }

      map.set(it.id, win);
    });

    return [...map.values()].filter(it => {
      const ts = tombs[col + ':' + it.id];
      if (!ts) return true;
      // Dla deterministycznych zadań cyklicznych / kalendarzowych każdy ślad usunięcia (lub odkliknięcia) blokuje ich ponowne pojawienie się
      if (col === 'tasks' && (String(it.id).startsWith('t_saw_') || String(it.id).startsWith('t_cal_'))) {
        return false;
      }
      return !(ts >= this._stampOf(it));
    });
  },

  merge(a, b) {
    if (!b) return a;
    if (!a) return b;
    const ca = JSON.parse(JSON.stringify(a));
    const cb = JSON.parse(JSON.stringify(b));

    // Świeży szablon (Seed) nigdy nie może nadpisać prawdziwych danych z drugiego urządzenia
    if (ca._isSeedOnly && !cb._isSeedOnly) {
      delete cb._isSeedOnly;
      return this.normalizeState(cb);
    }
    if (cb._isSeedOnly && !ca._isSeedOnly) {
      delete ca._isSeedOnly;
      return this.normalizeState(ca);
    }

    this.normalizeState(ca);
    this.normalizeState(cb);

    const out = { ...cb, ...ca };
    delete out._isSeedOnly;

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

    // Spójność między kolekcjami: zadanie odhaczone w Ostrzeniu Piły lub Kalendarzu nie może wisieć na aktywnej liście
    const sawMap = new Map((out.saw || []).map(s => [s.id, s]));
    const remMap = new Map((out.reminders || []).map(r => [r.id, r]));
    out.tasks = (out.tasks || []).filter(t => {
      if (t.sawId) {
        const sItem = sawMap.get(t.sawId);
        if (!sItem) return false;
        const dStr = t.sawDate || t.scheduledDate;
        if (dStr && ((sItem.doneDays || []).includes(dStr) || (sItem.dismissedDays || []).includes(dStr))) {
          return false;
        }
      }
      if (String(t.id).startsWith('t_cal_')) {
        const remId = t.remId || String(t.id).slice(6).replace(/_\d{4}-\d{2}-\d{2}$/, '');
        const rItem = remMap.get(remId);
        if (!rItem || rItem.done) return false;
      }
      return true;
    });

    const fa = ca.fieldStamps || {};
    const fb = cb.fieldStamps || {};
    out.fieldStamps = { ...fb, ...fa };
    Object.keys(fb).forEach(k => {
      if ((fb[k] || 0) > (fa[k] || 0)) out.fieldStamps[k] = fb[k];
    });

    const isSeedGoal = val => (typeof Seed !== 'undefined' && Seed.isDefaultGoalText && Seed.isDefaultGoalText(val));

    out.goals = {};
    const allYears = new Set([...Object.keys(ca.goals || {}), ...Object.keys(cb.goals || {})]);
    allYears.forEach(yr => {
      out.goals[yr] = {};
      const ga = (ca.goals && ca.goals[yr]) || {};
      const gb = (cb.goals && cb.goals[yr]) || {};
      const roleIds = new Set([...Object.keys(ga), ...Object.keys(gb)]);
      roleIds.forEach(rId => {
        out.goals[yr][rId] = {};
        ['weekly', 'quarterly', 'weeklyNote', 'quarterlyNote'].forEach(h => {
          const stampKey = `goal:${yr}:${rId}:${h}`;
          const ta = fa[stampKey] || 0;
          const tb = fb[stampKey] || 0;
          const va = ga[rId]?.[h] ?? '';
          const vb = gb[rId]?.[h] ?? '';
          if (tb > ta) {
            out.goals[yr][rId][h] = vb;
          } else if (ta > tb) {
            out.goals[yr][rId][h] = va;
          } else {
            // Jeśli żadna strona nie ma nowszego stempla: własny tekst użytkownika zawsze wygrywa nad domyślnym tekstem z Seed
            if (isSeedGoal(va) && !isSeedGoal(vb) && vb !== '') out.goals[yr][rId][h] = vb;
            else if (isSeedGoal(vb) && !isSeedGoal(va) && va !== '') out.goals[yr][rId][h] = va;
            else out.goals[yr][rId][h] = (vb !== '' ? vb : va);
          }
        });
      });
    });

    const tqa = fa['quickNote'] || 0;
    const tqb = fb['quickNote'] || 0;
    const vqa = typeof ca.quickNote === 'string' ? ca.quickNote : '';
    const vqb = typeof cb.quickNote === 'string' ? cb.quickNote : '';
    if (tqb > tqa) out.quickNote = vqb;
    else if (tqa > tqb) out.quickNote = vqa;
    else out.quickNote = (vqb !== '' ? vqb : vqa);

    out.updatedAt = Math.max(ca.updatedAt || 0, cb.updatedAt || 0);
    return this.normalizeState(out);
  },

  sig(s) {
    if (!s) return '';
    const c = JSON.parse(JSON.stringify(s));
    this.normalizeState(c);
    delete c._isSeedOnly;
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

  persist(emit = true, syncCloud = true, isUserEdit = true) {
    if (isUserEdit && this.state) {
      delete this.state._isSeedOnly;
      this.editGeneration = (this.editGeneration || 0) + 1;
      this.markUnsynced(true);
    }
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
