import fs from 'fs';
import path from 'path';
const { Database } = require('@journeyapps/sqlcipher');
import { DB_FILE, DB_ENCRYPTION_KEY } from '../../config';

const dbDir = path.dirname(DB_FILE);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Create encrypted db instance
const db = new Database(DB_FILE);

// Set encryption key (consistent with migration script, only set key)
db.run(`PRAGMA key = '${DB_ENCRYPTION_KEY}'`);

type WalletRow = { address: string; private_key: string };

function getUserWallets(userId: number): WalletRow[] {
  try {
    // Use sync wrapper
    let result: WalletRow[] = [];
    let error: Error | null = null;
    let completed = false;
    
    db.all('SELECT address, private_key FROM wallets WHERE user_id = ?', [userId], (err: Error | null, rows: any[]) => {
      if (err) {
        error = err;
      } else {
        result = rows as WalletRow[];
      }
      completed = true;
    });
    
    // Wait for async operation to complete
    require('deasync').loopWhile(() => !completed);
    
    if (error) {
      throw error;
    }
    
    return result;
  } catch (error) {
    console.error('Error getting user wallets:', error);
    return [];
  }
}

function removeWallet(userId: number, address: string): boolean {
  try {
    let result: boolean = false;
    let error: Error | null = null;
    let completed = false;
    
    db.run('DELETE FROM wallets WHERE user_id = ? AND address = ?', [userId, address], function(err: Error | null) {
      if (err) {
        error = err;
      } else {
        result = (this as any)?.changes > 0;
      }
      completed = true;
    });
    
    require('deasync').loopWhile(() => !completed);
    
    if (error) {
      throw error;
    }
    
    return result;
  } catch (error) {
    console.error('Error removing wallet:', error);
    return false;
  }
}

function getWalletCount(userId: number): number {
  try {
    let result: number = 0;
    let error: Error | null = null;
    let completed = false;
    
    db.get('SELECT COUNT(*) as count FROM wallets WHERE user_id = ?', [userId], (err: Error | null, row: any) => {
      if (err) {
        error = err;
      } else {
        result = row?.count ?? 0;
      }
      completed = true;
    });
    
    require('deasync').loopWhile(() => !completed);
    
    if (error) {
      throw error;
    }
    
    return result;
  } catch (error) {
    console.error('Error getting wallet count:', error);
    return 0;
  }
}

function getWalletByAddress(address: string): { private_key: string } | null {
  try {
    let result: { private_key: string } | null = null;
    let error: Error | null = null;
    let completed = false;
    
    db.get('SELECT private_key FROM wallets WHERE address = ?', [address], (err: Error | null, row: any) => {
      if (err) {
        error = err;
      } else {
        result = row || null;
      }
      completed = true;
    });
    
    require('deasync').loopWhile(() => !completed);
    
    if (error) {
      throw error;
    }
    
    return result;
  } catch (error) {
    console.error('Error getting wallet by address:', error);
    return null;
  }
}

function saveWalletsToDatabase(wallets: { publicKey: string; privateKey: string }[], telegramUserId: number): void {
  try {
    const insertStmt = db.prepare('INSERT INTO wallets (address, private_key, user_id) VALUES (?, ?, ?)');
    const insertMany = db.transaction((ws: { publicKey: string; privateKey: string }[]) => {
      for (const wallet of ws) {
        insertStmt.run(wallet.publicKey, wallet.privateKey, telegramUserId);
      }
    });
    insertMany(wallets);
    console.log(`Saved ${wallets.length} wallets to the database for user ${telegramUserId}.`);
  } catch (error) {
    console.error('Error saving wallets to database:', error);
  }
}

// i18n user settings
function getUserLanguage(userId: number): string | null {
  try {
    let result: string | null = null;
    let error: Error | null = null;
    let completed = false;
    
    db.get('SELECT lang FROM user_settings WHERE user_id = ?', [userId], (err: Error | null, row: any) => {
      if (err) {
        error = err;
      } else {
        result = row?.lang ?? null;
      }
      completed = true;
    });
    
    require('deasync').loopWhile(() => !completed);
    
    if (error) {
      throw error;
    }
    
    return result;
  } catch (error) {
    console.error('Error getting user language:', error);
    return null;
  }
}

function setUserLanguage(userId: number, lang: string): void {
  try {
    let error: Error | null = null;
    let completed = false;
    
    db.run('INSERT OR REPLACE INTO user_settings (user_id, lang) VALUES (?, ?)', [userId, lang], function(err: Error | null) {
      if (err) {
        error = err;
      }
      completed = true;
    });
    
    require('deasync').loopWhile(() => !completed);
    
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error setting user language:', error);
  }
}

// ensure tables exist
const init = () => {
  try {
    const createWalletsTable = db.prepare(`
      CREATE TABLE IF NOT EXISTS wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        address TEXT NOT NULL,
        private_key TEXT NOT NULL,
        user_id INTEGER NOT NULL
      )
    `);
    createWalletsTable.run();

    const createUserSettingsTable = db.prepare(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id INTEGER PRIMARY KEY,
        lang TEXT NOT NULL
      )
    `);
    createUserSettingsTable.run();
  } catch (error) {
    console.error('Error initializing database tables:', error);
  }
};
init();

export { db, getUserWallets, removeWallet, getWalletCount, getWalletByAddress, saveWalletsToDatabase, getUserLanguage, setUserLanguage };
