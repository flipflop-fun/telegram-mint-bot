import { Markup } from 'telegraf';

/**
 * Handle navigation back to the main menu.
 */
export async function handleBackToMainMenu(ctx: any) {
  const t = (ctx as any).i18n?.t?.bind((ctx as any).i18n) || ((k: string) => k);
  ctx.reply(
    `${t('main_menu.title')}` +
      `${t('main_menu.desc')}`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: t('buttons.generate_wallets'), callback_data: 'menu_generate_wallets' },
            { text: t('buttons.my_wallets'), callback_data: 'menu_my_wallets' },
          ],
          [
            { text: t('buttons.distribute_tokens'), callback_data: 'menu_distribute_tokens' },
            { text: t('buttons.help'), callback_data: 'menu_help' },
          ],
          [
            { text: t('buttons.language'), callback_data: 'menu_language' },
          ],
        ],
      },
    }
  );
}
