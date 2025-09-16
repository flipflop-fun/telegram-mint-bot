import { Markup } from 'telegraf';
import { handleBackToMainMenu } from '../utils/bot/navigation';

/**
 * Handle refund menu
 */
export async function handleRefund(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  
  const menuText = `💰 <b>退款</b>\n\n` +
    `选择退款类型：`;
  
  const menuMarkup = {
    inline_keyboard: [
      [{ text: '💰 SOL 退款', callback_data: 'refund_sol' }],
      [{ text: '🪙 SPL 代币退款', callback_data: 'refund_spl' }],
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
    console.error('Error in handleRefund:', error);
    await ctx.reply('❌ 发生错误，请重试。');
  }
}

/**
 * Handle SOL refund
 */
export async function handleRefundSol(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  
  await ctx.reply('🚧 SOL 退款功能正在开发中...', {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔙 返回主菜单', 'menu_main')]
    ]).reply_markup,
  });
}

/**
 * Handle SPL token refund
 */
export async function handleRefundSpl(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  
  await ctx.reply('🚧 SPL 代币退款功能正在开发中...', {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔙 返回主菜单', 'menu_main')]
    ]).reply_markup,
  });
}

/**
 * Register refund-related bot actions
 */
export function registerRefundActions(bot: any) {
  bot.action('menu_refund', handleRefund);
  bot.action('refund_sol', handleRefundSol);
  bot.action('refund_spl', handleRefundSpl);
}