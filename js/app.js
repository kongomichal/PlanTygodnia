'use strict';

const APP_LOGO_ICONS = [
  `<svg class="app-logo-svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#4f46e5"/><circle cx="32" cy="32" r="19" fill="none" stroke="#fff" stroke-width="2.5" opacity="0.9"/><polygon points="32,14 37,32 32,29 27,32" fill="#fbbf24"/><polygon points="32,50 37,32 32,35 27,32" fill="#ffffff" opacity="0.85"/></svg>`,
  `<svg class="app-logo-svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#0f172a"/><rect x="11" y="11" width="19" height="19" rx="5" fill="#ef4444"/><rect x="34" y="11" width="19" height="19" rx="5" fill="#10b981"/><rect x="11" y="34" width="19" height="19" rx="5" fill="#f59e0b"/><rect x="34" y="34" width="19" height="19" rx="5" fill="#475569"/></svg>`,
  `<svg class="app-logo-svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#059669"/><rect x="10" y="16" width="44" height="8" rx="4" fill="#fbbf24"/><rect x="14" y="26" width="6" height="24" rx="3" fill="#fff"/><rect x="24" y="26" width="6" height="24" rx="3" fill="#fff"/><rect x="34" y="26" width="6" height="24" rx="3" fill="#fff"/><rect x="44" y="26" width="6" height="24" rx="3" fill="#fff"/></svg>`
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
    this.renderAll();
  },

  initTheme() {
    document.documentElement.setAttribute('data-theme', Store.state.theme || 'light');
  },

  save() {
    Store.persist();
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
  closeWelcome() { document.getElementById('welcomeOverlay').classList.add('hidden'); },

  /* ---- ZAKŁADKI ---- */
  switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-section').forEach(s => { s.style.display = (s.id === 'view_' + tab) ? 'block' : 'none'; });
  },

  setYear(y) {
    Store.state.year = Number(y) || 2026;
    this.calYear = Store.state.year;
    if (!Store.state.goals[Store.state.year]) {
      Store.state.goals[Store.state.year] = {
        r1: { weekly: '', monthly: '', quarterly: '', yearly: '' },
        r2: { weekly: '', monthly: '', quarterly: '', yearly: '' },
        r3: { weekly: '', monthly: '', quarterly: '', yearly: '' },
        r4: { weekly: '', monthly: '', quarterly: '', yearly: '' }
      };
    }
    this.save();
    this.renderAll();
  },

  /* ---- WIDOK 1: PLAN TYGODNIA (ROLE + KALENDARZ — IDENTYCZNIE JAK W DEMO) ---- */
  renderPlan() {
    const y = Store.state.year;
    const gYear = Store.state.goals[y] || {};

    // Pasek celów na górze
    const stripEl = document.getElementById('goalsStripItems');
    if (stripEl) {
      stripEl.innerHTML = Store.state.roles.map(r => {
        const gw = gYear[r.id]?.weekly || 'Brak celu tygodniowego';
        return `
          <div class="goal-pill-item">
            <span class="goal-pill-role">${r.emoji} ${this.esc(r.name)}:</span>
            <span class="goal-pill-val">${this.esc(gw)}</span>
          </div>
        `;
      }).join('');
    }

    // 4 estetyczne rubryczki Ról
    const tasks = Store.state.tasks.filter(t => (t.year || y) === y);
    const gridEl = document.getElementById('rolesGrid');
    if (gridEl) {
      gridEl.innerHTML = Store.state.roles.map(r => {
        const rTasks = tasks.filter(t => t.roleId === r.id);
        const gw = gYear[r.id]?.weekly || '';
        return `
          <div class="role-card" style="border-top: 3px solid ${r.color};">
            <div class="role-card-head">
              <div class="role-card-title">${r.emoji} ${this.esc(r.name)}</div>
              <span class="role-card-count">${rTasks.length}</span>
            </div>
            ${gw ? `<div class="role-goal-hint">🎯 ${this.esc(gw)}</div>` : ''}
            <div class="task-list">
              ${rTasks.map(t => `
                <div class="task-row">
                  <div class="task-row-left">
                    <button class="check-circle" onclick="App.doneTask('${t.id}')" title="Odhacz jako wykonane">✓</button>
                    <span>${this.esc(t.title)}</span>
                  </div>
                  <span class="q-tag q${t.q || 2}" onclick="App.cycleQ('${t.id}')" title="Zmień ćwiartkę Matrycy">Q${t.q || 2}</span>
                </div>
              `).join('')}
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

  addTask(roleId, form) {
    const title = form.title.value.trim();
    if (!title) return;
    Store.state.tasks.push({ id: 't_' + Date.now(), title, roleId, q: 2, year: Store.state.year, createdAt: Date.now() });
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
    const now = new Date();
    const stamp = `${this.today()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    Store.state.archive.unshift({
      id: 'ar_' + Date.now(),
      title: t.title,
      roleId: t.roleId,
      q: t.q || 2,
      doneAt: stamp,
      year: Store.state.year,
      createdAt: Date.now()
    });
    this.save();
    this.renderAll();
  },

  /* ---- KALENDARZ NA DOLE ---- */
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
        <div class="cal-cell ${isCur ? '' : 'other'} ${dStr === today ? 'today' : ''}" onclick="App.addReminderPrompt('${dStr}')">
          <div class="cal-num">${d.getDate()}</div>
          ${rems.map(r => `<div class="cal-chip">🔔 ${this.esc(r.title)}</div>`).join('')}
        </div>
      `;
    }
    const gridEl = document.getElementById('calGrid');
    if (gridEl) gridEl.innerHTML = html;
  },

  addReminderPrompt(dateStr) {
    const title = (prompt(`Dodaj przypomnienie w kalendarzu na dzień ${dateStr}:`) || '').trim();
    if (!title) return;
    Store.state.reminders.push({ id: 'c_' + Date.now(), date: dateStr, title, createdAt: Date.now() });
    this.save();
    this.renderCalendar();
  },

  /* ---- ZAKŁADKA 2: MATRYCA EISENHOWERA ---- */
  renderMatrix() {
    const meta = [
      { q: 1, title: '🔥 Ćwiartka I: Pilne i Ważne', sub: 'Zrób od razu (kryzysy, pilne terminy)' },
      { q: 2, title: '💎 Ćwiartka II: Niepilne, ale Ważne', sub: 'Najważniejsza ćwiartka: rozwój, planowanie, cele ról' },
      { q: 3, title: '⚡ Ćwiartka III: Pilne, ale Nieważne', sub: 'Bieżączka i rozproszenia do zminimalizowania' },
      { q: 4, title: '🗑️ Ćwiartka IV: Niepilne i Nieważne', sub: 'Pożeracze czasu do odrzucenia' }
    ];
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
              return `
                <div class="task-row">
                  <div class="task-row-left">
                    <button class="check-circle" onclick="App.doneTask('${t.id}')">✓</button>
                    <span>${this.esc(t.title)}</span>
                  </div>
                  <span style="font-size:0.72rem; color:var(--text-muted);">${r ? r.emoji + ' ' + this.esc(r.name) : ''}</span>
                  <span class="q-tag q${t.q || 2}" onclick="App.cycleQ('${t.id}')">Q${t.q || 2}</span>
                </div>
              `;
            }).join('') : `<div style="color:var(--text-dim); font-size:0.8rem; margin:auto 0; text-align:center;">Brak zadań w tej ćwiartce</div>`}
          </div>
        </div>
      `;
    }).join('');
  },

  /* ---- ZAKŁADKA 3: OSTRZENIE PIŁY ---- */
  renderSaw() {
    const days = ['Pn','Wt','Śr','Cz','Pt','Sb','Nd'];
    const now = new Date();
    const dow = (now.getDay() + 6) % 7;
    const mon = new Date(now); mon.setDate(now.getDate() - dow);
    const weekDates = [0,1,2,3,4,5,6].map(i => {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    });

    const el = document.getElementById('sawContainer');
    if (!el) return;
    el.innerHTML = `
      <table class="clean-table">
        <thead>
          <tr>
            <th>Ostrzenie Piły (Nawyk / Zadanie cykliczne)</th>
            <th>Wymiar</th>
            <th>Cykl</th>
            <th>Ten tydzień (Pn–Nd)</th>
          </tr>
        </thead>
        <tbody>
          ${Store.state.saw.map(s => `
            <tr>
              <td><strong>${this.esc(s.title)}</strong></td>
              <td>${this.esc(s.dim || 'Odnowa')}</td>
              <td>${this.esc(s.cycle || s.cycleLabel || 'Codziennie')}</td>
              <td>
                <div class="week-dots">
                  ${weekDates.map((dStr, idx) => {
                    const isDone = (s.doneDays || []).includes(dStr);
                    return `<button class="dot-btn ${isDone ? 'done' : ''}" onclick="App.toggleSawDay('${s.id}','${dStr}')">${days[idx]}</button>`;
                  }).join('')}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  },

  toggleSawDay(id, dStr) {
    const s = Store.state.saw.find(x => x.id === id);
    if (!s) return;
    if (!Array.isArray(s.doneDays)) s.doneDays = [];
    const i = s.doneDays.indexOf(dStr);
    if (i >= 0) s.doneDays.splice(i, 1); else s.doneDays.push(dStr);
    this.save();
    this.renderSaw();
  },

  addSawPrompt() {
    const title = (prompt('Nazwa czynności w Ostrzeniu Piły:') || '').trim();
    if (!title) return;
    const cycle = (prompt('Cykl (np. Codziennie, Co tydzień, Co miesiąc):', 'Codziennie') || 'Codziennie').trim();
    Store.state.saw.push({ id: 's_' + Date.now(), title, cycle, dim: 'Odnowa', doneDays: [], createdAt: Date.now() });
    this.save();
    this.renderSaw();
  },

  /* ---- ZAKŁADKA 4: CELE ---- */
  renderGoals() {
    const y = Store.state.year;
    const gYear = Store.state.goals[y] || {};
    const el = document.getElementById('goalsTableContainer');
    if (!el) return;
    el.innerHTML = `
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
                <td><strong>${r.emoji} ${this.esc(r.name)}</strong></td>
                <td><input class="input-clean" value="${this.esc(g.weekly)}" onchange="App.saveGoal('${r.id}','weekly',this.value)"></td>
                <td><input class="input-clean" value="${this.esc(g.monthly)}" onchange="App.saveGoal('${r.id}','monthly',this.value)"></td>
                <td><input class="input-clean" value="${this.esc(g.quarterly)}" onchange="App.saveGoal('${r.id}','quarterly',this.value)"></td>
                <td><input class="input-clean" value="${this.esc(g.yearly)}" onchange="App.saveGoal('${r.id}','yearly',this.value)"></td>
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
    Store.state.goals[y][roleId][horizon] = val.trim();
    if (!Store.state.fieldStamps) Store.state.fieldStamps = {};
    Store.state.fieldStamps[`goal:${y}:${roleId}:${horizon}`] = Date.now();
    this.save();
    this.renderPlan();
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
            <button class="btn" style="padding:2px 6px;" onclick="Store.state.affirmations.splice(${i},1); App.save(); App.renderMind();">✕</button>
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
            <button class="btn" style="padding:2px 6px;" onclick="Store.state.quotes.splice(${i},1); App.save(); App.renderMind();">✕</button>
          </div>
        `;
      }).join('');
    }
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
          <tr><th>Data odkliknięcia</th><th>Zadanie</th><th>Rola</th><th>Ćwiartka</th></tr>
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
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    ` : `<p style="color:var(--text-dim); padding:16px 0;">Brak wykonanych zadań w roku ${y}.</p>`;
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
    document.querySelectorAll('.yearLabel').forEach(el => { el.textContent = Store.state.year; });
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
