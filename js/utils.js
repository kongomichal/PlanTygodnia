'use strict';

/* ============ Daty (format YYYY-MM-DD, czas lokalny) ============ */
const D = {
  pad: n => String(n).padStart(2, '0'),
  toStr(d) { return `${d.getFullYear()}-${D.pad(d.getMonth() + 1)}-${D.pad(d.getDate())}`; },
  parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); },
  today() { return D.toStr(new Date()); },
  addDays(s, n) { const d = D.parse(s); d.setDate(d.getDate() + n); return D.toStr(d); },
  addMonths(s, n, anchor) {
    const d = D.parse(s);
    const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    const day = anchor === 'last' ? last : (anchor || d.getDate());
    t.setDate(Math.min(day, last));
    return D.toStr(t);
  },
  weekStart(s) { const d = D.parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return D.toStr(d); },
  diff(a, b) { return Math.round((D.parse(a) - D.parse(b)) / 864e5); },
  dow(s) { return (D.parse(s).getDay() + 6) % 7; },
  nextDow(idx, from = D.today()) { let s = D.addDays(from, 1); while (D.dow(s) !== idx) s = D.addDays(s, 1); return s; },
  DOW: ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'],
  DOW_LONG: ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'],
  MON_SHORT: ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'],
  MON_GEN: ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'],
  MON_NOM: ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'],
  short(s) {
    const d = D.parse(s);
    const y = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
    return `${d.getDate()} ${D.MON_SHORT[d.getMonth()]}${y}`;
  },
  long(s) { const d = D.parse(s); return `${D.DOW_LONG[D.dow(s)]}, ${d.getDate()} ${D.MON_GEN[d.getMonth()]}`; },
  human(s) {
    const n = D.diff(s, D.today());
    if (n === 0) return 'Dziś';
    if (n === 1) return 'Jutro';
    if (n === -1) return 'Wczoraj';
    if (n > 1 && n < 7) return cap(D.DOW_LONG[D.dow(s)]);
    return D.short(s);
  },
};

