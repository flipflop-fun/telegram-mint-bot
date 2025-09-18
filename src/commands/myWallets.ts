import { getUserWallets, removeWallet, getWalletCount, getWalletByAddress, saveWalletsToDatabase, getUserNetwork } from '../services/db';
import { Markup } from 'telegraf';
import { generateWallets } from './generateWallets';
import { viewBalances, fetchMultipleSolBalances } from '../services/viewBalances';
import { chunkArray, createPaginationKeyboard } from '../utils/bot/pagination';
import { handleBackToMainMenu } from '../utils/bot/navigation';

const MAX_SPL_TOKENS_DISPLAY = 1;

export async function handleMyWallets(ctx: any, page = 1, isEdit = false) {
    const userId = ctx.from.id as number;
    const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);

    const fetchingMessage = await ctx.reply(t('wallets.fetching'));

    const wallets = getUserWallets(userId);
    console.log("user network", getUserNetwork(userId));

    if (!wallets || wallets.length === 0) {
        const noWalletMessage = t('wallets.none');

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback(t('buttons.generate_wallets'), 'menu_generate_wallets')],
            [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')],
        ]);

        if (isEdit) {
            await ctx.editMessageText(noWalletMessage, {
                parse_mode: 'HTML',
                reply_markup: keyboard.reply_markup,
            });
        } else {
            await ctx.reply(noWalletMessage, {
                parse_mode: 'HTML',
                reply_markup: keyboard.reply_markup,
            });
        }

        await ctx.deleteMessage(fetchingMessage.message_id);
        return;
    }

    const itemsPerPage = 10;
    const totalPages = Math.ceil(wallets.length / itemsPerPage);
    const currentWallets = chunkArray(wallets, itemsPerPage)[page - 1];

    const balances = await viewBalances(userId);

    if (!Array.isArray(balances)) {
        const errorMessage = t('wallets.error_balances');
        await ctx.reply(errorMessage, {
            parse_mode: 'HTML',
        });
        await ctx.deleteMessage(fetchingMessage.message_id);
        return;
    }

    const lines: string[] = [];
    const timestamp = new Date().toLocaleTimeString();

    lines.push(t('wallets.showing', { count: currentWallets.length, total: wallets.length, page, pages: totalPages }));
    lines.push('');
    lines.push(t('wallets.last_refreshed', { time: timestamp }));
    lines.push('');

    const separator = '━━━━━━━━━━━━━━━━';

    currentWallets.forEach((wallet: any, index: number) => {
        const walletIndex = page > 1 ? (page - 1) * itemsPerPage + index + 1 : index + 1;
        const address = wallet.address;

        let walletText = `<b>${walletIndex}. ${t('labels.wallet')}</b>: <code>${address}</code>\n`;

        const walletBalance = balances.find((b: any) => b.address === wallet.address);
        const { splTokens = [] } = walletBalance || {};

        if (splTokens.length > 0) {
            walletText += `\n<b>${t('labels.spl_tokens')}</b>:`;
            splTokens.slice(0, MAX_SPL_TOKENS_DISPLAY).forEach(({ mint, balance }: any) => {
                walletText += `\n<b>${t('labels.ca')}</b>: <code>${mint}</code>\n<b>${t('labels.balance')}</b>: ${balance}`;
            });

            if (splTokens.length > MAX_SPL_TOKENS_DISPLAY) {
                const additionalTokensCount = splTokens.length - MAX_SPL_TOKENS_DISPLAY;
                walletText += `\n<b>${t('wallets.more_tokens', { count: additionalTokensCount })}</b>`;
            }
        }

        lines.push(walletText);
        lines.push(separator);
        lines.push('');
    });

    const fullMessage = lines.join('\n');

    const walletButtons = currentWallets.map((wallet: any, index: number) => {
        const shortAddress = `...${wallet.address.slice(-4)}`;
        const walletBalance = balances.find((b: any) => b.address === wallet.address);
        
        // Ensure proper formatting of SOL balance
        let solBalance: string;
        if (walletBalance && typeof walletBalance.solBalance === 'number') {
            solBalance = walletBalance.solBalance.toFixed(2);
        } else {
            solBalance = t('common.na');
        }

        return [
            Markup.button.callback(`🔑 ${shortAddress}`, `view_key_${wallet.address}`),
            Markup.button.callback(`💰 ${solBalance} ${t('units.sol')}`, `balance_${wallet.address}`),
            Markup.button.callback(t('buttons.view_all_tokens'), `view_all_tokens_${wallet.address}`),
            Markup.button.callback(t('buttons.remove'), `remove_wallet_${wallet.address}`),
        ];
    });

    const paginationButtons = createPaginationKeyboard(ctx, page, totalPages, 'my_wallets_page_');
    const footerButtons = [
        [Markup.button.callback(t('buttons.refresh'), `refresh_wallets_page_${page}`)],
        [Markup.button.callback(t('buttons.add_new_wallet'), 'add_new_wallet')],
        [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')],
    ];

    const inlineKeyboard = [...walletButtons, ...paginationButtons, ...footerButtons];

    if (isEdit) {
        await ctx.editMessageText(fullMessage, {
            parse_mode: 'HTML',
            reply_markup: Markup.inlineKeyboard(inlineKeyboard).reply_markup,
        });
    } else {
        await ctx.reply(fullMessage, {
            parse_mode: 'HTML',
            reply_markup: Markup.inlineKeyboard(inlineKeyboard).reply_markup,
        });
    }

    await ctx.deleteMessage(fetchingMessage.message_id);
}

