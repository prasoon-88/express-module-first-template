import type { InvoicesRepository } from './invoices.repository';

export function createInMemoryInvoicesRepository(): InvoicesRepository {
  return {
    findById() {
      return Promise.resolve(null);
    },
  };
}
