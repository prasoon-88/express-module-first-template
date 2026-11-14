// VIOLATION (rule 1): shared must never import from a module.
import { createBillingService } from '@modules/billing';

export const leaked = createBillingService;
