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

  /* ---- WIDOK 1: PLAN TYGODNIA (4 KAFELKI CELÓW KWARTALNYCH + 4 RUBRYCZKI RÓL + KALENDARZ) ---- */
  renderPlan() {
    const y = Store.state.year;
    const gYear = Store.state.goals[y] || {};
    const curQ = Math.floor(new Date().getMonth() / 3) + 1;

    // 4 równe kafelki Celów Kwartalnych w jednym rzędzie na górze (z ucinaniem tekstu i dymkiem po najechaniu)
    const stripEl = document.getElementById('goalsStripItems');
    if (stripEl) {
      stripEl.innerHTML = Store.state.roles.map(r => {
        const gq = gYear[r.id]?.quarterly || 'Kliknij, aby ustalić mierzalny cel kwartalny...';
        return `
          <div class="q-goal-tile" style="border-left: 4px solid ${r.color};" onclick="App.switchTab('goals')">
            <div class="q-goal-tile-head">
              <span>${r.emoji} ${this.esc(r.name)} · KWARTAŁ Q${curQ}</span>
              <span style="color:var(--accent);">Edytuj →</span>
            </div>
            <div class="q-goal-tile-text">${this.esc(gq)}</div>
            <div class="cal-tooltip">
              <div style="font-size:0.68rem; color:#94a3b8; font-weight:700; margin-bottom:2px;">📊 Cel Kwartalny (Q${curQ} ${y}) · ${r.emoji} ${this.esc(r.name)}</div>
              <div style="font-weight:600; color:#ffffff;">${this.esc(gq)}</div>
            </div>
          </div>
        `;
      }).join('');
    }

    // 4 estetyczne rubryczki Ról (z licznikiem wykonanych zadań z Archiwum + udziałem % oraz licznikiem dni opóźnienia)
    const today = this.today();
    const tasks = Store.state.tasks.filter(t => (t.year || y) === y);
    const allArchive = Store.state.archive || [];
    const totalArchivedCount = allArchive.length;

    const gridEl = document.getElementById('rolesGrid');
    if (gridEl) {
      gridEl.innerHTML = Store.state.roles.map(r => {
        const rTasks = tasks.filter(t => t.roleId === r.id);
        const doneInArchive = allArchive.filter(a => a.roleId === r.id).length;
        const pctInArchive = totalArchivedCount > 0 ? Math.round((doneInArchive / totalArchivedCount) * 100) : 0;
        const gw = gYear[r.id]?.weekly || '';
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
            ${gw ? `<div class="role-goal-hint">🎯 ${this.esc(gw)}</div>` : ''}
            <div class="task-list">
              ${rTasks.map(t => {
                const delay = Math.max(0, D.diff(today, t.scheduledDate || today));
                return `
                  <div class="task-row" style="${t.sawId ? 'border-left: 3px solid var(--emerald);' : ''}">
                    <div class="task-row-left" style="flex-wrap:wrap;">
                      <button class="check-circle" onclick="App.doneTask('${t.id}')" title="Odhacz jako wykonane">✓</button>
                      <span>${this.esc(t.title)}</span>
                      ${t.sawId ? `<span style="font-size:0.65rem; color:var(--emerald); background:var(--emerald-light); padding:1px 6px; border-radius:999px; font-weight:700;">🪚 ${this.esc((t.sawDate || '').slice(5))}</span>` : ''}
                      ${t.fromCalendarDate ? `<span style="font-size:0.68rem; color:var(--accent); background:var(--accent-light); padding:1px 6px; border-radius:999px; font-weight:700;">📅 ${t.fromCalendarDate.slice(5)}</span>` : ''}
                      ${delay > 0 ? `<span style="font-size:0.68rem; color:var(--crimson); background:var(--crimson-light); border:1px solid rgba(220,38,38,0.25); padding:1px 7px; border-radius:999px; font-weight:800;" title="Zaplanowane na: ${t.scheduledDate} — opóźnienie: ${delay} dni">⏳ ${delay} ${delay === 1 ? 'dzień' : 'dni'} opóźnienia</span>` : ''}
                    </div>
                    <div style="display:flex; align-items:center; gap:5px; flex-shrink:0;">
                      <span class="q-tag q${t.q || 2}" onclick="App.cycleQ('${t.id}')" title="Zmień ćwiartkę Matrycy">Q${t.q || 2}</span>
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

  deleteActiveTask(id) {
    const t = (Store.state.tasks || []).find(x => x.id === id);
    const label = t ? `„${t.title}”` : 'to zadanie';
    if (!confirm(`Czy na pewno chcesz usunąć ${label}?`)) return;
    // 1. Usuń zadanie z aktywnej listy (znika z Filaru i z Matrycy Eisenhowera)
    Store.state.tasks = (Store.state.tasks || []).filter(x => x.id !== id);
    // 2. Jeśli zadanie pochodziło z Kalendarza, usuń je również z Kalendarza
    Store.state.reminders = (Store.state.reminders || []).filter(r => r.activatedTaskId !== id && ('t_cal_' + r.id) !== id);
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

  doneTask(id) {
    const idx = Store.state.tasks.findIndex(x => x.id === id);
    if (idx < 0) return;
    const [t] = Store.state.tasks.splice(idx, 1);
    const today = this.today();

    // Oznacz powiązane przypomnienie w kalendarzu jako wykonane
    const rem = (Store.state.reminders || []).find(r => r.activatedTaskId === id);
    if (rem) rem.done = true;

    // Jeśli zadanie pochodziło z Ostrzenia Piły, oznacz ten dzień w doneDays
    if (t.sawId) {
      const sawItem = (Store.state.saw || []).find(s => s.id === t.sawId);
      if (sawItem) {
        if (!Array.isArray(sawItem.doneDays)) sawItem.doneDays = [];
        const targetDay = t.sawDate || today;
        if (!sawItem.doneDays.includes(targetDay)) sawItem.doneDays.push(targetDay);
      }
    }

    const delay = Math.max(0, D.diff(today, t.scheduledDate || today));
    const now = new Date();
    const stamp = `${today} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    Store.state.archive.unshift({
      id: 'ar_' + Date.now(),
      title: t.title,
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

  /* ---- KALENDARZ I OSTRZENIE PIŁY: MATERIALIZACJA ZADAŃ I LICZENIE OPÓŹNIEŃ ---- */
  processDueReminders() {
    const today = this.today();
    let changed = false;
    let spawnedNewTask = false;

    // 1. Przypomnienia z Kalendarza (od dnia kiedy powinny być — nie znikają aż do odklikania)
    (Store.state.reminders || []).forEach(r => {
      if (!r || !r.date || r.done) return;
      if (r.date <= today && !r.activatedTaskId) {
        const newTaskId = 't_cal_' + r.id;
        const alreadyDeleted = Boolean(Store.state.deleted && Store.state.deleted['tasks:' + newTaskId]);
        const exists = Store.state.tasks.some(t => t.id === newTaskId);
        if (!exists && !alreadyDeleted) {
          Store.state.tasks.push({
            id: newTaskId,
            title: r.title,
            roleId: r.roleId || Store.state.roles[0].id,
            q: Number(r.q) || 2,
            scheduledDate: r.date,
            fromCalendarDate: r.date,
            delayDays: Math.max(0, D.diff(today, r.date)),
            year: parseInt(r.date.slice(0, 4), 10) || Store.state.year,
            createdAt: Date.now()
          });
          spawnedNewTask = true;
        }
        r.activatedTaskId = newTaskId;
        changed = true;
      }
    });

    // 2. Zadania z Ostrzenia Piły (wskakują w zaznaczone dni tygodnia, dublują się w kolejne dni i nie znikają aż do odklikania)
    (Store.state.saw || []).forEach(s => {
      if (!s || typeof s !== 'object') return;
      if (!s.startDate || s.startDate > today) s.startDate = today;
      if (!Array.isArray(s.spawnedDates)) s.spawnedDates = [];
      if (!Array.isArray(s.doneDays)) s.doneDays = [];
      if (!Array.isArray(s.dismissedDays)) s.dismissedDays = [];
      const act = Array.isArray(s.activeDays) ? s.activeDays : [0, 1, 2, 3, 4, 5, 6];

      // Sprawdzamy każdy dzień od startDate (maks. 45 dni wstecz) aż do dzisiaj
      const minStart = D.addDays(today, -45);
      let cur = s.startDate < minStart ? minStart : s.startDate;
      let guard = 0;
      while (cur <= today && guard++ < 50) {
        const dow = D.dow(cur);
        if (act.includes(dow)) {
          const taskId = `t_saw_${s.id}_${cur}`;
          const alreadySpawned = s.spawnedDates.includes(cur);
          const alreadyDone = s.doneDays.includes(cur);
          const alreadyDismissed = s.dismissedDays.includes(cur) || Boolean(Store.state.deleted && Store.state.deleted['tasks:' + taskId]);
          const existsOnList = Store.state.tasks.some(t => t.id === taskId);

          if (!alreadySpawned && !alreadyDone && !alreadyDismissed && !existsOnList) {
            Store.state.tasks.push({
              id: taskId,
              title: s.title,
              roleId: s.roleId || 'r1',
              q: Number(s.q) || 2,
              scheduledDate: cur,
              sawId: s.id,
              sawDate: cur,
              delayDays: Math.max(0, D.diff(today, cur)),
              year: parseInt(cur.slice(0, 4), 10) || Store.state.year,
              createdAt: Date.now()
            });
            s.spawnedDates.push(cur);
            spawnedNewTask = true;
            changed = true;
          } else if (!alreadySpawned && (alreadyDone || alreadyDismissed || existsOnList)) {
            s.spawnedDates.push(cur);
            changed = true;
          }
        }
        cur = D.addDays(cur, 1);
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

    let html = '';
    for (let i = 0; i < total; i++) {
      const d = new Date(this.calYear, this.calMonth, 1 - startOffset + i);
      const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const isCur = d.getMonth() === this.calMonth;
      const rems = Store.state.reminders.filter(r => r.date === dStr);

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
                  ${role ? role.emoji : '🔔'} <span class="q-tag q${r.q || 2}" style="font-size:0.58rem; padding:0 4px;">Q${r.q || 2}</span> ${this.esc(r.title)}
                </div>
                <div class="cal-tooltip">
                  <div style="font-size:0.68rem; color:#94a3b8; font-weight:700; margin-bottom:2px;">${roleLabel} · Ćwiartka Q${r.q || 2}</div>
                  <div style="font-weight:600; color:#ffffff;">${this.esc(r.title)}</div>
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
      const monthRems = (Store.state.reminders || [])
        .filter(r => r && r.date && r.date.startsWith(monthPrefix))
        .sort((a, b) => (a.date > b.date ? 1 : -1));
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
                    <span style="font-size:0.74rem; font-weight:800; color:var(--accent); background:var(--accent-light); padding:2px 7px; border-radius:999px;">📅 ${this.esc(r.date)}</span>
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
    const rems = Store.state.reminders.filter(r => r.date === dateStr);
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

          <div style="display:flex; flex-direction:column; gap:6px;">
            ${rems.length ? rems.map(r => {
              const role = Store.state.roles.find(x => x.id === r.roleId);
              return `
                <div class="task-row">
                  <div class="task-row-left">
                    <span>${role ? role.emoji : '🔔'} <strong>${this.esc(r.title)}</strong></span>
                  </div>
                  <span style="font-size:0.72rem; color:var(--text-muted);">${role ? this.esc(role.name) : ''}</span>
                  <span class="q-tag q${r.q || 2}">Q${r.q || 2}</span>
                  <button class="btn" style="padding:2px 6px;" onclick="App.deleteReminder('${r.id}', '${dateStr}')">✕</button>
                </div>
              `;
            }).join('') : `<div style="font-size:0.8rem; color:var(--text-dim); padding:6px 0;">Brak przypomnień w tym dniu.</div>`}
          </div>

          <form onsubmit="event.preventDefault(); App.saveCalendarReminder('${dateStr}', this);" style="display:flex; flex-direction:column; gap:10px; padding-top:12px; border-top:1px solid var(--border);">
            <input type="text" name="title" class="input-clean" placeholder="+ Wpisz treść przypomnienia / zadania..." required autofocus>
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
    const roleId = form.roleId.value || Store.state.roles[0].id;
    const q = parseInt(form.q.value, 10) || 2;

    Store.state.reminders.push({
      id: 'c_' + Date.now(),
      date: dateStr,
      title,
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
      { q: 1, title: '🔥 Ćwiartka I: Pilne i Ważne', sub: 'Zrób od razu (kryzysy, pilne terminy)' },
      { q: 2, title: '💎 Ćwiartka II: Niepilne, ale Ważne', sub: 'Najważniejsza ćwiartka: rozwój, planowanie, cele ról' },
      { q: 3, title: '⚡ Ćwiartka III: Pilne, ale Nieważne', sub: 'Bieżączka i rozproszenia do zminimalizowania' },
      { q: 4, title: '🗑️ Ćwiartka IV: Niepilne i Nieważne', sub: 'Pożeracze czasu do odrzucenia' }
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
              const r = Store.state.roles.find(x => x.id === t.roleId);
              const delay = Math.max(0, D.diff(today, t.scheduledDate || today));
              return `
                <div class="task-row" style="${t.sawId ? 'border-left: 3px solid var(--emerald);' : ''}">
                  <div class="task-row-left" style="flex-wrap:wrap;">
                    <button class="check-circle" onclick="App.doneTask('${t.id}')" title="Odhacz jako wykonane">✓</button>
                    <span>${this.esc(t.title)}</span>
                    ${t.sawId ? `<span style="font-size:0.65rem; color:var(--emerald); background:var(--emerald-light); padding:1px 6px; border-radius:999px; font-weight:700;">🪚 ${this.esc((t.sawDate || '').slice(5))}</span>` : ''}
                    ${t.fromCalendarDate ? `<span style="font-size:0.68rem; color:var(--accent); background:var(--accent-light); padding:1px 6px; border-radius:999px; font-weight:700;">📅 ${t.fromCalendarDate.slice(5)}</span>` : ''}
                    ${delay > 0 ? `<span style="font-size:0.68rem; color:var(--crimson); background:var(--crimson-light); border:1px solid rgba(220,38,38,0.25); padding:1px 7px; border-radius:999px; font-weight:800;">⏳ ${delay} ${delay === 1 ? 'dzień' : 'dni'} opóźnienia</span>` : ''}
                  </div>
                  <div style="display:flex; align-items:center; gap:5px; flex-shrink:0;">
                    <span style="font-size:0.72rem; color:var(--text-muted); cursor:pointer; padding:2px 6px; border-radius:4px; background:var(--surface);" onclick="App.cycleRole('${t.id}')" title="Kliknij, aby zmienić rodzaj (Ciało / Umysł / Relacje / Finanse)">${r ? r.emoji + ' ' + this.esc(r.name) : ''}</span>
                    <span class="q-tag q${t.q || 2}" onclick="App.cycleQ('${t.id}')" title="Kliknij, aby zmienić ćwiartkę">Q${t.q || 2}</span>
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

  /* ---- ZAKŁADKA 3: OSTRZENIE PIŁY ---- */
  editingSawId: null,
  newSawDays: [0, 1, 2, 3, 4, 5, 6],

  getSawCycleLabel(s) {
    const days = ['Pn','Wt','Śr','Cz','Pt','Sb','Nd'];
    const act = Array.isArray(s.activeDays) ? s.activeDays : [0,1,2,3,4,5,6];
    if (act.length === 7) return 'Codziennie';
    if (act.length === 0) return 'Brak dni';
    return act.slice().sort((a,b) => a - b).map(i => days[i]).join(', ');
  },

  isSawDueToday(s) {
    if (!s) return false;
    const now = new Date();
    const dow = (now.getDay() + 6) % 7; // 0 = Poniedziałek .. 6 = Niedziela
    const act = Array.isArray(s.activeDays) ? s.activeDays : [0,1,2,3,4,5,6];
    return act.includes(dow);
  },

  doneSawToday(id) {
    const s = Store.state.saw.find(x => x.id === id);
    if (!s) return;
    const today = this.today();
    if (!Array.isArray(s.doneDays)) s.doneDays = [];
    if (!s.doneDays.includes(today)) {
      s.doneDays.push(today);
    }
    const now = new Date();
    const stamp = `${today} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    Store.state.archive.unshift({
      id: 'ar_saw_' + Date.now(),
      title: s.title,
      roleId: s.roleId || 'r1',
      q: s.q || 2,
      doneAt: stamp,
      year: Store.state.year,
      createdAt: Date.now()
    });
    this.save();
    this.renderAll();
  },

  toggleEditSaw(id) {
    this.editingSawId = (this.editingSawId === id) ? null : id;
    this.renderSaw();
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
      // Jeśli wyłączono dzisiejszy dzień tygodnia, usuń dzisiejsze niewykonane wystąpienie z listy
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
    // Zaktualizuj też aktywne zadania tej pozycji na liście
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
            <th style="width:36%;">Ostrzenie Piły (Nawyk / Zadanie cykliczne)</th>
            <th style="width:24%;">Rola (Gdzie wskakuje)</th>
            <th style="width:10%;">Ćwiartka</th>
            <th style="width:30%;">Dni tygodnia (Pn–Nd)</th>
          </tr>
        </thead>
        <tbody>
          ${Store.state.saw.map(s => {
            const isEditing = (this.editingSawId === s.id);
            const act = Array.isArray(s.activeDays) ? s.activeDays : [0,1,2,3,4,5,6];
            const role = Store.state.roles.find(r => r.id === (s.roleId || 'r1')) || Store.state.roles[0];
            return `
              <tr style="${isEditing ? 'background:var(--accent-light);' : ''}">
                <td><strong>${this.esc(s.title)}</strong></td>
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
                  <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <div class="week-dots">
                      ${days.map((dLabel, idx) => {
                        const isSelected = act.includes(idx);
                        return `<button type="button" class="dot-btn ${isSelected ? 'done' : ''}"
                          style="${isEditing ? 'cursor:pointer;' : 'cursor:default; opacity:0.88;'}"
                          ${isEditing ? `onclick="App.toggleSawActiveDay('${s.id}', ${idx})"` : 'disabled'}
                          title="${isEditing ? 'Kliknij, aby włączyć/wyłączyć ten dzień tygodnia' : 'Kliknij Edytuj obok, aby zmienić dni'}">${dLabel}</button>`;
                      }).join('')}
                    </div>
                    <button type="button" class="btn ${isEditing ? 'btn-primary' : ''}" style="padding:3px 10px; font-size:0.74rem;" onclick="App.toggleEditSaw('${s.id}')">
                      ${isEditing ? '✓ Zapisz' : '✏️ Edytuj'}
                    </button>
                    <button type="button" class="btn" style="padding:3px 7px;" onclick="App.deleteSaw('${s.id}')" title="Usuń pozycję">✕</button>
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

  openAddSawModal() {
    const root = document.getElementById('modalRoot');
    if (!root) return;
    this.newSawDays = [0, 1, 2, 3, 4, 5, 6];
    const days = ['Pn','Wt','Śr','Cz','Pt','Sb','Nd'];

    root.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) App.closeModal()">
        <div class="modal" style="max-width:500px;">
          <div class="modal-header">
            <div>
              <h3 style="font-size:1.1rem; font-weight:800;">🪚 Dodaj do Ostrzenia Piły</h3>
              <p style="font-size:0.76rem; color:var(--text-muted); margin-top:2px;">
                Zaznacz dni tygodnia, w które to przypomnienie ma się pojawiać na głównej liście.
              </p>
            </div>
            <button class="btn" onclick="App.closeModal()">✕</button>
          </div>

          <form onsubmit="event.preventDefault(); App.saveNewSaw(this);" style="display:flex; flex-direction:column; gap:12px;">
            <div>
              <label style="font-size:0.74rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">Nazwa nawyku / zadania cyklicznego:</label>
              <input type="text" name="title" class="input-clean" placeholder="np. Wyjście na spacer, Przegląd faktur..." required autofocus>
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
              <label style="font-size:0.74rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:6px;">Zaznacz dni tygodnia (Pn–Nd), w które ma się pojawiać:</label>
              <div class="week-dots" id="modalNewSawDaysWrap" style="gap:6px;">
                ${days.map((dLabel, dIdx) => `
                  <button type="button" class="dot-btn done" style="width:34px; height:34px; font-size:0.78rem;" onclick="App.toggleNewSawModalDay(${dIdx})">${dLabel}</button>
                `).join('')}
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
    const roleId = form.roleId.value || Store.state.roles[0].id;
    const q = parseInt(form.q.value, 10) || 2;

    Store.state.saw.push({
      id: 's_' + Date.now(),
      title,
      roleId,
      q,
      activeDays: [...this.newSawDays],
      startDate: this.today(),
      spawnedDates: [],
      doneDays: [],
      createdAt: Date.now()
    });
    this.processDueReminders();
    this.save();
    this.closeModal();
    this.renderAll();
  },

  /* ---- ZAKŁADKA 4: CELE (TYGODNIOWE & KWARTALNE - SMART + ARCHIWUM CELÓW) ---- */
  _renderedGoalsYear: null,

  renderGoals(forceRebuild = false) {
    const y = Store.state.year;
    const curQ = Math.floor(new Date().getMonth() / 3) + 1;
    const gYear = Store.state.goals[y] || {};
    const el = document.getElementById('goalsTableContainer');
    if (!el) return;

    const existingTable = document.getElementById('goalsInputsTable');
    if (!forceRebuild && existingTable && this._renderedGoalsYear === y) {
      // Tabela już istnieje w DOM — aktualizujemy tylko wartości nieaktywnych pól bez przebudowywania HTML!
      existingTable.querySelectorAll('input[data-goal-role]').forEach(inp => {
        if (inp === document.activeElement) return;
        const rId = inp.getAttribute('data-goal-role');
        const h = inp.getAttribute('data-goal-horizon');
        const val = gYear[rId]?.[h] || '';
        if (inp.value !== val) inp.value = val;
      });
      this.renderGoalsArchive();
      return;
    }

    this._renderedGoalsYear = y;

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

    el.innerHTML = `
      <table class="clean-table" id="goalsInputsTable">
        <thead>
          <tr>
            <th style="width:18%;">Rola (Noga Stołu)</th>
            <th style="width:41%;">⚡ Cel Tygodniowy — konkretny, policzalny krok (widoczny w rubryczce Roli)</th>
            <th style="width:41%;">📊 Cel Kwartalny Q${curQ} (${y}) — mierzalny wynik SMART (widoczny w kafelku na górze)</th>
          </tr>
        </thead>
        <tbody>
          ${Store.state.roles.map(r => {
            const g = gYear[r.id] || { weekly: '', quarterly: '' };
            const ph = smartPlaceholders[r.id] || { weekly: 'Ile? Co dokładnie? Do końca tygodnia...', quarterly: 'Ile? Co dokładnie? Do końca kwartału...' };
            return `
              <tr>
                <td><strong>${r.emoji} ${this.esc(r.name)}</strong></td>
                <td>
                  <div style="display:flex; gap:6px; align-items:center;">
                    <input type="text" class="input-clean goal-edit-input" data-goal-role="${r.id}" data-goal-horizon="weekly" value="${this.esc(g.weekly || '')}" placeholder="${this.esc(ph.weekly)}" oninput="App.saveGoal('${r.id}','weekly',this.value)">
                    <button type="button" class="btn" style="padding:6px 10px; font-size:0.74rem; color:var(--emerald); border-color:var(--emerald-border); background:var(--emerald-light); flex-shrink:0;" onclick="App.archiveGoal('${r.id}','weekly')" title="Oznacz cel tygodniowy jako zrealizowany i przenieś do Archiwum Celów">✓ Zrobione</button>
                  </div>
                </td>
                <td>
                  <div style="display:flex; gap:6px; align-items:center;">
                    <input type="text" class="input-clean goal-edit-input" data-goal-role="${r.id}" data-goal-horizon="quarterly" value="${this.esc(g.quarterly || '')}" placeholder="${this.esc(ph.quarterly)}" oninput="App.saveGoal('${r.id}','quarterly',this.value)">
                    <button type="button" class="btn" style="padding:6px 10px; font-size:0.74rem; color:var(--emerald); border-color:var(--emerald-border); background:var(--emerald-light); flex-shrink:0;" onclick="App.archiveGoal('${r.id}','quarterly')" title="Oznacz cel kwartalny jako zrealizowany i przenieś do Archiwum Celów">✓ Zrobione</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    this.renderGoalsArchive();
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

    if (!Array.isArray(Store.state.goalsArchive)) Store.state.goalsArchive = [];
    const now = new Date();
    const stamp = `${this.today()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    Store.state.goalsArchive.unshift({
      id: 'ga_' + Date.now(),
      title: text,
      roleId,
      horizon, // 'weekly' | 'quarterly'
      periodLabel: horizon === 'quarterly' ? `Kwartał Q${curQ} (${y})` : `Tydzień (${this.today()})`,
      doneAt: stamp,
      year: y,
      createdAt: Date.now()
    });

    // Wyczyść zrealizowany cel z bieżącego pola
    Store.state.goals[y][roleId][horizon] = '';
    if (!Store.state.fieldStamps) Store.state.fieldStamps = {};
    Store.state.fieldStamps[`goal:${y}:${roleId}:${horizon}`] = Date.now();

    const inp = document.querySelector(`#goalsInputsTable input[data-goal-role="${roleId}"][data-goal-horizon="${horizon}"]`);
    if (inp) inp.value = '';

    this.save();
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
                <td>${this.esc(a.title)}</td>
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

  /* ---- SZUFLADA „NA PÓŹNIEJ” ---- */
  toggleLater() { document.getElementById('laterDrawer').classList.toggle('open'); },

  renderLater() {
    const cnt = document.getElementById('laterCount');
    if (cnt) cnt.textContent = Store.state.later.length;
    const listEl = document.getElementById('laterList');
    if (!listEl) return;
    listEl.innerHTML = Store.state.later.map(l => `
      <div class="task-row" style="flex-direction:column; align-items:stretch; gap:6px;">
        <div style="display:flex; justify-content:space-between;">
          <strong>💡 ${this.esc(l.title)}</strong>
          <button class="btn" style="padding:1px 6px;" onclick="App.removeLater('${l.id}')">✕</button>
        </div>
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
    Store.state.later.unshift({ id: 'l_' + Date.now(), title: inp.value.trim(), createdAt: Date.now() });
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
  exportJSON() {
    const blob = new Blob([JSON.stringify(Store.state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `PlanTygodnia_${this.today()}.json`;
    a.click();
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
    const root = document.getElementById('modalRoot');
    if (root) root.innerHTML = '';
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
