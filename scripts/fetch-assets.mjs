/**
 * Забирает иконки из бесплатного набора Streamline.
 *
 * Источник: https://github.com/webalys-hq/streamline-vectors  (CC BY 4.0)
 * Берём одну ветку стилей из восемнадцати через sparse checkout.
 *
 * Стиль ровно один — plump/gradient. Смешивать наборы нельзя: разная толщина
 * и манера видны сразу, даже когда не получается объяснить, что именно не так.
 * В репозитории есть ещё kameleon/colors со своими предметами, но это другой
 * почерк, и добавлять его к этому — значит сломать цельность картинки.
 *
 * Результат коммитится, поэтому в рантайме и в сборке сеть к GitHub не нужна.
 * Скрипт идемпотентен: повторный запуск переписывает каталоги заново.
 *
 *   node scripts/fetch-assets.mjs            — скачать и разложить
 *   node scripts/fetch-assets.mjs --list     — только показать, что доступно
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, cpSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const REPO = 'https://github.com/webalys-hq/streamline-vectors.git';
const STYLE = 'plump/gradient';

/** Категории с предметами: из них набирается словарь игры. */
const OBJECT_CATEGORIES = [
  'food-drink',
  'map-travel',
  'nature-ecology',
  'money-shopping',
  'entertainment',
  'health',
  'culture',
  'work-education',
  'shipping',
];

/** Категории со знаками интерфейса: кнопки, стрелки, статистика. */
const UI_CATEGORIES = ['interface-essential'];

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT_OBJECTS = join(ROOT, 'public', 'assets', 'objects');
const OUT_UI = join(ROOT, 'public', 'assets', 'ui');
const MANIFEST = join(ROOT, 'src', 'data', 'asset-manifest.json');

const listOnly = process.argv.includes('--list');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

function svgNames(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.svg'))
    .sort();
}

/** Раскладывает выбранные категории плоско, без вложенности по темам. */
function layout(styleDir, categories, outDir) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const placed = {};
  for (const cat of categories) {
    const src = join(styleDir, cat);
    const files = svgNames(src);
    if (!files.length) {
      console.warn(`  пропускаю ${cat} — нет в наборе`);
      continue;
    }
    for (const f of files) cpSync(join(src, f), join(outDir, f));
    placed[cat] = files;
  }
  return placed;
}

const work = mkdtempSync(join(tmpdir(), 'streamline-'));
try {
  console.log('Клонирую без содержимого…');
  git(['clone', '--filter=blob:none', '--no-checkout', '--depth', '1', REPO, work]);
  git(['sparse-checkout', 'set', '--no-cone', STYLE], work);
  git(['checkout'], work);

  const styleDir = join(work, ...STYLE.split('/'));
  if (!existsSync(styleDir)) throw new Error(`в репозитории нет ${STYLE}`);

  const all = {};
  for (const entry of readdirSync(styleDir, { withFileTypes: true })) {
    if (entry.isDirectory()) all[entry.name] = svgNames(join(styleDir, entry.name));
  }

  console.log(`\nДоступно в ${STYLE}:`);
  for (const [cat, files] of Object.entries(all)) {
    const mark = OBJECT_CATEGORIES.includes(cat) ? 'предметы' : UI_CATEGORIES.includes(cat) ? 'интерфейс' : '—';
    console.log(`  ${cat.padEnd(26)} ${String(files.length).padStart(4)}  ${mark}`);
  }

  if (listOnly) process.exit(0);

  console.log('\nРаскладываю предметы…');
  const objects = layout(styleDir, OBJECT_CATEGORIES, OUT_OBJECTS);
  console.log('Раскладываю знаки интерфейса…');
  const ui = layout(styleDir, UI_CATEGORIES, OUT_UI);

  const count = (o) => Object.values(o).reduce((n, f) => n + f.length, 0);

  mkdirSync(join(ROOT, 'src', 'data'), { recursive: true });
  writeFileSync(
    MANIFEST,
    JSON.stringify(
      {
        source: REPO,
        style: STYLE,
        license: 'CC BY 4.0',
        attribution: 'Icons by Streamline — https://streamlinehq.com',
        fetchedAt: new Date().toISOString().slice(0, 10),
        objects,
        ui,
      },
      null,
      2,
    ) + '\n',
  );

  console.log(`\nПредметов:  ${count(objects)}  → ${relative(ROOT, OUT_OBJECTS)}`);
  console.log(`Интерфейс:  ${count(ui)}  → ${relative(ROOT, OUT_UI)}`);
  console.log(`Манифест:   ${relative(ROOT, MANIFEST)}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
