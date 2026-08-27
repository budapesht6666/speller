/**
 * Сопоставление услышанного с падающими словами.
 *
 * Задача не «распознать речь», а закрытый словарь: на экране 1–5 известных
 * слов, надо понять, названо ли одно из них. Это делает возможным мягкое
 * сравнение — ошибиться в пользу одного из пяти вариантов гораздо труднее,
 * чем угадать слово из всего языка.
 *
 * Почему нельзя просто сравнивать строки — измерено на живом устройстве
 * (research/PROBE-RESULTS.md). Игрок говорит `ball apple tree house water`,
 * движок отдаёт `Bowl apple free house water`. Причём в финале правильный
 * `Ball` оказался лишь в пятой альтернативе, и у всех пяти был одинаковый
 * confidence. Точное совпадение отобрало бы очки за верное произношение.
 *
 * Модуль чистый: ни DOM, ни распознавания. Поэтому он и тестируется на
 * реальных промахах из журналов, без микрофона и браузера.
 */

import { doubleMetaphone } from 'double-metaphone';

export interface MatchConfig {
  /** Слова не длиннее — только точное совпадение или фонетика, без опечаток. */
  shortWordLength: number;
  /** Допуск Левенштейна для слов средней длины. */
  maxDistanceMedium: number;
  /** Допуск Левенштейна для длинных слов. */
  maxDistanceLong: number;
  /** Граница между «средним» и «длинным». */
  longWordLength: number;
  /** Короче этого фонетический код не считается: одна буква совпадает у всех. */
  minCodeLength: number;
}

/**
 * Матчер намеренно мягкий, и это следует из постановки задачи.
 *
 * Кандидатов на экране 1–5, а не весь язык. Мягкое сравнение в таком наборе
 * почти не может ошибиться — если только два кандидата не похожи друг на
 * друга. Значит правильное место для строгости не здесь, а в правиле, какие
 * предметы разрешено показывать одновременно (см. collidingWords).
 *
 * Попытка ужесточить сам матчер была и провалилась: допуск 0 на
 * четырёхбуквенных словах разводит ball / bell / mall, но заодно перестаёт
 * засчитывать `free` как `tree` — а это настоящий промах движка из журнала,
 * ради которого весь фонетический слой и заведён.
 */
export const DEFAULT_CONFIG: MatchConfig = {
  shortWordLength: 3,
  maxDistanceMedium: 1,
  maxDistanceLong: 2,
  longWordLength: 6,
  minCodeLength: 2,
};

/**
 * Правила сравнения для одного языка.
 *
 * Три вещи различаются от языка к языку, и все три ломают сравнение, если их
 * не развести:
 *
 * - **Письмо.** `[^a-z]` выбрасывает кириллицу и вьетнамскую диакритику
 *   целиком, превращая расшифровку в пустую строку. Ровно это и происходило,
 *   пока язык был один.
 * - **Фонетика.** Double Metaphone — алгоритм английского произношения.
 *   На русском или вьетнамском он не «работает хуже», он не значит ничего,
 *   поэтому там его нет и решение принимает Левенштейн.
 * - **Длина выражения.** По-английски подпись занимает одно-два слова, редко
 *   три (`hot air balloon`), по-вьетнамски спокойно четыре
 *   (`trung tâm thương mại`), и окно поиска обязано до них дотягиваться.
 *   Окно короче самой длинной подписи означает слово, которое нельзя сбить
 *   никогда, — это проверяется тестом.
 */
export interface MatchProfile extends MatchConfig {
  id: 'en' | 'ru' | 'vi';
  /** Сравнивать ли фонетические коды. Только для английского. */
  phonetic: boolean;
  /** Сколько слов подряд склеивать в поисках подписи из нескольких слов. */
  maxWindow: number;
  /** Что выбросить из строки после свёртки: всё, кроме букв этого письма. */
  strip: RegExp;
  /** Свёртка письма к сравнимому виду. */
  fold: (text: string) => string;
}

/**
 * Вьетнамский сравниваем без тонов.
 *
 * Тон — часть слова, и `ma`, `má`, `mà` разные слова. Но распознавание ставит
 * тоны заметно менее уверенно, чем сами слоги, а кандидатов на экране пять:
 * отбрасывать верно названное слово из-за неверно услышанного тона — худший
 * обмен. Неразличимые после свёртки пары разводит collidingWords, ровно как
 * английские ball / bowl.
 *
 * `đ` не раскладывается по NFD (это отдельная буква, а не `d` со знаком),
 * поэтому её приходится заменять руками.
 */
