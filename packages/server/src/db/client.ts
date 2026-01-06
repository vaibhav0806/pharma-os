import { pool } from '../config/database';
import { QueryResult, QueryResultRow } from 'pg';

/**
 * Execute a database query
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

/**
 * Get a single row from a query
 */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await pool.query<T>(text, params);
  return result.rows[0] || null;
}

/**
 * Get all rows from a query
 */
export async function queryAll<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

/**
 * Execute a transaction
 */
export async function transaction<T>(
  callback: (query: typeof pool.query) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client.query.bind(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export { pool };
