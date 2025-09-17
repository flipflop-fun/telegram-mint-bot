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

function getWalletByAddress(address: string): { private_key: string } | null {
  const query = db.prepare('SELECT private_key FROM wallets WHERE address = ?');
  const row = query.get(address) as { private_key: string } | undefined;
  return row || null;
}

function saveWalletsToDatabase(wallets: { publicKey: string; privateKey: string }[], telegramUserId: number): void {
  const insertStmt = db.prepare('INSERT INTO wallets (address, private_key, user_id) VALUES (?, ?, ?)');
  const insertMany = db.transaction((ws: { publicKey: string; privateKey: string }[]) => {
    for (const wallet of ws) {
      insertStmt.run(wallet.publicKey, wallet.privateKey, telegramUserId);
    }
  });
  insertMany(wallets);
  console.log(`Saved ${wallets.length} wallets to the database for user ${telegramUserId}.`);
}

// i18n user settings
function getUserLanguage(userId: number): string | null {
  const row = db.prepare('SELECT lang FROM user_settings WHERE user_id = ?').get(userId) as { lang: string } | undefined;
  return row?.lang ?? null;
}

function setUserLanguage(userId: number, lang: string): void {
  // user_id is PRIMARY KEY, so INSERT OR REPLACE will upsert
  db.prepare('INSERT OR REPLACE INTO user_settings (user_id, lang) VALUES (?, ?)').run(userId, lang);
}

// ensure tables exist
const init = () => {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT NOT NULL,
      private_key TEXT NOT NULL,
      user_id INTEGER NOT NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER PRIMARY KEY,
      lang TEXT NOT NULL
    )
  `).run();
};
init();

export { db, getUserWallets, removeWallet, getWalletCount, getWalletByAddress, saveWalletsToDatabase, getUserLanguage, setUserLanguage };
