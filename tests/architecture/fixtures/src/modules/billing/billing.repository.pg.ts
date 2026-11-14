// Allowed: a repository adapter is the one place that may import a database driver.
import type { Pool } from 'pg';
import type { BillingRepository } from './billing.repository';

export function createPgBillingRepository(pool: Pool): BillingRepository {
  return {
    async findById(id) {
      const result = await pool.query('SELECT id FROM billing_accounts WHERE id = $1', [id]);
      return result.rows[0] ?? null;
    },
  };
}
