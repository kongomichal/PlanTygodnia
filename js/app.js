'use strict';

/**
 * Główny kontroler UI aplikacji Plan Tygodnia.
 * Wszystkie dane użytkownika są przechowywane w Store.state i automatycznie synchronizowane z Google Firebase Firestore.
 */
const App = {
  activeTab: 'plan',
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),

  init() {
    Store.init();
    this.calYear = Store.state.year || new Date().getFullYear();
    this.initTheme();

    if (window.Sync && typeof window.Sync.init === 'function') {
      window.Sync.init();
    }

    Store.subscribe(() => this.renderAll());
    this.renderAll();
  },

  initTheme() {
    const th = Store.state?.theme || localStorage.getItem('kompas_theme') || 'light';
    document.documentElement.setAttribute('data-theme', th);
    const btn = document.getElementById('btnThemeToggle');
    if (btn) btn.textContent = th === 'dark' ? '☀️' : '🌙';
  },

  toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('kompas_theme', next); } catch (e) {}
    Store.state.theme = next;
    if (!Store.state.fieldStamps) Store.state.fieldStamps = {};
    Store.state.fieldStamps.theme = Date.now();
    Store.persist();
    const btn = document.getElementById('btnThemeToggle');
    if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
  },

  today() {
    return D.today();
  },

  nowStamp() {
    const d = new Date();
    return `${this.today()} ${D.pad(d.getHours())}:${D.pad(d.getMinutes())}`;
  },

  getCurrentWeekDates() {
    const ws = D.weekStart(this.today());
    return [0, 1, 2, 3, 4, 5, 6].map(i => D.addDays(ws, i));
  },

  /* ---- NAWIGACJA I WYBÓR ROKU ---- */
  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.tab-btn[data-tab]').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-section').forEach(sec => {
      sec.style.display = (sec.id === 'view_' + tab) ? 'block' : 'none';
    });
    this.renderAll();
  },

  setYear(yr) {
    const y = Number(yr) || new Date().getFullYear();
    Store.state.year = y;
    this.calYear = y;
    if (!Store.state.goals[y]) Store.state.goals[y] = {};
    Store.state.roles.forEach(r => {
      if (!Store.state.goals[y][r.id]) {
        Store.state.goals[y][r.id] = { weekly: '', monthly: '', quarterly: '', yearly: '' };
      }
    });
    if (!Store.state.fieldStamps) Store.state.fieldStamps = {};
    Store.state.fieldStamps.year = Date.now();
    Store.persist();
  },

  /* ---- EKRAN POWITALNY: 7 NAWYKÓW STEPHENA COVEYA & MOJE ZASADY ---- */
  openWelcome() {
    this.renderWelcome();
    const el = document.getElementById('welcomeOverlay');
    if (el) el.classList.remove('hidden');
  },

  closeWelcome() {
    const el = document.getElementById('welcomeOverlay');
    if (el) el.classList.add('hidden');
  },

  renderWelcome() {
    const affBox = document.getElementById('welcomeAffirmation');
    if (affBox) {
      const firstAff = Store.state.affirmations?.[0];
      const text = typeof firstAff === 'object' ? firstAff.text : firstAff;
      affBox.textContent = text ? `„${text}”` : 'Działam proaktywnie, spokojnie i skupiam się na tym, co najważniejsze.';
    }

    const rulesList = document.getElementById('welcomeRulesList');
    if (rulesList) {
      const rules = Store.state.rules || [];
      if (rules.length === 0) {
        rulesList.innerHTML = `<li style="color:var(--text-dim); list-style:none;">Brak dopisanych własnych zasad — możesz dodać je poniżej.</li>`;
      } else {
        rulesList.innerHTML = rules.map(r => {
          const txt = typeof r === 'object' ? r.text : r;
          const id = typeof r === 'object' ? r.id : txt;
          return `
            <li style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:4px 0;">
              <span>• ${esc(txt)}</span>
              <button class="del-btn" onclick="App.removeRule('${esc(id)}')" title="Usuń zasadę">✕</button>
            </li>
          `;
        }).join('');
      }
    }
  },

  addRule(form) {
    const inp = form.ruleText;
    const text = (inp.value || '').trim();
    if (!text) return;
    Store.state.rules.push({ id: 'rule_' + uid(), text, createdAt: Date.now() });
    inp.value = '';
    Store.persist();
    this.renderWelcome();
  },

  removeRule(id) {
    Store.state.rules = (Store.state.rules || []).filter(r => (r.id || r) !== id);
    Store.persist();
    this.renderWelcome();
  },

  /* ---- WIDOK 1: PLAN TYGODNIA (CELE + OSTRZENIE PIŁY NA DZIŚ/TYDZIEŃ + ROLE + KALENDARZ) ---- */
  renderPlan() {
    const y = Store.state.year;
    const gYear = Store.state.goals?.[y] || {};

    // 1. Kompaktowy pasek celów tygodniowych na górze
    const stripEl = document.getElementById('goalsStripItems');
    if (stripEl) {
      stripEl.innerHTML = Store.state.roles.map(r => {
        const gw = gYear[r.id]?.weekly || '';
        return `
          <div class="goal-strip-item">
            <strong>${r.emoji} ${esc(r.name)}:</strong>
            <span style="color:${gw ? 'var(--text-main)' : 'var(--text-dim)'};">${gw ? esc(gw) : 'ustal cel w zakładce Cele'}</span>
          </div>
        `;
      }).join('');
    }

    // 2. Sekcja Ostrzenia Piły na ekranie głównym:
    //    - Lewa kolumna: Codzienne rzeczy do wykonania dzisiaj (np. Spacer, Dziennik)
    //    - Prawa kolumna: Cotygodniowe i cykliczne zadania przypadające w tym tygodniu
    this.renderTodaySawOnPlan();

    // 3. 4 Karty Ról (Stół z 4 Nogami)
    const rolesGrid = document.getElementById('rolesGrid');
    if (rolesGrid) {
      const activeTasks = (Store.state.tasks || []).filter(t => (t.year || y) === y);
      rolesGrid.innerHTML = Store.state.roles.map(r => {
        const rTasks = activeTasks.filter(t => t.roleId === r.id);
        const gw = gYear[r.id]?.weekly || '';
        return `
          <div class="role-card" style="border-top: 3px solid ${r.color};">
            <div class="role-card-head">
              <div class="role-card-title">${r.emoji} ${esc(r.name)}</div>
              <span class="role-badge-count">${rTasks.length}</span>
            </div>
            ${gw ? `<div class="role-goal-banner">🎯 ${esc(gw)}</div>` : ''}
            <div class="task-list">
              ${rTasks.length ? rTasks.map(t => `
                <div class="task-row">
                  <div class="task-row-left">
                    <button class="check-btn" onclick="App.completeTask('${esc(t.id)}')" title="Odhacz jako wykonane (trafi do Archiwum z dzisiejszą datą)">✓</button>
                    <span>${esc(t.title)}</span>
                  </div>
                  <div style="display:flex; align-items:center; gap:4px;">
                    <span class="q-tag q${t.q || 2}" onclick="App.cycleTaskQ('${esc(t.id)}')" title="Kliknij, aby zmienić ćwiartkę Matrycy (Q1–Q4)">Q${t.q || 2}</span>
                    <button class="del-btn" onclick="App.deleteTask('${esc(t.id)}')" title="Usuń">✕</button>
                  </div>
                </div>
              `).join('') : `<div style="font-size:0.76rem; color:var(--text-dim); padding:8px 2px;">Brak wpisanych zadań w tym tygodniu</div>`}
            </div>
            <form class="quick-form" onsubmit="event.preventDefault(); App.addTaskToRole('${esc(r.id)}', this);">
              <input type="text" name="title" class="input-clean" placeholder="+ Dodaj zadanie..." required>
              <button type="submit" class="btn btn-primary">+</button>
            </form>
          </div>
        `;
      }).join('');
    }
  },

  renderTodaySawOnPlan() {
    const dailyBox = document.getElementById('sawDailyOnPlan');
    const weeklyBox = document.getElementById('sawWeeklyOnPlan');
    if (!dailyBox || !weeklyBox) return;

    const today = this.today();
    const weekDates = this.getCurrentWeekDates();
    const allSaw = Store.state.saw || [];

    const dailyItems = allSaw.filter(s => (s.freqType || 'daily') === 'daily');
    const periodicItems = allSaw.filter(s => (s.freqType || 'daily') !== 'daily');

    // Render codziennych rzeczy na dziś
    dailyBox.innerHTML = dailyItems.length ? dailyItems.map(s => {
      const isDoneToday = Array.isArray(s.doneDays) && s.doneDays.includes(today);
      return `
        <div class="saw-pill ${isDoneToday ? 'is-done' : ''}" onclick="App.toggleSawDay('${esc(s.id)}', '${today}')">
          <span>${isDoneToday ? '✓' : '○'}</span>
          <span>${esc(s.title)}</span>
        </div>
      `;
    }).join('') : `<span style="font-size:0.78rem; color:var(--text-dim);">Brak codziennych nawyków</span>`;

    // Render cotygodniowych / cyklicznych zadań na ten tydzień
    weeklyBox.innerHTML = periodicItems.length ? periodicItems.map(s => {
      // Sprawdź czy w bieżącym tygodniu zostało już odhaczone (w dowolny dzień tygodnia lub w przypisany dzień)
      const targetDate = (s.freqType === 'weekly' && s.dow != null) ? weekDates[s.dow] : today;
      const isDoneThisWeek = Array.isArray(s.doneDays) && s.doneDays.some(d => weekDates.includes(d));
      const toggleDate = isDoneThisWeek
        ? (s.doneDays.find(d => weekDates.includes(d)) || targetDate)
        : targetDate;

      return `
        <div class="saw-pill ${isDoneThisWeek ? 'is-done' : ''}" onclick="App.toggleSawDay('${esc(s.id)}', '${toggleDate}')">
          <span>${isDoneThisWeek ? '✓' : '○'}</span>
          <span>${esc(s.title)}</span>
          <span class="saw-pill-cycle">${esc(s.cycleLabel || 'Co tydzień')}</span>
        </div>
      `;
    }).join('') : `<span style="font-size:0.78rem; color:var(--text-dim);">Brak zadań cotygodniowych — dodaj je w zakładce „🪚 Ostrzenie Piły”</span>`;
  },

  addTaskToRole(roleId, form) {
    const title = (form.title.value || '').trim();
    if (!title) return;
    Store.state.tasks.push({
      id: 't_' + uid(),
      title,
      roleId,
      q: 2,
      year: Store.state.year,
      createdAt: Date.now()
    });
    form.title.value = '';
    Store.persist();
  },

  cycleTaskQ(id) {
    const t = Store.state.tasks.find(x => x.id === id);
    if (!t) return;
    t.q = ((Number(t.q) || 2) % 4) + 1;
    Store.persist();
  },

  completeTask(id) {
    const idx = Store.state.tasks.findIndex(x => x.id === id);
    if (idx < 0) return;
    const [t] = Store.state.tasks.splice(idx, 1);
    Store.state.archive.unshift({
      id: 'arch_' + uid(),
      title: t.title,
      roleId: t.roleId,
      q: t.q || 2,
      doneAt: this.nowStamp(),
      year: Store.state.year,
      createdAt: Date.now()
    });
    Store.persist();
    this.showToast(`Wykonano: „${t.title}” (zapisano w Archiwum)`);
  },

  deleteTask(id) {
    Store.state.tasks = Store.state.tasks.filter(x => x.id !== id);
    Store.persist();
  },

  /* ---- KALENDARZ MIESIĘCZNY NA DOLE ---- */
  changeMonth(delta) {
    this.calMonth += delta;
    if (this.calMonth < 0) { this.calMonth = 11; this.calYear--; }
    if (this.calMonth > 11) { this.calMonth = 0; this.calYear++; }
    this.renderCalendar();
  },

  renderCalendar() {
    const titleEl = document.getElementById('calMonthTitle');
    const gridEl = document.getElementById('calGrid');
    if (!titleEl || !gridEl) return;

    titleEl.textContent = `${D.MON_NOM[this.calMonth]} ${this.calYear}`;

    const first = new Date(this.calYear, this.calMonth, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(this.calYear, this.calMonth + 1, 0).getDate();
    const total = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    const today = this.today();

    let html = '';
    for (let i = 0; i < total; i++) {
      const d = new Date(this.calYear, this.calMonth, 1 - startOffset + i);
      const dStr = D.toStr(d);
      const isCur = d.getMonth() === this.calMonth;
      const rems = (Store.state.reminders || []).filter(r => r.date === dStr);

      html += `
        <div class="cal-cell ${isCur ? '' : 'other'} ${dStr === today ? 'today' : ''}" onclick="App.openCalendarDayModal('${dStr}')">
          <div class="cal-num">
            <span>${d.getDate()}</span>
            <span style="font-size:0.68rem; color:var(--accent); opacity:0.7;">+</span>
          </div>
          ${rems.map(r => `
            <div class="cal-chip" title="${esc(r.title)}">
              <span style="overflow:hidden; text-overflow:ellipsis;">🔔 ${esc(r.title)}</span>
            </div>
          `).join('')}
        </div>
      `;
    }
    gridEl.innerHTML = html;
  },

  openCalendarDayModal(dateStr) {
    const root = document.getElementById('modalRoot');
    if (!root) return;
    const rems = (Store.state.reminders || []).filter(r => r.date === dateStr);
    root.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) App.closeModal()">
        <div class="modal" style="max-width:480px;">
          <div class="modal-header">
            <h3>📅 Przypomnienia na dzień: ${dateStr}</h3>
            <button class="btn" onclick="App.closeModal()">✕</button>
          </div>
          <div style="display:flex; flex-direction:column; gap:6px;">
            ${rems.length ? rems.map(r => `
              <div class="task-row">
                <span>🔔 ${esc(r.title)}</span>
                <button class="del-btn" onclick="App.deleteReminder('${esc(r.id)}', '${dateStr}')">🗑️</button>
              </div>
            `).join('') : `<div style="font-size:0.82rem; color:var(--text-dim);">Brak przypomnień w tym dniu.</div>`}
          </div>
          <form onsubmit="event.preventDefault(); App.addReminder('${dateStr}', this);" style="display:flex; gap:8px; margin-top:8px;">
            <input type="text" name="title" class="input-clean" placeholder="Wpisz przypomnienie na ${dateStr}..." required autofocus>
            <button type="submit" class="btn btn-primary">Dodaj</button>
          </form>
        </div>
      </div>
    `;
  },

  addReminder(dateStr, form) {
    const title = (form.title.value || '').trim();
    if (!title) return;
    Store.state.reminders.push({
      id: 'rem_' + uid(),
      date: dateStr,
      title,
      createdAt: Date.now()
    });
    Store.persist();
    this.openCalendarDayModal(dateStr);
  },

  deleteReminder(id, dateStr) {
    Store.state.reminders = (Store.state.reminders || []).filter(r => r.id !== id);
    Store.persist();
    this.openCalendarDayModal(dateStr);
  },

  closeModal() {
    const root = document.getElementById('modalRoot');
    if (root) root.innerHTML = '';
  },

  /* ---- ZAKŁADKA 2: MATRYCA EISENHOWERA (OSOBNA ZAKŁADKA) ---- */
  renderMatrix() {
    const grid = document.getElementById('matrixGrid');
    if (!grid) return;

    const meta = [
      { q: 1, title: '🔥 Ćwiartka I: Pilne i Ważne', sub: 'Zrób od razu (kryzysy, pilne terminy)' },
      { q: 2, title: '💎 Ćwiartka II: Niepilne, ale Ważne', sub: 'Najważniejsza ćwiartka: planowanie, rozwój, cele ról' },
      { q: 3, title: '⚡ Ćwiartka III: Pilne, ale Nieważne', sub: 'Bieżączka i rozproszenia do ograniczenia' },
      { q: 4, title: '🗑️ Ćwiartka IV: Niepilne i Nieważne', sub: 'Pożeracze czasu do eliminacji' }
    ];

    const y = Store.state.year;
    const tasks = (Store.state.tasks || []).filter(t => (t.year || y) === y);

    grid.innerHTML = meta.map(m => {
      const list = tasks.filter(t => (Number(t.q) || 2) === m.q);
      return `
        <div class="quad-card q${m.q}">
          <div>
            <h3 style="font-size:0.96rem; font-weight:800;">${m.title} (${list.length})</h3>
            <p style="font-size:0.76rem; color:var(--text-muted);">${m.sub}</p>
          </div>
          <div class="task-list" style="flex:1;">
            ${list.length ? list.map(t => {
              const r = Store.state.roles.find(x => x.id === t.roleId);
              return `
                <div class="task-row">
                  <div class="task-row-left">
                    <button class="check-btn" onclick="App.completeTask('${esc(t.id)}')">✓</button>
                    <span>${esc(t.title)}</span>
                  </div>
                  <span style="font-size:0.72rem; color:var(--text-muted);">${r ? r.emoji + ' ' + esc(r.name) : ''}</span>
                  <span class="q-tag q${t.q || 2}" onclick="App.cycleTaskQ('${esc(t.id)}')">Q${t.q || 2}</span>
                </div>
              `;
            }).join('') : `<div style="color:var(--text-dim); font-size:0.8rem; margin:auto 0; text-align:center;">Brak zadań w tej ćwiartce</div>`}
          </div>
          <form class="quick-form" onsubmit="event.preventDefault(); App.addTaskFromMatrix(${m.q}, this);">
            <input type="text" name="title" class="input-clean" placeholder="+ Dodaj do Ćwiartki ${m.q}..." required>
            <select name="roleId" class="input-clean" style="max-width:140px;">
              ${Store.state.roles.map(r => `<option value="${esc(r.id)}">${r.emoji} ${esc(r.name)}</option>`).join('')}
            </select>
            <button type="submit" class="btn btn-primary">+</button>
          </form>
        </div>
      `;
    }).join('');
  },

  addTaskFromMatrix(q, form) {
    const title = (form.title.value || '').trim();
    if (!title) return;
    Store.state.tasks.push({
      id: 't_' + uid(),
      title,
      roleId: form.roleId.value || Store.state.roles[0].id,
      q,
      year: Store.state.year,
      createdAt: Date.now()
    });
    form.title.value = '';
    Store.persist();
  },

  /* ---- ZAKŁADKA 3: OSTRZENIE PIŁY (CODZIENNE + COTYGODNIOWE + CYKLICZNE) ---- */
  renderSaw() {
    const container = document.getElementById('sawContainer');
    if (!container) return;

    const weekDates = this.getCurrentWeekDates();
    const daysShort = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];
    const allSaw = Store.state.saw || [];

    const groups = [
      { key: 'daily', title: '☀️ Codzienne rzeczy do wykonania (każdego dnia)', items: allSaw.filter(s => (s.freqType || 'daily') === 'daily') },
      { key: 'weekly', title: '📅 Cotygodniowe zadania i rytuały', items: allSaw.filter(s => s.freqType === 'weekly') },
      { key: 'monthly', title: '🗓️ Comiesięczne / Kwartalne / Roczne', items: allSaw.filter(s => s.freqType === 'monthly') }
    ];

    container.innerHTML = groups.map(g => `
      <div style="margin-bottom:22px;">
        <div style="font-size:0.88rem; font-weight:800; margin-bottom:8px; color:var(--text-main);">
          ${g.title} (${g.items.length})
        </div>
        ${g.items.length ? `
          <table class="clean-table">
            <thead>
              <tr>
                <th style="width:36%;">Czynność / Nawyk</th>
                <th style="width:18%;">Obszar</th>
                <th style="width:18%;">Kiedy przypada</th>
                <th style="width:22%;">Ten tydzień (Pn–Nd)</th>
                <th style="width:6%; text-align:right;">Usuń</th>
              </tr>
            </thead>
            <tbody>
              ${g.items.map(s => `
                <tr>
                  <td><strong>${esc(s.title)}</strong></td>
                  <td>${esc(s.dim || 'Odnowa')}</td>
                  <td><span class="saw-pill-cycle">${esc(s.cycleLabel || 'Codziennie')}</span></td>
                  <td>
                    <div class="week-dots">
                      ${weekDates.map((dStr, idx) => {
                        const done = Array.isArray(s.doneDays) && s.doneDays.includes(dStr);
                        return `<button class="dot-btn ${done ? 'done' : ''}" onclick="App.toggleSawDay('${esc(s.id)}', '${dStr}')" title="${dStr}">${daysShort[idx]}</button>`;
                      }).join('')}
                    </div>
                  </td>
                  <td style="text-align:right;">
                    <button class="del-btn" onclick="App.deleteSaw('${esc(s.id)}')">🗑️</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `<div style="font-size:0.8rem; color:var(--text-dim); padding:10px 0;">Brak pozycji w tej grupie.</div>`}
      </div>
    `).join('');
  },

  toggleSawDay(id, dateStr) {
    const s = (Store.state.saw || []).find(x => x.id === id);
    if (!s) return;
    if (!Array.isArray(s.doneDays)) s.doneDays = [];
    const idx = s.doneDays.indexOf(dateStr);
    if (idx >= 0) s.doneDays.splice(idx, 1);
    else s.doneDays.push(dateStr);
    Store.persist();
  },

  openAddSawModal() {
    const root = document.getElementById('modalRoot');
    if (!root) return;
    root.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) App.closeModal()">
        <div class="modal" style="max-width:480px;">
          <div class="modal-header">
            <h3>🪚 Dodaj do Ostrzenia Piły</h3>
            <button class="btn" onclick="App.closeModal()">✕</button>
          </div>
          <form onsubmit="event.preventDefault(); App.saveNewSaw(this);" style="display:flex; flex-direction:column; gap:12px;">
            <input type="text" name="title" class="input-clean" placeholder="Nazwa czynności (np. Przegląd faktur, Trening siłowy)..." required autofocus>
            <select name="dim" class="input-clean">
              <option value="Ciało & Zdrowie">🫀 Ciało & Zdrowie</option>
              <option value="Umysł & Rozwój">🧠 Umysł & Rozwój</option>
              <option value="Relacje & Bliscy">🤝 Relacje & Bliscy</option>
              <option value="Praca & Finanse">💼 Praca & Finanse</option>
            </select>
            <select name="cyclePreset" class="input-clean">
              <option value="daily">☀️ Codziennie (każdego dnia)</option>
              <option value="weekly_0">📅 Co tydzień — w każdy Poniedziałek</option>
              <option value="weekly_1">📅 Co tydzień — w każdy Wtorek</option>
              <option value="weekly_2">📅 Co tydzień — w każdą Środę</option>
              <option value="weekly_3">📅 Co tydzień — w każdy Czwartek</option>
              <option value="weekly_4">📅 Co tydzień — w każdy Piątek</option>
              <option value="weekly_5">📅 Co tydzień — w każdą Sobotę</option>
              <option value="weekly_6">📅 Co tydzień — w każdą Niedzielę</option>
              <option value="monthly">🗓️ Co miesiąc</option>
            </select>
            <button type="submit" class="btn btn-primary" style="justify-content:center; padding:10px;">Zapisz w Ostrzeniu Piły</button>
          </form>
        </div>
      </div>
    `;
  },

  saveNewSaw(form) {
    const title = (form.title.value || '').trim();
    if (!title) return;
    const preset = form.cyclePreset.value;
    let freqType = 'daily';
    let dow = null;
    let cycleLabel = 'Codziennie';
    const dowLabels = ['W każdy poniedziałek', 'W każdy wtorek', 'W każdą środę', 'W każdy czwartek', 'W każdy piątek', 'W każdą sobotę', 'W każdą niedzielę'];

    if (preset.startsWith('weekly_')) {
      freqType = 'weekly';
      dow = parseInt(preset.split('_')[1], 10);
      cycleLabel = dowLabels[dow];
    } else if (preset === 'monthly') {
      freqType = 'monthly';
      cycleLabel = 'Co miesiąc';
    }

    Store.state.saw.push({
      id: 'saw_' + uid(),
      title,
      dim: form.dim.value,
      freqType,
      dow,
      cycleLabel,
      doneDays: [],
      createdAt: Date.now()
    });
    Store.persist();
    this.closeModal();
  },

  deleteSaw(id) {
    Store.state.saw = (Store.state.saw || []).filter(s => s.id !== id);
    Store.persist();
  },

  /* ---- ZAKŁADKA 4: CELE (TYGODNIOWE / MIESIĘCZNE / KWARTALNE / ROCZNE) ---- */
  renderGoals() {
    const container = document.getElementById('goalsTableContainer');
    if (!container) return;
    const y = Store.state.year;
    const gYear = Store.state.goals?.[y] || {};

    container.innerHTML = `
      <table class="clean-table">
        <thead>
          <tr>
            <th style="width:18%;">Rola (Noga Stołu)</th>
            <th>Cel Tygodniowy</th>
            <th>Cel Miesięczny</th>
            <th>Cel Kwartalny</th>
            <th>Cel Roczny (${y})</th>
          </tr>
        </thead>
        <tbody>
          ${Store.state.roles.map(r => {
            const g = gYear[r.id] || { weekly: '', monthly: '', quarterly: '', yearly: '' };
            return `
              <tr>
                <td><strong>${r.emoji} ${esc(r.name)}</strong></td>
                <td><input class="input-clean" value="${esc(g.weekly || '')}" placeholder="Cel na ten tydzień..." onchange="App.saveGoal('${esc(r.id)}','weekly',this.value)"></td>
                <td><input class="input-clean" value="${esc(g.monthly || '')}" placeholder="Cel na ten miesiąc..." onchange="App.saveGoal('${esc(r.id)}','monthly',this.value)"></td>
                <td><input class="input-clean" value="${esc(g.quarterly || '')}" placeholder="Cel na ten kwartał..." onchange="App.saveGoal('${esc(r.id)}','quarterly',this.value)"></td>
                <td><input class="input-clean" value="${esc(g.yearly || '')}" placeholder="Cel na rok ${y}..." onchange="App.saveGoal('${esc(r.id)}','yearly',this.value)"></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  },

  saveGoal(roleId, horizon, val) {
    const y = Store.state.year;
    if (!Store.state.goals[y]) Store.state.goals[y] = {};
    if (!Store.state.goals[y][roleId]) Store.state.goals[y][roleId] = {};
    Store.state.goals[y][roleId][horizon] = (val || '').trim();
    if (!Store.state.fieldStamps) Store.state.fieldStamps = {};
    Store.state.fieldStamps[`goal:${y}:${roleId}:${horizon}`] = Date.now();
    Store.persist();
  },

  /* ---- ZAKŁADKA 5: MYŚLI, CYTATY & AFIRMACJE ---- */
  renderMind() {
    const affEl = document.getElementById('affList');
    const quoteEl = document.getElementById('quoteList');
    if (!affEl || !quoteEl) return;

    const affs = Store.state.affirmations || [];
    affEl.innerHTML = affs.length ? affs.map(a => {
      const txt = typeof a === 'object' ? a.text : a;
      const id = typeof a === 'object' ? a.id : txt;
      return `
        <div class="task-row" style="background:var(--emerald-light);">
          <span>✨ ${esc(txt)}</span>
          <button class="del-btn" onclick="App.deleteAffirmation('${esc(id)}')">✕</button>
        </div>
      `;
    }).join('') : `<div style="font-size:0.8rem; color:var(--text-dim);">Brak wpisanych afirmacji.</div>`;

    const quotes = Store.state.quotes || [];
    quoteEl.innerHTML = quotes.length ? quotes.map(q => {
      const txt = typeof q === 'object' ? q.text : q;
      const id = typeof q === 'object' ? q.id : txt;
      return `
        <div class="task-row">
          <span>💭 ${esc(txt)}</span>
          <button class="del-btn" onclick="App.deleteQuote('${esc(id)}')">✕</button>
        </div>
      `;
    }).join('') : `<div style="font-size:0.8rem; color:var(--text-dim);">Brak wpisanych cytatów i myśli.</div>`;
  },

  addAffirmation() {
    const inp = document.getElementById('affInput');
    const text = (inp?.value || '').trim();
    if (!text) return;
    Store.state.affirmations.unshift({ id: 'aff_' + uid(), text, createdAt: Date.now() });
    inp.value = '';
    Store.persist();
  },

  deleteAffirmation(id) {
    Store.state.affirmations = (Store.state.affirmations || []).filter(a => (a.id || a) !== id);
    Store.persist();
  },

  addQuote() {
    const inp = document.getElementById('quoteInput');
    const text = (inp?.value || '').trim();
    if (!text) return;
    Store.state.quotes.unshift({ id: 'q_' + uid(), text, createdAt: Date.now() });
    inp.value = '';
    Store.persist();
  },

  deleteQuote(id) {
    Store.state.quotes = (Store.state.quotes || []).filter(q => (q.id || q) !== id);
    Store.persist();
  },

  /* ---- ZAKŁADKA 6: ARCHIWUM WYKONANYCH ZADAŃ ---- */
  renderArchive() {
    const container = document.getElementById('archiveTableContainer');
    if (!container) return;
    const y = Store.state.year;
    const list = (Store.state.archive || []).filter(a => (a.year || y) === y);

    container.innerHTML = list.length ? `
      <table class="clean-table">
        <thead>
          <tr>
            <th>Data wykonania (odkliknięcia)</th>
            <th>Zadanie</th>
            <th>Rola</th>
            <th>Ćwiartka</th>
            <th style="text-align:right;">Akcja</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(a => {
            const r = Store.state.roles.find(x => x.id === a.roleId);
            return `
              <tr>
                <td style="color:var(--emerald); font-weight:700;">✓ ${esc(a.doneAt)}</td>
                <td>${esc(a.title)}</td>
                <td>${r ? r.emoji + ' ' + esc(r.name) : '—'}</td>
                <td><span class="q-tag q${a.q || 2}">Q${a.q || 2}</span></td>
                <td style="text-align:right;">
                  <button class="btn" style="padding:2px 8px; font-size:0.72rem;" onclick="App.restoreArchived('${esc(a.id)}')">↩ Przywróć</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    ` : `<p style="color:var(--text-dim); padding:16px 0;">Brak wykonanych zadań w roku ${y}.</p>`;
  },

  restoreArchived(id) {
    const idx = (Store.state.archive || []).findIndex(a => a.id === id);
    if (idx < 0) return;
    const [item] = Store.state.archive.splice(idx, 1);
    Store.state.tasks.push({
      id: 't_' + uid(),
      title: item.title,
      roleId: item.roleId || Store.state.roles[0].id,
      q: item.q || 2,
      year: Store.state.year,
      createdAt: Date.now()
    });
    Store.persist();
  },

  /* ---- SZUFLADA BOCZNA „NA PÓŹNIEJ” ---- */
  toggleLater() {
    const dr = document.getElementById('laterDrawer');
    if (dr) dr.classList.toggle('open');
  },

  renderLater() {
    const countEl = document.getElementById('laterCount');
    const listEl = document.getElementById('laterList');
    const list = Store.state.later || [];
    if (countEl) countEl.textContent = list.length;
    if (!listEl) return;

    listEl.innerHTML = list.length ? list.map(l => `
      <div class="task-row" style="flex-direction:column; align-items:stretch; gap:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong>💡 ${esc(l.title)}</strong>
          <button class="del-btn" onclick="App.removeLater('${esc(l.id)}')">✕</button>
        </div>
        <div style="display:flex; gap:4px; flex-wrap:wrap;">
          ${Store.state.roles.map(r => `
            <button class="btn" style="font-size:0.7rem; padding:2px 6px;" onclick="App.moveLaterToRole('${esc(l.id)}','${esc(r.id)}')">→ ${r.emoji} ${esc(r.name)}</button>
          `).join('')}
        </div>
      </div>
    `).join('') : `<div style="font-size:0.8rem; color:var(--text-dim); text-align:center; padding:20px 0;">Brak odłożonych pomysłów.</div>`;
  },

  addLater() {
    const inp = document.getElementById('laterInput');
    const title = (inp?.value || '').trim();
    if (!title) return;
    Store.state.later.unshift({ id: 'lat_' + uid(), title, createdAt: Date.now() });
    inp.value = '';
    Store.persist();
  },

  moveLaterToRole(laterId, roleId) {
    const idx = (Store.state.later || []).findIndex(x => x.id === laterId);
    if (idx < 0) return;
    const [item] = Store.state.later.splice(idx, 1);
    Store.state.tasks.push({
      id: 't_' + uid(),
      title: item.title,
      roleId,
      q: 2,
      year: Store.state.year,
      createdAt: Date.now()
    });
    Store.persist();
  },

  removeLater(id) {
    Store.state.later = (Store.state.later || []).filter(x => x.id !== id);
    Store.persist();
  },

  /* ---- ZAPIS I ODCZYT PEŁNEGO PLIKU JSON ---- */
  exportJSON() {
    const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
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
        const obj = JSON.parse(ev.target.result);
        Store.importJSON(obj);
        this.showToast('Pomyślnie wczytano plik JSON i zsynchronizowano z Firebase!');
      } catch (err) {
        alert('Błąd pliku JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  },

  showToast(msg) {
    const root = document.getElementById('toastRoot');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  },

  renderAll() {
    const y = Store.state.year || new Date().getFullYear();
    const yrSel = document.getElementById('yearSelect');
    if (yrSel && Number(yrSel.value) !== y) yrSel.value = y;
    document.querySelectorAll('.yearLabel').forEach(el => { el.textContent = y; });

    this.renderWelcome();
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
