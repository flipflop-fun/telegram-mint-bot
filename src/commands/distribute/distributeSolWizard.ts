import { Scenes, Markup } from 'telegraf';
import { getUserWallets } from '../../services/db';
import { distributeSol } from './distributeSol';
import { handleBackToMainMenu } from '../../utils/bot/navigation';
import { fetchMultipleSolBalances } from '../../services/viewBalances';

const distributeSolWizard = new Scenes.WizardScene(
  'distribute_sol_wizard',
  // Step 1: Choose distribution mode
  async (ctx: any) => {
    if (ctx.callbackQuery?.data === 'menu_main') {
      await handleBackToMainMenu(ctx);
      return ctx.scene.leave();
    }

    const msg = '🔄 Select a distribution mode:';
    await ctx.reply(msg, {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('Even Distribution', 'mode_even')],
        [Markup.button.callback('Single Transfer', 'mode_single')],
        [Markup.button.callback('🔙 Back to Main Menu', 'menu_main')],
      ]).reply_markup,
    });
    return ctx.wizard.next();
  },
  // Step 2: Handle mode-specific logic
  async (ctx: any) => {
    if (ctx.callbackQuery?.data === 'menu_main') {
      await handleBackToMainMenu(ctx);
      return ctx.scene.leave();
    }

    const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
    const msg = t('sol.mode_title');
    await ctx.reply(msg, {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(t('sol.mode_even'), 'mode_even')],
        [Markup.button.callback(t('sol.mode_single'), 'mode_single')],
        [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')],
      ]).reply_markup,
    });
    return ctx.wizard.next();
  },
  // Step 2: Handle mode-specific logic
  async (ctx: any) => {
    if (ctx.callbackQuery?.data === 'menu_main') {
      await handleBackToMainMenu(ctx);
      return ctx.scene.leave();
    }

    const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
    const mode = ctx.callbackQuery?.data.replace('mode_', '');
    ctx.wizard.state.mode = mode;

    const userId = ctx.from.id as number;
    const wallets = getUserWallets(userId);

    if (!wallets || wallets.length === 0) {
      await ctx.reply(t('sol.no_wallets'), {
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]]).reply_markup,
      });
      return ctx.scene.leave();
    }

    ctx.wizard.state.wallets = wallets;

    // Fetch balances for all wallets
    const walletAddresses = wallets.map((wallet: any) => wallet.address);
    const balances = await fetchMultipleSolBalances(walletAddresses);

    const msg = t('sol.select_sender');
    await ctx.reply(msg, {
      reply_markup: Markup.inlineKeyboard(
        balances
          .map((wallet: any, index: number) => {
            const shortAddress = `${wallet.address.slice(0, 3)}...${wallet.address.slice(-4)}`;
            const balance = wallet.solBalance.toFixed(2); // Show balance up to 2 decimal places
            return [
              Markup.button.callback(`${index + 1}. ${shortAddress}`, `select_sender_${wallet.address}`),
              Markup.button.callback(`💰 ${balance} ${t('units.sol')}`, `balance_${wallet.address}`),
            ];
          })
          .concat([[Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]])
      ).reply_markup,
    });
    return ctx.wizard.next();
  },
  // Step 3: Handle recipient wallets
  async (ctx: any) => {
    if (ctx.callbackQuery?.data === 'menu_main') {
      await handleBackToMainMenu(ctx);
      return ctx.scene.leave();
    }

    const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);

    if (ctx.callbackQuery?.data?.startsWith('select_sender_')) {
      const senderWallet = ctx.callbackQuery.data.replace('select_sender_', '');
      ctx.wizard.state.senderWallet = senderWallet;

      const wallets = ctx.wizard.state.wallets.filter((wallet: any) => wallet.address !== senderWallet);

      if (ctx.wizard.state.mode === 'even') {
        const msg =
          `✅ ${t('common.sender_wallet')}: ${senderWallet}\n\n` +
          t('sol.enter_total');
        await ctx.reply(msg, {
          reply_markup: Markup.inlineKeyboard([[Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]]).reply_markup,
        });
        return ctx.wizard.next();
      }

      const walletAddresses = wallets.map((wallet: any) => wallet.address);
      const balances = await fetchMultipleSolBalances(walletAddresses);

      const msg = t('sol.select_recipient');
      await ctx.reply(msg, {
        reply_markup: Markup.inlineKeyboard(
          balances
            .map((wallet: any, index: number) => {
              const shortAddress = `${wallet.address.slice(0, 3)}...${wallet.address.slice(-4)}`;
              const balance = wallet.solBalance.toFixed(2);
              return [
                Markup.button.callback(`${index + 1}. ${shortAddress}`, `select_recipient_${wallet.address}`),
                Markup.button.callback(`💰 ${balance} ${t('units.sol')}`, `balance_${wallet.address}`),
              ];
            })
            .concat([[Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]])
        ).reply_markup,
      });
      return;
    }

    if (ctx.callbackQuery?.data?.startsWith('select_recipient_')) {
      const recipientWallet = ctx.callbackQuery.data.replace('select_recipient_', '');
      ctx.wizard.state.recipientWallet = recipientWallet;

      const msg =
        `✅ ${t('common.sender_wallet')}:\n${ctx.wizard.state.senderWallet}\n\n` +
        `✅ ${t('common.recipient_wallet')}:\n${ctx.wizard.state.recipient_wallet || recipientWallet}\n\n` +
        t('sol.enter_amount');
      await ctx.reply(msg, {
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]]).reply_markup,
      });
      return ctx.wizard.next();
    }

    await ctx.reply(t('common.select_wallet'), {
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]]).reply_markup,
    });
  },
  // Step 4: Finalize and process the transaction
  async (ctx: any) => {
    if (ctx.callbackQuery?.data === 'menu_main') {
      await handleBackToMainMenu(ctx);
      return ctx.scene.leave();
    }

    const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);

    if (!ctx.message?.text) {
      await ctx.reply(t('common.invalid_input'));
      return;
    }

    const amount = parseFloat(ctx.message.text);

    if (isNaN(amount) || amount <= 0) {
      await ctx.reply(t('common.invalid_amount'));
      return;
    }

    ctx.wizard.state.amount = amount;

    await distributeSol(ctx);
    await handleBackToMainMenu(ctx);
    ctx.scene.leave();
  }
);

export { distributeSolWizard };
