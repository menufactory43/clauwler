// Two languages, French and English. Every word is picked at the moment it is shown,
// so a table read in the Hall after a switch reads in the new language. What a save
// already holds (names of champions, relics, rooms, nemeses, chronicle lines) stays in
// the language it was written in.

export type Lang = 'fr' | 'en'

let lang: Lang = 'fr'

export const getLang = (): Lang => lang
export const isEn = () => lang === 'en'

export function setLang(next: Lang) {
  lang = next
}

/** The French or the English, as the current language wants. */
export const tr = (fr: string, en: string): string => (lang === 'en' ? en : fr)

/** The language a locale names (`fr_FR.UTF-8`, `fr`, `en_US`...): French for fr*, else English. */
export function langOf(locale: string | undefined | null): Lang {
  return /^fr/i.test((locale ?? '').trim()) ? 'fr' : 'en'
}

/**
 * The language the environment asks for: LANGUAGE, then LC_ALL, then LC_MESSAGES, then LANG
 * (the first one set wins); English when none is set.
 */
export function langFromEnv(env: { LANGUAGE?: string; LC_ALL?: string; LC_MESSAGES?: string; LANG?: string }): Lang {
  for (const value of [env.LANGUAGE?.split(':')[0], env.LC_ALL, env.LC_MESSAGES, env.LANG]) {
    if (value && value.trim() && value !== 'C' && value !== 'POSIX') return langOf(value)
  }
  return 'en'
}

/** A word in both languages. Printed, it reads in the current one. */
export class Pair {
  constructor(readonly fr: string, readonly en: string) {}
  toString(): string {
    return tr(this.fr, this.en)
  }
}

/**
 * A table field in both languages. Typed as the string it reads as once the table is
 * passed through `localize`, which turns it into a getter.
 */
export const L = (fr: string, en: string): string => new Pair(fr, en) as unknown as string

const asText = (v: unknown) => (v instanceof Pair ? v.toString() : v)

/**
 * Turns every two-language field of an object (or every entry of an array) into a getter
 * for the current language; an array of them reads as an array in the current language.
 */
export function localize<T extends object>(o: T): T {
  for (const key of Object.keys(o)) {
    const v = (o as Record<string, unknown>)[key]
    if (v instanceof Pair) {
      Object.defineProperty(o, key, { get: () => v.toString(), enumerable: true, configurable: true })
    } else if (Array.isArray(v) && v.some(x => x instanceof Pair)) {
      Object.defineProperty(o, key, { get: () => v.map(asText), enumerable: true, configurable: true })
    }
  }
  return o
}

/** `localize` over each entry of a table. */
export function localizeAll<T extends object>(list: T[]): T[] {
  for (const one of list) localize(one)
  return list
}

/** A share as a percentage. */
export const pct = (v: number) => `${Math.round(v * 100)}%`

/** A number as the current language writes it: 1,5 in French, 1.5 in English. */
export const num = (v: number) => (Number.isInteger(v) ? `${v}` : lang === 'en' ? v.toFixed(1) : v.toFixed(1).replace('.', ','))
