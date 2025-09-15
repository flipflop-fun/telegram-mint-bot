import { Telegraf, Markup, Scenes, session } from 'telegraf';
import { distributeSolWizard } from './src/commands/distribute/distributeSolWizard';
import { distributeSplWizard } from './src/commands/distribute/distributeSplWizard';
import { handleGenerateWallets } from './src/commands/generateWallets';
import { handleMyWallets, handleViewKey, handleRemoveWallet, handleAddNewWallet, handleWalletPagination } from './src/commands/myWallets';
import { handleBackToMainMenu } from './src/utils/bot/navigation';
import { chooseTokenType, registerTokenTypeActions } from './src/utils/bot/chooseTokenType';
import { registerHelpMenu } from './src/commands/help';
import { BOT_TOKEN } from './config';

// Check if BOT_TOKEN is set
if (!BOT_TOKEN) {
  console.error('Error: BOT_TOKEN is not set. Please add your Telegram bot token in the .env file.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

const stage = new Scenes.Stage([distributeSolWizard, distributeSplWizard]);
bot.use(session());
bot.use(stage.middleware());

// Token Distribution Menu
bot.action('menu_distribute_tokens', async (ctx) => {
  await chooseTokenType(ctx);
});

// Register Token Type Actions
registerTokenTypeActions(bot);

bot.start((ctx) => {
  ctx.reply(
    `👋 Welcome to your SolMate\n\n` +
      `📋 <b>Main Menu</b>\n\n` +
      `Use the buttons below to navigate through the available features:`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💳 Generate Wallets', callback_data: 'menu_generate_wallets' }],
          [{ text: '📜 My Wallets', callback_data: 'menu_my_wallets' }],
          [{ text: '💸 Distribute Tokens', callback_data: 'menu_distribute_tokens' }],
          [{ text: 'ℹ️ Help', callback_data: 'menu_help' }],
        ],
      },
    }
  );
});

handleGenerateWallets(bot);

bot.action('menu_my_wallets', (ctx) => handleMyWallets(ctx));
bot.action(/^view_key_(.+)$/, (ctx) => handleViewKey(ctx));
bot.action(/^remove_wallet_(.+)$/, (ctx) => handleRemoveWallet(ctx));
bot.action('add_new_wallet', (ctx) => handleAddNewWallet(ctx));

handleWalletPagination(bot);
registerHelpMenu(bot);

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


