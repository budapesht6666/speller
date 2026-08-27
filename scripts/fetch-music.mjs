/**
 * Забирает фоновую музыку игрового экрана.
 *
 * Источник: «Calm Ambient 1 (Synthwave 4k)», cynicmusic (The Cynic Project),
 * https://opengameart.org/content/calm-ambient-1-synthwave-4k — лицензия CC0,
 * то есть общественное достояние: ни атрибуция, ни разрешение не требуются.
 * Ссылка на автора в ASSETS.md стоит из вежливости, а не по обязанности.
 *
 * Скачанного файла мало, и поэтому здесь есть перекодирование, а не просто
 * curl. Оригинал — 6.3 МБ в 320 kbit/s, и в нём есть концовка: последние
 * ~13 секунд затухают в тишину. Зациклить такой файл нельзя — каждые две с
 * половиной минуты музыка пропадала бы совсем, и это читается как «звук
 * сломался», а не как «трек пошёл по кругу».
 *
 * Поэтому концовка отрезается, а хвост оставшегося тела кроссфейдом
 * накладывается на начало: у файла пропадает и начало и конец, зато его конец
 * переходит в его же начало без шва. Заодно 96 kbit/s вместо 320 — фон под
 * игрой, который звучит вполсилы, и лишние 4.5 МБ в репозитории он не стоит.
 *
 * Нужен ffmpeg в PATH. Результат коммитится, поэтому в сборке и в рантайме ни
 * сети, ни ffmpeg уже не требуется — скрипт запускают руками и один раз.
 *
 *   node scripts/fetch-music.mjs
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SOURCE = 'https://opengameart.org/sites/default/files/001_Synthwave_4k_0.mp3';

/** Секунда, на которой начинается затухание оригинала. Измерено по RMS. */
const BODY_END = 145;
/** Длина кроссфейда «хвост → начало». Достаточно длинный, чтобы пады слились. */
const CROSSFADE = 8;
/** Фон, а не концерт: битрейт выбран под шумную улицу и маленький динамик. */
const BITRATE = '96k';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT_DIR = join(ROOT, 'public', 'assets', 'audio');
const OUT = join(OUT_DIR, 'calm-ambient.mp3');

function run(cmd, args) {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
}

try {
  run('ffmpeg', ['-version']);
} catch {
  console.error('Нужен ffmpeg в PATH: он режет концовку и сводит петлю.');
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'speller-music-'));
const raw = join(work, 'source.mp3');

try {
  console.log('Скачиваю оригинал…');
  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  writeFileSync(raw, Buffer.from(await response.arrayBuffer()));

  console.log('Собираю бесшовную петлю…');
  mkdirSync(OUT_DIR, { recursive: true });

  // Тело берётся дважды: первый вход даёт кусок [CROSSFADE, BODY_END], второй —
  // начало [0, CROSSFADE]. acrossfade склеивает их, накладывая хвост первого на
  // второй. У результата начало и конец приходятся на одну и ту же секунду
  // оригинала, поэтому loop у <audio> не даёт щелчка.
  run('ffmpeg', [
    '-y',
    '-i', raw,
    '-i', raw,
    '-filter_complex',
    `[0:a]atrim=start=${CROSSFADE}:end=${BODY_END},asetpts=N/SR/TB[body];` +
      `[1:a]atrim=start=0:end=${CROSSFADE},asetpts=N/SR/TB[head];` +
      `[body][head]acrossfade=d=${CROSSFADE}:c1=tri:c2=tri[out]`,
    '-map', '[out]',
    '-c:a', 'libmp3lame',
    '-b:a', BITRATE,
    '-ar', '44100',
    // Теги оригинала не нужны, а вот происхождение файла в нём остаться должно:
    // иначе через полгода никто не вспомнит, откуда он взялся.
    '-map_metadata', '-1',
    '-metadata', 'title=Calm Ambient 1 (Synthwave 4k)',
    '-metadata', 'artist=cynicmusic',
    '-metadata', 'comment=CC0 / public domain — opengameart.org/content/calm-ambient-1-synthwave-4k',
    OUT,
  ]);

  const kb = Math.round(statSync(OUT).size / 1024);
  console.log(`Готово: public/assets/audio/calm-ambient.mp3, ${kb} КБ`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
