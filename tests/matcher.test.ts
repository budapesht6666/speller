/**
 * Тесты матчера.
 *
 * Примеры взяты из настоящих журналов распознавания на iPhone
 * (research/PROBE-RESULTS.md), а не придуманы. Придуманные примеры проверяли бы
 * представление о том, как ошибается движок, а не то, как он ошибается.
 */

import { describe, expect, it } from 'vitest';
import {
  collidingWords,
  compare,
  findHits,
  levenshtein,
  normalize,
  Utterance,
} from '../src/core/matcher';
import { CONCEPTS, acceptedWords } from '../src/data/concepts';

const targets = (...pairs: Array<[string, string[]]>) => pairs.map(([id, words]) => ({ id, words }));

describe('normalize', () => {
  it('снимает регистр и пунктуацию', () => {
    expect(normalize('Bowl, apple. Free!')).toEqual(['bowl', 'apple', 'free']);
  });

  it('выбрасывает цифры: движок отдаёт их вместо слов при счёте', () => {
    // Из журнала: игрок считал вслух, пришло "12345".
    expect(normalize('12345')).toEqual([]);
  });

  it('не спотыкается о пустую строку', () => {
    expect(normalize('   ')).toEqual([]);
  });
});

describe('levenshtein', () => {
  it('считает известные расстояния', () => {
    expect(levenshtein('ball', 'ball')).toBe(0);
    expect(levenshtein('ball', 'bell')).toBe(1);
    expect(levenshtein('tree', 'free')).toBe(1);
    expect(levenshtein('', 'abc')).toBe(3);
  });
});

describe('compare: промахи движка из журналов', () => {
  // Игрок сказал `ball`, движок в разные моменты отдавал эти варианты.
  it.each(['bowl', 'boil'])('засчитывает "%s" как ball', (heard) => {
    expect(compare(heard, 'ball')).not.toBeNull();
  });

  it('засчитывает "free" как tree', () => {
    expect(compare('free', 'tree')).not.toBeNull();
  });

  it('точное совпадение помечается как exact', () => {
    expect(compare('apple', 'apple')).toBe('exact');
  });

  // `bow` до `ball` не дотягивается, и это осознанный отказ, а не недоработка:
  // трёхбуквенный обрубок совпал бы со слишком многим. Потери нет — `bow`
  // живёт в хвосте доли секунды и становится `bowl`. Проверено ниже на потоке.
  it('осознанно не тянется до обрубка "bow"', () => {
    expect(compare('bow', 'ball')).toBeNull();
  });
});

describe('compare: ложные срабатывания', () => {
  // Главный риск матчера не в том, что он не засчитает верное слово, а в том,
  // что засчитает постороннее: игрок получит очки молча и не поймёт правила.
  it.each([
    ['hello', 'ball'],
    ['water', 'ball'],
    ['banana', 'apple'],
    ['house', 'tree'],
    ['dog', 'log'],
    ['store', 'tree'],
  ])('не считает "%s" за "%s"', (heard, expected) => {
    expect(compare(heard, expected)).toBeNull();
  });

  it('русская речь возвращается движком как мусор и не засчитывается', () => {
    // lang=en-US сам работает фильтром: по-русски приходит бессмыслица.
    for (const junk of ['privet', 'kak dela', 'shto eto']) {
      expect(findHits(normalize(junk), targets(['ball', ['ball']], ['tree', ['tree']]))).toEqual([]);
    }
  });

  it('короткие слова не срабатывают по опечатке', () => {
    // ear / eat отличаются на одну букву, но это разные слова.
    expect(compare('eat', 'ear')).toBeNull();
  });
});

describe('findHits', () => {
  it('находит попадание среди нескольких целей', () => {
    const hits = findHits(
      normalize('Bowl apple free house water'),
      targets(['ball', ['ball']], ['apple', ['apple']], ['tree', ['tree']]),
    );
    expect(hits.map((h) => h.id).sort()).toEqual(['apple', 'ball', 'tree']);
  });

  it('засчитывает два предмета за одно событие', () => {
    // Человек называет слова подряд, не дожидаясь реакции.
    const hits = findHits(normalize('ball apple'), targets(['ball', ['ball']], ['apple', ['apple']]));
    expect(hits).toHaveLength(2);
  });

  it('не засчитывает одну цель дважды', () => {
    const hits = findHits(normalize('ball ball ball'), targets(['ball', ['ball']]));
    expect(hits).toHaveLength(1);
  });

  it('ловит подпись из двух слов, названную слитно и раздельно', () => {
    const ice = targets(['icecream', ['ice cream']]);
    expect(findHits(normalize('ice cream'), ice)).toHaveLength(1);
    expect(findHits(normalize('icecream'), ice)).toHaveLength(1);
  });

  it('засчитывает синоним наравне с основным словом', () => {
    const hits = findHits(normalize('bike'), targets(['bicycle', ['bicycle', 'bike']]));
    expect(hits[0]?.id).toBe('bicycle');
  });

  it('возвращает границы слов, вошедших в попадание', () => {
    const hits = findHits(normalize('um ball'), targets(['ball', ['ball']]));
    expect(hits[0]?.wordStart).toBe(1);
    expect(hits[0]?.wordEnd).toBe(1);
  });
});

