// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import {integer,sqliteTable,text} from 'drizzle-orm/sqlite-core';
export const ledgers=sqliteTable('ledgers',{
 ownerId:text('owner_id').primaryKey(),version:integer('version').notNull().default(0),payload:text('payload').notNull(),updatedAt:text('updated_at').notNull()
});
export const rateLimits=sqliteTable('rate_limits',{
 bucket:text('bucket').primaryKey(),hits:integer('hits').notNull().default(0),expiresAt:integer('expires_at').notNull()
});
