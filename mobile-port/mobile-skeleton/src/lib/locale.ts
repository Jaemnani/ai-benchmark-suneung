import * as RNLocalize from 'react-native-localize';

export type AppLocale = 'ko' | 'ja' | 'en';
const SUPPORTED: AppLocale[] = ['ko', 'ja', 'en'];

export function detectLocale(): AppLocale {
  const locales = RNLocalize.getLocales();
  for (const loc of locales) {
    const tag = loc.languageCode.toLowerCase();
    if (SUPPORTED.includes(tag as AppLocale)) {
      return tag as AppLocale;
    }
  }
  return 'ko';
}

/**
 * next-intl은 `localePrefix: 'as-needed'`. 기본 로케일(ko)은 prefix 없이도 동작.
 * 다른 로케일은 path 앞에 prefix를 붙인다.
 */
export function withLocalePrefix(path: string, locale: AppLocale = detectLocale()): string {
  if (locale === 'ko') return path;
  if (path.startsWith(`/${locale}/`) || path === `/${locale}`) return path;
  return `/${locale}${path.startsWith('/') ? path : `/${path}`}`;
}
