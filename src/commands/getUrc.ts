import { Markup } from 'telegraf';
import { getUrcData, GetUrcDataResponse } from '@flipflop-sdk/node';
import { getUserRpcUrl } from '../utils/solana/rpc';
import { UserStateManager, UserState } from '../utils/stateManager';
import { ApiResponse } from '@flipflop-sdk/node/dist/raydium/types';

// Define get URC state interface
interface GetUrcState extends UserState {
  step: 'enter_urc_value' | 'display_data';
  data: {
    urcValue?: string;
  };
}

// Create get URC state manager instance
const getUrcStateManager = new UserStateManager<GetUrcState>();

/**
 * Handle get URC menu
 */
export async function handleGetUrc(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  
  if (!userId) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  // Initialize user state
  getUrcStateManager.setState(userId, { step: 'enter_urc_value', data: {} });

  try {
    const message = t('get_urc.enter_value');
    
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
    ctx.session.waitingForGetUrcValue = true;
  } catch (error) {
    console.error('Error in handleGetUrc:', error);
    await ctx.reply(t('common.error_try_again'));
  }
}

/**
 * Handle text input for URC value
 */
export async function handleGetUrcTextInput(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  const text = ctx.message?.text?.trim();

  if (!userId || !text) {
    return;
  }

  const state = getUrcStateManager.getState(userId);
  if (!state || state.step !== 'enter_urc_value') {
    return;
  }

  // Clear the waiting flag
  if (ctx.session) {
    ctx.session.waitingForGetUrcValue = false;
  }

  await handleUrcValueInput(ctx, userId, text, t, state);
}

async function handleUrcValueInput(ctx: any, userId: number, text: string, t: any, state: GetUrcState) {
  try {
    // Validate URC value format
    if (!text || text.length < 3) {
      await ctx.reply(t('get_urc.invalid_value'), {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
        ]).reply_markup,
      });
      return;
    }

    // Update state
    if (!state.data) {
      state.data = {};
    }
    (state.data as any).urcValue = text;
    state.step = 'display_data';
    getUrcStateManager.updateState(userId, state);

    // Show loading message
    const loadingMessage = await ctx.reply('Loading...', {
      parse_mode: 'HTML'
    });

    try {
      // Fetch URC data using FlipFlop SDK
      const response = await getUrcData({
        rpc: getUserRpcUrl(userId),
        urc: text
      }) as ApiResponse<GetUrcDataResponse>;
      
      if (!response || !response.success || !response.data) {
        await ctx.telegram.editMessageText(
          loadingMessage.chat.id,
          loadingMessage.message_id,
          undefined,
          t('get_urc.not_found'),
          {
            parse_mode: 'HTML',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
            ]).reply_markup,
          }
        );
        getUrcStateManager.clearState(userId);
        return;
      }

      const urcData = response.data;
      
      // Format URC data for display
      const dataText = `${t('get_urc.title')}\n\n` +
        `${t('get_urc.urc_code')}: <code>${text}</code>\n` +
        `${t('get_urc.is_valid')}: ${urcData.isValid ? '✅' : '❌'}\n` +
        `${t('get_urc.referrer')}: <code>${urcData.referrerMain?.toString() || 'N/A'}</code>\n` +
        `${t('get_urc.usage_count')}: <b>${urcData.usageCount || 0}</b>\n`;

      const buttons = [
        // [Markup.button.callback(t('get_urc.copy_code'), `get_urc_copy_${text}`)],
        [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
      ];

      await ctx.telegram.editMessageText(
        loadingMessage.chat.id,
        loadingMessage.message_id,
        undefined,
        dataText,
        {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
        }
      );

      // Clean up user state
      getUrcStateManager.clearState(userId);

    } catch (error) {
      console.error('Error fetching URC data:', error);
      
      let errorMessage = t('get_urc.fetch_error');
      if (error.message) {
        errorMessage += `\n\n${t('common.error_details')}: ${error.message}`;
      }

      await ctx.telegram.editMessageText(
        loadingMessage.chat.id,
        loadingMessage.message_id,
        undefined,
        errorMessage,
        {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
          ]).reply_markup,
        }
      );

      // Clean up user state
      getUrcStateManager.clearState(userId);
    }
  } catch (error) {
    console.error('Error in handleUrcValueInput:', error);
    await ctx.reply(t('common.error_try_again'));
  }
}

/**
 * Handle URC copy action
 */
export async function handleGetUrcCopyAction(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const urcCode = ctx.match[1];

  await ctx.answerCbQuery(t('get_urc.copied_to_clipboard'));
  
  // Send the URC code as a separate message for easy copying
  await ctx.reply(`<code>${urcCode}</code>`, { parse_mode: 'HTML' });
}

/**
 * Register get URC actions
 */
export function registerGetUrcActions(bot: any) {
  bot.action('menu_get_urc', handleGetUrc);
  bot.action(/^get_urc_copy_(.+)$/, handleGetUrcCopyAction);
}