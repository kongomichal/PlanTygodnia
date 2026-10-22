'use strict';

/**
 * PLAN TYGODNIA · Główny kontroler aplikacji
 * - Rozkładówka tygodniowa na 1 ekranie (Siatka 7 dni Pon–Niedz)
 * - 🛡️ Baza dla siebie & Zdrowie na samej górze każdego dnia
 * - 🎯 Głaz Tygodnia (Kompas) + Głaz Dnia (Priorytet I)
 * - 📋 Bieżączka (Priorytet II)
 * - 📥 Boczny panel Skrzynki myśli z podziałem na poziomy I, II, III
 * - 🪚 Panel cyklicznych rutyn (co tydzień w dany dzień, co 3 miesiące / kwartalnie)
 */
const App = {
  weekOffset: 0,
  theme: 'light',
  isSidebarOpen: window.innerWidth > 768,
  isCompletedSidebarOpen: false,
  showAllDaysInGrid: false,
  collapsedNotes: new Set(),
  inboxSelectedPriority: 2, // 1, 2, 3
  activeModal: null, // null | 'routines' | 'routine_form' | 'task' | 'settings'
  activeMobileDay: null,

  init() {
    Store.init();
    try {
      const savedCollapsed = JSON.parse(localStorage.getItem('kompas_collapsed_notes') || '[]');
      this.collapsedNotes = new Set(savedCollapsed);
    } catch (e) {
      this.collapsedNotes = new Set();
    }
    this.autoRolloverOverdueTasks();
    this.initTheme();
    this.bindEvents();
    this.renderAll();
    this.initMobileScrollSync();
    this.scrollToCurrentDayOnMobile();

    if (window.Sync && typeof window.Sync.init === 'function') {
      window.Sync.init();
    }

    Store.subscribe(() => {
      this.renderAll();
    });

    window.addEventListener('resize', () => {
      this.updateMobileBottomNav();
    }, { passive: true });
  },

  /* ============ Motyw Jasny / Ciemny ============ */
  initTheme() {
    const saved = localStorage.getItem('kompas.theme') || 'light';
    this.setTheme(saved);
  },

  setTheme(theme) {
    this.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('kompas.theme', theme);
    const meta = document.getElementById('metaThemeColor');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#090d16' : '#f8fafc');
    const btn = document.getElementById('btnThemeToggle');
    if (btn) {
      btn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
      btn.title = theme === 'dark' ? 'Przełącz na jasny motyw' : 'Przełącz na ciemny motyw';
    }
  },

  toggleTheme() {
    this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
  },

  /* ============ Nawigacja tygodniami ============ */
  prevWeek() {
    this.weekOffset--;
    this.renderAll();
  },

  nextWeek() {
    this.weekOffset++;
    this.renderAll();
  },

  currentWeek() {
    this.weekOffset = 0;
    this.renderAll();
  },

  updateWeekNav() {
    const days = this.showAllDaysInGrid
      ? Store.getWeekDays(this.weekOffset)
      : Store.getRollingDays(this.weekOffset).days;
    const start = days[0];
    const end = days[days.length - 1];
    const labelEl = document.getElementById('weekRangeLabel');
    if (labelEl) {
      if (this.weekOffset === 0) {
        labelEl.textContent = `Bieżący rozkład (${D.short(start)} – ${D.short(end)})`;
      } else {
        labelEl.textContent = `${D.short(start)} – ${D.short(end)}`;
      }
    }

    // Kompas tygodnia: Główny cel tygodnia
    const ws = D.weekStart(start);
    const goalInput = document.getElementById('weekGoalInput');
    if (goalInput) {
      goalInput.value = Store.getWeekGoal(ws);
      goalInput.onchange = () => {
        Store.setWeekGoal(ws, goalInput.value.trim());
        this.showToast('Zapisano cel tygodnia 🎯');
      };
    }
  },

  /* ============ Pomocnik priorytetów (I, II, III) ============ */
  getTaskPriority(t) {
    if (t.priority === 1 || t.priority === 2 || t.priority === 3) return t.priority;
    if (t.inbox && t.title && (t.title.startsWith('http') || t.title.includes('://'))) return 3;
    if (t.rock != null || t.q === 1) return 1;
    return 2;
  },

  updateInboxBadge() {
    const inboxItems = Store.state.tasks.filter(t => !t.done && (t.inbox || !t.date) && !t.recur);
    const badgeEl = document.getElementById('inboxCountBadge');
    if (badgeEl) {
      badgeEl.textContent = inboxItems.length;
    }
    const mBadge = document.getElementById('mInboxBadge');
    if (mBadge) {
      mBadge.textContent = inboxItems.length;
      mBadge.style.display = inboxItems.length > 0 ? 'inline-flex' : 'none';
    }
  },

  toggleInboxSidebar() {
    this.isSidebarOpen = !this.isSidebarOpen;
    if (this.isSidebarOpen && window.innerWidth <= 768 && this.isCompletedSidebarOpen) {
      this.isCompletedSidebarOpen = false;
      this.renderCompletedSidebar();
    }
    const sidebar = document.getElementById('inboxSidebar');
    const btn = document.getElementById('btnToggleSidebar');
    if (sidebar) sidebar.classList.toggle('is-collapsed', !this.isSidebarOpen);
    if (btn) btn.classList.toggle('active', this.isSidebarOpen);
    this.updateMobileBottomNav();
  },

  toggleCompletedSidebar() {
    this.isCompletedSidebarOpen = !this.isCompletedSidebarOpen;
    if (this.isCompletedSidebarOpen && window.innerWidth <= 768 && this.isSidebarOpen) {
      this.isSidebarOpen = false;
      const sidebar = document.getElementById('inboxSidebar');
      const btn = document.getElementById('btnToggleSidebar');
      if (sidebar) sidebar.classList.add('is-collapsed');
      if (btn) btn.classList.remove('active');
    }
    this.renderCompletedSidebar();
    this.updateMobileBottomNav();
  },

  toggleShowCompletedInGrid(val) {
    this.showAllDaysInGrid = !!val;
    this.renderAll();
  },

  /* Zwijanie / rozwijanie pojedynczej notatki */
  toggleNote(id) {
    if (this.collapsedNotes.has(id)) {
      this.collapsedNotes.delete(id);
    } else {
      this.collapsedNotes.add(id);
    }
    try {
      localStorage.setItem('kompas_collapsed_notes', JSON.stringify([...this.collapsedNotes]));
    } catch (e) {
      console.warn(e);
    }

    const isNowCollapsed = this.collapsedNotes.has(id);
    const noteEls = document.querySelectorAll(`[data-id="${id}"] .selfcare-note-line, [data-id="${id}"] .task-notes-box`);
    const btnEls = document.querySelectorAll(`button[data-act="toggleNote"][data-id="${id}"]`);

    noteEls.forEach(el => el.classList.toggle('is-collapsed', isNowCollapsed));
    btnEls.forEach(btn => {
      btn.textContent = isNowCollapsed ? '▸' : '▾';
      btn.title = isNowCollapsed ? 'Rozwiń opis' : 'Zwiń opis';
    });
  },

  /* Automatyczne przenoszenie zaległych zadań z przeszłości (z wyłączeniem rutyn i Zdrowie & Ja) */
  autoRolloverOverdueTasks() {
    if (Store.state.autoRollover === false) return;
    const today = D.today();
    let rolled = 0;
    Store.state.tasks.forEach(t => {
      // Wyklucz rutyny i Zdrowie & Ja:
      if (t.recur || t.inbox) return;
      if (t.roleId === 'r_saw' || t.zone === 'selfcare') return;

      if (t.date && t.date < today && !t.done) {
        t.originalDate = t.originalDate || t.date;
        t.date = today;
        rolled++;
      }
    });

    if (rolled > 0) {
      Store.persist();
      console.log(`Przeniesiono ${rolled} zaległych zadań na dziś (${today}).`);
    }
  },

  /* Zakończenie dnia (odklikanie) -> niewykonane zadania przechodzą na następny dzień, dzień trafia do lewego panelu */
  finishDay(dateStr) {
    const wasCompleted = Store.isDayCompleted(dateStr);
    Store.toggleDayCompleted(dateStr);
    const isNowCompleted = Store.isDayCompleted(dateStr);

    if (isNowCompleted) {
      // Zadania niewykonane przechodzą automatycznie na następny dzień:
      // (z wyłączeniem rutyn i czynności zdrowie & ja)
      let rolledCount = 0;
      const nextDate = D.addDays(dateStr, 1);

      if (Store.state.autoRollover !== false) {
        Store.state.tasks.forEach(t => {
          if (t.recur || t.inbox) return;
          if (t.roleId === 'r_saw' || t.zone === 'selfcare') return;

          if (t.date === dateStr && !t.done) {
            t.originalDate = t.originalDate || dateStr;
            t.date = nextDate;
            rolledCount++;
          }
        });
      }

      if (rolledCount > 0) {
        Store.persist();
        this.showToast(`Dzień zakończony! Przeniesiono ${rolledCount} niewykonanych zadań na ${D.long(nextDate)} ➡️`);
      } else {
        this.showToast(`Dzień ${D.long(dateStr)} odklikany i schowany do wykonanych! ✅`);
      }

      // Otwórz boczny panel wykonanych po lewej stronie
      this.isCompletedSidebarOpen = true;
    } else {
      this.showToast(`Przywrócono ${D.long(dateStr)} do rozkładówki.`);
    }

    this.renderAll();
  },

  /* Przywrócenie odklikanego dnia do rozkładówki */
  restoreDay(dateStr) {
    if (Store.isDayCompleted(dateStr)) {
      Store.toggleDayCompleted(dateStr);
      this.showToast(`Przywrócono dzień ${D.long(dateStr)} do rozkładówki.`);
      this.renderAll();
    }
  },

  /* Podgląd zawartości zakończonego dnia */
  previewCompletedDay(dateStr) {
    const root = document.getElementById('modalRoot');
    if (!root) return;

    const d = D.parse(dateStr);
    const dow = D.dow(dateStr);
    const dayName = D.DOW_LONG[dow];
    const dayTasks = Store.state.tasks.filter(t => t.date === dateStr);
    const rockTasks = dayTasks.filter(t => this.getTaskPriority(t) === 1);
    const standardTasks = dayTasks.filter(t => this.getTaskPriority(t) === 2 || this.getTaskPriority(t) === 3);
    const dayRoutines = Store.state.tasks.filter(t => t.recur && Recur.matchesDate(t, dateStr));
    const selfcareRoutines = dayRoutines.filter(r => !this.isWorkRoutine(r));
    const recurringWork = dayRoutines.filter(r => this.isWorkRoutine(r));

    root.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) App.closeModal()">
        <div class="modal modal-large">
          <div class="modal-header">
            <div>
              <h2>✅ Zakończony dzień: ${cap(dayName)}, ${d.getDate()} ${D.MON_GEN[d.getMonth()]}</h2>
              <p style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                Dzień został odklikany i przeniesiony do listy wykonanych po lewej stronie ekranu.
              </p>
            </div>
            <button class="icon-circle-btn" onclick="App.closeModal()">✕</button>
          </div>

          <div style="display:flex; flex-direction:column; gap:14px; max-height:65vh; overflow-y:auto; padding-right:4px;">
            ${selfcareRoutines.length > 0 ? `
              <div style="padding:10px 12px; background:var(--emerald-light); border:1px solid rgba(16,185,129,0.3); border-radius:var(--radius-md);">
                <div style="font-weight:700; font-size:0.82rem; color:var(--emerald); margin-bottom:8px;">🛡️ Zdrowie & Ja</div>
                <div style="display:flex; flex-direction:column; gap:6px;">
                  ${selfcareRoutines.map(r => {
                    const isDone = Recur.isDoneOn(r, dateStr);
                    return `
                      <div style="font-size:0.82rem; display:flex; align-items:center; gap:6px; color:${isDone ? 'var(--text-main)' : 'var(--text-muted)'}; text-decoration:${isDone ? 'none' : 'line-through'};">
                        <span>${isDone ? '✅' : '⚪'}</span>
                        <span>${esc(r.title)}</span>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            ` : ''}

            <div>
              <div style="font-weight:700; font-size:0.82rem; color:var(--crimson); margin-bottom:6px;">🎯 Głaz Dnia (I)</div>
              ${rockTasks.length > 0 ? rockTasks.map(t => `
                <div style="padding:6px 10px; border:1px solid var(--border); border-radius:var(--radius-sm); margin-bottom:4px; font-size:0.82rem; display:flex; align-items:center; gap:6px;">
                  <span>${t.done ? '✅' : '⚪'}</span>
                  <span style="${t.done ? 'text-decoration:line-through; color:var(--text-muted);' : ''}">${esc(t.title)}</span>
                </div>
              `).join('') : '<div style="font-size:0.75rem; color:var(--text-muted);">Brak głazu dnia.</div>'}
            </div>

            <div>
              <div style="font-weight:700; font-size:0.82rem; color:var(--blue); margin-bottom:6px;">📋 Bieżączka (II)</div>
              ${(standardTasks.length + recurringWork.length) > 0 ? `
                ${recurringWork.map(r => {
                  const isDone = Recur.isDoneOn(r, dateStr);
                  return `
                    <div style="padding:6px 10px; border:1px solid var(--border); border-radius:var(--radius-sm); margin-bottom:4px; font-size:0.82rem; display:flex; align-items:center; gap:6px;">
                      <span>${isDone ? '✅' : '⚪'}</span>
                      <span style="${isDone ? 'text-decoration:line-through; color:var(--text-muted);' : ''}">${esc(r.title)}</span>
                      <small style="color:var(--blue); margin-left:auto;">🔄 Cykliczne</small>
                    </div>
                  `;
                }).join('')}
                ${standardTasks.map(t => `
                  <div style="padding:6px 10px; border:1px solid var(--border); border-radius:var(--radius-sm); margin-bottom:4px; font-size:0.82rem; display:flex; align-items:center; gap:6px;">
                    <span>${t.done ? '✅' : '⚪'}</span>
                    <span style="${t.done ? 'text-decoration:line-through; color:var(--text-muted);' : ''}">${esc(t.title)}</span>
                  </div>
                `).join('')}
              ` : '<div style="font-size:0.75rem; color:var(--text-muted);">Brak zadań bieżących.</div>'}
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; padding-top:12px; border-top:1px solid var(--border);">
            <button class="header-action-btn" onclick="App.restoreDay('${dateStr}'); App.closeModal();">
              ↩️ Przywróć ten dzień do rozkładówki
            </button>
            <button class="header-action-btn btn-primary" onclick="App.closeModal()">Zamknij</button>
          </div>
        </div>
      </div>
    `;
  },

  /* Lewy panel: Wykonane dni */
  renderCompletedSidebar() {
    const sidebar = document.getElementById('completedSidebar');
    if (!sidebar) return;

    sidebar.classList.toggle('is-collapsed', !this.isCompletedSidebarOpen);

    const completedSet = new Set(Store.state.completedDays || []);
    // Pokaż wszystkie odklikane dni w archiwum posortowane od najnowszego:
    const completedDates = [...completedSet].sort().reverse();

    const badgeEl = document.getElementById('completedCountBadge');
    if (badgeEl) badgeEl.textContent = completedDates.length;
    const mCompBadge = document.getElementById('mCompletedBadge');
    if (mCompBadge) {
      mCompBadge.textContent = completedDates.length;
      mCompBadge.style.display = completedDates.length > 0 ? 'inline-flex' : 'none';
    }

    const btnToggle = document.getElementById('btnToggleCompleted');
    if (btnToggle) {
      btnToggle.classList.toggle('btn-primary', this.isCompletedSidebarOpen);
      btnToggle.classList.toggle('btn-subtle', !this.isCompletedSidebarOpen);
    }

    sidebar.innerHTML = `
      <div class="completed-sb-header">
        <div class="completed-sb-title">
          <span>✅</span>
          <span>Wykonane</span>
          <span class="completed-pill-count">${completedDates.length}</span>
        </div>
        <button class="inbox-sb-close" data-act="toggleCompletedSidebar" title="Zwiń listę wykonanych">✕</button>
      </div>

      <div class="completed-sb-content">
        <div style="padding:7px 10px; background:var(--surface-alt); border-radius:var(--radius-sm); border:1px solid var(--border-subtle); display:flex; align-items:center; justify-content:space-between;">
          <span style="font-size:0.72rem; color:var(--text-muted);">Pokaż odklikane w siatce:</span>
          <label style="position:relative; display:inline-flex; align-items:center; cursor:pointer;">
            <input type="checkbox" ${this.showAllDaysInGrid ? 'checked' : ''} onchange="App.toggleShowCompletedInGrid(this.checked)" style="cursor:pointer;">
          </label>
        </div>

        ${completedDates.length === 0 ? `
          <div style="text-align:center; padding:32px 12px; color:var(--text-dim); font-size:0.8rem; line-height:1.5;">
            <div style="font-size:2rem; margin-bottom:8px; opacity:0.7;">🏁</div>
            Brak odklikanych dni w archiwum.<br>
            <span style="font-size:0.72rem; color:var(--text-muted); display:block; margin-top:8px;">
              Gdy odhaczysz dzień przyciskiem <strong>✓</strong> w nagłówku kolumny, dzień schowa się tutaj, a niewykonane zadania przejdą na kolejny dzień!
            </span>
          </div>
        ` : `
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${completedDates.map(dateStr => {
              const d = D.parse(dateStr);
              const dow = D.dow(dateStr);
              const dayName = D.DOW_LONG[dow];
              const dayTasks = Store.state.tasks.filter(t => t.date === dateStr);
              const doneTasks = dayTasks.filter(t => t.done).length;
              const totalTasks = dayTasks.length;
              const routinesCount = Store.state.tasks.filter(t => t.recur && Recur.matchesDate(t, dateStr)).length;

              return `
                <div class="completed-day-card" data-date="${dateStr}">
                  <div class="completed-day-card-header">
                    <div style="display:flex; align-items:center; gap:6px;">
                      <span style="color:var(--emerald); font-weight:bold; font-size:0.95rem;">✓</span>
                      <div>
                        <div style="font-weight:700; font-size:0.85rem; text-transform:capitalize;">${dayName}</div>
                        <div style="font-size:0.72rem; color:var(--text-muted);">${d.getDate()} ${D.MON_GEN[d.getMonth()]}</div>
                      </div>
                    </div>
                    <button class="task-micro-btn" data-act="restoreDay" data-date="${dateStr}" title="Przywróć dzień do rozkładówki tygodnia">↩️</button>
                  </div>
                  <div class="completed-day-card-stats">
                    <span>📋 ${doneTasks}/${totalTasks} zadań</span>
                    <span>🛡️ ${routinesCount} rutyn</span>
                  </div>
                  <button class="completed-day-view-btn" data-act="previewCompletedDay" data-date="${dateStr}">
                    👁️ Zobacz zadania tego dnia
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;
  },

  /* ============ Główny render ============ */
  renderAll() {
    this.updateWeekNav();
    this.renderCompletedSidebar();
    this.renderWeekDaysGrid();
    this.renderInboxSidebar();
    this.updateInboxBadge();
    this.renderMobileDayStrip();
    this.updateMobileBottomNav();
    if (this.activeModal === 'routines') {
      this.openRoutinesModal();
    }
  },

  /* ============ Pasek wyboru dni na telefonach ============ */
  renderMobileDayStrip() {
    const strip = document.getElementById('mobileDayStrip');
    if (!strip) return;

    const today = D.today();
    const days = this.showAllDaysInGrid
      ? Store.getWeekDays(this.weekOffset)
      : Store.getRollingDays(this.weekOffset).days;

    if (!days || days.length === 0) {
      strip.innerHTML = '';
      return;
    }

    if (!this.activeMobileDay || !days.includes(this.activeMobileDay)) {
      this.activeMobileDay = days.includes(today) ? today : days[0];
    }

    strip.innerHTML = days.map(dateStr => {
      const isToday = dateStr === today;
      const isActive = dateStr === this.activeMobileDay;
      const isCompleted = Store.isDayCompleted(dateStr);
      const d = D.parse(dateStr);
      const dow = D.dow(dateStr);
      const dayShort = D.DOW_SHORT[dow];
      const dayNum = d.getDate();

      return `
        <button class="day-strip-btn ${isActive ? 'is-active' : ''} ${isToday ? 'is-today' : ''} ${isCompleted ? 'is-completed' : ''}"
                data-act="mobileSelectDay" data-date="${dateStr}" title="${dayShort} ${dayNum} ${isToday ? '(Dziś)' : ''}">
          <span class="day-strip-dow">${dayShort}</span>
          <span class="day-strip-num">${dayNum}</span>
          ${isCompleted ? '<span class="day-strip-dot is-check">✓</span>' : (isToday ? '<span class="day-strip-dot"></span>' : '')}
        </button>
      `;
    }).join('');
  },

  scrollToDay(dateStr) {
    this.activeMobileDay = dateStr;
    const col = document.querySelector(`.day-column[data-date="${dateStr}"]`);
    if (col) {
      col.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
    document.querySelectorAll('.day-strip-btn').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.date === dateStr);
    });
  },

  scrollToCurrentDayOnMobile(smooth = false) {
    if (window.innerWidth > 768) return;
    const today = D.today();
    const target = document.querySelector(`.day-column[data-date="${today}"]`) ||
                   document.querySelector('.day-column.is-current-day') ||
                   document.querySelector('.day-column');
    if (target) {
      const date = target.dataset.date || today;
      this.activeMobileDay = date;
      setTimeout(() => {
        target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', inline: 'center', block: 'nearest' });
        document.querySelectorAll('.day-strip-btn').forEach(btn => {
          btn.classList.toggle('is-active', btn.dataset.date === date);
        });
      }, 70);
    }
  },

  initMobileScrollSync() {
    const boardMain = document.getElementById('boardMain');
    if (!boardMain || this._mobileScrollSyncBound) return;
    this._mobileScrollSyncBound = true;
    let scrollTimeout = null;

    boardMain.addEventListener('scroll', () => {
      if (window.innerWidth > 768) return;
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const cols = Array.from(document.querySelectorAll('.day-column'));
        if (cols.length === 0) return;
        const center = boardMain.scrollLeft + (boardMain.clientWidth / 2);
        let closestCol = null;
        let minDiff = Infinity;

        cols.forEach(col => {
          const colCenter = col.offsetLeft + (col.offsetWidth / 2);
          const diff = Math.abs(colCenter - center);
          if (diff < minDiff) {
            minDiff = diff;
            closestCol = col;
          }
        });

        if (closestCol && closestCol.dataset.date) {
          const date = closestCol.dataset.date;
          this.activeMobileDay = date;
          document.querySelectorAll('.day-strip-btn').forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset.date === date);
          });
        }
      }, 60);
    }, { passive: true });
  },

  updateMobileBottomNav() {
    const mNavPlan = document.getElementById('mNavPlan');
    const mNavInbox = document.getElementById('mNavInbox');
    const mNavSettings = document.getElementById('mNavSettings');
    const mInboxBadge = document.getElementById('mInboxBadge');

    const inboxCount = Store.state.tasks.filter(t => !t.done && (t.inbox || !t.date) && !t.recur).length;

    if (mInboxBadge) {
      mInboxBadge.textContent = inboxCount;
      mInboxBadge.style.display = inboxCount > 0 ? 'inline-flex' : 'none';
    }

    if (mNavInbox) mNavInbox.classList.toggle('active', this.isSidebarOpen);
    if (mNavSettings) mNavSettings.classList.toggle('active', this.activeModal === 'settings');
    if (mNavPlan) mNavPlan.classList.toggle('active', !this.isSidebarOpen && !this.isCompletedSidebarOpen && this.activeModal !== 'settings');
  },

  /* Pomocnik strefy rutyny: 'selfcare' (Zdrowie & Ja) vs 'standard' (Bieżączka / KSeF / praca) */
  isWorkRoutine(r) {
    if (!r) return false;
    if (r.zone === 'standard') return true;
    if (r.zone === 'selfcare') return false;
    if (r.roleId === 'r_firm' || r.roleId === 'r_home') return true;
    if (r.title && /faktur|ksef|podat|zus|firma|zamknięcie|rozliczen|przelew/i.test(r.title)) return true;
    return false;
  },

  /* ==========================================================================
     ROZKŁADÓWKA: 7 DNI TYGODNIA (PONIEDZIAŁEK – NIEDZIELA)
     ========================================================================== */
  renderWeekDaysGrid() {
    const grid = document.getElementById('weekDaysGrid');
    if (!grid) return;

    const today = D.today();
    const completedSet = new Set(Store.state.completedDays || []);

    const days = this.showAllDaysInGrid
      ? Store.getWeekDays(this.weekOffset)
      : Store.getRollingDays(this.weekOffset).days;
    const tasks = Store.state.tasks.filter(t => !t.inbox && !t.recur);

    if (days.length === 0) {
      grid.innerHTML = `
        <div style="flex:1; max-width:600px; margin:40px auto; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 20px; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); text-align:center;">
          <div style="font-size:3rem; margin-bottom:12px;">🏆</div>
          <h2 style="font-size:1.2rem; font-weight:700; margin-bottom:6px;">Wszystkie dni w tym okresie zostały odklikane!</h2>
          <p style="font-size:0.85rem; color:var(--text-muted); max-width:420px; margin-bottom:16px;">
            Wszystkie zakończone dni znajdują się na liście „Wykonane” po lewej stronie ekranu.
          </p>
          <button class="header-action-btn btn-primary" onclick="App.toggleShowCompletedInGrid(true)">Pokaż wszystkie dni w siatce</button>
        </div>
      `;
      return;
    }

    // Dzień o statusie bieżącym (rozciągany 2x):
    // Jeśli dzisiejszy dzień (today) jest w siatce, to on jest bieżący.
    // Jeśli dzisiejszy dzień został zarchiwizowany, to pierwszy aktywny dzień (days[0]) przejmuje rolę bieżącego!
    const currentActiveDate = (this.weekOffset === 0)
      ? (days.includes(today) ? today : days[0])
      : null;

    grid.innerHTML = days.map(dateStr => {
      const isToday = dateStr === today;
      const isCurrentFocus = dateStr === currentActiveDate;
      const isCompleted = Store.isDayCompleted(dateStr);
      const dayTasks = tasks.filter(t => t.date === dateStr);
      const d = D.parse(dateStr);
      const dow = D.dow(dateStr);
      const dayName = D.DOW_LONG[dow].toUpperCase();

      // Rutyny przypadające na ten dzień:
      const dayRoutines = Store.state.tasks.filter(t => t.recur && Recur.matchesDate(t, dateStr));

      // 🛡️ BAZA: Zdrowie & Ja (Ostrzenie piły, ciało, duch, zdrowie, rozwój):
      const selfcareRoutines = dayRoutines.filter(r => !this.isWorkRoutine(r));
      const doneSelfcareCount = selfcareRoutines.filter(r => Recur.isDoneOn(r, dateStr)).length;

      // 📋 BIEŻĄCZKA: Cykliczne sprawy operacyjne (np. KSeF, faktury, firma, dom):
      const recurringWorkTasks = dayRoutines.filter(r => this.isWorkRoutine(r));

      // Zadania dnia: podział na Głaz (I) i Bieżączkę (II)
      const sortDone = arr => [...arr].sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));
      const rockTasks = sortDone(dayTasks.filter(t => this.getTaskPriority(t) === 1));
      const standardTasks = sortDone(dayTasks.filter(t => this.getTaskPriority(t) === 2 || this.getTaskPriority(t) === 3));
      const totalWorkCount = standardTasks.length + recurringWorkTasks.length;

      const finishBtnLabel = isCompleted
        ? '✓ Zrobione'
        : (isCurrentFocus ? '✓ Zakończ dzień' : '✓');

      return `
        <div class="day-column ${isToday ? 'is-today' : ''} ${isCurrentFocus ? 'is-current-day' : ''} ${isCompleted ? 'is-completed' : ''}" data-date="${dateStr}">
          <!-- Nagłówek dnia -->
          <div class="col-header">
            <div class="col-header-info">
              <span class="col-day-name">${dayName}</span>
              <span class="col-day-date">${d.getDate()} ${D.MON_GEN[d.getMonth()]}</span>
              ${isToday ? '<span class="col-badge-today">Dziś</span>' : (isCurrentFocus ? '<span class="col-badge-today col-badge-focus">Bieżący</span>' : '')}
            </div>
            <button class="btn-col-finish ${isCompleted ? 'is-completed' : ''}" data-act="toggleDayCompleted" data-date="${dateStr}" title="${isCompleted ? 'Cofnij zakończenie dnia' : 'Zakończ dzień (schowaj do wykonanych)'}">
              ${finishBtnLabel}
            </button>
          </div>

          <!-- Przewijana zawartość kolumny -->
          <div class="col-body">
            <!-- 🛡️ STREFA 0: BAZA DLA SIEBIE & ZDROWIE (NA SAMEJ GÓRZE!) -->
            ${selfcareRoutines.length > 0 ? `
              <div class="col-selfcare-box">
                <div class="selfcare-box-title">
                  <span>🛡️ Zdrowie & Ja (${doneSelfcareCount}/${selfcareRoutines.length})</span>
                </div>
                <div class="selfcare-items-list">
                  ${selfcareRoutines.map(r => {
                    const isDone = Recur.isDoneOn(r, dateStr);
                    const streak = Recur.streak(r);
                    const isCollapsed = this.collapsedNotes.has(r.id);
                    return `
                      <div class="selfcare-item-pill ${isDone ? 'is-done' : ''}" data-act="toggleRoutineDay" data-id="${r.id}" data-date="${dateStr}" title="${esc(r.title)}${r.notes ? ` — 📝 ${esc(r.notes)}` : ''}">
                        <div class="selfcare-pill-top">
                          <span class="selfcare-check-circle">${isDone ? '✓' : ''}</span>
                          <span class="selfcare-title">${esc(r.title)}</span>
                          ${streak > 0 ? `<span class="selfcare-streak">🔥${streak}</span>` : ''}
                          <div style="display:flex; align-items:center; gap:2px; flex-shrink:0;">
                            ${r.notes ? `
                              <button class="note-toggle-btn" data-act="toggleNote" data-id="${r.id}" title="${isCollapsed ? 'Rozwiń opis' : 'Zwiń opis'}">
                                ${isCollapsed ? '▸' : '▾'}
                              </button>
                            ` : ''}
                            <button class="selfcare-edit-btn" data-act="editRoutine" data-id="${r.id}" title="Edytuj tę rutynę">✏️</button>
                          </div>
                        </div>
                        ${r.notes ? `
                          <div class="selfcare-note-line ${isCollapsed ? 'is-collapsed' : ''}" data-act="editRoutine" data-id="${r.id}" title="Kliknij, aby edytować notatkę">
                            <span>📝 ${linkify(r.notes)}</span>
                          </div>
                        ` : ''}
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            ` : ''}

            <!-- 🎯 STREFA 1: GŁAZ DNIA (POZIOM I - KLUCZOWA SPRAWA) -->
            <div>
              <div class="col-zone-header rock-header">
                <span>🎯 I · Głaz Dnia</span>
                <button class="task-micro-btn" data-act="showColQuickAdd" data-date="${dateStr}" data-priority="1" title="Dodaj Głaz do tego dnia">+</button>
              </div>
              <div class="col-cards-list">
                ${rockTasks.length > 0
                  ? rockTasks.map(t => this.renderTaskCard(t)).join('')
                  : `<div class="empty-rock-slot" data-act="showColQuickAdd" data-date="${dateStr}" data-priority="1">+ Ustal Głaz dnia</div>`}
              </div>
            </div>

            <!-- 📋 STREFA 2: BIEŻĄCZKA (POZIOM II - BIEŻĄCE ZADANIA + CYKLICZNA PRACA / KSEF / FAKTURY) -->
            <div>
              <div class="col-zone-header">
                <span>📋 II · Bieżączka (${totalWorkCount})</span>
                <button class="task-micro-btn" data-act="showColQuickAdd" data-date="${dateStr}" data-priority="2" title="Dodaj zadanie do bieżączki">+</button>
              </div>
              <div class="col-cards-list">
                <!-- Sprawy cykliczne w bieżączce (np. KSeF, faktury, porządki cykliczne) -->
                ${recurringWorkTasks.map(r => {
                  const isDone = Recur.isDoneOn(r, dateStr);
                  const streak = Recur.streak(r);
                  const isCollapsed = this.collapsedNotes.has(r.id);
                  return `
                    <div class="task-card ${isDone ? 'is-done' : ''} is-recurring-standard" data-id="${r.id}">
                      <div class="task-card-main">
                        <button class="task-checkbox-btn" data-act="toggleRoutineDay" data-id="${r.id}" data-date="${dateStr}" title="${isDone ? 'Cofnij' : 'Odhacz jako zrobione na ten dzień'}">
                          ${isDone ? '✓' : ''}
                        </button>
                        <div class="task-title" data-act="editRoutine" data-id="${r.id}" title="Kliknij, aby edytować">
                          ${linkify(r.title)}
                        </div>
                        <div style="display:flex; align-items:center; gap:2px; flex-shrink:0;">
                          ${r.notes ? `
                            <button class="note-toggle-btn" data-act="toggleNote" data-id="${r.id}" title="${isCollapsed ? 'Rozwiń opis' : 'Zwiń opis'}">
                              ${isCollapsed ? '▸' : '▾'}
                            </button>
                          ` : ''}
                          <button class="task-micro-btn" data-act="editRoutine" data-id="${r.id}" title="Edytuj rutynę i notatki">✏️</button>
                        </div>
                      </div>

                      ${r.notes ? `
                        <div class="task-notes-box ${isCollapsed ? 'is-collapsed' : ''}" data-act="editRoutine" data-id="${r.id}" title="Kliknij, aby edytować notatkę">
                          <span class="note-icon">📝</span>
                          <div class="note-content">${linkify(r.notes)}</div>
                        </div>
                      ` : ''}

                      <div class="task-card-footer">
                        <button class="task-p-badge p-routine" data-act="editRoutine" data-id="${r.id}" title="Zmień cykl lub edytuj rutynę">
                          🔄 ${Recur.label(r.recur)}
                        </button>
                        <div class="task-micro-actions">
                          ${streak > 0 ? `<span class="selfcare-streak" style="margin-right:4px;">🔥${streak}</span>` : ''}
                          <button class="task-micro-btn btn-trash" data-act="deleteRoutine" data-id="${r.id}" title="Usuń">🗑️</button>
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}

                <!-- Zadania standardowe jednorazowe -->
                ${standardTasks.length > 0
                  ? standardTasks.map(t => this.renderTaskCard(t)).join('')
                  : (recurringWorkTasks.length === 0 ? '<div class="empty-tasks-hint">Brak bieżących zadań.</div>' : '')
                }
              </div>
            </div>
          </div>

          <!-- Szybkie dodawanie na dole kolumny -->
          <div class="col-footer">
            <form class="col-quick-add-form" data-date="${dateStr}">
              <input class="col-quick-add-input" placeholder="+ Dodaj zadanie (Enter)..." autocomplete="off">
              <button type="submit" class="col-add-btn" title="Dodaj zadanie">+</button>
            </form>
          </div>
        </div>
      `;
    }).join('');

    // Obsługa formularzy szybkiego dodawania na dole kolumn
    grid.querySelectorAll('.col-quick-add-form').forEach(form => {
      form.addEventListener('submit', e => {
        e.preventDefault();
        const input = form.querySelector('.col-quick-add-input');
        let text = input.value.trim();
        if (!text) return;
        const date = form.dataset.date;
        let priority = 2;
        if (text.includes('!1')) { priority = 1; text = text.replace(/!1/g, '').trim(); }
        else if (text.includes('!2')) { priority = 2; text = text.replace(/!2/g, '').trim(); }

        Store.add({ title: text, date, priority, q: priority === 1 ? 1 : 2 });
        input.value = '';
        this.showToast(priority === 1 ? 'Dodano Głaz Dnia 🎯' : 'Dodano do bieżączki 📋');
      });
    });
  },

  /* Pojedyncza karta zadania w kolumnie */
  renderTaskCard(t) {
    const isP1 = this.getTaskPriority(t) === 1;
    const isCollapsed = this.collapsedNotes.has(t.id);

    return `
      <div class="task-card ${t.done ? 'is-done' : ''} ${isP1 ? 'is-rock' : 'is-standard'}" data-id="${t.id}">
        <div class="task-card-main">
          <button class="task-checkbox-btn" data-act="toggleDone" data-id="${t.id}" title="${t.done ? 'Cofnij' : 'Odhacz jako zrobione'}">
            ${t.done ? '✓' : ''}
          </button>
          <div class="task-title" data-act="editTask" data-id="${t.id}" title="Kliknij, aby edytować">
            ${linkify(t.title)}
            ${t.originalDate ? `<span class="task-rollover-badge" title="Przeniesione automatycznie z dnia ${D.long(t.originalDate)}">↩️ z ${D.short(t.originalDate)}</span>` : ''}
          </div>
          <div style="display:flex; align-items:center; gap:2px; flex-shrink:0;">
            ${t.notes ? `
              <button class="note-toggle-btn" data-act="toggleNote" data-id="${t.id}" title="${isCollapsed ? 'Rozwiń opis' : 'Zwiń opis'}">
                ${isCollapsed ? '▸' : '▾'}
              </button>
            ` : ''}
            <button class="task-micro-btn" data-act="editTask" data-id="${t.id}" title="Edytuj zadanie i notatki">✏️</button>
          </div>
        </div>

        ${t.notes ? `
          <div class="task-notes-box ${isCollapsed ? 'is-collapsed' : ''}" data-act="editTask" data-id="${t.id}" title="Kliknij, aby edytować notatkę">
            <span class="note-icon">📝</span>
            <div class="note-content">${linkify(t.notes)}</div>
          </div>
        ` : ''}

        <div class="task-card-footer">
          <button class="task-p-badge ${isP1 ? 'p1' : 'p2'}" data-act="togglePriorityLevel" data-id="${t.id}" title="Przełącz priorytet (I ⇄ II)">
            ${isP1 ? 'I · Głaz' : 'II · Zwykłe'}
          </button>

          <div class="task-micro-actions">
            <button class="task-micro-btn" data-act="postponeTask" data-id="${t.id}" title="Przełóż na jutro (➡️)">➡️</button>
            <button class="task-micro-btn btn-trash" data-act="deleteTask" data-id="${t.id}" title="Usuń">🗑️</button>
          </div>
        </div>
      </div>
    `;
  },

  /* ==========================================================================
     BOCZNY PANEL: SKRZYNKA MYŚLI (I - III)
     ========================================================================== */
  renderInboxSidebar() {
    const sidebar = document.getElementById('inboxSidebar');
    if (!sidebar) return;

    sidebar.classList.toggle('is-collapsed', !this.isSidebarOpen);

    const inboxItems = Store.state.tasks.filter(t => !t.done && (t.inbox || !t.date) && !t.recur);
    const itemsP1 = inboxItems.filter(t => this.getTaskPriority(t) === 1);
    const itemsP2 = inboxItems.filter(t => this.getTaskPriority(t) === 2);
    const itemsP3 = inboxItems.filter(t => this.getTaskPriority(t) === 3);

    const days = Store.getWeekDays(this.weekOffset);
    const dayChips = [
      { label: 'Dziś', date: D.today() },
      { label: 'Jutro', date: D.addDays(D.today(), 1) },
      { label: 'Pon', date: days[0] },
      { label: 'Wt', date: days[1] },
      { label: 'Śr', date: days[2] },
      { label: 'Czw', date: days[3] },
      { label: 'Pt', date: days[4] },
    ];

    const renderInboxCard = item => {
      const p = this.getTaskPriority(item);
      const pBadgeLabel = p === 1 ? '🔴 I · Pilne' : p === 3 ? '⚪ III · Kiedyś' : '🔵 II · Ważne';
      const isCollapsed = this.collapsedNotes.has(item.id);
      return `
        <div class="inbox-sb-card is-p${p}" data-id="${item.id}">
          <div class="inbox-sb-card-top">
            <button class="inbox-sb-p-badge p${p}" data-act="cycleInboxPriority" data-id="${item.id}" title="Kliknij, aby zmienić poziom (I ⇄ II ⇄ III)">
              ${pBadgeLabel} ⇄
            </button>
            <div style="display:flex; align-items:center; gap:2px;">
              ${item.notes ? `
                <button class="note-toggle-btn" data-act="toggleNote" data-id="${item.id}" title="${isCollapsed ? 'Rozwiń opis' : 'Zwiń opis'}">
                  ${isCollapsed ? '▸' : '▾'}
                </button>
              ` : ''}
              <button class="task-micro-btn" data-act="editTask" data-id="${item.id}" title="Edytuj">✏️</button>
              <button class="task-micro-btn btn-trash" data-act="deleteTask" data-id="${item.id}" title="Usuń trwale">🗑️</button>
            </div>
          </div>

          <div class="inbox-sb-card-title" data-act="editTask" data-id="${item.id}">
            ${linkify(item.title)}
          </div>
          ${item.notes ? `
            <div class="task-notes-box ${isCollapsed ? 'is-collapsed' : ''}" data-act="editTask" data-id="${item.id}" title="Kliknij, aby edytować notatkę">
              <span class="note-icon">📝</span>
              <div class="note-content">${linkify(item.notes)}</div>
            </div>
          ` : ''}

          <div class="inbox-sb-card-actions">
            ${dayChips.map(dc => `
              <button class="inbox-plan-chip" data-act="assignTaskToDate" data-id="${item.id}" data-date="${dc.date}" title="Zaplanuj na ${dc.label} (${D.human(dc.date)})">
                ${dc.label}
              </button>
            `).join('')}
          </div>
        </div>
      `;
    };

    sidebar.innerHTML = `
      <div class="inbox-sb-header">
        <div class="inbox-sb-title">
          <span>📥 Skrzynka myśli</span>
          <span class="inbox-pill-count">${inboxItems.length}</span>
        </div>
        <button class="inbox-sb-close" data-act="toggleInboxSidebar" title="Zwiń panel skrzynki">✕</button>
      </div>

      <!-- Szybki formularz dodawania z wyborem poziomu -->
      <div class="inbox-sb-add">
        <form id="inboxSidebarAddForm">
          <div class="inbox-p-chips">
            <button type="button" class="p-chip c1 ${this.inboxSelectedPriority === 1 ? 'active' : ''}" data-act="selectInboxPriority" data-priority="1">
              🔴 I · Pilne
            </button>
            <button type="button" class="p-chip c2 ${this.inboxSelectedPriority === 2 ? 'active' : ''}" data-act="selectInboxPriority" data-priority="2">
              🔵 II · Ważne
            </button>
            <button type="button" class="p-chip c3 ${this.inboxSelectedPriority === 3 ? 'active' : ''}" data-act="selectInboxPriority" data-priority="3">
              ⚪ III · Kiedyś / Link
            </button>
          </div>

          <div class="inbox-sb-input-row">
            <input class="inbox-sb-input" id="inboxSidebarInput" placeholder="+ Dodaj myśl, zadanie lub link..." autocomplete="off">
            <button type="submit" class="inbox-sb-submit">+</button>
          </div>
        </form>
      </div>

      <!-- 3 działy skrzynki -->
      <div class="inbox-sb-content">
        <!-- POZIOM I -->
        <div class="inbox-sb-tier">
          <div class="inbox-sb-tier-head t1">
            <span>🔴 I · Pilne / Na już</span>
            <span>${itemsP1.length}</span>
          </div>
          ${itemsP1.map(renderInboxCard).join('') || '<div class="empty-tasks-hint">Brak pilnych pożarów.</div>'}
        </div>

        <!-- POZIOM II -->
        <div class="inbox-sb-tier">
          <div class="inbox-sb-tier-head t2">
            <span>🔵 II · Ważne / Ten tydzień</span>
            <span>${itemsP2.length}</span>
          </div>
          ${itemsP2.map(renderInboxCard).join('') || '<div class="empty-tasks-hint">Brak spraw do zaplanowania.</div>'}
        </div>

        <!-- POZIOM III -->
        <div class="inbox-sb-tier">
          <div class="inbox-sb-tier-head t3">
            <span>⚪ III · Kiedyś / Linki & Pomysły</span>
            <span>${itemsP3.length}</span>
          </div>
          ${itemsP3.map(renderInboxCard).join('') || '<div class="empty-tasks-hint">Brak luźnych notatek i linków.</div>'}
        </div>
      </div>
    `;

    const form = document.getElementById('inboxSidebarAddForm');
    const input = document.getElementById('inboxSidebarInput');
    if (form && input) {
      form.addEventListener('submit', e => {
        e.preventDefault();
        let text = input.value.trim();
        if (!text) return;

        let priority = this.inboxSelectedPriority || 2;
        if (text.includes('!1')) { priority = 1; text = text.replace(/!1/g, '').trim(); }
        else if (text.includes('!2')) { priority = 2; text = text.replace(/!2/g, '').trim(); }
        else if (text.includes('!3')) { priority = 3; text = text.replace(/!3/g, '').trim(); }

        Store.add({ title: text, inbox: true, date: null, priority, q: priority === 1 ? 1 : priority === 2 ? 2 : 4 });
        input.value = '';
        this.showToast(`Dodano do skrzynki (Poziom ${priority === 1 ? 'I' : priority === 3 ? 'III' : 'II'})`);
      });
    }
  },

  /* ==========================================================================
     ZDARZENIA I INTERAKCJE
     ========================================================================== */
  bindEvents() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;

      if (act === 'prevWeek') {
        this.prevWeek();
      } else if (act === 'nextWeek') {
        this.nextWeek();
      } else if (act === 'currentWeek') {
        this.currentWeek();
      } else if (act === 'toggleInboxSidebar') {
        this.toggleInboxSidebar();
      } else if (act === 'toggleCompletedSidebar') {
        this.toggleCompletedSidebar();
      } else if (act === 'restoreDay') {
        e.stopPropagation();
        this.restoreDay(btn.dataset.date);
      } else if (act === 'previewCompletedDay') {
        e.stopPropagation();
        this.previewCompletedDay(btn.dataset.date);
      } else if (act === 'toggleNote') {
        e.stopPropagation();
        this.toggleNote(btn.dataset.id);
      } else if (act === 'toggleDayCompleted') {
        e.stopPropagation();
        this.finishDay(btn.dataset.date);
      } else if (act === 'toggleDone') {
        e.stopPropagation();
        this.toggleTaskDone(btn.dataset.id);
      } else if (act === 'toggleRoutineDay') {
        e.stopPropagation();
        this.toggleRoutineOnDay(btn.dataset.id, btn.dataset.date);
      } else if (act === 'togglePriorityLevel') {
        e.stopPropagation();
        this.togglePriorityLevel(btn.dataset.id);
      } else if (act === 'cycleInboxPriority') {
        e.stopPropagation();
        this.cycleInboxPriority(btn.dataset.id);
      } else if (act === 'selectInboxPriority') {
        this.inboxSelectedPriority = parseInt(btn.dataset.priority, 10);
        this.renderInboxSidebar();
      } else if (act === 'assignTaskToDate') {
        e.stopPropagation();
        this.assignTaskToDate(btn.dataset.id, btn.dataset.date);
      } else if (act === 'postponeTask') {
        e.stopPropagation();
        this.postponeTask(btn.dataset.id);
      } else if (act === 'editTask') {
        e.stopPropagation();
        this.openNewTaskModal(null, 2, btn.dataset.id);
      } else if (act === 'editRoutine') {
        e.stopPropagation();
        this.openRoutineModal({ editId: btn.dataset.id });
      } else if (act === 'deleteRoutine') {
        e.stopPropagation();
        this.deleteRoutine(btn.dataset.id);
      } else if (act === 'deleteTask') {
        e.stopPropagation();
        this.confirmDelete(btn.dataset.id);
      } else if (act === 'openNewTaskModal') {
        this.openNewTaskModal();
      } else if (act === 'openRoutinesModal') {
        this.openRoutinesModal();
      } else if (act === 'openNewRoutineModal') {
        this.openRoutineModal({ defaultFreq: btn.dataset.freq || null });
      } else if (act === 'showColQuickAdd') {
        const date = btn.dataset.date;
        const priority = parseInt(btn.dataset.priority || '1', 10);
        this.openNewTaskModal(date, priority);
      } else if (act === 'openSettings') {
        this.openSettings();
      } else if (act === 'mobileNavPlan') {
        if (this.isSidebarOpen) {
          this.isSidebarOpen = false;
          const s = document.getElementById('inboxSidebar');
          if (s) s.classList.add('is-collapsed');
        }
        if (this.isCompletedSidebarOpen) {
          this.isCompletedSidebarOpen = false;
          this.renderCompletedSidebar();
        }
        this.scrollToCurrentDayOnMobile(true);
        this.updateMobileBottomNav();
      } else if (act === 'mobileSelectDay') {
        e.stopPropagation();
        this.scrollToDay(btn.dataset.date);
      }
    });

    // Motyw
    const themeBtn = document.getElementById('btnThemeToggle');
    if (themeBtn) themeBtn.addEventListener('click', () => this.toggleTheme());

    // Klawisz Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.closeModal();
    });
  },

  /* ==========================================================================
     METODY OPERACJI NA ZADANIACH
     ========================================================================== */
  toggleTaskDone(id) {
    const t = Store.get(id);
    if (!t) return;
    const nextDone = !t.done;
    Store.update(id, {
      done: nextDone,
      doneAt: nextDone ? D.today() : null,
    });
  },

  toggleRoutineOnDay(id, dateStr) {
    const t = Store.get(id);
    if (!t) return;
    const history = Array.isArray(t.history) ? [...t.history] : [];
    const idx = history.indexOf(dateStr);

    if (idx >= 0) {
      history.splice(idx, 1);
      Store.update(id, { history });
      this.showToast(`Cofnięto „${t.title}”`);
    } else {
      history.push(dateStr);
      Store.update(id, { history });
      const streak = Recur.streak({ history });
      this.showToast(`✓ Odhaczono „${t.title}”! (Seria: ${streak} 🔥)`);
    }
  },

  togglePriorityLevel(id) {
    const t = Store.get(id);
    if (!t) return;
    const cur = this.getTaskPriority(t);
    const next = cur === 1 ? 2 : 1;
    Store.update(id, {
      priority: next,
      q: next === 1 ? 1 : 2,
    });
    this.showToast(next === 1 ? '🎯 Przeniesiono do Głazu Dnia' : '📋 Przeniesiono do Bieżączki');
  },

  cycleInboxPriority(id) {
    const t = Store.get(id);
    if (!t) return;
    const cur = this.getTaskPriority(t);
    const next = cur === 1 ? 2 : cur === 2 ? 3 : 1;
    Store.update(id, {
      priority: next,
      q: next === 1 ? 1 : next === 2 ? 2 : 4,
    });
    const label = next === 1 ? 'I (Pilne / Na już)' : next === 2 ? 'II (Ważne)' : 'III (Kiedyś / Link)';
    this.showToast(`Zmieniono na Poziom ${label}`);
  },

  postponeTask(id) {
    const t = Store.get(id);
    if (!t) return;
    const curDate = t.date || D.today();
    const nextDate = D.addDays(curDate, 1);
    Store.update(id, { date: nextDate });
    this.showToast(`Przełożono na ${D.human(nextDate)} ➡️`);
  },

  assignTaskToDate(id, dateStr) {
    const t = Store.get(id);
    if (!t) return;
    const p = this.getTaskPriority(t);
    Store.update(id, {
      date: dateStr,
      inbox: false,
      priority: p === 1 ? 1 : 2,
      q: p === 1 ? 1 : 2,
    });
    this.showToast(`Zaplanowano na ${D.human(dateStr)}!`);
  },

  confirmDelete(id) {
    const t = Store.get(id);
    if (!t) return;
    const backup = { ...t };
    const title = t.title || 'zadanie';
    const isRoutine = !!t.recur;
    Store.remove(id);
    this.showToast(`Usunięto ${isRoutine ? 'rutynę' : 'zadanie'} „${title}”.`, () => {
      Store.add(backup);
    });
    if (this.activeModal === 'routines' || this.activeModal === 'routine_form') {
      this.openRoutinesModal();
    }
  },

  deleteRoutine(id) {
    const r = Store.get(id);
    if (!r) return;
    const backup = { ...r };
    const title = r.title || 'rutynę';
    Store.remove(id);
    this.showToast(`Usunięto rutynę „${title}”.`, () => {
      Store.add(backup);
    });
    if (this.activeModal === 'routines' || this.activeModal === 'routine_form') {
      this.openRoutinesModal();
    }
  },

  /* ==========================================================================
     MODALE
     ========================================================================== */
  openNewTaskModal(defaultDate = null, defaultPriority = 2, editId = null) {
    const root = document.getElementById('modalRoot');
    if (!root) return;

    const task = editId ? Store.get(editId) : null;
    const initialDate = task ? task.date : (defaultDate || D.today());
    const initialPriority = task ? this.getTaskPriority(task) : defaultPriority;
    const initialTitle = task ? task.title : '';
    const initialNotes = task ? (task.notes || '') : '';

    root.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) App.closeModal()">
        <div class="modal">
          <div class="modal-header">
            <h2>${editId ? 'Edytuj zadanie' : 'Nowe zadanie'}</h2>
            <button class="icon-circle-btn" onclick="App.closeModal()">✕</button>
          </div>

          <form id="modalTaskForm" autocomplete="off">
            <div class="form-group">
              <label>Treść zadania lub link</label>
              <input class="form-input" id="mTaskTitle" value="${esc(initialTitle)}" placeholder="np. Oddać 2 rozdział licencjatu, Zadzwonić do szpitala..." required autofocus>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
              <div class="form-group">
                <label>Dzień w planie</label>
                <input type="date" class="form-input" id="mTaskDate" value="${initialDate || ''}">
              </div>

              <div class="form-group">
                <label>Poziom / Ranga</label>
                <select class="form-select" id="mTaskPriority">
                  <option value="1" ${initialPriority === 1 ? 'selected' : ''}>🎯 Poziom I · Głaz Dnia</option>
                  <option value="2" ${initialPriority === 2 ? 'selected' : ''}>📋 Poziom II · Bieżączka</option>
                  <option value="3" ${initialPriority === 3 ? 'selected' : ''}>⚪ Poziom III · Kiedyś / Link</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label>Notatki / Wytyczne (opcjonalnie)</label>
              <textarea class="form-textarea" id="mTaskNotes" placeholder="Dodatkowe informacje, wytyczne, linki...">${esc(initialNotes)}</textarea>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px; padding-top:14px; border-top:1px solid var(--border);">
              ${editId ? `<button type="button" class="btn-col-finish" style="color:var(--crimson);" onclick="App.confirmDelete('${editId}'); App.closeModal();">Usuń zadanie</button>` : '<div></div>'}
              <div style="display:flex; gap:8px;">
                <button type="button" class="header-action-btn" onclick="App.closeModal()">Anuluj</button>
                <button type="submit" class="header-action-btn btn-primary">${editId ? 'Zapisz zmiany' : 'Dodaj zadanie'}</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    `;

    document.getElementById('modalTaskForm').addEventListener('submit', e => {
      e.preventDefault();
      const title = document.getElementById('mTaskTitle').value.trim();
      const date = document.getElementById('mTaskDate').value || D.today();
      const priority = parseInt(document.getElementById('mTaskPriority').value, 10);
      const notes = document.getElementById('mTaskNotes').value.trim();

      if (editId) {
        Store.update(editId, { title, date, priority, notes, inbox: false, q: priority === 1 ? 1 : 2 });
        this.showToast('Zaktualizowano zadanie.');
      } else {
        Store.add({ title, date, priority, notes, inbox: false, q: priority === 1 ? 1 : 2 });
        this.showToast('Dodano zadanie.');
      }
      this.closeModal();
    });
  },

  /* ==========================================================================
     MODAL: RUTYNY & CYKLE (DYNAMICZNE TABELE DLA KAŻDEGO CYKLU)
     ========================================================================== */
  openRoutinesModal() {
    this.activeModal = 'routines';
    const root = document.getElementById('modalRoot');
    if (!root) return;

    const allRoutines = Store.state.tasks.filter(t => t.recur);

    // Dynamiczne grupowanie rutyn według ich dokładnego cyklu
    const grouped = {};
    allRoutines.forEach(r => {
      const key = this.getRoutineFreqKey(r);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    });

    const activeKeys = Object.keys(grouped);
    activeKeys.sort((a, b) => {
      const metaA = this.getRoutineGroupMeta(a);
      const metaB = this.getRoutineGroupMeta(b);
      return metaA.order - metaB.order;
    });

    root.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) App.closeModal()">
        <div class="modal modal-large">
          <div class="modal-header">
            <div>
              <h2>🪚 Rutyny, Cykle & Ostrzenie Piły</h2>
              <p style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                Cykliczne nawyki i zobowiązania. Tabele tworzą się automatycznie dla każdego zdefiniowanego cyklu (poniedziałek, czwartek, co miesiąc, co rok itd.).
              </p>
            </div>
            <button class="icon-circle-btn" onclick="App.closeModal()">✕</button>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-size:0.82rem; color:var(--text-muted);">
              ${allRoutines.length > 0 ? `Liczba rutyn: <strong>${allRoutines.length}</strong> w <strong>${activeKeys.length}</strong> tabelach cykli` : 'Brak zdefiniowanych rutyn'}
            </div>
            <button class="header-action-btn btn-primary" data-act="openNewRoutineModal">+ Nowe przypomnienie cykliczne</button>
          </div>

          <!-- Dynamiczne tabele rutyn (tworzone na żądanie) -->
          <div class="routine-groups-container">
            ${activeKeys.length > 0 ? activeKeys.map(key => {
              const meta = this.getRoutineGroupMeta(key);
              const items = grouped[key];
              return `
                <div class="routine-group-section">
                  <div class="routine-group-header">
                    <div class="routine-group-title">
                      <span>${meta.icon}</span>
                      <span>${meta.title}</span>
                      <span class="routine-group-count">${items.length}</span>
                    </div>
                    <button class="group-add-btn" data-act="openNewRoutineModal" data-freq="${meta.defaultFreq || key}" title="Dodaj nową rutynę do: ${meta.title}">
                      + Dodaj do tej tabeli
                    </button>
                  </div>

                  <div style="overflow-x:auto;">
                    <table class="routine-table">
                      <thead>
                        <tr>
                          <th style="width:34%;">Czynność / Nawyk</th>
                          <th style="width:22%;">Termin / Częstotliwość</th>
                          <th style="width:32%;">Notatki i wytyczne</th>
                          <th style="width:12%; text-align:right;">Akcje</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${items.map(r => {
                          const streak = Recur.streak(r);
                          const isWork = this.isWorkRoutine(r);
                          return `
                            <tr class="routine-table-row" data-id="${r.id}">
                              <td>
                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; cursor:pointer;" data-act="editRoutine" data-id="${r.id}">
                                  <span class="routine-row-name">${esc(r.title)}</span>
                                  <span class="routine-zone-pill ${isWork ? 'zone-work' : 'zone-self'}">${isWork ? '📋 Bieżączka' : '🛡️ Zdrowie & Ja'}</span>
                                  ${streak > 0 ? `<span class="routine-streak-chip" title="Seria: ${streak} dni">🔥 ${streak}</span>` : ''}
                                </div>
                              </td>
                              <td style="cursor:pointer;" data-act="editRoutine" data-id="${r.id}">
                                <span class="routine-cycle-badge">
                                  ${Recur.fullLabel(r.recur, r.date)}
                                  ${r.date && (r.recur.unit === 'month' || r.recur.unit === 'year') ? `<br><small style="color:var(--text-muted); font-size:0.7rem;">termin: ${D.human(r.date)}</small>` : ''}
                                </span>
                              </td>
                              <td>
                                ${r.notes ? `
                                  <div class="routine-table-note" data-act="editRoutine" data-id="${r.id}" title="Kliknij, aby edytować notatkę">
                                    <span>📝</span>
                                    <span>${linkify(r.notes)}</span>
                                  </div>
                                ` : `
                                  <span class="routine-empty-note-hint" data-act="editRoutine" data-id="${r.id}">+ Dodaj notatkę...</span>
                                `}
                              </td>
                              <td style="text-align:right;">
                                <div style="display:flex; justify-content:flex-end; gap:4px;">
                                  <button class="task-micro-btn" data-act="editRoutine" data-id="${r.id}" title="Edytuj (nazwę, cykl, notatkę)">✏️</button>
                                  <button class="task-micro-btn btn-trash" data-act="deleteRoutine" data-id="${r.id}" title="Usuń">🗑️</button>
                                </div>
                              </td>
                            </tr>
                          `;
                        }).join('')}
                      </tbody>
                    </table>
                  </div>
                </div>
              `;
            }).join('') : `
              <div class="empty-routines-container">
                <div class="empty-routines-icon">🪚</div>
                <h3>Brak zdefiniowanych rutyn</h3>
                <p>Nie masz jeszcze żadnych stałych nawyków ani cykli.</p>
                <p class="empty-routines-subhint">Gdy ustalisz np. czynność co poniedziałek, utworzy się nowa tabela „W każdy poniedziałek” ze wszystkimi poniedziałkowymi czynnościami. Analogicznie dla czwartków, co miesiąc, co rok itd.</p>
                <button class="header-action-btn btn-primary" data-act="openNewRoutineModal" style="margin-top:14px;">+ Dodaj pierwsze przypomnienie</button>
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  },

  getRoutineGroupMeta(key) {
    if (key === 'daily') {
      return { title: 'Codziennie (każdego dnia)', icon: '☀️', order: 10, defaultFreq: 'daily' };
    }
    if (key === 'dow_workdays') {
      return { title: 'Dni robocze (Poniedziałek – Piątek)', icon: '💼', order: 20, defaultFreq: 'dow_workdays' };
    }
    if (key.startsWith('dow_')) {
      const dow = parseInt(key.replace('dow_', ''), 10);
      const dowEvery = [
        'W każdy poniedziałek',
        'W każdy wtorek',
        'W każdą środę',
        'W każdy czwartek',
        'W każdy piątek',
        'W każdą sobotę',
        'W każdą niedzielę'
      ];
      return {
        title: dowEvery[dow] || `Dzień tygodnia ${dow}`,
        icon: dow >= 5 ? '🌴' : '📅',
        order: 30 + dow,
        defaultFreq: key
      };
    }
    if (key === 'w2') {
      return { title: 'Co 2 tygodnie', icon: '🔄', order: 45, defaultFreq: 'w2' };
    }
    if (key.startsWith('w_')) {
      const n = parseInt(key.replace('w_', ''), 10) || 1;
      return { title: `Co ${n} tyg.`, icon: '🔄', order: 45 + n, defaultFreq: 'daily' };
    }
    if (key.startsWith('m1_day_')) {
      const day = key.replace('m1_day_', '');
      const dayLabel = day === 'last' ? 'ostatni dzień miesiąca' : `${day}. dzień miesiąca`;
      return {
        title: `Co miesiąc (${dayLabel})`,
        icon: '🗓️',
        order: 50 + (day === 'last' ? 32 : (parseInt(day, 10) || 1)),
        defaultFreq: key
      };
    }
    if (key.startsWith('m')) {
      const m = parseInt(key.replace('m', ''), 10) || 1;
      let title = `Co ${m} mies.`;
      let defaultFreq = 'm1_day_1';
      if (m === 1) { title = 'Co miesiąc (1. dzień)'; defaultFreq = 'm1_day_1'; }
      else if (m === 3) { title = 'Co 3 miesiące (Kwartalnie)'; defaultFreq = 'm3'; }
      else if (m === 6) { title = 'Co pół roku'; defaultFreq = 'm6'; }
      return {
        title,
        icon: m >= 3 ? '📊' : '🗓️',
        order: 50 + m,
        defaultFreq
      };
    }
    if (key.startsWith('y')) {
      const y = parseInt(key.replace('y', ''), 10) || 1;
      return {
        title: y === 1 ? 'Co rok' : `Co ${y} lata`,
        icon: '🎯',
        order: 80 + y,
        defaultFreq: 'y1'
      };
    }
    return {
      title: 'Inne cykle',
      icon: '🔁',
      order: 99,
      defaultFreq: 'daily'
    };
  },

  getRoutineFreqKey(r) {
    if (!r || !r.recur) return 'daily';
    const rc = r.recur;
    if (rc.unit === 'day') return 'daily';
    if (rc.unit === 'week') {
      if (Array.isArray(rc.dows) && rc.dows.length === 5) return 'dow_workdays';
      if (rc.dow != null) return `dow_${rc.dow}`;
      if ((rc.every || 1) === 1) {
        if (r.date) return `dow_${D.dow(r.date)}`;
        return 'dow_0';
      }
      if (rc.every === 2) return 'w2';
      return `w_${rc.every}`;
    }
    if (rc.unit === 'month') {
      const m = rc.every || 1;
      const day = rc.dayOfMonth ?? rc.anchor ?? (r.date ? D.parse(r.date).getDate() : null);
      if (m === 1 && day != null) {
        return `m1_day_${day}`;
      }
      return `m${m}`;
    }
    if (rc.unit === 'year') {
      const y = rc.every || 1;
      return `y${y}`;
    }
    return 'daily';
  },

  /* Formularz nowej / edytowanej rutyny */
  openRoutineModal({ editId = null, defaultFreq = null } = {}) {
    this.activeModal = 'routine_form';
    const root = document.getElementById('modalRoot');
    if (!root) return;

    const routine = editId ? Store.get(editId) : null;
    const initialTitle = routine ? routine.title : '';
    const initialNotes = routine ? (routine.notes || '') : '';
    let selectedFreq = routine ? this.getRoutineFreqKey(routine) : (defaultFreq || 'daily');
    if (selectedFreq === 'm1') selectedFreq = 'm1_day_1';

    let currentDayVal = 1;
    if (routine && routine.recur && routine.recur.unit === 'month') {
      currentDayVal = routine.recur.dayOfMonth ?? routine.recur.anchor ?? (routine.date ? D.parse(routine.date).getDate() : 1);
    }

    const standardFreqPresets = [
      'daily', 'dow_workdays',
      'dow_0', 'dow_1', 'dow_2', 'dow_3', 'dow_4', 'dow_5', 'dow_6',
      'w2',
      'm1_day_1', 'm1_day_10', 'm1_day_15', 'm1_day_20', 'm1_day_25', 'm1_day_last',
      'm3', 'm6', 'y1'
    ];

    let isCustomMonth = false;
    if (selectedFreq.startsWith('m1_day_') && !standardFreqPresets.includes(selectedFreq)) {
      isCustomMonth = true;
      currentDayVal = parseInt(selectedFreq.replace('m1_day_', ''), 10) || 1;
      selectedFreq = 'm1_custom';
    }

    const isWork = routine ? this.isWorkRoutine(routine) : false;
    const selectedZone = routine && routine.zone ? routine.zone : (isWork ? 'standard' : 'selfcare');

    const opt = (val, label) => `<option value="${val}" ${selectedFreq === val ? 'selected' : ''}>${label}</option>`;

    root.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) App.closeRoutineFormModal()">
        <div class="modal">
          <div class="modal-header">
            <div>
              <h2>${editId ? '✏️ Edytuj rutynę / nawyk' : '✨ Nowa rutyna / nawyk'}</h2>
              <p style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                ${editId ? 'Zmień nazwę, częstotliwość, notatki lub przypisaną strefę.' : 'Zdefiniuj czynność cykliczną i wybierz, w którym oknie ma się pojawiać.'}
              </p>
            </div>
            <button class="icon-circle-btn" onclick="App.closeRoutineFormModal()">✕</button>
          </div>

          <form id="routineModalForm" autocomplete="off">
            <div class="form-group">
              <label>Nazwa czynności / nawyku</label>
              <input class="form-input" id="rFormTitle" value="${esc(initialTitle)}" placeholder="np. Zmierzyć ciśnienie, Przegląd faktur i KSeF, Medytacja..." required autofocus>
            </div>

            <div class="form-group">
              <label>Gdzie ma się wyświetlać w planie dnia?</label>
              <select class="form-select" id="rFormZone">
                <option value="selfcare" ${selectedZone === 'selfcare' ? 'selected' : ''}>🛡️ Zdrowie & Ja (Na samej górze dnia — medytacja, Biblia, zdrowie, rozwój)</option>
                <option value="standard" ${selectedZone === 'standard' ? 'selected' : ''}>📋 Bieżączka (Sprawy cykliczne — faktury, KSeF, podatki, praca, dom)</option>
              </select>
            </div>

            <div class="form-group">
              <label>Częstotliwość powtarzania</label>
              <select class="form-select" id="rFormFreq">
                <optgroup label="Codziennie & Tygodniowe">
                  ${opt('daily', 'Codziennie (każdego dnia)')}
                  ${opt('dow_workdays', 'Dni robocze (Pon – Pt)')}
                  ${opt('dow_0', 'Zawsze w Poniedziałki')}
                  ${opt('dow_1', 'Zawsze we Wtorki')}
                  ${opt('dow_2', 'Zawsze w Środy')}
                  ${opt('dow_3', 'Zawsze w Czwartki')}
                  ${opt('dow_4', 'Zawsze w Piątki')}
                  ${opt('dow_5', 'Zawsze w Soboty')}
                  ${opt('dow_6', 'Zawsze w Niedziele')}
                  ${opt('w2', 'Co 2 tygodnie')}
                </optgroup>
                <optgroup label="Co miesiąc (Wybierz dzień)">
                  ${opt('m1_day_1', '🗓️ Co miesiąc — 1. dzień miesiąca (Nowy miesiąc)')}
                  ${opt('m1_day_10', '🗓️ Co miesiąc — 10. dzień miesiąca (np. ZUS)')}
                  ${opt('m1_day_15', '🗓️ Co miesiąc — 15. dzień miesiąca (np. PIT)')}
                  ${opt('m1_day_20', '🗓️ Co miesiąc — 20. dzień miesiąca')}
                  ${opt('m1_day_25', '🗓️ Co miesiąc — 25. dzień miesiąca (np. VAT / KSeF)')}
                  ${opt('m1_day_last', '🗓️ Co miesiąc — Ostatni dzień miesiąca')}
                  ${opt('m1_custom', '🗓️ Co miesiąc — Inny wybrany dzień (1–31)…')}
                </optgroup>
                <optgroup label="Rzadsze (Miesięczne / Kwartalne / Roczne)">
                  ${opt('m3', 'Co 3 miesiące (Kwartalnie) ★')}
                  ${opt('m6', 'Co pół roku')}
                  ${opt('y1', 'Co rok')}
                </optgroup>
              </select>
            </div>

            <!-- Dynamiczne pole dla innego wybranego dnia miesiąca -->
            <div class="form-group" id="rFormMonthDayGroup" style="${isCustomMonth ? '' : 'display:none;'}">
              <label>Wskazany dzień każdego miesiąca (1 – 31)</label>
              <div style="display:flex; align-items:center; gap:8px;">
                <input type="number" min="1" max="31" class="form-input" id="rFormMonthDay" value="${currentDayVal}" style="width:90px;">
                <span style="font-size:0.82rem; color:var(--text-muted);">dzień miesiąca</span>
              </div>
            </div>

            <div class="form-group">
              <label>Notatki / Wytyczne (będą widoczne w planie i na liście)</label>
              <textarea class="form-textarea" id="rFormNotes" placeholder="np. Poniżej 20 nie przyjeżdżać, powyżej kontrola; rano na czczo; 3 serie po 15...">${esc(initialNotes)}</textarea>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px; padding-top:14px; border-top:1px solid var(--border);">
              ${editId ? `
                <button type="button" class="btn-col-finish" style="color:var(--crimson); border-color:var(--crimson-border); padding:6px 12px; height:auto; width:auto;" onclick="App.deleteRoutine('${editId}')">
                  🗑️ Usuń tę rutynę
                </button>
              ` : '<div></div>'}

              <div style="display:flex; gap:8px;">
                <button type="button" class="header-action-btn" onclick="App.closeRoutineFormModal()">Anuluj</button>
                <button type="submit" class="header-action-btn btn-primary">${editId ? 'Zapisz zmiany' : 'Dodaj rutynę'}</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    `;

    const freqSelect = document.getElementById('rFormFreq');
    const dayGroup = document.getElementById('rFormMonthDayGroup');
    freqSelect.addEventListener('change', () => {
      dayGroup.style.display = freqSelect.value === 'm1_custom' ? 'block' : 'none';
    });

    document.getElementById('routineModalForm').addEventListener('submit', e => {
      e.preventDefault();
      const title = document.getElementById('rFormTitle').value.trim();
      const zone = document.getElementById('rFormZone').value;
      const rType = document.getElementById('rFormFreq').value;
      const notes = document.getElementById('rFormNotes').value.trim();

      let recur = null;
      let date = routine && routine.date ? routine.date : D.today();

      if (rType === 'daily') {
        recur = { unit: 'day', every: 1 };
      } else if (rType === 'dow_workdays') {
        recur = { unit: 'week', every: 1, dows: [0, 1, 2, 3, 4] };
        date = D.today();
      } else if (rType.startsWith('dow_')) {
        const dow = parseInt(rType.replace('dow_', ''), 10);
        recur = { unit: 'week', every: 1, dow: dow };
        date = D.dow(D.today()) === dow ? D.today() : D.nextDow(dow);
      } else if (rType === 'w2') {
        recur = { unit: 'week', every: 2 };
      } else if (rType.startsWith('m1_day_') || rType === 'm1_custom') {
        let dayOfMonth = 1;
        if (rType.startsWith('m1_day_')) {
          const raw = rType.replace('m1_day_', '');
          dayOfMonth = raw === 'last' ? 'last' : (parseInt(raw, 10) || 1);
        } else {
          const inputVal = parseInt(document.getElementById('rFormMonthDay').value, 10);
          dayOfMonth = Math.min(31, Math.max(1, inputVal || 1));
        }

        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        let targetD = dayOfMonth === 'last' ? new Date(y, m + 1, 0).getDate() : dayOfMonth;
        date = `${y}-${D.pad(m + 1)}-${D.pad(targetD)}`;

        recur = {
          unit: 'month',
          every: 1,
          dayOfMonth: dayOfMonth,
          anchor: typeof dayOfMonth === 'number' ? dayOfMonth : targetD
        };
      } else if (rType === 'm3') {
        recur = { unit: 'month', every: 3, anchor: D.parse(date).getDate(), dayOfMonth: D.parse(date).getDate() };
      } else if (rType === 'm6') {
        recur = { unit: 'month', every: 6, anchor: D.parse(date).getDate(), dayOfMonth: D.parse(date).getDate() };
      } else if (rType === 'y1') {
        recur = { unit: 'year', every: 1, anchor: D.parse(date).getDate(), dayOfMonth: D.parse(date).getDate() };
      }

      if (editId) {
        Store.update(editId, { title, notes, recur, date, zone, roleId: zone === 'selfcare' ? 'r_saw' : 'r_firm' });
        this.showToast(`Zaktualizowano rutynę „${title}”!`);
      } else {
        Store.add({ title, notes, roleId: zone === 'selfcare' ? 'r_saw' : 'r_firm', date, recur, priority: 2, q: 2, zone, history: [] });
        this.showToast(`Dodano rutynę „${title}”!`);
      }

      this.openRoutinesModal();
    });
  },

  closeRoutineFormModal() {
    this.openRoutinesModal();
  },

  /* Ustawienia i backup */
  openSettings() {
    this.activeModal = 'settings';
    this.updateMobileBottomNav();
    const root = document.getElementById('modalRoot');
    if (!root) return;

    root.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) App.closeModal()">
        <div class="modal">
          <div class="modal-header">
            <h2>Ustawienia i Baza Danych</h2>
            <button class="icon-circle-btn" onclick="App.closeModal()">✕</button>
          </div>

          <div style="display:flex; flex-direction:column; gap:16px;">
            <div style="padding:14px; background:var(--surface-alt); border-radius:var(--radius-md);">
              <h3 style="font-size:0.92rem; font-weight:700; margin-bottom:4px;">Motyw interfejsu</h3>
              <p style="font-size:0.82rem; color:var(--text-muted); margin-bottom:10px;">Wybierz preferowany wygląd aplikacji:</p>
              <div style="display:flex; gap:8px;">
                <button class="header-action-btn ${this.theme === 'light' ? 'btn-primary' : ''}" onclick="App.setTheme('light'); App.openSettings();">☀️ Jasny</button>
                <button class="header-action-btn ${this.theme === 'dark' ? 'btn-primary' : ''}" onclick="App.setTheme('dark'); App.openSettings();">🌙 Ciemny</button>
              </div>
            </div>

            <div style="padding:14px; background:var(--surface-alt); border-radius:var(--radius-md);">
              <h3 style="font-size:0.92rem; font-weight:700; margin-bottom:4px;">Automatyczne przenoszenie zaległych zadań</h3>
              <p style="font-size:0.82rem; color:var(--text-muted); margin-bottom:10px;">
                Niewykonane zadania (Bieżączka i Głaz) z przeszłych dni oraz po odklikaniu dnia automatycznie przechodzą na kolejny dzień. Rutyny i Zdrowie & Ja pozostają w swoich dniach.
              </p>
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.85rem; font-weight:600;">
                <input type="checkbox" id="settingAutoRollover" ${Store.state.autoRollover !== false ? 'checked' : ''} onchange="Store.set('autoRollover', this.checked); App.showToast('Zaktualizowano ustawienie.');">
                Włącz automatyczne przenoszenie zadań na kolejny dzień
              </label>
            </div>

            <div style="padding:14px; background:var(--surface-alt); border-radius:var(--radius-md);">
              <h3 style="font-size:0.92rem; font-weight:700; margin-bottom:4px;">☁️ Synchronizacja w chmurze (Firebase)</h3>
              <p style="font-size:0.82rem; color:var(--text-muted); margin-bottom:10px;">
                ${((window.Sync && window.Sync.user) || (typeof Sync !== 'undefined' && Sync.user)) ? `Zalogowano jako: <strong>${(window.Sync?.user || Sync?.user).displayName || (window.Sync?.user || Sync?.user).email}</strong>. Każda zmiana zapisuje się automatycznie w ułamku sekundy.` : 'Zaloguj się, aby mieć te same zadania na komputerze i w telefonie w czasie rzeczywistym.'}
              </p>
              <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <span style="font-size:0.82rem; font-weight:600; color:var(--emerald);">🟢 Synchronizacja automatyczna aktywna</span>
                ${((window.Sync && window.Sync.user) || (typeof Sync !== 'undefined' && Sync.user)) ? `
                  <button class="header-action-btn" style="color:var(--crimson);" onclick="Sync.logout(); App.openSettings();">Wyloguj</button>
                ` : `
                  <button class="header-action-btn btn-primary" onclick="Sync.openAuthModal()">☁️ Zaloguj / Połącz z chmurą</button>
                `}
              </div>
            </div>

            <div style="padding:14px; background:var(--surface-alt); border-radius:var(--radius-md);">
              <h3 style="font-size:0.92rem; font-weight:700; margin-bottom:4px;">Kopia zapasowa (JSON)</h3>
              <p style="font-size:0.82rem; color:var(--text-muted); margin-bottom:10px;">Pobierz kopię danych na komputer lub wgraj z pliku (po wgraniu automatycznie synchronizuje się z chmurą):</p>
              <div style="display:flex; gap:8px;">
                <button class="header-action-btn" onclick="App.downloadBackup()">💾 Pobierz kopię</button>
                <button class="header-action-btn" onclick="document.getElementById('importFile').click()">📂 Wgraj plik</button>
                <input type="file" id="importFile" accept=".json" style="display:none" onchange="App.handleFileImport(this)">
              </div>
            </div>

            <div style="padding:14px; border:1px solid rgba(239,68,68,0.25); background:var(--crimson-light); border-radius:var(--radius-md);">
              <h3 style="font-size:0.92rem; font-weight:700; color:var(--crimson); margin-bottom:4px;">Reset bazy danych</h3>
              <p style="font-size:0.8rem; color:var(--text-main); margin-bottom:8px;">Przywraca startowe zadania i nawyki.</p>
              <button class="header-action-btn" style="background:var(--crimson); color:#ffffff; border:none;" onclick="if(confirm('Przywrócić dane początkowe?')){ Store.reset(); App.closeModal(); App.showToast('Zresetowano.'); }">Zresetuj dane</button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  downloadBackup() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(Store.exportJSON());
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `plan_tygodnia_backup_${D.today()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    this.showToast('Pobrano kopię zapasową.');
  },

  handleFileImport(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const obj = JSON.parse(e.target.result);
        Store.importJSON(obj);
        this.closeModal();
        this.showToast('Dane zaimportowane pomyślnie!');
      } catch (err) {
        alert('Błąd odczytu pliku: ' + err.message);
      }
    };
    reader.readAsText(file);
  },

  closeModal() {
    this.activeModal = null;
    const root = document.getElementById('modalRoot');
    if (root) root.innerHTML = '';
    this.updateMobileBottomNav();
  },

  showToast(msg, undoFn = null) {
    const root = document.getElementById('toastRoot');
    if (!root) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    const textSpan = document.createElement('span');
    textSpan.textContent = msg;
    toast.appendChild(textSpan);

    if (typeof undoFn === 'function') {
      const undoBtn = document.createElement('button');
      undoBtn.className = 'toast-undo-btn';
      undoBtn.textContent = 'Cofnij';
      undoBtn.onclick = (e) => {
        e.stopPropagation();
        undoFn();
        toast.remove();
      };
      toast.appendChild(undoBtn);
    }

    root.appendChild(toast);
    const duration = undoFn ? 3500 : 2200;
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 200);
    }, duration);
  },
};

window.App = App;
window.addEventListener('DOMContentLoaded', () => App.init());
