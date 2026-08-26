/**
 * Сопоставление услышанного с падающими словами.
 *
 * Задача не «распознать речь», а закрытый словарь: на экране 1–5 известных
 * слов, надо понять, названо ли одно из них. Это делает возможным фонетическое
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

/** Разбирает расшифровку на слова: нижний регистр, без пунктуации и цифр. */
export function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
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
  config: MatchConfig = DEFAULT_CONFIG,
): Hit<unknown>['how'] | null {
  if (!spoken || !expected) return null;
  if (spoken === expected) return 'exact';

  const spokenCodes = codes(spoken, config.minCodeLength);
  const expectedCodes = codes(expected, config.minCodeLength);
  if (spokenCodes.some((c) => expectedCodes.includes(c))) return 'phonetic';

  const limit = allowedDistance(expected, config);
  if (limit > 0 && levenshtein(spoken, expected) <= limit) return 'fuzzy';

  return null;
}

/**
 * Ищет попадания в расшифровке.
 *
 * Проверяются окна в одно и два слова: часть подписей — из двух слов
 * (`ice cream`), а движок к тому же охотно режет одно слово надвое.
 *
 * Возвращаются все попадания, а не первое: за одно событие человек успевает
 * назвать два предмета, и терять второе нельзя.
 */
export function findHits<T>(
  words: string[],
  targets: Target<T>[],
  config: MatchConfig = DEFAULT_CONFIG,
): Hit<T>[] {
  const hits: Hit<T>[] = [];
  const taken = new Set<T>();

  for (let i = 0; i < words.length; i++) {
    const windows: Array<{ text: string; end: number }> = [{ text: words[i]!, end: i }];
    if (i + 1 < words.length) {
      windows.push({ text: `${words[i]} ${words[i + 1]}`, end: i + 1 });
    }

    for (const target of targets) {
      if (taken.has(target.id)) continue;
      for (const expected of target.words) {
        const wanted = expected.toLowerCase();
        // Двухсловное окно сравниваем и как есть, и слитно: `ice cream`
        // приходит то одним словом, то двумя.
        const joined = wanted.replace(/\s+/g, '');
        let how: Hit<T>['how'] | null = null;
        let end = i;
        for (const w of windows) {
          how =
            compare(w.text, wanted, config) ?? compare(w.text.replace(/\s+/g, ''), joined, config);
          if (how) {
            end = w.end;
            break;
          }
        }
        if (how) {
          hits.push({ id: target.id, wordStart: i, wordEnd: end, how });
          taken.add(target.id);
          break;
        }
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
  config: MatchConfig = DEFAULT_CONFIG,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!map.has(a)) map.set(a, new Set());
    map.get(a)!.add(b);
  };

  for (let i = 0; i < vocabulary.length; i++) {
    for (let j = i + 1; j < vocabulary.length; j++) {
      const a = vocabulary[i]!;
      const b = vocabulary[j]!;
      const clash = a.words.some((wa) =>
        b.words.some((wb) => compare(wa.toLowerCase(), wb.toLowerCase(), config) !== null),
      );
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

  /**
   * Слова, ещё не закрытые попаданием. Возвращаются вместе с исходными
   * позициями: без них вызывающий не сможет сказать, что именно закрывать.
   */
  pending(segmentIndex: number, transcript: string): { words: string[]; positions: number[] } {
    if (segmentIndex !== this.segment) {
      this.segment = segmentIndex;
      this.consumed.clear();
    }
    const all = normalize(transcript);
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
