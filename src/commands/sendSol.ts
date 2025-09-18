import { Markup } from 'telegraf';
import { Connection, PublicKey, SystemProgram, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';
import { getUserWallets } from '../services/db';
import { createTransaction, sendTransaction } from '../utils/solana/transaction';
import { getUserConnection, getUserExplorerUrl } from '../utils/solana/rpc';
import bs58 from 'bs58';
import { UserStateManager, UserState } from '../utils/stateManager';

// Define send SOL state interface
interface SendSolState extends UserState {
  step: 'select_sender' | 'enter_recipient' | 'enter_amount' | 'confirm';
  data: {
    senderWallet?: { address: string; private_key: string; };
    recipientAddress?: string;
    amount?: number;
  };
}

// Create send SOL state manager instance
const sendSolStateManager = new UserStateManager<SendSolState>();

const transactionSignatures = new Map<string, string>();

/**
 * Handle send SOL menu
 */
async function handleSendSol(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;

  if (!userId) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  // Reset user state
  sendSolStateManager.setState(userId, { step: 'select_sender', data: {} });

  const menuText = t('send.sol_title');
  
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
    return [Markup.button.callback(`${index + 1}. ${shortAddress}`, `send_sol_select_${index}`)];
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
    console.error('Error in handleSendSol:', error);
    await ctx.reply(t('common.error_try_again'));
  }
}

/**
 * Handle sender wallet selection
 */
async function handleSendSolSelectSender(ctx: any) {
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
  
  const userState = sendSolStateManager.getState(userId) || { step: 'select_sender' as const, data: {} };
  if (!userState.data) {
    userState.data = {};
  }
  (userState.data as any).senderWallet = selectedWallet;
  userState.step = 'enter_recipient';
  sendSolStateManager.updateState(userId, userState);

  await ctx.editMessageText(t('send.enter_recipient'), {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
    ]).reply_markup,
  });

  // Set up text message handler for recipient address
  ctx.session = ctx.session || {};
  ctx.session.waitingForSolRecipient = true;
}

/**
 * Handle recipient address input
 */
export async function handleRecipientInput(ctx: any) {
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

  const userState = sendSolStateManager.getState(userId);
  if (!userState || userState.step !== 'enter_recipient') {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  if (!userState.data) {
    userState.data = {};
  }
  userState.data.recipientAddress = recipientAddress;
  userState.step = 'enter_amount';
  sendSolStateManager.updateState(userId, userState);

  await ctx.reply(t('send.enter_sol_amount'), {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
    ]).reply_markup,
  });

  ctx.session.waitingForSolRecipient = false;
  ctx.session.waitingForSolAmount = true;
}

/**
 * Handle amount input
 */
export async function handleAmountInput(ctx: any) {
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

  const userState = sendSolStateManager.getState(userId);
  if (!userState || userState.step !== 'enter_amount') {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  if (!userState.data) {
    userState.data = {};
  }
  userState.data.amount = amount;
  userState.step = 'confirm';
  sendSolStateManager.updateState(userId, userState);

  const confirmText = `${t('send.confirm_sol_title')}\n\n` +
    `${t('send.sender_wallet')}\n<code>${userState.data.senderWallet!.address}</code>\n\n` +
    `${t('send.recipient_address')}\n<code>${userState.data.recipientAddress}</code>\n\n` +
    `${t('send.transfer_amount')} ${amount} SOL\n\n` +
    `${t('send.confirm_info')}`;

  await ctx.reply(confirmText, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      // [
      //   Markup.button.callback(t('buttons.copy_sender'), `copy_sender_${userState.data.senderWallet.address}`),
      //   Markup.button.callback(t('buttons.copy_recipient'), `copy_recipient_${userState.data.recipientAddress}`)
      // ],
      [
        Markup.button.callback(t('buttons.confirm_transfer'), 'send_sol_confirm'),
        Markup.button.callback(t('buttons.cancel'), 'menu_main')
      ]
    ]).reply_markup,
  });

  ctx.session.waitingForSolAmount = false;
}

/**
 * Handle transaction confirmation and execution
 */
