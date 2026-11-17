'use strict';

/**
 * Ogólny szablon początkowy aplikacji Plan Tygodnia (bez prywatnych danych w repozytorium GitHub).
 * Wszystkie prywatne zadania, cele, myśli i wpisy użytkownika są zapisywane w Google Firebase Firestore.
 */
const Seed = {
  build() {
    const year = new Date().getFullYear();

    const roles = [
      { id: 'r_body', emoji: '🫀', name: 'Ciało & Zdrowie', color: '#10b981' },
      { id: 'r_mind', emoji: '🧠', name: 'Umysł & Rozwój', color: '#7c3aed' },
      { id: 'r_rel', emoji: '🤝', name: 'Relacje & Bliscy', color: '#f59e0b' },
      { id: 'r_work', emoji: '💼', name: 'Praca & Finanse', color: '#2563eb' }
    ];

    const saw = [
      {
        id: 'saw_walk',
        title: 'Wyjście na spacer',
        freqType: 'daily', // 'daily' | 'weekly' | 'monthly'
        dow: null,
        dayOfMonth: null,
        cycleLabel: 'Codziennie',
        dim: 'Ciało & Zdrowie',
        doneDays: [],
        createdAt: Date.now()
      },
      {
        id: 'saw_journal',
        title: 'Pisanie dziennika',
        freqType: 'daily',
        dow: null,
        dayOfMonth: null,
        cycleLabel: 'Codziennie',
        dim: 'Umysł & Rozwój',
        doneDays: [],
        createdAt: Date.now()
      }
    ];

    return {
      version: 2,
      year,
      theme: 'light',
      roles,
      goals: {
        [year]: {
          r_body: { weekly: '', monthly: '', quarterly: '', yearly: '' },
          r_mind: { weekly: '', monthly: '', quarterly: '', yearly: '' },
          r_rel: { weekly: '', monthly: '', quarterly: '', yearly: '' },
          r_work: { weekly: '', monthly: '', quarterly: '', yearly: '' }
        }
      },
      tasks: [],
      later: [],
      reminders: [],
      saw,
      rules: [],
      affirmations: [],
      quotes: [],
      archive: [],
      fieldStamps: {},
      deleted: {},
      createdAt: Date.now(),
      updatedAt: 0
    };
  }
};

window.Seed = Seed;
