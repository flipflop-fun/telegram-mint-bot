import { Markup } from 'telegraf';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, getAccount, getMint, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
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

// Store transaction signatures temporarily with short IDs to avoid Telegram button data length limit
const transactionSignatures = new Map<string, string>();

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

  const confirmText = `${t('send.confirm_spl_title')}\n\n` +
    `${t('send.sender_wallet')}\n<code>${userState.senderWallet!.address}</code>\n\n` +
    `${t('send.recipient_address')}\n<code>${userState.recipientAddress}</code>\n\n` +
    `${t('send.token_address')}\n<code>${userState.tokenMint}</code>\n\n` +
    `${t('send.transfer_quantity')} ${amount}\n\n` +
    `${t('send.confirm_info')}`;

  await ctx.reply(confirmText, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [
        Markup.button.callback(t('buttons.copy_sender'), `copy_sender_${userState.senderWallet!.address}`),
        Markup.button.callback(t('buttons.copy_recipient'), `copy_recipient_${userState.recipientAddress}`)
      ],
      [
        Markup.button.callback(t('buttons.copy_token'), `copy_token_${userState.tokenMint}`),
        Markup.button.callback(t('buttons.confirm_transfer'), 'send_spl_confirm')
      ],
      [
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

    // Get token mint info to get decimals
    const mintInfo = await getMint(connection, tokenMintPubkey);
    const decimals = mintInfo.decimals;

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
      const tokenAmount = userState.amount * Math.pow(10, decimals); // Use correct decimals
      
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

    // Check if recipient token account exists, create if not
    const instructions = [];
    try {
      await getAccount(connection, recipientTokenAccount);
    } catch (error) {
      // Recipient token account doesn't exist, create it
      const createAccountInstruction = createAssociatedTokenAccountInstruction(
        senderKeypair.publicKey, // payer
        recipientTokenAccount,
        recipientPubkey,
        tokenMintPubkey
      );
      instructions.push(createAccountInstruction);
    }

    // Create transfer instruction
    const transferInstruction = createTransferInstruction(
      senderTokenAccount,
      recipientTokenAccount,
      senderKeypair.publicKey,
      userState.amount * Math.pow(10, decimals), // Use correct decimals
      [],
      TOKEN_PROGRAM_ID
    );
    instructions.push(transferInstruction);

    // Create and send transaction
    const transaction = await createTransaction(
      connection,
      senderKeypair.publicKey,
      instructions
    );

    const signature = await sendTransaction(connection, transaction, [senderKeypair]);

    const explorerUrl = `https://explorer.solana.com/tx/${signature}${RPC.includes("devnet") ? "?cluster=devnet" : ""}`;

    // Generate short ID for transaction signature to avoid Telegram button data length limit
    const shortId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    transactionSignatures.set(shortId, signature);

    const successText = `${t('send.spl_success_title')}\n\n` +
      `${t('send.sender_wallet')}\n<code>${userState.senderWallet!.address}</code>\n\n` +
      `${t('send.recipient_address')}\n<code>${userState.recipientAddress}</code>\n\n` +
      `${t('send.token_address')}\n<code>${userState.tokenMint}</code>\n\n` +
      `${t('send.transfer_quantity')} ${userState.amount}\n\n` +
      `${t('send.transaction_hash')}\n<code>${signature}</code>\n\n` +
      `${t('send.transaction_submitted')}`;

    await ctx.editMessageText(successText, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback(t('buttons.copy_tx'), `copy_tx_${shortId}`),
          Markup.button.url(t('buttons.view_transaction'), explorerUrl)
        ],
        [Markup.button.callback(t('buttons.back_to_main_home'), 'menu_main')]
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
 * Handle copy actions for SPL
 */
export async function handleSplCopyAction(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const data = ctx.callbackQuery?.data;
  
  if (!data) return;

  let copyText = '';
  let message = '';

  if (data.startsWith('copy_sender_')) {
    copyText = data.replace('copy_sender_', '');
    message = t('send.copy_sender_feedback', { address: copyText });
  } else if (data.startsWith('copy_recipient_')) {
    copyText = data.replace('copy_recipient_', '');
    message = t('send.copy_recipient_feedback', { address: copyText });
  } else if (data.startsWith('copy_token_')) {
    copyText = data.replace('copy_token_', '');
    message = t('send.copy_token_feedback', { address: copyText });
  } else if (data.startsWith('copy_tx_')) {
    const shortId = data.replace('copy_tx_', '');
    const fullSignature = transactionSignatures.get(shortId);
    
    if (fullSignature) {
      copyText = fullSignature;
      message = t('send.copy_tx_feedback', { txHash: copyText });
      // Clean up the temporary storage after use
      transactionSignatures.delete(shortId);
    } else {
      message = t('send.copy_tx_expired');
    }
  }

  if (message) {
    await ctx.answerCbQuery(message, { show_alert: true });
  }
}

/**
 * Register send SPL actions
 */
export function registerSendSplActions(bot: any) {
  bot.action('menu_send_spl', handleSendSpl);
  bot.action(/^send_spl_select_(\d+)$/, handleSendSplSelectSender);
  bot.action('send_spl_confirm', handleSendSplConfirm);
  bot.action(/^copy_(sender|recipient|token|tx)_/, handleSplCopyAction);
}