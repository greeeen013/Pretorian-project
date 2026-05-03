// Počáteční stav MMA aplikace.
//
// Struktura vychází ze vzorového projektu prepare/ – zachovávám stejný tvar ui objektu,
// aby bylo render.js a selectors.js konzistentní s tím, co jsem se naučil.
//
// member_id=1 je dočasná hodnota pro demonstraci IR03 bez autentizace.
// V dalších iteracích bude nahrazen přihlašovacím formulářem.

import * as CONST from '../constants.js';
import * as STATUS from '../statuses.js';

export function createInitialState() {
  const memberId = localStorage.getItem('memberId');
  const memberName = localStorage.getItem('memberName');
  const memberSurname = localStorage.getItem('memberSurname');
  const memberRole = localStorage.getItem('memberRole');
  const hasToken = !!localStorage.getItem('token');

  return {
    // Rezervace a platby přihlášeného člena
    reservations: [],
    payments: [],

    // Lekce a docházka
    lessons: [],
    attendances: [],

    // Kreditový zůstatek – načítá se při inicializaci z API
    creditBalance: null,

    // IR04: Kombinovaná historie pro ProfileView (rezervace + platby)
    history: {
      reservations: [],
      payments: [],
    },

    // Admin: čekající platby ke schválení
    pendingPayments: [],

    // Admin: statistiky z DB pohledů
    membersNoMembership: [],
    trainerStats: [],
    scheduleCapacity: [],

    // Admin: detail vybraného člena (fn_get_member_details_json)
    selectedMemberDetail: null,

    // Data pro formulář vytváření lekce
    trainers: [],
    lessonTemplates: [],
    lessonTypes: [],

    // Detail konkrétní lekce
    lessonDetail: null,

    // Přihlášení členové na lekci (pro trenéra/admina)
    lessonEnrollees: [],

    // Docházka lekce – { lessonId, lessonName, attendees }
    lessonAttendance: null,

    // Filtr seznamu lekcí: 'ALL' | 'OPEN' | 'MINE'
    lessonFilter: 'ALL',

    // Filtr lekcí podle tarifu (null = vše)
    lessonTariffFilter: null,

    // Přepínač zobrazení: 'list' | 'schedule'
    lessonViewMode: 'list',

    // Permanentky
    tariffs: [],
    archivedTariffs: [],
    memberships: [],

    // Přihlášený člen
    auth: {
      memberId: memberId ? parseInt(memberId, 10) : null,
      name: memberName || null,
      surname: memberSurname || null,
      role: memberRole || null,
    },

    // UI stav – totožná struktura jako v prepare/ pro konzistenci
    ui: {
      mode: hasToken ? CONST.RESERVATION_LIST : CONST.AUTH_VIEW,
      status: hasToken ? STATUS.LOAD : STATUS.RDY,
      errorMessage: null,
      notification: null,  // { type: 'SUCCESS'|'WARNING', message }
    },
  };
}
