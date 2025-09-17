import { Telegraf, Scenes, session } from 'telegraf';
import { handleGenerateWallets } from './src/commands/generateWallets';
import { handleMyWallets, handleViewKey, handleAddNewWallet, handleWalletPagination } from './src/commands/myWallets';
import { handleBackToMainMenu } from './src/utils/bot/navigation';
import { registerHelpMenu } from './src/commands/help';
import { registerMintActions, handleMintTextInput } from './src/commands/mint';
import { registerSendSolActions, handleRecipientInput, handleAmountInput } from './src/commands/sendSol';
import { registerSendSplActions, handleTokenMintInput, handleSplRecipientInput, handleSplAmountInput } from './src/commands/sendSpl';
import { registerMintDataActions, handleMintDataAddressInput } from './src/commands/mintData';
import { registerRefundActions, handleRefundTextInput } from './src/commands/refund';
import { registerSetUrcActions, handleSetUrcTextInput } from './src/commands/setUrc';
import { BOT_TOKEN, getInlineKeyboard } from './config';
import { withI18n, SUPPORTED_LOCALES, LANGUAGE_NAMES, Locale } from './src/i18n/i18n';

// Check if BOT_TOKEN is set
if (!BOT_TOKEN) {
  console.error('Error: BOT_TOKEN is not set. Please add your Telegram bot token in the .env file.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

const stage = new Scenes.Stage([]);
bot.use(session());
bot.use(withI18n());
bot.use(stage.middleware());

// Helper to render main menu with translations
async function renderMainMenu(ctx: any, editMessage = false) {
  const t = (ctx as any).i18n.t as (k: string, p?: any) => string;
  const menuText = `${t('welcome')}\n\n` +
    `${t('main_menu.title')}` +
    `${t('main_menu.desc')}`;
  
  const menuMarkup = {
    inline_keyboard: getInlineKeyboard(t),
  };

  if (editMessage && ctx.callbackQuery) {
    try {
      await ctx.editMessageText(menuText, {
        parse_mode: 'HTML',
        reply_markup: menuMarkup,
      });
    } catch (error) {
      // If editing fails, send a new message
      await ctx.reply(menuText, {
        parse_mode: 'HTML',
        reply_markup: menuMarkup,
      });
    }
  } else {
    await ctx.reply(menuText, {
      parse_mode: 'HTML',
      reply_markup: menuMarkup,
    });
  }
}

bot.start(async (ctx) => {
  await renderMainMenu(ctx);
});

// Language menu
bot.action('menu_language', async (ctx) => {
  const i18n = (ctx as any).i18n as { t: (k: string, p?: any) => string };
  const t = i18n.t;
  const buttons = SUPPORTED_LOCALES.map((loc: Locale) => [
    { text: `${LANGUAGE_NAMES[loc]}`, callback_data: `set_lang_${loc}` },
  ]);
  await ctx.reply(t('lang.menu_title'), {
    reply_markup: {
      inline_keyboard: buttons,
    },
  });
});

// Set language handler
bot.action(/^set_lang_(.+)$/, async (ctx) => {
  const match = ctx.match as RegExpMatchArray | null;
  const loc = (match && match[1]) as Locale;
  if (!loc || !SUPPORTED_LOCALES.includes(loc)) return;
  const i18n = (ctx as any).i18n as { setLocale: (l: Locale) => Promise<void>; t: (k: string, p?: any) => string };
  await i18n.setLocale(loc);
  
  // Answer the callback query first
  await ctx.answerCbQuery(i18n.t('lang.updated'));
  
  // Re-render main menu in the selected language by editing the current message
  await renderMainMenu(ctx, true);
});

handleGenerateWallets(bot);

bot.action('menu_my_wallets', (ctx) => handleMyWallets(ctx));
bot.action(/^view_key_(.+)$/, (ctx) => handleViewKey(ctx));
bot.action('add_new_wallet', (ctx) => handleAddNewWallet(ctx));

handleWalletPagination(bot);
registerHelpMenu(bot);
registerMintActions(bot);
registerMintDataActions(bot);
registerSendSolActions(bot);
registerSendSplActions(bot);
registerRefundActions(bot);
registerSetUrcActions(bot);

// Unified text handler for all text inputs
bot.on('text', async (ctx: any) => {
  // const userId = ctx.from?.id;
  // const text = ctx.message?.text;
  // console.log(`=== 文本输入调试 ===`);
  // console.log(`用户ID: ${userId}`);
  // console.log(`输入文本: ${text}`);
  // console.log(`Session状态:`, ctx.session);
  
  // Handle mint text inputs (check first as it doesn't use session flags)
  await handleMintTextInput(ctx);
  
  // Handle mint data text inputs
  if (ctx.session?.waitingForMintDataAddress) {
    // console.log(`处理代币数据地址输入: ${text}`);
    await handleMintDataAddressInput(ctx);
  }
  // Handle SOL sending text inputs
  else if (ctx.session?.waitingForSolRecipient) {
    // console.log(`处理SOL接收方地址输入: ${text}`);
    await handleRecipientInput(ctx);
  } else if (ctx.session?.waitingForSolAmount) {
    // console.log(`处理SOL金额输入: ${text}`);
    await handleAmountInput(ctx);
  }
  // Handle SPL sending text inputs
  else if (ctx.session?.waitingForSplTokenMint) {
    // console.log(`处理SPL代币mint地址输入: ${text}`);
    await handleTokenMintInput(ctx);
  } else if (ctx.session?.waitingForSplRecipient) {
    // console.log(`处理SPL接收方地址输入: ${text}`);
    await handleSplRecipientInput(ctx);
  } else if (ctx.session?.waitingForSplAmount) {
    // console.log(`处理SPL金额输入: ${text}`);
    await handleSplAmountInput(ctx);
  }
  // Handle refund text inputs
  else if (ctx.session?.waitingForRefundMintAddress) {
    await handleRefundTextInput(ctx);
  }
  // Handle set URC text inputs
  else if (ctx.session?.waitingForUrcValue) {
    await handleSetUrcTextInput(ctx);
  } else {
    // console.log(`没有匹配的文本处理器`);
  }
});

bot.action('menu_main', (ctx) => handleBackToMainMenu(ctx));

// Log that the bot is starting
console.log('✅ Solmate is successfully running!');

// Launch the bot
bot.launch().catch((error) => {
  console.error('❌ Failed to launch the bot:', error);
});

// Handle graceful shutdown
process.on('SIGINT', () => bot.stop('SIGINT'));
process.on('SIGTERM', () => bot.stop('SIGTERM'));


