import { Telegraf, Markup, Scenes, session } from 'telegraf';
import { handleGenerateWallets } from './src/commands/generateWallets';
import { handleMyWallets, handleViewKey, handleRemoveWallet, handleAddNewWallet, handleWalletPagination } from './src/commands/myWallets';
import { handleBackToMainMenu } from './src/utils/bot/navigation';
import { registerHelpMenu } from './src/commands/help';
import { registerMintActions } from './src/commands/mint';
import { registerRefundActions } from './src/commands/refund';
import { BOT_TOKEN } from './config';
import { withI18n, SUPPORTED_LOCALES, LANGUAGE_NAMES, Locale } from './src/i18n/i18n';
import { getInlineKeyboard } from './src/utils/config';

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
registerRefundActions(bot);

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


