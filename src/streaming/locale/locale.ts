const DEFAULT_LOCALE = "en-US";

export interface LocaleController {
  /** The locale in effect right now. */
  get(): string;
  /** Adopt a locale the bot declared, updating `<html lang>`. Ignores malformed values. */
  setFromBot(locale: unknown): void;
  /** Stamp an outgoing user activity with the current locale (mutates in place). */
  tagUserActivity(activity: { locale?: string } | undefined): void;
}

export function extractLocale(localeParam: string | null): string {
  if (!localeParam) {
    return DEFAULT_LOCALE;
  }
  if (localeParam === "autodetect") {
    return navigator.language;
  }
  return localeParam;
}

// BCP 47 allows script and region subtags (zh-Hans-CN), so a hyphen count is not a valid test.
// Intl does the structural check; the length bound rejects words like "english", which Intl
// accepts as a language subtag but which no caller means as a locale.
function isValidLocale(locale: unknown): locale is string {
  if (typeof locale !== "string" || !locale) {
    return false;
  }
  const language = locale.split("-")[0];
  if (language.length < 2 || language.length > 3) {
    return false;
  }
  try {
    return Intl.getCanonicalLocales(locale).length > 0;
  } catch {
    return false;
  }
}

export function createLocaleController(
  initialLocale: string
): LocaleController {
  let currentLocale = isValidLocale(initialLocale)
    ? initialLocale
    : DEFAULT_LOCALE;

  const applyDocumentLang = (locale: string) => {
    document.documentElement.setAttribute("lang", locale.split("-")[0]);
  };

  applyDocumentLang(currentLocale);

  return {
    get() {
      return currentLocale;
    },
    setFromBot(locale) {
      if (isValidLocale(locale) && locale !== currentLocale) {
        currentLocale = locale;
        applyDocumentLang(currentLocale);
      }
    },
    tagUserActivity(activity) {
      if (activity) {
        activity.locale = currentLocale;
      }
    },
  };
}
