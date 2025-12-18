import { requirePermission } from '../../utils/auth.js';
import { up as seedDefaultUsers } from '../../db/migrations/002_create_default_users.js';

const CONFIRM_PHRASE = 'RESET_DB';

async function truncateAllNonExtensionTables(pgClient) {
  // Exclude tables that are owned by extensions (e.g., PostGIS tables like spatial_ref_sys)
  // and exclude migrations so we keep migration bookkeeping intact.
  const { rows } = await pgClient.query(`
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname <> 'migrations'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        JOIN pg_extension e ON e.oid = d.refobjid
        WHERE d.classid = 'pg_class'::regclass
          AND d.objid = c.oid
          AND d.deptype = 'e'
      )
    ORDER BY c.relname
  `);

  const tableNames = rows.map((r) => r.table_name).filter(Boolean);
  if (tableNames.length === 0) return;

  const quoted = tableNames.map((t) => `"${String(t).replace(/"/g, '""')}"`);
  await pgClient.query(`TRUNCATE TABLE ${quoted.join(', ')} RESTART IDENTITY CASCADE;`);
}

const adminResolvers = {
  Mutation: {
    devResetDatabase: async (parent, args, context) => {
      requirePermission(context.user, 'admin');

      if (args?.confirm !== CONFIRM_PHRASE) {
        throw new Error(`Confirmation phrase mismatch. Pass confirm=\"${CONFIRM_PHRASE}\" to proceed.`);
      }

      const client = await context.dbPool.connect();
      try {
        await client.query('BEGIN');
        await truncateAllNonExtensionTables(client);
        await seedDefaultUsers(client);
        await client.query('COMMIT');
        return true;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  },
};

export default adminResolvers;
