// VIOLATION: `export *` leaks the whole file.
export * from './invoices.service';
// VIOLATION: a module must not export its model or its repository.
export type { InvoiceEntity } from './invoices.model';
export { createInMemoryInvoicesRepository } from './invoices.repository.memory';
