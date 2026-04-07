import i18next from "i18next";
import en from "./en";
import fr from "./fr";

const FALLBACK_LANGUAGE = "en";
const LANGUAGE_STORAGE_KEY = "sitrec-language";
const SUPPORTED_LANGUAGES = [FALLBACK_LANGUAGE, "fr"];
const IS_PRODUCTION = process.env.NODE_ENV === "production";

export const SUPPORTED_LANGUAGE_OPTIONS = Object.freeze({
    English: "en",
    Français: "fr",
});

let initialized = false;
const warnedMissingKeys = new Set();

function normalizeLanguage(language) {
    if (typeof language !== "string" || language.trim() === "") {
        return FALLBACK_LANGUAGE;
    }

    const normalized = language.toLowerCase().split("-")[0];
    return SUPPORTED_LANGUAGES.includes(normalized) ? normalized : FALLBACK_LANGUAGE;
}

function getStoredLanguage() {
    if (typeof window === "undefined" || !window.localStorage) {
        return null;
    }

    try {
        return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
    } catch (_error) {
        return null;
    }
}

function getBrowserLanguage() {
    if (typeof navigator === "undefined") {
        return FALLBACK_LANGUAGE;
    }

    const languages = Array.isArray(navigator.languages) && navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language];

    for (const language of languages) {
        const normalized = normalizeLanguage(language);
        if (SUPPORTED_LANGUAGES.includes(normalized)) {
            return normalized;
        }
    }

    return FALLBACK_LANGUAGE;
}

function resolveLanguage(preferredLanguage = null) {
    if (preferredLanguage !== null && preferredLanguage !== undefined) {
        return normalizeLanguage(preferredLanguage);
    }

    return getStoredLanguage() ?? getBrowserLanguage();
}

export function initI18n(preferredLanguage = null) {
    if (initialized) {
        return i18next;
    }

    i18next.init({
        debug: false,
        fallbackLng: FALLBACK_LANGUAGE,
        initImmediate: false,
        interpolation: {
            escapeValue: false,
        },
        lng: resolveLanguage(preferredLanguage),
        resources: {
            en: {
                translation: en,
            },
            fr: {
                translation: fr,
            },
        },
        returnEmptyString: false,
        supportedLngs: SUPPORTED_LANGUAGES,
    });

    initialized = true;
    return i18next;
}

function warnMissingKey(key) {
    if (IS_PRODUCTION || warnedMissingKeys.has(key)) {
        return;
    }

    warnedMissingKeys.add(key);
    console.warn(`[i18n] Missing translation key: ${key}`);
}

export function t(key, options = undefined) {
    initI18n();

    if (!i18next.exists(key, options)) {
        warnMissingKey(key);
    }

    return i18next.t(key, options);
}

export function getCurrentLanguage() {
    initI18n();
    return i18next.language;
}

export function setLanguage(language) {
    initI18n();

    const normalizedLanguage = normalizeLanguage(language);
    i18next.changeLanguage(normalizedLanguage);

    if (typeof window !== "undefined" && window.localStorage) {
        try {
            window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalizedLanguage);
        } catch (_error) {
        }
    }

    return normalizedLanguage;
}