'use strict';

const Seed = {
  build() {
    const year = 2026;
    return {
      version: 2,
      year,
      theme: 'light',
      iconIdx: 0,
      rules: [
        'Najpierw wykonuję najważniejsze zadanie dnia (Ćwiartka II), zanim przejdę do bieżączki.',
        'Dbam o 4 nogi stołu: Ciało (spacer), Umysł (dziennik), Relacje i Pracę.',
        'Wchodzę wszędzie ze spokojem i pewnością siebie — mówię otwarcie, co myślę.'
      ],
      roles: [
        { id: 'r1', emoji: '🫀', name: 'Ciało & Zdrowie', color: '#10b981' },
        { id: 'r2', emoji: '🧠', name: 'Umysł & Studia', color: '#7c3aed' },
        { id: 'r3', emoji: '🤝', name: 'Relacje & Bliscy', color: '#f59e0b' },
        { id: 'r4', emoji: '💼', name: 'Praca & Finanse', color: '#2563eb' }
      ],
      goals: {
        2026: {
          r1: { weekly: 'Codzienny spacer min. 30 min', monthly: '25 dni ruchu w miesiącu', quarterly: 'Dobra kondycja i stały rytm snu', yearly: 'Wysoka energia i zdrowie przez cały rok' },
          r2: { weekly: 'Prowadzić dziennik + nauka', monthly: 'Przeczytać 1 książkę', quarterly: 'Zaliczyć semestr bez zaległości', yearly: 'Rozwój osobisty i pewność siebie' },
          r3: { weekly: 'Wartościowy czas z bliskimi', monthly: 'Wspólny wyjazd / wyjście', quarterly: 'Pogłębienie relacji rodzinnych', yearly: 'Silne, wspierające relacje' },
          r4: { weekly: 'Domknąć najważniejsze sprawy w pracy', monthly: 'Uporządkować sprawy finansowe', quarterly: 'Rozwinąć główne projekty', yearly: 'Stabilny wzrost finansowy' }
        }
      },
      tasks: [],
      later: [],
      reminders: [],
      saw: [
        { id: 's1', title: '🚶‍♂️ Wyjście na spacer', roleId: 'r1', q: 2, cycleKey: 'daily', cycle: 'Codziennie', doneDays: [] },
        { id: 's2', title: '📓 Pisanie dziennika', roleId: 'r2', q: 2, cycleKey: 'daily', cycle: 'Codziennie', doneDays: [] },
        { id: 's3', title: '🧭 Planowanie tygodnia i przegląd celów', roleId: 'r2', q: 2, cycleKey: 'weekly_0', cycle: 'Co tydzień (Poniedziałek)', doneDays: [] },
        { id: 's4', title: '📊 Rozliczenia, faktury i KSeF', roleId: 'r4', q: 2, cycleKey: 'monthly_10', cycle: 'Co miesiąc (10. dzień)', doneDays: [] }
      ],
      affirmations: [
        { id: 'af1', text: 'Jestem spokojny, pewny siebie i mówię otwarcie to, co myślę.' },
        { id: 'af2', text: 'Każdego dnia skupiam się na rzeczach ważnych (Ćwiartka II).' }
      ],
      quotes: [
        { id: 'q1', text: 'Najważniejsze jest to, aby najważniejsze rzeczy pozostały najważniejsze. — S. Covey' },
        { id: 'q2', text: 'Nie jestem produktem okoliczności, jestem produktem moich decyzji. — S. Covey' }
      ],
      archive: [],
      fieldStamps: {},
      deleted: {},
      createdAt: Date.now(),
      updatedAt: 0
    };
  }
};

window.Seed = Seed;
