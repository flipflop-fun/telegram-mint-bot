import { Markup } from 'telegraf';
import { getUserWallets } from '../services/db';
import { getUserRpcUrl } from '../utils/solana/rpc';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { 
  getMintData, 
  GetMintDataResponse, 
  loadKeypairFromBase58,
  refundToken,
  RefundTokenResponse
} from '@flipflop-sdk/node';
import { UserStateManager, UserState } from '../utils/stateManager';
import { getMyTokenBalance, getRefundAccountData } from '../services/viewBalances';
import { ApiResponse } from '@flipflop-sdk/node/dist/raydium/types';
import Decimal from 'decimal.js';

// Utility function to convert lamports to SOL with precise BigDecimal arithmetic
function formatLamportsToSol(lamports: number | string | bigint): string {
  try {
    // Convert input to Decimal for precise arithmetic
    const lamportsDecimal = new Decimal(lamports.toString());
    const lamportsPerSolDecimal = new Decimal(LAMPORTS_PER_SOL.toString());
    
    // Perform precise division
    const sol = lamportsDecimal.dividedBy(lamportsPerSolDecimal);
    
    // Format to 9 decimal places (Solana's precision)
    return `${sol.toString()} SOL`;
  } catch (error) {
    // Fallback for invalid inputs
    console.error('Error formatting lamports to SOL:', error);
    return `${lamports.toString()} Lamports`;
  }
}

// defining refund process state type
interface RefundState extends UserState {
  step: 'enter_mint_address' | 'select_wallet' | 'confirm_refund' | 'processing';
  data?: {
    mintAddress?: string;
    selectedWallet?: { address: string; private_key: string };
  };
}

// creating refund process state manager
const refundStateManager = new UserStateManager<RefundState>();

/**
 * Handle refund menu
 */
export async function handleRefund(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  
  if (!userId) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  // Initialize user state
  refundStateManager.setState(userId, { 
    step: 'enter_mint_address' as const, 
    data: {} 
  });

  // Set session flag to indicate we're waiting for refund mint address input
  ctx.session = ctx.session || {};
  ctx.session.waitingForRefundMintAddress = true;

  try {
    const message = t('refund.enter_mint_address');
    
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
    console.error('Error in handleRefund:', error);
    await ctx.reply(t('common.error_try_again'));
  }
}

/**
 * Handle refund text input
 */
