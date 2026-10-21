'use strict';

/**
 * Szablon początkowy aplikacji Plan Tygodnia.
 * Czysta instalacja bez prywatnych danych – gotowa do użycia i synchronizacji.
 */
const Seed = {
  build() {
    const roles = [
      { id: 'r_saw', emoji: '🛡️', name: 'Zdrowie & Ja', tag: 'zdrowie', color: '#10b981', mission: 'Dbam o ciało, umysł i ducha.' },
      { id: 'r_firm', emoji: '💼', name: 'Praca & Firma', tag: 'praca', color: '#2563eb', mission: 'Działania zawodowe i projekty.' },
      { id: 'r_home', emoji: '🏠', name: 'Dom & Finanse', tag: 'dom', color: '#64748b', mission: 'Sprawy codzienne i organizacja.' },
    ];

    return {
      version: 1,
      roles,
      tasks: [],
      completedDays: [],
      weekGoals: {},
      autoRollover: true,
      lastReview: null,
      createdAt: Date.now()
    };
  },
};
