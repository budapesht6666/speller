/**
 * Тесты списков языков.
 *
 * Списка два — язык интерфейса и язык обучения, — и они живут в разных файлах,
 * потому что это разные вещи. Но на стартовом экране стоят один под другим,
 * и человек читает их как один список. Значит порядок обязан совпадать, а
 * держать его совпадающим вниманием нельзя: правку сделают в одном файле.
 */

import { describe, expect, it } from 'vitest';
import { LANG_CODES, LANGS } from '../src/data/concepts';
import { t, UI_LANGS, type StringKey, type UiLang } from '../src/data/i18n';

/** Код языка без страны: `vi-VN` → `vi`. */
const base = (code: string): string => code.split('-')[0]!;

describe('порядок языков', () => {
  it('совпадает у интерфейса и у обучения', () => {
    const learnOrder = LANG_CODES.map(base).filter((l) => (UI_LANGS as string[]).includes(l));
    const uiOrder = (UI_LANGS as string[]).filter((l) => learnOrder.includes(l));
    expect(uiOrder).toEqual(learnOrder);
  });

  it('у каждого языка обучения есть самоназвание', () => {
    for (const code of LANG_CODES) {
      expect(LANGS[code].native.trim(), `${code} без самоназвания`).not.toBe('');
    }
  });
});

describe('строки интерфейса', () => {
  // Полноту набора ключей проверяет типизация: Record<StringKey, string> не
  // соберётся с пропуском. А вот пустую строку она пропускает молча — и это
  // ровно то, как выглядит забытый перевод.
  const keys: StringKey[] = [
    'start.sub',
    'start.learn',
    'start.play',
    'start.note',
    'start.unsupported',
    'start.insecure',
    'start.uiLang',
    'play.quit',
    'play.hint',
    'play.score',
    'listen.idle',
    'listen.starting',
    'listen.listening',
    'listen.blocked',
    'listen.error',
    'finish.title',
    'finish.lead',
    'finish.time',
    'finish.score',
    'finish.words',
    'finish.eyebrow',
    'finish.speak',
    'finish.again',
  ];

  it.each(UI_LANGS)('на языке %s заполнены все', (lang: UiLang) => {
    for (const key of keys) {
      expect(t(lang, key).trim(), `${lang}: ${key} пустой`).not.toBe('');
    }
  });

  it('переводы не скопированы друг у друга', () => {
    // Самая частая ошибка при добавлении языка — оставить английский текст
    // в новом столбце. Полное совпадение всех строк её и ловит.
    for (const key of keys) {
      const values = UI_LANGS.map((lang) => t(lang, key));
      expect(new Set(values).size, `${key} одинаков на всех языках`).toBeGreaterThan(1);
    }
  });
});
