import { Connection, PublicKey } from '@solana/web3.js';
import Database from 'better-sqlite3';
import Bottleneck from 'bottleneck';
import { RPC, DB_FILE } from '../../config';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { getUserWallets } from './db';

// Use the RPC endpoint from config
const connection = new Connection(RPC, 'confirmed');
const db = new Database(DB_FILE);

const limiter = new Bottleneck({
  minTime: 200, // Minimum time between requests (5 requests per second)
  maxConcurrent: 5, // Maximum concurrent requests
});

export async function fetchMultipleSolBalances(addresses: string[]): Promise<{ address: string; solBalance: number }[]> {
  try {
    const publicKeys = addresses.map((addr) => new PublicKey(addr));
    const accountsInfo = await limiter.schedule(() => connection.getMultipleAccountsInfo(publicKeys));

    return accountsInfo.map((info, index) => ({
      address: addresses[index],
      solBalance: info?.lamports ? info.lamports / 1e9 : 0,
    }));
  } catch (error: any) {
    console.error('Error fetching SOL balances:', error.message);
    return [];
  }
}

export async function fetchMultipleSplTokenBalances(
  addresses: string[]
): Promise<Record<string, { mint: string; balance: number; decimals: number }[]>> {
  try {
    const results = await Promise.all(
      addresses.map(async (address) => {
        const publicKey = new PublicKey(address);
        const tokenAccounts = await limiter.schedule(() =>
          connection.getParsedTokenAccountsByOwner(publicKey, {
            programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
          })
        );

        return {
          address,
          tokens: tokenAccounts.value.map(({ account }: any) => {
            const tokenAmount = account.data.parsed.info.tokenAmount;
            return {
              mint: account.data.parsed.info.mint,
              balance: tokenAmount.uiAmount || 0,
              decimals: tokenAmount.decimals,
            };
          }),
        };
      })
    );

    return results.reduce((acc, { address, tokens }) => {
      acc[address] = tokens;
      return acc;
    }, {} as Record<string, { mint: string; balance: number; decimals: number }[]>);
  } catch (error: any) {
    console.error('Error fetching SPL token balances:', error.message);
    return {};
  }
}

export async function fetchSingleSplTokenBalances(
  address: string
): Promise<{ mint: string; balance: number; decimals: number }[]> {
  try {
    const publicKey = new PublicKey(address);
    const tokenAccounts = await limiter.schedule(() =>
      connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      })
    );

    return tokenAccounts.value.map(({ account }: any) => {
      const tokenAmount = account.data.parsed.info.tokenAmount;
      console.log("tokenAmount", tokenAmount);
      return {
        mint: account.data.parsed.info.mint,
        balance: tokenAmount.uiAmount || 0,
        decimals: tokenAmount.decimals,
      };
    });
  } catch (error: any) {
    console.error(`Error fetching SPL token balances for address ${address}:`, error.message);
    return [];
  }
}

// View balances logic
export async function viewBalances(userId: number): Promise<
  { address: string; solBalance: number; splTokens: { mint: string; balance: number; decimals: number }[] }[]
> {
  const wallets = getUserWallets(userId).map(wallet => ({ address: wallet.address }));

  if (wallets.length === 0) {
    return [];
  }

  const addresses = wallets.map((wallet) => wallet.address);

  const solBalances = await fetchMultipleSolBalances(addresses);

  const splBalances = await fetchMultipleSplTokenBalances(addresses);

  const balances = solBalances.map(({ address, solBalance }) => ({
    address,
    solBalance,
    splTokens: splBalances[address] || [],
  }));

  return balances;
}

// 定义 TokenRefundData 接口
interface TokenRefundData {
  owner: PublicKey;
  totalTokens: bigint;
  totalMintFee: bigint;
  totalReferrerFee: bigint;
  isProcessing: boolean;
  vaultTokens: bigint;
}

function parseTokenRefundData(data: Buffer): TokenRefundData {
  let offset = 0;
  const owner = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const totalTokens = data.readBigUInt64LE(offset);
  offset += 8;
  const totalMintFee = data.readBigUInt64LE(offset);
  offset += 8;
  const totalReferrerFee = data.readBigUInt64LE(offset);
  offset += 8;
  const isProcessing = data.readUInt8(offset) === 1;
  offset += 1;
  const vaultTokens = data.readBigUInt64LE(offset);
  
  return {
    owner,
    totalTokens,
    totalMintFee,
    totalReferrerFee,
    isProcessing,
    vaultTokens
  };
}

export const getRefundAccountData = async (owner: PublicKey, mint: PublicKey): Promise<TokenRefundData | null> => {
  try {
    const [refundAccountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("refund"), mint.toBuffer(), owner.toBuffer()],
      new PublicKey("FLipzZfErPUtDQPj9YrC6wp4nRRiVxRkFm3jdFmiPHJV"),
    );
    
    const refundAccountData = await connection.getAccountInfo(refundAccountPda);
    if (!refundAccountData || !refundAccountData.data) {
      return null;
    }
    
    // 解析账户数据
    const parsedData = parseTokenRefundData(refundAccountData.data);
    
    // console.log('Parsed refund account data:', {
    //   owner: parsedData.owner.toString(),
    //   totalTokens: parsedData.totalTokens.toString(),
    //   totalMintFee: parsedData.totalMintFee.toString(),
    //   totalReferrerFee: parsedData.totalReferrerFee.toString(),
    //   isProcessing: parsedData.isProcessing,
    //   vaultTokens: parsedData.vaultTokens.toString()
    // });
    
    return parsedData;
  } catch (error) {
    console.error("getRefundAccountData error:", error);
    return null;
  }
}

export const getMyTokenBalance = async (owner: PublicKey, mint: PublicKey) => {
  const ata = await getAssociatedTokenAddress(mint, owner, false);
  return await connection.getTokenAccountBalance(ata);
}