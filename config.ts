import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const BOT_TOKEN: string = process.env.BOT_TOKEN || '';
export const DB_FILE: string = process.env.DB_FILE || path.join(process.cwd(), 'src/data/wallets.db');
export const DB_ENCRYPTION_KEY: string = process.env.DB_ENCRYPTION_KEY || 'default-encryption-key-change-in-production';
export const MAINNET: string = process.env.MAINNET_RPC || 'https://api.mainnet-beta.solana.com';
export const DEVNET: string = process.env.DEVNET_RPC || 'https://api.devnet.solana.com';
export const RPC: string = process.env.NETWORK === 'devnet' ? DEVNET : MAINNET;

export const getInlineKeyboard = (t: any) => [
    [
        { text: t('buttons.generate_wallets'), callback_data: 'menu_generate_wallets' },
        { text: t('buttons.my_wallets'), callback_data: 'menu_my_wallets' },
    ], [
        { text: t('buttons.mint'), callback_data: 'menu_mint' },
        { text: t('buttons.mint_data'), callback_data: 'menu_mint_data' },
    ], [
        { text: t('buttons.send_sol'), callback_data: 'menu_send_sol' },
        { text: t('buttons.send_spl'), callback_data: 'menu_send_spl' },
    ], [
        { text: t('buttons.refund'), callback_data: 'menu_refund' },
        { text: t('buttons.get_urc'), callback_data: 'menu_get_urc' },
    ], [
        { text: t('buttons.settings'), callback_data: 'menu_settings' },
        { text: t('buttons.help'), callback_data: 'menu_help' },
    ],
]