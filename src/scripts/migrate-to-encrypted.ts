import fs from 'fs';
import DatabaseConstructor from 'better-sqlite3';
const { Database } = require('@journeyapps/sqlcipher');
import { DB_FILE, DB_ENCRYPTION_KEY } from '../../config';

async function migrateToEncryptedDatabase() {
  const oldDbFile = DB_FILE;
  const newDbFile = `${DB_FILE}.encrypted`;
  const backupDbFile = `${DB_FILE}.backup`;

  return new Promise((resolve, reject) => {
    try {
      // Backup source db
      fs.copyFileSync(oldDbFile, backupDbFile);
      console.log('Source db has been backed up to: ', backupDbFile);

      // Open source db
      const oldDb = new DatabaseConstructor(oldDbFile);

      // Create encrypted db
      const newDb = new Database(newDbFile);
      
      // Set encryption key
      newDb.run(`PRAGMA key = "${DB_ENCRYPTION_KEY}"`, (err: any) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Create table structure
        newDb.run(`
          CREATE TABLE IF NOT EXISTS wallets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            address TEXT NOT NULL UNIQUE,
            private_key TEXT NOT NULL,
            user_id INTEGER NOT NULL
          )
        `, (err: any) => {
          if (err) {
            reject(err);
            return;
          }
          
          newDb.run(`
            CREATE TABLE IF NOT EXISTS user_settings (
              user_id INTEGER PRIMARY KEY,
              lang TEXT NOT NULL
            )
          `, (err: any) => {
            if (err) {
              reject(err);
              return;
            }
            
            // Migrate wallet data
            const wallets = oldDb.prepare('SELECT * FROM wallets').all() as Array<{id: number, address: string, private_key: string, user_id: number}>;
            
            let walletCount = 0;
            const insertWallet = (index: number) => {
              if (index >= wallets.length) {
                console.log(`Source db has been migrated ${wallets.length} wallet records`);
                
                // Migrate user settings data
                const userSettings = oldDb.prepare('SELECT * FROM user_settings').all() as Array<{user_id: number, lang: string}>;
                
                let settingCount = 0;
                const insertSetting = (index: number) => {
                  if (index >= userSettings.length) {
                    console.log(`Source db has been migrated ${userSettings.length} user settings records`);
                    
                    // Close db connections
                    oldDb.close();
                    newDb.close();
                    
                    // Replace source db file
                    fs.renameSync(newDbFile, oldDbFile);
                    console.log('Source db has been migrated to encrypted db');
                    console.log(`Backup file saved to: ${backupDbFile}`);
                    resolve(undefined);
                    return;
                  }
                  
                  const setting = userSettings[index];
                  newDb.run('INSERT INTO user_settings (user_id, lang) VALUES (?, ?)', 
                    [setting.user_id, setting.lang], (err: any) => {
                    if (err) {
                      reject(err);
                      return;
                    }
                    insertSetting(index + 1);
                  });
                };
                
                insertSetting(0);
                return;
              }
              
              const wallet = wallets[index];
              newDb.run('INSERT INTO wallets (address, private_key, user_id) VALUES (?, ?, ?)', 
                [wallet.address, wallet.private_key, wallet.user_id], (err: any) => {
                if (err) {
                  reject(err);
                  return;
                }
                insertWallet(index + 1);
              });
            };
            
            insertWallet(0);
          });
        });
      });
    } catch (error) {
      // If migration failed, restore backup
      if (fs.existsSync(backupDbFile)) {
        try {
          fs.copyFileSync(backupDbFile, oldDbFile);
          console.log('Source db migration failed, backup file has been restored');
        } catch (restoreError) {
          console.error('Source db migration failed, backup file restore failed:', restoreError);
        }
      }
      reject(error);
    }
  });
}

// If run this script directly
if (require.main === module) {
  migrateToEncryptedDatabase()
    .then(() => {
      console.log('Source db has been migrated successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Source db migration failed:', error);
      process.exit(1);
    });
}

export { migrateToEncryptedDatabase };