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
    // Start transaction manually
    db.run('BEGIN TRANSACTION');
    
    try {
      // Prepare statement for inserting wallets
      const insertStmt = db.prepare('INSERT INTO wallets (address, private_key, user_id) VALUES (?, ?, ?)');
      
      // Insert each wallet
      for (const wallet of wallets) {
        insertStmt.run(wallet.publicKey, wallet.privateKey, telegramUserId);
      }
      
      // Commit transaction
      db.run('COMMIT');
      console.log(`Saved ${wallets.length} wallets to the database for user ${telegramUserId}.`);
    } catch (error) {
      // Rollback on error
      db.run('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error saving wallets to database:', error);
    throw error;
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
    
    db.run('INSERT OR REPLACE INTO user_settings (user_id, lang, network) VALUES (?, ?, COALESCE((SELECT network FROM user_settings WHERE user_id = ?), \'mainnet\'))', [userId, lang, userId], function(err: Error | null) {
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

// Network configuration functions
function getUserNetwork(userId: number): string {
  try {
    let result: string = 'mainnet';
    let error: Error | null = null;
    let completed = false;
    
    db.get('SELECT network FROM user_settings WHERE user_id = ?', [userId], (err: Error | null, row: any) => {
      if (err) {
        error = err;
      } else {
        result = row?.network ?? 'mainnet';
      }
      completed = true;
    });
    
    require('deasync').loopWhile(() => !completed);
    
    if (error) {
      throw error;
    }
    
    return result;
  } catch (error) {
    console.error('Error getting user network:', error);
    return 'mainnet';
  }
}

function setUserNetwork(userId: number, network: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run('INSERT OR REPLACE INTO user_settings (user_id, lang, network) VALUES (?, COALESCE((SELECT lang FROM user_settings WHERE user_id = ?), \'en\'), ?)', [userId, userId, network], function(err: Error | null) {
      if (err) {
        console.error('Error setting user network:', err);
        reject(err);
      } else {
        console.log(`✅ Network updated for user ${userId}: ${network}`);
        resolve();
      }
    });
  });
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

    // First, create user_settings table without network column for backward compatibility
    const createUserSettingsTable = db.prepare(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id INTEGER PRIMARY KEY,
        lang TEXT NOT NULL
      )
    `);
    createUserSettingsTable.run();
    
    // Add network column if it doesn't exist (for existing databases)
    try {
      // Check if network column exists first
      let tableInfo: any[] = [];
      let error: Error | null = null;
      let completed = false;
      
      db.all(`PRAGMA table_info(user_settings)`, [], (err: Error | null, rows: any[]) => {
        if (err) {
          error = err;
        } else {
          tableInfo = rows || [];
        }
        completed = true;
      });
      
      require('deasync').loopWhile(() => !completed);
      
      if (error) {
        throw error;
      }
      
      const hasNetworkColumn = tableInfo.some((column: any) => column.name === 'network');
      
      if (!hasNetworkColumn) {
        db.run(`ALTER TABLE user_settings ADD COLUMN network TEXT DEFAULT 'mainnet'`, (err: Error | null) => {
          if (err) {
            console.error('Error adding network column:', err);
          } else {
            console.log('Added network column to user_settings table');
          }
        });
      }
    } catch (error) {
      console.error('Error checking/adding network column:', error);
    }
  } catch (error) {
    console.error('Error initializing database tables:', error);
  }
};
init();

export { db, getUserWallets, removeWallet, getWalletCount, getWalletByAddress, saveWalletsToDatabase, getUserLanguage, setUserLanguage, getUserNetwork, setUserNetwork };
