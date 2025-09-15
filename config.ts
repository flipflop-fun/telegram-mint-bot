import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const BOT_TOKEN: string = process.env.BOT_TOKEN || '';
export const DB_FILE: string = process.env.DB_FILE || path.join(process.cwd(), 'src/data/wallets.db');
export const MAINNET: string = process.env.MAINNET_RPC || 'https://api.mainnet-beta.solana.com';
