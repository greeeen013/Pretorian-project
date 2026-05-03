// Selektory pro MMA aplikaci.
//
// Selektory vypočítávají odvozené hodnoty ze stavu a capabilities pro UI.
// Vzor přejat z prepare/selectors.js – odděluje logiku "co zobrazit" od stavu.
//
// IR05: Všechny capabilities jsou počítány čistými funkcemi ze stavu –
// UI pouze čte výsledek, nerozhoduje samo o sobě, co zobrazit.

import * as CONST from '../../constants.js';
import * as STATUS from '../../statuses.js';

// --- Datové selektory ---

export function selectReservations(state) {
  return state.reservations ?? [];
}

export function selectPayments(state) {
  return state.payments ?? [];
}

export function selectLessons(state) {
  return state.lessons ?? [];
}

export function selectCreditBalance(state) {
  return state.creditBalance;
}

// --- Capability selektory – Rezervace ---

export function canConfirmReservation(rezervace) {
  return rezervace.status === 'CREATED';
}

export function canCancelReservation(rezervace) {
  return rezervace.status === 'CREATED' || rezervace.status === 'CONFIRMED';
}

export function hasCredits(state) {
  return (state.creditBalance ?? 0) > 0;
}

export function selectIsAdmin(state) {
  return state.auth.role === 'admin';
}

// --- IR05: Capability selektory – Lekce ---
// Čisté funkce: nemodifikují stav, neinteragují s DOM.
// Role 'trainer' nebo 'admin' = oprávněný lektor.

function isTrainerOrAdmin(state) {
  const role = state.auth?.role;
  return role === 'trainer' || role === 'admin';
}

/**
 * canCreateLesson – trenér/admin může vytvořit novou lekci.
 */
export function canCreateLesson(state) {
  return isTrainerOrAdmin(state);
}

/**
 * canOpenLesson – admin může zveřejnit jakoukoli DRAFT lekci; trenér jen svou vlastní.
 */
export function canOpenLesson(lekce, state) {
  if (lekce.status !== 'DRAFT') return false;
  if (state.auth?.role === 'admin') return true;
  if (state.auth?.role === 'trainer') return isOwnLesson(lekce, state);
  return false;
}

function isOwnLesson(lekce, state) {
  return lekce.employee_id === state.auth?.memberId;
}

/**
 * canCancelLesson – admin může zrušit jakoukoli OPEN/FULL lekci; trenér jen svou vlastní.
 */
export function canCancelLesson(lekce, state) {
  const cancellable = lekce.status === 'OPEN' || lekce.status === 'FULL';
  if (state.auth?.role === 'admin') return cancellable;
  if (state.auth?.role === 'trainer') return cancellable && isOwnLesson(lekce, state);
  return false;
}

/**
 * canCloseLesson – admin může uzavřít jakoukoli OPEN/FULL/IN_PROGRESS lekci; trenér jen svou vlastní.
 */
export function canCloseLesson(lekce, state) {
  const closeable = lekce.status === 'OPEN' || lekce.status === 'FULL' || lekce.status === 'IN_PROGRESS';
  if (state.auth?.role === 'admin') return closeable;
  if (state.auth?.role === 'trainer') return closeable && isOwnLesson(lekce, state);
  return false;
}

/**
 * canSetAttendance – admin může zapsat docházku na jakoukoli COMPLETED lekci; trenér jen svou vlastní.
 */
export function canSetAttendance(lekce, state) {
  if (lekce.status !== 'COMPLETED') return false;
  if (state.auth?.role === 'admin') return true;
  if (state.auth?.role === 'trainer') return isOwnLesson(lekce, state);
  return false;
}

/**
 * canReopenLesson – admin může znovu otevřít jakoukoli lekci; trenér jen svou vlastní.
 * Platí pro stavy COMPLETED, IN_PROGRESS i CANCELLED.
 */
export function canReopenLesson(lekce, state) {
  const reopenable = lekce.status === 'COMPLETED' || lekce.status === 'IN_PROGRESS' || lekce.status === 'CANCELLED';
  if (state.auth?.role === 'admin') return reopenable;
  if (state.auth?.role === 'trainer') return reopenable && isOwnLesson(lekce, state);
  return false;
}

/**
 * isLessonFull – lekce je plná, pokud počet registrovaných dosáhl kapacity.
 */
export function isLessonFull(lekce) {
  const registered = lekce.registered_count ?? lekce.registered_members ?? 0;
  const capacity = lekce.maximum_capacity ?? lekce.maximal_capacity ?? Infinity;
  return registered >= capacity;
}

/**
 * getUserReservationForLesson – najde aktivní rezervaci přihlášeného člena na danou lekci.
 */
