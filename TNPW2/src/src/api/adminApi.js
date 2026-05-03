// API modul pro admin operace.

import { apiFetch } from './httpClient.js';

export function createAdminApi() {
  return {
    getPendingPayments() {
      return apiFetch('/payments/pending');
    },

    approvePayment(paymentId) {
      return apiFetch(`/payments/${paymentId}/status`, {
        method: 'PATCH',
        body: { status: 'COMPLETED' },
      });
    },

    rejectPayment(paymentId) {
      return apiFetch(`/payments/${paymentId}/status`, {
        method: 'PATCH',
        body: { status: 'FAILED' },
      });
    },

    /** Uzavře měsíční vyúčtování – volá DB proceduru pr_close_monthly_billing. */
    closeBilling() {
      return apiFetch('/admin/billing/close', { method: 'POST' });
    },

    /** Archivuje neaktivní členy – volá DB proceduru pr_archive_inactive_members. */
    archiveMembers() {
      return apiFetch('/admin/members/archive', { method: 'POST' });
    },

    /** Detail člena jako JSON – volá DB funkci fn_get_member_details_json. */
    getMemberDetail(memberId) {
      return apiFetch(`/members/${memberId}`);
    },
  };
}
