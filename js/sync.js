'use strict';

/**
 * Moduł synchronizacji w czasie rzeczywistym z Google Firebase (Firestore + Auth).
 * Obsługuje komputer i telefon bez przeładowywania strony.
 */
const Sync = {
  PRIMARY_DOC_ID: 'plan_v2_main',
  auth: null,
  db: null,
  user: null,
  unsubscribeSnapshot: null,
  isRemoteChange: false,
  initialSyncComplete: false,
  lastSyncedAt: null,
  saveTimer: null,
  _initialized: false,
  lastCloudData: null,
  status: 'idle', // 'idle' | 'saving' | 'synced' | 'error' | 'syncing'

  init() {
    if (this._initialized) {
      this.updateHeaderUI();
      return;
    }
    this._initialized = true;

    if (!window.FIREBASE_CONFIG || !window.firebase) {
      console.warn('Brak konfiguracji Firebase lub biblioteki Firebase SDK.');
      this.initialSyncComplete = true;
      this.updateHeaderUI();
      return;
    }

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(window.FIREBASE_CONFIG);
      }
      this.auth = firebase.auth();
      this.db = firebase.firestore();

      // Obsługa powrotu z logowania przez przekierowanie (dla urządzeń mobilnych)
      this.auth.getRedirectResult().then(result => {
        if (result && result.user) {
          App.showToast(`Witaj, ${result.user.displayName || result.user.email}!`);
        }
      }).catch(err => {
        console.warn('Błąd getRedirectResult:', err);
      });

      // Nasłuchuj zmian stanu autoryzacji
      this.auth.onAuthStateChanged(user => {
        this.user = user;
        if (user) {
          try { localStorage.setItem('kompas_auth_active', '1'); } catch(e){}
          document.documentElement.classList.add('is-authenticated');
        } else {
          try { localStorage.removeItem('kompas_auth_active'); } catch(e){}
          document.documentElement.classList.remove('is-authenticated');
          this.initialSyncComplete = false;
        }
        this.updateHeaderUI();
        this.updateGateUI();

        if (user) {
          this.listenToUserDoc();
        } else {
          this.detachUserDoc();
        }
      });

      this.startRetryLoop();
    } catch (err) {
      console.error('Błąd inicjalizacji Firebase Sync:', err);
      this.setStatus('error');
    }
  },

  /* ---- Blokada / Ekran logowania (Auth Gate) ---- */
  updateGateUI() {
    const screenAuth = document.getElementById('screenAuth');
    const screenApp = document.getElementById('screenApp');
    const metaTheme = document.getElementById('metaThemeColor');

    if (this.user) {
      if (screenAuth) screenAuth.style.display = 'none';
      if (screenApp) screenApp.style.display = 'flex';
      if (window.App && window.Store && window.Store.state) {
        if (typeof window.App.initTheme === 'function') window.App.initTheme();
        if (typeof window.App.renderAll === 'function') window.App.renderAll();
      }
    } else {
      if (screenAuth) screenAuth.style.display = 'flex';
      if (screenApp) screenApp.style.display = 'none';
      if (metaTheme) metaTheme.setAttribute('content', '#090d16');
    }
  },

  /* ---- UI Nagłówka: Przycisk Zaloguj / Pigułka Użytkownika ---- */
  updateHeaderUI() {
    let container = document.getElementById('authHeaderContainer');
    if (!container) {
      const headerRight = document.querySelector('.header-right');
      if (!headerRight) return;
      container = document.createElement('div');
      container.id = 'authHeaderContainer';
      container.style.display = 'inline-flex';
      container.style.alignItems = 'center';
      // Wstawiamy przed przyciskiem motywu / ustawień
      const themeBtn = document.getElementById('btnThemeToggle');
      if (themeBtn) {
        headerRight.insertBefore(container, themeBtn);
      } else {
        headerRight.appendChild(container);
      }
    }

    if (!this.user) {
      container.innerHTML = `
        <button class="header-action-btn btn-auth" onclick="Sync.openAuthModal()" title="Zaloguj się, aby zsynchronizować zadania między komputerem a telefonem">
          <span>☁️ Zaloguj</span>
        </button>
      `;
    } else {
      const name = this.user.displayName || this.user.email?.split('@')[0] || 'Konto';
      const initial = (name[0] || 'U').toUpperCase();
      const photo = this.user.photoURL;

      const shortLabels = {
        synced: 'Zapisano',
        saving: 'Zapisuję...',
        syncing: 'Synchronizacja...',
        error: 'Offline',
        idle: 'Chmura'
      };

      container.innerHTML = `
        <div class="user-auth-pill" onclick="Sync.openAuthModal()" title="Zalogowano jako ${name}. Kliknij, aby otworzyć stan synchronizacji, kopie zapasowe i konto.">
          <span class="sync-dot ${this.status}" id="syncStatusDot" title="Status synchronizacji"></span>
          <span class="sync-pill-text" id="syncStatusText">${shortLabels[this.status] || 'Chmura'}</span>
          ${photo ? `<img src="${photo}" class="user-avatar-img" alt="${initial}">` : `<span class="user-avatar-initial">${initial}</span>`}
        </div>
      `;
    }
  },

  setStatus(s) {
    this.status = s;
    if (s === 'synced') {
      const now = new Date();
      this.lastSyncedAt = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    }
    const dot = document.getElementById('syncStatusDot');
    if (dot) {
      dot.className = `sync-dot ${s}`;
      const titles = {
        synced: 'Zsynchronizowano z chmurą 🟢',
        saving: 'Zapisywanie w chmurze... 🟡',
        syncing: 'Pobieranie zmian z chmury... 🔄',
        error: 'Brak połączenia (zapisano w pamięci urządzenia) 🔴',
        idle: 'Gotowe'
      };
      dot.title = titles[s] || s;
    }

    const txt = document.getElementById('syncStatusText');
    if (txt) {
      const shortLabels = {
        synced: 'Zapisano',
        saving: 'Zapisuję...',
        syncing: 'Synchronizacja...',
        error: 'Offline',
        idle: 'Chmura'
      };
      txt.textContent = shortLabels[s] || 'Chmura';
    }

    const modalStatus = document.getElementById('syncModalStatusLabel');
    if (modalStatus) {
      const labels = {
        synced: `🟢 Dane zsynchronizowane w czasie rzeczywistym ${this.lastSyncedAt ? '(' + this.lastSyncedAt + ')' : ''}`,
        saving: '🟡 Zapisywanie zmian w chmurze...',
        syncing: '🔄 Pobieranie najnowszych danych z chmury...',
        error: '🔴 Tryb offline — zmiany zapisane na urządzeniu, wyślą się automatycznie',
        idle: '⚪ Gotowe do synchronizacji'
      };
      modalStatus.textContent = labels[s] || s;
    }
  },

  /* ---- Nasłuchiwanie bazy Firestore w czasie rzeczywistym (wzór Muraven + ochrona przed nadpisaniem) ---- */
  listenToUserDoc() {
    if (!this.db) return;
    this.detachUserDoc();

    this.setStatus('syncing');
    const docRef = this.db.collection('users').doc(this.PRIMARY_DOC_ID);
    let isFirstSnap = true;

    this.unsubscribeSnapshot = docRef.onSnapshot(docSnap => {
      const first = isFirstSnap;
      isFirstSnap = false;
      if (docSnap.exists) {
        const cloudData = docSnap.data();
        if (cloudData && Array.isArray(cloudData.tasks)) {
          this.applyRemote(cloudData, first);
        } else {
          this.initialSyncComplete = true;
          this.pushToCloud();
        }
      } else {
        // Pierwsze logowanie użytkownika: wyślij aktualny stan do chmury
        this.initialSyncComplete = true;
        this.pushToCloud();
      }
    }, err => {
      console.error('Błąd Firestore onSnapshot:', err);
      this.initialSyncComplete = true;
      this.setStatus('error');
    });
  },

  /**
   * Wymusza pobranie najnowszego stanu prosto z serwera Firestore (np. po odblokowaniu telefonu).
   */
  async pullFromCloud() {
    if (!this.db || !this.user) return;
    const store = (typeof Store !== 'undefined' ? Store : window.Store);
    if (!store) return;

    // Jeśli urządzenie ma niewysłane zmiany lokalne, najpierw wyślij je w transakcji (transakcja pobierze i scali chmurę)
    if (store.hasUnsyncedChanges() && !store.state?._isSeedOnly) {
      this.pushToCloud();
      return;
    }

    this.setStatus('syncing');
    const docRef = this.db.collection('users').doc(this.PRIMARY_DOC_ID);
    try {
      let docSnap;
      try {
        docSnap = await docRef.get({ source: 'server' });
      } catch (e) {
        docSnap = await docRef.get();
      }
      if (docSnap && docSnap.exists) {
        const cloudData = docSnap.data();
        if (cloudData && Array.isArray(cloudData.tasks)) {
          this.applyRemote(cloudData, true);
        }
      }
    } catch (err) {
      console.warn('Błąd pullFromCloud:', err);
      this.setStatus('error');
    }
  },

  /**
   * Bezpieczne odbieranie danych z chmury:
   * - Jeśli urządzenie nie wykonywało żadnych lokalnych zmian (np. świeżo otwarty telefon po pracy na komputerze),
   *   przyjmuje stan z chmury 1:1 bez ryzyka nadpisania chmury starym cache'em.
   * - Jeśli urządzenie ma niewysłane zmiany offline, scala je za pomocą znaczników czasu.
   */
  applyRemote(cloudData, isInitialOrPull = false) {
    const store = (typeof Store !== 'undefined' ? Store : window.Store);
    if (!store || !store.state || !cloudData) return;

    this.lastCloudData = JSON.parse(JSON.stringify(cloudData));

    // Jeśli trwa aktywny zapis z tego urządzenia, nie przerywaj go pośrednim snapshotem
    if (this.pushing && !isInitialOrPull) return;

    const local = store.state;
    const hasLocalPending = store.hasUnsyncedChanges() && !local._isSeedOnly;

    // Zapisz kopię bezpieczeństwa lokalnego stanu przed nałożeniem zmian z zewnątrz
    if (!local._isSeedOnly && store.sig(local) !== store.sig(cloudData)) {
      store.saveLocalBackup('Przed synchronizacją z drugim urządzeniem');
    }

    let nextState;
    let shouldPushBack = false;

    if (!hasLocalPending) {
      // Urządzenie nie miało żadnych niewysłanych zmian lokalnych — chmura jest w 100% źródłem prawdy!
      nextState = store.normalizeState(JSON.parse(JSON.stringify(cloudData)));
      delete nextState._isSeedOnly;
      shouldPushBack = false;
    } else {
      // Urządzenie ma lokalne zmiany wprowadzone np. offline — scal oba stany bez utraty danych
      store.stamp();
      nextState = store.merge(local, cloudData);
      shouldPushBack = store.sig(nextState) !== store.sig(cloudData);
    }

    const localChanged = store.sig(nextState) !== store.sig(local) || !this.initialSyncComplete;
    this.initialSyncComplete = true;

    if (localChanged) {
      this.isRemoteChange = true;
      store.state = nextState;
      store.rebaseline();
      store.persist(true, false, false);
      this.isRemoteChange = false;
      if (window.App && typeof window.App.renderAll === 'function') window.App.renderAll();
    }

    if (shouldPushBack) {
      this.pushToCloud();
    } else {
      this.dirty = false;
      store.markUnsynced(false);
      this.setStatus('synced');
    }
  },

  detachUserDoc() {
    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
      this.unsubscribeSnapshot = null;
    }
    this.setStatus('idle');
  },

  /* ---- Zapis do chmury: błyskawiczne scalenie + bezpośredni zapis docRef.set (bez blokujących transakcji IndexedDB) ---- */
  dirty: false,
  pushing: false,
  pushAgain: false,
  pushToCloud() {
    this.dirty = true;
    const store = (typeof Store !== 'undefined' ? Store : window.Store);
    if (!store || !store.state) return;

    // Nigdy nie wypychaj pustego szablonu Seed przed zakończeniem pierwszego pobrania z chmury
    if (store.state._isSeedOnly && !this.initialSyncComplete) return;
    if (!this.db || !this.user || this.isRemoteChange) return;
    if (this.pushing) { this.pushAgain = true; return; }

    this.pushing = true;
    this.setStatus('saving');
    const txGen = store.editGeneration;

    const docRef = this.db.collection('users').doc(this.PRIMARY_DOC_ID);
    const local = JSON.parse(JSON.stringify(store.state));
    let merged;
    if (this.lastCloudData && Array.isArray(this.lastCloudData.tasks)) {
      if (local._isSeedOnly && !this.lastCloudData._isSeedOnly) {
        merged = store.normalizeState(JSON.parse(JSON.stringify(this.lastCloudData)));
      } else {
        merged = store.merge(local, this.lastCloudData);
      }
    } else {
      merged = local;
    }
    delete merged._isSeedOnly;
    const payload = JSON.parse(JSON.stringify(merged));

    // Zabezpieczenie czasowe (timeout 6s), aby przycisk zapisu nigdy nie zawiesił się na "Zapisuję..."
    let finished = false;
    const safetyTimer = setTimeout(() => {
      if (finished) return;
      finished = true;
      this.pushing = false;
      this.setStatus('error');
    }, 6000);

    docRef.set(payload).then(() => {
      if (finished) return;
      finished = true;
      clearTimeout(safetyTimer);
      this.pushing = false;
      this.initialSyncComplete = true;
      this.lastCloudData = JSON.parse(JSON.stringify(payload));

      if (store.editGeneration === txGen && !this.pushAgain) {
        store.markUnsynced(false);
        this.dirty = false;
        this.setStatus('synced');
      } else {
        this.pushAgain = false;
        this.pushToCloud();
      }
    }).catch(err => {
      if (finished) return;
      finished = true;
      clearTimeout(safetyTimer);
      this.pushing = false;
      this.pushAgain = false;
      console.error('Błąd zapisu do Firestore:', err);
      this.setStatus('error');
    });
  },

  /** Ponawia wysyłkę po powrocie sieci / do aplikacji. */
  startRetryLoop() {
    if (this._retryStarted) return;
    this._retryStarted = true;
    const store = () => (typeof Store !== 'undefined' ? Store : window.Store);

    const retry = () => {
      const s = store();
      if (this.user && (this.dirty || (s && s.hasUnsyncedChanges())) && !this.pushing) {
        this.pushToCloud();
      }
    };

    window.addEventListener('online', () => {
      const s = store();
      if (s && s.hasUnsyncedChanges()) this.pushToCloud();
      else this.pullFromCloud();
    });

    document.addEventListener('visibilitychange', () => {
      const s = store();
      if (document.visibilityState === 'hidden') {
        if (window.App && typeof window.App.flushPendingGoalSave === 'function') {
          window.App.flushPendingGoalSave();
        }
        if (this.user && s && s.hasUnsyncedChanges() && !this.pushing) {
          this.pushToCloud();
        }
      } else if (document.visibilityState === 'visible' && this.user) {
        if (!this.unsubscribeSnapshot) this.listenToUserDoc();
        if (s && s.hasUnsyncedChanges()) {
          this.pushToCloud();
        } else {
          this.pullFromCloud();
        }
      }
    });

    window.addEventListener('pagehide', () => {
      if (window.App && typeof window.App.flushPendingGoalSave === 'function') {
        window.App.flushPendingGoalSave();
      }
      const s = store();
      if (this.user && s && s.hasUnsyncedChanges() && !this.pushing) {
        this.pushToCloud();
      }
    });

    setInterval(retry, 8000);
  },

  restoreLocalBackup(backupId) {
    const store = (typeof Store !== 'undefined' ? Store : window.Store);
    if (!store) return;
    const list = store.getLocalBackups();
    const bk = list.find(x => x.id === backupId);
    if (!bk || !bk.state) return;
    if (!confirm(`Czy na pewno chcesz przywrócić stan z kopii zapasowej z dnia ${bk.savedAt} (${bk.tasksCount} aktywnych zadań, ${bk.archiveCount} w archiwum)?`)) return;

    store.saveLocalBackup('Przed przywróceniem kopii');
    store.state = store.normalizeState(JSON.parse(JSON.stringify(bk.state)));
    delete store.state._isSeedOnly;
    // Nadaj świeże znaczniki czasu, aby przywrócona kopia zapisała się jako najnowsza w chmurze
    const now = Date.now();
    store.COLLECTIONS.forEach(col => {
      (store.state[col] || []).forEach(it => { if (it && typeof it === 'object') it.updatedAt = now; });
    });
    if (!store.state.fieldStamps) store.state.fieldStamps = {};
    Object.keys(store.state.goals || {}).forEach(yr => {
      Object.keys(store.state.goals[yr] || {}).forEach(rId => {
        ['weekly', 'quarterly'].forEach(h => {
          store.state.fieldStamps[`goal:${yr}:${rId}:${h}`] = now;
        });
      });
    });
    store.rebaseline();
    store.persist(true, true, true);
    if (window.App) {
      window.App.closeModal();
      window.App.renderGoals(true);
      window.App.renderAll();
    }
  },

  /* ---- Pomocnik błędów logowania ---- */
  formatError(err) {
    if (!err) return 'Wystąpił nieznany błąd.';
    const code = err.code || '';
    if (code === 'auth/unauthorized-domain') {
      return '⚠️ Domena kongomichal.github.io nie została dodana w Firebase Console! Wejdź w Authentication -> Settings -> Authorized domains i kliknij "Add domain" dla kongomichal.github.io.';
    }
    if (code === 'auth/operation-not-allowed') {
      return '⚠️ Ta metoda logowania nie jest włączona w Firebase Console -> Authentication -> Sign-in method!';
    }
    if (code === 'auth/popup-blocked') {
      return '⚠️ Twoja przeglądarka zablokowała wyskakujące okno logowania Google. Zezwól na wyskakujące okna dla tej strony lub spróbuj ponownie.';
    }
    if (code === 'auth/popup-closed-by-user') {
      return 'Okno logowania Google zostało zamknięte przed zalogowaniem.';
    }
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      return 'Niepoprawne hasło lub błędne dane logowania.';
    }
    if (code === 'auth/email-already-in-use') {
      return 'Konto z tym adresem e-mail już istnieje. Wpisz hasło i kliknij "Zaloguj się".';
    }
    if (code === 'auth/weak-password') {
      return 'Hasło jest za słabe (musi mieć minimum 6 znaków).';
    }
    if (code === 'auth/invalid-email') {
      return 'Nieprawidłowy format adresu e-mail.';
    }
    return `Błąd logowania (${code || 'Auth'}): ${err.message}`;
  },

  showAuthError(msg) {
    const box = document.getElementById('authErrorBox');
    if (box) {
      box.textContent = msg;
      box.style.display = 'block';
    } else {
      alert(msg);
    }
  },

  clearAuthError() {
    const box = document.getElementById('authErrorBox');
    if (box) {
      box.textContent = '';
      box.style.display = 'none';
    }
  },

  /* ---- Obsługa kliknięć w portalu logowania ---- */
  async handleGoogleLogin() {
    const btn = document.getElementById('btnPortalGoogle');
    const label = document.getElementById('btnPortalGoogleText');
    const prevText = label ? label.textContent : '';
    if (btn) btn.disabled = true;
    if (label) label.textContent = 'Otwieranie logowania Google...';

    try {
      await this.loginWithGoogle();
    } finally {
      if (btn) btn.disabled = false;
      if (label) label.textContent = prevText || 'Kontynuuj przez Google';
    }
  },

  async handleEmailLogin() {
    const emailEl = document.getElementById('authPortalEmail');
    const passEl = document.getElementById('authPortalPass');
    const btn = document.getElementById('btnPortalEmailSubmit');
    const email = emailEl ? emailEl.value.trim() : '';
    const pass = passEl ? passEl.value : '';

    if (!email) {
      this.showAuthError('Wpisz swój adres e-mail.');
      if (emailEl) emailEl.focus();
      return;
    }
    if (!pass) {
      this.showAuthError('Wpisz hasło.');
      if (passEl) passEl.focus();
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Logowanie...';
    }

    try {
      await this.loginWithEmail(email, pass);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Zaloguj się';
      }
    }
  },

  async handleEmailRegister() {
    const emailEl = document.getElementById('authPortalEmail');
    const passEl = document.getElementById('authPortalPass');
    const btn = document.getElementById('btnPortalEmailRegister');
    const email = emailEl ? emailEl.value.trim() : '';
    const pass = passEl ? passEl.value : '';

    if (!email) {
      this.showAuthError('Wpisz swój adres e-mail do rejestracji.');
      if (emailEl) emailEl.focus();
      return;
    }
    if (!pass || pass.length < 6) {
      this.showAuthError('Hasło musi mieć co najmniej 6 znaków.');
      if (passEl) passEl.focus();
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Rejestracja...';
    }

    try {
      await this.registerWithEmail(email, pass);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Zarejestruj';
      }
    }
  },

  enterOfflineMode() {
    const screenAuth = document.getElementById('screenAuth');
    const screenApp = document.getElementById('screenApp');
    if (screenAuth) screenAuth.style.display = 'none';
    if (screenApp) screenApp.style.display = 'flex';
    if (window.App) {
      if (typeof window.App.initTheme === 'function') window.App.initTheme();
      if (typeof window.App.renderAll === 'function') window.App.renderAll();
      if (typeof window.App.showToast === 'function') window.App.showToast('Uruchomiono w trybie lokalnym.');
    }
  },

  /* ---- Metody Logowania ---- */
  async loginWithGoogle() {
    this.clearAuthError();
    if (!this.auth) {
      this.showAuthError('Firebase nie został jeszcze zainicjalizowany.');
      return;
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const res = await this.auth.signInWithPopup(provider);
      if (res && res.user) {
        this.user = res.user;
        this.updateHeaderUI();
        this.updateGateUI();
        this.listenToUserDoc();
      }
    } catch (err) {
      console.warn('Błąd logowania Google:', err);
      if (err.code === 'auth/popup-blocked') {
        try {
          await this.auth.signInWithRedirect(provider);
          return;
        } catch (e2) {
          this.showAuthError(this.formatError(e2));
          return;
        }
      }
      this.showAuthError(this.formatError(err));
    }
  },

  async loginWithEmail(email, password) {
    this.clearAuthError();
    if (!this.auth) {
      this.showAuthError('Firebase nie został jeszcze zainicjalizowany.');
      return;
    }
    try {
      const res = await this.auth.signInWithEmailAndPassword(email, password);
      if (res && res.user) {
        this.user = res.user;
        this.updateHeaderUI();
        this.updateGateUI();
        this.listenToUserDoc();
      }
    } catch (err) {
      console.warn('Błąd logowania email:', err);
      // Próba automatycznej rejestracji jeśli konto jeszcze nie istnieje
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        try {
          const regRes = await this.auth.createUserWithEmailAndPassword(email, password);
          if (regRes && regRes.user) {
            this.user = regRes.user;
            this.updateHeaderUI();
            this.updateGateUI();
            this.listenToUserDoc();
            return;
          }
        } catch (regErr) {
          this.showAuthError(this.formatError(regErr.code === 'auth/email-already-in-use' ? err : regErr));
          return;
        }
      }
      this.showAuthError(this.formatError(err));
    }
  },

  async registerWithEmail(email, password) {
    this.clearAuthError();
    if (!this.auth) return;
    try {
      const res = await this.auth.createUserWithEmailAndPassword(email, password);
      if (res && res.user) {
        this.user = res.user;
        this.updateHeaderUI();
        this.updateGateUI();
        this.listenToUserDoc();
      }
    } catch (err) {
      console.warn('Błąd rejestracji email:', err);
      this.showAuthError(this.formatError(err));
    }
  },

  async logout() {
    if (!this.auth) return;
    try {
      await this.auth.signOut();
      this.user = null;
      // Wyczyszczenie wrażliwych danych po wylogowaniu
      Store.state = Seed.build();
      Store.baseline = { task: {}, role: {} };
      this.dirty = false;
      try {
        localStorage.removeItem(Store.KEY);
        localStorage.removeItem('kompas_auth_active');
      } catch(e){}
      document.documentElement.classList.remove('is-authenticated');
      Store.emit();
      this.updateHeaderUI();
      this.updateGateUI();
      App.closeModal();
      App.showToast('Wylogowano z chmury.');
    } catch (err) {
      alert('Błąd wylogowania: ' + err.message);
    }
  },

  /* ---- Okno Zarządzania Kontem i Synchronizacją ---- */
  openAuthModal() {
    const root = document.getElementById('modalRoot');
    if (!root) return;

    if (this.user) {
      // Widok zalogowanego użytkownika
      const name = this.user.displayName || 'Użytkownik';
      const email = this.user.email || '';
      const photo = this.user.photoURL;

      const store = (typeof Store !== 'undefined' ? Store : window.Store);
      const backups = store && typeof store.getLocalBackups === 'function' ? store.getLocalBackups() : [];

      root.innerHTML = `
        <div class="modal-backdrop" onclick="if(event.target===this) App.closeModal()">
          <div class="modal" style="max-width:480px;">
            <div class="modal-header">
              <h3 style="font-size:1.1rem; font-weight:800;">☁️ Synchronizacja & Kopie Zapasowe</h3>
              <button class="btn" onclick="App.closeModal()">✕</button>
            </div>

            <div style="display:flex; flex-direction:column; gap:14px;">
              <div style="display:flex; align-items:center; gap:14px; padding:14px; background:var(--surface-alt); border-radius:var(--radius-md); border:1px solid var(--border);">
                ${photo ? `<img src="${photo}" style="width:44px; height:44px; border-radius:50%; object-fit:cover;">` : `<div style="width:44px; height:44px; border-radius:50%; background:var(--accent); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:1.1rem;">${(name[0]||'U').toUpperCase()}</div>`}
                <div style="flex:1; min-width:0;">
                  <div style="font-weight:700; font-size:0.95rem; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
                  <div style="font-size:0.78rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${email}</div>
                </div>
              </div>

              <div style="padding:14px; background:var(--surface-alt); border-radius:var(--radius-md); border:1px solid var(--border);">
                <div style="font-size:0.82rem; font-weight:800; margin-bottom:4px;">Status synchronizacji między urządzeniami:</div>
                <div id="syncModalStatusLabel" style="font-size:0.83rem; color:var(--text-main); font-weight:700;">
                  ${this.status === 'synced' ? `🟢 Dane zsynchronizowane w czasie rzeczywistym ${this.lastSyncedAt ? '(' + this.lastSyncedAt + ')' : ''}` : this.status === 'saving' ? '🟡 Zapisywanie zmian...' : '⚪ Połączono'}
                </div>
                <p style="font-size:0.76rem; color:var(--text-muted); margin-top:6px;">
                  Telefon i komputer korzystają z transakcyjnego scalania danych — jedno urządzenie nigdy nie nadpisuje postępów z drugiego.
                </p>
                <div style="margin-top:10px; display:flex; gap:8px;">
                  <button type="button" class="btn btn-primary" style="flex:1; justify-content:center; padding:8px 12px;" onclick="Sync.pullFromCloud()">
                    🔄 Synchronizuj teraz z chmurą
                  </button>
                </div>
              </div>

              <div style="padding:14px; background:var(--surface-alt); border-radius:var(--radius-md); border:1px solid var(--border);">
                <div style="font-size:0.82rem; font-weight:800; margin-bottom:6px;">🛡️ Ostatnie kopie zapasowe na tym urządzeniu:</div>
                ${backups.length ? `
                  <div style="display:flex; flex-direction:column; gap:6px; max-height:170px; overflow-y:auto;">
                    ${backups.map(bk => `
                      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:7px 10px; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm); font-size:0.76rem;">
                        <div>
                          <div style="font-weight:700;">🕒 ${bk.savedAt}</div>
                          <div style="color:var(--text-muted); font-size:0.71rem;">Zadania: ${bk.tasksCount} · Archiwum: ${bk.archiveCount}</div>
                        </div>
                        <button type="button" class="btn" style="padding:4px 9px; font-size:0.72rem;" onclick="Sync.restoreLocalBackup('${bk.id}')">↩ Przywróć</button>
                      </div>
                    `).join('')}
                  </div>
                ` : `<div style="font-size:0.76rem; color:var(--text-muted);">Kopie zapasowe tworzą się automatycznie przy zmianach na tym urządzeniu.</div>`}
              </div>

              <div style="display:flex; justify-content:space-between; align-items:center;">
                <button type="button" class="btn" onclick="App.exportJSON()">💾 Pobierz plik JSON</button>
                <button type="button" class="btn" style="color:var(--crimson);" onclick="Sync.logout()">
                  Wyloguj się
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      // Widok logowania
      root.innerHTML = `
        <div class="modal-backdrop" onclick="if(event.target===this) App.closeModal()">
          <div class="modal" style="max-width:440px;">
            <div class="modal-header">
              <h2>Logowanie & Chmura</h2>
              <button class="icon-circle-btn" onclick="App.closeModal()">✕</button>
            </div>

            <div style="display:flex; flex-direction:column; gap:16px;">
              <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.4;">
                Zaloguj się, aby Twoje zadania, rutyny i plany synchronizowały się na żywo między komputerem a telefonem.
              </p>

              <!-- Logowanie jednym kliknięciem przez Google -->
              <button class="google-auth-btn" onclick="Sync.loginWithGoogle()">
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                  <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
                </svg>
                <span>Kontynuuj przez Google</span>
              </button>

              <div style="display:flex; align-items:center; gap:10px; margin:4px 0;">
                <div style="flex:1; height:1px; background:var(--border);"></div>
                <span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">lub e-mail</span>
                <div style="flex:1; height:1px; background:var(--border);"></div>
              </div>

              <!-- Formularz Email -->
              <form onsubmit="event.preventDefault(); const em=this.email.value; const pw=this.pass.value; Sync.loginWithEmail(em, pw);" style="display:flex; flex-direction:column; gap:10px;">
                <input type="email" name="email" placeholder="Twój adres e-mail" required style="width:100%; padding:11px 14px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--surface); color:var(--text-main); font-size:16px; min-height:44px; outline:none; box-sizing:border-box;">
                <input type="password" name="pass" placeholder="Hasło (min. 6 znaków)" required minlength="6" style="width:100%; padding:11px 14px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--surface); color:var(--text-main); font-size:16px; min-height:44px; outline:none; box-sizing:border-box;">
                <div style="display:flex; gap:8px; margin-top:4px;">
                  <button type="submit" class="header-action-btn btn-primary" style="flex:1; justify-content:center; min-height:44px;">Zaloguj się</button>
                  <button type="button" class="header-action-btn" style="flex:1; justify-content:center; min-height:44px;" onclick="const f=this.form; if(f.checkValidity()){ Sync.registerWithEmail(f.email.value, f.pass.value); } else { f.reportValidity(); }">Zarejestruj się</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      `;
    }
  }
};

window.Sync = Sync;

// Bezpieczna automatyczna inicjalizacja modułu Sync
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Sync.init());
  } else {
    Sync.init();
  }
}


