import { Markup } from 'telegraf';
import { getUserWallets } from '../services/db';
import { RPC } from '../../config';
import { 
  launchToken, 
  mintToken, 
  generateMetadataUri,
  loadKeypairFromBase58,
  LaunchTokenOptions,
  MintTokenOptions,
} from '@flipflop-sdk/node';
import { PublicKey } from '@solana/web3.js';
import { UserStateManager, UserState } from '../utils/stateManager';

// Define mint state interface
interface MintState extends UserState {
  step: 'select_action' | 'launch_token' | 'enter_name' | 'enter_symbol' | 'enter_description' | 'enter_image_url' | 'select_token_type' | 'confirm_launch' | 'mint_existing' | 'enter_mint_address' | 'enter_urc' | 'select_minter' | 'enter_batch_count' | 'confirm_mint' | 'confirm_batch_mint';
  data?: {
    name?: string;
    symbol?: string;
    description?: string;
    imageUrl?: string;
    tokenType?: 'meme' | 'standard';
    mintAddress?: string;
    urc?: string;
    minterWallet?: { address: string; private_key: string };
    batchCount?: number;
    batchMintResults?: {
      successful: number;
      failed: number;
      total: number;
      currentIndex: number;
      results: Array<{ success: boolean; signature?: string; error?: string }>;
    };
    lastMintData?: {
      mintAddress: string;
      signature: string;
    };
  };
}

// Create mint state manager instance
const mintStateManager = new UserStateManager<MintState>();

/**
 * Handle mint tokens menu - directly start mint existing token flow
 */
async function handleMint(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  
  if (!userId) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  // Initialize user state and directly go to mint existing token flow
  mintStateManager.setState(userId, { step: 'enter_mint_address', data: {} });

  try {
    const message = t('mint.enter_mint_address');
    
    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, {
        reply_markup: {
          inline_keyboard: [
            [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
          ]
        }
      });
    } else {
      await ctx.reply(message, {
        reply_markup: {
          inline_keyboard: [
            [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }]
          ]
        }
      });
    }
  } catch (error) {
    console.error('Error in handleMint:', error);
    await ctx.reply(t('common.error_try_again'));
  }
}

/**
 * Handle launch new token flow
 */
async function handleLaunchNewToken(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  
  if (!userId) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  mintStateManager.setState(userId, { 
    step: 'enter_name', 
    data: {} 
  });

  await ctx.reply(t('mint.enter_token_name'), {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
    ]).reply_markup,
  });
}



/**
 * Handle text input for mint flow
 */
export async function handleMintTextInput(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  const text = ctx.message?.text;

  if (!userId || !text) {
    console.log(`handleMintTextInput: user_id or text not exist`);
    return;
  }

  const state = mintStateManager.getState(userId);
  // console.log(`handleMintTextInput: user status:`, state);
  if (!state || !state.data) {
    console.log(`handleMintTextInput: no mint status or data, exit`);
    return;
  }

  try {
    switch (state.step) {
      case 'enter_name':
        state.data.name = text;
        state.step = 'enter_symbol';
        await ctx.reply(t('mint.enter_token_symbol'));
        break;

      case 'enter_symbol':
        state.data.symbol = text.toUpperCase();
        state.step = 'enter_description';
        await ctx.reply(t('mint.enter_token_description'));
        break;

      case 'enter_description':
        state.data.description = text;
        state.step = 'enter_image_url';
        await ctx.reply(t('mint.enter_image_url'));
        break;

      case 'enter_image_url':
        if (text.toLowerCase() !== '跳过' && text.toLowerCase() !== 'skip') {
          state.data.imageUrl = text;
        }
        state.step = 'select_token_type';
        await ctx.reply(t('mint.select_token_type'), {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback(t('mint.token_type_meme'), 'token_type_meme')],
            [Markup.button.callback(t('mint.token_type_standard'), 'token_type_standard')],
            [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
          ]).reply_markup,
        });
        break;

      case 'enter_mint_address':
        try {
          new PublicKey(text); // Validate address
          state.data.mintAddress = text;
          state.step = 'enter_urc';
          await ctx.reply(t('mint.enter_urc_code'), {
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
            ]).reply_markup,
          });
        } catch (error) {
          await ctx.reply(t('mint.invalid_address'));
        }
        break;

      case 'enter_urc':
        state.data.urc = text;
        state.step = 'select_minter';
        await showMinterSelection(ctx, userId, t);
        break;

      case 'enter_batch_count':
        const batchCount = parseInt(text);
        
        if (isNaN(batchCount) || batchCount < 1 || batchCount > 10) {
          await ctx.reply(t('mint.invalid_batch_count'));
          return;
        }

        state.data.batchCount = batchCount;
        state.step = 'confirm_batch_mint';

        const confirmText = t('mint.confirm_batch_mint', {
          mintAddress: state.data.mintAddress,
          urc: state.data.urc,
          wallet: state.data.minterWallet?.address,
          batchCount: batchCount
        });

        await ctx.reply(confirmText, {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback(t('buttons.confirm_batch_mint'), 'confirm_batch_mint')],
            [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
          ]).reply_markup,
        });
        break;

      default:
        break;
    }

    mintStateManager.updateState(userId, state);
  } catch (error) {
    console.error('Error in handleMintTextInput:', error);
    await ctx.reply(t('common.error_try_again'));
  }
}

