// LessonListView – seznam nebo rozvrh lekcí.
// handlers: onGoToReservations, onCreateLesson, onSetFilter, onSetTariffFilter,
//           onSetViewMode, lessonHandlers[]

import { createSection } from '../builder/components/section.js';
import { createTitle } from '../builder/components/title.js';
import { createText } from '../builder/components/text.js';
import { createDiv } from '../builder/components/div.js';
import { addActionButton } from '../builder/components/button.js';
import { createLessonCard } from '../builder/components/lessonCard.js';
import { LessonScheduleView } from './LessonScheduleView.js';

export function LessonListView({ viewState, handlers }) {
  const {
    lekce,
    lessonCapabilities = [],
    capabilities = {},
    lessonFilter = 'ALL',
    lessonTariffFilter = null,
    lessonViewMode = 'list',
    availableTariffFilters = [],
  } = viewState;

  const {
    onGoToReservations,
    onCreateLesson,
    onSetFilter,
    onSetTariffFilter,
    onSetViewMode,
    lessonHandlers = [],
  } = handlers;

  const container = createSection('container mt-15');
  container.appendChild(createTitle(1, 'Pretorian MMA – Lekce'));

  // ---- Tlačítka nahoře ------------------------------------------------
  const headerActions = createDiv('header-actions mb-15', []);

  if (onGoToReservations) {
    headerActions.appendChild(
      addActionButton(onGoToReservations, '← Zpět na rezervace', 'button--success me-5'),
    );
  }
  if (onCreateLesson) {
    headerActions.appendChild(
      addActionButton(onCreateLesson, '+ Vytvořit lekci', 'button--primary me-5'),
    );
  }

  // Přepínač seznam / rozvrh
  const viewToggle = createDiv('view-toggle-group me-5', []);
  const btnList = addActionButton(
    () => onSetViewMode?.('list'),
    '☰ Seznam',
    `button--secondary btn-sm${lessonViewMode === 'list' ? ' active' : ''}`,
  );
  const btnSchedule = addActionButton(
    () => onSetViewMode?.('schedule'),
    '📅 Rozvrh',
    `button--secondary btn-sm${lessonViewMode === 'schedule' ? ' active' : ''}`,
  );
  viewToggle.appendChild(btnList);
  viewToggle.appendChild(btnSchedule);
  headerActions.appendChild(viewToggle);

  container.appendChild(headerActions);

  // ---- Řádek s filtry (status vlevo, permanentka vpravo) --------------
  const filtersBar = createDiv('filters-bar mb-10', []);

  // Status tlačítka (vlevo)
  const statusGroup = createDiv('', []);
  const statusFilters = [
    { key: 'ALL',       label: 'Vše' },
    { key: 'OPEN',      label: 'Otevřené' },
    { key: 'COMPLETED', label: 'Dokončené' },
    ...(capabilities.canCreateLesson ? [{ key: 'MINE', label: 'Moje lekce' }] : []),
  ];
  statusFilters.forEach(({ key, label }) => {
    statusGroup.appendChild(
      addActionButton(
        () => onSetFilter?.(key),
        label,
        `button--secondary btn-sm me-5${lessonFilter === key ? ' active' : ''}`,
      ),
    );
  });
  filtersBar.appendChild(statusGroup);

  // Dropdown permanentky (vpravo)
  if (availableTariffFilters.length > 0) {
    const tariffGroup = createDiv('tariff-filter-group', []);

    const lbl = document.createElement('label');
    lbl.className = 'tariff-filter-label';
    lbl.textContent = 'Filtr:';
    tariffGroup.appendChild(lbl);

    const sel = document.createElement('select');
    sel.className = 'tariff-filter-select form-select form-select-sm';

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Všechny typy';
    sel.appendChild(defaultOpt);

    availableTariffFilters.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = String(t.tariff_id);
      opt.textContent = t.name;
      if (lessonTariffFilter === t.tariff_id) opt.selected = true;
      sel.appendChild(opt);
    });

    sel.addEventListener('change', () => {
      const val = sel.value === '' ? null : parseInt(sel.value, 10);
      onSetTariffFilter?.(val);
    });

    tariffGroup.appendChild(sel);
    filtersBar.appendChild(tariffGroup);
  }

  container.appendChild(filtersBar);

  // ---- Obsah ----------------------------------------------------------
  if (!lekce || lekce.length === 0) {
    container.appendChild(createText(['Žádné lekce.'], 'text-muted'));
    return container;
  }

  if (lessonViewMode === 'schedule') {
    // Rozvrh – state pro navigaci týdnem je uložen lokálně
    let weekOffset = 0;

    const scheduleContainer = createDiv('', []);

    const renderSchedule = () => {
      scheduleContainer.replaceChildren();
      scheduleContainer.appendChild(LessonScheduleView({
        lekce,
        lessonCapabilities,
        lessonHandlers,
        weekOffset,
        onPrevWeek: () => { weekOffset -= 1; renderSchedule(); },
        onNextWeek: () => { weekOffset += 1; renderSchedule(); },
      }));
    };
    renderSchedule();
    container.appendChild(scheduleContainer);
  } else {
    // Seznam karet
    const karty = createSection('cards');
    lekce.forEach((l, idx) => {
      const caps = lessonCapabilities[idx] ?? {};
      const lh   = lessonHandlers[idx] ?? {};
      const lessonId = l.lesson_schedule_id ?? l.lesson_id;
      karty.appendChild(createLessonCard({ lesson: l, lessonId, caps, lh }));
    });
    container.appendChild(karty);
  }

  return container;
}
