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
  try {
    const connection = new Connection(MAINNET);
    const { senderWallet, tokenMint, mode, wallets, recipientWallet, amount } = ctx.wizard.state as any;

    const senderDetails = wallets.find((w: any) => w.address === senderWallet);
    if (!senderDetails || !senderDetails.private_key) {
      await ctx.reply('❌ Unable to find the private key for the selected wallet.');
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
        throw new Error('No recipients available for even distribution.');
      }

      const amountPerWallet = parseFloat(amount) / totalRecipients.length;
      if (isNaN(amountPerWallet) || amountPerWallet <= 0) {
        throw new Error('Invalid amount for even distribution.');
      }

      recipients = totalRecipients.map((w: any) => ({
        wallet: w.address,
        amount: amountPerWallet,
      }));
    } else if (mode === 'single') {
      recipients = [{ wallet: recipientWallet, amount }];
    }

    if (recipients.length === 0) {
      await ctx.reply('❌ No valid recipient wallets found.');
      return ctx.scene.leave();
    }

    await ctx.reply('⏳ Sending SPL tokens, please wait...');

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

    const successMessage =
      `🎉 <b>Transaction Successful!</b>\n\n` +
      `📄 <b>Tx Hash:</b> <a href="${explorerUrl}">${signature}</a>\n\n` +
      `You can verify this transaction on the Solana Explorer`;

    await ctx.reply(successMessage, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Back to Menu', 'menu_main')],
        [Markup.button.callback('📜 My Wallets', 'menu_my_wallets')],
      ]),
    });
  } catch (error: any) {
    console.error('Error during SPL distribution:', error.message);

    if (error.message?.includes('insufficient funds')) {
      await ctx.reply(
        '❌ Transaction failed due to insufficient SPL token balance or funds to cover the transfer. Please ensure you have enough tokens and SOL for fees.'
      );
    } else if (error.message?.includes('custom program error')) {
      await ctx.reply(
        '❌ Transaction failed due to an error in the SPL Token program. Ensure the recipient wallet is valid and the token amount is correct.'
      );
    } else {
      await ctx.reply('❌ An error occurred during distribution. Please try again.');
    }
  } finally {
    return ctx.scene.leave();
  }
}
