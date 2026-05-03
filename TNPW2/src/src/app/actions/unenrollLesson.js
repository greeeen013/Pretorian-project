import * as STATUS from '../../statuses.js';

export async function unenrollLesson({ store, api, payload }) {
  const { reservationId } = payload;
  const memberId = store.getState().auth.memberId;

  store.setState((state) => ({
    ...state,
    ui: { ...state.ui, status: STATUS.LOAD, notification: null },
  }));

  try {
    await api.reservations.updateStatus(reservationId, 'UNENROLLED');

    // Refresh lessons list and reservations to reflect updated enrollment count
    const [lekce, rezervace] = await Promise.all([
      api.lessons.getAll(),
      api.reservations.getAll(memberId),
    ]);

    store.setState((state) => ({
      ...state,
      lessons: lekce,
      reservations: rezervace,
      ui: {
        ...state.ui,
        status: STATUS.RDY,
        notification: { type: STATUS.OK, message: 'Odhlášení z lekce proběhlo úspěšně.' },
      },
    }));
  } catch (error) {
    store.setState((state) => ({
      ...state,
      ui: {
        ...state.ui,
        status: STATUS.RDY,
        notification: { type: STATUS.WAR, message: error.message ?? 'Odhlášení z lekce selhalo.' },
      },
    }));
  }
}
