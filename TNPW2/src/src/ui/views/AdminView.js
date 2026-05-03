import { createSection } from '../builder/components/section.js';
import { createTitle } from '../builder/components/title.js';
import { createText } from '../builder/components/text.js';
import { addActionButton } from '../builder/components/button.js';
import { createElement } from '../builder/createElement.js';

function formatDate(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('cs-CZ');
}

function formatDateTime(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' });
}

// ---------------------------------------------------------------------------
// Sekce 1 – Platby čekající na schválení
// ---------------------------------------------------------------------------
function buildPendingPaymentsSection(pendingPayments, onApprovePayment, onRejectPayment) {
  const section = createElement('div', { className: 'mb-20' });
  section.appendChild(createTitle(2, 'Platby čekající na schválení'));

  if (pendingPayments.length === 0) {
    section.appendChild(createText(['Žádné platby čekají na schválení.'], 'text-muted'));
    return section;
  }

  section.appendChild(createElement('p', { className: 'mb-10' }, [
    'Čeká na schválení: ',
    createElement('span', { className: 'badge bg-warning text-dark' }, [String(pendingPayments.length)]),
  ]));

  const table = createElement('table', { className: 'table table-bordered mt-10' });
  const thead = createElement('thead', { className: 'table-dark' });
  const headerRow = createElement('tr');
  ['Jméno', 'Příjmení', 'Částka', 'Typ', 'Datum', 'Akce'].forEach((text) =>
    headerRow.appendChild(createElement('th', {}, [text])),
  );
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = createElement('tbody');
  pendingPayments.forEach((platba) => {
    const row = createElement('tr');
    [
      platba.member_name ?? '–',
      platba.member_surname ?? '–',
      platba.amount != null ? `${platba.amount} Kč` : '–',
      platba.payment_type ?? '–',
      formatDate(platba.date),
    ].forEach((text) => row.appendChild(createElement('td', {}, [text])));

    const tdAkce = createElement('td');
    if (onApprovePayment) {
      tdAkce.appendChild(addActionButton(
        () => onApprovePayment(platba.payment_id),
        'Schválit',
        'button--primary btn-sm me-5',
      ));
    }
    if (onRejectPayment) {
      tdAkce.appendChild(addActionButton(
        () => onRejectPayment(platba.payment_id),
        'Zamítnout',
        'button--danger btn-sm',
      ));
    }
    row.appendChild(tdAkce);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  section.appendChild(table);
  return section;
}

// ---------------------------------------------------------------------------
// Sekce 2 – Členové bez aktivní permanentky
// ---------------------------------------------------------------------------
function buildMembersNoMembershipSection(members, onShowMemberDetail) {
  const section = createElement('div', { className: 'mb-20' });
  section.appendChild(createTitle(2, 'Členové bez aktivní permanentky'));

  if (members.length === 0) {
    section.appendChild(createText(['Všichni členové mají aktivní permanentku.'], 'text-muted'));
    return section;
  }

  section.appendChild(createElement('p', { className: 'text-muted mb-10' }, [
    `Celkem: ${members.length} člen${members.length === 1 ? '' : 'ů'}`,
  ]));

  const table = createElement('table', { className: 'table table-bordered' });
  const thead = createElement('thead', { className: 'table-dark' });
  const headerRow = createElement('tr');
  ['Jméno', 'Příjmení', 'Email', 'Kredit', 'Poslední permanentka', 'Detail'].forEach((text) =>
    headerRow.appendChild(createElement('th', {}, [text])),
  );
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = createElement('tbody');
  members.forEach((m) => {
    const row = createElement('tr');
    [
      m.name ?? '–',
      m.surname ?? '–',
      m.email ?? '–',
      `${m.credit_balance ?? 0} Kč`,
      m.last_membership_expiry ? formatDate(m.last_membership_expiry) : 'Nikdy',
    ].forEach((text) => row.appendChild(createElement('td', {}, [text])));

    const tdDetail = createElement('td');
    if (onShowMemberDetail) {
      tdDetail.appendChild(addActionButton(
        () => onShowMemberDetail(m.member_id),
        'Detail',
        'button--secondary btn-sm',
      ));
    }
    row.appendChild(tdDetail);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  section.appendChild(table);
  return section;
}

// ---------------------------------------------------------------------------
// Sekce 3 – Detail vybraného člena (fn_get_member_details_json)
// ---------------------------------------------------------------------------
function buildMemberDetailCard(detail, onHideMemberDetail) {
  if (!detail) return null;

  const card = createElement('div', { className: 'card mb-20 border-info' });
  const cardBody = createElement('div', { className: 'card-body' });

  cardBody.appendChild(createTitle(3, `Detail člena: ${detail.name ?? ''} ${detail.surname ?? ''}`));

  const rows = [
    ['Email', detail.email ?? '–'],
    ['Telefon', detail.phone_number ?? '–'],
    ['Role', detail.role ?? '–'],
    ['Kreditový zůstatek', `${detail.credit_balance ?? 0} Kč`],
  ];

  const dl = createElement('dl', { className: 'row mb-10' });
  rows.forEach(([label, value]) => {
    dl.appendChild(createElement('dt', { className: 'col-sm-3' }, [label]));
    dl.appendChild(createElement('dd', { className: 'col-sm-9' }, [value]));
  });
  cardBody.appendChild(dl);

  if (onHideMemberDetail) {
    cardBody.appendChild(addActionButton(onHideMemberDetail, 'Zavřít', 'button--secondary btn-sm'));
  }

  card.appendChild(cardBody);
  return card;
}

// ---------------------------------------------------------------------------
// Sekce 4 – Statistiky trenérů
// ---------------------------------------------------------------------------
function buildTrainerStatsSection(stats) {
  const section = createElement('div', { className: 'mb-20' });
  section.appendChild(createTitle(2, 'Statistiky trenérů'));

  if (stats.length === 0) {
    section.appendChild(createText(['Žádní trenéři nenalezeni.'], 'text-muted'));
    return section;
  }

  const table = createElement('table', { className: 'table table-bordered' });
  const thead = createElement('thead', { className: 'table-dark' });
  const headerRow = createElement('tr');
  ['Trenér', 'Počet lekcí', 'Celkem rezervací', 'Reálná docházka'].forEach((text) =>
    headerRow.appendChild(createElement('th', {}, [text])),
  );
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = createElement('tbody');
  stats.forEach((t) => {
    const row = createElement('tr');
    [
      `${t.name} ${t.surname}`,
      String(t.total_lessons ?? 0),
      String(t.total_reservations ?? 0),
      String(t.attended_count ?? 0),
    ].forEach((text) => row.appendChild(createElement('td', {}, [text])));
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  section.appendChild(table);
  return section;
}

// ---------------------------------------------------------------------------
// Sekce 5 – Kapacita lekcí (v_schedule_with_capacity)
// ---------------------------------------------------------------------------
function buildScheduleCapacitySection(items) {
  const section = createElement('div', { className: 'mb-20' });
  section.appendChild(createTitle(2, 'Obsazenost lekcí'));

  if (items.length === 0) {
    section.appendChild(createText(['Žádné lekce v rozvrhu.'], 'text-muted'));
    return section;
  }

  const table = createElement('table', { className: 'table table-bordered table-sm' });
  const thead = createElement('thead', { className: 'table-dark' });
  const headerRow = createElement('tr');
  ['Lekce', 'Začátek', 'Kapacita', 'Obsazeno', 'Volno'].forEach((text) =>
    headerRow.appendChild(createElement('th', {}, [text])),
  );
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = createElement('tbody');
  items.forEach((item) => {
    const row = createElement('tr');
    const free = item.free_slots ?? 0;
    const max = item.maximum_capacity ?? 1;
    const fillRatio = (item.occupied_slots ?? 0) / max;

    const freeClass = fillRatio >= 1
      ? 'text-danger fw-bold'
      : fillRatio >= 0.75
        ? 'text-warning fw-bold'
        : 'text-success';

    [
      item.lesson_name ?? '–',
      formatDateTime(item.start_time),
      String(max),
      String(item.occupied_slots ?? 0),
    ].forEach((text) => row.appendChild(createElement('td', {}, [text])));

    const tdFree = createElement('td', { className: freeClass }, [String(free)]);
    row.appendChild(tdFree);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  section.appendChild(table);
  return section;
}

// ---------------------------------------------------------------------------
// Sekce 6 – Správa (pr_close_monthly_billing + pr_archive_inactive_members)
// ---------------------------------------------------------------------------
function buildMaintenanceSection(onCloseBilling, onArchiveMembers) {
  const section = createElement('div', { className: 'mb-20' });
  section.appendChild(createTitle(2, 'Správa dat'));
  section.appendChild(createElement('p', { className: 'text-muted mb-10' }, [
    'Tyto operace volají databázové procedury a mění data napříč systémem.',
  ]));

  const btnRow = createElement('div', { className: 'd-flex gap-10' });

  if (onCloseBilling) {
    btnRow.appendChild(addActionButton(
      onCloseBilling,
      'Uzavřít měsíční vyúčtování',
      'button--warning',
    ));
  }
  if (onArchiveMembers) {
    btnRow.appendChild(addActionButton(
      onArchiveMembers,
      'Archivovat neaktivní členy',
      'button--secondary',
    ));
  }

  section.appendChild(btnRow);
  return section;
}

// ---------------------------------------------------------------------------
// Hlavní view
// ---------------------------------------------------------------------------
export function AdminView({ viewState, handlers }) {
  const {
    pendingPayments,
    membersNoMembership,
    trainerStats,
    scheduleCapacity,
    selectedMemberDetail,
  } = viewState;

  const {
    onGoToReservations,
    onApprovePayment,
    onRejectPayment,
    onCloseBilling,
    onArchiveMembers,
    onShowMemberDetail,
    onHideMemberDetail,
  } = handlers;

  const container = createSection('container mt-15');
  container.appendChild(createTitle(1, 'Admin panel'));

  if (onGoToReservations) {
    container.appendChild(addActionButton(onGoToReservations, '← Zpět na rezervace', 'button--success mb-15'));
  }

  container.appendChild(buildMaintenanceSection(onCloseBilling, onArchiveMembers));
  container.appendChild(createElement('hr'));

  container.appendChild(buildPendingPaymentsSection(pendingPayments, onApprovePayment, onRejectPayment));
  container.appendChild(createElement('hr'));

  container.appendChild(buildMembersNoMembershipSection(membersNoMembership ?? [], onShowMemberDetail));

  const detailCard = buildMemberDetailCard(selectedMemberDetail, onHideMemberDetail);
  if (detailCard) container.appendChild(detailCard);

  container.appendChild(createElement('hr'));
  container.appendChild(buildTrainerStatsSection(trainerStats ?? []));
  container.appendChild(createElement('hr'));
  container.appendChild(buildScheduleCapacitySection(scheduleCapacity ?? []));

  return container;
}
