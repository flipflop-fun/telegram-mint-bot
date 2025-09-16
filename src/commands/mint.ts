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

// Store user states for the mint flow
const userStates = new Map<number, {
  step: 'select_action' | 'launch_token' | 'enter_name' | 'enter_symbol' | 'enter_description' | 'enter_image_url' | 'select_token_type' | 'confirm_launch' | 'mint_existing' | 'enter_mint_address' | 'enter_urc' | 'select_minter' | 'enter_batch_count' | 'confirm_mint' | 'confirm_batch_mint';
  tokenData?: {
    name?: string;
    symbol?: string;
    description?: string;
    imageUrl?: string;
    tokenType?: 'meme' | 'standard';
    mintAddress?: string;
    urc?: string;
    minterWallet?: { address: string; private_key: string };
    batchCount?: number;
  };
  batchMintResults?: {
    successful: number;
    failed: number;
    total: number;
    currentIndex: number;
    results: Array<{ success: boolean; signature?: string; error?: string }>;
  };
}>();

/**
 * Handle mint tokens menu - directly start mint existing token flow
 */
export async function handleMint(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  
  if (!userId) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  // Initialize user state and directly go to mint existing token flow
  const state = { step: 'enter_mint_address' as const, tokenData: {} };
  userStates.set(userId, state);

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
export async function handleLaunchNewToken(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  
  if (!userId) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  const state = userStates.get(userId) || { step: 'launch_token' };
  state.step = 'enter_name';
  state.tokenData = {};
  userStates.set(userId, state);

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

  const state = userStates.get(userId);
  console.log(`handleMintTextInput: user status:`, state);
  if (!state || !state.tokenData) {
    console.log(`handleMintTextInput: no mint status or tokenData, exit`);
    return;
  }

  try {
    switch (state.step) {
      case 'enter_name':
        state.tokenData.name = text;
        state.step = 'enter_symbol';
        await ctx.reply(t('mint.enter_token_symbol'));
        break;

      case 'enter_symbol':
        state.tokenData.symbol = text.toUpperCase();
        state.step = 'enter_description';
        await ctx.reply(t('mint.enter_token_description'));
        break;

      case 'enter_description':
        state.tokenData.description = text;
        state.step = 'enter_image_url';
        await ctx.reply(t('mint.enter_image_url'));
        break;

      case 'enter_image_url':
        if (text.toLowerCase() !== '跳过' && text.toLowerCase() !== 'skip') {
          state.tokenData.imageUrl = text;
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
          state.tokenData.mintAddress = text;
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
        state.tokenData.urc = text;
        state.step = 'select_minter';
        await showMinterSelection(ctx, userId, t);
        break;

      case 'enter_batch_count':
        const batchCount = parseInt(text);
        
        if (isNaN(batchCount) || batchCount < 1 || batchCount > 10) {
          await ctx.reply(t('mint.invalid_batch_count'));
          return;
        }

        state.tokenData.batchCount = batchCount;
        state.step = 'confirm_batch_mint';

        const confirmText = t('mint.confirm_batch_mint', {
          mintAddress: state.tokenData.mintAddress,
          urc: state.tokenData.urc,
          wallet: state.tokenData.minterWallet?.address,
          count: batchCount
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

    userStates.set(userId, state);
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
export async function handleTokenTypeSelection(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  const data = ctx.callbackQuery?.data;

  if (!userId || !data) {
    return;
  }

  const state = userStates.get(userId);
  if (!state || !state.tokenData) {
    return;
  }

  const tokenType = data === 'token_type_meme' ? 'meme' : 'standard';
  state.tokenData.tokenType = tokenType;
  state.step = 'confirm_launch';

  const confirmText = t('mint.confirm_launch', {
    name: state.tokenData.name,
    symbol: state.tokenData.symbol,
    description: state.tokenData.description,
    image: state.tokenData.imageUrl || t('common.na'),
    type: tokenType === 'meme' ? t('mint.token_type_meme') : t('mint.token_type_standard'),
    wallet: state.tokenData.minterWallet?.address || ''
  });

  await ctx.editMessageText(confirmText, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback(t('buttons.confirm_launch'), 'confirm_token_launch')],
      [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
    ]).reply_markup,
  });

  userStates.set(userId, state);
}

/**
 * Handle minter wallet selection
 */
export async function handleMinterSelection(ctx: any) {
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

  const state = userStates.get(userId);
  if (!state || !state.tokenData) {
    return;
  }

  state.tokenData.minterWallet = wallets[walletIndex];
  state.step = 'enter_batch_count';

  await ctx.editMessageText(t('mint.enter_batch_count'), {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
    ]).reply_markup,
  });

  userStates.set(userId, state);
}

/**
 * Handle token launch confirmation
 */
export async function handleTokenLaunchConfirmation(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;

  if (!userId) {
    return;
  }

  const state = userStates.get(userId);
  if (!state || !state.tokenData) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  const wallets = getUserWallets(userId);
  if (wallets.length === 0) {
    await ctx.reply(t('wallet.no_wallets'));
    return;
  }

  try {
    await ctx.editMessageText(t('mint.processing'), {
      parse_mode: 'HTML',
    });

    const { name, symbol, description, imageUrl, tokenType } = state.tokenData;
    
    // Use the first wallet as the launcher
    const launcherWallet = wallets[0];
    
    let metadataUrl = '';
    
    // Generate metadata if image URL is provided
    if (imageUrl) {
      try {
        const metadataResult = await generateMetadataUri({
          rpc: RPC,
          name: name!,
          symbol: symbol!,
          description: description!,
          imagePath: imageUrl, // Using URL instead of local path
        });
        
        if (metadataResult.success && metadataResult.data?.metadataUrl) {
          metadataUrl = metadataResult.data.metadataUrl;
        }
      } catch (metadataError) {
        console.error('Metadata generation failed:', metadataError);
        // Continue without metadata
      }
    }

    const launchOptions: LaunchTokenOptions = {
      rpc: RPC,
      name: name!,
      symbol: symbol!,
      tokenType: tokenType!,
      uri: metadataUrl,
      creator: loadKeypairFromBase58(launcherWallet.private_key),
    };

    const launchResult = await launchToken(launchOptions);

    if (launchResult.success && launchResult.data) {
      const successText = t('mint.launch_success', {
        mintAddress: launchResult.data.mintAddress.toString(),
        signature: launchResult.data.transactionHash,
        wallet: launcherWallet.address
      });

      await ctx.editMessageText(successText, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback(t('mint.mint_this_token'), `mint_token_${launchResult.data.mintAddress.toString()}`)],
          [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
        ]).reply_markup,
      });
    } else {
       throw new Error(launchResult.message || 'Unknown launch error');
     }

    // Clear user state
    userStates.delete(userId);

  } catch (error) {
    console.error('Error launching token:', error);
    await ctx.editMessageText(t('mint.launch_failed', { error: error }), {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
      ]).reply_markup,
    });
  }
}

