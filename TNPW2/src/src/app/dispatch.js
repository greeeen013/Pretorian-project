// Dispatcher pro MMA aplikaci.
//
// Struktura je totožná se vzorem z prepare/dispatch.js – switch na type akce.
// Každá akce dostává objekt { store, api, payload } nebo podmnožinu.

import { appInit } from './appInit.js';
import { confirmReservation } from './actions/confirmReservation.js';
import { cancelReservation } from './actions/cancelReservation.js';
import { createPayment } from './actions/createPayment.js';
import { enterProfileView } from './actions/enterProfileView.js';
import { enterAdminView } from './actions/enterAdminView.js';
import { enterLessonList } from './actions/enterLessonList.js';
import { enterLessonCreation } from './actions/enterLessonCreation.js';
import { enterLessonDetail } from './actions/enterLessonDetail.js';
import { approvePayment } from './actions/approvePayment.js';
import { rejectPayment } from './actions/rejectPayment.js';
import { loginAction, registerAction } from './actions/authActions.js';
import { createLesson } from './actions/createLesson.js';
import { cancelLesson } from './actions/cancelLesson.js';
import { updateLessonCapacity } from './actions/updateLessonCapacity.js';
import { closeLesson } from './actions/closeLesson.js';
import { setAttendance } from './actions/setAttendance.js';
import { openLesson } from './actions/openLesson.js';
import { enterPermitsView } from './actions/enterPermitsView.js';
import { purchaseMembership } from './actions/purchaseMembership.js';
import { createTariff } from './actions/createTariff.js';
import { deleteTariff } from './actions/deleteTariff.js';
import { restoreTariff } from './actions/restoreTariff.js';
import { enrollLesson } from './actions/enrollLesson.js';
import { unenrollLesson } from './actions/unenrollLesson.js';
import { reopenLesson } from './actions/reopenLesson.js';
import { saveTeamAttendance } from './actions/saveTeamAttendance.js';
import { uploadPhoto } from './actions/uploadPhoto.js';
import { saveLessonTemplate } from './actions/saveLessonTemplate.js';
import { kickMember } from './actions/kickMember.js';
import { closeBilling } from './actions/closeBilling.js';
import { archiveMembers } from './actions/archiveMembers.js';
import { showMemberDetail } from './actions/showMemberDetail.js';

import * as CONST from '../constants.js';
import * as STATUS from '../statuses.js';