/**
 * Show minter wallet selection
 */
async function showMinterSelection(ctx: any, userId: number, t: any) {
  const wallets = getUserWallets(userId);
  
  if (wallets.length === 0) {
    await ctx.reply(t('wallet.no_wallets'), {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(t('buttons.generate_wallets'), 'menu_generate_wallets')],
        [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
      ]).reply_markup,
    });
    return;
  }

  const buttons = wallets.slice(0, 10).map((wallet, index) => [
    Markup.button.callback(
      `💳 ${wallet.address.slice(0, 8)}...${wallet.address.slice(-8)}`,
      `select_minter_${index}`
    )
  ]);
  
  buttons.push([Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]);

  await ctx.reply(t('mint.select_minter_wallet'), {
    reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
  });
}

/**
 * Handle token type selection
 */
async function handleTokenTypeSelection(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  const data = ctx.callbackQuery?.data;

  if (!userId || !data) {
    return;
  }

  const state = mintStateManager.getState(userId);
  if (!state || !state.data) {
    return;
  }

  const tokenType = data === 'token_type_meme' ? 'meme' : 'standard';
  state.data.tokenType = tokenType;
  state.step = 'confirm_launch';

  const confirmText = t('mint.confirm_launch', {
    name: state.data.name,
    symbol: state.data.symbol,
    description: state.data.description,
    image: state.data.imageUrl || t('common.na'),
    type: tokenType === 'meme' ? t('mint.token_type_meme') : t('mint.token_type_standard'),
    wallet: state.data.minterWallet?.address || ''
  });

  await ctx.editMessageText(confirmText, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback(t('buttons.confirm_launch'), 'confirm_token_launch')],
      [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
    ]).reply_markup,
  });

  mintStateManager.updateState(userId, state);
}

/**
 * Handle minter wallet selection
 */
async function handleMinterSelection(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  const data = ctx.callbackQuery?.data;

  if (!userId || !data || !data.startsWith('select_minter_')) {
    return;
  }

  const walletIndex = parseInt(data.replace('select_minter_', ''));
  const wallets = getUserWallets(userId);
  
  if (walletIndex >= wallets.length) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  const state = mintStateManager.getState(userId);
  if (!state || !state.data) {
    return;
  }

  state.data.minterWallet = wallets[walletIndex];
  state.step = 'enter_batch_count';

  await ctx.editMessageText(t('mint.enter_batch_count'), {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
    ]).reply_markup,
  });

  mintStateManager.updateState(userId, state);
}

/**
 * Handle batch mint confirmation
 */