function foldVietnamese(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

/** Ё и Е распознавание путает свободно, а слово это одно и то же. */
function foldRussian(text: string): string {
  return text.replace(/ё/g, 'е');
}

export const PROFILES: Record<'en' | 'ru' | 'vi', MatchProfile> = {
  en: {
    ...DEFAULT_CONFIG,
    id: 'en',
    phonetic: true,
    maxWindow: 3,
    strip: /[^a-z\s]+/g,
    fold: (text) => text,
  },
  ru: {
    ...DEFAULT_CONFIG,
    id: 'ru',
    phonetic: false,
    maxWindow: 2,
    strip: /[^а-я\s]+/g,
    fold: foldRussian,
  },
  vi: {
    ...DEFAULT_CONFIG,
    id: 'vi',
    phonetic: false,
    maxWindow: 4,
    strip: /[^a-z\s]+/g,
    fold: foldVietnamese,
  },
};

export interface Target<T> {
  id: T;
  /** Все слова, которые засчитываются: основное плюс синонимы. */
  words: string[];
}

export interface Hit<T> {
  id: T;
  /** Первое слово расшифровки, вошедшее в попадание. */
  wordStart: number;
  /** Последнее слово расшифровки, вошедшее в попадание. */
  wordEnd: number;
  /** Чем именно засчитано — для журнала и отладки, не для логики. */
  how: 'exact' | 'phonetic' | 'fuzzy';
}

/**
 * Разбирает расшифровку на слова: нижний регистр, свёртка письма, без
 * пунктуации и цифр.
 *
 * Порядок важен: свёртка идёт до выбрасывания лишнего. Иначе вьетнамские
 * надстрочные знаки уходят вместе со своими буквами, а не отдельно от них.
 */
export function normalize(text: string, profile: MatchProfile = PROFILES.en): string[] {
  return profile
    .fold(text.toLowerCase().replace(/['’]/g, ''))
    .replace(profile.strip, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Ожидаемая подпись в том же виде, в каком приходит расшифровка. */
function normalizeExpected(word: string, profile: MatchProfile): string {
  return normalize(word, profile).join(' ');
}

/** Расстояние Левенштейна. Своё, потому что это десять строк. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    prev = row;
  }
  return prev[b.length]!;
}

/** Оба кода Double Metaphone, пустые и слишком короткие отброшены. */
function codes(word: string, min: number): string[] {
  return doubleMetaphone(word).filter((c) => c.length >= min);
}

function allowedDistance(word: string, config: MatchConfig): number {
  if (word.length <= config.shortWordLength) return 0;
  if (word.length < config.longWordLength) return config.maxDistanceMedium;
  return config.maxDistanceLong;
}

/**
 * Сравнивает одно услышанное выражение с одним ожидаемым.
 * Порядок проверок — от строгого к мягкому, чтобы `how` отражал реальную
 * причину зачёта, а не первую сработавшую эвристику.
 */
export function compare(
  spoken: string,
  expected: string,
  profile: MatchProfile = PROFILES.en,
): Hit<unknown>['how'] | null {
  if (!spoken || !expected) return null;
  if (spoken === expected) return 'exact';

  if (profile.phonetic) {
    const spokenCodes = codes(spoken, profile.minCodeLength);
    const expectedCodes = codes(expected, profile.minCodeLength);
    if (spokenCodes.some((c) => expectedCodes.includes(c))) return 'phonetic';
  }

  const limit = allowedDistance(expected, profile);
  if (limit > 0 && levenshtein(spoken, expected) <= limit) return 'fuzzy';

  return null;
}

/**
 * Ищет попадания в расшифровке.
 *
 * Проверяются окна от одного слова до `maxWindow`: часть подписей состоит из
 * нескольких слов (`ice cream`, `nhà vệ sinh`), а движок к тому же охотно
 * режет одно слово надвое.
 *
 * Возвращаются все попадания, а не первое: за одно событие человек успевает
 * назвать два предмета, и терять второе нельзя.
 */
export function findHits<T>(
  words: string[],
  targets: Target<T>[],
  profile: MatchProfile = PROFILES.en,
): Hit<T>[] {
  const hits: Hit<T>[] = [];
  const taken = new Set<T>();

  for (let i = 0; i < words.length; i++) {
    const windows: Array<{ text: string; end: number }> = [];
    for (let n = 0; n < profile.maxWindow && i + n < words.length; n++) {
      windows.push({ text: words.slice(i, i + n + 1).join(' '), end: i + n });
    }

    for (const target of targets) {
      if (taken.has(target.id)) continue;

      let found: { how: Hit<T>['how']; end: number } | null = null;
      for (const expected of target.words) {
        const wanted = normalizeExpected(expected, profile);
        if (!wanted) continue;
        // Многословное окно сравниваем и как есть, и слитно: `ice cream`
        // приходит то одним словом, то двумя.
        const joined = wanted.replace(/\s+/g, '');
        for (const window of windows) {
          const how =
            compare(window.text, wanted, profile) ??
            compare(window.text.replace(/\s+/g, ''), joined, profile);
          if (how) {
            found = { how, end: window.end };
            break;
          }
        }
        if (found) break;
      }

      if (found) {
        hits.push({ id: target.id, wordStart: i, wordEnd: found.end, how: found.how });
        taken.add(target.id);
        break;
      }
    }
  }

  return hits;
}

/**
 * Пары слов, которые матчер не в состоянии различить.
 *
 * Часть совпадений неустранима: `cheese` и `chess` дают один фонетический код,
 * `beach` и `bag` — тоже. Ослаблять матчер ради них нельзя, выбрасывать слова
 * из словаря жалко. Поэтому ограничение переносится в игру: два неразличимых
 * предмета не показываются на экране одновременно, и вопрос снимается.
 */
export function collidingWords(
  vocabulary: Array<{ id: string; words: string[] }>,
  profile: MatchProfile = PROFILES.en,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!map.has(a)) map.set(a, new Set());
    map.get(a)!.add(b);
  };

  const prepared = vocabulary.map((entry) => ({
    id: entry.id,
    words: entry.words.map((w) => normalizeExpected(w, profile)).filter(Boolean),
  }));

  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const a = prepared[i]!;
      const b = prepared[j]!;
      const clash = a.words.some((wa) => b.words.some((wb) => compare(wa, wb, profile) !== null));
      if (clash) {
        link(a.id, b.id);
        link(b.id, a.id);
      }
    }
  }
  return map;
}

/**
 * Следит за растущим хвостом промежуточных результатов.
 *
 * Хвост `interim` дописывается, а не переписывается заново, поэтому наивная
 * проверка всей расшифровки засчитывала бы одно слово многократно. Но и просто
 * «брать только новые слова» нельзя: последние слова хвоста ещё правятся
 * движком — в журнале `Bow` превращается в `Bowl` уже после появления.
 *
 * Закрываются поэтому не слова «до границы», а конкретные позиции, по которым
 * было попадание. Разница принципиальная: первая версия двигала границу по
 * последнему попаданию и хоронила несработавшие слова перед ним. В журнале это
 * ровно та ситуация, где `Bow apple` засчитывает `apple`, а `Bow` — будущий
 * `Bowl` — оказывается за границей, и мяч не сбивается никогда.
 */
export class Utterance {
  private consumed = new Set<number>();
  private segment = -1;

  constructor(private profile: MatchProfile = PROFILES.en) {}

  /** Смена языка обучения: старый хвост разобран не тем письмом. */
  useProfile(profile: MatchProfile): void {
    this.profile = profile;
    this.reset();
  }

  /**
   * Слова, ещё не закрытые попаданием. Возвращаются вместе с исходными
   * позициями: без них вызывающий не сможет сказать, что именно закрывать.
   */
  pending(segmentIndex: number, transcript: string): { words: string[]; positions: number[] } {
    if (segmentIndex !== this.segment) {
      this.segment = segmentIndex;
      this.consumed.clear();
    }
    const all = normalize(transcript, this.profile);
    const words: string[] = [];
    const positions: number[] = [];
    for (let i = 0; i < all.length; i++) {
      if (this.consumed.has(i)) continue;
      words.push(all[i]!);
      positions.push(i);
    }
    return { words, positions };
  }

  /** Закрывает исходные позиции, вошедшие в попадание. */
  consume(positions: number[]): void {
    for (const p of positions) this.consumed.add(p);
  }

  /** Сессия распознавания оборвалась — нумерация пачек начнётся заново. */
  reset(): void {
    this.consumed.clear();
    this.segment = -1;
  }
}
