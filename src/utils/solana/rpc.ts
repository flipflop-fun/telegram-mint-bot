import { Connection } from '@solana/web3.js';
import { getUserNetwork } from '../../services/db';
import { MAINNET, DEVNET } from '../../../config';

/**
 * Get RPC URL based on user's network configuration
 * @param userId - User ID to get network preference
 * @returns RPC URL string
 */
export function getUserRpcUrl(userId: number): string {
  const userNetwork = getUserNetwork(userId);
  return userNetwork === 'devnet' ? DEVNET : MAINNET;
}

/**
 * Create a Solana connection based on user's network configuration
 * @param userId - User ID to get network preference
 * @param commitment - Connection commitment level
 * @returns Solana Connection instance
 */
export function getUserConnection(userId: number, commitment: 'confirmed' | 'finalized' | 'processed' = 'confirmed'): Connection {
  const rpcUrl = getUserRpcUrl(userId);
  return new Connection(rpcUrl, commitment);
}

/**
 * Get explorer URL based on user's network configuration
 * @param userId - User ID to get network preference
 * @param type - Type of explorer URL ('tx' for transaction, 'address' for address)
 * @param value - Transaction signature or address
 * @returns Explorer URL string
 */
export function getUserExplorerUrl(userId: number, type: 'tx' | 'address', value: string): string {
  const userNetwork = getUserNetwork(userId);
  const clusterParam = userNetwork === 'devnet' ? '?cluster=devnet' : '';
  return `https://explorer.solana.com/${type}/${value}${clusterParam}`;
}