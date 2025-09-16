import { Markup } from 'telegraf';
import { Connection, PublicKey, SystemProgram, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';
import { getUserWallets } from '../services/db';
import { createTransaction, sendTransaction } from '../utils/solana/transaction';
import { RPC } from '../../config';
import bs58 from 'bs58';

// Store user states for the send SOL flow
const userStates = new Map<number, {
  step: 'select_sender' | 'enter_recipient' | 'enter_amount' | 'confirm';
  senderWallet?: { address: string; private_key: string };
  recipientAddress?: string;
  amount?: number;
}>();

/**
 * Handle send SOL menu
 */
export async function handleSendSol(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;

  if (!userId) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  // Reset user state
  userStates.set(userId, { step: 'select_sender' });

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
export async function handleSendSolSelectSender(ctx: any) {
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
  console.log(`用户 ${userId} 选择了钱包 ${walletIndex}: ${selectedWallet.address}`);
  
  const userState = userStates.get(userId) || { step: 'select_sender' };
  userState.senderWallet = selectedWallet;
  userState.step = 'enter_recipient';
  userStates.set(userId, userState);

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

  const userState = userStates.get(userId);
  if (!userState || userState.step !== 'enter_recipient') {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  userState.recipientAddress = recipientAddress;
  userState.step = 'enter_amount';
  userStates.set(userId, userState);

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

  const userState = userStates.get(userId);
  if (!userState || userState.step !== 'enter_amount') {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  userState.amount = amount;
  userState.step = 'confirm';
  userStates.set(userId, userState);

  const confirmText = t('send.confirm_sol', {
    sender: `${userState.senderWallet!.address.slice(0, 6)}...${userState.senderWallet!.address.slice(-6)}`,
    recipient: `${userState.recipientAddress!.slice(0, 6)}...${userState.recipientAddress!.slice(-6)}`,
    amount: amount.toString()
  });

  await ctx.reply(confirmText, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [
        Markup.button.callback(t('buttons.confirm'), 'send_sol_confirm'),
        Markup.button.callback(t('buttons.cancel'), 'menu_main')
      ]
    ]).reply_markup,
  });

  ctx.session.waitingForSolAmount = false;
}

/**
 * Handle transaction confirmation and execution
 */
export async function handleSendSolConfirm(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;

  if (!userId) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  const userState = userStates.get(userId);
  if (!userState || userState.step !== 'confirm' || !userState.senderWallet || !userState.recipientAddress || !userState.amount) {
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
    const lamports = userState.amount * LAMPORTS_PER_SOL;

    // Check sender balance
    const balance = await connection.getBalance(senderKeypair.publicKey);
    const estimatedFee = 5000; // Estimated transaction fee in lamports
    
    console.log(`=== 发送SOL调试信息 ===`);
    console.log(`选择的发送钱包地址: ${userState.senderWallet.address}`);
    console.log(`钱包公钥: ${senderKeypair.publicKey.toBase58()}`);
    console.log(`钱包余额: ${balance / LAMPORTS_PER_SOL} SOL (${balance} lamports)`);
    console.log(`要发送金额: ${userState.amount} SOL (${lamports} lamports)`);
    console.log(`接收地址: ${userState.recipientAddress}`);
    console.log(`预估手续费: ${estimatedFee / LAMPORTS_PER_SOL} SOL (${estimatedFee} lamports)`);
    console.log(`总需要: ${(lamports + estimatedFee) / LAMPORTS_PER_SOL} SOL (${lamports + estimatedFee} lamports)`);
    console.log(`==================`);
    
    if (balance < lamports + estimatedFee) {
      const balanceInSol = balance / LAMPORTS_PER_SOL;
      const requiredInSol = (lamports + estimatedFee) / LAMPORTS_PER_SOL;
      await ctx.editMessageText(
        `❌ 余额不足\n\n` +
        `🏦 发送钱包: <code>${userState.senderWallet.address}</code>\n` +
        `💰 当前余额: ${balanceInSol.toFixed(6)} SOL\n` +
        `📍 接收地址: <code>${userState.recipientAddress}</code>\n` +
        `💸 需要金额: ${userState.amount} SOL\n` +
        `⛽ 预估手续费: ${(estimatedFee / LAMPORTS_PER_SOL).toFixed(6)} SOL\n` +
        `📊 总计需要: ${requiredInSol.toFixed(6)} SOL\n\n` +
        `请确保选择的钱包有足够的SOL用于交易和手续费。`,
        { parse_mode: 'HTML' }
      );
      userStates.delete(userId);
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
    console.error('Error sending SOL:', error);
    await ctx.editMessageText(t('errors.insufficient_funds_sol'), {
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
 * Register send SOL actions
 */
export function registerSendSolActions(bot: any) {
  bot.action('menu_send_sol', handleSendSol);
  bot.action(/^send_sol_select_(\d+)$/, handleSendSolSelectSender);
  bot.action('send_sol_confirm', handleSendSolConfirm);

  // Handle text input for recipient and amount
  bot.on('text', async (ctx: any) => {
    if (ctx.session?.waitingForSolRecipient) {
      await handleRecipientInput(ctx);
    } else if (ctx.session?.waitingForSolAmount) {
      await handleAmountInput(ctx);
    }
  });
}