function getUserReservationForLesson(state, lessonId) {
  const memberId = state.auth?.memberId;
  if (!memberId) return null;
  return (state.reservations ?? []).find(
    (r) => r.lesson_schedule_id === lessonId &&
           r.member_id === memberId &&
           (r.status === 'CREATED' || r.status === 'CONFIRMED')
  ) ?? null;
}

/**
 * Vrátí ID tarifů chybějících pro přihlášení na lekci, nebo null pokud lekce nemá omezení.
 * Pokud vrátí neprázdné pole, uživatel nemá požadovanou permanentku.
 */
export function getMissingMembershipTariffs(lekce, state) {
  const allowedIds = lekce.allowed_tariff_ids ?? [];
  if (allowedIds.length === 0) return null; // lekce bez omezení
  const memberships = state.memberships ?? [];
  const memberTariffIds = memberships.map((m) => m.tariff_id);
  const missing = allowedIds.filter((id) => !memberTariffIds.includes(id));
  return missing.length < allowedIds.length ? null : missing; // má alespoň jednu → null (OK)
}

/**
 * canEnrollInLesson – člen nebo trenér (na cizí lekci) se může přihlásit na OPEN lekci,
 * pokud ještě nemá aktivní rezervaci. Admin se nepřihlašuje. Trenér se nemůže přihlásit
 * na svou vlastní lekci.
 */
export function canEnrollInLesson(lekce, state) {
  if (state.auth?.role === 'admin') return false;
  if (state.auth?.role === 'trainer' && isOwnLesson(lekce, state)) return false;
  if (lekce.status !== 'OPEN') return false;
  if (isLessonFull(lekce)) return false;
  const lessonId = lekce.lesson_schedule_id ?? lekce.lesson_id;
  if (getUserReservationForLesson(state, lessonId) !== null) return false;
  // Kontrola permanentky – pokud lekce vyžaduje a uživatel nemá → nelze se přihlásit
  const missing = getMissingMembershipTariffs(lekce, state);
  return missing === null; // null = buď bez omezení nebo má platnou permanentku
}

/**
 * canUnenrollFromLesson – člen nebo trenér se může odhlásit, pokud má aktivní rezervaci
 * a lekce ještě nezačala (pouze OPEN nebo FULL).
 * Admin se neodhlašuje.
 */
export function canUnenrollFromLesson(lekce, state) {
  if (state.auth?.role === 'admin') return false;
  if (lekce.status !== 'OPEN' && lekce.status !== 'FULL') return false;
  const lessonId = lekce.lesson_schedule_id ?? lekce.lesson_id;
  return getUserReservationForLesson(state, lessonId) !== null;
}

// --- IR05: Filtrační selektory – Lekce ---

/**
 * selectOpenLessons – vrátí jen lekce se stavem OPEN.
 */
export function selectOpenLessons(state) {
  return selectLessons(state).filter((l) => l.status === 'OPEN');
}

/**
 * selectAvailableLessons – lekce OPEN a zároveň s volnou kapacitou.
 */
export function selectAvailableLessons(state) {
  return selectOpenLessons(state).filter((l) => !isLessonFull(l));
}

/**
 * selectLessonById – najde lekci podle ID.
 */
export function selectLessonById(state, lessonId) {
  return selectLessons(state).find(
    (l) => (l.lesson_schedule_id ?? l.lesson_id) === lessonId,
  ) ?? null;
}

// --- View selektory ---

function enrichWithLesson(reservations, lekce) {
  return reservations.map((r) => {
    const lesson = lekce.find(
      (l) => (l.lesson_schedule_id ?? l.lesson_id) === r.lesson_schedule_id
    );
    return {
      ...r,
      lesson_name: lesson?.name ?? null,
      lesson_start_time: lesson?.start_time ?? null,
      lesson_duration: lesson?.duration ?? null,
    };
  });
}

export function selectReservationListView(state) {
  const rezervace = selectReservations(state);
  const lekce = selectLessons(state);
  const zustatek = selectCreditBalance(state);

  return {
    type: CONST.RESERVATION_LIST,
    rezervace: enrichWithLesson(rezervace, lekce),
    zustatek,
    capabilities: {
      canGoToPayments: true,
      canConfirm: true,
      canCancel: true,
    },
    reservationCapabilities: rezervace.map((r) => {
      const lesson = lekce.find((l) => (l.lesson_schedule_id ?? l.lesson_id) === r.lesson_schedule_id);
      const lessonAllowsCancel = !lesson || lesson.status === 'OPEN' || lesson.status === 'FULL';
      return {
        reservationId: r.reservation_id,
        lessonId: r.lesson_schedule_id,
        canCancel: canCancelReservation(r) && lessonAllowsCancel,
      };
    }),
  };
}

export function selectPaymentView(state) {
  const platby = selectPayments(state);
  const zustatek = selectCreditBalance(state);

  return {
    type: CONST.PAYMENT_VIEW,
    platby,
    zustatek,
    capabilities: {
      canGoToReservations: true,
      canPay: true,
    },
  };
}

