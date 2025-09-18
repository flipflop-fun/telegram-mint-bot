import { Markup } from 'telegraf';
import { PublicKey, Keypair } from '@solana/web3.js';
import { createTransferInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID, getMint, getAccount, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { getUserWallets } from '../services/db';
import { createTransaction, sendTransaction } from '../utils/solana/transaction';
import { getUserConnection, getUserExplorerUrl } from '../utils/solana/rpc';
import bs58 from 'bs58';
import { UserStateManager, UserState } from '../utils/stateManager';

// Define send SPL state interface
interface SendSplState extends UserState {
  step: 'select_sender' | 'enter_token' | 'enter_recipient' | 'enter_amount' | 'confirm';
  data: {
    senderWallet?: { address: string; private_key: string };
    tokenMint?: string;
    recipientAddress?: string;
    amount?: number;
  };
}

// Create send SPL state manager instance
const sendSplStateManager = new UserStateManager<SendSplState>();

// Store transaction signatures temporarily with short IDs to avoid Telegram button data length limit
const transactionSignatures = new Map<string, string>();

/**
 * Handle send SPL menu
 */
async function handleSendSpl(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;

  if (!userId) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  // Reset user state
  sendSplStateManager.setState(userId, { step: 'select_sender', data: {} });

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
async function handleSendSplSelectSender(ctx: any) {
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
  
  const userState = sendSplStateManager.getState(userId) || { step: 'select_sender' as const, data: {} };
  if (!userState.data) {
    userState.data = {};
  }
  (userState.data as any).senderWallet = selectedWallet;
  userState.step = 'enter_token';
  sendSplStateManager.updateState(userId, userState);

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

  // Validate token mint address
  try {
    new PublicKey(tokenMint);
  } catch (error) {
    await ctx.reply(t('send.invalid_token_mint'));
    return;
  }

  const userState = sendSplStateManager.getState(userId);
  if (!userState || userState.step !== 'enter_token') {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  if (!userState.data) {
    userState.data = {};
  }
  (userState.data as any).tokenMint = tokenMint;
  userState.step = 'enter_recipient';
  sendSplStateManager.updateState(userId, userState);

  await ctx.reply(t('send.enter_recipient'), {
    parse_mode: 'HTML',
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

  const userState = sendSplStateManager.getState(userId);
  if (!userState || userState.step !== 'enter_recipient') {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  if (!userState.data) {
    userState.data = {};
  }
  (userState.data as any).recipientAddress = recipientAddress;
  userState.step = 'enter_amount';
  sendSplStateManager.updateState(userId, userState);

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

  const userState = sendSplStateManager.getState(userId);
  if (!userState || userState.step !== 'enter_amount') {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  if (!userState.data) {
    userState.data = {};
  }
  (userState.data as any).amount = amount;
  userState.step = 'confirm';
  sendSplStateManager.updateState(userId, userState);

  const confirmText = `${t('send.confirm_spl_title')}\n\n` +
    `${t('send.sender_wallet')}\n<code>${userState.data.senderWallet!.address}</code>\n\n` +
    `${t('send.token_mint')}\n<code>${userState.data.tokenMint}</code>\n\n` +
    `${t('send.recipient_address')}\n<code>${userState.data.recipientAddress}</code>\n\n` +
    `${t('send.transfer_amount')} ${amount}\n\n` +
    `${t('send.confirm_info')}`;

  await ctx.reply(confirmText, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      // [
      //   Markup.button.callback(t('buttons.copy_sender'), `copy_spl_sender_${userState.data.senderWallet!.address}`),
      //   Markup.button.callback(t('buttons.copy_recipient'), `copy_spl_recipient_${userState.data.recipientAddress}`)
      // ],
      // [
      //   Markup.button.callback(t('buttons.copy_token'), `copy_spl_token_${userState.data.tokenMint}`)
      // ],
      [
        Markup.button.callback(t('buttons.confirm_transfer'), 'send_spl_confirm'),
        Markup.button.callback(t('buttons.cancel'), 'menu_main')
      ]
    ]).reply_markup,
  });

  ctx.session.waitingForSplAmount = false;
}

/**
 * Handle transaction confirmation and execution
 */
async function handleSendSplConfirm(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;

  if (!userId) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  const userState = sendSplStateManager.getState(userId);
  if (!userState || userState.step !== 'confirm' || !userState.data?.senderWallet || !userState.data?.tokenMint || !userState.data?.recipientAddress || !userState.data?.amount) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  await ctx.editMessageText(t('send.processing'), { parse_mode: 'HTML' });

  try {
    // Create connection
    const connection = getUserConnection(userId);
    
    // Create keypair from private key
    const senderKeypair = Keypair.fromSecretKey(
      bs58.decode(userState.data.senderWallet.private_key)
    );
    
    const tokenMintPubkey = new PublicKey(userState.data.tokenMint);
    const recipientPubkey = new PublicKey(userState.data.recipientAddress);

    // Get token mint info to determine decimals
    const mintInfo = await getMint(connection, tokenMintPubkey);
    const decimals = mintInfo.decimals;
    const transferAmount = Math.floor(userState.data.amount * Math.pow(10, decimals));

    // Get sender's token account
    const senderTokenAccount = await getAssociatedTokenAddress(
      tokenMintPubkey,
      senderKeypair.publicKey
    );

    // Check if sender has the token account and sufficient balance
    try {
      const senderTokenAccountInfo = await getAccount(connection, senderTokenAccount);
      if (Number(senderTokenAccountInfo.amount) < transferAmount) {
        await ctx.editMessageText(
          t('send.insufficient_token_balance', {
            senderAddress: userState.data.senderWallet.address,
            tokenMint: userState.data.tokenMint,
            currentBalance: (Number(senderTokenAccountInfo.amount) / Math.pow(10, decimals)).toFixed(decimals),
            amount: userState.data.amount
          }),
          { parse_mode: 'HTML' }
        );
        sendSplStateManager.clearState(userId);
        return;
      }
    } catch (error) {
      await ctx.editMessageText(
        t('send.no_token_account', {
          senderAddress: userState.data.senderWallet.address,
          tokenMint: userState.data.tokenMint
        }),
        { parse_mode: 'HTML' }
      );
      sendSplStateManager.clearState(userId);
      return;
    }

    // Get recipient's token account
    const recipientTokenAccount = await getAssociatedTokenAddress(
      tokenMintPubkey,
      recipientPubkey
    );

    const instructions = [];

    // Check if recipient token account exists, if not, create it
    try {
      await getAccount(connection, recipientTokenAccount);
    } catch (error) {
      // Token account doesn't exist, create it
      const createAccountInstruction = createAssociatedTokenAccountInstruction(
        senderKeypair.publicKey, // payer
        recipientTokenAccount,
        recipientPubkey, // owner
        tokenMintPubkey
      );
      instructions.push(createAccountInstruction);
    }

    // Create transfer instruction
    const transferInstruction = createTransferInstruction(
      senderTokenAccount,
      recipientTokenAccount,
      senderKeypair.publicKey,
      transferAmount,
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
    
    const explorerUrl = getUserExplorerUrl(userId, 'tx', signature);

    // Generate short ID for button callback
    const shortId = `spl_tx_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    transactionSignatures.set(shortId, signature);

    const successText = `${t('send.spl_success_title')}\n\n` +
      `${t('send.sender_wallet')}\n<code>${userState.data.senderWallet!.address}</code>\n\n` +
      `${t('send.token_mint')}\n<code>${userState.data.tokenMint}</code>\n\n` +
      `${t('send.recipient_address')}\n<code>${userState.data.recipientAddress}</code>\n\n` +
      `${t('send.transfer_amount')} ${userState.data.amount}\n\n` +
      `${t('send.transaction_hash')}\n<code>${signature}</code>\n\n` +
      `${t('send.transaction_submitted')}`;

    await ctx.editMessageText(successText, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [
          // Markup.button.callback(t('buttons.copy_tx'), `copy_spl_tx_${shortId}`),
          Markup.button.url(t('buttons.view_transaction'), explorerUrl)
        ],
        [Markup.button.callback(t('buttons.back_to_main_home'), 'menu_main')]
      ]).reply_markup,
    });

    // Clean up user state
    sendSplStateManager.clearState(userId);
  } catch (error) {
    let errorMessage = '';
    
    if (error.message && error.message.includes('insufficient funds')) {
      errorMessage = t('errors.insufficient_funds_spl');
    } else if (error.message && error.message.includes('blockhash')) {
      errorMessage = t('send.error_blockhash', { error: error.message });
    } else if (error.message && error.message.includes('Transaction simulation failed')) {
      errorMessage = t('send.error_simulation_failed', { error: error.message });
    } else {
      errorMessage = t('send.error_general', { error: error.message || 'Unknown error' });
    }
    
    await ctx.editMessageText(errorMessage, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
      ]).reply_markup,
    });

    // Clean up user state
    sendSplStateManager.clearState(userId);
  }
}

/**
 * Handle copy actions for SPL transfers
 */
// async function handleSplCopyAction(ctx: any) {
//   const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
//   const callbackData = ctx.callbackQuery?.data;

//   if (!callbackData) return;

//   let textToCopy = '';
//   let messageKey = '';

//   if (callbackData.startsWith('copy_spl_sender_')) {
//     textToCopy = callbackData.replace('copy_spl_sender_', '');
//     messageKey = 'send.copied_sender';
//   } else if (callbackData.startsWith('copy_spl_recipient_')) {
//     textToCopy = callbackData.replace('copy_spl_recipient_', '');
//     messageKey = 'send.copied_recipient';
//   } else if (callbackData.startsWith('copy_spl_token_')) {
//     textToCopy = callbackData.replace('copy_spl_token_', '');
//     messageKey = 'send.copied_token';
//   } else if (callbackData.startsWith('copy_spl_tx_')) {
//     const shortId = callbackData.replace('copy_spl_tx_', '');
//     textToCopy = transactionSignatures.get(shortId) || '';
//     messageKey = 'send.copied_tx';
//   }

//   if (textToCopy) {
//     await ctx.answerCbQuery(t(messageKey));
//     await ctx.reply(`<code>${textToCopy}</code>`, { parse_mode: 'HTML' });
//   }
// }

/**
 * Register send SPL actions
 */
export function registerSendSplActions(bot: any) {
  bot.action('menu_send_spl', handleSendSpl);
  bot.action(/^send_spl_select_(\d+)$/, handleSendSplSelectSender);
  bot.action('send_spl_confirm', handleSendSplConfirm);
  // bot.action(/^copy_spl_(sender|recipient|token|tx)_/, handleSplCopyAction);
}