async function handleViewAllTokens(ctx: any) {
    const walletAddress = ctx.match[1];
    const userId = ctx.from.id as number;
    const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);

    const balances = await viewBalances(userId);
    const walletBalance = balances.find((b: any) => b.address === walletAddress);

    if (!walletBalance || walletBalance.splTokens.length === 0) {
        await ctx.answerCbQuery(t('wallets.no_tokens'), { show_alert: true });
        return;
    }

    const tokenLines = walletBalance.splTokens.map(({ mint, balance }: any) => {
        return `<b>${t('labels.ca')}</b>: <code>${mint}</code>\n<b>${t('labels.balance')}</b>: ${balance}`;
    });

    const fullTokensMessage = t('wallets.all_tokens_title', { address: walletAddress, tokens: tokenLines.join('\n\n') });

    const closeButton = Markup.inlineKeyboard([
        [Markup.button.callback(t('buttons.close'), 'close_tokens_message')],
    ]);

    const message = await ctx.reply(fullTokensMessage, {
        parse_mode: 'HTML',
        reply_markup: closeButton.reply_markup,
    });

    ctx.session.splTokensMessageId = message.message_id;
}

async function handleCloseTokensMessage(ctx: any) {
    if (ctx.session?.splTokensMessageId) {
        await ctx.deleteMessage(ctx.session.splTokensMessageId);
        ctx.session.splTokensMessageId = null;
    }
    await ctx.answerCbQuery();
}

export async function handleViewKey(ctx: any) {
    const walletAddress = ctx.match[1];
    const wallet = getWalletByAddress(walletAddress);

    const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);

    if (!wallet) {
        return ctx.answerCbQuery(t('wallets.not_found'), { show_alert: true });
    }

    await ctx.answerCbQuery();

    const message = t('wallets.private_key', { address: walletAddress, private_key: wallet.private_key });

    await ctx.reply(message, { parse_mode: 'HTML' });
}

async function handleRemoveWallet(ctx: any) {
    const walletAddress = ctx.match[1];
    const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);

    // Show confirmation dialog
    const confirmationMessage = t('wallets.confirm_remove_message', { address: walletAddress });
    const confirmationTitle = t('wallets.confirm_remove_title');
    
    const fullMessage = `${confirmationTitle}\n\n${confirmationMessage}`;

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(t('buttons.confirm_remove'), `confirm_remove_${walletAddress}`)],
        [Markup.button.callback(t('buttons.cancel'), 'cancel_remove')],
    ]);

    await ctx.reply(fullMessage, {
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup,
    });

    await ctx.answerCbQuery();
}

