import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const BOT_TOKEN: string = process.env.BOT_TOKEN || '';
export const DB_FILE: string = process.env.DB_FILE || path.join(process.cwd(), 'src/data/wallets.db');
export const RPC: string = process.env.NETWORK === 'devnet' ? process.env.DEVNET_RPC : process.env.MAINNET_RPC;

export const getInlineKeyboard = (t: any) => [
    [
        { text: t('buttons.generate_wallets'), callback_data: 'menu_generate_wallets' },
        { text: t('buttons.my_wallets'), callback_data: 'menu_my_wallets' },
    ], [
        { text: t('buttons.mint'), callback_data: 'menu_mint' },
        { text: t('buttons.refund'), callback_data: 'menu_refund' },
    ], [
        { text: t('buttons.send_sol'), callback_data: 'menu_send_sol' },
        { text: t('buttons.send_spl'), callback_data: 'menu_send_spl' },
    ], [
        { text: t('buttons.language'), callback_data: 'menu_language' },
        { text: t('buttons.help'), callback_data: 'menu_help' },
    ],
]