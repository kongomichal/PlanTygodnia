'use strict';

const APP_LOGO_ICONS = [
  `<svg class="app-logo-svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#4f46e5"/><circle cx="32" cy="32" r="19" fill="none" stroke="#fff" stroke-width="2.5" opacity="0.9"/><polygon points="32,14 37,32 32,29 27,32" fill="#fbbf24"/><polygon points="32,50 37,32 32,35 27,32" fill="#ffffff" opacity="0.85"/></svg>`
];

const App = {
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),

  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  init() {
    Store.init();
    this.calYear = Store.state.year || 2026;
    this.initTheme();

    if (window.Sync && typeof window.Sync.init === 'function') {
      window.Sync.init();
    }

    Store.subscribe(() => this.renderAll());
    document.addEventListener('selectionchange', () => {
      if (document.activeElement && document.activeElement.id === 'quickPadEditor') {
        this.updateQuickPadToolbarState();
      }
    });
    this.renderWelcome();

    // Na komputerze pokaż ekran 7 Nawyków raz na sesję; na telefonie od razu przejdź do zadań
    const isMobile = window.innerWidth <= 768;
    let seenToday = false;
    try { seenToday = sessionStorage.getItem('kompas_welcome_seen') === '1'; } catch (e) {}
    if (!isMobile && !seenToday) {
      this.openWelcome();
    }

    this.renderAll();
  },

  initTheme() {
    document.documentElement.setAttribute('data-theme', Store.state.theme || 'light');
  },

  save() {
    Store.persist(true, true, true);
  },

  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  /* ---- EKRAN POWITALNY ---- */
  renderWelcome() {
    const firstAff = Store.state.affirmations?.[0];
    const affText = typeof firstAff === 'object' ? firstAff.text : firstAff;
    const affEl = document.getElementById('welcomeAffirmation');
    if (affEl) affEl.textContent = `„${affText || 'Działam spokojnie i skutecznie.'}”`;

    const rulesEl = document.getElementById('welcomeRulesList');
    if (rulesEl) {
      rulesEl.innerHTML = (Store.state.rules || []).map(r => {
        const txt = typeof r === 'object' ? r.text : r;
        return `<li>${this.esc(txt)}</li>`;
      }).join('');
    }
  },
  openWelcome() { document.getElementById('welcomeOverlay').classList.remove('hidden'); },
  closeWelcome() {
    try { sessionStorage.setItem('kompas_welcome_seen', '1'); } catch (e) {}
    document.getElementById('welcomeOverlay').classList.add('hidden');
  },

  mobileQuarterlyGoalsOpen: false,
  toggleMobileQuarterlyGoals() {
    this.mobileQuarterlyGoalsOpen = !this.mobileQuarterlyGoalsOpen;
    const stripEl = document.getElementById('goalsStripItems');
    const btnEl = document.getElementById('mobileGoalsToggleBtn');
    if (stripEl) stripEl.classList.toggle('mobile-open', this.mobileQuarterlyGoalsOpen);
    if (btnEl) {
      btnEl.textContent = this.mobileQuarterlyGoalsOpen
        ? '📊 Ukryj cele kwartalne (4 Nogi Stołu) ▴'
        : '📊 Pokaż cele kwartalne (4 Nogi Stołu) ▾';
    }
  },

  mobileQLegendOpen: false,
  toggleMobileQLegend() {
    this.mobileQLegendOpen = !this.mobileQLegendOpen;
    const barEl = document.getElementById('qLegendBar');
    const btnEl = document.getElementById('mobileQLegendToggleBtn');
    if (barEl) barEl.classList.toggle('mobile-open', this.mobileQLegendOpen);
    if (btnEl) {
      btnEl.textContent = this.mobileQLegendOpen
        ? '❓ Ukryj podpowiedź Q1 / Q2 / Q3 / Q4 ▴'
        : '❓ Kiedy Q1 / Q2 / Q3 / Q4? ▾';
    }
  },

  ROLE_SCOPES: {
    r1: 'Ciało · ruch · sen · wygląd · dom',
    r2: 'Studia · dziennik · książki · porządek cyfrowy',
    r3: 'Rodzina · znajomi · wspólny czas',
    r4: 'Klienci · faktury · finanse · projekty'
  },

  editingTaskId: null,
  editingCalendarRemId: null,
  editingNoteTaskId: null,
  _noteSaveTimer: null,

  _isInteractiveTarget(ev) {
    if (!ev || !ev.target || typeof ev.target.closest !== 'function') return false;
    return Boolean(ev.target.closest('button, input, textarea, select, a, label, .q-tag-wrap, .q-tag, .task-note-text, .task-note-add-hint'));
  },

  startEditTask(taskId, ev) {
    if (ev && this._isInteractiveTarget(ev)) return;
    const t = (Store.state.tasks || []).find(x => x.id === taskId);
    if (!t || t.sawId) return; // Przypomnienia z Ostrzenia Piły edytuje się wyłącznie w zakładce Ostrzenie Piły
    if (ev) ev.preventDefault();
    this.editingNoteTaskId = null;
    this.editingTaskId = taskId;
    this.renderPlan();
    this.renderMatrix();
    setTimeout(() => {
      const inp = document.querySelector(`input[data-edit-task="${taskId}"]`);
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }, 0);
  },

  cancelEditTask() {
    if (!this.editingTaskId) return;
    this.editingTaskId = null;
    this.renderPlan();
    this.renderMatrix();
  },

  saveEditTask(taskId, form) {
    const t = (Store.state.tasks || []).find(x => x.id === taskId);
    if (!t || t.sawId) {
      this.editingTaskId = null;
      this.renderAll();
      return;
    }
    const newTitle = form.title ? form.title.value.trim() : '';
    if (!newTitle) {
      alert('Treść przypomnienia nie może być pusta.');
      return;
    }
    const newNote = form.note ? form.note.value.trim() : (t.note || '');
    const newRoleId = (form.roleId && form.roleId.value) ? form.roleId.value : t.roleId;
    const newQ = (form.q && form.q.value) ? (parseInt(form.q.value, 10) || 2) : (t.q || 2);

    t.title = newTitle;
    t.note = newNote;
    t.roleId = newRoleId;
    t.q = newQ;

    // Zsynchronizuj zmiany również z powiązanym przypomnieniem w Kalendarzu (jeśli istnieje)
    const linkedRem = (Store.state.reminders || []).find(r =>
      r.activatedTaskId === taskId ||
      (t.remId && r.id === t.remId) ||
      ('t_cal_' + r.id) === taskId ||
      ('t_cal_' + r.id + '_' + r.date) === taskId
    );
    if (linkedRem) {
      linkedRem.title = newTitle;
      linkedRem.note = newNote;
      linkedRem.roleId = newRoleId;
      linkedRem.q = newQ;
    }

    this.editingTaskId = null;
    this.save();
    this.renderAll();
  },

  renderInlineTaskEditor(t) {
    return `
      <form class="goal-edit-box" style="width:100%;" onsubmit="event.preventDefault(); App.saveEditTask('${t.id}', this);">
        <input type="text" name="title" data-edit-task="${t.id}" class="input-clean" style="font-weight:700; font-size:0.84rem; padding:6px 9px;" value="${this.esc(t.title)}" placeholder="Treść przypomnienia / zadania..." required onkeydown="if(event.key==='Escape'){event.preventDefault(); App.cancelEditTask();}">
        <textarea name="note" class="input-clean" rows="2" style="resize:vertical; font-size:0.75rem; color:var(--text-muted);" placeholder="Notatka pod przypomnieniem (opcjonalnie)..." onkeydown="if(event.key==='Escape'){event.preventDefault(); App.cancelEditTask();} if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault(); this.form.requestSubmit();}">${this.esc(t.note || '')}</textarea>
        <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center; justify-content:space-between;">
          <div style="display:flex; gap:5px; flex-wrap:wrap; align-items:center;">
            <select name="roleId" class="input-clean" style="width:auto; padding:4px 7px; font-size:0.72rem; font-weight:600;" title="Filar / Rola">
              ${Store.state.roles.map(role => `<option value="${role.id}" ${role.id === t.roleId ? 'selected' : ''}>${role.emoji} ${this.esc(role.name)}</option>`).join('')}
            </select>
            <select name="q" class="input-clean" style="width:auto; padding:4px 7px; font-size:0.72rem; font-weight:700;" title="Ćwiartka priorytetu">
              <option value="1" ${(Number(t.q) || 2) === 1 ? 'selected' : ''}>🔥 Q1</option>
              <option value="2" ${(Number(t.q) || 2) === 2 ? 'selected' : ''}>💎 Q2</option>
              <option value="3" ${(Number(t.q) || 2) === 3 ? 'selected' : ''}>⚡ Q3</option>
              <option value="4" ${(Number(t.q) || 2) === 4 ? 'selected' : ''}>🗑️ Q4</option>
            </select>
          </div>
          <div style="display:flex; gap:5px;">
            <button type="button" class="btn" style="padding:4px 9px; font-size:0.73rem;" onclick="App.cancelEditTask()">Anuluj</button>
            <button type="submit" class="btn btn-primary" style="padding:4px 11px; font-size:0.73rem;">✓ Zapisz</button>
          </div>
        </div>
      </form>
    `;
  },

  startEditCalendarReminder(remId, dateStr, ev) {
    if (ev && this._isInteractiveTarget(ev)) return;
    const rem = (Store.state.reminders || []).find(r => r.id === remId);
    if (!rem) return;
    if (ev) ev.preventDefault();
    this.editingCalendarRemId = remId;
    this.openCalendarModal(dateStr);
    setTimeout(() => {
      const inp = document.querySelector(`input[data-edit-cal-rem="${remId}"]`);
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }, 0);
  },

  cancelEditCalendarReminder(dateStr) {
    this.editingCalendarRemId = null;
    this.openCalendarModal(dateStr);
  },

  saveEditCalendarReminder(remId, dateStr, form) {
    const rem = (Store.state.reminders || []).find(r => r.id === remId);
    if (!rem) {
      this.editingCalendarRemId = null;
      this.openCalendarModal(dateStr);
      return;
    }
    const newTitle = form.title ? form.title.value.trim() : '';
    if (!newTitle) {
      alert('Treść przypomnienia nie może być pusta.');
      return;
    }
    const newNote = form.note ? form.note.value.trim() : '';
    const newRoleId = (form.roleId && form.roleId.value) ? form.roleId.value : rem.roleId;
    const newQ = (form.q && form.q.value) ? (parseInt(form.q.value, 10) || 2) : (rem.q || 2);

    rem.title = newTitle;
    rem.note = newNote;
    rem.roleId = newRoleId;
    rem.q = newQ;

    // Zsynchronizuj z powiązanym aktywnym zadaniem, jeśli przypomnienie już wskoczyło na listę
    const linkedTask = (Store.state.tasks || []).find(t =>
      t.id === rem.activatedTaskId ||
      t.remId === rem.id ||
      t.id === ('t_cal_' + rem.id) ||
      t.id === ('t_cal_' + rem.id + '_' + rem.date)
    );
    if (linkedTask) {
      linkedTask.title = newTitle;
      linkedTask.note = newNote;
      linkedTask.roleId = newRoleId;
      linkedTask.q = newQ;
    }

    this.editingCalendarRemId = null;
    this.save();
    this.renderAll();
    this.openCalendarModal(dateStr);
  },

  startEditTaskNote(taskId) {
    this.editingNoteTaskId = taskId;
    this.renderPlan();
    this.renderMatrix();
    setTimeout(() => {
      const ta = document.querySelector(`textarea[data-note-task="${taskId}"]`);
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    }, 0);
  },

  updateTaskNote(taskId, val) {
    const t = (Store.state.tasks || []).find(x => x.id === taskId);
    if (!t) return;
    t.note = val;
    // Zsynchronizuj notatkę również z powiązanym przypomnieniem w Kalendarzu
    const rem = (Store.state.reminders || []).find(r => r.activatedTaskId === taskId || (t.remId && r.id === t.remId) || ('t_cal_' + r.id) === taskId);
    if (rem) rem.note = val;

    Store.persist(false, false, true);
    clearTimeout(this._noteSaveTimer);
    this._noteSaveTimer = setTimeout(() => {
      this._noteSaveTimer = null;
      if (window.Sync && typeof window.Sync.pushToCloud === 'function') {
        window.Sync.pushToCloud();
      }
    }, 300);
  },

  finishEditTaskNote(taskId) {
    if (this.editingNoteTaskId !== taskId) return;
    this.editingNoteTaskId = null;
    if (this._noteSaveTimer) {
      clearTimeout(this._noteSaveTimer);
      this._noteSaveTimer = null;
      Store.persist(false, true, true);
    }
    this.renderPlan();
    this.renderMatrix();
    this.renderCalendar();
  },

  updateReminderNote(remId, val) {
    const rem = (Store.state.reminders || []).find(r => r.id === remId);
    if (!rem) return;
    rem.note = val;
    // Jeśli przypomnienie już wskoczyło na aktywną listę zadań, zaktualizuj notatkę także tam
    const task = (Store.state.tasks || []).find(t => t.id === rem.activatedTaskId || t.remId === rem.id || t.id === ('t_cal_' + rem.id));
    if (task) task.note = val;

    Store.persist(false, false, true);
    this.renderPlan();
    this.renderMatrix();
    clearTimeout(this._noteSaveTimer);
    this._noteSaveTimer = setTimeout(() => {
      this._noteSaveTimer = null;
      if (window.Sync && typeof window.Sync.pushToCloud === 'function') {
        window.Sync.pushToCloud();
      }
    }, 300);
  },

  renderTaskNoteBlock(t) {
    const note = String(t.note || '');
    if (this.editingNoteTaskId === t.id) {
      return `
        <textarea class="task-note-editor" data-note-task="${t.id}" rows="2" placeholder="Wpisz notatkę pod przypomnieniem..."
          oninput="App.updateTaskNote('${t.id}', this.value)"
          onblur="App.finishEditTaskNote('${t.id}')"
          onkeydown="if(event.key==='Escape') App.finishEditTaskNote('${t.id}')">${this.esc(note)}</textarea>
      `;
    }
    if (note.trim()) {
      return `<div class="task-note-text" onclick="App.startEditTaskNote('${t.id}')" title="Kliknij, aby edytować notatkę">${this.esc(note)}</div>`;
    }
    return `<div class="task-note-add-hint" onclick="App.startEditTaskNote('${t.id}')">+ Dodaj notatkę...</div>`;
  },

  renderQTagWithTooltip(taskId, q) {
    const curQ = Number(q) || 2;
    const rows = [
      { q: 1, icon: '🔥', label: 'Q1', desc: 'Pilne pożary, terminy na dziś' },
      { q: 2, icon: '💎', label: 'Q2', desc: 'Głazy: rozwój, studia, zdrowie, cele' },
      { q: 3, icon: '⚡', label: 'Q3', desc: 'Bieżączka, maile, pranie, porządki' },
      { q: 4, icon: '🗑️', label: 'Q4', desc: 'Zjadacze czasu (do odrzucenia)' }
    ];
    return `
      <span class="q-tag-wrap">
        <span class="q-tag q${curQ}" onclick="App.cycleQ('${taskId}')">Q${curQ}</span>
        <div class="cal-tooltip q-guide-tooltip">
          <div style="font-size:0.67rem; color:#94a3b8; font-weight:700; margin-bottom:4px;">Kliknij, aby zmienić ćwiartkę:</div>
          ${rows.map(row => `
            <div style="display:flex; gap:5px; align-items:baseline; margin-bottom:2px; ${row.q === curQ ? 'color:#ffffff; font-weight:800;' : 'color:#cbd5e1; font-weight:500;'}">
              <span>${row.icon} <strong>${row.label}:</strong></span>
              <span>${row.desc}</span>
            </div>
          `).join('')}
        </div>
      </span>
    `;
  },

  openMobileMenu() {
    const root = document.getElementById('modalRoot');
    if (!root) return;
    const syncStatusText = (window.Sync && window.Sync.status === 'synced')
      ? '🟢 Wszystkie zmiany zapisane w chmurze'
      : (window.Sync && window.Sync.status === 'saving')
        ? '🟡 Trwa zapisywanie w chmurze...'
        : '☁️ Sprawdź synchronizację i kopie zapasowe';

    root.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) App.closeModal()">
        <div class="modal" style="max-width:440px; padding:20px;">
          <div class="modal-header">
            <h3 style="font-size:1.05rem; font-weight:800;">⚙️ Menu & Narzędzia</h3>
            <button class="btn" onclick="App.closeModal()">✕</button>
          </div>
          <div style="display:flex; flex-direction:column; gap:10px;">
            <button type="button" class="mobile-menu-item" onclick="App.closeModal(); App.switchTab('saw');">
              <span>🪚 <strong>Ostrzenie Piły</strong> (Rutyny i nawyki cykliczne)</span>
              <span>→</span>
            </button>
            <button type="button" class="mobile-menu-item" onclick="App.closeModal(); App.switchTab('mind');">
              <span>💭 <strong>Myśli, Cytaty & Afirmacje</strong></span>
              <span>→</span>
            </button>
            <button type="button" class="mobile-menu-item" onclick="App.closeModal(); App.switchTab('archive');">
              <span>🗄️ <strong>Archiwum wykonanych zadań</strong></span>
              <span>→</span>
            </button>
            <button type="button" class="mobile-menu-item" onclick="App.closeModal(); App.openWelcome();">
              <span>📜 <strong>7 Nawyków i Moje Zasady</strong></span>
              <span>→</span>
            </button>
            <button type="button" class="mobile-menu-item" onclick="App.closeModal(); if(window.Sync) Sync.openAuthModal();">
              <span>${syncStatusText}</span>
              <span>→</span>
            </button>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:4px;">
              <button type="button" class="btn" style="justify-content:center; padding:11px;" onclick="App.toggleTheme(); App.closeModal();">
                🌙 Zmień motyw
              </button>
              <button type="button" class="btn" style="justify-content:center; padding:11px;" onclick="App.exportJSON(); App.closeModal();">
                💾 Pobierz JSON
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  /* ---- ZAKŁADKI ---- */
  switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-section').forEach(s => { s.style.display = (s.id === 'view_' + tab) ? 'block' : 'none'; });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  setYear(y) {
    const savedYears = Store.getSavedYears(Store.state);
    const target = Number(y) || 2026;
    if (!savedYears.includes(target)) return;
    Store.state.year = target;
    this.calYear = Store.state.year;
    if (!Store.state.goals[Store.state.year]) {
      Store.state.goals[Store.state.year] = {
        r1: { weekly: '', quarterly: '' },
        r2: { weekly: '', quarterly: '' },
        r3: { weekly: '', quarterly: '' },
        r4: { weekly: '', quarterly: '' }
      };
    }
    this.save();
    this.renderGoals(true);
    this.renderAll();
  },

  renderYearSelect() {
    const savedYears = Store.getSavedYears(Store.state);
    if (!savedYears.includes(Number(Store.state.year))) {
      Store.state.year = savedYears.includes(2026) ? 2026 : (savedYears[savedYears.length - 1] || 2026);
      this.calYear = Store.state.year;
    }
    const sel = document.getElementById('yearSelect');
    if (sel) {
      sel.innerHTML = savedYears
        .map(yr => `<option value="${yr}" ${yr === Number(Store.state.year) ? 'selected' : ''}>${yr}</option>`)
        .join('');
      sel.value = String(Store.state.year);
    }
    document.querySelectorAll('.yearLabel').forEach(el => { el.textContent = Store.state.year; });
  },

  /* ---- WIDOK 1: PLAN TYGODNIA (4 RUBRYCZKI RÓL + KALENDARZ) ---- */
  renderPlan() {
    const y = Store.state.year;
    const gYear = Store.state.goals[y] || {};

    // 4 estetyczne rubryczki Ról (z licznikiem wykonanych zadań z Archiwum + udziałem % oraz licznikiem dni opóźnienia)
    const today = this.today();
    const tasks = Store.state.tasks.filter(t => (t.year || y) === y);
    const allArchive = Store.state.archive || [];
    const totalArchivedCount = allArchive.length;

    const gridEl = document.getElementById('rolesGrid');
    if (gridEl) {
      gridEl.innerHTML = Store.state.roles.map(r => {
        const rTasks = tasks
          .filter(t => t.roleId === r.id)
          .sort((a, b) => {
            const qa = Number(a.q) || 2;
            const qb = Number(b.q) || 2;
            if (qa !== qb) return qa - qb;
            const da = a.scheduledDate || today;
            const db = b.scheduledDate || today;
            if (da !== db) return da < db ? -1 : 1;
            return (a.createdAt || 0) - (b.createdAt || 0);
          });
        const doneInArchive = allArchive.filter(a => a.roleId === r.id).length;
        const pctInArchive = totalArchivedCount > 0 ? Math.round((doneInArchive / totalArchivedCount) * 100) : 0;
        const gw = gYear[r.id]?.weekly || '';
        const scopeText = this.ROLE_SCOPES[r.id] || '';
        return `
          <div class="role-card" style="border-top: 3px solid ${r.color};">
            <div class="role-card-head">
              <div class="role-card-title">${r.emoji} ${this.esc(r.name)}</div>
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-size:0.73rem; font-weight:800; color:var(--emerald); background:var(--emerald-light); border:1px solid var(--emerald-border); padding:2px 8px; border-radius:999px;" title="Wykonane zadania z Archiwum dla tej kategorii: ${doneInArchive} z ${totalArchivedCount} (${pctInArchive}% wszystkich wykonanych zadań)">
                  ✓ ${doneInArchive} (${pctInArchive}%)
                </span>
                <span class="role-card-count" title="Aktywne zadania do zrobienia">${rTasks.length}</span>
              </div>
            </div>
            ${scopeText ? `<div class="role-scope-hint">${this.esc(scopeText)}</div>` : ''}
            ${gw ? `<div class="role-goal-hint">🎯 ${this.esc(gw)}</div>` : ''}
            <div class="task-list">
              ${rTasks.map(t => {
                if (!t.sawId && this.editingTaskId === t.id) {
                  return `<div class="task-row task-row-macos">${this.renderInlineTaskEditor(t)}</div>`;
                }
                const sawObj = t.sawId ? (Store.state.saw || []).find(s => s.id === t.sawId) : null;
                const isBookTask = Boolean(sawObj && sawObj.isBookTracker);
                const bookTitleSuffix = (isBookTask && sawObj.book && sawObj.book.bookTitle)
                  ? `: „${sawObj.book.bookTitle}”`
                  : '';
                const rawDiff = D.diff(today, t.scheduledDate || today);
                const delay = Math.max(0, rawDiff);
                const daysUntil = rawDiff < 0 ? Math.abs(rawDiff) : 0;
                const dblAttr = !t.sawId ? `ondblclick="App.startEditTask('${t.id}', event)"` : '';
                const dblTitle = !t.sawId ? `title="Kliknij dwukrotnie, aby edytować przypomnienie"` : '';
                return `
                  <div class="task-row task-row-macos ${!t.sawId ? 'task-row-editable' : ''}" style="${t.sawId ? 'border-left: 3px solid var(--emerald);' : ''}" ${dblAttr}>
                    <button class="check-circle" style="margin-top:2px;" onclick="App.doneTask('${t.id}')" title="Odhacz jako wykonane">✓</button>
                    <div class="task-main-col">
                      <div class="task-title-line">
                        <span class="task-title-main ${!t.sawId ? 'task-editable-title' : ''}" ${dblTitle}>${this.esc(t.title + bookTitleSuffix)}</span>
                        ${t.isGoalSubtask ? `<span style="font-size:0.65rem; color:var(--accent); background:var(--accent-light); border:1px solid var(--border); padding:1px 6px; border-radius:999px; font-weight:800;">🎯 Cel</span>` : ''}
                        ${t.sawId ? `<span style="font-size:0.65rem; color:var(--emerald); background:var(--emerald-light); padding:1px 6px; border-radius:999px; font-weight:700;">🪚 ${this.esc((t.sawDate || '').slice(5))}</span>` : ''}
                        ${t.fromCalendarDate ? `<span style="font-size:0.68rem; color:var(--accent); background:var(--accent-light); padding:1px 6px; border-radius:999px; font-weight:700;">📅 ${t.fromCalendarDate.slice(5)}</span>` : ''}
                        ${daysUntil > 0 ? `<span style="font-size:0.68rem; color:var(--amber); background:var(--amber-light); border:1px solid rgba(217,119,6,0.3); padding:1px 7px; border-radius:999px; font-weight:800;" title="Przypomnienie z wyprzedzeniem — termin właściwy: ${t.scheduledDate}">🔔 Termin za ${daysUntil} ${daysUntil === 1 ? 'dzień' : 'dni'} (${this.esc((t.scheduledDate || '').slice(5))})</span>` : ''}
                        ${delay > 0 ? `<span style="font-size:0.68rem; color:var(--crimson); background:var(--crimson-light); border:1px solid rgba(220,38,38,0.25); padding:1px 7px; border-radius:999px; font-weight:800;" title="Zaplanowane na: ${t.scheduledDate} — opóźnienie: ${delay} dni">⏳ ${delay} ${delay === 1 ? 'dzień' : 'dni'} opóźnienia</span>` : ''}
                      </div>
                      ${isBookTask ? this.renderBookCardWidget(sawObj, t.id) : ''}
                      ${this.renderTaskNoteBlock(t)}
                    </div>
                    <div style="display:flex; align-items:center; gap:5px; flex-shrink:0;">
                      ${this.renderQTagWithTooltip(t.id, t.q || 2)}
                      <button type="button" class="btn" style="padding:2px 6px; font-size:0.74rem; line-height:1;" onclick="App.openRescheduleModal('${t.id}', 'task')" title="Zmień datę zadania (przełóż na inny dzień)">📅</button>
                      <button type="button" class="btn" style="padding:2px 7px; font-size:0.74rem; line-height:1;" onclick="App.deleteActiveTask('${t.id}')" title="Usuń przypomnienie / zadanie (zniknie z tego filaru, z Matrycy i z Kalendarza)">✕</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
            <form class="quick-add-row" onsubmit="event.preventDefault(); App.addTask('${r.id}', this);">
              <input type="text" name="title" class="input-clean" placeholder="+ Dodaj zadanie..." required>
              <button type="submit" class="btn btn-primary">+</button>
            </form>
          </div>
        `;
      }).join('');
    }
  },

  openRescheduleModal(id, kind = 'task') {
    const root = document.getElementById('modalRoot');
    if (!root) return;
    const today = this.today();
    const item = kind === 'reminder'
      ? (Store.state.reminders || []).find(r => r.id === id)
      : (Store.state.tasks || []).find(t => t.id === id);
    if (!item) return;

    const currentDate = (kind === 'reminder' ? item.date : (item.scheduledDate || today)) || today;
    const tomorrow = D.addDays(today, 1);
    const in3Days = D.addDays(today, 3);
    const nextWeek = D.addDays(today, 7);
    const in2Weeks = D.addDays(today, 14);
    const nextMonth = this.addMonthsISO(today, 1);

    root.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) App.closeModal()">
        <div class="modal" style="max-width:460px;">
          <div class="modal-header">
            <div>
              <h3 style="font-size:1.05rem; font-weight:800;">📅 Zmień datę zadania</h3>
              <p style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">
                <strong>${this.esc(item.title)}</strong>
              </p>
            </div>
            <button type="button" class="btn" onclick="App.closeModal()">✕</button>
          </div>

          <div style="display:flex; flex-direction:column; gap:12px;">
            <div>
              <div style="font-size:0.72rem; font-weight:700; color:var(--text-muted); margin-bottom:6px;">Szybki wybór terminu:</div>
              <div style="display:flex; flex-wrap:wrap; gap:6px;">
                <button type="button" class="btn" onclick="App.applyReschedule('${id}', '${kind}', '${tomorrow}')">☀️ Jutro (${tomorrow.slice(5)})</button>
                <button type="button" class="btn" onclick="App.applyReschedule('${id}', '${kind}', '${in3Days}')">📆 Za 3 dni (${in3Days.slice(5)})</button>
                <button type="button" class="btn" onclick="App.applyReschedule('${id}', '${kind}', '${nextWeek}')">🗓️ Za tydzień (${nextWeek.slice(5)})</button>
                <button type="button" class="btn" onclick="App.applyReschedule('${id}', '${kind}', '${in2Weeks}')">🔄 Za 2 tyg. (${in2Weeks.slice(5)})</button>
                <button type="button" class="btn" onclick="App.applyReschedule('${id}', '${kind}', '${nextMonth}')">📅 Za miesiąc (${nextMonth.slice(5)})</button>
              </div>
            </div>

            <form onsubmit="event.preventDefault(); App.applyReschedule('${id}', '${kind}', this.newDate.value);" style="display:flex; flex-direction:column; gap:10px; padding-top:10px; border-top:1px solid var(--border);">
              <div>
                <label style="font-size:0.74rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">Lub wybierz dokładną nową datę:</label>
                <input type="date" name="newDate" class="input-clean" style="font-weight:700;" value="${this.esc(currentDate)}" required>
              </div>
              <p style="font-size:0.73rem; color:var(--text-muted); margin:0;">
                Jeśli wybierzesz datę w przyszłości, zadanie zniknie z dzisiejszej listy, zapisze się w Kalendarzu i wróci automatycznie w wybranym dniu.
              </p>
              <button type="submit" class="btn btn-primary" style="justify-content:center; padding:10px;">
                ✓ Zapisz nową datę
              </button>
            </form>
          </div>
        </div>
      </div>
    `;
  },

  applyReschedule(id, kind, newDate) {
    if (!newDate) return;
    const today = this.today();
    const newYear = parseInt(newDate.slice(0, 4), 10) || Store.state.year;

    if (kind === 'reminder') {
      const rem = (Store.state.reminders || []).find(r => r.id === id);
      if (!rem) return;
      rem.date = newDate;
      // Usuń ewentualny stary ślad usunięcia dla tej daty, aby zadanie bez problemu pojawiło się w nowym terminie
      if (Store.state.deleted) {
        delete Store.state.deleted['tasks:t_cal_' + rem.id];
        delete Store.state.deleted['tasks:t_cal_' + rem.id + '_' + newDate];
      }
      if (newDate > today) {
        if (rem.activatedTaskId) {
          Store.state.tasks = (Store.state.tasks || []).filter(t => t.id !== rem.activatedTaskId && t.remId !== rem.id);
          rem.activatedTaskId = null;
        }
        rem.done = false;
      } else {
        const linked = (Store.state.tasks || []).find(t => t.id === rem.activatedTaskId || t.remId === rem.id || t.id === ('t_cal_' + rem.id));
        if (linked) {
          linked.scheduledDate = newDate;
          linked.fromCalendarDate = newDate;
          linked.delayDays = Math.max(0, D.diff(today, newDate));
          linked.year = newYear;
        } else {
          rem.activatedTaskId = null;
          rem.done = false;
        }
      }
      this.processDueReminders();
      this.save();
      this.closeModal();
      this.renderAll();
      return;
    }

    // kind === 'task'
    const t = (Store.state.tasks || []).find(x => x.id === id);
    if (!t) return;
    const linkedRem = (Store.state.reminders || []).find(r => r.activatedTaskId === id || (t.remId && r.id === t.remId) || ('t_cal_' + r.id) === id);

    if (newDate > today) {
      // Przeniesienie na przyszły termin: usuwamy z bieżącej listy i zapisujemy w Kalendarzu na nowy dzień
      Store.state.tasks = (Store.state.tasks || []).filter(x => x.id !== id);
      if (t.sawId) {
        const sawItem = (Store.state.saw || []).find(s => s.id === t.sawId);
        if (sawItem) {
          const dStr = t.sawDate || t.scheduledDate || today;
          if (!Array.isArray(sawItem.dismissedDays)) sawItem.dismissedDays = [];
          if (!sawItem.dismissedDays.includes(dStr)) sawItem.dismissedDays.push(dStr);
          if (!Array.isArray(sawItem.spawnedDates)) sawItem.spawnedDates = [];
          if (!sawItem.spawnedDates.includes(dStr)) sawItem.spawnedDates.push(dStr);
        }
      }
      if (linkedRem) {
        linkedRem.date = newDate;
        linkedRem.title = t.title;
        linkedRem.note = t.note || '';
        linkedRem.roleId = t.roleId;
        linkedRem.q = t.q || 2;
        linkedRem.activatedTaskId = null;
        linkedRem.done = false;
        if (Store.state.deleted) {
          delete Store.state.deleted['tasks:t_cal_' + linkedRem.id];
          delete Store.state.deleted['tasks:t_cal_' + linkedRem.id + '_' + newDate];
        }
      } else {
        Store.state.reminders.push({
          id: 'c_' + Date.now(),
          date: newDate,
          title: t.title,
          note: t.note || '',
          roleId: t.roleId || Store.state.roles[0].id,
          q: Number(t.q) || 2,
          activatedTaskId: null,
          done: false,
          createdAt: Date.now()
        });
      }
    } else {
      // Data dzisiejsza lub wcześniejsza — zostaje na liście z nową datą
      t.scheduledDate = newDate;
      t.delayDays = Math.max(0, D.diff(today, newDate));
      t.year = newYear;
      if (linkedRem) {
        linkedRem.date = newDate;
        t.fromCalendarDate = newDate;
      }
    }

    this.save();
    this.closeModal();
    this.renderAll();
  },

  deleteActiveTask(id) {
    const t = (Store.state.tasks || []).find(x => x.id === id);
    const label = t ? `„${t.title}”` : 'to zadanie';
    if (!confirm(`Czy na pewno chcesz usunąć ${label}?`)) return;
    // 1. Usuń zadanie z aktywnej listy (znika z Filaru i z Matrycy Eisenhowera)
    Store.state.tasks = (Store.state.tasks || []).filter(x => x.id !== id);
    // 2. Jeśli zadanie pochodziło z Kalendarza, usuń je również z Kalendarza
    Store.state.reminders = (Store.state.reminders || []).filter(r => r.activatedTaskId !== id && (!t || t.remId !== r.id) && ('t_cal_' + r.id) !== id);
    // 3. Jeśli zadanie pochodziło z Ostrzenia Piły, oznacz ten dzień jako odrzucony, aby nie pojawiło się ponownie z drugiego urządzenia
    if (t && t.sawId) {
      const sawItem = (Store.state.saw || []).find(s => s.id === t.sawId);
      if (sawItem) {
        const dStr = t.sawDate || t.scheduledDate || this.today();
        if (!Array.isArray(sawItem.dismissedDays)) sawItem.dismissedDays = [];
        if (!sawItem.dismissedDays.includes(dStr)) sawItem.dismissedDays.push(dStr);
        if (!Array.isArray(sawItem.spawnedDates)) sawItem.spawnedDates = [];
        if (!sawItem.spawnedDates.includes(dStr)) sawItem.spawnedDates.push(dStr);
      }
    }
    this.save();
    this.renderAll();
  },

  addTask(roleId, form) {
    const title = form.title.value.trim();
    if (!title) return;
    const today = this.today();
    Store.state.tasks.push({
      id: 't_' + Date.now(),
      title,
      roleId,
      q: 2,
      scheduledDate: today,
      delayDays: 0,
      year: Store.state.year,
      createdAt: Date.now()
    });
    form.title.value = '';
    this.save();
    this.renderAll();
  },

  cycleQ(id) {
    const t = Store.state.tasks.find(x => x.id === id);
    if (!t) return;
    t.q = ((t.q || 2) % 4) + 1;
    this.save();
    this.renderAll();
  },

  doneTask(id, skipBookPrompt = false) {
    const idx = Store.state.tasks.findIndex(x => x.id === id);
    if (idx < 0) return;
    const candidateTask = Store.state.tasks[idx];
    const today = this.today();

    // Dla spersonalizowanego zadania Książki: jeśli jeszcze dziś nie wpisano liczby przeczytanych stron, zapytaj z domyślną dzisiejszą normą
    const linkedSawPre = candidateTask.sawId ? (Store.state.saw || []).find(s => s.id === candidateTask.sawId) : null;
    if (!skipBookPrompt && linkedSawPre && linkedSawPre.isBookTracker && linkedSawPre.book && linkedSawPre.book.totalPages > 0) {
      const preStats = this.getBookStats(linkedSawPre, today);
      if (preStats.readToday === 0 && preStats.remainingNow > 0) {
        const labelBook = linkedSawPre.book.bookTitle ? `„${linkedSawPre.book.bookTitle}”` : linkedSawPre.title;
        const ans = prompt(
          `📚 ${labelBook}\nIle stron przeczytałeś dzisiaj?\n(Dzisiejsza norma do wyrobienia się w planie: ${preStats.todayQuota} str.)`,
          String(preStats.todayQuota)
        );
        if (ans === null) return;
        const pages = Math.max(0, parseInt(String(ans).trim(), 10) || 0);
        this.setBookPagesToday(linkedSawPre.id, pages, false);
      }
    }

    const [t] = Store.state.tasks.splice(idx, 1);

    // Oznacz powiązane przypomnienie w kalendarzu jako wykonane
    const rem = (Store.state.reminders || []).find(r => r.activatedTaskId === id || (t.remId && r.id === t.remId) || ('t_cal_' + r.id) === id);
    if (rem) rem.done = true;

    // Jeśli zadanie pochodziło z Ostrzenia Piły, oznacz termin zadania ORAZ dzisiejszy dzień jako wykonane,
    // aby po odklikaniu opóźnionej czynności nie wyskoczyła od razu kolejna na ten sam dzień (dopiero od kolejnego terminu / jutra)
    let archiveTitle = t.title;
    if (t.sawId) {
      const sawItem = (Store.state.saw || []).find(s => s.id === t.sawId);
      if (sawItem) {
        if (sawItem.isBookTracker && sawItem.book && sawItem.book.totalPages > 0) {
          const postStats = this.getBookStats(sawItem, today);
          const bName = sawItem.book.bookTitle ? `: „${sawItem.book.bookTitle}”` : '';
          archiveTitle = `${t.title}${bName} (+${postStats.readToday} str. · ${postStats.totalRead}/${postStats.totalPages} str.)`;
        }
        if (!Array.isArray(sawItem.doneDays)) sawItem.doneDays = [];
        if (!Array.isArray(sawItem.spawnedDates)) sawItem.spawnedDates = [];
        const targetDay = t.sawDate || today;
        if (!sawItem.doneDays.includes(targetDay)) sawItem.doneDays.push(targetDay);
        if (!sawItem.spawnedDates.includes(targetDay)) sawItem.spawnedDates.push(targetDay);
        if (!sawItem.doneDays.includes(today)) sawItem.doneDays.push(today);
        if (!sawItem.spawnedDates.includes(today)) sawItem.spawnedDates.push(today);
        if (targetDay < today) {
          const skippedDates = this.getSawOccurrencesInRange(sawItem, targetDay, today);
          skippedDates.forEach(dStr => {
            if (!sawItem.spawnedDates.includes(dStr)) sawItem.spawnedDates.push(dStr);
          });
        }
      }
    }

    const delay = Math.max(0, D.diff(today, t.scheduledDate || today));
    const now = new Date();
    const stamp = `${today} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    Store.state.archive.unshift({
      id: 'ar_' + Date.now(),
      title: archiveTitle,
      note: t.note || '',
      roleId: t.roleId,
      q: t.q || 2,
      scheduledDate: t.scheduledDate || today,
      delayDays: delay,
      doneAt: stamp,
      year: Store.state.year,
      createdAt: Date.now()
    });
    this.save();
    this.renderAll();
  },

  addMonthsISO(isoDate, monthsToAdd) {
    const parts = String(isoDate || this.today()).split('-').map(Number);
    const y = parts[0] || 2026;
    const m = parts[1] || 1;
    const d = parts[2] || 1;
    const targetMonthIndex = (m - 1) + monthsToAdd;
    const targetYear = y + Math.floor(targetMonthIndex / 12);
    const normMonth = ((targetMonthIndex % 12) + 12) % 12;
    const maxDayInTargetMonth = new Date(targetYear, normMonth + 1, 0).getDate();
    const clampedDay = Math.min(d, maxDayInTargetMonth);
    return `${targetYear}-${String(normMonth + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
  },

  getSawOccurrenceDate(s, k) {
    const start = s.startDate || this.today();
    const freq = s.freq || 'weekdays';
    if (freq === 'biweekly') return D.addDays(start, k * 14);
    if (freq === 'monthly') return this.addMonthsISO(start, k * 1);
    if (freq === 'quarterly') return this.addMonthsISO(start, k * 3);
    if (freq === 'semiannual') return this.addMonthsISO(start, k * 6);
    if (freq === 'yearly') return this.addMonthsISO(start, k * 12);
    return D.addDays(start, k);
  },

  getSawOccurrencesInRange(s, minDate, maxDate) {
    const freq = s.freq || 'weekdays';
    const start = s.startDate || this.today();
    const results = [];
    if (freq === 'weekdays') {
      const act = Array.isArray(s.activeDays) ? s.activeDays : [0, 1, 2, 3, 4, 5, 6];
      let cur = start > minDate ? start : minDate;
      let guard = 0;
      while (cur <= maxDate && guard++ < 90) {
        if (act.includes(D.dow(cur))) results.push(cur);
        cur = D.addDays(cur, 1);
      }
    } else {
      for (let k = 0; k < 400; k++) {
        const occ = this.getSawOccurrenceDate(s, k);
        if (occ > maxDate) break;
        if (occ >= minDate && occ >= start) results.push(occ);
      }
    }
    return results;
  },

  /* ---- KALENDARZ I OSTRZENIE PIŁY: MATERIALIZACJA ZADAŃ I LICZENIE OPÓŹNIEŃ ---- */
  processDueReminders() {
    const today = this.today();
    let changed = false;
    let spawnedNewTask = false;

    // 1. Przypomnienia z Kalendarza (od dnia kiedy powinny być — nie znikają aż do odklikania)
    (Store.state.reminders || []).forEach(r => {
      if (!r || !r.date || r.done) return;
      if (r.date <= today) {
        const expectedTaskId = `t_cal_${r.id}_${r.date}`;
        const existingTask = Store.state.tasks.find(t =>
          t.id === r.activatedTaskId ||
          t.id === expectedTaskId ||
          t.remId === r.id ||
          t.id === ('t_cal_' + r.id)
        );
        if (existingTask) {
          if (r.activatedTaskId !== existingTask.id) {
            r.activatedTaskId = existingTask.id;
            changed = true;
          }
          return;
        }
        const alreadyDeleted = Boolean(Store.state.deleted && Store.state.deleted['tasks:' + expectedTaskId]);
        if (!alreadyDeleted) {
          Store.state.tasks.push({
            id: expectedTaskId,
            remId: r.id,
            title: r.title,
            note: r.note || '',
            roleId: r.roleId || Store.state.roles[0].id,
            q: Number(r.q) || 2,
            scheduledDate: r.date,
            fromCalendarDate: r.date,
            isGoalSubtask: Boolean(r.isGoalSubtask),
            delayDays: Math.max(0, D.diff(today, r.date)),
            year: parseInt(r.date.slice(0, 4), 10) || Store.state.year,
            createdAt: Date.now()
          });
          r.activatedTaskId = expectedTaskId;
          spawnedNewTask = true;
          changed = true;
        }
      }
    });

    // 2. Zadania z Ostrzenia Piły (nigdy nie dubluje się — nie dodaje nowego przypomnienia, dopóki poprzednie nie zostanie odklikane)
    (Store.state.saw || []).forEach(s => {
      if (!s || typeof s !== 'object') return;
      if (!s.startDate) s.startDate = today;
      if (!s.freq) s.freq = 'weekdays';
      const leadDays = Math.max(0, parseInt(s.leadDays, 10) || 0);
      if (!Array.isArray(s.spawnedDates)) s.spawnedDates = [];
      if (!Array.isArray(s.doneDays)) s.doneDays = [];
      if (!Array.isArray(s.dismissedDays)) s.dismissedDays = [];

      // Jeśli dla tego nawyku istnieje już więcej niż 1 aktywne (nieodklikane) zadanie — zostaw tylko najstarsze opóźnione
      const activeForSaw = (Store.state.tasks || [])
        .filter(t => t.sawId === s.id)
        .sort((a, b) => String(a.scheduledDate || '').localeCompare(String(b.scheduledDate || '')));

      if (activeForSaw.length > 1) {
        const keepId = activeForSaw[0].id;
        const dropTasks = activeForSaw.slice(1);
        const dropIds = new Set(dropTasks.map(t => t.id));
        Store.state.tasks = Store.state.tasks.filter(t => !dropIds.has(t.id));
        dropTasks.forEach(dt => {
          if (dt.sawDate) {
            s.spawnedDates = s.spawnedDates.filter(d => d !== dt.sawDate);
          }
        });
        changed = true;
      }

      // Dopóki istnieje stare nieodklikane zadanie tego nawyku — NIE wprowadzaj nowego przypomnienia
      const hasActiveUnfinished = (Store.state.tasks || []).some(t => t.sawId === s.id);
      if (hasActiveUnfinished) return;

      // Jeśli ten nawyk został już dziś odklikany (w tym przy nadrabianiu zaległego terminu),
      // nie generuj kolejnej powtórki tego samego dnia — pojawi się dopiero od następnego dnia/terminu
      if (s.doneDays.includes(today)) return;

      const horizonDate = D.addDays(today, leadDays);
      const minStart = s.freq === 'weekdays' ? D.addDays(today, -45) : D.addDays(today, -370);
      const dueDates = this.getSawOccurrencesInRange(s, minStart, horizonDate);

      // Wybierz wyłącznie NAJNOWSZY należny termin (nie nadrabiaj hurtowo pominiętych dni z przeszłości)
      const pendingDates = dueDates.filter(cur => {
        const taskId = `t_saw_${s.id}_${cur}`;
        const alreadySpawned = s.spawnedDates.includes(cur);
        const alreadyDone = s.doneDays.includes(cur);
        const alreadyDismissed = s.dismissedDays.includes(cur) || Boolean(Store.state.deleted && Store.state.deleted['tasks:' + taskId]);
        return !alreadySpawned && !alreadyDone && !alreadyDismissed;
      });

      if (pendingDates.length > 0) {
        const latestCur = pendingDates[pendingDates.length - 1];
        // Oznacz ewentualne starsze pominięte terminy jako przetworzone, żeby nie tworzyły zaległych duplikatów
        pendingDates.slice(0, -1).forEach(oldCur => {
          if (!s.spawnedDates.includes(oldCur)) s.spawnedDates.push(oldCur);
        });

        const taskId = `t_saw_${s.id}_${latestCur}`;
        if (!Store.state.tasks.some(t => t.id === taskId)) {
          Store.state.tasks.push({
            id: taskId,
            title: s.title,
            note: s.note || '',
            roleId: s.roleId || 'r1',
            q: Number(s.q) || 2,
            scheduledDate: latestCur,
            sawId: s.id,
            sawDate: latestCur,
            sawFreq: s.freq,
            leadDays,
            delayDays: Math.max(0, D.diff(today, latestCur)),
            year: parseInt(latestCur.slice(0, 4), 10) || Store.state.year,
            createdAt: Date.now()
          });
          spawnedNewTask = true;
        }
        if (!s.spawnedDates.includes(latestCur)) s.spawnedDates.push(latestCur);
        changed = true;
      }
    });

    // 3. Aktualizacja pola delayDays na wszystkich aktywnych zadaniach
    (Store.state.tasks || []).forEach(t => {
      if (!t.scheduledDate) t.scheduledDate = t.fromCalendarDate || t.sawDate || today;
      const d = Math.max(0, D.diff(today, t.scheduledDate));
      if (t.delayDays !== d) {
        t.delayDays = d;
        changed = true;
      }
    });

    if (changed) {
      const canSyncNow = !window.Sync || window.Sync.initialSyncComplete;
      Store.persist(false, Boolean(canSyncNow && spawnedNewTask), false);
    }
  },

  changeMonth(d) {
    this.calMonth += d;
    if (this.calMonth < 0) { this.calMonth = 11; this.calYear--; }
    if (this.calMonth > 11) { this.calMonth = 0; this.calYear++; }
    this.renderCalendar();
  },

  renderCalendar() {
    const mNames = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
    const titleEl = document.getElementById('calMonthTitle');
    if (titleEl) titleEl.textContent = `${mNames[this.calMonth]} ${this.calYear}`;

    const first = new Date(this.calYear, this.calMonth, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(this.calYear, this.calMonth + 1, 0).getDate();
    const total = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    const today = this.today();

    const firstGridDate = new Date(this.calYear, this.calMonth, 1 - startOffset);
    const lastGridDate = new Date(this.calYear, this.calMonth, 1 - startOffset + total - 1);
    const minGridStr = `${firstGridDate.getFullYear()}-${String(firstGridDate.getMonth()+1).padStart(2,'0')}-${String(firstGridDate.getDate()).padStart(2,'0')}`;
    const maxGridStr = `${lastGridDate.getFullYear()}-${String(lastGridDate.getMonth()+1).padStart(2,'0')}-${String(lastGridDate.getDate()).padStart(2,'0')}`;

    // Zbierz również dłuższe zadania cykliczne z Ostrzenia Piły (co 2 tyg., co miesiąc, co 3 mies., co pół roku, co rok), aby były widoczne w kalendarzu
    const sawByDate = {};
    (Store.state.saw || []).forEach(s => {
      if (!s || (s.freq || 'weekdays') === 'weekdays') return;
      const occs = this.getSawOccurrencesInRange(s, minGridStr, maxGridStr);
      occs.forEach(dt => {
        if (!sawByDate[dt]) sawByDate[dt] = [];
        sawByDate[dt].push({
          id: 'sawcal_' + s.id + '_' + dt,
          sawId: s.id,
          date: dt,
          title: s.title,
          roleId: s.roleId,
          q: s.q || 2,
          done: Array.isArray(s.doneDays) && s.doneDays.includes(dt),
          isSawCycle: true,
          freqLabel: this.getSawFreqLabel(s.freq)
        });
      });
    });

    let html = '';
    for (let i = 0; i < total; i++) {
      const d = new Date(this.calYear, this.calMonth, 1 - startOffset + i);
      const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const isCur = d.getMonth() === this.calMonth;
      const rems = [
        ...Store.state.reminders.filter(r => r.date === dStr),
        ...(sawByDate[dStr] || [])
      ];

      html += `
        <div class="cal-cell ${isCur ? '' : 'other'} ${dStr === today ? 'today' : ''} ${rems.length ? 'has-rems' : ''}" onclick="App.openCalendarModal('${dStr}')">
          <div class="cal-num-row">
            <span class="cal-num">${d.getDate()}</span>
            ${rems.length ? `<span class="cal-mobile-badge">${rems.length}</span>` : ''}
          </div>
          ${rems.slice(0, 3).map(r => {
            const role = Store.state.roles.find(x => x.id === r.roleId);
            const borderColor = role ? role.color : 'var(--accent)';
            const roleLabel = role ? `${role.emoji} ${this.esc(role.name)}` : '🔔 Przypomnienie';
            return `
              <div class="cal-chip-wrap">
                <div class="cal-chip" style="border-left-color:${borderColor}; ${r.done ? 'text-decoration:line-through; opacity:0.6;' : ''}">
                  ${r.isSawCycle ? '🪚' : (role ? role.emoji : '🔔')} <span class="q-tag q${r.q || 2}" style="font-size:0.58rem; padding:0 4px;">Q${r.q || 2}</span> ${this.esc(r.title)}
                </div>
                <div class="cal-tooltip">
                  <div style="font-size:0.68rem; color:#94a3b8; font-weight:700; margin-bottom:2px;">${roleLabel} · Ćwiartka Q${r.q || 2}${r.isSawCycle ? ' · 🪚 ' + this.esc(r.freqLabel) : ''}</div>
                  <div style="font-weight:600; color:#ffffff;">${this.esc(r.title)}</div>
                  ${r.note ? `<div style="font-size:0.71rem; color:#cbd5e1; margin-top:3px; white-space:pre-wrap;">${this.esc(r.note)}</div>` : ''}
                </div>
              </div>
            `;
          }).join('')}
          ${rems.length > 3 ? `<div class="cal-more-label" style="font-size:0.66rem; color:var(--accent); font-weight:700; padding-left:2px;">+${rems.length - 3} więcej...</div>` : ''}
        </div>
      `;
    }
    const gridEl = document.getElementById('calGrid');
    if (gridEl) gridEl.innerHTML = html;

    // Czytelna lista przypomnień z wybranego miesiąca (szczególnie pomocna na telefonie)
    const mobListEl = document.getElementById('calMobileRemindersList');
    if (mobListEl) {
      const monthPrefix = `${this.calYear}-${String(this.calMonth + 1).padStart(2, '0')}`;
      const sawMonthItems = Object.keys(sawByDate)
        .filter(dt => dt.startsWith(monthPrefix))
        .flatMap(dt => sawByDate[dt]);
      const monthRems = [
        ...(Store.state.reminders || []).filter(r => r && r.date && r.date.startsWith(monthPrefix)),
        ...sawMonthItems
      ].sort((a, b) => (a.date > b.date ? 1 : -1));
      if (monthRems.length) {
        mobListEl.innerHTML = `
          <div style="font-size:0.78rem; font-weight:800; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase;">
            📌 Zaplanowane przypomnienia w tym miesiącu (${monthRems.length}):
          </div>
          <div style="display:flex; flex-direction:column; gap:6px;">
            ${monthRems.map(r => {
              const role = Store.state.roles.find(x => x.id === r.roleId);
              return `
                <div class="task-row" style="border-left: 3px solid ${role ? role.color : 'var(--accent)'}; ${r.done ? 'opacity:0.6; text-decoration:line-through;' : ''}" onclick="App.openCalendarModal('${r.date}')">
                  <div class="task-row-left" style="flex-wrap:wrap;">
                    <span style="font-size:0.74rem; font-weight:800; color:var(--accent); background:var(--accent-light); padding:2px 7px; border-radius:999px;">${r.isSawCycle ? '🪚' : '📅'} ${this.esc(r.date)}</span>
                    <span style="font-weight:600;">${this.esc(r.title)}</span>
                  </div>
                  <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                    <span style="font-size:0.75rem;">${role ? role.emoji : ''}</span>
                    <span class="q-tag q${r.q || 2}">Q${r.q || 2}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      } else {
        mobListEl.innerHTML = '';
      }
    }
  },

  openCalendarModal(dateStr) {
    const root = document.getElementById('modalRoot');
    if (!root) return;
    const rems = Store.state.reminders
      .filter(r => r.date === dateStr)
      .sort((a, b) => (Number(a.q) || 2) - (Number(b.q) || 2));
    const sawRems = [];
    (Store.state.saw || []).forEach(s => {
      if (!s || (s.freq || 'weekdays') === 'weekdays') return;
      const occs = this.getSawOccurrencesInRange(s, dateStr, dateStr);
      if (occs.includes(dateStr)) {
        sawRems.push({
          id: s.id,
          title: s.title,
          roleId: s.roleId,
          q: s.q || 2,
          freqLabel: this.getSawFreqLabel(s.freq)
        });
      }
    });
    const isTodayOrPast = dateStr <= this.today();

    root.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) App.closeModal()">
        <div class="modal" style="max-width:520px;">
          <div class="modal-header">
            <div>
              <h3 style="font-size:1.1rem; font-weight:800;">📅 Kalendarz: ${dateStr}</h3>
              <p style="font-size:0.76rem; color:var(--text-muted); margin-top:2px;">
                ${isTodayOrPast ? 'Wpisane zadanie od razu wskoczy do wybranej Roli i Ćwiartki.' : 'W tym dniu zadanie automatycznie wskoczy na listę zadań wybranej Roli i Ćwiartki.'}
              </p>
            </div>
            <button class="btn" onclick="App.closeModal()">✕</button>
          </div>

          <div style="display:flex; flex-direction:column; gap:8px;">
            ${(rems.length || sawRems.length) ? `
              ${rems.map(r => {
                const role = Store.state.roles.find(x => x.id === r.roleId);
                if (this.editingCalendarRemId === r.id) {
                  return `
                    <div class="task-row task-row-macos">
                      <form class="goal-edit-box" style="width:100%;" onsubmit="event.preventDefault(); App.saveEditCalendarReminder('${r.id}', '${dateStr}', this);">
                        <input type="text" name="title" data-edit-cal-rem="${r.id}" class="input-clean" style="font-weight:700; font-size:0.84rem; padding:6px 9px;" value="${this.esc(r.title)}" placeholder="Treść przypomnienia..." required onkeydown="if(event.key==='Escape'){event.preventDefault(); App.cancelEditCalendarReminder('${dateStr}');}">
                        <textarea name="note" class="input-clean" rows="2" style="resize:vertical; font-size:0.75rem; color:var(--text-muted);" placeholder="Notatka pod przypomnieniem (opcjonalnie)..." onkeydown="if(event.key==='Escape'){event.preventDefault(); App.cancelEditCalendarReminder('${dateStr}');} if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault(); this.form.requestSubmit();}">${this.esc(r.note || '')}</textarea>
                        <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center; justify-content:space-between;">
                          <div style="display:flex; gap:5px; flex-wrap:wrap; align-items:center;">
                            <select name="roleId" class="input-clean" style="width:auto; padding:4px 7px; font-size:0.72rem; font-weight:600;">
                              ${Store.state.roles.map(rl => `<option value="${rl.id}" ${rl.id === r.roleId ? 'selected' : ''}>${rl.emoji} ${this.esc(rl.name)}</option>`).join('')}
                            </select>
                            <select name="q" class="input-clean" style="width:auto; padding:4px 7px; font-size:0.72rem; font-weight:700;">
                              <option value="1" ${(Number(r.q) || 2) === 1 ? 'selected' : ''}>🔥 Q1</option>
                              <option value="2" ${(Number(r.q) || 2) === 2 ? 'selected' : ''}>💎 Q2</option>
                              <option value="3" ${(Number(r.q) || 2) === 3 ? 'selected' : ''}>⚡ Q3</option>
                              <option value="4" ${(Number(r.q) || 2) === 4 ? 'selected' : ''}>🗑️ Q4</option>
                            </select>
                          </div>
                          <div style="display:flex; gap:5px;">
                            <button type="button" class="btn" style="padding:4px 9px; font-size:0.73rem;" onclick="App.cancelEditCalendarReminder('${dateStr}')">Anuluj</button>
                            <button type="submit" class="btn btn-primary" style="padding:4px 11px; font-size:0.73rem;">✓ Zapisz</button>
                          </div>
                        </div>
                      </form>
                    </div>
                  `;
                }
                return `
                  <div class="task-row task-row-macos task-row-editable" ondblclick="App.startEditCalendarReminder('${r.id}', '${dateStr}', event)">
                    <div class="task-main-col">
                      <div class="task-title-line">
                        <span class="task-title-main task-editable-title" title="Kliknij dwukrotnie, aby edytować przypomnienie">${role ? role.emoji : '🔔'} ${this.esc(r.title)}</span>
                      </div>
                      <textarea class="task-note-inline-input" rows="1" placeholder="+ Dodaj notatkę..."
                        oninput="App.updateReminderNote('${r.id}', this.value)">${this.esc(r.note || '')}</textarea>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                      <span style="font-size:0.72rem; color:var(--text-muted);">${role ? this.esc(role.name) : ''}</span>
                      <span class="q-tag q${r.q || 2}">Q${r.q || 2}</span>
                      <button type="button" class="btn" style="padding:2px 6px;" onclick="App.openRescheduleModal('${r.id}', 'reminder')" title="Zmień datę przypomnienia">📅</button>
                      <button class="btn" style="padding:2px 6px;" onclick="App.deleteReminder('${r.id}', '${dateStr}')">✕</button>
                    </div>
                  </div>
                `;
              }).join('')}
              ${sawRems.map(sr => {
                const role = Store.state.roles.find(x => x.id === sr.roleId);
                return `
                  <div class="task-row" style="border-left:3px solid var(--emerald);">
                    <div class="task-row-left" style="flex-wrap:wrap;">
                      <span>🪚 <strong>${this.esc(sr.title)}</strong></span>
                      <span style="font-size:0.68rem; color:var(--emerald); background:var(--emerald-light); padding:1px 7px; border-radius:999px; font-weight:700;">${this.esc(sr.freqLabel)}</span>
                    </div>
                    <span style="font-size:0.72rem; color:var(--text-muted);">${role ? role.emoji + ' ' + this.esc(role.name) : ''}</span>
                    <span class="q-tag q${sr.q || 2}">Q${sr.q || 2}</span>
                  </div>
                `;
              }).join('')}
            ` : `<div style="font-size:0.8rem; color:var(--text-dim); padding:6px 0;">Brak przypomnień w tym dniu.</div>`}
          </div>

          <form onsubmit="event.preventDefault(); App.saveCalendarReminder('${dateStr}', this);" style="display:flex; flex-direction:column; gap:10px; padding-top:12px; border-top:1px solid var(--border);">
            <input type="text" name="title" class="input-clean" style="font-weight:700;" placeholder="+ Wpisz treść przypomnienia / zadania..." required autofocus>
            <textarea name="note" class="input-clean" rows="2" style="resize:vertical; font-size:0.78rem; color:var(--text-muted);" placeholder="Notatka pod przypomnieniem (opcjonalnie, np. szczegóły, wytyczne...)"></textarea>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
              <div>
                <label style="font-size:0.72rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">Wybierz Rolę (Cel):</label>
                <select name="roleId" class="input-clean" style="font-weight:600;">
                  ${Store.state.roles.map(r => `<option value="${r.id}">${r.emoji} ${this.esc(r.name)}</option>`).join('')}
                </select>
              </div>
              <div>
                <label style="font-size:0.72rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">Wybierz Ćwiartkę:</label>
                <select name="q" class="input-clean" style="font-weight:600;">
                  <option value="2">💎 Q2: Ważne, niepilne</option>
                  <option value="1">🔥 Q1: Pilne i Ważne</option>
                  <option value="3">⚡ Q3: Pilne, nieważne</option>
                  <option value="4">🗑️ Q4: Niepilne, nieważne</option>
                </select>
              </div>
            </div>
            <button type="submit" class="btn btn-primary" style="justify-content:center; padding:10px;">
              + Zapisz w kalendarzu (${dateStr})
            </button>
          </form>
        </div>
      </div>
    `;
  },

  saveCalendarReminder(dateStr, form) {
    const title = form.title.value.trim();
    if (!title) return;
    const note = form.note ? form.note.value.trim() : '';
    const roleId = form.roleId.value || Store.state.roles[0].id;
    const q = parseInt(form.q.value, 10) || 2;

    Store.state.reminders.push({
      id: 'c_' + Date.now(),
      date: dateStr,
      title,
      note,
      roleId,
      q,
      activatedTaskId: null,
      done: false,
      createdAt: Date.now()
    });
    this.processDueReminders();
    this.save();
    this.renderAll();
    this.openCalendarModal(dateStr);
  },

  deleteReminder(id, dateStr) {
    const rem = Store.state.reminders.find(r => r.id === id);
    const label = rem ? `„${rem.title}”` : 'to przypomnienie';
    if (!confirm(`Czy na pewno chcesz usunąć ${label} z kalendarza?`)) return;
    if (rem && rem.activatedTaskId) {
      Store.state.tasks = Store.state.tasks.filter(t => t.id !== rem.activatedTaskId);
    }
    Store.state.reminders = Store.state.reminders.filter(r => r.id !== id);
    this.save();
    this.renderAll();
    this.openCalendarModal(dateStr);
  },

  /* ---- ZAKŁADKA 2: MATRYCA EISENHOWERA ---- */
  renderMatrix() {
    const meta = [
      { q: 1, title: '🔥 Ćwiartka I: Pilne i Ważne', sub: 'Zrób od razu: kryzysy, pożary, nieprzekraczalne terminy na dziś' },
      { q: 2, title: '💎 Ćwiartka II: Niepilne, ale Ważne', sub: 'Najważniejsze Głazy: rozwój, studia, zdrowie, planowanie, cele ról' },
      { q: 3, title: '⚡ Ćwiartka III: Pilne, ale Nieważne', sub: 'Bieżączka i konserwacja: maile, pranie, czyszczenie, drobne porządki' },
      { q: 4, title: '🗑️ Ćwiartka IV: Niepilne i Nieważne', sub: 'Rozpraszacze i zjadacze czasu do odrzucenia' }
    ];
    const today = this.today();
    const tasks = Store.state.tasks.filter(t => (t.year || Store.state.year) === Store.state.year);

    const gridEl = document.getElementById('matrixGrid');
    if (!gridEl) return;
    gridEl.innerHTML = meta.map(m => {
      const list = tasks.filter(t => (t.q || 2) === m.q);
      return `
        <div class="quad-card q${m.q}">
          <div>
            <h3 style="font-size:0.95rem; font-weight:800;">${m.title} (${list.length})</h3>
            <p style="font-size:0.76rem; color:var(--text-muted);">${m.sub}</p>
          </div>
          <div class="task-list" style="flex:1;">
            ${list.length ? list.map(t => {
              if (!t.sawId && this.editingTaskId === t.id) {
                return `<div class="task-row task-row-macos">${this.renderInlineTaskEditor(t)}</div>`;
              }
              const sawObj = t.sawId ? (Store.state.saw || []).find(s => s.id === t.sawId) : null;
              const isBookTask = Boolean(sawObj && sawObj.isBookTracker);
              const bookTitleSuffix = (isBookTask && sawObj.book && sawObj.book.bookTitle)
                ? `: „${sawObj.book.bookTitle}”`
                : '';
              const r = Store.state.roles.find(x => x.id === t.roleId);
              const rawDiff = D.diff(today, t.scheduledDate || today);
              const delay = Math.max(0, rawDiff);
              const daysUntil = rawDiff < 0 ? Math.abs(rawDiff) : 0;
              const dblAttr = !t.sawId ? `ondblclick="App.startEditTask('${t.id}', event)"` : '';
              const dblTitle = !t.sawId ? `title="Kliknij dwukrotnie, aby edytować przypomnienie"` : '';
              return `
                <div class="task-row task-row-macos ${!t.sawId ? 'task-row-editable' : ''}" style="${t.sawId ? 'border-left: 3px solid var(--emerald);' : ''}" ${dblAttr}>
                  <button class="check-circle" style="margin-top:2px;" onclick="App.doneTask('${t.id}')" title="Odhacz jako wykonane">✓</button>
                  <div class="task-main-col">
                    <div class="task-title-line">
                      <span class="task-title-main ${!t.sawId ? 'task-editable-title' : ''}" ${dblTitle}>${this.esc(t.title + bookTitleSuffix)}</span>
                      ${t.isGoalSubtask ? `<span style="font-size:0.65rem; color:var(--accent); background:var(--accent-light); border:1px solid var(--border); padding:1px 6px; border-radius:999px; font-weight:800;">🎯 Cel</span>` : ''}
                      ${t.sawId ? `<span style="font-size:0.65rem; color:var(--emerald); background:var(--emerald-light); padding:1px 6px; border-radius:999px; font-weight:700;">🪚 ${this.esc((t.sawDate || '').slice(5))}</span>` : ''}
                      ${t.fromCalendarDate ? `<span style="font-size:0.68rem; color:var(--accent); background:var(--accent-light); padding:1px 6px; border-radius:999px; font-weight:700;">📅 ${t.fromCalendarDate.slice(5)}</span>` : ''}
                      ${daysUntil > 0 ? `<span style="font-size:0.68rem; color:var(--amber); background:var(--amber-light); border:1px solid rgba(217,119,6,0.3); padding:1px 7px; border-radius:999px; font-weight:800;" title="Przypomnienie z wyprzedzeniem — termin właściwy: ${t.scheduledDate}">🔔 Termin za ${daysUntil} ${daysUntil === 1 ? 'dzień' : 'dni'} (${this.esc((t.scheduledDate || '').slice(5))})</span>` : ''}
                      ${delay > 0 ? `<span style="font-size:0.68rem; color:var(--crimson); background:var(--crimson-light); border:1px solid rgba(220,38,38,0.25); padding:1px 7px; border-radius:999px; font-weight:800;">⏳ ${delay} ${delay === 1 ? 'dzień' : 'dni'} opóźnienia</span>` : ''}
                    </div>
                    ${isBookTask ? this.renderBookCardWidget(sawObj, t.id) : ''}
                    ${this.renderTaskNoteBlock(t)}
                  </div>
                  <div style="display:flex; align-items:center; gap:5px; flex-shrink:0;">
                    <span style="font-size:0.72rem; color:var(--text-muted); cursor:pointer; padding:2px 6px; border-radius:4px; background:var(--surface);" onclick="App.cycleRole('${t.id}')" title="Kliknij, aby zmienić rodzaj (Ciało / Umysł / Relacje / Finanse)">${r ? r.emoji + ' ' + this.esc(r.name) : ''}</span>
                    ${this.renderQTagWithTooltip(t.id, t.q || 2)}
                    <button type="button" class="btn" style="padding:2px 6px; font-size:0.74rem; line-height:1;" onclick="App.openRescheduleModal('${t.id}', 'task')" title="Zmień datę zadania (przełóż na inny dzień)">📅</button>
                    <button type="button" class="btn" style="padding:2px 7px; font-size:0.74rem; line-height:1;" onclick="App.deleteActiveTask('${t.id}')" title="Usuń przypomnienie / zadanie (zniknie z Filaru, Matrycy i Kalendarza)">✕</button>
                  </div>
                </div>
              `;
            }).join('') : `<div style="color:var(--text-dim); font-size:0.8rem; margin:auto 0; text-align:center;">Brak zadań w tej ćwiartce</div>`}
          </div>
          <form class="quick-add-row" onsubmit="event.preventDefault(); App.addTaskFromMatrix(${m.q}, this);" style="padding-top:10px; border-top:1px solid var(--border);">
            <input type="text" name="title" class="input-clean" placeholder="+ Dodaj zadanie do Q${m.q}..." required style="flex:1;">
            <select name="roleId" class="input-clean" style="width:auto; max-width:170px; font-weight:600; cursor:pointer;" title="Wybierz rodzaj (Ciało, Umysł, Relacje, Praca & Finanse)">
              ${Store.state.roles.map(r => `<option value="${r.id}">${r.emoji} ${this.esc(r.name)}</option>`).join('')}
            </select>
            <button type="submit" class="btn btn-primary">+</button>
          </form>
        </div>
      `;
    }).join('');
  },

  addTaskFromMatrix(q, form) {
    const title = form.title.value.trim();
    if (!title) return;
    const today = this.today();
    const roleId = form.roleId.value || Store.state.roles[0].id;
    Store.state.tasks.push({
      id: 't_' + Date.now(),
      title,
      roleId,
      q,
      scheduledDate: today,
      delayDays: 0,
      year: Store.state.year,
      createdAt: Date.now()
    });
    form.title.value = '';
    this.save();
    this.renderAll();
  },

  cycleRole(id) {
    const t = Store.state.tasks.find(x => x.id === id);
    if (!t || !Store.state.roles.length) return;
    const idx = Store.state.roles.findIndex(r => r.id === t.roleId);
    const nextIdx = (idx + 1) % Store.state.roles.length;
    t.roleId = Store.state.roles[nextIdx].id;
    this.save();
    this.renderAll();
  },

  /* ---- ZAKŁADKA 3: OSTRZENIE PIŁY (DNI TYGODNIA + DŁUŻSZE CYKLE + DATA STARTU + WYPRZEDZENIE) ---- */
  editingSawId: null,
  newSawDays: [0, 1, 2, 3, 4, 5, 6],
  newSawFreq: 'weekdays',

  getSawFreqLabel(freq) {
    const map = {
      weekdays: 'Wybrane dni tygodnia (Pn–Nd)',
      biweekly: 'Co 2 tygodnie',
      monthly: 'Co miesiąc',
      quarterly: 'Co 3 miesiące (co kwartał)',
      semiannual: 'Co pół roku (co 6 mies.)',
      yearly: 'Co rok'
    };
    return map[freq || 'weekdays'] || 'Wybrane dni tygodnia';
  },

  getSawLeadLabel(leadDays) {
    const n = parseInt(leadDays, 10) || 0;
    if (n <= 0) return 'W dniu terminu';
    if (n === 1) return '1 dzień wcześniej';
    if (n === 7) return '7 dni wcześniej (1 tydz.)';
    if (n === 14) return '14 dni wcześniej (2 tyg.)';
    if (n === 30) return '30 dni wcześniej (1 mies.)';
    return `${n} dni wcześniej`;
  },

  getSawNextOccurrence(s) {
    const today = this.today();
    const start = s.startDate || today;
    const freq = s.freq || 'weekdays';
    const done = Array.isArray(s.doneDays) ? s.doneDays : [];
    const dismissed = Array.isArray(s.dismissedDays) ? s.dismissedDays : [];

    if (freq === 'weekdays') {
      const act = Array.isArray(s.activeDays) ? s.activeDays : [0, 1, 2, 3, 4, 5, 6];
      if (!act.length) return null;
      let cur = start > today ? start : today;
      for (let i = 0; i < 14; i++) {
        if (act.includes(D.dow(cur)) && !done.includes(cur)) return cur;
        cur = D.addDays(cur, 1);
      }
      return start;
    }

    for (let k = 0; k < 400; k++) {
      const occ = this.getSawOccurrenceDate(s, k);
      if (occ >= today && !done.includes(occ) && !dismissed.includes(occ)) {
        return occ;
      }
    }
    return start;
  },

  getSawCycleLabel(s) {
    if ((s.freq || 'weekdays') !== 'weekdays') {
      return this.getSawFreqLabel(s.freq);
    }
    const days = ['Pn','Wt','Śr','Cz','Pt','Sb','Nd'];
    const act = Array.isArray(s.activeDays) ? s.activeDays : [0,1,2,3,4,5,6];
    if (act.length === 7) return 'Codziennie';
    if (act.length === 0) return 'Brak dni';
    return act.slice().sort((a,b) => a - b).map(i => days[i]).join(', ');
  },

  _sawEditTimer: null,

  toggleEditSaw(id) {
    if (this._sawEditTimer) {
      clearTimeout(this._sawEditTimer);
      this._sawEditTimer = null;
      Store.persist(false, true, true);
    }
    this.editingSawId = (this.editingSawId === id) ? null : id;
    this.renderAll();
  },

  updateSawTitle(id, val) {
    if (this.editingSawId !== id) return;
    const s = Store.state.saw.find(x => x.id === id);
    if (!s) return;
    s.title = val;
    (Store.state.tasks || []).forEach(t => { if (t.sawId === id) t.title = val; });
    Store.persist(false, false, true);
    this.renderPlan();
    this.renderMatrix();
    clearTimeout(this._sawEditTimer);
    this._sawEditTimer = setTimeout(() => {
      this._sawEditTimer = null;
      if (window.Sync && typeof window.Sync.pushToCloud === 'function') {
        window.Sync.pushToCloud();
      }
    }, 300);
  },

  updateSawNote(id, val) {
    if (this.editingSawId !== id) return;
    const s = Store.state.saw.find(x => x.id === id);
    if (!s) return;
    s.note = val;
    (Store.state.tasks || []).forEach(t => { if (t.sawId === id) t.note = val; });
    Store.persist(false, false, true);
    this.renderPlan();
    this.renderMatrix();
    clearTimeout(this._sawEditTimer);
    this._sawEditTimer = setTimeout(() => {
      this._sawEditTimer = null;
      if (window.Sync && typeof window.Sync.pushToCloud === 'function') {
        window.Sync.pushToCloud();
      }
    }, 300);
  },

  refreshSawSpawnedTasks(s) {
    // Przelicz aktywne (jeszcze nieodhaczone) zadania tego cyklu po zmianie daty startu, cyklu lub wyprzedzenia
    Store.state.tasks = (Store.state.tasks || []).filter(t => t.sawId !== s.id);
    s.spawnedDates = [];
    this.processDueReminders();
  },

  updateSawFreq(id, newFreq) {
    if (this.editingSawId !== id) return;
    const s = Store.state.saw.find(x => x.id === id);
    if (!s) return;
    s.freq = newFreq || 'weekdays';
    this.refreshSawSpawnedTasks(s);
    this.save();
    this.renderAll();
  },

  updateSawStartDate(id, newDateStr) {
    if (this.editingSawId !== id) return;
    const s = Store.state.saw.find(x => x.id === id);
    if (!s || !newDateStr) return;
    s.startDate = newDateStr;
    this.refreshSawSpawnedTasks(s);
    this.save();
    this.renderAll();
  },

  updateSawLeadDays(id, newLead) {
    if (this.editingSawId !== id) return;
    const s = Store.state.saw.find(x => x.id === id);
    if (!s) return;
    s.leadDays = Math.max(0, parseInt(newLead, 10) || 0);
    this.refreshSawSpawnedTasks(s);
    this.save();
    this.renderAll();
  },

  toggleSawActiveDay(id, dowIdx) {
    if (this.editingSawId !== id) return; // Zablokowane jeśli nie kliknięto „Edytuj”
    const s = Store.state.saw.find(x => x.id === id);
    if (!s) return;
    if (!Array.isArray(s.activeDays)) s.activeDays = [0,1,2,3,4,5,6];
    const today = this.today();
    const todayDow = D.dow(today);

    const i = s.activeDays.indexOf(dowIdx);
    if (i >= 0) {
      s.activeDays.splice(i, 1);
      if (dowIdx === todayDow) {
        const taskId = `t_saw_${s.id}_${today}`;
        Store.state.tasks = Store.state.tasks.filter(t => t.id !== taskId);
        if (Array.isArray(s.spawnedDates)) {
          s.spawnedDates = s.spawnedDates.filter(d => d !== today);
        }
      }
    } else {
      s.activeDays.push(dowIdx);
      if (dowIdx === todayDow && Array.isArray(s.spawnedDates)) {
        s.spawnedDates = s.spawnedDates.filter(d => d !== today);
      }
    }
    s.activeDays.sort((a, b) => a - b);
    this.processDueReminders();
    this.save();
    this.renderAll();
  },

  cycleSawQ(id, requireEdit = false) {
    if (requireEdit && this.editingSawId !== id) return;
    const s = Store.state.saw.find(x => x.id === id);
    if (!s) return;
    s.q = ((s.q || 2) % 4) + 1;
    (Store.state.tasks || []).forEach(t => { if (t.sawId === id) t.q = s.q; });
    this.save();
    this.renderAll();
  },

  updateSawRole(id, roleId) {
    if (this.editingSawId !== id) return;
    const s = Store.state.saw.find(x => x.id === id);
    if (!s) return;
    s.roleId = roleId;
    (Store.state.tasks || []).forEach(t => { if (t.sawId === id) t.roleId = roleId; });
    this.save();
    this.renderAll();
  },

  deleteSaw(id) {
    const s = (Store.state.saw || []).find(x => x.id === id);
    const label = s ? `„${s.title}”` : 'tę pozycję';
    if (!confirm(`Czy na pewno chcesz usunąć ${label} z Ostrzenia Piły?`)) return;
    Store.state.saw = Store.state.saw.filter(x => x.id !== id);
    Store.state.tasks = Store.state.tasks.filter(t => t.sawId !== id);
    if (this.editingSawId === id) this.editingSawId = null;
    this.save();
    this.renderAll();
  },

  renderSaw() {
    const days = ['Pn','Wt','Śr','Cz','Pt','Sb','Nd'];
    const el = document.getElementById('sawContainer');
    if (!el) return;
    el.innerHTML = `
      <table class="clean-table">
        <thead>
          <tr>
            <th style="width:28%;">Ostrzenie Piły (Nawyk / Zadanie cykliczne)</th>
            <th style="width:20%;">Rola (Gdzie wskakuje)</th>
            <th style="width:8%;">Ćwiartka</th>
            <th style="width:44%;">Cykl, Data Startu & Wyprzedzenie</th>
          </tr>
        </thead>
        <tbody>
          ${Store.state.saw.map(s => {
            const isEditing = (this.editingSawId === s.id);
            const freq = s.freq || 'weekdays';
            const leadDays = Math.max(0, parseInt(s.leadDays, 10) || 0);
            const startDate = s.startDate || this.today();
            const nextOcc = this.getSawNextOccurrence(s);
            const act = Array.isArray(s.activeDays) ? s.activeDays : [0,1,2,3,4,5,6];
            const role = Store.state.roles.find(r => r.id === (s.roleId || 'r1')) || Store.state.roles[0];
            return `
              <tr style="${isEditing ? 'background:var(--accent-light);' : ''}">
                <td>
                  ${isEditing ? `
                    <input type="text" class="input-clean" style="font-weight:700; padding:6px 9px; margin-bottom:5px;" value="${this.esc(s.title)}" oninput="App.updateSawTitle('${s.id}', this.value)" placeholder="Nazwa zadania...">
                    <input type="text" class="input-clean" style="font-size:0.75rem; padding:4px 8px; color:var(--text-muted);" value="${this.esc(s.note || '')}" oninput="App.updateSawNote('${s.id}', this.value)" placeholder="Notatka (opcjonalnie)...">
                  ` : `
                    <strong>${this.esc(s.title)}${(s.isBookTracker && s.book && s.book.bookTitle) ? `: „${this.esc(s.book.bookTitle)}”` : ''}</strong>
                    ${s.note ? `<div style="font-size:0.74rem; color:var(--text-muted); margin-top:2px; white-space:pre-wrap;">${this.esc(s.note)}</div>` : ''}
                  `}
                  ${s.isBookTracker ? this.renderBookSawPanel(s) : ''}
                  <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:5px;">
                    <span style="font-size:0.7rem; color:var(--text-muted); background:var(--surface-alt); border:1px solid var(--border); padding:1px 7px; border-radius:999px;">
                      📅 Start: <strong>${this.esc(startDate)}</strong>
                    </span>
                    ${nextOcc ? `
                      <span style="font-size:0.7rem; color:var(--emerald); background:var(--emerald-light); border:1px solid var(--emerald-border); padding:1px 7px; border-radius:999px; font-weight:700;">
                        ⏭️ Następny: ${this.esc(nextOcc)}
                      </span>
                    ` : ''}
                    ${leadDays > 0 ? `
                      <span style="font-size:0.7rem; color:var(--amber); background:var(--amber-light); border:1px solid rgba(217,119,6,0.3); padding:1px 7px; border-radius:999px; font-weight:700;">
                        🔔 Przypomnienie: ${this.esc(this.getSawLeadLabel(leadDays))}
                      </span>
                    ` : ''}
                  </div>
                </td>
                <td>
                  ${isEditing ? `
                    <select class="input-clean" style="padding:5px 8px; font-weight:600;" onchange="App.updateSawRole('${s.id}', this.value)">
                      ${Store.state.roles.map(r => `<option value="${r.id}" ${(s.roleId || 'r1') === r.id ? 'selected' : ''}>${r.emoji} ${this.esc(r.name)}</option>`).join('')}
                    </select>
                  ` : `
                    <span style="font-weight:600;">${role.emoji} ${this.esc(role.name)}</span>
                  `}
                </td>
                <td>
                  <span class="q-tag q${s.q || 2}" style="${isEditing ? 'cursor:pointer;' : 'cursor:default;'}" onclick="App.cycleSawQ('${s.id}', true)" title="${isEditing ? 'Kliknij, aby zmienić ćwiartkę' : 'Kliknij Edytuj, aby zmienić'}">Q${s.q || 2}</span>
                </td>
                <td>
                  <div style="display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                      ${freq === 'weekdays' ? `
                        <div class="week-dots">
                          ${days.map((dLabel, idx) => {
                            const isSelected = act.includes(idx);
                            return `<button type="button" class="dot-btn ${isSelected ? 'done' : ''}"
                              style="${isEditing ? 'cursor:pointer;' : 'cursor:default; opacity:0.88;'}"
                              ${isEditing ? `onclick="App.toggleSawActiveDay('${s.id}', ${idx})"` : 'disabled'}
                              title="${isEditing ? 'Kliknij, aby włączyć/wyłączyć ten dzień tygodnia' : 'Kliknij Edytuj obok, aby zmienić dni'}">${dLabel}</button>`;
                          }).join('')}
                        </div>
                      ` : `
                        <span style="font-size:0.78rem; font-weight:800; color:var(--accent); background:var(--accent-light); border:1px solid var(--border); padding:4px 10px; border-radius:999px;">
                          🔄 ${this.esc(this.getSawFreqLabel(freq))}
                        </span>
                      `}
                      <button type="button" class="btn ${isEditing ? 'btn-primary' : ''}" style="padding:3px 10px; font-size:0.74rem;" onclick="App.toggleEditSaw('${s.id}')">
                        ${isEditing ? '✓ Zapisz' : '✏️ Edytuj'}
                      </button>
                      <button type="button" class="btn" style="padding:3px 7px;" onclick="App.deleteSaw('${s.id}')" title="Usuń pozycję">✕</button>
                    </div>

                    ${isEditing ? `
                      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:8px; padding:10px; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm);">
                        <div>
                          <label style="font-size:0.68rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:2px;">Częstotliwość (Cykl):</label>
                          <select class="input-clean" style="padding:5px 8px; font-weight:600; font-size:0.76rem;" onchange="App.updateSawFreq('${s.id}', this.value)">
                            <option value="weekdays" ${freq === 'weekdays' ? 'selected' : ''}>Wybrane dni tygodnia (Pn–Nd)</option>
                            <option value="biweekly" ${freq === 'biweekly' ? 'selected' : ''}>Co 2 tygodnie</option>
                            <option value="monthly" ${freq === 'monthly' ? 'selected' : ''}>Co miesiąc</option>
                            <option value="quarterly" ${freq === 'quarterly' ? 'selected' : ''}>Co 3 miesiące (co kwartał)</option>
                            <option value="semiannual" ${freq === 'semiannual' ? 'selected' : ''}>Co pół roku (co 6 mies.)</option>
                            <option value="yearly" ${freq === 'yearly' ? 'selected' : ''}>Co rok</option>
                          </select>
                        </div>
                        <div>
                          <label style="font-size:0.68rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:2px;">Dokładna data startu:</label>
                          <input type="date" class="input-clean" style="padding:4px 8px; font-weight:600; font-size:0.76rem;" value="${this.esc(startDate)}" onchange="App.updateSawStartDate('${s.id}', this.value)">
                        </div>
                        <div>
                          <label style="font-size:0.68rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:2px;">Przypomnij z wyprzedzeniem:</label>
                          <select class="input-clean" style="padding:5px 8px; font-weight:600; font-size:0.76rem;" onchange="App.updateSawLeadDays('${s.id}', this.value)">
                            <option value="0" ${leadDays === 0 ? 'selected' : ''}>W dniu terminu (0 dni)</option>
                            <option value="1" ${leadDays === 1 ? 'selected' : ''}>1 dzień wcześniej</option>
                            <option value="2" ${leadDays === 2 ? 'selected' : ''}>2 dni wcześniej</option>
                            <option value="3" ${leadDays === 3 ? 'selected' : ''}>3 dni wcześniej</option>
                            <option value="7" ${leadDays === 7 ? 'selected' : ''}>7 dni wcześniej (1 tydzień)</option>
                            <option value="14" ${leadDays === 14 ? 'selected' : ''}>14 dni wcześniej (2 tygodnie)</option>
                            <option value="30" ${leadDays === 30 ? 'selected' : ''}>30 dni wcześniej (1 miesiąc)</option>
                          </select>
                        </div>
                      </div>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  },

  toggleNewSawModalDay(idx) {
    const i = this.newSawDays.indexOf(idx);
    if (i >= 0) this.newSawDays.splice(i, 1);
    else this.newSawDays.push(idx);
    this.newSawDays.sort((a, b) => a - b);
    const days = ['Pn','Wt','Śr','Cz','Pt','Sb','Nd'];
    const wrap = document.getElementById('modalNewSawDaysWrap');
    if (wrap) {
      wrap.innerHTML = days.map((dLabel, dIdx) => {
        const isSel = this.newSawDays.includes(dIdx);
        return `<button type="button" class="dot-btn ${isSel ? 'done' : ''}" style="width:34px; height:34px; font-size:0.78rem;" onclick="App.toggleNewSawModalDay(${dIdx})">${dLabel}</button>`;
      }).join('');
    }
  },

  onNewSawFreqChange(val) {
    this.newSawFreq = val || 'weekdays';
    const weekdaysBox = document.getElementById('modalNewSawWeekdaysSection');
    if (weekdaysBox) {
      weekdaysBox.style.display = (this.newSawFreq === 'weekdays') ? 'block' : 'none';
    }
  },

  openAddSawModal() {
    const root = document.getElementById('modalRoot');
    if (!root) return;
    this.newSawDays = [0, 1, 2, 3, 4, 5, 6];
    this.newSawFreq = 'weekdays';
    const days = ['Pn','Wt','Śr','Cz','Pt','Sb','Nd'];
    const today = this.today();

    root.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) App.closeModal()">
        <div class="modal" style="max-width:540px;">
          <div class="modal-header">
            <div>
              <h3 style="font-size:1.1rem; font-weight:800;">🪚 Dodaj do Ostrzenia Piły</h3>
              <p style="font-size:0.76rem; color:var(--text-muted); margin-top:2px;">
                Ustaw nawyk tygodniowy lub dłuższy cel cykliczny (co 2 tygodnie, co miesiąc, co 3 miesiące, co pół roku, co rok) z dokładną datą startu i wyprzedzeniem.
              </p>
            </div>
            <button class="btn" onclick="App.closeModal()">✕</button>
          </div>

          <form onsubmit="event.preventDefault(); App.saveNewSaw(this);" style="display:flex; flex-direction:column; gap:12px;">
            <div>
              <label style="font-size:0.74rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">Nazwa nawyku / zadania cyklicznego:</label>
              <input type="text" name="title" class="input-clean" placeholder="np. Wyjście na spacer, Przegląd kwartalny, Dentysta co pół roku..." required autofocus>
            </div>

            <div>
              <label style="font-size:0.74rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">Notatka pod zadaniem (opcjonalnie):</label>
              <textarea name="note" class="input-clean" rows="2" style="resize:vertical; font-size:0.78rem; color:var(--text-muted);" placeholder="Dodatkowe szczegóły widoczne pod tytułem zadania..."></textarea>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div>
                <label style="font-size:0.74rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">Wybierz Rolę (z 4):</label>
                <select name="roleId" class="input-clean" style="font-weight:600;">
                  ${Store.state.roles.map(r => `<option value="${r.id}">${r.emoji} ${this.esc(r.name)}</option>`).join('')}
                </select>
              </div>
              <div>
                <label style="font-size:0.74rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">Wybierz Ćwiartkę:</label>
                <select name="q" class="input-clean" style="font-weight:600;">
                  <option value="2">💎 Q2: Ważne, niepilne</option>
                  <option value="1">🔥 Q1: Pilne i Ważne</option>
                  <option value="3">⚡ Q3: Pilne, nieważne</option>
                  <option value="4">🗑️ Q4: Niepilne, nieważne</option>
                </select>
              </div>
            </div>

            <div>
              <label style="font-size:0.74rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">Częstotliwość (Cykl w perspektywie):</label>
              <select name="freq" class="input-clean" style="font-weight:700;" onchange="App.onNewSawFreqChange(this.value)">
                <option value="weekdays">📅 Wybrane dni tygodnia (Pn–Nd)</option>
                <option value="biweekly">🔄 Co 2 tygodnie (co 14 dni od daty startu)</option>
                <option value="monthly">🗓️ Co miesiąc (od wybranej daty startu)</option>
                <option value="quarterly">📊 Co 3 miesiące / Co kwartał</option>
                <option value="semiannual">🌗 Co pół roku (co 6 miesięcy)</option>
                <option value="yearly">🎯 Co rok (co 12 miesięcy)</option>
              </select>
            </div>

            <div id="modalNewSawWeekdaysSection">
              <label style="font-size:0.74rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:6px;">Zaznacz dni tygodnia (Pn–Nd), w które ma się pojawiać:</label>
              <div class="week-dots" id="modalNewSawDaysWrap" style="gap:6px;">
                ${days.map((dLabel, dIdx) => `
                  <button type="button" class="dot-btn done" style="width:34px; height:34px; font-size:0.78rem;" onclick="App.toggleNewSawModalDay(${dIdx})">${dLabel}</button>
                `).join('')}
              </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div>
                <label style="font-size:0.74rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">Dokładna data startu (1. termin):</label>
                <input type="date" name="startDate" class="input-clean" style="font-weight:700;" value="${today}" required>
              </div>
              <div>
                <label style="font-size:0.74rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">Przypomnij z wyprzedzeniem:</label>
                <select name="leadDays" class="input-clean" style="font-weight:600;">
                  <option value="0">W dniu terminu (0 dni)</option>
                  <option value="1">1 dzień wcześniej</option>
                  <option value="2">2 dni wcześniej</option>
                  <option value="3">3 dni wcześniej</option>
                  <option value="7">7 dni wcześniej (1 tydzień)</option>
                  <option value="14">14 dni wcześniej (2 tygodnie)</option>
                  <option value="30">30 dni wcześniej (1 miesiąc)</option>
                </select>
              </div>
            </div>

            <button type="submit" class="btn btn-primary" style="justify-content:center; padding:10px;">
              + Zapisz w Ostrzeniu Piły
            </button>
          </form>
        </div>
      </div>
    `;
  },

  saveNewSaw(form) {
    const title = form.title.value.trim();
    if (!title) return;
    const note = form.note ? form.note.value.trim() : '';
    const roleId = form.roleId.value || Store.state.roles[0].id;
    const q = parseInt(form.q.value, 10) || 2;
    const freq = form.freq ? form.freq.value : 'weekdays';
    const startDate = (form.startDate && form.startDate.value) ? form.startDate.value : this.today();
    const leadDays = form.leadDays ? (parseInt(form.leadDays.value, 10) || 0) : 0;

    Store.state.saw.push({
      id: 's_' + Date.now(),
      title,
      note,
      roleId,
      q,
      freq,
      leadDays,
      activeDays: [...this.newSawDays],
      startDate,
      spawnedDates: [],
      doneDays: [],
      dismissedDays: [],
      createdAt: Date.now()
    });
    this.processDueReminders();
    this.save();
    this.closeModal();
    this.renderAll();
  },

  /* ---- ZAKŁADKA 4: CELE (TRWAŁE CELE Z PRZYCISKIEM EDYCJI + NOTATKI + PODZADANIA) ---- */
  _renderedGoalsYear: null,
  editingGoalKey: null,         // np. 'r1:weekly' lub 'r1:quarterly'
  editingGoalSubtaskKey: null,  // np. 'task:t_goal_...' lub 'reminder:c_goal_...'

  startEditGoal(roleId, horizon) {
    this.editingGoalKey = `${roleId}:${horizon}`;
    this.renderGoalFields();
    setTimeout(() => {
      const inp = document.getElementById(`goalEditInput_${roleId}_${horizon}`);
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }, 0);
  },

  cancelEditGoal() {
    this.editingGoalKey = null;
    this.renderGoalFields();
  },

  commitEditGoal(roleId, horizon) {
    const inp = document.getElementById(`goalEditInput_${roleId}_${horizon}`);
    const noteInp = document.getElementById(`goalEditNote_${roleId}_${horizon}`);
    const val = inp ? inp.value.trim() : '';
    const noteVal = noteInp ? noteInp.value.trim() : '';
    const y = Store.state.year;
    if (!Store.state.goals[y]) Store.state.goals[y] = {};
    if (!Store.state.goals[y][roleId]) Store.state.goals[y][roleId] = {};
    Store.state.goals[y][roleId][horizon] = val;
    Store.state.goals[y][roleId][horizon + 'Note'] = noteVal;
    if (!Store.state.fieldStamps) Store.state.fieldStamps = {};
    const now = Date.now();
    Store.state.fieldStamps[`goal:${y}:${roleId}:${horizon}`] = now;
    Store.state.fieldStamps[`goal:${y}:${roleId}:${horizon}Note`] = now;

    this.editingGoalKey = null;
    this.save();
    this.renderPlan();
    this.renderGoalFields();
  },

  renderGoalFields() {
    const y = Store.state.year;
    const gYear = Store.state.goals[y] || {};
    const smartPlaceholders = {
      r1: {
        weekly: 'np. 7 spacerów po min. 30 min (ok. 3 km) do niedzieli',
        quarterly: 'np. Zrealizować min. 75 spacerów po 30 min i 24 treningi do końca kwartału'
      },
      r2: {
        weekly: 'np. 7 wpisów w dzienniku + oddać 1 gotowy projekt WSB do niedzieli',
        quarterly: 'np. Zaliczyć 100% przedmiotów w 1. terminie i przeczytać 3 książki w tym kwartale'
      },
      r3: {
        weekly: 'np. Min. 3 wieczory po 2h z bliskimi bez telefonu w tym tygodniu',
        quarterly: 'np. Zorganizować 6 wspólnych wyjść/spotkań z bliskimi w tym kwartale'
      },
      r4: {
        weekly: 'np. Opłacić 100% faktur i wysłać 5 ofert na strony WWW do piątku',
        quarterly: 'np. Pozyskać 3 nowe zlecenia na strony WWW (min. X zł) do końca kwartału'
      }
    };

    (Store.state.roles || []).forEach(r => {
      const g = gYear[r.id] || { weekly: '', quarterly: '', weeklyNote: '', quarterlyNote: '' };
      const ph = smartPlaceholders[r.id] || { weekly: 'Wpisz konkretny cel tygodniowy...', quarterly: 'Wpisz mierzalny cel kwartalny...' };

      ['weekly', 'quarterly'].forEach(horizon => {
        const slot = document.getElementById(`goalField_${r.id}_${horizon}`);
        if (!slot) return;
        const isEditing = this.editingGoalKey === `${r.id}:${horizon}`;
        const val = g[horizon] || '';
        const note = g[horizon + 'Note'] || '';

        if (isEditing) {
          slot.innerHTML = `
            <form onsubmit="event.preventDefault(); App.commitEditGoal('${r.id}','${horizon}');" class="goal-edit-box">
              <input type="text" id="goalEditInput_${r.id}_${horizon}" class="input-clean" style="font-weight:700;" value="${this.esc(val)}" placeholder="${this.esc(ph[horizon])}" onkeydown="if(event.key==='Escape') App.cancelEditGoal()">
              <textarea id="goalEditNote_${r.id}_${horizon}" class="input-clean" rows="2" style="resize:vertical; font-size:0.75rem; color:var(--text-muted);" placeholder="Notatka do celu (opcjonalnie)...">${this.esc(note)}</textarea>
              <div style="display:flex; gap:6px; justify-content:flex-end;">
                <button type="button" class="btn" style="padding:4px 10px; font-size:0.74rem;" onclick="App.cancelEditGoal()">Anuluj</button>
                <button type="submit" class="btn btn-primary" style="padding:4px 12px; font-size:0.74rem;">✓ Zapisz cel</button>
              </div>
            </form>
          `;
        } else {
          slot.innerHTML = `
            <div class="goal-locked-card">
              <div style="flex:1; min-width:0;">
                ${val
                  ? `<div class="goal-locked-title">${this.esc(val)}</div>`
                  : `<div class="goal-locked-empty">Brak ustalonego celu — kliknij ✏️ Edytuj</div>`}
                ${note ? `<div class="task-note-text" style="margin-top:3px; cursor:pointer;" onclick="App.startEditGoal('${r.id}','${horizon}')" title="Kliknij, aby edytować cel i notatkę">${this.esc(note)}</div>` : ''}
              </div>
              <div style="display:flex; gap:5px; align-items:center; flex-shrink:0;">
                <button type="button" class="btn" style="padding:5px 9px; font-size:0.73rem;" onclick="App.startEditGoal('${r.id}','${horizon}')" title="Edytuj treść celu i notatkę">✏️ Edytuj</button>
                <button type="button" class="btn" style="padding:5px 9px; font-size:0.73rem; color:var(--emerald); border-color:var(--emerald-border); background:var(--emerald-light);" onclick="App.archiveGoal('${r.id}','${horizon}')" title="Oznacz cel jako zrealizowany i przenieś do Archiwum Celów">✓ Zrobione</button>
              </div>
            </div>
          `;
        }
      });
    });
  },

  renderGoals(forceRebuild = false) {
    const y = Store.state.year;
    const curQ = Math.floor(new Date().getMonth() / 3) + 1;
    const el = document.getElementById('goalsTableContainer');
    if (!el) return;

    const existingTable = document.getElementById('goalsInputsTable');
    if (!forceRebuild && existingTable && this._renderedGoalsYear === y) {
      if (!this.editingGoalKey) this.renderGoalFields();
      if (!this.editingGoalSubtaskKey) this.renderGoalSubtasks();
      this.renderGoalsArchive();
      return;
    }

    this._renderedGoalsYear = y;
    const today = this.today();

    el.innerHTML = `
      <table class="clean-table" id="goalsInputsTable">
        <thead>
          <tr>
            <th style="width:16%;">Rola (Noga Stołu)</th>
            <th style="width:45%;">⚡ Cel Tygodniowy & Podzadania (trwały cel — zmiana przez ✏️ Edytuj)</th>
            <th style="width:39%;">📊 Cel Kwartalny Q${curQ} (${y}) — mierzalny wynik SMART</th>
          </tr>
        </thead>
        <tbody>
          ${Store.state.roles.map(r => `
            <tr>
              <td style="vertical-align:top;"><strong>${r.emoji} ${this.esc(r.name)}</strong></td>
              <td style="vertical-align:top;">
                <div id="goalField_${r.id}_weekly"></div>
                <div class="goal-subtasks-box">
                  <div id="goalSubtasksList_${r.id}" class="goal-subtasks-list"></div>
                  <form class="goal-subtask-form" onsubmit="event.preventDefault(); App.addGoalSubtask('${r.id}', this);">
                    <input type="text" name="title" class="input-clean" placeholder="+ Podzadanie do celu..." required style="flex:1; min-width:120px; padding:5px 8px; font-size:0.75rem;">
                    <input type="date" name="date" class="input-clean" value="${today}" required style="width:auto; padding:4px 6px; font-size:0.73rem; font-weight:600;" title="Zaplanuj dzień realizacji">
                    <select name="q" class="input-clean" style="width:auto; padding:4px 5px; font-size:0.73rem; font-weight:700;" title="Ćwiartka Matrycy">
                      <option value="2" selected>Q2</option>
                      <option value="1">Q1</option>
                      <option value="3">Q3</option>
                      <option value="4">Q4</option>
                    </select>
                    <button type="submit" class="btn btn-primary" style="padding:5px 9px; font-size:0.75rem;" title="Dodaj podzadanie (pojawi się w Roli, Matrycy i Kalendarzu)">+</button>
                  </form>
                </div>
              </td>
              <td style="vertical-align:top;">
                <div id="goalField_${r.id}_quarterly"></div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    this.renderGoalFields();
    this.renderGoalSubtasks();
    this.renderGoalsArchive();
  },

  startEditGoalSubtask(kind, id) {
    this.editingGoalSubtaskKey = `${kind}:${id}`;
    this.renderGoalSubtasks();
    setTimeout(() => {
      const inp = document.getElementById(`subEditTitle_${kind}_${id}`);
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }, 0);
  },

  cancelEditGoalSubtask() {
    this.editingGoalSubtaskKey = null;
    this.renderGoalSubtasks();
  },

  saveEditGoalSubtask(kind, id) {
    const titleEl = document.getElementById(`subEditTitle_${kind}_${id}`);
    const noteEl = document.getElementById(`subEditNote_${kind}_${id}`);
    const newTitle = titleEl ? titleEl.value.trim() : '';
    const newNote = noteEl ? noteEl.value.trim() : '';
    if (!newTitle) {
      alert('Nazwa podzadania nie może być pusta.');
      return;
    }

    if (kind === 'task') {
      const t = (Store.state.tasks || []).find(x => x.id === id);
      if (t) {
        t.title = newTitle;
        t.note = newNote;
        const linkedRem = (Store.state.reminders || []).find(r => r.activatedTaskId === id || (t.remId && r.id === t.remId));
        if (linkedRem) {
          linkedRem.title = newTitle;
          linkedRem.note = newNote;
        }
      }
    } else {
      const rem = (Store.state.reminders || []).find(r => r.id === id);
      if (rem) {
        rem.title = newTitle;
        rem.note = newNote;
        const linkedTask = (Store.state.tasks || []).find(t => t.id === rem.activatedTaskId || t.remId === rem.id);
        if (linkedTask) {
          linkedTask.title = newTitle;
          linkedTask.note = newNote;
        }
      }
    }

    this.editingGoalSubtaskKey = null;
    this.save();
    this.renderAll();
  },

  addGoalSubtask(roleId, form) {
    const title = form.title.value.trim();
    if (!title) return;
    const today = this.today();
    const targetDate = (form.date && form.date.value) ? form.date.value : today;
    const q = parseInt(form.q?.value, 10) || 2;
    const targetYear = parseInt(targetDate.slice(0, 4), 10) || Store.state.year;

    if (targetDate <= today) {
      Store.state.tasks.push({
        id: 't_goal_' + Date.now(),
        title,
        note: '',
        roleId,
        q,
        scheduledDate: targetDate,
        isGoalSubtask: true,
        delayDays: Math.max(0, D.diff(today, targetDate)),
        year: targetYear,
        createdAt: Date.now()
      });
    } else {
      Store.state.reminders.push({
        id: 'c_goal_' + Date.now(),
        date: targetDate,
        title,
        note: '',
        roleId,
        q,
        isGoalSubtask: true,
        activatedTaskId: null,
        done: false,
        createdAt: Date.now()
      });
    }

    form.title.value = '';
    this.save();
    this.renderAll();
  },

  deleteGoalSubtaskReminder(remId) {
    const rem = (Store.state.reminders || []).find(r => r.id === remId);
    const label = rem ? `„${rem.title}”` : 'to podzadanie';
    if (!confirm(`Czy na pewno chcesz usunąć zaplanowane podzadanie ${label}?`)) return;
    if (rem && rem.activatedTaskId) {
      Store.state.tasks = (Store.state.tasks || []).filter(t => t.id !== rem.activatedTaskId);
    }
    Store.state.reminders = (Store.state.reminders || []).filter(r => r.id !== remId);
    this.save();
    this.renderAll();
  },

  renderGoalSubtasks() {
    const today = this.today();
    (Store.state.roles || []).forEach(r => {
      const box = document.getElementById(`goalSubtasksList_${r.id}`);
      if (!box) return;

      const activeSubs = (Store.state.tasks || [])
        .filter(t => t.roleId === r.id && t.isGoalSubtask)
        .map(t => ({
          kind: 'task',
          id: t.id,
          title: t.title,
          note: t.note || '',
          date: t.scheduledDate || today,
          q: t.q || 2,
          delay: Math.max(0, D.diff(today, t.scheduledDate || today))
        }));

      const plannedSubs = (Store.state.reminders || [])
        .filter(rem => rem.roleId === r.id && rem.isGoalSubtask && !rem.done && !rem.activatedTaskId)
        .map(rem => ({
          kind: 'reminder',
          id: rem.id,
          title: rem.title,
          note: rem.note || '',
          date: rem.date || today,
          q: rem.q || 2,
          delay: 0
        }));

      const all = [...activeSubs, ...plannedSubs].sort((a, b) => String(a.date).localeCompare(String(b.date)));

      if (!all.length) {
        box.innerHTML = '';
        return;
      }

      box.innerHTML = all.map(item => {
        const isEditing = this.editingGoalSubtaskKey === `${item.kind}:${item.id}`;
        if (isEditing) {
          return `
            <form class="goal-edit-box" onsubmit="event.preventDefault(); App.saveEditGoalSubtask('${item.kind}','${item.id}');">
              <input type="text" id="subEditTitle_${item.kind}_${item.id}" class="input-clean" style="font-weight:700; font-size:0.78rem; padding:5px 8px;" value="${this.esc(item.title)}" required onkeydown="if(event.key==='Escape') App.cancelEditGoalSubtask()">
              <textarea id="subEditNote_${item.kind}_${item.id}" class="input-clean" rows="2" style="resize:vertical; font-size:0.74rem; color:var(--text-muted);" placeholder="Notatka pod podzadaniem (opcjonalnie)...">${this.esc(item.note || '')}</textarea>
              <div style="display:flex; gap:6px; justify-content:flex-end;">
                <button type="button" class="btn" style="padding:3px 9px; font-size:0.72rem;" onclick="App.cancelEditGoalSubtask()">Anuluj</button>
                <button type="submit" class="btn btn-primary" style="padding:3px 10px; font-size:0.72rem;">✓ Zapisz</button>
              </div>
            </form>
          `;
        }
        return `
          <div class="goal-subtask-row task-row-macos task-row-editable" ondblclick="if(!App._isInteractiveTarget(event)) App.startEditGoalSubtask('${item.kind}','${item.id}')">
            <div style="display:flex; align-items:flex-start; gap:6px; flex:1; min-width:0;">
              ${item.kind === 'task'
                ? `<button type="button" class="check-circle" style="width:15px; height:15px; margin-top:2px;" onclick="App.doneTask('${item.id}')" title="Odhacz podzadanie jako wykonane (trafi do Archiwum)">✓</button>`
                : `<span style="font-size:0.75rem; margin-top:1px;" title="Zaplanowane na przyszły dzień (wskoczy automatycznie w wybranym dniu)">🗓️</span>`}
              <div class="task-main-col">
                <div class="task-title-line">
                  <span class="task-editable-title" style="font-size:0.78rem; font-weight:600; word-break:break-word;" title="Kliknij dwukrotnie, aby edytować podzadanie">${this.esc(item.title)}</span>
                  <span style="font-size:0.66rem; font-weight:700; color:var(--accent); background:var(--accent-light); padding:1px 6px; border-radius:999px;">📅 ${this.esc(item.date.slice(5))}</span>
                  ${item.delay > 0 ? `<span style="font-size:0.65rem; font-weight:800; color:var(--crimson); background:var(--crimson-light); padding:1px 6px; border-radius:999px;">⏳ ${item.delay}d</span>` : ''}
                </div>
                ${item.note.trim()
                  ? `<div class="task-note-text" onclick="App.startEditGoalSubtask('${item.kind}','${item.id}')" title="Kliknij, aby edytować notatkę">${this.esc(item.note)}</div>`
                  : `<div class="task-note-add-hint" onclick="App.startEditGoalSubtask('${item.kind}','${item.id}')">+ Dodaj notatkę...</div>`}
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
              <span class="q-tag q${item.q}" style="font-size:0.62rem; padding:1px 5px;" ${item.kind === 'task' ? `onclick="App.cycleQ('${item.id}')"` : ''}>Q${item.q}</span>
              <button type="button" class="btn" style="padding:1px 5px; font-size:0.68rem;" onclick="App.startEditGoalSubtask('${item.kind}','${item.id}')" title="Edytuj podzadanie i notatkę">✏️</button>
              <button type="button" class="btn" style="padding:1px 5px; font-size:0.68rem;" onclick="App.openRescheduleModal('${item.id}', '${item.kind}')" title="Zmień dzień realizacji">📅</button>
              <button type="button" class="btn" style="padding:1px 5px; font-size:0.68rem;" onclick="${item.kind === 'task' ? `App.deleteActiveTask('${item.id}')` : `App.deleteGoalSubtaskReminder('${item.id}')`}" title="Usuń podzadanie">✕</button>
            </div>
          </div>
        `;
      }).join('');
    });
  },

  _goalSaveTimer: null,
  saveGoal(roleId, horizon, val) {
    const y = Store.state.year;
    if (!Store.state.goals[y]) Store.state.goals[y] = {};
    if (!Store.state.goals[y][roleId]) Store.state.goals[y][roleId] = {};
    Store.state.goals[y][roleId][horizon] = val;
    if (!Store.state.fieldStamps) Store.state.fieldStamps = {};
    Store.state.fieldStamps[`goal:${y}:${roleId}:${horizon}`] = Date.now();

    // Natychmiastowy (0ms) zapis do pamięci urządzenia (localStorage) + oznaczenie zmiany jako oczekującej na wysyłkę
    Store.persist(false, false, true);
    this.renderPlan();

    clearTimeout(this._goalSaveTimer);
    this._goalSaveTimer = setTimeout(() => {
      this._goalSaveTimer = null;
      if (window.Sync && typeof window.Sync.pushToCloud === 'function') {
        window.Sync.pushToCloud();
      }
    }, 250);
  },

  flushPendingGoalSave() {
    if (this._goalSaveTimer) {
      clearTimeout(this._goalSaveTimer);
      this._goalSaveTimer = null;
      Store.persist(false, true, true);
    }
  },

  archiveGoal(roleId, horizon) {
    const y = Store.state.year;
    const curQ = Math.floor(new Date().getMonth() / 3) + 1;
    const text = (Store.state.goals?.[y]?.[roleId]?.[horizon] || '').trim();
    if (!text) {
      alert('To pole celu jest puste — wpisz najpierw cel, aby móc go zarchiwizować.');
      return;
    }

    const noteKey = horizon + 'Note';
    const noteText = (Store.state.goals?.[y]?.[roleId]?.[noteKey] || '').trim();

    if (!Array.isArray(Store.state.goalsArchive)) Store.state.goalsArchive = [];
    const now = new Date();
    const stamp = `${this.today()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    Store.state.goalsArchive.unshift({
      id: 'ga_' + Date.now(),
      title: text,
      note: noteText,
      roleId,
      horizon, // 'weekly' | 'quarterly'
      periodLabel: horizon === 'quarterly' ? `Kwartał Q${curQ} (${y})` : `Tydzień (${this.today()})`,
      doneAt: stamp,
      year: y,
      createdAt: Date.now()
    });

    // Wyczyść zrealizowany cel i jego notatkę z bieżącego pola
    Store.state.goals[y][roleId][horizon] = '';
    Store.state.goals[y][roleId][noteKey] = '';
    if (!Store.state.fieldStamps) Store.state.fieldStamps = {};
    const ts = Date.now();
    Store.state.fieldStamps[`goal:${y}:${roleId}:${horizon}`] = ts;
    Store.state.fieldStamps[`goal:${y}:${roleId}:${noteKey}`] = ts;

    if (this.editingGoalKey === `${roleId}:${horizon}`) {
      this.editingGoalKey = null;
    }

    this.save();
    this.renderGoalFields();
    this.renderPlan();
    this.renderGoalsArchive();
  },

  renderGoalsArchive() {
    const container = document.getElementById('goalsArchiveContainer');
    if (!container) return;
    const y = Store.state.year;

    const filterSel = document.getElementById('goalsArchiveRoleFilter');
    if (filterSel && filterSel.options.length <= 1) {
      Store.state.roles.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = `${r.emoji} ${r.name}`;
        filterSel.appendChild(opt);
      });
    }
    const roleFilter = filterSel ? filterSel.value : 'all';

    const allYear = (Store.state.goalsArchive || []).filter(g => (g.year || y) === y);
    const filtered = allYear.filter(g => roleFilter === 'all' || g.roleId === roleFilter);

    const weeklyDone = filtered.filter(g => g.horizon === 'weekly');
    const quarterlyDone = filtered.filter(g => g.horizon === 'quarterly');

    const renderGroupList = (items, emptyMsg) => {
      if (!items.length) return `<div style="font-size:0.8rem; color:var(--text-dim); padding:14px 0;">${emptyMsg}</div>`;
      return `
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${items.map(item => {
            const role = Store.state.roles.find(r => r.id === item.roleId);
            return `
              <div class="task-row" style="border-left: 3px solid ${role ? role.color : 'var(--emerald)'};">
                <div style="display:flex; flex-direction:column; gap:2px; flex:1; min-width:0;">
                  <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <span style="font-size:0.72rem; font-weight:800; color:var(--emerald);">✓ ${this.esc(item.doneAt)}</span>
                    <span style="font-size:0.72rem; font-weight:700; background:var(--surface); padding:1px 7px; border-radius:999px; border:1px solid var(--border);">${role ? role.emoji + ' ' + this.esc(role.name) : ''}</span>
                    ${item.periodLabel ? `<span style="font-size:0.7rem; color:var(--text-muted);">${this.esc(item.periodLabel)}</span>` : ''}
                  </div>
                  <div style="font-weight:700; font-size:0.85rem; margin-top:2px;">${this.esc(item.title)}</div>
                </div>
                <div style="display:flex; align-items:center; gap:4px;">
                  <button type="button" class="btn" style="padding:3px 8px; font-size:0.72rem;" onclick="App.restoreGoalFromArchive('${item.id}')" title="Przywróć do aktywnego pola celu">↩ Przywróć</button>
                  <button type="button" class="btn" style="padding:3px 7px; font-size:0.72rem;" onclick="App.deleteGoalFromArchive('${item.id}')" title="Usuń z archiwum">✕</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    };

    container.innerHTML = `
      <div class="matrix-2x2">
        <div style="background:var(--surface-alt); border:1px solid var(--border); border-radius:var(--radius-md); padding:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
            <h3 style="font-size:0.92rem; font-weight:800;">⚡ Zrealizowane Cele Tygodniowe (${weeklyDone.length})</h3>
          </div>
          ${renderGroupList(weeklyDone, 'Brak zarchiwizowanych celów tygodniowych.')}
        </div>

        <div style="background:var(--surface-alt); border:1px solid var(--border); border-radius:var(--radius-md); padding:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
            <h3 style="font-size:0.92rem; font-weight:800;">📊 Zrealizowane Cele Kwartalne (${quarterlyDone.length})</h3>
          </div>
          ${renderGroupList(quarterlyDone, 'Brak zarchiwizowanych celów kwartalnych.')}
        </div>
      </div>
    `;
  },

  restoreGoalFromArchive(id) {
    const idx = (Store.state.goalsArchive || []).findIndex(g => g.id === id);
    if (idx < 0) return;
    const [item] = Store.state.goalsArchive.splice(idx, 1);
    const y = Store.state.year;
    if (!Store.state.goals[y]) Store.state.goals[y] = {};
    if (!Store.state.goals[y][item.roleId]) Store.state.goals[y][item.roleId] = {};
    Store.state.goals[y][item.roleId][item.horizon || 'weekly'] = item.title;
    if (!Store.state.fieldStamps) Store.state.fieldStamps = {};
    Store.state.fieldStamps[`goal:${y}:${item.roleId}:${item.horizon || 'weekly'}`] = Date.now();

    this.save();
    this.renderGoals(true);
    this.renderPlan();
  },

  deleteGoalFromArchive(id) {
    const g = (Store.state.goalsArchive || []).find(x => x.id === id);
    const label = g ? `„${g.title}”` : 'ten cel';
    if (!confirm(`Czy na pewno chcesz usunąć zarchiwizowany cel ${label}?`)) return;
    Store.state.goalsArchive = (Store.state.goalsArchive || []).filter(x => x.id !== id);
    this.save();
    this.renderGoalsArchive();
  },

  /* ---- ZAKŁADKA 5: MYŚLI & AFIRMACJE ---- */
  renderMind() {
    const affList = document.getElementById('affList');
    if (affList) {
      affList.innerHTML = Store.state.affirmations.map((a, i) => {
        const txt = typeof a === 'object' ? a.text : a;
        return `
          <div class="task-row" style="background:var(--emerald-light);">
            <span>✨ ${this.esc(txt)}</span>
            <button class="btn" style="padding:2px 6px;" onclick="App.deleteAffirmationAt(${i})">✕</button>
          </div>
        `;
      }).join('');
    }

    const quoteList = document.getElementById('quoteList');
    if (quoteList) {
      quoteList.innerHTML = Store.state.quotes.map((q, i) => {
        const txt = typeof q === 'object' ? q.text : q;
        return `
          <div class="task-row">
            <span>💭 ${this.esc(txt)}</span>
            <button class="btn" style="padding:2px 6px;" onclick="App.deleteQuoteAt(${i})">✕</button>
          </div>
        `;
      }).join('');
    }
  },

  deleteAffirmationAt(i) {
    const a = Store.state.affirmations[i];
    const txt = typeof a === 'object' ? a.text : a;
    if (!confirm(`Czy na pewno chcesz usunąć afirmację „${txt || ''}”?`)) return;
    Store.state.affirmations.splice(i, 1);
    this.save();
    this.renderMind();
    this.renderWelcome();
  },

  deleteQuoteAt(i) {
    const q = Store.state.quotes[i];
    const txt = typeof q === 'object' ? q.text : q;
    if (!confirm(`Czy na pewno chcesz usunąć myśl/cytat „${txt || ''}”?`)) return;
    Store.state.quotes.splice(i, 1);
    this.save();
    this.renderMind();
  },

  addAffirmation() {
    const inp = document.getElementById('affInput');
    if (!inp.value.trim()) return;
    Store.state.affirmations.unshift({ id: 'af_' + Date.now(), text: inp.value.trim(), createdAt: Date.now() });
    inp.value = '';
    this.save();
    this.renderMind();
    this.renderWelcome();
  },

  addQuote() {
    const inp = document.getElementById('quoteInput');
    if (!inp.value.trim()) return;
    Store.state.quotes.unshift({ id: 'q_' + Date.now(), text: inp.value.trim(), createdAt: Date.now() });
    inp.value = '';
    this.save();
    this.renderMind();
  },

  /* ---- ZAKŁADKA 6: ARCHIWUM ---- */
  renderArchive() {
    const y = Store.state.year;
    const list = Store.state.archive.filter(a => (a.year || y) === y);
    const el = document.getElementById('archiveTableContainer');
    if (!el) return;
    el.innerHTML = list.length ? `
      <table class="clean-table">
        <thead>
          <tr>
            <th>Data odkliknięcia</th>
            <th>Zadanie</th>
            <th>Rola</th>
            <th>Ćwiartka</th>
            <th style="text-align:right;">Akcje</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(a => {
            const r = Store.state.roles.find(x => x.id === a.roleId);
            return `
              <tr>
                <td style="color:var(--emerald); font-weight:700;">✓ ${this.esc(a.doneAt)}</td>
                <td>
                  <div style="font-weight:600;">${this.esc(a.title)}</div>
                  ${a.note ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px; white-space:pre-wrap;">${this.esc(a.note)}</div>` : ''}
                </td>
                <td>${r ? r.emoji + ' ' + this.esc(r.name) : '—'}</td>
                <td><span class="q-tag q${a.q || 2}">Q${a.q || 2}</span></td>
                <td style="text-align:right;">
                  <div style="display:inline-flex; gap:6px; align-items:center;">
                    <button type="button" class="btn" style="padding:3px 9px; font-size:0.74rem;" onclick="App.restoreFromArchive('${a.id}')" title="Cofnij odkliknięcie i przywróć zadanie na aktywną listę">↩ Przywróć</button>
                    <button type="button" class="btn" style="padding:3px 8px; font-size:0.74rem;" onclick="App.deleteFromArchive('${a.id}')" title="Usuń całkowicie z Archiwum">✕</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    ` : `<p style="color:var(--text-dim); padding:16px 0;">Brak wykonanych zadań w roku ${y}.</p>`;
  },

  restoreFromArchive(id) {
    const idx = Store.state.archive.findIndex(a => a.id === id);
    if (idx < 0) return;
    const [item] = Store.state.archive.splice(idx, 1);
    Store.state.tasks.push({
      id: 't_' + Date.now(),
      title: item.title,
      note: item.note || '',
      roleId: item.roleId || Store.state.roles[0].id,
      q: item.q || 2,
      scheduledDate: item.scheduledDate || this.today(),
      year: Store.state.year,
      createdAt: Date.now()
    });
    this.save();
    this.renderAll();
  },

  deleteFromArchive(id) {
    const a = (Store.state.archive || []).find(x => x.id === id);
    const label = a ? `„${a.title}”` : 'ten wpis';
    if (!confirm(`Czy na pewno chcesz usunąć zadanie ${label} z Archiwum?`)) return;
    Store.state.archive = Store.state.archive.filter(x => x.id !== id);
    this.save();
    this.renderAll();
  },

  /* ---- SZUFLADA „NA PÓŹNIEJ” Z FOLDERAMI ---- */
  activeLaterFolderId: 'general',

  toggleLater() { document.getElementById('laterDrawer').classList.toggle('open'); },

  selectLaterFolder(folderId) {
    this.activeLaterFolderId = folderId || 'general';
    this.renderLater();
  },

  addLaterFolder() {
    const inp = document.getElementById('laterFolderInput');
    if (!inp) return;
    const name = inp.value.trim();
    if (!name) return;
    if (!Array.isArray(Store.state.laterFolders)) Store.state.laterFolders = [];
    const newFolder = { id: 'lf_' + Date.now(), name, createdAt: Date.now() };
    Store.state.laterFolders.push(newFolder);
    this.activeLaterFolderId = newFolder.id;
    inp.value = '';
    this.save();
    this.renderLater();
  },

  deleteLaterFolder(id, ev) {
    if (ev) ev.stopPropagation();
    const f = (Store.state.laterFolders || []).find(x => x.id === id);
    const label = f ? `„${f.name}”` : 'ten folder';
    if (!confirm(`Czy na pewno chcesz usunąć folder ${label}? Pomysły ze środka zostaną przeniesione do folderu „Ogólne”.`)) return;
    Store.state.laterFolders = (Store.state.laterFolders || []).filter(x => x.id !== id);
    (Store.state.later || []).forEach(l => {
      if (l.folderId === id) l.folderId = null;
    });
    if (this.activeLaterFolderId === id) this.activeLaterFolderId = 'general';
    this.save();
    this.renderLater();
  },

  setLaterItemFolder(laterId, folderId) {
    const item = (Store.state.later || []).find(x => x.id === laterId);
    if (!item) return;
    item.folderId = (!folderId || folderId === 'general') ? null : folderId;
    this.save();
    this.renderLater();
  },

  renderLater() {
    const allItems = Store.state.later || [];
    const folders = Store.state.laterFolders || [];
    const folderIds = new Set(folders.map(f => f.id));
    const cnt = document.getElementById('laterCount');
    if (cnt) cnt.textContent = allItems.length;

    // Jeśli aktywny folder już nie istnieje, wróć do „Ogólne”
    if (this.activeLaterFolderId !== 'general' && !folderIds.has(this.activeLaterFolderId)) {
      this.activeLaterFolderId = 'general';
    }

    const generalItems = allItems.filter(l => !l.folderId || !folderIds.has(l.folderId));

    // Siatka folderów — identyczny rozmiar, symetryczny układ 2 kolumn, ZERO dublowania między folderami
    const foldersEl = document.getElementById('laterFoldersGrid');
    if (foldersEl) {
      const generalTile = `
        <div class="later-folder-card ${this.activeLaterFolderId === 'general' ? 'active' : ''}" onclick="App.selectLaterFolder('general')">
          <span class="later-folder-icon">📁</span>
          <span class="later-folder-name">Ogólne</span>
          <span class="later-folder-count">${generalItems.length}</span>
          <div class="cal-tooltip">
            <div style="font-size:0.68rem; color:#94a3b8; font-weight:700; margin-bottom:2px;">📁 Folder (${generalItems.length} ${generalItems.length === 1 ? 'pomysł' : 'pomysłów'})</div>
            <div style="font-weight:600; color:#ffffff;">Ogólne</div>
          </div>
        </div>
      `;
      const customTiles = folders.map(f => {
        const count = allItems.filter(l => l.folderId === f.id).length;
        const isAct = this.activeLaterFolderId === f.id;
        return `
          <div class="later-folder-card ${isAct ? 'active' : ''}" onclick="App.selectLaterFolder('${f.id}')">
            <span class="later-folder-icon">📁</span>
            <span class="later-folder-name">${this.esc(f.name)}</span>
            <span class="later-folder-count">${count}</span>
            <button type="button" class="later-folder-del" onclick="App.deleteLaterFolder('${f.id}', event)" title="Usuń folder">✕</button>
            <div class="cal-tooltip">
              <div style="font-size:0.68rem; color:#94a3b8; font-weight:700; margin-bottom:2px;">📁 Folder (${count} ${count === 1 ? 'pomysł' : 'pomysłów'})</div>
              <div style="font-weight:600; color:#ffffff;">${this.esc(f.name)}</div>
            </div>
          </div>
        `;
      }).join('');
      foldersEl.innerHTML = generalTile + customTiles;
    }

    // Dopasuj placeholder pola dodawania do aktualnie wybranego folderu
    const inp = document.getElementById('laterInput');
    if (inp) {
      const actFolder = folders.find(f => f.id === this.activeLaterFolderId);
      inp.placeholder = actFolder ? `+ Pomysł do „${actFolder.name}”...` : '+ Pomysł do „Ogólne”...';
    }

    const listEl = document.getElementById('laterList');
    if (!listEl) return;

    const visibleItems = this.activeLaterFolderId === 'general'
      ? generalItems
      : allItems.filter(l => l.folderId === this.activeLaterFolderId);

    if (!visibleItems.length) {
      listEl.innerHTML = `<div style="font-size:0.8rem; color:var(--text-dim); text-align:center; padding:18px 8px;">Brak pomysłów w tym folderze.</div>`;
      return;
    }

    listEl.innerHTML = visibleItems.map(l => `
      <div class="task-row" style="flex-direction:column; align-items:stretch; gap:6px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:6px;">
          <div style="display:flex; flex-direction:column; gap:3px; min-width:0; flex:1;">
            <strong style="word-break:break-word;">💡 ${this.esc(l.title)}</strong>
          </div>
          <button class="btn" style="padding:1px 6px; flex-shrink:0;" onclick="App.removeLater('${l.id}')">✕</button>
        </div>
        ${folders.length ? `
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:0.68rem; color:var(--text-muted); font-weight:600;">Folder:</span>
            <select class="input-clean" style="padding:3px 6px; font-size:0.72rem; flex:1;" onchange="App.setLaterItemFolder('${l.id}', this.value)">
              <option value="general" ${!l.folderId || !folderIds.has(l.folderId) ? 'selected' : ''}>📁 Ogólne</option>
              ${folders.map(f => `<option value="${f.id}" ${l.folderId === f.id ? 'selected' : ''}>📁 ${this.esc(f.name)}</option>`).join('')}
            </select>
          </div>
        ` : ''}
        <div style="display:flex; gap:4px; flex-wrap:wrap;">
          ${Store.state.roles.map(r => `
            <button class="btn" style="font-size:0.7rem; padding:2px 6px;" onclick="App.moveLaterToRole('${l.id}','${r.id}')">→ ${r.emoji} ${this.esc(r.name)}</button>
          `).join('')}
        </div>
      </div>
    `).join('');
  },

  addLater() {
    const inp = document.getElementById('laterInput');
    if (!inp.value.trim()) return;
    const folderId = this.activeLaterFolderId === 'general' ? null : this.activeLaterFolderId;
    Store.state.later.unshift({
      id: 'l_' + Date.now(),
      title: inp.value.trim(),
      folderId,
      createdAt: Date.now()
    });
    inp.value = '';
    this.save();
    this.renderLater();
  },

  moveLaterToRole(laterId, roleId) {
    const idx = Store.state.later.findIndex(x => x.id === laterId);
    if (idx < 0) return;
    const [item] = Store.state.later.splice(idx, 1);
    Store.state.tasks.push({ id: 't_' + Date.now(), title: item.title, roleId, q: 2, year: Store.state.year, createdAt: Date.now() });
    this.save();
    this.renderAll();
  },

  removeLater(id) {
    const item = (Store.state.later || []).find(x => x.id === id);
    const label = item ? `„${item.title}”` : 'ten pomysł';
    if (!confirm(`Czy na pewno chcesz usunąć ${label} z listy Na później?`)) return;
    Store.state.later = Store.state.later.filter(x => x.id !== id);
    this.save();
    this.renderLater();
  },

  /* ---- JSON & NARZĘDZIA ---- */
  async exportJSON() {
    const filename = `PlanTygodnia_${this.today()}.json`;
    const jsonText = JSON.stringify(Store.state, null, 2);

    // 1. Natywne okno Finder „Zapisz jako...” (Chrome / Edge / Arc / Brave)
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: 'Kopia zapasowa Plan Tygodnia (JSON)',
            accept: { 'application/json': ['.json'] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(jsonText);
        await writable.close();
        alert(`✅ Zapisano plik: ${handle.name || filename}`);
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        console.warn('showSaveFilePicker fallback:', err);
      }
    }

    // 2. Bezpośrednie pobieranie do Finder -> Pobrane (Safari / Dock Web App / iPhone / Firefox)
    const blob = new Blob([jsonText], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { document.body.removeChild(a); } catch (e) {}
      try { URL.revokeObjectURL(url); } catch (e) {}
    }, 5000);
  },

  importJSON(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        Store.state = JSON.parse(ev.target.result);
        Store.normalizeState(Store.state);
        this.save();
        this.renderAll();
        alert('Wczytano plik JSON!');
      } catch (err) { alert('Błąd pliku JSON'); }
    };
    reader.readAsText(file);
  },

  cycleIcon() {
    Store.state.iconIdx = ((Store.state.iconIdx || 0) + 1) % APP_LOGO_ICONS.length;
    this.save();
    this.renderIcon();
  },

  renderIcon() {
    const slot = document.getElementById('appIconSlot');
    if (slot) slot.innerHTML = APP_LOGO_ICONS[Store.state.iconIdx || 0];
  },

  toggleTheme() {
    Store.state.theme = Store.state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', Store.state.theme);
    this.save();
  },

  showToast(msg) {},
  closeModal() {
    this.editingCalendarRemId = null;
    const root = document.getElementById('modalRoot');
    if (root) root.innerHTML = '';
  },

  /* ---- SPERSONALIZOWANY SYSTEM CZYTANIA KSIĄŻKI (OSTRZENIE PIŁY + UMYSŁ & STUDIA) ---- */
  _bookModalDays: [0, 1, 2, 3, 4, 5, 6],

  countActiveDaysInRange(fromDate, toDate, actDays) {
    if (!fromDate || !toDate || fromDate > toDate) return 0;
    const act = (Array.isArray(actDays) && actDays.length) ? actDays : [0, 1, 2, 3, 4, 5, 6];
    let cur = fromDate;
    let cnt = 0;
    let guard = 0;
    while (cur <= toDate && guard++ < 1500) {
      if (act.includes(D.dow(cur))) cnt++;
      cur = D.addDays(cur, 1);
    }
    return cnt;
  },

  formatBookScheduleBreakdown(pages, days, prefix = 'po') {
    const p = Math.max(0, parseInt(pages, 10) || 0);
    const d = Math.max(1, parseInt(days, 10) || 1);
    if (p <= 0) return '0 str. (książka ukończona!)';
    if (d === 1) return `${p} str. (ostatni dzień planu)`;
    const base = Math.floor(p / d);
    const extra = p % d;
    const normal = d - extra;
    if (extra === 0) {
      return `${prefix} ${base} str. dziennie (${d} dni)`;
    }
    if (base === 0) {
      return `po 1 str. przez ${p} ${p === 1 ? 'dzień' : 'dni'}`;
    }
    return `${base} str. (${normal} ${normal === 1 ? 'dzień' : 'dni'} × ${base} str. i ${extra} ${extra === 1 ? 'dzień' : 'dni'} × ${base + 1} str.)`;
  },

  getBookStats(s, todayStr, overrideBook = null, overrideActDays = null) {
    const today = todayStr || this.today();
    const bk = overrideBook || (s && s.book) || {};
    const totalPages = Math.max(0, parseInt(bk.totalPages, 10) || 0);
    const targetDays = Math.max(1, parseInt(bk.targetDays, 10) || 7);
    const planStartDate = /^\d{4}-\d{2}-\d{2}$/.test(String(bk.planStartDate || ''))
      ? String(bk.planStartDate)
      : today;
    const targetEndDate = D.addDays(planStartDate, targetDays - 1);
    const act = overrideActDays || ((s && Array.isArray(s.activeDays) && s.activeDays.length) ? s.activeDays : [0, 1, 2, 3, 4, 5, 6]);

    const dailyLog = (bk.dailyLog && typeof bk.dailyLog === 'object') ? bk.dailyLog : {};
    const readToday = Math.max(0, parseInt(dailyLog[today], 10) || 0);
    const loggedSum = Object.values(dailyLog).reduce((acc, v) => acc + (Math.max(0, parseInt(v, 10) || 0)), 0);
    const baseRead = Math.max(0, parseInt(bk.baseReadPages, 10) || 0);
    const rawTotalRead = baseRead + loggedSum;
    const totalRead = totalPages > 0 ? Math.min(totalPages, rawTotalRead) : rawTotalRead;
    const readBeforeToday = Math.max(0, totalRead - readToday);

    const remainingBeforeToday = Math.max(0, totalPages - readBeforeToday);
    const remainingNow = Math.max(0, totalPages - totalRead);
    const pct = totalPages > 0 ? Math.min(100, Math.round((totalRead / totalPages) * 100)) : 0;

    const effStart = today > planStartDate ? today : planStartDate;
    const rawDaysFromToday = today <= targetEndDate ? this.countActiveDaysInRange(effStart, targetEndDate, act) : 1;
    const daysFromToday = Math.max(1, rawDaysFromToday);

    const nextStart = D.addDays(effStart, 1);
    const daysAfterToday = nextStart <= targetEndDate ? this.countActiveDaysInRange(nextStart, targetEndDate, act) : 0;

    const todayQuota = remainingBeforeToday <= 0
      ? 0
      : Math.max(1, Math.floor(remainingBeforeToday / daysFromToday));

    const nextDayQuota = remainingNow <= 0
      ? 0
      : (daysAfterToday > 0 ? Math.max(1, Math.floor(remainingNow / daysAfterToday)) : remainingNow);

    const scheduleFromTodayLabel = this.formatBookScheduleBreakdown(remainingBeforeToday, daysFromToday, 'po');
    const scheduleAfterTodayLabel = daysAfterToday > 0
      ? this.formatBookScheduleBreakdown(remainingNow, daysAfterToday, 'po')
      : `${remainingNow} str.`;

    return {
      bookTitle: String(bk.bookTitle || ''),
      totalPages,
      targetDays,
      planStartDate,
      targetEndDate,
      readToday,
      readBeforeToday,
      totalRead,
      remainingBeforeToday,
      remainingNow,
      pct,
      daysFromToday,
      daysAfterToday,
      todayQuota,
      nextDayQuota,
      scheduleFromTodayLabel,
      scheduleAfterTodayLabel,
      isPastDeadline: today > targetEndDate && remainingNow > 0
    };
  },

  setBookPagesToday(sawId, pagesVal, rerender = true) {
    const s = (Store.state.saw || []).find(x => x.id === sawId);
    if (!s) return;
    const today = this.today();
    if (!s.book || typeof s.book !== 'object') {
      s.book = { bookId: 'bk_' + Date.now(), bookTitle: '', totalPages: 0, targetDays: 7, planStartDate: today, baseReadPages: 0, dailyLog: {}, dailyLogStamps: {}, updatedAt: Date.now() };
    }
    if (!s.book.dailyLog || typeof s.book.dailyLog !== 'object') s.book.dailyLog = {};
    if (!s.book.dailyLogStamps || typeof s.book.dailyLogStamps !== 'object') s.book.dailyLogStamps = {};

    const cleanPages = Math.max(0, parseInt(pagesVal, 10) || 0);
    if (cleanPages > 0) {
      s.book.dailyLog[today] = cleanPages;
    } else {
      delete s.book.dailyLog[today];
    }
    const now = Date.now();
    s.book.dailyLogStamps[today] = now;
    s.book.updatedAt = now;

    if (rerender) {
      this.save();
      this.renderAll();
    }
  },

  saveBookTodayFromInput(sawId, inputId) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    const raw = inp.value.trim();
    const pages = raw === '' ? 0 : Math.max(0, parseInt(raw, 10) || 0);
    this.setBookPagesToday(sawId, pages, true);
  },

  completeBookDayFromCard(taskId, sawId, inputId) {
    const s = (Store.state.saw || []).find(x => x.id === sawId);
    if (!s) return;
    const stats = this.getBookStats(s, this.today());
    const inp = document.getElementById(inputId);
    const raw = inp ? inp.value.trim() : '';
    const pages = raw !== '' ? Math.max(0, parseInt(raw, 10) || 0) : stats.todayQuota;
    this.setBookPagesToday(sawId, pages, false);
    this.doneTask(taskId, true);
  },

  renderBookCardWidget(s, taskId) {
    const today = this.today();
    const st = this.getBookStats(s, today);
    if (!st.totalPages) {
      return `
        <div class="book-tracker-box">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
            <span style="font-size:0.74rem; color:var(--text-muted);">📖 Ustaw tytuł książki, liczbę stron i czas czytania:</span>
            <button type="button" class="btn btn-primary" style="padding:3px 9px; font-size:0.72rem;" onclick="App.openBookSetupModal('${s.id}')">📖 Ustaw książkę</button>
          </div>
        </div>
      `;
    }

    const inpId = `bookTodayInp_${taskId}`;
    let statusHtml = '';
    if (st.remainingNow <= 0) {
      statusHtml = `
        <div class="book-norm-badge done">
          🎉 Książka przeczytana w całości (${st.totalPages}/${st.totalPages} str.)!
        </div>
      `;
    } else if (st.readToday === 0) {
      statusHtml = `
        <div class="book-norm-badge">
          🎯 Dziś do przeczytania: <strong>${st.todayQuota} str.</strong>
          <div style="font-size:0.69rem; font-weight:500; opacity:0.9; margin-top:1px;">
            Plan do ${this.esc(st.targetEndDate.slice(5))}: ${this.esc(st.scheduleFromTodayLabel)}
          </div>
        </div>
      `;
    } else if (st.readToday >= st.todayQuota) {
      const bonus = st.readToday - st.todayQuota;
      statusHtml = `
        <div class="book-norm-badge done">
          ✅ Dziś: <strong>${st.readToday} / ${st.todayQuota} str.</strong>${bonus > 0 ? ` (+${bonus} str. nadwyżki!)` : ''}
          ${st.daysAfterToday > 0 ? `
            <div style="font-size:0.69rem; font-weight:600; margin-top:1px;">
              ⏭️ Od następnego dnia: <strong>${this.esc(st.scheduleAfterTodayLabel)}</strong>
            </div>
          ` : ''}
        </div>
      `;
    } else {
      const leftToday = st.todayQuota - st.readToday;
      statusHtml = `
        <div class="book-norm-badge">
          📖 Dziś: <strong>${st.readToday} / ${st.todayQuota} str.</strong> (zostało jeszcze ${leftToday} str. do normy)
          ${st.daysAfterToday > 0 ? `
            <div style="font-size:0.69rem; font-weight:500; opacity:0.9; margin-top:1px;">
              Gdyby zakończyć dziś: od jutra ${this.esc(st.scheduleAfterTodayLabel)}
            </div>
          ` : ''}
        </div>
      `;
    }

    return `
      <div class="book-tracker-box" onclick="event.stopPropagation()">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap;">
          <span style="font-size:0.73rem; font-weight:700; color:var(--text-main);">
            📖 <strong>${st.totalRead} / ${st.totalPages} str.</strong> (${st.pct}%) · zostało ${st.remainingNow} str.
          </span>
          <button type="button" class="btn" style="padding:2px 7px; font-size:0.69rem;" onclick="App.openBookSetupModal('${s.id}')" title="Zmień książkę, liczbę stron lub dni czytania">
            ${st.remainingNow <= 0 ? '📚 Nowa książka' : '⚙️ Książka'}
          </button>
        </div>
        <div class="book-progress-track">
          <div class="book-progress-fill" style="width:${st.pct}%;"></div>
        </div>
        ${statusHtml}
        ${st.remainingNow > 0 || st.readToday > 0 ? `
          <div class="book-quick-log-row">
            <span style="font-size:0.72rem; font-weight:700; color:var(--text-muted);">Dziś przeczytano:</span>
            <input type="number" id="${inpId}" min="0" max="${st.totalPages}" class="input-clean book-pages-input"
              value="${st.readToday > 0 ? st.readToday : ''}" placeholder="${st.todayQuota}"
              onchange="App.saveBookTodayFromInput('${s.id}', '${inpId}')"
              onkeydown="if(event.key==='Enter'){event.preventDefault(); App.saveBookTodayFromInput('${s.id}', '${inpId}');}">
            <span style="font-size:0.72rem; color:var(--text-muted);">str.</span>
            <button type="button" class="btn" style="padding:3px 8px; font-size:0.71rem;" onclick="App.saveBookTodayFromInput('${s.id}', '${inpId}')" title="Zapisz dzisiejsze strony i przelicz plan">Przelicz</button>
            <button type="button" class="btn btn-primary" style="padding:3px 9px; font-size:0.71rem; margin-left:auto;" onclick="App.completeBookDayFromCard('${taskId}', '${s.id}', '${inpId}')" title="Zapisz przeczytane dziś strony i odhacz dzisiejsze czytanie">✓ Odhacz dzień</button>
          </div>
        ` : ''}
      </div>
    `;
  },

  renderBookSawPanel(s) {
    const today = this.today();
    const st = this.getBookStats(s, today);
    if (!st.totalPages) {
      return `
        <div class="book-tracker-box" style="margin-top:6px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
            <span style="font-size:0.74rem; color:var(--text-muted);">📚 System czytania: ustaw tytuł książki, liczbę stron i w ile dni chcesz ją przeczytać</span>
            <button type="button" class="btn btn-primary" style="padding:4px 10px; font-size:0.73rem;" onclick="App.openBookSetupModal('${s.id}')">📖 Ustaw książkę</button>
          </div>
        </div>
      `;
    }

    const sawInpId = `sawBookToday_${s.id}`;
    return `
      <div class="book-tracker-box" style="margin-top:6px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
          <span style="font-size:0.74rem; font-weight:700;">
            📖 Postęp: <strong>${st.totalRead} / ${st.totalPages} str.</strong> (${st.pct}%) · zostało <strong>${st.remainingNow} str.</strong> (cel: ${st.targetDays} dni do ${this.esc(st.targetEndDate)})
          </span>
          <button type="button" class="btn" style="padding:3px 9px; font-size:0.72rem;" onclick="App.openBookSetupModal('${s.id}')">📖 Edytuj / Zmień książkę</button>
        </div>
        <div class="book-progress-track">
          <div class="book-progress-fill" style="width:${st.pct}%;"></div>
        </div>
        <div style="font-size:0.73rem; color:var(--text-muted); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px;">
          <span>
            ${st.remainingNow <= 0
              ? '🎉 <strong>Książka ukończona!</strong>'
              : (st.readToday > 0
                  ? `✅ Dziś: <strong>${st.readToday} str.</strong> (norma była ${st.todayQuota} str.) · Kolejne dni: <strong>${this.esc(st.scheduleAfterTodayLabel)}</strong>`
                  : `🎯 Norma na dziś: <strong>${st.todayQuota} str.</strong> · Harmonogram: <strong>${this.esc(st.scheduleFromTodayLabel)}</strong>`)}
          </span>
          <span style="display:inline-flex; align-items:center; gap:5px;">
            <span>Dziś:</span>
            <input type="number" id="${sawInpId}" min="0" max="${st.totalPages}" class="input-clean book-pages-input"
              value="${st.readToday > 0 ? st.readToday : ''}" placeholder="${st.todayQuota}"
              onchange="App.saveBookTodayFromInput('${s.id}', '${sawInpId}')">
            <span>str.</span>
          </span>
        </div>
      </div>
    `;
  },

  openPrimaryBookModal() {
    let bookSaw = (Store.state.saw || []).find(x => x && x.isBookTracker);
    if (!bookSaw) {
      bookSaw = (Store.state.saw || []).find(x => x && /(książk|ksiazk)/i.test(String(x.title || '')));
    }
    if (!bookSaw) {
      const today = this.today();
      bookSaw = {
        id: 's_book_' + Date.now(),
        title: '📚 Książka',
        roleId: 'r2',
        q: 2,
        isBookTracker: true,
        book: { bookId: 'bk_' + Date.now(), bookTitle: '', totalPages: 0, targetDays: 7, planStartDate: today, baseReadPages: 0, dailyLog: {}, dailyLogStamps: {}, updatedAt: Date.now() },
        activeDays: [0, 1, 2, 3, 4, 5, 6],
        doneDays: [],
        spawnedDates: [],
        dismissedDays: [],
        startDate: today,
        createdAt: Date.now()
      };
      Store.state.saw.unshift(bookSaw);
      this.processDueReminders();
      this.save();
    } else {
      bookSaw.isBookTracker = true;
    }
    this.openBookSetupModal(bookSaw.id);
  },

  openBookSetupModal(sawId) {
    const root = document.getElementById('modalRoot');
    const s = (Store.state.saw || []).find(x => x.id === sawId);
    if (!root || !s) return;

    const today = this.today();
    const st = this.getBookStats(s, today);
    this._bookModalDays = (Array.isArray(s.activeDays) && s.activeDays.length) ? [...s.activeDays] : [0, 1, 2, 3, 4, 5, 6];
    const days = ['Pn','Wt','Śr','Cz','Pt','Sb','Nd'];

    root.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) App.closeModal()">
        <div class="modal" style="max-width:540px;">
          <div class="modal-header">
            <div>
              <h3 style="font-size:1.1rem; font-weight:800;">📚 Spersonalizowany Plan Czytania Książki</h3>
              <p style="font-size:0.76rem; color:var(--text-muted); margin-top:2px;">
                System automatycznie wylicza dzienną normę stron i na bieżąco koryguje kolejne dni, gdy przeczytasz więcej lub mniej.
              </p>
            </div>
            <button type="button" class="btn" onclick="App.closeModal()">✕</button>
          </div>

          <form id="bookSetupForm" data-saw-id="${s.id}" data-base-read="${st.readBeforeToday}" onsubmit="event.preventDefault(); App.saveBookSetup('${s.id}', this);" style="display:flex; flex-direction:column; gap:12px;">
            <div>
              <label style="font-size:0.74rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">📖 Tytuł aktualnie czytanej książki:</label>
              <input type="text" name="bookTitle" class="input-clean" style="font-weight:700;" value="${this.esc(st.bookTitle)}" placeholder="np. Atomowe Nawyki, 7 Nawyków Skutecznego Działania..." autofocus oninput="App.refreshBookModalPreview()">
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div>
                <label style="font-size:0.74rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">📄 Ile stron ma cała książka:</label>
                <input type="number" name="totalPages" min="1" max="10000" class="input-clean" style="font-weight:800;" value="${st.totalPages > 0 ? st.totalPages : ''}" placeholder="np. 70" required oninput="App.refreshBookModalPreview()">
              </div>
              <div>
                <label style="font-size:0.74rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">🗓️ W ile dni chcesz ją przeczytać:</label>
                <input type="number" name="targetDays" min="1" max="365" class="input-clean" style="font-weight:800;" value="${st.targetDays}" required oninput="App.refreshBookModalPreview()">
              </div>
            </div>

            <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
              <span style="font-size:0.71rem; color:var(--text-muted); font-weight:700;">Szybki wybór czasu:</span>
              <button type="button" class="btn" style="padding:3px 8px; font-size:0.72rem;" onclick="App.setBookModalPresetDays(7)">7 dni (tydzień)</button>
              <button type="button" class="btn" style="padding:3px 8px; font-size:0.72rem;" onclick="App.setBookModalPresetDays(14)">14 dni (2 tyg.)</button>
              <button type="button" class="btn" style="padding:3px 8px; font-size:0.72rem;" onclick="App.setBookModalPresetDays(21)">21 dni (3 tyg.)</button>
              <button type="button" class="btn" style="padding:3px 8px; font-size:0.72rem;" onclick="App.setBookModalPresetDays(30)">30 dni (miesiąc)</button>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div>
                <label style="font-size:0.74rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">🔖 Przeczytane już strony (łącznie):</label>
                <input type="number" name="totalRead" min="0" max="10000" class="input-clean" style="font-weight:700;" value="${st.totalRead}" oninput="App.onBookModalTotalReadChange(this.form)">
              </div>
              <div>
                <label style="font-size:0.74rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">✍️ W tym przeczytane dzisiaj (${today.slice(5)}):</label>
                <input type="number" name="readToday" min="0" max="10000" class="input-clean" style="font-weight:700;" value="${st.readToday}" oninput="App.onBookModalTodayChange(this.form)">
              </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr auto; gap:8px; align-items:end;">
              <div>
                <label style="font-size:0.73rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">📅 Data startu odliczania planu:</label>
                <input type="date" name="planStartDate" class="input-clean" style="font-weight:600;" value="${this.esc(st.planStartDate)}" onchange="App.refreshBookModalPreview()">
              </div>
              <button type="button" class="btn" style="padding:8px 10px; font-size:0.73rem;" onclick="document.querySelector('#bookSetupForm [name=planStartDate]').value='${today}'; App.refreshBookModalPreview();">Licz od dziś</button>
            </div>

            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; flex-wrap:wrap; gap:6px;">
                <label style="font-size:0.73rem; font-weight:700; color:var(--text-muted);">📆 Dni tygodnia, w które czytasz (wskakuje do Umysł & Studia):</label>
                <button type="button" class="btn" style="padding:2px 8px; font-size:0.7rem;" onclick="App.setBookModalAllDays()">Codziennie (Pn–Nd)</button>
              </div>
              <div class="week-dots" id="bookModalDaysWrap" style="gap:6px;">
                ${days.map((dLabel, dIdx) => `
                  <button type="button" class="dot-btn ${this._bookModalDays.includes(dIdx) ? 'done' : ''}" style="width:34px; height:34px; font-size:0.78rem;" onclick="App.toggleBookModalDay(${dIdx})">${dLabel}</button>
                `).join('')}
              </div>
            </div>

            <div id="bookModalLivePreview" class="book-norm-badge" style="padding:10px 12px;"></div>

            <div style="display:flex; gap:8px; justify-content:space-between; flex-wrap:wrap; padding-top:4px;">
              ${st.totalPages > 0 ? `
                <button type="button" class="btn" style="font-size:0.75rem; color:var(--crimson);" onclick="App.resetForNewBook('${s.id}')">🔄 Nowa książka (wyzeruj)</button>
              ` : `<span></span>`}
              <div style="display:flex; gap:8px; margin-left:auto;">
                <button type="button" class="btn" onclick="App.closeModal()">Anuluj</button>
                <button type="submit" class="btn btn-primary" style="padding:9px 18px;">✓ Zapisz plan książki</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    `;

    this.refreshBookModalPreview();
  },

  setBookModalPresetDays(n) {
    const form = document.getElementById('bookSetupForm');
    if (!form) return;
    form.targetDays.value = String(n);
    this.refreshBookModalPreview();
  },

  setBookModalAllDays() {
    this._bookModalDays = [0, 1, 2, 3, 4, 5, 6];
    this.rerenderBookModalDays();
    this.refreshBookModalPreview();
  },

  toggleBookModalDay(idx) {
    const i = this._bookModalDays.indexOf(idx);
    if (i >= 0) {
      if (this._bookModalDays.length <= 1) return; // Zostaw min. 1 dzień czytania
      this._bookModalDays.splice(i, 1);
    } else {
      this._bookModalDays.push(idx);
    }
    this._bookModalDays.sort((a, b) => a - b);
    this.rerenderBookModalDays();
    this.refreshBookModalPreview();
  },

  rerenderBookModalDays() {
    const days = ['Pn','Wt','Śr','Cz','Pt','Sb','Nd'];
    const wrap = document.getElementById('bookModalDaysWrap');
    if (!wrap) return;
    wrap.innerHTML = days.map((dLabel, dIdx) => `
      <button type="button" class="dot-btn ${this._bookModalDays.includes(dIdx) ? 'done' : ''}" style="width:34px; height:34px; font-size:0.78rem;" onclick="App.toggleBookModalDay(${dIdx})">${dLabel}</button>
    `).join('');
  },

  onBookModalTodayChange(form) {
    if (!form) return;
    const baseRead = Math.max(0, parseInt(form.dataset.baseRead, 10) || 0);
    const readToday = Math.max(0, parseInt(form.readToday.value, 10) || 0);
    const totalPages = Math.max(0, parseInt(form.totalPages.value, 10) || 0);
    const combined = baseRead + readToday;
    form.totalRead.value = String(totalPages > 0 ? Math.min(totalPages, combined) : combined);
    this.refreshBookModalPreview();
  },

  onBookModalTotalReadChange(form) {
    if (!form) return;
    const totalRead = Math.max(0, parseInt(form.totalRead.value, 10) || 0);
    let readToday = Math.max(0, parseInt(form.readToday.value, 10) || 0);
    if (readToday > totalRead) {
      readToday = totalRead;
      form.readToday.value = String(readToday);
    }
    form.dataset.baseRead = String(Math.max(0, totalRead - readToday));
    this.refreshBookModalPreview();
  },

  refreshBookModalPreview() {
    const form = document.getElementById('bookSetupForm');
    const preview = document.getElementById('bookModalLivePreview');
    if (!form || !preview) return;
    const today = this.today();
    const totalPages = Math.max(0, parseInt(form.totalPages.value, 10) || 0);
    const targetDays = Math.max(1, parseInt(form.targetDays.value, 10) || 7);
    const planStartDate = form.planStartDate.value || today;
    const readToday = Math.max(0, parseInt(form.readToday.value, 10) || 0);
    const totalRead = Math.max(0, parseInt(form.totalRead.value, 10) || 0);
    const baseReadPages = Math.max(0, totalRead - readToday);

    if (!totalPages) {
      preview.innerHTML = 'Wpisz łączną liczbę stron książki powyżej, aby zobaczyć wyliczenie dziennej normy.';
      return;
    }

    const tempBook = {
      bookTitle: form.bookTitle.value.trim(),
      totalPages,
      targetDays,
      planStartDate,
      baseReadPages,
      dailyLog: readToday > 0 ? { [today]: readToday } : {}
    };
    const st = this.getBookStats(null, today, tempBook, this._bookModalDays);

    if (st.remainingNow <= 0) {
      preview.innerHTML = `🎉 Wszystkie strony (${totalPages}/${totalPages}) oznaczone jako przeczytane!`;
      return;
    }

    const daysWarn = this._bookModalDays.length < 7
      ? `<div style="font-size:0.7rem; font-weight:500; opacity:0.85; margin-top:3px;">ℹ️ Wybrano ${this._bookModalDays.length} dni czytania w tygodniu (${st.daysFromToday} dni czytania do ${st.targetEndDate}).</div>`
      : '';

    if (st.readToday > 0) {
      preview.innerHTML = `
        <div>📊 Dzisiejsza norma wynosiła: <strong>${st.todayQuota} str.</strong> · Wpisano dziś: <strong>${st.readToday} str.</strong> (zostało łącznie ${st.remainingNow} str.)</div>
        ${st.daysAfterToday > 0
          ? `<div style="margin-top:3px;">⏭️ Przeliczona norma od kolejnego dnia (${st.daysAfterToday} dni czytania do ${st.targetEndDate}): <strong>${this.esc(st.scheduleAfterTodayLabel)}</strong></div>`
          : `<div style="margin-top:3px;">📅 Koniec planu dzisiaj — pozostało: <strong>${st.remainingNow} str.</strong></div>`}
        ${daysWarn}
      `;
    } else {
      preview.innerHTML = `
        <div>🎯 Wyliczona norma na dziś: <strong>${st.todayQuota} str.</strong> (pozostało ${st.remainingNow} z ${st.totalPages} str.)</div>
        <div style="margin-top:2px; font-weight:600;">📅 Harmonogram do ${st.targetEndDate}: <strong>${this.esc(st.scheduleFromTodayLabel)}</strong></div>
        ${daysWarn}
      `;
    }
  },

  resetForNewBook(sawId) {
    if (!confirm('Czy na pewno chcesz wyzerować postęp i rozpocząć nową książkę od 0 stron?')) return;
    const s = (Store.state.saw || []).find(x => x.id === sawId);
    if (!s) return;
    const today = this.today();
    s.book = {
      bookId: 'bk_' + Date.now(),
      bookTitle: '',
      totalPages: 0,
      targetDays: 7,
      planStartDate: today,
      baseReadPages: 0,
      dailyLog: {},
      dailyLogStamps: {},
      updatedAt: Date.now()
    };
    this.save();
    this.renderAll();
    this.openBookSetupModal(sawId);
  },

  saveBookSetup(sawId, form) {
    const s = (Store.state.saw || []).find(x => x.id === sawId);
    if (!s || !form) return;
    const today = this.today();
    const bookTitle = form.bookTitle.value.trim();
    const totalPages = Math.max(1, parseInt(form.totalPages.value, 10) || 0);
    if (!totalPages) {
      alert('Podaj liczbę stron książki (większą od 0).');
      return;
    }
    const targetDays = Math.max(1, parseInt(form.targetDays.value, 10) || 7);
    const planStartDate = form.planStartDate.value || today;
    const readToday = Math.max(0, parseInt(form.readToday.value, 10) || 0);
    const totalRead = Math.min(totalPages, Math.max(readToday, parseInt(form.totalRead.value, 10) || 0));

    const prevBook = (s.book && typeof s.book === 'object') ? s.book : {};
    const isSameBook = prevBook.bookTitle === bookTitle && prevBook.totalPages === totalPages && prevBook.bookId;
    const nextLog = isSameBook && prevBook.dailyLog ? { ...prevBook.dailyLog } : {};
    const nextStamps = isSameBook && prevBook.dailyLogStamps ? { ...prevBook.dailyLogStamps } : {};

    if (readToday > 0) {
      nextLog[today] = readToday;
    } else {
      delete nextLog[today];
    }
    const now = Date.now();
    nextStamps[today] = now;

    const otherDaysLoggedSum = Object.keys(nextLog)
      .filter(dk => dk !== today)
      .reduce((acc, dk) => acc + (Math.max(0, parseInt(nextLog[dk], 10) || 0)), 0);
    const baseReadPages = Math.max(0, totalRead - readToday - otherDaysLoggedSum);

    // Jeśli suma wcześniejszych logów z innych dni przekracza nowe totalRead (np. użytkownik ręcznie zmniejszył „przeczytane łącznie”), wyczyść stare logi i oprzyj się na aktualnej wartości
    if (otherDaysLoggedSum + readToday > totalRead) {
      Object.keys(nextLog).forEach(dk => { if (dk !== today) delete nextLog[dk]; });
    }

    s.isBookTracker = true;
    s.freq = 'weekdays';
    s.activeDays = [...this._bookModalDays];
    if (!s.roleId) s.roleId = 'r2';
    s.book = {
      bookId: isSameBook ? prevBook.bookId : ('bk_' + now),
      bookTitle,
      totalPages,
      targetDays,
      planStartDate,
      baseReadPages: (otherDaysLoggedSum + readToday > totalRead) ? Math.max(0, totalRead - readToday) : baseReadPages,
      dailyLog: nextLog,
      dailyLogStamps: nextStamps,
      updatedAt: now
    };

    // Jeśli dziś jest aktywnym dniem czytania i nie odhaczono jeszcze dzisiaj, upewnij się że karta Książki jest widoczna w Umysł & Studia
    this.processDueReminders();
    this.save();
    this.closeModal();
    this.renderAll();
  },

  /* ---- SZYBKI NOTATNIK (BRUDNOPIS W GŁÓWNYM WIDOKU Z POGRUBIANIEM) ---- */
  _quickPadSaveTimer: null,

  sanitizeQuickNoteHtml(rawHtml) {
    const str = String(rawHtml || '');
    if (!str.trim()) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = str;
    if (!(tmp.textContent || '').trim()) return '';

    const cleanNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return this.esc(node.nodeValue || '');
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const tag = node.tagName.toLowerCase();
      if (tag === 'br') return '<br>';
      let inner = '';
      node.childNodes.forEach(ch => { inner += cleanNode(ch); });
      if (tag === 'b' || tag === 'strong') {
        return inner ? `<b>${inner}</b>` : '';
      }
      if (tag === 'span') {
        const fw = (node.style && node.style.fontWeight) ? String(node.style.fontWeight) : '';
        if (fw === 'bold' || parseInt(fw, 10) >= 600) {
          return inner ? `<b>${inner}</b>` : '';
        }
        return inner;
      }
      if (tag === 'div' || tag === 'p' || tag === 'li') {
        return `<div>${inner || '<br>'}</div>`;
      }
      return inner;
    };

    let out = '';
    tmp.childNodes.forEach(ch => { out += cleanNode(ch); });
    return out;
  },

  renderQuickPad() {
    const editor = document.getElementById('quickPadEditor');
    const clearBtn = document.getElementById('quickPadClearBtn');
    if (!editor) return;

    const savedHtml = this.sanitizeQuickNoteHtml(Store.state.quickNote || '');
    if (document.activeElement !== editor) {
      if (editor.innerHTML !== savedHtml) {
        editor.innerHTML = savedHtml;
      }
    }
    const hasText = Boolean((editor.textContent || '').trim());
    editor.classList.toggle('is-empty', !hasText);
    if (clearBtn) {
      clearBtn.style.display = hasText ? '' : 'none';
    }
  },

  onQuickPadInput() {
    const editor = document.getElementById('quickPadEditor');
    const clearBtn = document.getElementById('quickPadClearBtn');
    if (!editor) return;

    const hasText = Boolean((editor.textContent || '').trim());
    editor.classList.toggle('is-empty', !hasText);
    if (clearBtn) {
      clearBtn.style.display = hasText ? '' : 'none';
    }

    const cleanHtml = hasText ? this.sanitizeQuickNoteHtml(editor.innerHTML) : '';
    Store.state.quickNote = cleanHtml;
    if (!Store.state.fieldStamps) Store.state.fieldStamps = {};
    Store.state.fieldStamps['quickNote'] = Date.now();

    Store.persist(false, false, true);
    clearTimeout(this._quickPadSaveTimer);
    this._quickPadSaveTimer = setTimeout(() => {
      this._quickPadSaveTimer = null;
      if (window.Sync && typeof window.Sync.pushToCloud === 'function') {
        window.Sync.pushToCloud();
      }
    }, 350);
  },

  onQuickPadBlur() {
    const editor = document.getElementById('quickPadEditor');
    const boldBtn = document.getElementById('quickPadBoldBtn');
    if (boldBtn) boldBtn.classList.remove('active');
    if (editor && !(editor.textContent || '').trim()) {
      editor.innerHTML = '';
      editor.classList.add('is-empty');
    }
    if (this._quickPadSaveTimer) {
      clearTimeout(this._quickPadSaveTimer);
      this._quickPadSaveTimer = null;
      Store.persist(false, true, true);
    }
  },

  onQuickPadPaste(ev) {
    if (!ev) return;
    ev.preventDefault();
    const text = ((ev.clipboardData || window.clipboardData)?.getData('text/plain')) || '';
    if (text) {
      document.execCommand('insertText', false, text);
    }
  },

  toggleQuickPadBold() {
    const editor = document.getElementById('quickPadEditor');
    if (!editor) return;
    if (document.activeElement !== editor) {
      editor.focus();
    }
    try { document.execCommand('styleWithCSS', false, false); } catch (e) {}
    document.execCommand('bold', false, null);
    this.updateQuickPadToolbarState();
    this.onQuickPadInput();
  },

  insertQuickPadBullet() {
    const editor = document.getElementById('quickPadEditor');
    if (!editor) return;
    if (document.activeElement !== editor) {
      editor.focus();
    }
    const hasSome = Boolean((editor.textContent || '').trim());
    document.execCommand('insertText', false, hasSome ? '\n• ' : '• ');
    this.onQuickPadInput();
  },

  updateQuickPadToolbarState() {
    const boldBtn = document.getElementById('quickPadBoldBtn');
    if (!boldBtn) return;
    let isBold = false;
    try { isBold = Boolean(document.queryCommandState('bold')); } catch (e) {}
    boldBtn.classList.toggle('active', isBold);
  },

  clearQuickPad() {
    const editor = document.getElementById('quickPadEditor');
    if (editor && !(editor.textContent || '').trim()) return;
    if (!confirm('Czy na pewno chcesz wyczyścić całą zawartość Szybkiego Notatnika?')) return;
    Store.state.quickNote = '';
    if (!Store.state.fieldStamps) Store.state.fieldStamps = {};
    Store.state.fieldStamps['quickNote'] = Date.now();
    if (editor) {
      editor.innerHTML = '';
      editor.classList.add('is-empty');
    }
    this.save();
    this.renderQuickPad();
  },

  renderAll() {
    let authActive = false;
    try { authActive = localStorage.getItem('kompas_auth_active') === '1'; } catch (e) {}
    const waitingForFirstCloudPull = authActive && window.Sync && !window.Sync.initialSyncComplete;

    if (!this._processingReminders && !waitingForFirstCloudPull) {
      this._processingReminders = true;
      this.processDueReminders();
      this._processingReminders = false;
    }
    this.renderYearSelect();
    this.renderIcon();
    this.renderPlan();
    this.renderQuickPad();
    this.renderCalendar();
    this.renderMatrix();
    this.renderSaw();
    this.renderGoals();
    this.renderMind();
    this.renderArchive();
    this.renderLater();
  }
};

window.App = App;
window.addEventListener('DOMContentLoaded', () => App.init());
