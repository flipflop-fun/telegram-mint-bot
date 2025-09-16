import { Markup } from 'telegraf';
import { getInlineKeyboard } from '../config';

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
        inline_keyboard: getInlineKeyboard(t),
      },
    }
  );
}
