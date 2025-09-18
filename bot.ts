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
import { registerGetUrcActions, handleGetUrcTextInput } from './src/commands/getUrc';
import { BOT_TOKEN, getInlineKeyboard } from './config';
import { withI18n, SUPPORTED_LOCALES, LANGUAGE_NAMES, Locale } from './src/i18n/i18n';
import { getUserNetwork, setUserNetwork } from './src/services/db';

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

// Settings menu
bot.action('menu_settings', async (ctx) => {
  const i18n = (ctx as any).i18n as { t: (k: string, p?: any) => string };
  const t = i18n.t;
  
  const buttons = [
    [{ text: t('buttons.language'), callback_data: 'menu_language' }],
    [{ text: t('buttons.network'), callback_data: 'menu_network' }],
    [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
  ];
  
  await ctx.reply(t('settings.menu_title'), {
    reply_markup: {
      inline_keyboard: buttons,
    },
  });
});

// Language menu
bot.action('menu_language', async (ctx) => {
  const i18n = (ctx as any).i18n as { t: (k: string, p?: any) => string };
  const t = i18n.t;
  const buttons = SUPPORTED_LOCALES.map((loc: Locale) => [
    { text: `${LANGUAGE_NAMES[loc]}`, callback_data: `set_lang_${loc}` },
  ]);
  
  // Add back to settings button
  buttons.push([
    { text: t('buttons.back_to_main'), callback_data: 'menu_settings' }
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
  
  // Return to settings menu in the selected language
  const t = i18n.t;
  const buttons = [
    [{ text: t('buttons.language'), callback_data: 'menu_language' }],
    [{ text: t('buttons.network'), callback_data: 'menu_network' }],
    [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
  ];
  
  await ctx.editMessageText(t('settings.menu_title'), {
    reply_markup: {
      inline_keyboard: buttons,
    },
    parse_mode: 'HTML'
  });
});

// Network menu
bot.action('menu_network', async (ctx) => {
  const i18n = (ctx as any).i18n as { t: (k: string, p?: any) => string };
  const t = i18n.t;
  const userId = ctx.from?.id;
  
  if (!userId) return;
  
  const currentNetwork = getUserNetwork(userId);
  
  const buttons = [
    [{ 
      text: `${currentNetwork === 'devnet' ? '✅ ' : ''}${t('network.devnet')}`, 
      callback_data: 'set_network_devnet' 
    }],
    [{ 
      text: `${currentNetwork === 'mainnet' ? '✅ ' : ''}${t('network.mainnet')}`, 
      callback_data: 'set_network_mainnet' 
    }],
    [{ text: t('buttons.back_to_main'), callback_data: 'menu_settings' }]
  ];
  
  await ctx.reply(t('network.menu_title'), {
    reply_markup: {
      inline_keyboard: buttons,
    },
  });
});

// Set network handler
bot.action(/^set_network_(.+)$/, async (ctx) => {
  const match = ctx.match as RegExpMatchArray | null;
  const network = match && match[1];
  const userId = ctx.from?.id;
  
  if (!network || !userId || !['devnet', 'mainnet'].includes(network)) return;
  
  const i18n = (ctx as any).i18n as { t: (k: string, p?: any) => string };
  const t = i18n.t;
  
  setUserNetwork(userId, network);
  
  // Answer the callback query first
  const networkName = network === 'devnet' ? t('network.devnet') : t('network.mainnet');
  await ctx.answerCbQuery(t('network.updated', { network: networkName }));
  
  // Return to settings menu
  const buttons = [
    [{ text: t('buttons.language'), callback_data: 'menu_language' }],
    [{ text: t('buttons.network'), callback_data: 'menu_network' }],
    [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
  ];
  
  await ctx.editMessageText(t('settings.menu_title'), {
    reply_markup: {
      inline_keyboard: buttons,
    },
    parse_mode: 'HTML'
  });
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
registerGetUrcActions(bot);

// Handle text messages
bot.on('text', async (ctx: any) => {
  // Check session state for specific inputs first
  if (ctx.session?.waitingForSplTokenMint) {
    await handleTokenMintInput(ctx);
  } else if (ctx.session?.waitingForSplRecipient) {
    await handleSplRecipientInput(ctx);
  } else if (ctx.session?.waitingForSplAmount) {
    await handleSplAmountInput(ctx);
  } else if (ctx.session?.waitingForSolRecipient) {
    await handleRecipientInput(ctx);
  } else if (ctx.session?.waitingForSolAmount) {
    await handleAmountInput(ctx);
  } else if (ctx.session?.waitingForMintDataAddress) {
    await handleMintDataAddressInput(ctx);
  } else if (ctx.session?.waitingForRefundMintAddress) {
    await handleRefundTextInput(ctx);
  } else if (ctx.session?.waitingForGetUrcValue) {
    await handleGetUrcTextInput(ctx);
  } else {
    // If no specific session state, try mint text input
    await handleMintTextInput(ctx);
  }
});

bot.action('menu_main', (ctx) => handleBackToMainMenu(ctx));

// Log that the bot is starting
console.log('✅ Flipflop Mint Bot is successfully running!');

// Launch the bot
bot.launch().catch((error) => {
  console.error('❌ Failed to launch the bot:', error);
});

// Handle graceful shutdown
process.on('SIGINT', () => bot.stop('SIGINT'));
process.on('SIGTERM', () => bot.stop('SIGTERM'));


