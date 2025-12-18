// Centralized logger utility for Noirion
// Usage: await logger.log({ level, eventType, message, details, dbPool, userId })

let warnedMissingDbPool = false;

export const logger = {
  async log({
    level = 'info',
    eventType = null,
    message = '',
    details = {},
    dbPool,
    userId = null
  }) {
    if (!dbPool) {
      if (process.env.NODE_ENV !== 'test' && !warnedMissingDbPool) {
        warnedMissingDbPool = true;
         
        console.error('Logger: dbPool not provided. Log not written to DB.');
      }
      return;
    }
    try {
      const client = await dbPool.connect();
      try {
        await client.query(
          `INSERT INTO system_logs (log_level, event_type, message, details, created_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [level, eventType, message, details, userId]
        );
      } finally {
        client.release();
      }
    } catch (err) {
       
      console.error('Logger: Failed to write to system_logs:', err, { level, eventType, message });
    }
  },

  async error({ message, eventType = null, details = {}, dbPool, userId = null }) {
    await this.log({ level: 'error', eventType, message, details, dbPool, userId });
  },

  async warn({ message, eventType = null, details = {}, dbPool, userId = null }) {
    await this.log({ level: 'warn', eventType, message, details, dbPool, userId });
  },

  async info({ message, eventType = null, details = {}, dbPool, userId = null }) {
    await this.log({ level: 'info', eventType, message, details, dbPool, userId });
  },

  async debug({ message, eventType = null, details = {}, dbPool, userId = null }) {
    await this.log({ level: 'debug', eventType, message, details, dbPool, userId });
  }
};
