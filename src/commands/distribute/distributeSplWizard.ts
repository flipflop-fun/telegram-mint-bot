import { Scenes, Markup } from 'telegraf';
import { getUserWallets } from '../../services/db';
import { distributeSpl } from './distributeSpl';
import { handleBackToMainMenu } from '../../utils/bot/navigation';
import { fetchSingleSplTokenBalances } from '../../services/viewBalances';

const distributeSplWizard = new Scenes.WizardScene(
  'distribute_spl_wizard',
  // Step 1: Select the wallet to distribute from
  async (ctx: any) => {
    try {
      const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
      const userId = ctx.from.id as number;
      const wallets = getUserWallets(userId);
      ctx.wizard.state.wallets = wallets;

      if (!wallets || wallets.length === 0) {
        await ctx.reply(t('sol.no_wallets'), {
          reply_markup: Markup.inlineKeyboard([[Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]]).reply_markup,
        });
        return ctx.scene.leave();
      }

      await ctx.reply(t('spl.select_sender'), {
        reply_markup: Markup.inlineKeyboard(
          wallets
            .map((wallet: any) => {
              const shortAddress = `${wallet.address.slice(0, 3)}...${wallet.address.slice(-4)}`;
              return [Markup.button.callback(`🔑 ${shortAddress}`, `select_sender_${wallet.address}`)];
            })
            .concat([[Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]])
        ).reply_markup,
      });
      return ctx.wizard.next();
    } catch (error: any) {
      console.error('Error in Step 1:', error.message);
      const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
      await ctx.reply(t('common.error_try_again'));
      return ctx.scene.leave();
    }
  },

  // Step 2: Fetch SPL Token Balances and Ask for Contract Address
  async (ctx: any) => {
    try {
      const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
      if (ctx.callbackQuery?.data === 'menu_main') {
        await handleBackToMainMenu(ctx);
        return ctx.scene.leave();
      }

      if (!ctx.callbackQuery?.data.startsWith('select_sender_')) {
        await ctx.reply(t('spl.select_sender'));
        return;
      }

      const senderWallet = ctx.callbackQuery.data.replace('select_sender_', '');
      ctx.wizard.state.senderWallet = senderWallet;

      await ctx.reply(t('spl.fetching_tokens'));

      const splTokens = await fetchSingleSplTokenBalances(senderWallet);

      if (splTokens.length === 0) {
        await ctx.reply(t('spl.no_tokens_wallet'), {
          reply_markup: Markup.inlineKeyboard(
            ctx.wizard.state.wallets
              .filter((wallet: any) => wallet.address !== senderWallet)
              .map((wallet: any) => {
                const shortAddress = `${wallet.address.slice(0, 3)}...${wallet.address.slice(-4)}`;
                return [Markup.button.callback(`🔑 ${shortAddress}`, `select_sender_${wallet.address}`)];
              })
              .concat([[Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]])
          ).reply_markup,
        });
        return;
      }

      ctx.wizard.state.splTokens = splTokens;

      await ctx.reply(t('spl.choose_token_or_manual'), {
        reply_markup: Markup.inlineKeyboard(
          splTokens
            .map((token: any) => {
              const shortMint = `${token.mint.slice(0, 3)}...${token.mint.slice(-4)}`;
              return [Markup.button.callback(`💳 ${shortMint} (${token.balance})`, `select_token_${token.mint}`)];
            })
            .concat([[Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]])
        ).reply_markup,
      });
      return ctx.wizard.next();
    } catch (error: any) {
      console.error('Error in Step 2:', error.message);
      const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
      await ctx.reply(t('common.error_try_again'));
      return ctx.scene.leave();
    }
  },

  // Step 3: Choose SPL Token Contract Address or Manual Entry
  async (ctx: any) => {
    try {
      const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
      if (ctx.callbackQuery?.data === 'menu_main') {
        await handleBackToMainMenu(ctx);
        return ctx.scene.leave();
      }

      if (ctx.callbackQuery?.data?.startsWith('select_token_')) {
        const tokenMint = ctx.callbackQuery.data.replace('select_token_', '');
        ctx.wizard.state.tokenMint = tokenMint;
      } else if (ctx.message?.text) {
        ctx.wizard.state.tokenMint = ctx.message.text.trim();
      } else {
        await ctx.reply(t('spl.select_token_prompt'));
        return;
      }

      await ctx.reply(t('spl.mode_title'), {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback(t('spl.mode_even'), 'mode_even')],
          [Markup.button.callback(t('spl.mode_single'), 'mode_single')],
          [Markup.button.callback(t('buttons.back_to_main'), 'menu_main')],
        ]).reply_markup,
      });
      return ctx.wizard.next();
    } catch (error: any) {
      console.error('Error in Step 3:', error.message);
      const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
      await ctx.reply(t('common.error_try_again'));
      return ctx.scene.leave();
    }
  },

  // Step 4: Handle mode-specific logic
  async (ctx: any) => {
    try {
      const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
      if (ctx.callbackQuery?.data === 'menu_main') {
        await handleBackToMainMenu(ctx);
        return ctx.scene.leave();
      }

      const mode = ctx.callbackQuery?.data.replace('mode_', '');
      ctx.wizard.state.mode = mode;

      const wallets = ctx.wizard.state.wallets.filter((wallet: any) => wallet.address !== ctx.wizard.state.senderWallet);

      if (mode === 'even') {
        ctx.wizard.state.recipients = wallets.map((wallet: any) => wallet.address);
        const msg =
          `✅ ${t('common.sender_wallet')}: ${ctx.wizard.state.senderWallet}\n\n` +
          t('spl.enter_total', { count: wallets.length });
        await ctx.reply(msg, {
          reply_markup: Markup.inlineKeyboard([[Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]]).reply_markup,
        });

        return ctx.wizard.next();
      } else if (mode === 'single') {
        const msg = t('spl.select_recipient');
        await ctx.reply(msg, {
          reply_markup: Markup.inlineKeyboard(
            wallets
              .map((wallet: any) => {
                const shortAddress = `${wallet.address.slice(0, 3)}...${wallet.address.slice(-4)}`;
                return [Markup.button.callback(`🔑 ${shortAddress}`, `select_recipient_${wallet.address}`)];
              })
              .concat([[Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]])
          ).reply_markup,
        });
        return ctx.wizard.next();
      }
    } catch (error: any) {
      console.error('Error in Step 4:', error.message);
      const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
      await ctx.reply(t('common.error_try_again'));
      return ctx.scene.leave();
    }
  },

  // Step 5: For even mode, handle user input for total amount
  // For single mode, handle recipient selection
  async (ctx: any) => {
    try {
      const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
      if (ctx.callbackQuery?.data === 'menu_main') {
        await handleBackToMainMenu(ctx);
        return ctx.scene.leave();
      }

      if (ctx.wizard.state.mode === 'even') {
        if (!ctx.message?.text) {
          await ctx.reply(t('common.invalid_input'));
          return;
        }

        const totalAmount = parseFloat(ctx.message.text);

        if (isNaN(totalAmount) || totalAmount <= 0) {
          await ctx.reply(t('common.invalid_amount'));
          return;
        }

        const recipients = ctx.wizard.state.recipients.map((address: string) => ({
          wallet: address,
          amount: totalAmount / ctx.wizard.state.recipients.length,
        }));

        ctx.wizard.state.allocations = recipients;
        await distributeSpl(ctx);
        await handleBackToMainMenu(ctx);
        return ctx.scene.leave();
      } else {
        if (ctx.callbackQuery?.data?.startsWith('select_recipient_')) {
          const recipientWallet = ctx.callbackQuery.data.replace('select_recipient_', '');
          ctx.wizard.state.recipientWallet = recipientWallet;

          const msg =
            `✅ ${t('common.sender_wallet')}:\n${ctx.wizard.state.senderWallet}\n\n` +
            `✅ ${t('common.recipient_wallet')}:\n${ctx.wizard.state.recipientWallet}\n\n` +
            t('spl.enter_amount');

          await ctx.reply(msg, {
            reply_markup: Markup.inlineKeyboard([[Markup.button.callback(t('buttons.back_to_main'), 'menu_main')]]).reply_markup,
          });
          return ctx.wizard.next();
        } else {
          await ctx.reply(t('common.select_wallet'));
        }
      }
    } catch (error: any) {
      console.error('Error in Step 5:', error.message);
      const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
      await ctx.reply(t('common.error_try_again'));
      return ctx.scene.leave();
    }
  },

  // Step 6: For single mode, handle token amount input
  async (ctx: any) => {
    try {
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

      await distributeSpl(ctx);
      await handleBackToMainMenu(ctx);
      return ctx.scene.leave();
    } catch (error: any) {
      console.error('Error in Step 6:', error.message);
      const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string, p?: any) => k);
      await ctx.reply(t('common.error_try_again'));
      return ctx.scene.leave();
    }
  }
);

export { distributeSplWizard };