async function handleBatchMint(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;

  if (!userId) {
    return;
  }

  const state = mintStateManager.getState(userId);
  if (!state || !state.data || !state.data.minterWallet) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  try {
    const { mintAddress, urc, minterWallet, batchCount } = state.data;
    
    // Show initial processing message with variables
    await ctx.editMessageText(t('mint.batch_processing', {
      current: 1,
      total: batchCount || 1
    }), {
      parse_mode: 'HTML',
    });
    
    // Initialize batch mint results
    state.data.batchMintResults = {
      successful: 0,
      failed: 0,
      total: batchCount || 1,
      currentIndex: 0,
      results: []
    };

    const minter = loadKeypairFromBase58(minterWallet.private_key);
    
    for (let i = 0; i < (batchCount || 1); i++) {
      state.data.batchMintResults.currentIndex = i + 1;
      
      try {
        const mintOptions: MintTokenOptions = {
          rpc: RPC,
          mint: new PublicKey(mintAddress!),
          urc: urc!,
          minter,
        };

        const mintResult = await mintToken(mintOptions);

        if (mintResult.success && mintResult.data) {
          state.data.batchMintResults.successful++;
          state.data.batchMintResults.results.push({
            success: true,
            signature: mintResult.data.tx
          });
          
          // Show individual success message with all variables
          const successMsg = t('mint.batch_success', {
            current: i + 1,
            total: batchCount || 1,
            mintAddress: mintAddress,
            signature: mintResult.data.tx,
            wallet: minterWallet.address,
            urc: urc
          });
          
          const explorerUrl = `https://explorer.solana.com/tx/${mintResult.data.tx}${RPC.includes("devnet") ? "?cluster=devnet" : ""}`;
          
          // Store mint data for copy actions
          state.data.lastMintData = { mintAddress, signature: mintResult.data.tx };
          
          await ctx.reply(successMsg, { 
            parse_mode: 'HTML',
            reply_markup: Markup.inlineKeyboard([
              [
                // Markup.button.callback(t('buttons.copy_tx'), 'copy_last_tx'),
                Markup.button.url(t('buttons.view_transaction'), explorerUrl)
              ]
            ]).reply_markup,
          });
        } else {
          state.data.batchMintResults.failed++;
          state.data.batchMintResults.results.push({
            success: false,
            error: mintResult.message || 'Unknown error'
          });
          
          // Show individual failure message with all variables
          const failMsg = t('mint.batch_failed', {
            current: i + 1,
            error: mintResult.message || 'Unknown error'
          });
          
          await ctx.reply(failMsg, { parse_mode: 'HTML' });
        }
      } catch (error) {
        state.data.batchMintResults.failed++;
        state.data.batchMintResults.results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        // Show individual error message with all variables
        const errorMsg = t('mint.batch_failed', {
          current: i + 1,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        await ctx.reply(errorMsg, { parse_mode: 'HTML' });
      }
    }

    // Show final results with all variables
    const completeText = t('mint.batch_complete', {
      mintAddress: mintAddress,
      wallet: minterWallet.address,
      urc: urc,
      successful: state.data.batchMintResults.successful,
      total: state.data.batchMintResults.total,
      failed: state.data.batchMintResults.failed
    });

    await ctx.reply(completeText, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
      ]).reply_markup,
    });

    // Clear user state
    mintStateManager.clearState(userId);

  } catch (error) {
    console.error('Error in batch mint:', error);
    await ctx.reply(t('common.error_try_again'), {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
      ]).reply_markup,
    });
  }
}

async function handleMintCopyAction(ctx: any) {
  const t = ctx.t;
  const userId = ctx.from?.id;
  const data = ctx.callbackQuery?.data;

  if (!userId || !data) {
    return;
  }

  const state = mintStateManager.getState(userId);
  if (!state || !state.data?.lastMintData) {
    await ctx.answerCbQuery("Nothing to copy");
    return;
  }

  try {
    let textToCopy = '';
    let successMessage = '';

    if (data === 'copy_last_mint') {
      textToCopy = state.data.lastMintData.mintAddress;
      successMessage = t('common.mint_address_copied');
    } else if (data === 'copy_last_tx') {
      textToCopy = state.data.lastMintData.signature;
      successMessage = t('common.tx_copied');
    }

    if (textToCopy) {
      // Send the text to copy in a message that can be easily copied
      await ctx.reply(`\`${textToCopy}\``, { 
        parse_mode: 'MarkdownV2',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
        ]).reply_markup,
      });
      
      await ctx.answerCbQuery(successMessage);
    }
  } catch (error) {
    console.error('Error in handleMintCopyAction:', error);
    await ctx.answerCbQuery(t('common.error_try_again'));
  }
}

/**
 * Register mint-related bot actions
 */
export function registerMintActions(bot: any) {
  bot.action('menu_mint', handleMint);
  bot.action('mint_launch_new', handleLaunchNewToken);
  bot.action('token_type_meme', handleTokenTypeSelection);
  bot.action('token_type_standard', handleTokenTypeSelection);
  // bot.action('confirm_token_launch', handleTokenLaunchConfirmation);
  // bot.action('confirm_token_mint', handleTokenMintConfirmation);
  bot.action('confirm_batch_mint', handleBatchMint);
  
  // Handle minter selection
  bot.action(/^select_minter_\d+$/, handleMinterSelection);
  
  // Handle copy actions
  bot.action('copy_last_mint', handleMintCopyAction);
  bot.action('copy_last_tx', handleMintCopyAction);
}