import { Markup } from 'telegraf';
import { getUserWallets } from '../services/db';

// Store user states for the set URC flow
const userStates = new Map<number, {
  step: 'enter_urc_value' | 'confirm_urc' | 'processing';
  urcData?: {
    urcValue?: string;
    selectedWallet?: { address: string; private_key: string };
  };
}>();

/**
 * Handle set URC menu
 */
export async function handleSetUrc(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  
  if (!userId) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  // Initialize user state
  const state = { step: 'enter_urc_value' as const, urcData: {} };
  userStates.set(userId, state);

  try {
    const message = t('set_urc.enter_value');
    
    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
          ]
        }
      });
    } else {
      await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
          ]
        }
      });
    }
  } catch (error) {
    console.error('Error in handleSetUrc:', error);
    await ctx.reply(t('common.error_try_again'));
  }
}

/**
 * Handle set URC text input
 */
export async function handleSetUrcTextInput(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  
  if (!userId) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  const state = userStates.get(userId);
  if (!state) {
    return;
  }

  const text = ctx.message?.text?.trim();
  if (!text) {
    return;
  }

  try {
    switch (state.step) {
      case 'enter_urc_value':
        await handleUrcValueInput(ctx, userId, text, t, state);
        break;
    }
  } catch (error) {
    console.error('Error in handleSetUrcTextInput:', error);
    await ctx.reply(t('common.error_try_again'));
  }
}

/**
 * Handle URC value input
 */
async function handleUrcValueInput(ctx: any, userId: number, text: string, t: any, state: any) {
  try {
    // Validate URC value (basic validation - adjust as needed)
    const urcValue = parseFloat(text);
    if (isNaN(urcValue) || urcValue < 0 || urcValue > 100) {
      await ctx.reply(t('set_urc.invalid_value'), {
        reply_markup: {
          inline_keyboard: [
            [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
          ]
        }
      });
      return;
    }
    
    state.urcData.urcValue = text;
    state.step = 'confirm_urc';
    userStates.set(userId, state);

    const message = t('set_urc.confirm_value', { urcValue: text });
    
    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: t('buttons.confirm'), callback_data: 'set_urc_confirm' },
            { text: t('buttons.cancel'), callback_data: 'set_urc_cancel' }
          ],
          [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
        ]
      }
    });
  } catch (error) {
    await ctx.reply(t('set_urc.invalid_value'), {
      reply_markup: {
        inline_keyboard: [
          [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
        ]
      }
    });
  }
}

/**
 * Handle set URC confirmation
 */
export async function handleSetUrcConfirmation(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  
  if (!userId) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  const state = userStates.get(userId);
  if (!state || !state.urcData?.urcValue) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  try {
    state.step = 'processing';
    userStates.set(userId, state);

    const processingMessage = t('set_urc.processing', { 
      urcValue: state.urcData.urcValue 
    });
    
    await ctx.editMessageText(processingMessage, {
      parse_mode: 'HTML'
    });

    // Get user wallets
    const wallets = await getUserWallets(userId);
    if (!wallets || wallets.length === 0) {
      await ctx.editMessageText(t('wallets.none'), {
        reply_markup: {
          inline_keyboard: [
            [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
          ]
        }
      });
      return;
    }

    // Use the first wallet for URC setting (or implement wallet selection)
    const selectedWallet = wallets[0];
    
    // TODO: Implement actual URC setting logic here
    // This would involve calling the appropriate SDK functions
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Mock success response
    const mockSignature = 'mock_urc_transaction_' + Date.now();
    
    const successMessage = t('set_urc.success', {
      urcValue: state.urcData.urcValue,
      signature: mockSignature,
      wallet: selectedWallet.address
    });

    await ctx.editMessageText(successMessage, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
        ]
      }
    });

    // Clean up state
    userStates.delete(userId);

  } catch (error) {
    console.error('Error in handleSetUrcConfirmation:', error);
    await ctx.editMessageText(t('set_urc.error'), {
      reply_markup: {
        inline_keyboard: [
          [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
        ]
      }
    });
    userStates.delete(userId);
  }
}

/**
 * Handle set URC cancellation
 */
export async function handleSetUrcCancellation(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  
  if (userId) {
    userStates.delete(userId);
  }

  await ctx.editMessageText(t('set_urc.cancelled'), {
    reply_markup: {
      inline_keyboard: [
        [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
      ]
    }
  });
}

/**
 * Register set URC actions
 */
export function registerSetUrcActions(bot: any) {
  bot.action('menu_set_urc', handleSetUrc);
  bot.action('set_urc_confirm', handleSetUrcConfirmation);
  bot.action('set_urc_cancel', handleSetUrcCancellation);
}