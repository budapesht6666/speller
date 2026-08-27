/**
 * Правила игры: что падает, с какой скоростью и когда раунд заканчивается.
 *
 * Модуль не знает ни про DOM, ни про распознавание. Он принимает прошедшее
 * время и услышанные слова, а отдаёт события. Из этого следует, что правила
 * спавна проверяются тестом, а не запуском игры на телефоне.
 *
 * Координаты нормированные: y = 0 — верх поля, y = 1 — линия, ниже которой
 * предмет считается упущенным. Пиксели остаются в слое отрисовки, потому что
 * высота поля разная на разных телефонах, а правила — одни.
 */

import {
  acceptedWords,
  conceptsFor,
  displayWord,
  LANGS,
  type Concept,
  type LangCode,
} from '../data/concepts';
import { collidingWords, findHits, Utterance, type Target } from './matcher';

export interface GameConfig {
  lang: LangCode;
  /** Сколько секунд предмет летит сверху донизу в начале игры. */
  initialFallSeconds: number;
  /** Быстрее этого не разгоняемся: иначе реакции 0.3 с перестаёт хватать. */
  minFallSeconds: number;
  /** На сколько сокращается полёт с каждым сбитым словом. */
  fallSecondsPerHit: number;
  /** Сколько предметов на экране одновременно в начале. */
  initialConcurrent: number;
  maxConcurrent: number;
  /** Через сколько сбитых слов добавляется ещё один одновременный предмет. */
  hitsPerConcurrentStep: number;
  /** Пауза между появлениями. */
  spawnIntervalSeconds: number;
  /** Очки за сбитое слово. */
  pointsPerHit: number;
  /** Сколько последних понятий не повторять. */
  recentMemory: number;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  lang: 'en-US',
  initialFallSeconds: 11,
  minFallSeconds: 5,
  fallSecondsPerHit: 0.25,
  initialConcurrent: 1,
  maxConcurrent: 4,
  hitsPerConcurrentStep: 4,
  spawnIntervalSeconds: 2.2,
  pointsPerHit: 5,
  recentMemory: 12,
};

export interface FallingItem {
  /** Уникален для экземпляра, а не для понятия: одно слово может выпасть дважды. */
  key: number;
  concept: Concept;
  word: string;
  /** Доля ширины поля, 0..1 — центр предмета. */
  x: number;
  /** Доля высоты поля, 0..1. */
  y: number;
  /** Долей высоты в секунду. */
  speed: number;
}

export type GameEvent =
  | { type: 'spawn'; item: FallingItem }
  | { type: 'hit'; item: FallingItem; points: number }
  | { type: 'miss'; item: FallingItem };

export interface GameStats {
  seconds: number;
  score: number;
  words: number;
}

export class Game {
  readonly items: FallingItem[] = [];

  private config: GameConfig;
  /** Словарь выбранного языка: понятия без подписи на нём не выпадают. */
  private pool: Concept[] = [];
  private clashes: Map<string, Set<string>> = new Map();
  private recent: string[] = [];
  private nextKey = 1;
  private elapsed = 0;
  private sinceSpawn = 0;
  private score = 0;
  private hits = 0;
  private over = false;
  private missed: FallingItem | null = null;
  private utterance = new Utterance();

  constructor(config: Partial<GameConfig> = {}) {
    this.config = { ...DEFAULT_GAME_CONFIG, ...config };
    this.setLang(this.config.lang);
  }

  get lang(): LangCode {
    return this.config.lang;
  }

  /**
   * Смена языка обучения.
   *
   * Пересчитываются обе таблицы: словарь (у понятия может не быть подписи на
   * этом языке) и неразличимые пары (`ball` ↔ `bowl` — беда английская,
   * по-русски сталкиваются совсем другие слова). Считать это на каждом спавне
   * незачем — за раунд язык не меняется.
   */
  setLang(lang: LangCode): void {
    this.config.lang = lang;
    this.pool = conceptsFor(lang);
    this.clashes = collidingWords(
      this.pool.map((c) => ({ id: c.id, words: acceptedWords(c, lang) })),
      LANGS[lang].profile,
    );
    this.utterance.useProfile(LANGS[lang].profile);
  }

  get isOver(): boolean {
    return this.over;
  }

  /** Предмет, из-за которого раунд закончился. Нужен экрану проигрыша. */
  get missedItem(): FallingItem | null {
    return this.missed;
  }

  get stats(): GameStats {
    return { seconds: Math.floor(this.elapsed), score: this.score, words: this.hits };
  }

