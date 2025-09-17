import { Markup } from 'telegraf';
import { PublicKey } from '@solana/web3.js';
import { getMintData } from '@flipflop-sdk/node';
import { RPC } from '../../config';

// Store user states for the mint data flow
const userStates = new Map<number, {
  step: 'enter_mint_address' | 'display_data';
  mintAddress?: string;
}>();

// Helper function to safely edit message or send new one if edit fails
async function safeEditOrReply(ctx: any, text: string, options: any) {
  try {
    await ctx.editMessageText(text, options);
  } catch (error) {
    console.log('Failed to edit message, sending new message instead:', error.message);
    // Remove reply_markup from options and send as new message
    const replyOptions = { ...options };
    await ctx.reply(text, replyOptions);
  }
}

/**
 * Handle mint data menu - allows users to view token information
 */
export async function handleMintData(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;

  if (!userId) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  // Reset user state
  userStates.set(userId, { step: 'enter_mint_address' });

  const menuText = t('mint_data.title');
  
  try {
    if (ctx.callbackQuery) {
      await safeEditOrReply(ctx, `${menuText}\n\n${t('mint_data.enter_mint_address')}`, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
        ]).reply_markup,
      });
    } else {
      await ctx.reply(`${menuText}\n\n${t('mint_data.enter_mint_address')}`, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
        ]).reply_markup,
      });
    }

    // Set up text message handler for mint address
    ctx.session = ctx.session || {};
    ctx.session.waitingForMintDataAddress = true;
  } catch (error) {
    console.error('Error in handleMintData:', error);
    await ctx.reply(t('common.error_try_again'));
  }
}

/**
 * Handle mint address input for data viewing
 */
export async function handleMintDataAddressInput(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  const mintAddress = ctx.message?.text?.trim();

  if (!userId || !mintAddress) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  // Validate Solana address
  try {
    new PublicKey(mintAddress);
  } catch (error) {
    await ctx.reply(t('mint.invalid_address'));
    return;
  }

  const userState = userStates.get(userId);
  if (!userState || userState.step !== 'enter_mint_address') {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  userState.mintAddress = mintAddress;
  userState.step = 'display_data';
  userStates.set(userId, userState);

  await ctx.reply(t('mint_data.processing'), {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
    ]).reply_markup,
  });

  try {
    // Get mint information using FlipFlop SDK
    const response = await getMintData({
      rpc: RPC,
      mint: mintAddress
    });
    
    // Check if the response is successful
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to fetch mint data');
    }
    
    const mintInfo = response.data;
    
    // Format the data display with enhanced information from FlipFlop SDK
    const dataText = `${t('mint_data.data_title')}\n\n` +
      `${t('mint_data.mint_address')}\n<code>${mintAddress}</code>\n` +
      `${t('mint_data.token_name')} ${mintInfo.name || t('mint_data.no_name')}\n` +
      `${t('mint_data.token_symbol')} ${mintInfo.symbol || t('mint_data.no_symbol')}\n` +
      `${t('mint_data.flipflop_url', { url: `https://${RPC.includes('devnet') ? 'test' : 'app'}.flipflop.plus/token/${mintAddress}` })}\n` +
      `${t('mint_data.current_supply')} ${mintInfo.currentSupply?.toLocaleString() || 'N/A'}\n` +
      `${t('mint_data.max_supply')} ${mintInfo.maxSupply ? mintInfo.maxSupply.toLocaleString() : t('mint_data.unlimited')}\n` +
      // `${t('mint_data.total_supply')} ${(mintInfo as any).supply?.toLocaleString() || 'N/A'}\n\n` +
      `${t('mint_data.admin')} ${mintInfo.admin ? `<code>${mintInfo.admin}</code>` : t('mint_data.no_authority')}\n` +
      // `${t('mint_data.config_account')} <code>${mintInfo.configAccount}</code>\n\n` +
      `${t('mint_data.current_era')} ${mintInfo.currentEra || 'N/A'}\n` +
      `${t('mint_data.current_epoch')} ${mintInfo.currentEpoch || 'N/A'}`;
      // `${t('mint_data.fee_rate')} ${mintInfo.feeRate ? (mintInfo.feeRate * 100).toFixed(2) + '%' : 'N/A'}\n\n` +
      // `${t('mint_data.is_mutable')} ${mintInfo.isMutable ? '✅' : '❌'}`;

    const explorerUrl = `https://explorer.solana.com/address/${mintAddress}${RPC.includes("devnet") ? "?cluster=devnet" : ""}`;

    await safeEditOrReply(ctx, dataText, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback(t('buttons.copy_mint_address'), `copy_mint_${mintAddress}`),
          Markup.button.url(t('buttons.view_on_explorer'), explorerUrl)
        ],
        [
          Markup.button.callback(t('buttons.check_another'), 'menu_mint_data'),
          Markup.button.callback(t('buttons.back_to_main'), 'menu_main')
        ]
      ]).reply_markup,
    });

  } catch (error) {
    console.error('Error fetching mint data:', error);
    let errorMessage = t('mint_data.fetch_error');
    
    if (error instanceof Error) {
      if (error.message.includes('Invalid public key')) {
        errorMessage = t('mint.invalid_address');
      } else if (error.message.includes('Account does not exist')) {
        errorMessage = t('mint_data.token_not_found');
      }
    }

    await safeEditOrReply(ctx, errorMessage, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback(t('buttons.try_again'), 'menu_mint_data'),
          Markup.button.callback(t('buttons.back_to_main'), 'menu_main')
        ]
      ]).reply_markup,
    });
  }

  // Clean up user state
  userStates.delete(userId);
  ctx.session.waitingForMintDataAddress = false;
}

/**
 * Handle copy actions for mint data
 */
export async function handleMintDataCopyAction(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const data = ctx.callbackQuery?.data;
  
  if (!data) return;

  if (data.startsWith('copy_mint_')) {
    const mintAddress = data.replace('copy_mint_', '');
    const message = t('mint_data.copy_mint_feedback', { address: mintAddress });
    await ctx.answerCbQuery(message, { show_alert: true });
  }
}

/**
 * Register mint data actions
 */
export function registerMintDataActions(bot: any) {
  bot.action('menu_mint_data', handleMintData);
  bot.action(/^copy_mint_/, handleMintDataCopyAction);
}