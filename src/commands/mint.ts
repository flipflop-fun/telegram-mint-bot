import { Markup } from 'telegraf';
import { handleBackToMainMenu } from '../utils/bot/navigation';

/**
 * Handle mint tokens menu
 */
export async function handleMint(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  
  const menuText = `🪙 <b>铸造代币</b>\n\n` +
    `选择要铸造的代币类型：`;
  
  const menuMarkup = {
    inline_keyboard: [
      [{ text: '🪙 铸造 SPL 代币', callback_data: 'mint_spl' }],
      [{ text: '🔙 返回主菜单', callback_data: 'menu_main' }],
    ],
  };

  try {
    if (ctx.callbackQuery) {
      await ctx.editMessageText(menuText, {
        parse_mode: 'HTML',
        reply_markup: menuMarkup,
      });
    } else {
      await ctx.reply(menuText, {
        parse_mode: 'HTML',
        reply_markup: menuMarkup,
      });
    }
  } catch (error) {
    console.error('Error in handleMint:', error);
    await ctx.reply('❌ 发生错误，请重试。');
  }
}

/**
 * Handle mint SPL tokens
 */
export async function handleMintSpl(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  
  await ctx.reply('🚧 铸造 SPL 代币功能正在开发中...', {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔙 返回主菜单', 'menu_main')]
    ]).reply_markup,
  });
}

/**
 * Register mint-related bot actions
 */
export function registerMintActions(bot: any) {
  bot.action('menu_mint', handleMint);
  bot.action('mint_spl', handleMintSpl);
}