export function createDispatcher(store, api) {
  return async function dispatch(action) {
    const { type, payload = {} } = action ?? {};

    switch (type) {
      case 'APP_INIT':
        return appInit({ store, api });

      case CONST.LOGIN:
        return loginAction({ store, api, payload, dispatch });

      case CONST.REGISTER:
        return registerAction({ store, api, payload, dispatch });

      case CONST.LOGOUT:
        localStorage.removeItem('token');
        localStorage.removeItem('memberId');
        localStorage.removeItem('memberName');
        localStorage.removeItem('memberSurname');
        localStorage.removeItem('memberRole');
        if (typeof history !== 'undefined') history.pushState({}, '', '/');
        return store.setState((state) => ({
          ...state,
          auth: { memberId: null, name: null, surname: null, role: null },
          ui: { ...state.ui, mode: CONST.AUTH_VIEW, status: STATUS.RDY, notification: null, errorMessage: null },
        }));

      case CONST.ENTER_RESERVATION_LIST:
        if (typeof history !== 'undefined') history.pushState({}, '', '/reservations');
        return store.setState((state) => ({
          ...state,
          ui: { ...state.ui, mode: CONST.RESERVATION_LIST, status: STATUS.RDY },
        }));

      case CONST.ENTER_PAYMENT_VIEW:
        if (typeof history !== 'undefined') history.pushState({}, '', '/payments');
        return store.setState((state) => ({
          ...state,
          ui: { ...state.ui, mode: CONST.PAYMENT_VIEW, status: STATUS.RDY },
        }));

      case CONST.ENTER_PROFILE_VIEW:
        return enterProfileView({ store, api });

      case CONST.ENTER_ADMIN_VIEW:
        return enterAdminView({ store, api });

      case CONST.ENTER_LESSON_LIST:
        return enterLessonList({ store, api });

      case CONST.ENTER_LESSON_CREATION:
        return enterLessonCreation({ store, api });

      case CONST.ENTER_LESSON_DETAIL:
        return enterLessonDetail({ store, api, payload });

      case CONST.APPROVE_PAYMENT:
        return approvePayment({ store, api, payload });

      case CONST.REJECT_PAYMENT:
        return rejectPayment({ store, api, payload });

      case CONST.CONFIRM_RESERVATION:
        return confirmReservation({ store, api, payload });

      case CONST.CANCEL_RESERVATION:
        return cancelReservation({ store, api, payload });

      case CONST.CREATE_PAYMENT:
        return createPayment({ store, api, payload });

      // --- Lekce (Student B IR02)
      case CONST.OPEN_LESSON:
        return openLesson({ store, api, payload });

      case CONST.CREATE_LESSON:
        return createLesson({ store, api, payload, dispatch });

      case CONST.CANCEL_LESSON:
        return cancelLesson({ store, api, payload });

      case CONST.UPDATE_CAPACITY:
        return updateLessonCapacity({ store, api, payload });

      case CONST.CLOSE_LESSON:
        return closeLesson({ store, api, payload });

      case CONST.SET_ATTENDANCE:
        return setAttendance({ store, api, payload });

      case CONST.ENTER_PERMITS:
        return enterPermitsView({ store, api });

      case CONST.PURCHASE_MEMBERSHIP:
        return purchaseMembership({ store, api, payload });

      case CONST.CREATE_TARIFF:
        return createTariff({ store, api, payload });

      case CONST.DELETE_TARIFF:
        return deleteTariff({ store, api, payload });

      case CONST.RESTORE_TARIFF:
        return restoreTariff({ store, api, payload });

      case CONST.ENROLL_LESSON:
        return enrollLesson({ store, api, payload });

      case CONST.UNENROLL_LESSON:
        return unenrollLesson({ store, api, payload });

      case CONST.REOPEN_LESSON:
        return reopenLesson({ store, api, payload });

      case CONST.ENTER_LESSON_ATTENDANCE: {
        const { lessonId } = payload;
        store.setState((s) => ({ ...s, ui: { ...s.ui, status: STATUS.LOAD } }));
        try {
          const [detail, attendees] = await Promise.all([
            api.lessons.getDetail(lessonId),
            api.lessons.getAttendees(lessonId),
          ]);
          return store.setState((s) => ({
            ...s,
            lessonAttendance: { lessonId, lessonName: detail.name, attendees },
            ui: { ...s.ui, mode: CONST.LESSON_ATTENDANCE, status: STATUS.RDY },
          }));
        } catch (error) {
          return store.setState((s) => ({
            ...s,
            ui: {
              ...s.ui,
              status: STATUS.ERR,
              errorMessage: error.message ?? 'Chyba při načítání docházky.',
            },
          }));
        }
      }

      case CONST.SAVE_TEAM_ATTENDANCE:
        return saveTeamAttendance({ store, api, payload });

      case CONST.UPLOAD_PHOTO:
        return uploadPhoto({ store, api, payload });

      case CONST.SET_LESSON_FILTER:
        return store.setState((s) => ({ ...s, lessonFilter: payload.filter }));

      case CONST.SET_LESSON_VIEW_MODE:
        return store.setState((s) => ({ ...s, lessonViewMode: payload.mode }));

      case CONST.SET_LESSON_TARIFF_FILTER:
        return store.setState((s) => ({ ...s, lessonTariffFilter: payload.tariffId }));

      case CONST.SAVE_LESSON_TEMPLATE:
        return saveLessonTemplate({ store, api, payload });

      case CONST.KICK_MEMBER:
        return kickMember({ store, api, payload });

      case CONST.CLOSE_BILLING:
        return closeBilling({ store, api });

      case CONST.ARCHIVE_MEMBERS:
        return archiveMembers({ store, api });

      case CONST.SHOW_MEMBER_DETAIL:
        return showMemberDetail({ store, api, payload });

      case CONST.HIDE_MEMBER_DETAIL:
        return store.setState((s) => ({ ...s, selectedMemberDetail: null }));

      case CONST.RECOVER_FROM_ERROR:
        return store.setState((state) => ({
          ...state,
          ui: {
            ...state.ui,
            status: STATUS.RDY,
            mode: state.auth.memberId ? CONST.RESERVATION_LIST : CONST.AUTH_VIEW,
            errorMessage: null,
          },
        }));

      case CONST.CLEAR_NOTIFICATION:
        return store.setState((state) => ({
          ...state,
          ui: { ...state.ui, notification: null },
        }));

      default:
        console.warn(`Neznámý typ akce: ${type}`);
    }
  };
}
