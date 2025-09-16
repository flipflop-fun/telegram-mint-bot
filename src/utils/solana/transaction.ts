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
  
  // 改进交易确认逻辑
  try {
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    console.log('交易确认结果:', confirmation);
    
    // 检查交易是否真的成功
    if (confirmation.value.err) {
      throw new Error(`交易失败: ${JSON.stringify(confirmation.value.err)}`);
    }
    
    return signature;
  } catch (confirmError) {
    console.error('交易确认过程中出错:', confirmError);
    
    // 即使确认失败，也检查交易是否实际成功
    try {
      const txStatus = await connection.getSignatureStatus(signature);
      console.log('交易状态检查:', txStatus);
      
      if (txStatus.value && txStatus.value.confirmationStatus === 'confirmed' && !txStatus.value.err) {
        console.log('交易实际上已成功，忽略确认错误');
        return signature;
      }
    } catch (statusError) {
      console.error('获取交易状态失败:', statusError);
    }
    
    // 如果确认失败且无法验证交易状态，抛出原始错误
    throw confirmError;
  }
}
