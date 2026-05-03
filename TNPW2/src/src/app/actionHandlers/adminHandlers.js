import * as CONST from '../../constants.js';

export function adminHandlers(dispatch, viewState) {
  const handlers = {};

  handlers.onGoToReservations = () =>
    dispatch({ type: CONST.ENTER_RESERVATION_LIST });

  handlers.onApprovePayment = (paymentId) =>
    dispatch({ type: CONST.APPROVE_PAYMENT, payload: { paymentId } });

  handlers.onRejectPayment = (paymentId) =>
    dispatch({ type: CONST.REJECT_PAYMENT, payload: { paymentId } });

  handlers.onCloseBilling = () =>
    dispatch({ type: CONST.CLOSE_BILLING });

  handlers.onArchiveMembers = () =>
    dispatch({ type: CONST.ARCHIVE_MEMBERS });

  handlers.onShowMemberDetail = (memberId) =>
    dispatch({ type: CONST.SHOW_MEMBER_DETAIL, payload: { memberId } });

  handlers.onHideMemberDetail = () =>
    dispatch({ type: CONST.HIDE_MEMBER_DETAIL });

  return handlers;
}