  reset(): void {
    this.items.length = 0;
    this.recent = [];
    this.elapsed = 0;
    // Первый предмет должен появиться сразу, а не через паузу: пустой экран
    // в начале игры читается как «не работает».
    this.sinceSpawn = this.config.spawnIntervalSeconds;
    this.score = 0;
    this.hits = 0;
    this.over = false;
    this.missed = null;
    this.utterance.reset();
  }

  /** Сессия распознавания оборвалась: хвост расшифровки больше не актуален. */
  forgetTranscript(): void {
    this.utterance.reset();
  }

  private get fallSeconds(): number {
    const { initialFallSeconds, fallSecondsPerHit, minFallSeconds } = this.config;
    return Math.max(minFallSeconds, initialFallSeconds - this.hits * fallSecondsPerHit);
  }

  private get concurrent(): number {
    const { initialConcurrent, hitsPerConcurrentStep, maxConcurrent } = this.config;
    return Math.min(maxConcurrent, initialConcurrent + Math.floor(this.hits / hitsPerConcurrentStep));
  }

  /**
   * Выбирает следующее понятие.
   *
   * Два запрета. Первый — недавно показанные: иначе одно слово выпадает трижды
   * подряд и игра выглядит бедной. Второй, важнее, — понятия, неразличимые для
   * матчера с теми, что уже на экране. Если рядом окажутся `ball` и `pool`,
   * игрок скажет одно, а сбито будет другое, и понять, что произошло,
   * невозможно.
   */
  private pickConcept(): Concept | null {
    const onScreen = this.items.map((i) => i.concept.id);
    const forbidden = new Set<string>(onScreen);
    for (const id of onScreen) {
      for (const clash of this.clashes.get(id) ?? []) forbidden.add(clash);
    }

    const fresh = this.pool.filter((c) => !forbidden.has(c.id) && !this.recent.includes(c.id));
    // Если словарь исчерпан недавними, ослабляем именно этот запрет: он про
    // разнообразие. Запрет на неразличимые пары не ослабляем никогда.
    const pool = fresh.length ? fresh : this.pool.filter((c) => !forbidden.has(c.id));
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)]!;
  }

  private spawn(): GameEvent | null {
    const concept = this.pickConcept();
    if (!concept) return null;

    const item: FallingItem = {
      key: this.nextKey++,
      concept,
      word: displayWord(concept, this.config.lang),
      // Держимся подальше от краёв: предмет шириной в 84 px иначе наполовину
      // уезжает за экран.
      x: 0.18 + Math.random() * 0.64,
      y: 0,
      speed: 1 / this.fallSeconds,
    };

    this.items.push(item);
    this.recent.push(concept.id);
    if (this.recent.length > this.config.recentMemory) this.recent.shift();
    return { type: 'spawn', item };
  }

  /** Двигает время вперёд. dt в секундах. */
  update(dt: number): GameEvent[] {
    if (this.over) return [];
    const events: GameEvent[] = [];
    this.elapsed += dt;

    for (const item of this.items) item.y += item.speed * dt;

    // Упущенный предмет заканчивает раунд. Проверяем до спавна, иначе на
    // последнем кадре успел бы появиться предмет, которого никто не увидит.
    const lost = this.items.find((i) => i.y >= 1);
    if (lost) {
      this.over = true;
      this.missed = lost;
      events.push({ type: 'miss', item: lost });
      return events;
    }

    this.sinceSpawn += dt;
    if (this.items.length < this.concurrent && this.sinceSpawn >= this.config.spawnIntervalSeconds) {
      const event = this.spawn();
      if (event) {
        this.sinceSpawn = 0;
        events.push(event);
      }
    }

    return events;
  }

  /**
   * Принимает промежуточную расшифровку и сбивает то, что названо.
   * Возвращает попадания; пустой массив — обычное дело, речь идёт постоянно.
   */
  hear(segmentIndex: number, transcript: string): GameEvent[] {
    if (this.over) return [];

    const { words, positions } = this.utterance.pending(segmentIndex, transcript);
    if (!words.length) return [];

    const targets: Target<number>[] = this.items.map((item) => ({
      id: item.key,
      words: acceptedWords(item.concept, this.config.lang),
    }));

    const events: GameEvent[] = [];
    for (const hit of findHits(words, targets, LANGS[this.config.lang].profile)) {
      const index = this.items.findIndex((i) => i.key === hit.id);
      if (index < 0) continue;
      const [item] = this.items.splice(index, 1);
      if (!item) continue;

      this.utterance.consume(positions.slice(hit.wordStart, hit.wordEnd + 1));
      this.hits += 1;
      this.score += this.config.pointsPerHit;
      events.push({ type: 'hit', item, points: this.config.pointsPerHit });
    }
    return events;
  }
}
