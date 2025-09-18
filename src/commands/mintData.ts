import { Markup } from 'telegraf';
import { PublicKey } from '@solana/web3.js';
import { getMintData, GetMintDataResponse } from '@flipflop-sdk/node';
import { getUserRpcUrl, getUserExplorerUrl } from '../utils/solana/rpc';
import { UserStateManager, UserState } from '../utils/stateManager';
import { ApiResponse } from '@flipflop-sdk/node/dist/raydium/types';
import https from 'https';
import http from 'http';

// Define mint data state interface
interface MintDataState extends UserState {
  step: 'enter_mint_address' | 'display_data';
  data: {
    mintAddress?: string;
  };
}

// Create mint data state manager instance
const mintDataStateManager = new UserStateManager<MintDataState>();

// Helper function to fetch data from URI with redirect support
async function fetchUriData(uri: string, maxRedirects: number = 5): Promise<any> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      reject(new Error('Too many redirects'));
      return;
    }

    try {
      const url = new URL(uri);
      const client = url.protocol === 'https:' ? https : http;
      
      const request = client.get(uri, (response) => {
        const statusCode = response.statusCode || 0;
        
        // Handle redirects (301, 302, 303, 307, 308)
        if (statusCode >= 300 && statusCode < 400) {
          const location = response.headers.location;
          if (location) {
            // Recursively follow redirect
            fetchUriData(location, maxRedirects - 1)
              .then(resolve)
              .catch(reject);
            return;
          } else {
            reject(new Error(`HTTP ${statusCode}: No location header for redirect`));
            return;
          }
        }
        
        // Check for other non-successful status codes
        if (statusCode < 200 || statusCode >= 400) {
          reject(new Error(`HTTP ${statusCode}: ${response.statusMessage}`));
          return;
        }
        
        let data = '';
        
        response.on('data', (chunk) => {
          data += chunk;
        });
        
        response.on('end', () => {
          try {
            if (!data.trim()) {
              reject(new Error('Empty response data'));
              return;
            }
            const jsonData = JSON.parse(data);
            resolve(jsonData);
          } catch (error) {
            reject(new Error(`Failed to parse JSON data: ${error instanceof Error ? error.message : 'Unknown error'}`));
          }
        });
        
        response.on('error', (error) => {
          reject(new Error(`Response error: ${error.message}`));
        });
      });
      
      request.on('error', (error) => {
        reject(new Error(`Request error: ${error.message}`));
      });
      
      request.setTimeout(10000, () => {
        request.destroy();
        reject(new Error('Request timeout after 10 seconds'));
      });
      
    } catch (error) {
      reject(new Error(`Invalid URI: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  });
}

// Helper function to safely edit message or send new one if edit fails
async function safeEditOrReply(ctx: any, text: string, options: any) {
  try {
    await ctx.editMessageText(text, options);
  } catch (error) {
    // Remove reply_markup from options and send as new message
    const replyOptions = { ...options };
    await ctx.reply(text, replyOptions);
  }
}

/**
 * Handle mint data menu - allows users to view token information
 */
export async function handleMintData(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;

  if (!userId) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  // Reset user state
  mintDataStateManager.setState(userId, { step: 'enter_mint_address', data: {} });

  const menuText = t('mint_data.title');
  
  try {
    if (ctx.callbackQuery) {
      await safeEditOrReply(ctx, `${menuText}\n\n${t('mint_data.enter_mint_address')}`, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
        ]).reply_markup,
      });
    } else {
      await ctx.reply(`${menuText}\n\n${t('mint_data.enter_mint_address')}`, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
        ]).reply_markup,
      });
    }

    // Set up text message handler for mint address
    ctx.session = ctx.session || {};
    ctx.session.waitingForMintDataAddress = true;
  } catch (error) {
    console.error('Error in handleMintData:', error);
    await ctx.reply(t('common.error_try_again'));
  }
}

/**
 * Handle mint address input and display token data
 */
export async function handleMintDataAddressInput(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const userId = ctx.from?.id;
  const mintAddress = ctx.message?.text?.trim();

  if (!userId || !mintAddress) {
    await ctx.reply(t('common.error_try_again'));
    return;
  }

  const userState = mintDataStateManager.getState(userId);
  if (!userState || userState.step !== 'enter_mint_address') {
    return;
  }

  // Clear the waiting flag
  if (ctx.session) {
    ctx.session.waitingForMintDataAddress = false;
  }

  // Validate mint address
  try {
    new PublicKey(mintAddress);
  } catch (error) {
    await ctx.reply(t('mint_data.invalid_address'), {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
      ]).reply_markup,
    });
    return;
  }

  // Update state
  if (!userState.data) {
    userState.data = {};
  }
  (userState.data as any).mintAddress = mintAddress;
  userState.step = 'display_data';
  mintDataStateManager.updateState(userId, userState);

  // Show loading message
  const loadingMessage = await ctx.reply("Loading...", {
    parse_mode: 'HTML'
  });

  try {
    // Fetch mint data using FlipFlop SDK
    const response = await getMintData({
      rpc: getUserRpcUrl(userId),
      mint: new PublicKey(mintAddress)
    }) as ApiResponse<GetMintDataResponse>;
    
    if (!response || !response.success || !response.data) {
      await ctx.telegram.editMessageText(
        loadingMessage.chat.id,
        loadingMessage.message_id,
        undefined,
        t('mint_data.not_found'),
        {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
          ]).reply_markup,
        }
      );
      mintDataStateManager.clearState(userId);
      return;
    }

    const mintData = response.data;

    // Format the mint data for display
    const dataText = `${t('mint_data.data_title')}\n\n` +
      `${t('mint_data.mint_address')}\n<code>${mintAddress}</code>\n` +
      `${t('mint_data.flipflop_url', { url: `https://${getUserRpcUrl(userId).includes('devnet') ? 'test' : 'app'}.flipflop.plus/token/${mintAddress}` })}\n\n` +
      `${t('mint_data.token_name')} ${mintData.name || t('mint_data.no_name')}\n` +
      `${t('mint_data.token_symbol')} ${mintData.symbol || t('mint_data.no_symbol')}\n` +
      `${t('mint_data.metadata_uri')} ${mintData.uri}\n` +
      `${t('mint_data.admin')} ${mintData.admin ? `<code>${mintData.admin}</code>` : t('mint_data.no_authority')}\n\n` +

      `${t('mint_data.current_supply')} ${mintData.currentSupply?.toLocaleString()} ${mintData.symbol || t('mint_data.no_symbol')}\n` +
      `${t('mint_data.max_supply')} ${mintData.maxSupply ? mintData.maxSupply.toLocaleString() : t('mint_data.unlimited')} ${mintData.symbol || t('mint_data.no_symbol')}\n` +
      `${t('mint_data.supply_rate')} ${(mintData.currentSupply / mintData.maxSupply * 100).toFixed(2)}%\n` +

      `${t('mint_data.initial_mint_size')} ${mintData.initialMintSize} ${mintData.symbol || t('mint_data.no_symbol')}\n` +
      `${t('mint_data.mint_size_epoch')} ${mintData.mintSizeEpoch} ${mintData.symbol || t('mint_data.no_symbol')}\n` +
      `${t('mint_data.difficulty_coefficient')} ${mintData.difficultyCoefficient}\n` +
      `${t('mint_data.fee_rate')} ${mintData.feeRate} SOL\n` +
      `${t('mint_data.target_eras')} ${mintData.targetEras || 'N/A'}\n` +
      `${t('mint_data.current_era')} ${mintData.currentEra - 1}\n` +
      `${t('mint_data.current_epoch')} ${mintData.currentEpoch || 'N/A'}\n` +
      `${t('mint_data.target_seconds_per_epoch')} ${mintData.targetSecondsPerEpoch} Seconds\n` +
      `${t('mint_data.token_vault_balance')} ${mintData.tokenVaultBalance} ${mintData.symbol || t('mint_data.no_symbol')}\n` +
      `${t('mint_data.wsol_vault_balance')} ${mintData.wsolVaultBalance} SOL`;

    const explorerUrl = getUserExplorerUrl(userId, 'address', mintAddress);

    // Create buttons for copying important data
    const buttons = [
      [
        // Markup.button.callback(t('buttons.copy_mint_address'), `copy_mint_${mintAddress}`),
        Markup.button.url(t('buttons.view_on_explorer'), explorerUrl)
      ],
      [
        // Markup.button.callback(t('buttons.check_another'), 'menu_mint_data'),
        Markup.button.callback(t('buttons.back_to_main'), 'menu_main')
      ]
    ];

    await ctx.telegram.editMessageText(
      loadingMessage.chat.id,
      loadingMessage.message_id,
      undefined,
      dataText,
      {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
      }
    );

    // Try to fetch and display image if URI is available
    if (mintData.uri) {
      try {
        const metadataJson = await fetchUriData(mintData.uri);
        if (metadataJson && metadataJson.image) {
          const imageUrl = metadataJson.image.trim();
          if (imageUrl) {
            // Send the image as a photo
            await ctx.replyWithPhoto(imageUrl, {
              caption: `🖼️ ${t('mint_data.token_image')}\n${mintData.name || t('mint_data.no_name')} (${mintData.symbol || t('mint_data.no_symbol')})`,
              parse_mode: 'HTML',
              reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
              ]).reply_markup,
            });
          }
        }
      } catch (imageError) {
        console.log('Failed to fetch or display image:', imageError.message);
        // Don't show error to user for image failures, just log it
      }
    }

    // Clean up user state
    mintDataStateManager.clearState(userId);

  } catch (error) {
    console.error('Error fetching mint data:', error);
    
    let errorMessage = t('mint_data.fetch_error');
    if (error.message) {
      errorMessage += `\n\n${t('common.error_details')}: ${error.message}`;
    }

    await ctx.telegram.editMessageText(
      loadingMessage.chat.id,
      loadingMessage.message_id,
      undefined,
      errorMessage,
      {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]
        ]).reply_markup,
      }
    );

    // Clean up user state
    mintDataStateManager.clearState(userId);
  }
}

/**
 * Handle copy actions for mint data
 */
export async function handleMintDataCopyAction(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
  const callbackData = ctx.callbackQuery?.data;

  if (callbackData && callbackData.startsWith('copy_mint_')) {
    const mintAddress = callbackData.replace('copy_mint_', '');
    await ctx.answerCbQuery(t('mint_data.copied_mint_address'));
    await ctx.reply(`<code>${mintAddress}</code>`, { parse_mode: 'HTML' });
  }
}

/**
 * Register mint data actions
 */
export function registerMintDataActions(bot: any) {
  bot.action('menu_mint_data', handleMintData);
  bot.action(/^copy_mint_/, handleMintDataCopyAction);
}