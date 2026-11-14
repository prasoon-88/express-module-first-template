import type { InvoiceEntity } from './invoices.model';

export interface InvoicesRepository {
  findById(id: string): Promise<InvoiceEntity | null>;
}