export function selectLessonListView(state) {
  let lekce = selectLessons(state);
  const allTariffs = state.tariffs ?? [];

  // Enrich lessons with trainer_name and lesson_type_name
  lekce = lekce.map((l) => {
    const trainer = (state.trainers ?? []).find((t) => t.employee_id === l.employee_id);
    const lt = (state.lessonTypes ?? []).find((t) => t.lesson_type_id === l.lesson_type_id);
    return {
      ...l,
      trainer_name: trainer ? `${trainer.name} ${trainer.surname}` : null,
      lesson_type_name: lt?.name ?? null,
    };
  });

  // Sort by start_time ascending (null at end)
  lekce = [...lekce].sort((a, b) => {
    if (!a.start_time && !b.start_time) return 0;
    if (!a.start_time) return 1;
    if (!b.start_time) return -1;
    return new Date(a.start_time) - new Date(b.start_time);
  });

  // Apply lessonFilter
  const filter = state.lessonFilter ?? 'ALL';
  if (filter === 'OPEN') {
    lekce = lekce.filter((l) => l.status === 'OPEN' || l.status === 'FULL');
  } else if (filter === 'COMPLETED') {
    lekce = lekce.filter((l) => l.status === 'COMPLETED');
  } else if (filter === 'MINE') {
    lekce = lekce.filter((l) => l.employee_id === state.auth.memberId);
  }

  // Apply tariff filter – jen tarify vyskytující se v aspoň jedné lekci
  const tariffFilter = state.lessonTariffFilter ?? null;
  if (tariffFilter !== null) {
    lekce = lekce.filter((l) => (l.allowed_tariff_ids ?? []).includes(tariffFilter));
  }

  // Sbíráme unikátní tarify z lekcí (pro zobrazení filter buttons)
  const usedTariffIds = [...new Set(lekce.flatMap((l) => l.allowed_tariff_ids ?? []))];
  // Zahrneme i tarify ze všech lekcí (bez aktuálního filtru)
  const allLessons = selectLessons(state);
  const allUsedTariffIds = [...new Set(allLessons.flatMap((l) => l.allowed_tariff_ids ?? []))];
  const availableTariffFilters = allTariffs.filter((t) => allUsedTariffIds.includes(t.tariff_id));

  return {
    type: CONST.LESSON_LIST,
    lekce,
    lessonFilter: filter,
    lessonTariffFilter: tariffFilter,
    lessonViewMode: state.lessonViewMode ?? 'list',
    availableTariffFilters,
    capabilities: {
      canCreateLesson: canCreateLesson(state),
      canGoToReservations: true,
    },
    lessonCapabilities: lekce.map((l) => {
      const lessonId = l.lesson_schedule_id ?? l.lesson_id;
      const userRes = getUserReservationForLesson(state, lessonId);

      // Zkontrolujeme, zda by uživatel mohl přihlásit kdybychom ignorovali permanentky
      const role = state.auth?.role;
      const wouldQualifyWithoutMembership =
        role !== 'admin' &&
        !(role === 'trainer' && l.employee_id === state.auth?.memberId) &&
        l.status === 'OPEN' &&
        !isLessonFull(l) &&
        getUserReservationForLesson(state, lessonId) === null;

      // membershipRequired = pole názvů chybějících permanentek, nebo null
      let membershipRequired = null;
      if (wouldQualifyWithoutMembership) {
        const missingIds = getMissingMembershipTariffs(l, state);
        if (missingIds?.length) {
          membershipRequired = missingIds.map((id) => {
            const t = allTariffs.find((t) => t.tariff_id === id);
            return t?.name ?? `Tarif #${id}`;
          });
        }
      }

      return {
        lessonId,
        canOpen: canOpenLesson(l, state),
        canCancel: canCancelLesson(l, state),
        canClose: canCloseLesson(l, state),
        canReopen: canReopenLesson(l, state),
        canSetAttendance: canSetAttendance(l, state),
        isFull: isLessonFull(l),
        canEnroll: canEnrollInLesson(l, state),
        canUnenroll: canUnenrollFromLesson(l, state),
        userReservationId: userRes ? userRes.reservation_id : null,
        membershipRequired,
      };
    }),
  };
}

export function selectProfileView(state) {
  const lekce = selectLessons(state);
  return {
    type: CONST.PROFILE_VIEW,
    historyReservations: enrichWithLesson(state.history?.reservations ?? [], lekce),
    historyPayments: state.history?.payments ?? [],
    photoUrl: state.memberProfile?.photo_url ?? null,
    memberName: state.memberProfile?.name ?? state.auth?.name ?? null,
    memberSurname: state.memberProfile?.surname ?? state.auth?.surname ?? null,
    capabilities: {
      canGoToReservations: true,
      canGoToPayments: true,
    },
  };
}

