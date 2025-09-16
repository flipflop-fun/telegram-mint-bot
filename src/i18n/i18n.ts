import { getUserLanguage as dbGetUserLanguage, setUserLanguage as dbSetUserLanguage } from '../services/db';
import enJson from './locales/en.json';
import esJson from './locales/es.json';
import zhCNJson from './locales/zh-CN.json';
import frJson from './locales/fr.json';
import zhTWJson from './locales/zh-TW.json';
import jaJson from './locales/ja.json';
import viJson from './locales/vi.json';
import ruJson from './locales/ru.json';

export type Locale = 'en' | 'es' | 'fr' | 'zh-CN' | 'zh-TW' | 'ja' | 'vi' | 'ru';

export const SUPPORTED_LOCALES: Locale[] = ['en', 'es', 'fr', 'zh-CN', 'zh-TW', 'ja', 'vi', 'ru'];

export const LANGUAGE_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ja: '日本語',
  vi: 'Tiếng Việt',
  ru: 'Русский',
};

function format(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => String(params[key] ?? match));
}

export function resolveLanguageCode(code?: string): Locale {
  if (!code) return 'en';
  
  // Direct match
  if (SUPPORTED_LOCALES.includes(code as Locale)) {
    return code as Locale;
  }
  
  // Language code prefix match (e.g., 'zh-CN' from 'zh')
  const prefixMatch = SUPPORTED_LOCALES.find(locale => locale.startsWith(code.split('-')[0]));
  return prefixMatch || 'en';
}

// Load all translation dictionaries from JSON files
const tr: Record<Locale, Record<string, string>> = {
  en: enJson as Record<string, string>,
  es: esJson as Record<string, string>,
  fr: frJson as Record<string, string>,
  'zh-CN': zhCNJson as Record<string, string>,
  'zh-TW': zhTWJson as Record<string, string>,
  ja: jaJson as Record<string, string>,
  vi: viJson as Record<string, string>,
  ru: ruJson as Record<string, string>,
};

export type TranslateParams = Record<string, string | number>;

export async function getUserLocale(userId: number, tgLangCode?: string): Promise<Locale> {
  const userLang = await dbGetUserLanguage(userId);
  if (userLang && SUPPORTED_LOCALES.includes(userLang as Locale)) {
    return userLang as Locale;
  }
  return resolveLanguageCode(tgLangCode);
}

export function t(locale: Locale, key: string, params?: TranslateParams): string {
  const dict = tr[locale] || tr.en;
  const template = dict[key] || tr.en[key] || key;
  return format(template, params);
}

export async function setUserLocale(userId: number, locale: Locale): Promise<void> {
  await dbSetUserLanguage(userId, locale);
}

// Context type for i18n middleware
export type CtxWithI18n = {
  i18n: {
    locale: Locale;
    t: (key: string, params?: TranslateParams) => string;
    setLocale: (loc: Locale) => Promise<void>;
  };
} & any;

export function withI18n() {
  return async (ctx: any, next: () => Promise<void>) => {
    const userId = ctx.from?.id;
    if (!userId) {
      ctx.i18n = {
        locale: 'en' as Locale,
        t: (key: string, params?: TranslateParams) => t('en', key, params),
        setLocale: async () => {},
      };
      return next();
    }

    const locale = await getUserLocale(userId, ctx.from?.language_code);
    ctx.i18n = {
      locale,
      t: (key: string, params?: TranslateParams) => t(locale, key, params),
      setLocale: async (newLocale: Locale) => {
        await setUserLocale(userId, newLocale);
        ctx.i18n.locale = newLocale;
        ctx.i18n.t = (key: string, params?: TranslateParams) => t(newLocale, key, params);
      },
    };

    return next();
  };
}

export { tr };