/**
 * Handle batch mint confirmation
 */
export async function handleBatchMint(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;

  if (!userId) {
    return;
  }

  const state = userStates.get(userId);
  if (!state || !state.tokenData || !state.tokenData.minterWallet) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  try {
    await ctx.editMessageText(t('mint.batch_processing'), {
      parse_mode: 'HTML',
    });

    const { mintAddress, urc, minterWallet, batchCount } = state.tokenData;
    
    // Initialize batch mint results
    state.batchMintResults = {
      successful: 0,
      failed: 0,
      total: batchCount || 1,
      currentIndex: 0,
      results: []
    };

    const minter = loadKeypairFromBase58(minterWallet.private_key);
    
    for (let i = 0; i < (batchCount || 1); i++) {
      state.batchMintResults.currentIndex = i + 1;
      
      try {
        const mintOptions: MintTokenOptions = {
          rpc: RPC,
          mint: new PublicKey(mintAddress!),
          urc: urc!,
          minter,
        };

        const mintResult = await mintToken(mintOptions);

        if (mintResult.success && mintResult.data) {
          state.batchMintResults.successful++;
          state.batchMintResults.results.push({
            success: true,
            signature: mintResult.data.tx
          });
          
          // Show individual success message
          const successMsg = t('mint.batch_success', {
            index: i + 1,
            signature: mintResult.data.tx
          });
          
          await ctx.reply(successMsg, { parse_mode: 'HTML' });
        } else {
          state.batchMintResults.failed++;
          state.batchMintResults.results.push({
            success: false,
            error: mintResult.message || 'Unknown error'
          });
          
          // Show individual failure message
          const failMsg = t('mint.batch_failed', {
            index: i + 1,
            error: mintResult.message || 'Unknown error'
          });
          
          await ctx.reply(failMsg, { parse_mode: 'HTML' });
        }
      } catch (error) {
        state.batchMintResults.failed++;
        state.batchMintResults.results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        // Show individual error message
        const errorMsg = t('mint.batch_failed', {
          index: i + 1,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        await ctx.reply(errorMsg, { parse_mode: 'HTML' });
      }
    }

    // Show final results
    const completeText = t('mint.batch_complete', {
      total: state.batchMintResults.total,
      successful: state.batchMintResults.successful,
      failed: state.batchMintResults.failed,
      mintAddress: mintAddress,
      wallet: minterWallet.address
    });

    await ctx.reply(completeText, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
      ]).reply_markup,
    });

    // Clear user state
    userStates.delete(userId);

  } catch (error) {
    console.error('Error in batch mint:', error);
    await ctx.reply(t('common.error_try_again'), {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
      ]).reply_markup,
    });
  }
}

/**
 * Handle token mint confirmation
 */
export async function handleTokenMintConfirmation(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;

  if (!userId) {
    return;
  }

  const state = userStates.get(userId);
  if (!state || !state.tokenData || !state.tokenData.minterWallet) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  try {
    await ctx.editMessageText(t('mint.processing'), {
      parse_mode: 'HTML',
    });

    const { mintAddress, urc, minterWallet } = state.tokenData;
    
    const minter = loadKeypairFromBase58(minterWallet.private_key);
    
    const mintOptions: MintTokenOptions = {
      rpc: RPC,
      mint: new PublicKey(mintAddress!),
      urc: urc!,
      minter,
    };

    const mintResult = await mintToken(mintOptions);

    if (mintResult.success && mintResult.data) {
      const signature = mintResult.data.tx;
      const explorerUrl = `https://explorer.solana.com/tx/${signature}${RPC.includes("devnet") ? "?cluster=devnet" : ""}`;
      
      const successText = t('mint.mint_success', {
        mintAddress: mintAddress,
        signature: signature,
        wallet: minterWallet.address,
        urc: urc
      });

      await ctx.editMessageText(successText, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.url('🔍 查看交易详情', explorerUrl)],
          [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
        ]).reply_markup,
      });
    } else {
      throw new Error(mintResult.message || 'Unknown mint error');
    }

    // Clear user state
    userStates.delete(userId);

  } catch (error) {
    console.error('Error minting token:', error);
    await ctx.editMessageText(t('mint.mint_failed', { error: error }), {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
      ]).reply_markup,
    });
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
  bot.action('confirm_token_launch', handleTokenLaunchConfirmation);
  bot.action('confirm_token_mint', handleTokenMintConfirmation);
  bot.action('confirm_batch_mint', handleBatchMint);
  
  // Handle minter selection
  bot.action(/^select_minter_\d+$/, handleMinterSelection);
}