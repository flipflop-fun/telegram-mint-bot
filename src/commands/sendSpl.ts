import { Markup } from 'telegraf';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, getAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { getUserWallets } from '../services/db';
import { createTransaction, sendTransaction } from '../utils/solana/transaction';
import { RPC } from '../../config';
import bs58 from 'bs58';

// Store user states for the send SPL flow
const userStates = new Map<number, {
  step: 'select_sender' | 'enter_token' | 'enter_recipient' | 'enter_amount' | 'confirm';
  senderWallet?: { address: string; private_key: string };
  tokenMint?: string;
  recipientAddress?: string;
  amount?: number;
}>();

/**
 * Handle send SPL menu
 */
export async function handleSendSpl(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;

  if (!userId) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  // Reset user state
  userStates.set(userId, { step: 'select_sender' });

  const menuText = t('send.spl_title');
  
  // Get user wallets
  const wallets = getUserWallets(userId);
  
  if (wallets.length === 0) {
    await ctx.reply('❌ You have no wallets. Please generate wallets first.', {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
      ]).reply_markup,
    });
    return;
  }

  const walletButtons = wallets.map((wallet, index) => {
    const shortAddress = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-6)}`;
    return [Markup.button.callback(`${index + 1}. ${shortAddress}`, `send_spl_select_${index}`)];
  });

  const menuMarkup = {
    inline_keyboard: [
      ...walletButtons,
      [{ text: t('buttons.back_to_main'), callback_data: 'menu_main' }],
    ],
  };

  try {
    if (ctx.callbackQuery) {
      await ctx.editMessageText(`${menuText}\n\n${t('send.select_sender')}`, {
        parse_mode: 'HTML',
        reply_markup: menuMarkup,
      });
    } else {
      await ctx.reply(`${menuText}\n\n${t('send.select_sender')}`, {
        parse_mode: 'HTML',
        reply_markup: menuMarkup,
      });
    }
  } catch (error) {
    console.error('Error in handleSendSpl:', error);
    await ctx.reply(t('common.error_try_again'));
  }
}

/**
 * Handle sender wallet selection
 */
export async function handleSendSplSelectSender(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  const walletIndex = parseInt(ctx.match[1]);

  if (!userId) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  const wallets = getUserWallets(userId);
  if (walletIndex < 0 || walletIndex >= wallets.length) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  const selectedWallet = wallets[walletIndex];
  const userState = userStates.get(userId) || { step: 'select_sender' };
  userState.senderWallet = selectedWallet;
  userState.step = 'enter_token';
  userStates.set(userId, userState);

  await ctx.editMessageText(t('send.enter_token_mint'), {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
    ]).reply_markup,
  });

  // Set up text message handler for token mint
  ctx.session = ctx.session || {};
  ctx.session.waitingForSplTokenMint = true;
}

/**
 * Handle token mint input
 */
export async function handleTokenMintInput(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  const tokenMint = ctx.message?.text?.trim();

  if (!userId || !tokenMint) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  // Validate Solana address
  try {
    new PublicKey(tokenMint);
  } catch (error) {
    await ctx.reply(t('send.invalid_token_mint'));
    return;
  }

  const userState = userStates.get(userId);
  if (!userState || userState.step !== 'enter_token') {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  userState.tokenMint = tokenMint;
  userState.step = 'enter_recipient';
  userStates.set(userId, userState);

  await ctx.reply(t('send.enter_recipient'), {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
    ]).reply_markup,
  });

  ctx.session.waitingForSplTokenMint = false;
  ctx.session.waitingForSplRecipient = true;
}

/**
 * Handle recipient address input
 */
export async function handleSplRecipientInput(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  const recipientAddress = ctx.message?.text?.trim();

  if (!userId || !recipientAddress) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  // Validate Solana address
  try {
    new PublicKey(recipientAddress);
  } catch (error) {
    await ctx.reply(t('send.invalid_address'));
    return;
  }

  const userState = userStates.get(userId);
  if (!userState || userState.step !== 'enter_recipient') {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  userState.recipientAddress = recipientAddress;
  userState.step = 'enter_amount';
  userStates.set(userId, userState);

  await ctx.reply(t('send.enter_spl_amount'), {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
    ]).reply_markup,
  });

  ctx.session.waitingForSplRecipient = false;
  ctx.session.waitingForSplAmount = true;
}

/**
 * Handle amount input
 */
export async function handleSplAmountInput(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  const amountText = ctx.message?.text?.trim();

  if (!userId || !amountText) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  const amount = parseFloat(amountText);
  if (isNaN(amount) || amount <= 0) {
    await ctx.reply(t('common.invalid_amount'));
    return;
  }

  const userState = userStates.get(userId);
  if (!userState || userState.step !== 'enter_amount') {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  userState.amount = amount;
  userState.step = 'confirm';
  userStates.set(userId, userState);

  const confirmText = t('send.confirm_spl', {
    sender: `${userState.senderWallet!.address.slice(0, 6)}...${userState.senderWallet!.address.slice(-6)}`,
    recipient: `${userState.recipientAddress!.slice(0, 6)}...${userState.recipientAddress!.slice(-6)}`,
    amount: amount.toString(),
    token: `${userState.tokenMint!.slice(0, 6)}...${userState.tokenMint!.slice(-6)}`
  });

  await ctx.reply(confirmText, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [
        Markup.button.callback(t('buttons.confirm'), 'send_spl_confirm'),
        Markup.button.callback(t('buttons.cancel'), 'menu_main')
      ]
    ]).reply_markup,
  });

  ctx.session.waitingForSplAmount = false;
}

/**
 * Handle transaction confirmation and execution
 */
export async function handleSendSplConfirm(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;

  if (!userId) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  const userState = userStates.get(userId);
  if (!userState || userState.step !== 'confirm' || !userState.senderWallet || !userState.recipientAddress || !userState.amount || !userState.tokenMint) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  await ctx.editMessageText(t('send.processing'), { parse_mode: 'HTML' });

  try {
    // Create connection
    const connection = new Connection(RPC, 'confirmed');
    
    // Create keypair from private key
    const senderKeypair = Keypair.fromSecretKey(
      bs58.decode(userState.senderWallet.private_key)
    );
    
    const recipientPubkey = new PublicKey(userState.recipientAddress);
    const tokenMintPubkey = new PublicKey(userState.tokenMint);

    // Get token accounts
    const senderTokenAccount = await getAssociatedTokenAddress(
      tokenMintPubkey,
      senderKeypair.publicKey
    );

    const recipientTokenAccount = await getAssociatedTokenAddress(
      tokenMintPubkey,
      recipientPubkey
    );

    // Check sender token balance
    try {
      const senderAccount = await getAccount(connection, senderTokenAccount);
      const tokenAmount = userState.amount * Math.pow(10, 9); // Assuming 9 decimals, adjust as needed
      
      if (Number(senderAccount.amount) < tokenAmount) {
        await ctx.editMessageText(t('send.insufficient_token_balance'), { parse_mode: 'HTML' });
        userStates.delete(userId);
        return;
      }
    } catch (error) {
      await ctx.editMessageText(t('send.no_token_account'), { parse_mode: 'HTML' });
      userStates.delete(userId);
      return;
    }

    // Create transfer instruction
    const transferInstruction = createTransferInstruction(
      senderTokenAccount,
      recipientTokenAccount,
      senderKeypair.publicKey,
      userState.amount * Math.pow(10, 9), // Convert to smallest unit
      [],
      TOKEN_PROGRAM_ID
    );

    // Create and send transaction
    const transaction = await createTransaction(
      connection,
      senderKeypair.publicKey,
      [transferInstruction]
    );

    const signature = await sendTransaction(connection, transaction, [senderKeypair]);

    const explorerUrl = `https://explorer.solana.com/tx/${signature}${RPC.includes("devnet") && "?cluster=devnet"}`;

    const successText = t('tx.success_html', {
      explorer_url: explorerUrl,
      signature: signature.slice(0, 8) + '...' + signature.slice(-8)
    });

    await ctx.editMessageText(successText, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
      ]).reply_markup,
    });

  } catch (error) {
    console.error('Error sending SPL token:', error);
    await ctx.editMessageText(t('send.spl_transfer_error'), {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
      ]).reply_markup,
    });
  }

  // Clean up user state
  userStates.delete(userId);
}

/**
 * Register send SPL actions
 */
export function registerSendSplActions(bot: any) {
  bot.action('menu_send_spl', handleSendSpl);
  bot.action(/^send_spl_select_(\d+)$/, handleSendSplSelectSender);
  bot.action('send_spl_confirm', handleSendSplConfirm);

  // Handle text input for token mint, recipient and amount
  bot.on('text', async (ctx: any) => {
    if (ctx.session?.waitingForSplTokenMint) {
      await handleTokenMintInput(ctx);
    } else if (ctx.session?.waitingForSplRecipient) {
      await handleSplRecipientInput(ctx);
    } else if (ctx.session?.waitingForSplAmount) {
      await handleSplAmountInput(ctx);
    }
  });
}