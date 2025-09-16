import { Markup } from 'telegraf';
import { handleBackToMainMenu } from '../utils/bot/navigation';
import { refundToken, loadKeypairFromBase58, RefundTokenOptions } from '@flipflop-sdk/node';
import { PublicKey } from '@solana/web3.js';
import { RPC } from '../../config';
import { getUserWallets } from '../services/db';

// Store user states for the refund flow
const userStates: { [userId: string]: { step: string; mintAddress?: string } } = {};

/**
 * Handle refund menu
 */
export async function handleRefund(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  
  const menuText = `💰 <b>退款</b>\n\n` +
    `选择退款类型：`;
  
  const menuMarkup = {
    inline_keyboard: [
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
 * Handle SPL token refund
 */
export async function handleRefundSpl(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id?.toString();
  
  if (!userId) {
    await ctx.reply('❌ 无法获取用户信息');
    return;
  }

  // Initialize user state
  userStates[userId] = { step: 'waiting_mint_address' };
  
  const instructionText = `🪙 <b>SPL 代币退款</b>\n\n` +
    `请输入要退款的代币地址（Mint Address）：\n\n` +
    `💡 <i>提示：代币地址是一个以字母和数字组成的长字符串</i>`;

  await ctx.editMessageText(instructionText, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔙 返回退款菜单', 'menu_refund')]
    ]).reply_markup,
  });
}

/**
 * Handle text input for refund process
 */
export async function handleRefundTextInput(ctx: any) {
  const userId = ctx.from?.id?.toString();
  const text = ctx.message?.text?.trim();
  
  if (!userId || !userStates[userId] || !text) {
    return;
  }

  const userState = userStates[userId];
  
  if (userState.step === 'waiting_mint_address') {
    try {
      // Validate mint address
      const mintAddress = new PublicKey(text);
      userState.mintAddress = text;
      userState.step = 'confirming_refund';
      
      const confirmText = `🪙 <b>确认退款信息</b>\n\n` +
        `💰 代币地址: <code>${text}</code>\n\n` +
        `⚠️ <b>注意：</b>\n` +
        `• 退款操作不可逆转\n` +
        `• 将退还您在此代币中的所有投资\n` +
        `• 可能会收取一定的退款手续费\n\n` +
        `确认要进行退款吗？`;

      await ctx.reply(confirmText, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('✅ 确认退款', `confirm_refund_${userId}`)],
          [Markup.button.callback('❌ 取消', 'menu_refund')]
        ]).reply_markup,
      });
      
    } catch (error) {
      await ctx.reply(
        `❌ 无效的代币地址格式\n\n` +
        `请输入正确的代币地址（Mint Address）：`,
        {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('🔙 返回退款菜单', 'menu_refund')]
          ]).reply_markup,
        }
      );
    }
  }
}

/**
 * Handle refund confirmation
 */
export async function handleRefundConfirmation(ctx: any) {
  const userId = ctx.from?.id?.toString();
  
  if (!userId || !userStates[userId]) {
    await ctx.reply('❌ 会话已过期，请重新开始');
    return;
  }

  const userState = userStates[userId];
  const mintAddress = userState.mintAddress;
  
  if (!mintAddress) {
    await ctx.reply('❌ 代币地址信息丢失，请重新开始');
    return;
  }

  try {
    // Show processing message
    await ctx.editMessageText(
      `⏳ <b>正在处理退款...</b>\n\n` +
      `💰 代币地址: <code>${mintAddress}</code>\n\n` +
      `请稍候，这可能需要几秒钟时间...`,
      { parse_mode: 'HTML' }
    );

    // Get user wallets
    const userWallets = getUserWallets(parseInt(userId));
    if (!userWallets || userWallets.length === 0) {
      throw new Error('未找到用户钱包');
    }

    // Use the first wallet for refund
    const userWallet = userWallets[0];

    // Prepare refund options
    const refundOptions: RefundTokenOptions = {
      rpc: RPC,
      mint: new PublicKey(mintAddress),
      owner: loadKeypairFromBase58(userWallet.private_key),
    };

    // Execute refund
    const result = await refundToken(refundOptions);
    
    if (result.success && result.data) {
      const successText = `🎉 <b>退款成功！</b>\n\n` +
        `💰 代币地址: <code>${mintAddress}</code>\n` +
        `📄 交易哈希: <code>${result.data.tx}</code>\n` +
        `💳 退款钱包: ${userWallet.address}\n\n` +
        `退款已成功处理，资金将返回到您的钱包中。`;

      await ctx.editMessageText(successText, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔙 返回主菜单', 'menu_main')]
        ]).reply_markup,
      });
    } else {
      throw new Error(result.message || 'Unknown refund error');
    }

    // Clear user state
    delete userStates[userId];

  } catch (error) {
    console.error('Refund error:', error);
    
    const errorText = `❌ <b>退款失败</b>\n\n` +
      `错误信息: ${error instanceof Error ? error.message : '未知错误'}\n\n` +
      `可能的原因：\n` +
      `• 代币地址不存在\n` +
      `• 您没有该代币的投资记录\n` +
      `• 网络连接问题\n` +
      `• 代币不支持退款\n\n` +
      `请检查代币地址并重试。`;

    await ctx.editMessageText(errorText, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔄 重试', 'refund_spl')],
        [Markup.button.callback('🔙 返回主菜单', 'menu_main')]
      ]).reply_markup,
    });

    // Clear user state
    delete userStates[userId];
  }
}

/**
 * Register refund-related bot actions
 */
export function registerRefundActions(bot: any) {
  bot.action('menu_refund', handleRefund);
  bot.action('refund_spl', handleRefundSpl);
  
  // Handle refund confirmation
  bot.action(/^confirm_refund_(.+)$/, handleRefundConfirmation);
  
  // Handle text input for refund process
  bot.on('text', (ctx: any, next: any) => {
    const userId = ctx.from?.id?.toString();
    if (userId && userStates[userId]) {
      return handleRefundTextInput(ctx);
    }
    return next();
  });
}