export async function handleRefundTextInput(ctx: any) {
  const userId = ctx.from?.id;
  const t = (ctx as any).i18n.t as (k: string, p?: any) => string;
  
  if (!userId) {
    await ctx.reply(t('refund.no_user_info'));
    return;
  }

  const state = refundStateManager.getState(userId);
  if (!state) {
    await ctx.reply(t('refund.session_expired'));
    return;
  }

  const text = ctx.message?.text?.trim();
  if (!text) {
    return;
  }

  try {
    switch (state.step) {
      case 'enter_mint_address':
        // Clear the session flag since we're processing the input
        ctx.session = ctx.session || {};
        ctx.session.waitingForRefundMintAddress = false;
        
        await handleMintAddressInput(ctx, userId, text, t, state);
        break;
    }
  } catch (error) {
    console.error('Error in handleRefundTextInput:', error);
    
    // Clear session flag on error
    ctx.session = ctx.session || {};
    ctx.session.waitingForRefundMintAddress = false;
    
    // Provide more specific error messages based on error type
    let errorMessage = t('common.error_try_again');
    
    if (error instanceof Error) {
      if (error.message.includes('Invalid public key')) {
        errorMessage = t('refund.invalid_mint_address');
      } else if (error.message.includes('Network')) {
        errorMessage = t('refund.network_error');
      } else if (error.message.includes('timeout')) {
        errorMessage = t('refund.timeout_error');
      } else {
        errorMessage = t('refund.processing_error', { error: error.message });
      }
    }
    
    await ctx.reply(errorMessage, {
      reply_markup: {
        inline_keyboard: [
          [{ text: t('buttons.retry_refund'), callback_data: 'menu_refund' }],
          [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
        ]
      }
    });
  }
}

/**
 * Handle mint address input with improved error handling
 */
async function handleMintAddressInput(ctx: any, userId: number, text: string, t: any, state: any) {
  try {
    // Validate mint address format with better error handling
    let mintPublicKey: PublicKey;
    try {
      mintPublicKey = new PublicKey(text);
    } catch (error) {
      await ctx.reply(t('refund.invalid_mint_address'), {
        reply_markup: {
          inline_keyboard: [
            [{ text: t('buttons.retry_refund'), callback_data: 'menu_refund' }],
            [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
          ]
        }
      });
      return;
    }
    
    try {
      // validating token existence with timeout handling
      const mintDataPromise = getMintData({
        rpc: getUserRpcUrl(userId),
        mint: mintPublicKey
      });
      // setting 30 seconds timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Token validation timeout')), 30000);
      });
      
      const mintData = await Promise.race([mintDataPromise, timeoutPromise]) as any;
      if (!mintData || !mintData.success) {
        await ctx.editMessageText(
          t('refund.token_not_found'),
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: t('buttons.retry_refund'), callback_data: 'menu_refund' }],
                [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
              ]
            }
          }
        );
        return;
      }
      
      // getting user wallets and showing selection
      const wallets = getUserWallets(userId);
      if (wallets.length === 0) {
        await ctx.reply(t('refund.no_wallets'), {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
          ]).reply_markup,
        });
        return;
      }
      
      // if only one wallet, select and jump to confirmation
      if (wallets.length === 1) {
        const selectedWallet = wallets[0];
        refundStateManager.updateState(userId, {
          step: 'confirm_refund',
          data: {
            ...state.data,
            mintAddress: text,
            selectedWallet
          }
        });
        
        // showing confirmation message
        await ctx.editMessageText(
          t('refund.confirm_refund', { 
            mintAddress: text,
            wallet: `${selectedWallet.address.slice(0, 8)}...${selectedWallet.address.slice(-8)}`
          }),
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: t('buttons.confirm_refund'), callback_data: 'refund_confirm' }],
                [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
              ]
            }
          }
        );
        return;
      }
      
      // showing wallet selection interface when multiple wallets exist
      const walletButtons = wallets.map((wallet, index) => {
        const shortAddress = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-6)}`;
        return [Markup.button.callback(`${index + 1}. ${shortAddress}`, `refund_wallet_${index}`)];
      });
      
      // updating state to wallet selection step
      refundStateManager.updateState(userId, {
        step: 'select_wallet',
        data: {
          ...state.data,
          mintAddress: text
        }
      });
      
      const menuMarkup = {
        inline_keyboard: [
          ...walletButtons,
          [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }],
        ],
      };

      const menuText = t('refund.select_wallet');

      try {
        if (ctx.callbackQuery) {
          await ctx.editMessageText(`${menuText}`, {
            parse_mode: 'HTML',
            reply_markup: menuMarkup,
          });
        } else {
          await ctx.reply(`${menuText}`, {
            parse_mode: 'HTML',
            reply_markup: menuMarkup,
          });
        }
      } catch (error) {
        console.error('Error in wallet selection:', error);
        await ctx.reply(t('common.error_try_again'));
      }

    } catch (tokenError) {
      console.error('Token validation error:', tokenError);
      
      let errorMessage = t('refund.token_not_found');
      
      if (tokenError instanceof Error) {
        if (tokenError.message.includes('timeout')) {
          errorMessage = t('refund.timeout_error');
        } else if (tokenError.message.includes('Network')) {
          errorMessage = t('refund.network_error');
        } else if (tokenError.message.includes('not found')) {
          errorMessage = t('refund.token_not_found');
        } else {
          errorMessage = t('refund.processing_error', { error: tokenError.message });
        }
      }
      
      await ctx.editMessageText(errorMessage, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t('buttons.retry_refund'), callback_data: 'menu_refund' }],
            [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
          ]
        }
      });
    }
    
  } catch (error) {
    console.error('Error in handleMintAddressInput:', error);
    await ctx.reply(t('refund.invalid_mint_address'), {
      reply_markup: {
        inline_keyboard: [
          [{ text: t('buttons.retry_refund'), callback_data: 'menu_refund' }],
          [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
        ]
      }
    });
  }
}



/**
 * Handle refund confirmation with enhanced error handling
 */
async function handleRefundConfirmation(ctx: any) {
  const userId = ctx.from?.id;
  const t = (ctx as any).i18n.t as (k: string, p?: any) => string;
  
  if (!userId) {
    await ctx.editMessageText(t('refund.no_user_info'), {
      reply_markup: {
        inline_keyboard: [
          [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
        ]
      }
    });
    return;
  }
  const state = refundStateManager.getState(userId);
  if (!state || !state.data?.mintAddress || !state.data?.selectedWallet) {
    await ctx.editMessageText(t('refund.session_expired'), {
      reply_markup: {
        inline_keyboard: [
          [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
        ]
      }
    });
    return;
  }

  try {
    // Update state to processing
    refundStateManager.updateState(userId, { step: 'processing' });
    // Show processing message
    await ctx.editMessageText(
      t('refund.processing', { mintAddress: state.data.mintAddress }),
      { parse_mode: 'HTML' }
    );
    const refundWallet = state.data.selectedWallet;
    try {
      // Checking the balance of token before refund
      const balance = await getMyTokenBalance(new PublicKey(refundWallet.address), new PublicKey(state.data.mintAddress), userId);
      if (balance.value.amount === "0") {
        throw new Error("Balance is 0");
      }
      // Get total mint amount
      const refundData = await getRefundAccountData(new PublicKey(refundWallet.address), new PublicKey(state.data.mintAddress), userId);
      const totalMintedTokens = refundData.totalMintFee;
      if (totalMintedTokens.toString() !== balance.value.amount.toString()) {
        throw new Error(t('refund.minted_amount_mismatch', {
          mintedAmount: formatLamportsToSol(totalMintedTokens),
          walletBalance: formatLamportsToSol(balance.value.amount)
        }));
      }
      // Load keypair with error handling
      const keypair = loadKeypairFromBase58(refundWallet.private_key);
      // Get token information with timeout
      const tokenInfoPromise = getMintData({
        rpc: getUserRpcUrl(userId),
        mint: new PublicKey(state.data.mintAddress)
      });
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Token info fetch timeout')), 30000);
      });
      
      const tokenResponse = await Promise.race([tokenInfoPromise, timeoutPromise]) as ApiResponse<GetMintDataResponse>;
      if (!tokenResponse || !tokenResponse.success) {
        throw new Error('Failed to fetch token information');
      }
      const tokenInfo = tokenResponse.data;
      // Execute the actual refund using flipflop SDK with timeout
      const refundPromise = refundToken({
        rpc: getUserRpcUrl(userId),
        mint: new PublicKey(state.data.mintAddress),
        owner: keypair
      });
      const refundTimeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Refund transaction timeout')), 60000);
      });
      const refundResult = await Promise.race([refundPromise, refundTimeoutPromise]) as ApiResponse<RefundTokenResponse>;
      if (!refundResult || !refundResult.success) {
        const errorMsg = refundResult?.message || 'Refund transaction failed';
        throw new Error(errorMsg);
      }
      const successMessage = t('refund.success', {
        mintAddress: state.data.mintAddress,
        tokenName: tokenInfo.name || t('mint_data.no_name'),
        tokenSymbol: tokenInfo.symbol || t('mint_data.no_name'),
        signature: refundResult.data.tx || 'N/A',
        wallet: refundWallet.address,
      });
      await ctx.editMessageText(successMessage, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
          ]
        }
      });
    } catch (refundError) {
      console.error('Refund processing error:', refundError);
      
      let errorMessage = t('refund.processing_error', {
        error: refundError instanceof Error ? refundError.message : 'Unknown error'
      });
      
      // Provide more specific error messages
      if (refundError instanceof Error) {
        if (refundError.message.includes('timeout')) {
          errorMessage = t('refund.timeout_error');
        } else if (refundError.message.includes('insufficient')) {
          errorMessage = t('refund.insufficient_balance');
        } else if (refundError.message.includes('not found')) {
          errorMessage = t('refund.token_not_found');
        } else if (refundError.message.includes('Network')) {
          errorMessage = t('refund.network_error');
        } else if (refundError.message.includes('Invalid')) {
          errorMessage = t('refund.invalid_transaction');
        } else {
          errorMessage = t('refund.processing_error', { error: refundError.message });
        }
      }
      
      await ctx.editMessageText(errorMessage, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t('buttons.retry_refund'), callback_data: 'menu_refund' }],
            [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
          ]
        }
      });
    }

    // Clean up state and session
    refundStateManager.clearState(userId);
    ctx.session = ctx.session || {};
    ctx.session.waitingForRefundMintAddress = false;

  } catch (error) {
    console.error('Error in handleRefundConfirmation:', error);
    
    let errorMessage = t('refund.error');
    
    if (error instanceof Error) {
      errorMessage = t('refund.processing_error', { error: error.message });
    }
    
    await ctx.editMessageText(errorMessage, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: t('buttons.retry_refund'), callback_data: 'menu_refund' }],
          [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
        ]
      }
    });
    
    // Clean up state and session
    refundStateManager.clearState(userId);
    ctx.session = ctx.session || {};
    ctx.session.waitingForRefundMintAddress = false;
  }
}

/**
 * Handle refund cancellation
 */
async function handleRefundCancellation(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  
  if (userId) {
    refundStateManager.clearState(userId);
  }

  // Clear session flag
  ctx.session = ctx.session || {};
  ctx.session.waitingForRefundMintAddress = false;

  await ctx.editMessageText(t('refund.cancelled'), {
    reply_markup: {
      inline_keyboard: [
        [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
      ]
    }
  });
}

/**
 * Register refund actions
 */
export function registerRefundActions(bot: any) {
  bot.action('menu_refund', handleRefund);
  bot.action('refund_confirm', handleRefundConfirmation);
  bot.action('refund_cancel', handleRefundCancellation);
  
  // Handle wallet selection callbacks - inline handler
  bot.action(/^refund_wallet_\d+$/, async (ctx: any) => {
    const userId = ctx.from?.id;
    const t = (ctx as any).i18n.t as (k: string, p?: any) => string;
    
    if (!userId) {
      await ctx.reply(t('refund.no_user_info'));
      return;
    }

    const state = refundStateManager.getState(userId);
    if (!state || state.step !== 'select_wallet') {
      await ctx.reply(t('refund.session_expired'));
      return;
    }

    const callbackData = ctx.callbackQuery?.data;
    if (!callbackData || !callbackData.startsWith('refund_wallet_')) {
      await ctx.reply(t('common.error_try_again'));
      return;
    }
    
    const walletIndex = parseInt(callbackData.replace('refund_wallet_', ''));
    const wallets = getUserWallets(userId);

    if (!wallets || walletIndex >= wallets.length) {
      await ctx.reply(t('common.error_try_again'));
      return;
    }

    const selectedWallet = wallets[walletIndex];
    
    refundStateManager.updateState(userId, {
      step: 'confirm_refund',
      data: {
        ...state.data,
        selectedWallet: selectedWallet
      }
    });
    
    await ctx.editMessageText(
      t('refund.confirm_refund', { 
        mintAddress: state.data?.mintAddress,
        wallet: `${selectedWallet.address.slice(0, 8)}...${selectedWallet.address.slice(-8)}`
      }),
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t('buttons.confirm_refund'), callback_data: 'refund_confirm' }],
            [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
          ]
        }
      }
    );
  });
}