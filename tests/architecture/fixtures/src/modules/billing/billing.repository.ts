import type { BillingAccountEntity } from './billing.model';

export interface BillingRepository {
  findById(id: string): Promise<BillingAccountEntity | null>;
}
