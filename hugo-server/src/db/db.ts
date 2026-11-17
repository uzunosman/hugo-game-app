// Postgres bağlantısı: DATABASE_URL varsa veriler veritabanında tutulur, yoksa (testler, yerel geliştirme) dosyalarda.
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

export const pool: Pool | null = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
    : null;
pool?.on('error', (error) => console.error('Veritabanı bağlantı hatası:', error.message));

const migrationsDir = path.join(__dirname, '..', '..', 'migrations');

// migrations/*.sql dosyaları ad sırasıyla bir kez uygulanır; her biri kendi transaction'ında
export const migrate = async (): Promise<void> => {
    if (!pool) return;
    await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));
    for (const name of fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()) {
        if (done.has(name)) continue;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(fs.readFileSync(path.join(migrationsDir, name), 'utf8'));
            await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
            await client.query('COMMIT');
            console.log(`Migration uygulandı: ${name}`);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
};
