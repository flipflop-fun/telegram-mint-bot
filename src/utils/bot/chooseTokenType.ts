import { Markup } from 'telegraf';

/**
 * Sends a token type selection message.
 */
export async function chooseTokenType(ctx: any) {
  await ctx.reply(
    '💸 Choose the type of token to distribute:',
    Markup.inlineKeyboard([
      [Markup.button.callback('💰 Distribute SOL', 'distribute_sol')],
      [Markup.button.callback('🪙 Distribute SPL Tokens', 'distribute_spl')],
      [Markup.button.callback('🔙 Back to Main Menu', 'menu_main')],
    ])
  );
}

/**
 * Registers bot actions for token distribution wizards.
 */
export function registerTokenTypeActions(bot: any) {
  bot.action('distribute_sol', (ctx: any) => {
    ctx.scene.enter('distribute_sol_wizard');
  });

  bot.action('distribute_spl', (ctx: any) => {
    ctx.scene.enter('distribute_spl_wizard');
  });
}
