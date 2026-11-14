// VIOLATION (rule 4): a controller that reaches past the service.
import type { InvoiceEntity } from './invoices.model';
import type { InvoicesRepository } from './invoices.repository';

export function createInvoicesController(repository: InvoicesRepository) {
  return {
    get(id: string): Promise<InvoiceEntity | null> {
      return repository.findById(id);
    },
  };
}
