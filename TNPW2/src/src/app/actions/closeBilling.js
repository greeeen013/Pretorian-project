import * as STATUS from '../../statuses.js';

export async function closeBilling({ store, api }) {
  store.setState((s) => ({ ...s, ui: { ...s.ui, status: STATUS.LOAD } }));
  try {
    await api.admin.closeBilling();
    const [pendingPayments, membersNoMembership, trainerStats, scheduleCapacity] = await Promise.all([
      api.admin.getPendingPayments(),
      api.stats.getMembersNoMembership(),
      api.stats.getTrainerStats(),
      api.stats.getScheduleCapacity(),
    ]);
    store.setState((s) => ({
      ...s,
      pendingPayments,
      membersNoMembership,
      trainerStats,
      scheduleCapacity,
      ui: {
        ...s.ui,
        status: STATUS.RDY,
        notification: { type: STATUS.OK, message: 'Měsíční vyúčtování bylo úspěšně uzavřeno.' },
      },
    }));
  } catch (error) {
    store.setState((s) => ({
      ...s,
      ui: {
        ...s.ui,
        status: STATUS.RDY,
        notification: { type: STATUS.ERR, message: error.message ?? 'Chyba při uzavírání vyúčtování.' },
      },
    }));
  }
}
