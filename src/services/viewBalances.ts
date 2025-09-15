import { Connection, PublicKey } from '@solana/web3.js';
import Database from 'better-sqlite3';
import Bottleneck from 'bottleneck';
import { MAINNET, DB_FILE } from '../../config';

// Use the RPC endpoint from config
const connection = new Connection(MAINNET);
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
  const wallets = db.prepare('SELECT address FROM wallets WHERE user_id = ?').all(userId) as { address: string }[];

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
