// VIOLATION (rule 2): deep import into another module.
import { createBillingService } from '@modules/billing/billing.service';
// VIOLATION (rule 3): another module's model, and (rule 9) a parent-relative import.
import type { BillingAccountEntity } from '../billing/billing.model';
// VIOLATION (rule 4): a service that knows about Express.
import type { Request } from 'express';
// VIOLATION: a database driver outside a repository adapter.
import { Pool } from 'pg';
// VIOLATION: a service that picks its own repository adapter.
import { createInMemoryInvoicesRepository } from './invoices.repository.memory';
// Allowed: another module through its public API (this one closes the cycle with billing).
import { createBillingService as viaPublicApi } from '@modules/billing';

export interface InvoicesApi {
  count(): number;
}

export function createInvoicesService(req: Request, account: BillingAccountEntity) {
  const repository = createInMemoryInvoicesRepository();
  return { req, account, repository, pool: new Pool(), createBillingService, viaPublicApi };
}
