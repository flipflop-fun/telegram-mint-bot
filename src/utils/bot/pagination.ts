import { Markup } from 'telegraf';

// Chunks an array into smaller arrays of a specified size.
export function chunkArray<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

// Creates a pagination keyboard for inline navigation.
export function createPaginationKeyboard(currentPage: number, totalPages: number, callbackPrefix: string) {
  const buttons: any[] = [];

  if (currentPage > 1) {
    buttons.push(Markup.button.callback('⬅️ Previous', `${callbackPrefix}${currentPage - 1}`));
  }

  if (currentPage < totalPages) {
    buttons.push(Markup.button.callback('➡️ Next', `${callbackPrefix}${currentPage + 1}`));
  }

  return buttons.length > 0 ? [buttons] : [];
}

// Sends a paginated list of wallets to the user.
export async function sendWalletPage(ctx: any, wallets: { address: string }[], page: number) {
  const itemsPerPage = 10;
  const totalPages = Math.ceil(wallets.length / itemsPerPage);
  const start = (page - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const walletsToShow = wallets.slice(start, end);

  const message = `💰 <b>Wallets</b> - Page ${page}`;

  const walletButtons = walletsToShow.map((wallet) => {
    const shortAddress = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-6)}`;
    return [Markup.button.callback(`Select (${shortAddress})`, `select_wallet_${wallet.address}`)];
  });

  const paginationButtons = createPaginationKeyboard(page, totalPages, 'wallets_page_');
  const inlineKeyboard = [...walletButtons, ...paginationButtons];

  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard(inlineKeyboard).reply_markup,
  });
}

// Sends a paginated list of transactions to the user.
export async function sendTransactionPage(ctx: any, transactions: string[], page: number) {
  const itemsPerPage = 5;
  const totalPages = Math.ceil(transactions.length / itemsPerPage);
  const start = (page - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const txsToShow = transactions.slice(start, end);

  let header = `📄 <b>Transactions</b> - Page ${page}\n\n`;

  const txLines = txsToShow.map((tx, index) => {
    return `<b>Transaction ${index + 1}:</b> <code>${tx}</code>`;
  });

  const txMessage = txLines.join('\n\n');
  const message = header + txMessage;

  const paginationButtons = createPaginationKeyboard(page, totalPages, 'tx_page_');

  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard(paginationButtons).reply_markup,
  });
}
