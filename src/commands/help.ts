import { Markup } from 'telegraf';

/**
 * Registers the help menu handler for the bot.
 */
export function registerHelpMenu(bot: any) {
  bot.action('menu_help', async (ctx: any) => {
    const helpMessage = await ctx.reply(
      `ℹ️ <b>How to Use Your Solmate:</b>\n\n` +
        `1️⃣ Use "💳 Generate Wallets" to create wallets.\n` +
        `2️⃣ Use "📜 My Wallets" to manage wallets.\n` +
        `3️⃣ Use "💸 Distribute Tokens" to send SOL or SPL tokens to your wallets.\n\n` +
        `⚠️ <b>Safety Reminders:</b>\n\n` +
        `🔒 Keep your private keys private.\n` +
        `💾 Save your .txt file securely.\n` +
        `🗑️ Delete the .txt file from the chat history for security.`,
      {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Back to Main Menu', 'menu_main')],
          [Markup.button.callback('❌ Close', 'close_help_message')],
        ]).reply_markup,
      }
    );

    ctx.session.helpMessageId = helpMessage.message_id;
  });

  bot.action('close_help_message', async (ctx: any) => {
    if (ctx.session?.helpMessageId) {
      try {
        await ctx.deleteMessage(ctx.session.helpMessageId);
        ctx.session.helpMessageId = null;
      } catch (err: any) {
        console.error('Error deleting help message:', err.message);
      }
    }
    await ctx.answerCbQuery();
  });
}