describe('Utterance: растущий хвост interim', () => {
  /** Прогоняет поток промежуточных результатов так же, как это делает игра. */
  function play(stream: string[], active: Array<{ id: string; words: string[] }>) {
    const utterance = new Utterance();
    const seen: string[] = [];
    for (const transcript of stream) {
      const { words, positions } = utterance.pending(0, transcript);
      const hits = findHits(
        words,
        active.filter((t) => !seen.includes(t.id)),
      );
      for (const hit of hits) {
        seen.push(hit.id);
        utterance.consume(positions.slice(hit.wordStart, hit.wordEnd + 1));
      }
    }
    return seen;
  }

  it('сбивает все четыре предмета на настоящем потоке из журнала', () => {
    // Дословная последовательность interim с iPhone. Заметно, что `Bow`
    // сначала не совпадает ни с чем и лишь на третьем событии становится
    // `Bowl` — к этому моменту `apple` уже засчитано. Ранняя версия хвоста
    // хоронила здесь мяч, потому что двигала границу за него.
    const stream = [
      'Bow',
      'Bow apple',
      'Bowl apple',
      'Bowl apple free',
      'Bowl apple free house',
      'Bowl apple free house water',
    ];
    const active = [
      { id: 'ball', words: ['ball'] },
      { id: 'apple', words: ['apple'] },
      { id: 'tree', words: ['tree'] },
      { id: 'house', words: ['house'] },
      { id: 'water', words: ['water'] },
    ];
    const seen = play(stream, active);

    expect(seen.sort()).toEqual(['apple', 'ball', 'house', 'tree', 'water']);
  });

  it('не засчитывает одну цель дважды при дописывании хвоста', () => {
    const seen = play(
      ['ball', 'ball apple', 'ball apple tree'],
      [
        { id: 'ball', words: ['ball'] },
        { id: 'apple', words: ['apple'] },
        { id: 'tree', words: ['tree'] },
      ],
    );
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('не даёт устаревшему слову сбить заново появившуюся цель', () => {
    // Слово уже засчитано и закрыто; такой же предмет появился снова.
    // Без закрытия позиции он был бы сбит мгновенно и без участия игрока.
    const utterance = new Utterance();
    const ball = targets(['ball', ['ball']]);

    const first = utterance.pending(0, 'ball');
    const hits = findHits(first.words, ball);
    expect(hits).toHaveLength(1);
    utterance.consume(first.positions.slice(hits[0]!.wordStart, hits[0]!.wordEnd + 1));

    const again = utterance.pending(0, 'ball');
    expect(findHits(again.words, ball)).toEqual([]);
  });

  it('начинает заново на новой пачке результатов', () => {
    const utterance = new Utterance();
    utterance.consume(utterance.pending(0, 'ball').positions);
    expect(utterance.pending(1, 'ball').words).toEqual(['ball']);
  });

  it('сбрасывается после обрыва сессии', () => {
    const utterance = new Utterance();
    utterance.consume(utterance.pending(0, 'ball').positions);
    utterance.reset();
    expect(utterance.pending(0, 'ball').words).toEqual(['ball']);
  });
});

describe('словарь игры', () => {
  it('каждое слово засчитывает само себя', () => {
    for (const concept of CONCEPTS) {
      const accepted = acceptedWords(concept, 'en-US');
      const hits = findHits(normalize(accepted[0]!), [{ id: concept.id, words: accepted }]);
      expect(hits, `${concept.id} не узнаёт себя`).toHaveLength(1);
    }
  });

  it('синонимы тоже засчитываются', () => {
    for (const concept of CONCEPTS) {
      const accepted = acceptedWords(concept, 'en-US');
      for (const word of accepted) {
        const hits = findHits(normalize(word), [{ id: concept.id, words: accepted }]);
        expect(hits, `${concept.id}: "${word}" не засчитывается`).toHaveLength(1);
      }
    }
  });

  it('неразличимые пары найдены и перечислены явно', () => {
    // Список не пустой и не должен быть: часть совпадений неустранима.
    // Смысл проверки в том, чтобы он был известен и не рос молча — игра
    // обязана разводить такие пары по времени.
    const clashes = collidingWords(
      CONCEPTS.map((c) => ({ id: c.id, words: acceptedWords(c, 'en-US') })),
    );
    const pairs = [...clashes].flatMap(([a, bs]) => [...bs].map((b) => [a, b].sort().join(' ↔ ')));
    expect(new Set(pairs)).toMatchInlineSnapshot(`
      Set {
        "cheese ↔ chess",
        "chess ↔ chest",
        "cherries ↔ stool",
        "cake ↔ sofa",
        "ball ↔ bowl",
        "bell ↔ bowl",
        "bowl ↔ pool",
        "ball ↔ bell",
        "ball ↔ mall",
        "ball ↔ pool",
        "bell ↔ pool",
        "earth ↔ plate",
        "beach ↔ bicycle",
        "bag ↔ beach",
        "bag ↔ bicycle",
        "bed ↔ ship",
        "ship ↔ store",
      }
    `);
  });
});