export function selectAuthView(state) {
  return {
    type: CONST.AUTH_VIEW,
  };
}

export function selectAdminView(state) {
  return {
    type: CONST.ADMIN_VIEW,
    pendingPayments: state.pendingPayments ?? [],
    membersNoMembership: state.membersNoMembership ?? [],
    trainerStats: state.trainerStats ?? [],
    scheduleCapacity: state.scheduleCapacity ?? [],
    selectedMemberDetail: state.selectedMemberDetail ?? null,
  };
}

export function selectPermitsView(state) {
  return {
    type: CONST.PERMITS_VIEW,
    tariffs: state.tariffs ?? [],
    archivedTariffs: state.archivedTariffs ?? [],
    memberships: state.memberships ?? [],
    creditBalance: state.creditBalance ?? 0,
    isAdmin: state.auth?.role === 'admin',
  };
}

/**
 * Hlavní selektor – vrací viewState na základě aktuálního UI módu.
 * Vzor totožný s prepare/selectors.js selectViewState().
 */
export function selectViewState(state) {
  // LOADING stav – zobrazí se spinner
  if (state.ui.status === STATUS.LOAD) {
    return { type: 'LOADING' };
  }

  // ERROR stav – zobrazí se chybová zpráva
  if (state.ui.status === STATUS.ERR) {
    return { type: 'ERROR', message: state.ui.errorMessage ?? 'Nastala chyba.' };
  }

  switch (state.ui.mode) {
    case CONST.RESERVATION_LIST:
      return selectReservationListView(state);
    case CONST.PAYMENT_VIEW:
      return selectPaymentView(state);
    case CONST.LESSON_LIST:
      return selectLessonListView(state);
    case CONST.LESSON_DETAIL: {
      const rawDetail = state.lessonDetail ?? null;
      // Enrich detail with lesson_type_name
      const detail = rawDetail ? (() => {
        const lt = (state.lessonTypes ?? []).find((t) => t.lesson_type_id === rawDetail.lesson_type_id);
        return { ...rawDetail, lesson_type_name: lt?.name ?? null };
      })() : null;
      let caps = {
        canEnroll: false, canUnenroll: false, userReservationId: null,
        canReopen: false, canOpen: false, canCancel: false, canClose: false, canSetAttendance: false,
      };
      if (detail) {
        const lessonId = detail.lesson_schedule_id;
        const userRes = getUserReservationForLesson(state, lessonId);
        caps = {
          canEnroll: canEnrollInLesson(detail, state),
          canUnenroll: canUnenrollFromLesson(detail, state),
          userReservationId: userRes ? userRes.reservation_id : null,
          canReopen: canReopenLesson(detail, state),
          canOpen: canOpenLesson(detail, state),
          canCancel: canCancelLesson(detail, state),
          canClose: canCloseLesson(detail, state),
          canSetAttendance: canSetAttendance(detail, state),
        };
      }
      const role = state.auth?.role;
      const canSeeEnrollees = role === 'admin' || role === 'trainer';
      const canKickMembers = role === 'admin' ||
        (role === 'trainer' && detail?.employee_id === state.auth?.memberId);

      return {
        type: CONST.LESSON_DETAIL,
        lesson: detail,
        auth: { role: state.auth.role, memberId: state.auth.memberId },
        enrollees: canSeeEnrollees ? (state.lessonEnrollees ?? []) : [],
        canSeeEnrollees,
        canKickMembers,
        ...caps,
      };
    }
    case CONST.LESSON_CREATION_VIEW:
      return {
        type: CONST.LESSON_CREATION_VIEW,
        trainers: state.trainers ?? [],
        lessonTemplates: state.lessonTemplates ?? [],
        tariffs: state.tariffs ?? [],
        archivedTariffs: state.archivedTariffs ?? [],
        auth: {
          role: state.auth.role,
          memberId: state.auth.memberId,
          name: state.auth.name,
          surname: state.auth.surname,
        },
      };
    case CONST.LESSON_ATTENDANCE:
      return {
        type: CONST.LESSON_ATTENDANCE,
        lessonId: state.lessonAttendance?.lessonId ?? null,
        lessonName: state.lessonAttendance?.lessonName ?? null,
        attendees: state.lessonAttendance?.attendees ?? [],
      };
    case CONST.PROFILE_VIEW:
      return selectProfileView(state);
    case CONST.AUTH_VIEW:
      return selectAuthView(state);
    case CONST.ADMIN_VIEW:
      return selectAdminView(state);
    case CONST.PERMITS_VIEW:
      return selectPermitsView(state);
    default:
      return { type: 'ERROR', message: 'Neznámý pohled aplikace.' };
  }
}
