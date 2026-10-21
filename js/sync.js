'use strict';

/**
 * Moduł synchronizacji w czasie rzeczywistym z Google Firebase (Firestore + Auth).
 * Obsługuje komputer i telefon bez przeładowywania strony.
 */
const Sync = {
  auth: null,
  db: null,
  user: null,
  unsubscribeSnapshot: null,
  isRemoteChange: false,
  saveTimer: null,
  status: 'idle', // 'idle' | 'saving' | 'synced' | 'error' | 'syncing'

  init() {
    if (!window.FIREBASE_CONFIG || !window.firebase) {
      console.warn('Brak konfiguracji Firebase lub biblioteki Firebase SDK.');
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
        this.updateHeaderUI();

        if (user) {
          this.listenToUserDoc(user.uid);
        } else {
          this.detachUserDoc();
        }
      });
    } catch (err) {
      console.error('Błąd inicjalizacji Firebase Sync:', err);
      this.setStatus('error');
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

      container.innerHTML = `
        <div class="user-auth-pill" onclick="Sync.openAuthModal()" title="Zalogowano jako ${name}. Kliknij, aby otworzyć stan synchronizacji i konto.">
          <span class="sync-dot ${this.status}" id="syncStatusDot" title="Status synchronizacji"></span>
          ${photo ? `<img src="${photo}" class="user-avatar-img" alt="${initial}">` : `<span class="user-avatar-initial">${initial}</span>`}
          <span class="user-pill-name">${name}</span>
        </div>
      `;
    }
  },

  setStatus(s) {
    this.status = s;
    const dot = document.getElementById('syncStatusDot');
    if (dot) {
      dot.className = `sync-dot ${s}`;
      const titles = {
        synced: 'Zsynchronizowano z chmurą 🟢',
        saving: 'Zapisywanie w chmurze... 🟡',
        syncing: 'Pobieranie zmian z chmury... 🔄',
        error: 'Błąd połączenia z chmurą 🔴',
        idle: 'Gotowe'
      };
      dot.title = titles[s] || s;
    }

    const modalStatus = document.getElementById('syncModalStatusLabel');
    if (modalStatus) {
      const labels = {
        synced: '🟢 Dane zsynchronizowane w czasie rzeczywistym',
        saving: '🟡 Zapisywanie zmian w chmurze...',
        syncing: '🔄 Pobieranie najnowszych danych...',
        error: '🔴 Błąd zapisu do bazy Firestore',
        idle: '⚪ Gotowe do synchronizacji'
      };
      modalStatus.textContent = labels[s] || s;
    }
  },

  /* ---- Nasłuchiwanie bazy Firestore w czasie rzeczywistym ---- */
  listenToUserDoc(uid) {
    if (!this.db) return;
    this.detachUserDoc();

    this.setStatus('syncing');
    const docRef = this.db.collection('users').doc(uid);

    this.unsubscribeSnapshot = docRef.onSnapshot(docSnap => {
      if (docSnap.exists) {
        const cloudData = docSnap.data();
        if (cloudData && Array.isArray(cloudData.tasks)) {
          const localUpdated = Store.state?.updatedAt || 0;
          const cloudUpdated = cloudData.updatedAt || 0;

          // Jeśli w chmurze jest nowsza wersja lub lokalnie nie mamy zadań, pobierz
          const localTaskCount = Store.state?.tasks?.length || 0;
          if (cloudUpdated > localUpdated || localTaskCount === 0) {
            this.isRemoteChange = true;
            Store.state = cloudData;
            if (!Array.isArray(Store.state.completedDays)) Store.state.completedDays = [];
            Store.persist(true, false); // zapisz lokalnie, nie odsyłaj echa do chmury
            this.isRemoteChange = false;
            this.setStatus('synced');
          } else {
            this.setStatus('synced');
          }
        }
      } else {
        // Pierwsze logowanie użytkownika: wyślij aktualny stan do chmury
        this.pushToCloud(true);
      }
    }, err => {
      console.error('Błąd Firestore onSnapshot:', err);
      this.setStatus('error');
      App.showToast('Uwaga: Błąd synchronizacji Firestore (sprawdź reguły bazy).');
    });
  },

  detachUserDoc() {
    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
      this.unsubscribeSnapshot = null;
    }
    this.setStatus('idle');
  },

  /* ---- Zapis do chmury z debouncem (800ms) ---- */
  pushToCloud(immediate = false) {
    if (!this.user || !this.db || this.isRemoteChange) return;

    if (this.saveTimer) clearTimeout(this.saveTimer);

    const executePush = async () => {
      try {
        this.setStatus('saving');
        const docRef = this.db.collection('users').doc(this.user.uid);
        const payload = JSON.parse(JSON.stringify(Store.state));
        payload.updatedAt = Date.now();
        await docRef.set(payload, { merge: true });
        this.setStatus('synced');
      } catch (err) {
        console.error('Błąd zapisu do Firestore:', err);
        this.setStatus('error');
      }
    };

    if (immediate) {
      executePush();
    } else {
      this.setStatus('saving');
      this.saveTimer = setTimeout(executePush, 800);
    }
  },

  /* ---- Metody Logowania ---- */
  async loginWithGoogle() {
    if (!this.auth) {
      alert('Firebase nie jest zainicjalizowany.');
      return;
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      await this.auth.signInWithPopup(provider);
      App.closeModal();
      App.showToast('Zalogowano pomyślnie przez konto Google!');
    } catch (err) {
      console.warn('Popup nie powiódł się, próba przekierowania:', err);
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
        try {
          await this.auth.signInWithRedirect(provider);
        } catch (e2) {
          alert('Błąd logowania Google: ' + e2.message);
        }
      } else {
        alert('Błąd logowania Google: ' + err.message);
      }
    }
  },

  async loginWithEmail(email, password) {
    if (!this.auth) return;
    try {
      await this.auth.signInWithEmailAndPassword(email, password);
      App.closeModal();
      App.showToast('Zalogowano pomyślnie!');
    } catch (err) {
      // Jeśli użytkownik nie istnieje, spróbuj zarejestrować
      if (err.code === 'auth/user-not-found') {
        try {
          await this.auth.createUserWithEmailAndPassword(email, password);
          App.closeModal();
          App.showToast('Konto utworzone i zalogowano!');
          return;
        } catch (regErr) {
          alert('Błąd rejestracji: ' + regErr.message);
          return;
        }
      }
      alert('Błąd logowania: ' + err.message);
    }
  },

  async registerWithEmail(email, password) {
    if (!this.auth) return;
    try {
      await this.auth.createUserWithEmailAndPassword(email, password);
      App.closeModal();
      App.showToast('Konto utworzone i zalogowano!');
    } catch (err) {
      alert('Błąd rejestracji: ' + err.message);
    }
  },

  async logout() {
    if (!this.auth) return;
    try {
      await this.auth.signOut();
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

      root.innerHTML = `
        <div class="modal-backdrop" onclick="if(event.target===this) App.closeModal()">
          <div class="modal" style="max-width:440px;">
            <div class="modal-header">
              <h2>Synchronizacja w Chmurze</h2>
              <button class="icon-circle-btn" onclick="App.closeModal()">✕</button>
            </div>

            <div style="display:flex; flex-direction:column; gap:16px;">
              <div style="display:flex; align-items:center; gap:14px; padding:16px; background:var(--surface-alt); border-radius:var(--radius-md);">
                ${photo ? `<img src="${photo}" style="width:48px; height:48px; border-radius:50%; object-fit:cover;">` : `<div style="width:48px; height:48px; border-radius:50%; background:var(--accent); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:1.2rem;">${(name[0]||'U').toUpperCase()}</div>`}
                <div style="flex:1; min-width:0;">
                  <div style="font-weight:700; font-size:0.96rem; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
                  <div style="font-size:0.8rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${email}</div>
                </div>
              </div>

              <div style="padding:14px; background:var(--surface-alt); border-radius:var(--radius-md);">
                <div style="font-size:0.85rem; font-weight:700; margin-bottom:6px;">Status połączenia:</div>
                <div id="syncModalStatusLabel" style="font-size:0.82rem; color:var(--text-main); font-weight:600;">
                  ${this.status === 'synced' ? '🟢 Dane zsynchronizowane w czasie rzeczywistym' : this.status === 'saving' ? '🟡 Zapisywanie zmian...' : '⚪ Połączono'}
                </div>
                <p style="font-size:0.78rem; color:var(--text-muted); margin-top:6px;">
                  Każda zmiana na komputerze jest natychmiast widoczna na telefonie i odwrotnie.
                </p>
              </div>

              <div style="display:flex; gap:10px;">
                <button class="header-action-btn btn-primary" style="flex:1; justify-content:center;" onclick="Sync.pushToCloud(true); App.showToast('Wymuszono synchronizację!');">
                  🔄 Synchronizuj teraz
                </button>
                <button class="header-action-btn" style="flex:1; justify-content:center; color:var(--crimson);" onclick="Sync.logout()">
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
                <input type="email" name="email" placeholder="Twój adres e-mail" required style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--surface); color:var(--text-main); font-size:0.86rem; outline:none;">
                <input type="password" name="pass" placeholder="Hasło (min. 6 znaków)" required minlength="6" style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--surface); color:var(--text-main); font-size:0.86rem; outline:none;">
                <div style="display:flex; gap:8px; margin-top:4px;">
                  <button type="submit" class="header-action-btn btn-primary" style="flex:1; justify-content:center;">Zaloguj się</button>
                  <button type="button" class="header-action-btn" style="flex:1; justify-content:center;" onclick="const f=this.form; if(f.checkValidity()){ Sync.registerWithEmail(f.email.value, f.pass.value); } else { f.reportValidity(); }">Zarejestruj się</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      `;
    }
  }
};
