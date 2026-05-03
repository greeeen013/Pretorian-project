import { createSection } from '../builder/components/section.js';
import { createTitle } from '../builder/components/title.js';
import { createText } from '../builder/components/text.js';
import { createDiv } from '../builder/components/div.js';
import { addActionButton } from '../builder/components/button.js';
import { createElement } from '../builder/createElement.js';

function stavLabel(r) {
  if (r.status === 'CREATED' || r.status === 'CONFIRMED') {
    if (r.lesson_start_time) {
      const now = new Date();
      const start = new Date(r.lesson_start_time);
      const durationMin = r.lesson_duration ?? 60;
      const end = new Date(start.getTime() + durationMin * 60000);
      if (now >= start && now <= end) {
        return 'Probíhá';
      } else if (now > end) {
        return 'Proběhlo';
      }
    }
    return 'Zarezervováno';
  }
  const m = { CANCELLED: 'Zrušená lekce', ATTENDED: 'Absolvována', UNENROLLED: 'Odhlášeno' };
  return m[r.status] ?? r.status;
}

function stavBadgeClass(r) {
  if (r.status === 'CREATED' || r.status === 'CONFIRMED') {
    if (r.lesson_start_time) {
      const now = new Date();
      const start = new Date(r.lesson_start_time);
      const durationMin = r.lesson_duration ?? 60;
      const end = new Date(start.getTime() + durationMin * 60000);
      if (now >= start && now <= end) {
        return 'info';
      } else if (now > end) {
        return 'completed';
      }
    }
    return 'open';
  }
  if (r.status === 'CANCELLED') return 'cancelled';
  if (r.status === 'UNENROLLED') return 'unenrolled';
  return 'completed';
}

function formatTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' });
}

export function ReservationListView({ viewState, handlers }) {
  const { rezervace, zustatek, reservationCapabilities = [] } = viewState;
  const { onGoToPayments, onGoToProfile, onGoToLessons, reservationHandlers = [] } = handlers;

  const container = createSection('container mt-15');

  container.appendChild(createTitle(1, 'Pretorian MMA – Rezervace'));

  // Kreditový zůstatek
  const balanceDiv = createDiv('credit-balance mb-15');
  const balanceText = createElement('span', { className: 'lead fw-semibold' }, [
    `Kreditový zůstatek: ${zustatek ?? '…'} Kč`,
  ]);
  balanceDiv.appendChild(balanceText);
  container.appendChild(balanceDiv);

  // Navigační tlačítka
  const navRow = createDiv('mb-15');
  if (onGoToPayments) navRow.appendChild(addActionButton(onGoToPayments, 'Dobít kredity', 'button--success me-5'));
  if (onGoToProfile)  navRow.appendChild(addActionButton(onGoToProfile,  'Můj profil', 'button--primary me-5'));
  if (onGoToLessons)  navRow.appendChild(addActionButton(onGoToLessons,  'Přehled lekcí', 'button--primary'));
  container.appendChild(navRow);

  if (!rezervace || rezervace.length === 0) {
    container.appendChild(createText(['Žádné rezervace. Přihlaste se na lekci v přehledu lekcí.'], 'text-muted'));
    return container;
  }

  const now = new Date();
  const isPast = (r) => {
    if (!r.lesson_start_time) return false;
    const start = new Date(r.lesson_start_time);
    const end = new Date(start.getTime() + (r.lesson_duration ?? 60) * 60000);
    return now > end;
  };

  // Aktivní (budoucí a probíhající) a historické (proběhlé, zrušené, absolvované) rezervace odděleně
  const aktivni = rezervace.filter((r) => (r.status === 'CREATED' || r.status === 'CONFIRMED') && !isPast(r));
  const ostatni = rezervace.filter((r) => (r.status !== 'CREATED' && r.status !== 'CONFIRMED') || isPast(r));

  function renderKarty(seznam) {
    const sekce = createSection('cards');
    seznam.forEach((r, idx) => {
      const rh = reservationHandlers[rezervace.indexOf(r)] ?? {};

      const nazev = r.lesson_name ?? 'Neznámá lekce';
      const cas = formatTime(r.lesson_start_time);
      const datumRez = formatTime(r.timestamp_creation);

      const karta = createDiv(`card mb-10 p-15 ${r.status === 'CANCELLED' ? 'card--cancelled' : ''}`);

      // Záhlaví: název + status badge
      const hlavicka = createDiv('lesson-card__header mb-5');
      const nadpis = createElement('h3', { className: 'lesson-card__title mb-0' }, [nazev]);
      const badge = createElement('span', {
        className: `lesson-card__badge badge--${stavBadgeClass(r)}`,
      }, [stavLabel(r)]);
      hlavicka.appendChild(nadpis);
      hlavicka.appendChild(badge);
      karta.appendChild(hlavicka);

      if (cas) {
        karta.appendChild(createElement('p', { className: 'text-muted mb-5' }, [`Začátek lekce: ${cas}`]));
      }
      if (datumRez) {
        karta.appendChild(createElement('p', { className: 'text-muted mb-5' }, [`Rezervováno: ${datumRez}`]));
      }
      if (r.note) {
        karta.appendChild(createElement('p', { className: 'text-muted mb-5' }, [`Poznámka: ${r.note}`]));
      }

      // Akční tlačítka
      const akce = createDiv('lesson-card__actions mt-10');
      if (rh.onDetail) {
        akce.appendChild(addActionButton(rh.onDetail, 'Detail lekce', 'button--secondary me-5'));
      }
      if (rh.onCancel) {
        akce.appendChild(addActionButton(
          () => rh.onCancel(r.reservation_id),
          'Zrušit',
          'button--danger',
        ));
      }
      if (akce.childNodes.length > 0) karta.appendChild(akce);

      sekce.appendChild(karta);
    });
    return sekce;
  }

  if (aktivni.length > 0) {
    container.appendChild(createTitle(2, 'Moje přihlášky'));
    container.appendChild(renderKarty(aktivni));
  }

  if (ostatni.length > 0) {
    container.appendChild(createTitle(2, 'Historie'));
    container.appendChild(renderKarty(ostatni));
  }

  return container;
}