/* ============ Powtarzanie ============ */
const Recur = {
  PRESETS: [
    { key: 'none', label: 'Nie powtarzaj', r: null },
    { key: 'd1', label: 'Codziennie', r: { unit: 'day', every: 1 } },
    { key: 'w1', label: 'Co tydzień', r: { unit: 'week', every: 1 } },
    { key: 'w2', label: 'Co 2 tygodnie', r: { unit: 'week', every: 2 } },
    { key: 'm1', label: 'Co miesiąc', r: { unit: 'month', every: 1 } },
    { key: 'm3', label: 'Co kwartał', r: { unit: 'month', every: 3 } },
    { key: 'm6', label: 'Co pół roku', r: { unit: 'month', every: 6 } },
    { key: 'y1', label: 'Co rok', r: { unit: 'year', every: 1 } },
    { key: 'custom', label: 'Własne…', r: null },
  ],
  GROUPS: ['Codziennie', 'Co tydzień', 'Co miesiąc', 'Kwartał / pół roku', 'Co rok'],
  find(r) { return this.PRESETS.find(p => p.r && p.r.unit === r.unit && p.r.every === (r.every || 1)); },
  presetKey(r) { if (!r) return 'none'; const p = this.find(r); return p ? p.key : 'custom'; },
  next(s, r) {
    const n = r.every || 1;
    switch (r.unit) {
      case 'day': return D.addDays(s, n);
      case 'week': return D.addDays(s, 7 * n);
      case 'month': return D.addMonths(s, n, r.dayOfMonth ?? r.anchor);
      case 'year': return D.addMonths(s, 12 * n, r.dayOfMonth ?? r.anchor);
    }
    return D.addDays(s, 1);
  },
  label(r) {
    if (!r) return '';
    if (r.unit === 'day') return 'Codziennie';
    if (r.unit === 'week') {
      const n = r.every || 1;
      return n === 1 ? 'Co tydzień' : `Co ${n} tyg.`;
    }
    if (r.unit === 'month') {
      const n = r.every || 1;
      const day = r.dayOfMonth === 'last' ? 'ost. dzień' : (r.dayOfMonth ?? r.anchor);
      if (n === 1) {
        return day ? `Co m-c (${day === 'ost. dzień' ? day : `${day}. dzień`})` : 'Co miesiąc';
      }
      return day ? `Co ${n} m-ce (${day === 'ost. dzień' ? day : `${day}. dzień`})` : `Co ${n} m-ce`;
    }
    if (r.unit === 'year') {
      const n = r.every || 1;
      return n === 1 ? 'Co rok' : `Co ${n} lata`;
    }
    const p = this.find(r); if (p) return p.label;
    return 'Cykliczne';
  },
  fullLabel(r, date) {
    if (!r) return 'Jednorazowe';
    if (r.unit === 'day') return 'Codziennie (każdego dnia)';
    const dowEvery = ['W każdy poniedziałek', 'W każdy wtorek', 'W każdą środę', 'W każdy czwartek', 'W każdy piątek', 'W każdą sobotę', 'W każdą niedzielę'];
    if (r.unit === 'week') {
      if (Array.isArray(r.dows) && r.dows.length === 5) return 'Dni robocze (Pon – Pt)';
      if (r.dow != null && dowEvery[r.dow]) return dowEvery[r.dow];
      if ((r.every || 1) === 1) {
        if (date) {
          const dow = D.dow(date);
          if (dowEvery[dow]) return dowEvery[dow];
        }
        return 'Co tydzień';
      }
      if (r.every === 2) return 'Co 2 tygodnie';
    }
    if (r.unit === 'month') {
      const targetDay = r.dayOfMonth ?? r.anchor ?? (date ? D.parse(date).getDate() : null);
      const dayText = targetDay === 'last' ? 'w ostatni dzień miesiąca' : (targetDay ? `${targetDay}. dnia miesiąca` : '');
      if (r.every === 3) return `Co 3 miesiące (Kwartalnie${dayText ? ' · ' + dayText : ''})`;
      if (r.every === 6) return `Co pół roku${dayText ? ' · ' + dayText : ''}`;
      if ((r.every || 1) === 1) return `Co miesiąc${dayText ? ` (${dayText})` : ''}`;
      return `Co ${r.every} mies.${dayText ? ` (${dayText})` : ''}`;
    }
    if (r.unit === 'year') return 'Co rok';
    return this.label(r);
  },
  group(r) {
    if (r.unit === 'day') return 0;
    if (r.unit === 'week') return 1;
    const m = r.unit === 'year' ? r.every * 12 : r.every;
    if (m < 3) return 2;
    if (m < 12) return 3;
    return 4;
  },
  occurrences(t, from, to) {
    const out = []; if (!t.recur || !t.date) return out;
    let d = t.date, g = 0;
    while (d < from && g++ < 2000) d = this.next(d, t.recur);
    while (d <= to && g++ < 2000) { out.push(d); d = this.next(d, t.recur); }
    return out;
  },
  streak(t) {
    const h = new Set(t.history || []);
    let d = D.today(); if (!h.has(d)) d = D.addDays(d, -1);
    let n = 0; while (h.has(d)) { n++; d = D.addDays(d, -1); }
    return n;
  },
  matchesDate(t, dateStr) {
    if (!t.recur) return false;
    if (t.recur.unit === 'day') return true;
    const dow = D.dow(dateStr);
    if (t.recur.unit === 'week') {
      if (Array.isArray(t.recur.dows) && t.recur.dows.includes(dow)) return true;
      if (t.recur.dow != null && t.recur.dow === dow) return true;
      if ((t.recur.every || 1) === 1) {
        if (t.date && D.dow(t.date) === dow) return true;
      } else if (t.date) {
        return this.occurrences(t, dateStr, dateStr).length > 0;
      }
    }
    if (t.date === dateStr) return true;

    // Miesięczne powtarzanie
    if (t.recur.unit === 'month') {
      const d = D.parse(dateStr);
      const curDay = d.getDate();
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

      let targetDay = t.recur.dayOfMonth ?? t.recur.anchor;
      if (targetDay == null && t.date) targetDay = D.parse(t.date).getDate();
      if (targetDay == null) targetDay = 1;

      let isDayMatch = false;
      if (targetDay === 'last') {
        isDayMatch = (curDay === lastDay);
      } else {
        const effTarget = Math.min(Number(targetDay), lastDay);
        isDayMatch = (curDay === effTarget);
      }

      if (!isDayMatch) return false;

      const every = t.recur.every || 1;
      if (every === 1) return true;

      if (!t.date) return true;
      const d0 = D.parse(t.date);
      const mDiff = (d.getFullYear() - d0.getFullYear()) * 12 + (d.getMonth() - d0.getMonth());
      return mDiff >= 0 && mDiff % every === 0;
    }

    // Roczne powtarzanie
    if (t.recur.unit === 'year') {
      const d = D.parse(dateStr);
      const d0 = t.date ? D.parse(t.date) : new Date();
      const isMonthDay = (d.getMonth() === d0.getMonth() && d.getDate() === d0.getDate());
      if (!isMonthDay) return false;
      const yDiff = d.getFullYear() - d0.getFullYear();
      return yDiff >= 0 && yDiff % (t.recur.every || 1) === 0;
    }

    if (t.date) {
      return this.occurrences(t, dateStr, dateStr).length > 0;
    }
    return false;
  },
  isDoneOn(t, dateStr) {
    return Array.isArray(t.history) && t.history.includes(dateStr);
  },
};

/* ============ Tekst ============ */
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s).toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const shortUrl = u => {
  try { const x = new URL(u.replace(/&amp;/g, '&')); const p = x.pathname.length > 18 ? x.pathname.slice(0, 18) + '…' : x.pathname; return esc(x.hostname.replace(/^www\./, '') + p); }
  catch { return u; }
};
const linkify = s => esc(s).replace(/(https?:\/\/[^\s<]+)/g, u => `<a href="${u}" target="_blank" rel="noopener">🔗 ${shortUrl(u)}</a>`);
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ============ Ikony (lucide-style) ============ */
const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  columns: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  compass: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  mountain: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>',
  arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4M12 17h.01"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
};
const icon = (name, size = 18) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

window.D = D;
window.uid = uid;
window.Recur = Recur;
window.esc = esc;
window.cap = cap;
window.icon = icon;
