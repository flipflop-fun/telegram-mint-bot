import { Markup } from 'telegraf';
import { getUserWallets } from '../services/db';
import { UserStateManager, UserState } from '../utils/stateManager';

// Define set URC state interface
interface SetUrcState extends UserState {
  step: 'enter_urc_value' | 'confirm_urc' | 'processing';
  data: {
    urcValue?: string;
    selectedWallet?: { address: string; private_key: string };
  };
}

// Create set URC state manager instance
const setUrcStateManager = new UserStateManager<SetUrcState>();

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
  setUrcStateManager.setState(userId, { step: 'enter_urc_value', data: {} });

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

    // Set up text message handler
    ctx.session = ctx.session || {};
    ctx.session.waitingForUrcValue = true;
  } catch (error) {
    console.error('Error in handleSetUrc:', error);
    await ctx.reply(t('common.error_try_again'));
  }
}

/**
 * Handle text input for URC value
 */
export async function handleSetUrcTextInput(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  const text = ctx.message?.text?.trim();

  if (!userId || !text) {
    return;
  }

  const state = setUrcStateManager.getState(userId);
  if (!state || state.step !== 'enter_urc_value') {
    return;
  }

  // Clear the waiting flag
  if (ctx.session) {
    ctx.session.waitingForUrcValue = false;
  }

  await handleUrcValueInput(ctx, userId, text, t, state);
}

async function handleUrcValueInput(ctx: any, userId: number, text: string, t: any, state: SetUrcState) {
  try {
    // Validate URC value format (should be a valid URL or identifier)
    if (!text || text.length < 3) {
      await ctx.reply(t('set_urc.invalid_value'));
      return;
    }

    // Update state with URC value
    if (!state.data) {
      state.data = {};
    }
    (state.data as any).urcValue = text;
    state.step = 'confirm_urc';
    setUrcStateManager.updateState(userId, state);

    // Get user wallets for selection
    const wallets = getUserWallets(userId);
    
    if (wallets.length === 0) {
      await ctx.reply(t('common.no_wallets'), {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
        ]).reply_markup,
      });
      return;
    }

    // Show confirmation with wallet selection
    const walletButtons = wallets.map((wallet, index) => {
      const shortAddress = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-6)}`;
      return [Markup.button.callback(`${index + 1}. ${shortAddress}`, `set_urc_wallet_${index}`)];
    });

    const confirmText = `${t('set_urc.confirm_title')}\n\n` +
      `${t('set_urc.urc_value')}: <code>${text}</code>\n\n` +
      `${t('set_urc.select_wallet')}`;

    await ctx.reply(confirmText, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        ...walletButtons,
        [Markup.button.callback(t('buttons.cancel'), 'set_urc_cancel')]
      ]).reply_markup,
    });
  } catch (error) {
    console.error('Error in handleUrcValueInput:', error);
    await ctx.reply(t('common.error_try_again'));
  }
}

/**
 * Handle URC confirmation and wallet selection
 */
export async function handleSetUrcConfirmation(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  const walletIndex = parseInt(ctx.match[1]);

  if (!userId) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  const state = setUrcStateManager.getState(userId);
  if (!state || state.step !== 'confirm_urc' || !state.data?.urcValue) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  const wallets = getUserWallets(userId);
  if (walletIndex < 0 || walletIndex >= wallets.length) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  const selectedWallet = wallets[walletIndex];
  
  // Update state with selected wallet
  if (!state.data) {
    state.data = {};
  }
  (state.data as any).selectedWallet = selectedWallet;
  state.step = 'processing';
  setUrcStateManager.updateState(userId, state);

  try {
    await ctx.editMessageText(t('set_urc.processing'), { parse_mode: 'HTML' });

    // Simulate URC setting process (replace with actual implementation)
    await new Promise(resolve => setTimeout(resolve, 2000));

    const successText = `${t('set_urc.success_title')}\n\n` +
      `${t('set_urc.urc_value')}: <code>${state.data.urcValue}</code>\n` +
      `${t('set_urc.wallet_address')}: <code>${selectedWallet.address}</code>\n\n` +
      `${t('set_urc.success_message')}`;

    await ctx.editMessageText(successText, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
      ]).reply_markup,
    });

    // Clean up user state
    setUrcStateManager.clearState(userId);
  } catch (error) {
    console.error('Error in handleSetUrcConfirmation:', error);
    
    const errorText = `${t('set_urc.error_title')}\n\n` +
      `${t('set_urc.error_message')}\n\n` +
      `${t('common.error_details')}: ${error.message || 'Unknown error'}`;

    await ctx.editMessageText(errorText, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
      ]).reply_markup,
    });

    // Clean up user state
    setUrcStateManager.clearState(userId);
  }
}

/**
 * Handle URC cancellation
 */
export async function handleSetUrcCancellation(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;

  if (!userId) {
    return;
  }

  // Clean up user state
  setUrcStateManager.clearState(userId);

  await ctx.editMessageText(t('set_urc.cancelled'), {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
    ]).reply_markup,
  });
}

/**
 * Register set URC actions
 */
export function registerSetUrcActions(bot: any) {
  bot.action('menu_set_urc', handleSetUrc);
  bot.action(/^set_urc_wallet_(\d+)$/, handleSetUrcConfirmation);
  bot.action('set_urc_cancel', handleSetUrcCancellation);
}