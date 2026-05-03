import * as STATUS from '../../statuses.js';

export async function showMemberDetail({ store, api, payload }) {
  const { memberId } = payload;
  try {
    const detail = await api.admin.getMemberDetail(memberId);
    store.setState((s) => ({ ...s, selectedMemberDetail: detail }));
  } catch (error) {
    store.setState((s) => ({
      ...s,
      ui: {
        ...s.ui,
        notification: { type: STATUS.ERR, message: error.message ?? 'Nepodařilo se načíst detail člena.' },
      },
    }));
  }
}
