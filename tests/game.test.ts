/**
 * Тесты правил игры.
 *
 * Ядро не знает про DOM, поэтому раунд можно прогнать целиком в памяти —
 * включая тысячи спавнов, которые руками на телефоне не проверить никогда.
 */

import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { collidingWords, compare } from '../src/core/matcher';
import { acceptedWords, conceptsFor, LANG_CODES, LANGS } from '../src/data/concepts';

/**
 * Произносит слово так, как это делает движок: каждая новая фраза приходит
 * отдельной пачкой со своим индексом. Внутри одной пачки расшифровка только
 * дописывается — на этом и построен разбор хвоста в Utterance, поэтому
 * подавать разные слова с одним индексом было бы неправдой о движке.
 */
let segment = 0;
function say(game: Game, word: string) {
  return game.hear(++segment, word);
}

/** Прокручивает игру, подавая время кусками по кадру. */
function run(game: Game, seconds: number, onFrame?: () => void): void {
  const step = 1 / 60;
  for (let t = 0; t < seconds && !game.isOver; t += step) {
    game.update(step);
    onFrame?.();
  }
}

describe('спавн', () => {
  it('первый предмет появляется сразу, а не после паузы', () => {
    const game = new Game();
    game.reset();
    game.update(1 / 60);
    expect(game.items).toHaveLength(1);
  });

  it('не превышает разрешённое число предметов на экране', () => {
    const game = new Game({ initialFallSeconds: 600, maxConcurrent: 4 });
    game.reset();
    let peak = 0;
    run(game, 120, () => {
      peak = Math.max(peak, game.items.length);
    });
    expect(peak).toBeLessThanOrEqual(4);
  });

  it.each(LANG_CODES)(
    'на языке %s никогда не показывает одновременно неразличимые предметы',
    (lang) => {
      // Главная проверка модуля. Если `ball` и `pool` окажутся рядом, игрок
      // скажет одно, а сбито будет другое, и понять причину невозможно.
      // Проверяется на каждом языке: сталкиваются везде разные слова —
      // по-английски ball и bowl, по-русски миска и маска.
      const profile = LANGS[lang].profile;
      const clashes = collidingWords(
        conceptsFor(lang).map((c) => ({ id: c.id, words: acceptedWords(c, lang) })),
        profile,
      );

      // Экран сразу заполняем доверху и всё время churn'им, иначе проверка
      // окажется пустой: при одном предмете столкнуться попросту не с чем.
      let seenPairs = 0;
      for (let attempt = 0; attempt < 15; attempt++) {
        const game = new Game({
          lang,
          initialFallSeconds: 600,
          spawnIntervalSeconds: 0.05,
          initialConcurrent: 4,
        });
        game.reset();
        run(game, 30, () => {
          const ids = game.items.map((i) => i.concept.id);
          if (ids.length >= 2) seenPairs++;
          for (const id of ids) {
            for (const other of ids) {
              if (id === other) continue;
              expect(clashes.get(id)?.has(other), `${id} и ${other} оказались вместе`).toBeFalsy();
            }
          }
          // Сбиваем самый старый, освобождая место следующему.
          const first = game.items[0];
          if (first && ids.length === 4) say(game, first.word);
        });
      }
      // Страховка от повторения истории: проверка обязана была что-то увидеть.
      expect(seenPairs).toBeGreaterThan(1000);
    },
  );

  it('не повторяет одно понятие подряд', () => {
    const game = new Game({ initialFallSeconds: 600, spawnIntervalSeconds: 0.05, recentMemory: 12 });
    game.reset();
    const order: string[] = [];
    run(game, 40, () => {
      const first = game.items[0];
      if (first) {
        order.push(first.concept.id);
        say(game, first.word);
      }
    });
    // В любом окне из двенадцати подряд не должно быть повторов.
    for (let i = 0; i + 12 <= order.length; i++) {
      const window = order.slice(i, i + 12);
      expect(new Set(window).size).toBe(window.length);
    }
  });
});

describe('падение и промах', () => {
  it('предмет долетает до низа примерно за отведённое время', () => {
    const game = new Game({ initialFallSeconds: 10 });
    game.reset();
    game.update(1 / 60);
    run(game, 30);
    expect(game.isOver).toBe(true);
    expect(game.stats.seconds).toBeGreaterThanOrEqual(9);
    expect(game.stats.seconds).toBeLessThanOrEqual(11);
  });

  it('промах заканчивает раунд и запоминает упущенный предмет', () => {
    const game = new Game({ initialFallSeconds: 2, minFallSeconds: 2 });
    game.reset();
    run(game, 10);
    expect(game.isOver).toBe(true);
    expect(game.missedItem).not.toBeNull();
  });

  it('после конца раунда время больше не идёт', () => {
    const game = new Game({ initialFallSeconds: 1, minFallSeconds: 1 });
    game.reset();
    run(game, 5);
    const frozen = game.stats.seconds;
    game.update(10);
    expect(game.stats.seconds).toBe(frozen);
  });
});

describe('попадание', () => {
  it('сбивает названный предмет и начисляет очки', () => {
    const game = new Game({ initialFallSeconds: 600, pointsPerHit: 5 });
    game.reset();
    game.update(1 / 60);
    const item = game.items[0]!;

    const events = say(game, item.word);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('hit');
    expect(game.items).toHaveLength(0);
    expect(game.stats.score).toBe(5);
    expect(game.stats.words).toBe(1);
  });

  it('не реагирует на посторонние слова', () => {
    const game = new Game({ lang: 'en-US', initialFallSeconds: 600 });
    game.reset();
    game.update(1 / 60);
    const item = game.items[0]!;
    // Слово, заведомо не совпадающее с тем, что на экране.
    const junk = ['zebra', 'umbrella', 'october'].find(
      (w) => !acceptedWords(item.concept, 'en-US').some((a) => compare(w, a.toLowerCase())),
    )!;

    expect(say(game, junk)).toEqual([]);
    expect(game.items).toHaveLength(1);
    expect(game.stats.score).toBe(0);
  });

  it('после конца раунда попадания не засчитываются', () => {
    const game = new Game({ initialFallSeconds: 1, minFallSeconds: 1 });
    game.reset();
    const first = (game.update(1 / 60), game.items[0]!);
    run(game, 5);
    expect(game.isOver).toBe(true);
    expect(say(game, first.word)).toEqual([]);
  });

  it('игра ускоряется по мере попаданий, но не бесконечно', () => {
    const game = new Game({
      initialFallSeconds: 10,
      minFallSeconds: 5,
      fallSecondsPerHit: 0.25,
      spawnIntervalSeconds: 0.05,
    });
    game.reset();
    const speeds: number[] = [];
    run(game, 60, () => {
      const first = game.items[0];
      if (first) {
        speeds.push(first.speed);
        say(game, first.word);
      }
    });
    expect(speeds.at(-1)!).toBeGreaterThan(speeds[0]!);
    // 1/5 — потолок скорости из конфига.
    expect(Math.max(...speeds)).toBeLessThanOrEqual(1 / 5 + 1e-9);
  });
});

describe('сброс', () => {
  it('reset возвращает игру в начальное состояние', () => {
    const game = new Game({ initialFallSeconds: 1, minFallSeconds: 1 });
    game.reset();
    run(game, 5);
    expect(game.isOver).toBe(true);

    game.reset();
    expect(game.isOver).toBe(false);
    expect(game.items).toHaveLength(0);
    expect(game.stats).toEqual({ seconds: 0, score: 0, words: 0 });
  });
});
