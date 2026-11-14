// VIOLATION (no-circular): billing -> invoices -> billing.
import type { InvoicesApi } from '@modules/invoices';
import type { BillingRepository } from './billing.repository';

export function createBillingService(repository: BillingRepository, invoices: InvoicesApi) {
  return {
    async hasAccount(id: string) {
      return (await repository.findById(id)) !== null && invoices.count() >= 0;
    },
  };
}
