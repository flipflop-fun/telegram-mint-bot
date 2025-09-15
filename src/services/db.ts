import fs from 'fs';
import path from 'path';
import DatabaseConstructor from 'better-sqlite3';
import { DB_FILE } from '../../config';

const dbDir = path.dirname(DB_FILE);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db: any = new DatabaseConstructor(DB_FILE);

type WalletRow = { address: string; private_key: string };

function getUserWallets(userId: number): WalletRow[] {
  const query = db.prepare('SELECT address, private_key FROM wallets WHERE user_id = ?');
  return query.all(userId) as WalletRow[];
}

function removeWallet(userId: number, address: string): boolean {
  const query = db.prepare('DELETE FROM wallets WHERE user_id = ? AND address = ?');
  const result = query.run(userId, address);
  return (result.changes || 0) > 0;
}

function getWalletCount(userId: number): number {
  const query = db.prepare('SELECT COUNT(*) AS count FROM wallets WHERE user_id = ?');
  const row = query.get(userId) as { count: number };
  return row.count;
}

// ensure table exists
const init = () => {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT NOT NULL,
      private_key TEXT NOT NULL,
      user_id INTEGER NOT NULL
    )
  `).run();
};
init();

export { db, getUserWallets, removeWallet, getWalletCount };