async function handleConfirmRemoveWallet(ctx: any) {
    const walletAddress = ctx.match[1];
    const userId = ctx.from.id as number;

    const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);

    if (!removeWallet(userId, walletAddress)) {
        await ctx.editMessageText(t('wallets.not_found_or_removed'), { parse_mode: 'HTML' });
        return;
    }

    await ctx.editMessageText(t('wallets.removed'), { parse_mode: 'HTML' });

    // Refresh the wallets page after a short delay
    setTimeout(async () => {
        const match = ctx.callbackQuery?.data.match(/^my_wallets_page_(\d+)$/);
        const currentPage = match ? parseInt(match[1], 10) : 1;
        await handleMyWallets(ctx, currentPage, false);
    }, 1500);
}

async function handleCancelRemoveWallet(ctx: any) {
    const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
    
    await ctx.editMessageText(t('buttons.cancel'), { parse_mode: 'HTML' });
    
    // Go back to wallets page after a short delay
    setTimeout(async () => {
        const match = ctx.callbackQuery?.data.match(/^my_wallets_page_(\d+)$/);
        const currentPage = match ? parseInt(match[1], 10) : 1;
        await handleMyWallets(ctx, currentPage, false);
    }, 1000);
}

export async function handleAddNewWallet(ctx: any) {
    const userId = ctx.from.id as number;
    const walletCount = getWalletCount(userId);

    const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);

    if (walletCount >= 100) {
        const limitMessage = t('wallets.limit_reached');
        await ctx.reply(limitMessage, { parse_mode: 'HTML' });
        return;
    }

    const [newWallet] = generateWallets(1);
    saveWalletsToDatabase([newWallet], userId);

    const match = ctx.callbackQuery?.data.match(/^my_wallets_page_(\d+)$/);
    const currentPage = match ? parseInt(match[1], 10) : 1;

    await handleMyWallets(ctx, currentPage, true);
}

export function handleWalletPagination(bot: any) {
    bot.action(/^my_wallets_page_(\d+)$/, async (ctx: any) => {
        const page = parseInt(ctx.match[1], 10);
        await handleMyWallets(ctx, page, true);
    });

    bot.action(/^refresh_wallets_page_(\d+)$/, async (ctx: any) => {
        const page = parseInt(ctx.match[1], 10);
        await handleMyWallets(ctx, page, true);
    });

    bot.action(/^balance_(.+)$/, async (ctx: any) => {
        const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
        const data = ctx.callbackQuery?.data || '';
        const userId = ctx.from.id as number;
        const match = data.match(/^balance_(.+)$/);
        const address = match ? match[1] : '';
        if (!address) {
            await ctx.answerCbQuery(t('common.error_try_again'), { show_alert: true });
            return;
        }
        try {
            const [result] = await fetchMultipleSolBalances([address], userId);
            const amount = result ? result.solBalance : undefined;
            const display = typeof amount === 'number' ? amount.toFixed(4) : t('common.na');
            const message = `${t('labels.balance')}: ${display} ${t('units.sol')}`;
            await ctx.answerCbQuery(message, { show_alert: true });
        } catch (e) {
            await ctx.answerCbQuery(t('common.error_try_again'), { show_alert: true });
        }
    });

    bot.action(/^view_all_tokens_(.+)$/, handleViewAllTokens);

    bot.action('close_tokens_message', handleCloseTokensMessage);

    // Handle remove wallet confirmation
    bot.action(/^remove_wallet_(.+)$/, handleRemoveWallet);
    
    // Handle confirm remove wallet
    bot.action(/^confirm_remove_(.+)$/, handleConfirmRemoveWallet);
    
    // Handle cancel remove wallet
    bot.action('cancel_remove', handleCancelRemoveWallet);

    bot.action('menu_main', (ctx: any) => handleBackToMainMenu(ctx));
}