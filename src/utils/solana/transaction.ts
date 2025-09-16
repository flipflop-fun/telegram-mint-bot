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
  
  try {
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    console.log('Tx confirmation: ', confirmation);
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }
    
    return signature;
  } catch (confirmError) {
    console.error('Error while confirming transaction:', confirmError);
    
    try {
      const txStatus = await connection.getSignatureStatus(signature);
      console.log('Checking transaction status:', txStatus);
      
      if (txStatus.value && txStatus.value.confirmationStatus === 'confirmed' && !txStatus.value.err) {
        console.log('Transaction actually confirmed, ignoring confirmation error');
        return signature;
      }
    } catch (statusError) {
      console.error('Error while checking transaction status:', statusError);
    }
    
    throw confirmError;
  }
}
