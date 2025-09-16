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
  step: 'select_action' | 'launch_token' | 'enter_name' | 'enter_symbol' | 'enter_description' | 'enter_image_url' | 'select_token_type' | 'confirm_launch' | 'mint_existing' | 'enter_mint_address' | 'enter_urc' | 'select_minter' | 'confirm_mint';
  tokenData?: {
    name?: string;
    symbol?: string;
    description?: string;
    imageUrl?: string;
    tokenType?: 'meme' | 'standard';
    mintAddress?: string;
    urc?: string;
    minterWallet?: { address: string; private_key: string };
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

  console.log(`=== handleMintTextInput调试 ===`);
  console.log(`用户ID: ${userId}, 文本: ${text}`);

  if (!userId || !text) {
    console.log(`handleMintTextInput: 缺少用户ID或文本，退出`);
    return;
  }

  const state = userStates.get(userId);
  console.log(`handleMintTextInput: 用户状态:`, state);
  if (!state || !state.tokenData) {
    console.log(`handleMintTextInput: 没有mint状态或tokenData，退出`);
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
  state.step = 'confirm_mint';

  const confirmText = t('mint.confirm_mint', {
    mintAddress: state.tokenData.mintAddress,
    urc: state.tokenData.urc,
    wallet: state.tokenData.minterWallet.address
  });

  await ctx.editMessageText(confirmText, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback(t('buttons.confirm_mint'), 'confirm_token_mint')],
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
  
  // Handle minter selection
  bot.action(/^select_minter_\d+$/, handleMinterSelection);
}