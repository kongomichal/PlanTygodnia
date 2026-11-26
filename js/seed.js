'use strict';

const Seed = {
  DEFAULT_GOALS: {
    r1: {
      weekly: '7 spacerów po min. 30 min (ok. 3 km każdy) do niedzieli',
      quarterly: 'Zrealizować min. 75 spacerów po 30 min i 24 treningi w tym kwartale'
    },
    r2: {
      weekly: '7 wpisów w dzienniku + oddać 1 gotowy projekt na studia do niedzieli',
      quarterly: 'Zaliczyć 100% przedmiotów w semestrze w 1. terminie i przeczytać 3 książki'
    },
    r3: {
      weekly: 'Min. 3 wieczory po 2h z bliskimi bez telefonu w tym tygodniu',
      quarterly: 'Zorganizować 6 wspólnych wyjść/wyjazdów z bliskimi w tym kwartale'
    },
    r4: {
      weekly: 'Opłacić 100% faktur w terminie i wysłać 5 ofert na strony WWW do piątku',
      quarterly: 'Pozyskać 3 nowe zlecenia na strony WWW i domknąć 100% rozliczeń KSeF w terminie'
    }
  },

  isDefaultGoalText(val) {
    const t = String(val || '').trim();
    if (!t) return false;
    for (const rId of Object.keys(this.DEFAULT_GOALS)) {
      if (this.DEFAULT_GOALS[rId].weekly === t || this.DEFAULT_GOALS[rId].quarterly === t) return true;
    }
    return false;
  },

  build() {
    const year = 2026;
    return {
      version: 2,
      _isSeedOnly: true,
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
        2026: JSON.parse(JSON.stringify(this.DEFAULT_GOALS))
      },
      quickNote: '',
      quickNotePos: 'below',
      tasks: [],
      later: [],
      laterFolders: [],
      reminders: [],
      saw: [
        { id: 's1', title: '🚶‍♂️ Wyjście na spacer', roleId: 'r1', q: 2, activeDays: [0, 1, 2, 3, 4, 5, 6], doneDays: [], spawnedDates: [], dismissedDays: [], createdAt: 1, updatedAt: 1 },
        { id: 's2', title: '📓 Pisanie dziennika', roleId: 'r2', q: 2, activeDays: [0, 1, 2, 3, 4, 5, 6], doneDays: [], spawnedDates: [], dismissedDays: [], createdAt: 1, updatedAt: 1 },
        { id: 's3', title: '🧭 Planowanie tygodnia i przegląd celów', roleId: 'r2', q: 2, activeDays: [0], doneDays: [], spawnedDates: [], dismissedDays: [], createdAt: 1, updatedAt: 1 },
        { id: 's4', title: '📊 Rozliczenia, faktury i KSeF', roleId: 'r4', q: 2, activeDays: [4], doneDays: [], spawnedDates: [], dismissedDays: [], createdAt: 1, updatedAt: 1 }
      ],
      affirmations: [
        { id: 'af1', text: 'Jestem spokojny, pewny siebie i mówię otwarcie to, co myślę.', createdAt: 1, updatedAt: 1 },
        { id: 'af2', text: 'Każdego dnia skupiam się na rzeczach ważnych (Ćwiartka II).', createdAt: 1, updatedAt: 1 }
      ],
      quotes: [
        { id: 'q1', text: 'Najważniejsze jest to, aby najważniejsze rzeczy pozostały najważniejsze. — S. Covey', createdAt: 1, updatedAt: 1 },
        { id: 'q2', text: 'Nie jestem produktem okoliczności, jestem produktem moich decyzji. — S. Covey', createdAt: 1, updatedAt: 1 }
      ],
      archive: [],
      goalsArchive: [],
      fieldStamps: {},
      deleted: {},
      createdAt: 1,
      updatedAt: 0
    };
  }
};

window.Seed = Seed;
