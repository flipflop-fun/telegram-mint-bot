import { Connection, SystemProgram, PublicKey, Keypair, TransactionInstruction } from '@solana/web3.js';
import { createTransaction, sendTransaction } from '../../utils/solana/transaction';
import { getUserWallets } from '../../services/db';
import { Markup } from 'telegraf';
import bs58 from 'bs58';
import { MAINNET } from '../../../config';

function createSolTransferInstructions(
  recipientWallets: { address: string }[],
  senderPublicKey: PublicKey,
  lamportsPerWallet: bigint,
  remainder: bigint
): TransactionInstruction[] {
  return recipientWallets.map((wallet, index) => {
    const recipientPubKey = new PublicKey(wallet.address);
    let lamportsToSend = lamportsPerWallet;
    if (index === 0) lamportsToSend += remainder;
    return SystemProgram.transfer({
      fromPubkey: senderPublicKey,
      toPubkey: recipientPubKey,
      lamports: Number(lamportsToSend),
    });
  });
}

export async function distributeSol(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  try {
    const connection = new Connection(MAINNET);
    const userId = ctx.from.id as number;

    const senderWallet = ctx.wizard.state.wallets.find(
      (wallet: any) => wallet.address === ctx.wizard.state.senderWallet
    );

    if (!senderWallet || !senderWallet.private_key) {
      await ctx.reply(t('common.private_key_not_found'));
      return ctx.scene.leave();
    }

    const senderKeypair = Keypair.fromSecretKey(bs58.decode(senderWallet.private_key));

    if (ctx.wizard.state.mode === 'single') {
      const recipientWalletAddress = ctx.wizard.state.recipientWallet as string;
      const inputAmount = parseFloat(ctx.message.text);

      if (isNaN(inputAmount) || inputAmount <= 0) {
        await ctx.reply(t('common.invalid_amount'));
        return;
      }

      const lamports = Math.floor(inputAmount * 1e9);
      const instruction = SystemProgram.transfer({
        fromPubkey: senderKeypair.publicKey,
        toPubkey: new PublicKey(recipientWalletAddress),
        lamports,
      });

      await ctx.reply(t('sol.sending'));

      const transaction = await createTransaction(connection, senderKeypair.publicKey, [instruction]);
      const signature = await sendTransaction(connection, transaction, [senderKeypair]);

      const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
      const successMessage = t('tx.success_html', { explorer_url: explorerUrl, signature });

      await ctx.reply(successMessage, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')],
          [Markup.button.callback(t('buttons.my_wallets'), 'menu_my_wallets')],
        ]),
      });

      return;
    }

    // Even Distribution Mode
    const recipientWallets = getUserWallets(userId).filter(
      (wallet: any) => wallet.address !== ctx.wizard.state.senderWallet
    );

    if (recipientWallets.length === 0) {
      await ctx.reply(t('sol.no_wallets'));
      return ctx.scene.leave();
    }

    const amount = ctx.wizard.state.amount as number;
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply(t('common.invalid_amount'));
      return;
    }

    await ctx.reply(t('sol.distributing'));

    const totalLamports = BigInt(Math.floor(amount * 1e9));
    const numRecipients = BigInt(recipientWallets.length);
    const lamportsPerWallet = totalLamports / numRecipients;
    const remainder = totalLamports % numRecipients;

    const instructions = createSolTransferInstructions(
      recipientWallets,
      senderKeypair.publicKey,
      lamportsPerWallet,
      remainder
    );

    const transaction = await createTransaction(connection, senderKeypair.publicKey, instructions);
    const signature = await sendTransaction(connection, transaction, [senderKeypair]);

    const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
    const successMessage = t('tx.success_html', { explorer_url: explorerUrl, signature });

    await ctx.reply(successMessage, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')],
        [Markup.button.callback(t('buttons.my_wallets'), 'menu_my_wallets')],
      ]),
    });
  } catch (error: any) {
    console.error('Error during SOL distribution:', error.message);

    if (error.message.includes('insufficient lamports')) {
      await ctx.reply(t('errors.insufficient_funds_sol'));
    } else {
      await ctx.reply(t('common.error_try_again'));
    }
  } finally {
    return ctx.scene.leave();
  }
}

export { createSolTransferInstructions };
