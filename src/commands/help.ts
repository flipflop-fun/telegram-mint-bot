import { Markup } from 'telegraf';

/**
 * Registers the help menu handler for the bot.
 */
export function registerHelpMenu(bot: any) {
  bot.action('menu_help', async (ctx: any) => {
    const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
    const helpMessage = await ctx.reply(t('help.text'), {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')],
        [Markup.button.callback(t('buttons.close'), 'close_help_message')],
      ]).reply_markup,
    });

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
