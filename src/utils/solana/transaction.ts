import { Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';

export async function createTransaction(
  connection: Connection,
  payerKey: PublicKey,
  instructions: TransactionInstruction[]
): Promise<VersionedTransaction> {
  const blockhash = await connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey,
    recentBlockhash: blockhash.blockhash,
    instructions,
  }).compileToV0Message();

  return new VersionedTransaction(message);
}

export async function sendTransaction(
  connection: Connection,
  transaction: VersionedTransaction,
  signers: any[]
): Promise<string> {
  transaction.sign(signers);
  const signature = await connection.sendTransaction(transaction, { preflightCommitment: 'confirmed' });
  await connection.confirmTransaction(signature, 'confirmed');
  return signature;
}
