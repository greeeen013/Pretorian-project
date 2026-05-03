// Akce: zrušení rezervace.
// Stejný loading/error vzor jako confirmReservation.js.

import * as STATUS from '../../statuses.js';

export async function cancelReservation({ store, api, payload }) {
  const { reservationId } = payload;

  store.setState((state) => ({
    ...state,
    ui: { ...state.ui, status: STATUS.LOAD, notification: null },
  }));

  try {
    const result = await api.reservations.updateStatus(reservationId, 'UNENROLLED');

    store.setState((state) => ({
      ...state,
      reservations: state.reservations.map((r) =>
        r.reservation_id === result.reservation_id ? result : r,
      ),
      // Pokud se ruší potvrzená rezervace, backend vrátí nový zůstatek
      creditBalance: result.credit_balance ?? state.creditBalance,
      ui: {
        ...state.ui,
        status: STATUS.RDY,
        notification: { type: STATUS.OK, message: 'Rezervace byla zrušena.' },
      },
    }));
  } catch (error) {
    store.setState((state) => ({
      ...state,
      ui: {
        ...state.ui,
        status: STATUS.RDY,
        notification: { type: STATUS.WAR, message: error.message },
      },
    }));
  }
}
