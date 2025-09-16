import { Connection, PublicKey, Keypair, TransactionInstruction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { createTransaction, sendTransaction } from '../../utils/solana/transaction';
import { Markup } from 'telegraf';
import bs58 from 'bs58';
import { MAINNET } from '../../../config';

async function ensureAssociatedTokenAccount(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
  payer: Keypair
): Promise<{ tokenAccount: PublicKey; createInstruction: TransactionInstruction | null }> {
  const tokenAccount = await getAssociatedTokenAddress(
    mint,
    owner,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const accountInfo = await connection.getAccountInfo(tokenAccount);
  if (!accountInfo) {
    const createInstruction = createAssociatedTokenAccountInstruction(
      payer.publicKey,
      tokenAccount,
      owner,
      mint
    );
    return { tokenAccount, createInstruction };
  }

  return { tokenAccount, createInstruction: null };
}

async function createSplTransferInstructions(
  connection: Connection,
  recipients: { wallet: string; amount: number }[],
  tokenMint: string,
  senderTokenAccount: PublicKey,
  senderKeypair: Keypair
): Promise<TransactionInstruction[]> {
  try {
    const instructions: TransactionInstruction[] = [];

    for (const { wallet, amount } of recipients) {
      const { tokenAccount: recipientTokenAccount, createInstruction } = await ensureAssociatedTokenAccount(
        connection,
        new PublicKey(tokenMint),
        new PublicKey(wallet),
        senderKeypair
      );

      if (createInstruction) {
        instructions.push(createInstruction);
      }

      instructions.push(
        createTransferInstruction(
          senderTokenAccount,
          recipientTokenAccount,
          senderKeypair.publicKey,
          Math.round(amount * 1e9)
        )
      );
    }

    return instructions;
  } catch (error: any) {
    console.error('Error creating SPL transfer instructions:', error.message);
    throw new Error('Failed to create SPL transfer instructions.');
  }
}

export async function distributeSpl(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  try {
    const connection = new Connection(MAINNET);
    const { senderWallet, tokenMint, mode, wallets, recipientWallet, amount } = ctx.wizard.state as any;

    const senderDetails = wallets.find((w: any) => w.address === senderWallet);
    if (!senderDetails || !senderDetails.private_key) {
      await ctx.reply(t('common.private_key_not_found'));
      return ctx.scene.leave();
    }

    const senderKeypair = Keypair.fromSecretKey(bs58.decode(senderDetails.private_key));

    const { tokenAccount: senderTokenAccount, createInstruction } = await ensureAssociatedTokenAccount(
      connection,
      new PublicKey(tokenMint),
      senderKeypair.publicKey,
      senderKeypair
    );

    let recipients: { wallet: string; amount: number }[] = [];

    if (mode === 'even') {
      const totalRecipients = wallets.filter((w: any) => w.address !== senderWallet);
      if (totalRecipients.length === 0) {
        await ctx.reply(t('spl.no_recipients'));
        return ctx.scene.leave();
      }

      const amountPerWallet = parseFloat(amount) / totalRecipients.length;
      if (isNaN(amountPerWallet) || amountPerWallet <= 0) {
        await ctx.reply(t('common.invalid_amount'));
        return ctx.scene.leave();
      }

      recipients = totalRecipients.map((w: any) => ({
        wallet: w.address,
        amount: amountPerWallet,
      }));
    } else if (mode === 'single') {
      recipients = [{ wallet: recipientWallet, amount }];
    }

    if (recipients.length === 0) {
      await ctx.reply(t('spl.no_recipients'));
      return ctx.scene.leave();
    }

    await ctx.reply(t('spl.sending'));

    const instructions: TransactionInstruction[] = [];
    if (createInstruction) instructions.push(createInstruction);

    const transferInstructions = await createSplTransferInstructions(
      connection,
      recipients,
      tokenMint,
      senderTokenAccount,
      senderKeypair
    );

    instructions.push(...transferInstructions);

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
    console.error('Error during SPL distribution:', error.message);

    if (error.message?.includes('insufficient funds')) {
      await ctx.reply(t('errors.insufficient_funds_spl'));
    } else if (error.message?.includes('custom program error')) {
      await ctx.reply(t('errors.spl_program_error'));
    } else {
      await ctx.reply(t('common.error_try_again'));
    }
  } finally {
    return ctx.scene.leave();
  }
}