async function handleSendSolConfirm(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;

  if (!userId) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  const userState = sendSolStateManager.getState(userId);
  if (!userState || userState.step !== 'confirm' || !userState.data?.senderWallet || !userState.data?.recipientAddress || !userState.data?.amount) {
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
    
    const recipientPubkey = new PublicKey(userState.data.recipientAddress);
    const lamports = userState.data.amount * LAMPORTS_PER_SOL;

    // Check sender balance
    const balance = await connection.getBalance(senderKeypair.publicKey);
    
    // Create a test transaction to estimate the actual fee
    const testTransferInstruction = SystemProgram.transfer({
      fromPubkey: senderKeypair.publicKey,
      toPubkey: recipientPubkey,
      lamports,
    });
    
    const testTransaction = await createTransaction(
      connection,
      senderKeypair.publicKey,
      [testTransferInstruction]
    );
    
    // Get the actual fee for this transaction
    const feeResponse = await connection.getFeeForMessage(testTransaction.message);
    const estimatedFee = feeResponse.value || 10000; // Fallback to 10000 lamports if estimation fails
    
    if (balance < lamports + estimatedFee) {
      const balanceInSol = balance / LAMPORTS_PER_SOL;
      const requiredInSol = (lamports + estimatedFee) / LAMPORTS_PER_SOL;
      await ctx.editMessageText(
        t('send.insufficient_balance_details', {
          senderAddress: userState.data.senderWallet.address,
          currentBalance: balanceInSol.toFixed(6),
          recipientAddress: userState.data.recipientAddress,
          amount: userState.data.amount,
          fee: (estimatedFee / LAMPORTS_PER_SOL).toFixed(6),
          totalRequired: requiredInSol.toFixed(6)
        }),
        { parse_mode: 'HTML' }
      );
      sendSolStateManager.clearState(userId);
      return;
    }

    // Create transfer instruction
    const transferInstruction = SystemProgram.transfer({
      fromPubkey: senderKeypair.publicKey,
      toPubkey: recipientPubkey,
      lamports,
    });

    // Create and send transaction
    const transaction = await createTransaction(
      connection,
      senderKeypair.publicKey,
      [transferInstruction]
    );

    const signature = await sendTransaction(connection, transaction, [senderKeypair]);
    
    const explorerUrl = getUserExplorerUrl(userId, 'tx', signature);

    const shortId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    transactionSignatures.set(shortId, signature);

    const successText = `${t('send.sol_success_title')}\n\n` +
      `${t('send.sender_wallet')}\n<code>${userState.data.senderWallet!.address}</code>\n\n` +
      `${t('send.recipient_address')}\n<code>${userState.data.recipientAddress}</code>\n\n` +
      `${t('send.transfer_amount')} ${userState.data.amount} SOL\n\n` +
      `${t('send.transaction_hash')}\n<code>${signature}</code>\n\n` +
      `${t('send.transaction_submitted')}`;

    await ctx.editMessageText(successText, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [
          // Markup.button.callback(t('buttons.copy_tx'), `copy_tx_${shortId}`),
          Markup.button.url(t('buttons.view_transaction'), explorerUrl)
        ],
        [Markup.button.callback(t('buttons.back_to_main_home'), 'menu_main')]
      ]).reply_markup,
    });
    sendSolStateManager.clearState(userId);
  } catch (error) {
    let errorMessage = '';
    
    if (error.message && error.message.includes('insufficient funds')) {
      errorMessage = t('errors.insufficient_funds_sol');
    } else if (error.message && error.message.includes('blockhash')) {
      errorMessage = t('send.error_blockhash', { error: error.message });
    } else if (error.message && error.message.includes('Transaction simulation failed')) {
      errorMessage = t('send.error_simulation_failed', { error: error.message });
    } else {
      errorMessage = t('send.error_general', { error: error.message || '未知错误' });
    }
    
    await ctx.editMessageText(errorMessage, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
      ]).reply_markup,
    });
  }

  // Clean up user state
  sendSolStateManager.clearState(userId);
}

/**
 * Register send SOL actions
 */
export function registerSendSolActions(bot: any) {
  bot.action('menu_send_sol', handleSendSol);
  bot.action(/^send_sol_select_(\d+)$/, handleSendSolSelectSender);
  bot.action('send_sol_confirm', handleSendSolConfirm);
}