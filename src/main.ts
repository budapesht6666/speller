/**
 * Сборка приложения: экраны, игровой цикл и распознавание.
 *
 * Единственные часы приложения — `gsap.ticker`. Он уже умеет rAF, паузу при
 * уходе вкладки в фон и сглаживание рывков; заводить рядом с ним собственный
 * requestAnimationFrame значило бы получить двое часов, которые обязательно
 * разойдутся.
 *
 * Падение считается вручную внутри тика, а не твинами: нужны пауза, переменная
 * скорость и проверка линии, а твин про это ничего не знает.
 */

import '@fontsource-variable/nunito';
import './styles/base.css';

import { gsap } from 'gsap';
import { Game, type FallingItem, type GameEvent } from './core/game';
import {
  recognitionBlocker,
  Recognizer,
  type RecognitionBlocker,
  type RecognizerState,
} from './core/recognizer';
import { isLangCode, LANG_CODES, LANGS, type LangCode } from './data/concepts';
import {
  applyStrings,
  detectUiLang,
  isUiLang,
  t,
  UI_LANGS,
  type StringKey,
  type UiLang,
} from './data/i18n';
import { appear, bumpScore, burst, floatIdle, hideBoot, pulse, swapScreens } from './ui/motion';
import { Music } from './ui/sound';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const screens = {
  start: el('screen-start'),
  play: el('screen-play'),
  finish: el('screen-finish'),
};
const field = el('field');
const scoreLabel = el('score');
const listening = el('listening');
const listeningText = el('listening-text');
const hintButton = el('hint');
const musicButton = el('music');

/* ── Настройки ──────────────────────────────────────────────────────────── */

/**
 * Выбор языков переживает перезапуск.
 *
 * localStorage в приватном окне Safari бросает исключение на запись, а игра
 * из-за настройки падать не должна: не сохранилось — не беда, спросим снова.
 */
const STORE_UI = 'speller.ui-lang';
const STORE_LEARN = 'speller.learn-lang';
const STORE_MUSIC = 'speller.music';

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* приватный режим: настройка живёт только до закрытия вкладки */
  }
}

function recall(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

const storedUi = recall(STORE_UI);
const storedLearn = recall(STORE_LEARN);
// Умолчание — «включена»: музыка часть замысла, а не добавка. Выключенной она
// становится только по решению игрока, и это решение сохраняется.
const storedMusic = recall(STORE_MUSIC);

let uiLang: UiLang = isUiLang(storedUi) ? storedUi : detectUiLang();
let learnLang: LangCode = isLangCode(storedLearn) ? storedLearn : 'en-US';

const game = new Game({ lang: learnLang });
/** Узлы предметов по ключу: игра оперирует состоянием, отрисовка — узлами. */
const nodes = new Map<number, HTMLElement>();

let current: keyof typeof screens = 'start';
let pulseTween: gsap.core.Tween | null = null;
let recognizerState: RecognizerState = 'idle';
let recognizerDetail: string | undefined;

/* ── Язык интерфейса ────────────────────────────────────────────────────── */

/**
 * Почему играть нельзя — если нельзя.
 *
 * Считается один раз: ни защищённость контекста, ни наличие конструктора
 * посреди сессии не меняются.
 */
const blocker: RecognitionBlocker = recognitionBlocker();

const BLOCKER_TEXT: Record<Exclude<RecognitionBlocker, 'none'>, StringKey> = {
  insecure: 'start.insecure',
  unsupported: 'start.unsupported',
};

const LISTEN_TEXT: Record<RecognizerState, StringKey> = {
  idle: 'listen.idle',
  starting: 'listen.starting',
  listening: 'listen.listening',
  blocked: 'listen.blocked',
  error: 'listen.error',
};

/**
 * Группа «выбрать одно из».
 *
 * Обе группы языков собираются одной функцией и из данных, а не пишутся в
 * разметке: списки языков — данные, и порядок в них обязан совпадать. Руками
 * это пришлось бы держать в трёх местах.
 */
function renderChoice<T extends string>(
  host: HTMLElement,
  itemClass: string,
  attr: string,
  values: readonly T[],
  labelOf: (value: T) => { text: string; lang?: string },
  onPick: (value: T) => void,
): void {
  host.replaceChildren(
    ...values.map((value) => {
      const label = labelOf(value);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = itemClass;
      button.setAttribute('role', 'radio');
      button.textContent = label.text;
      // Самоназвание набрано своим письмом, и объявить его язык обязательно:
      // иначе экранный диктор прочитает «Tiếng Việt» по-русски.
      if (label.lang) button.lang = label.lang;
      button.dataset[attr] = value;
      button.addEventListener('click', () => onPick(value));
      return button;
    }),
  );
}

/** Отмечает выбранное значение в группе. */
function markChoice(attr: string, value: string): void {
  const selector = `[data-${attr.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}]`;
  for (const node of document.querySelectorAll<HTMLElement>(selector)) {
    node.setAttribute('aria-checked', String(node.dataset[attr] === value));
  }
}

function applyUiLang(): void {
  document.documentElement.lang = uiLang;
  applyStrings(document, uiLang);
  markChoice('uiLang', uiLang);
  // Пилюля «Слушаю» и кнопка музыки берут подпись из состояния, а не из
  // разметки: у обеих ключ зависит от того, что сейчас происходит, и
  // data-i18n его не проставит.
  renderListening();
  renderMusic();
  // Под кнопкой «Играть» либо обычная памятка, либо причина отказа. Строку
  // с причиной data-i18n не поставит: ключ зависит от окружения, а не от
  // разметки.
  if (blocker !== 'none') el('start-note').textContent = t(uiLang, BLOCKER_TEXT[blocker]);
}

function setUiLang(next: UiLang): void {
  if (next === uiLang) return;
  uiLang = next;
  remember(STORE_UI, next);
  applyUiLang();
}

/* ── Язык обучения ──────────────────────────────────────────────────────── */

function setLearnLang(next: LangCode): void {
  if (next === learnLang) return;
  learnLang = next;
  remember(STORE_LEARN, next);
  game.setLang(next);
  recognizer.setLang(next);
  markChoice('learnLang', next);
}

/* ── Музыка ─────────────────────────────────────────────────────────────── */

/**
 * Фоновая музыка.
 *
 * Звучит только в раунде и заметно тише голоса: та же дорожка идёт в микрофон,
 * и громкая музыка стала бы соперничать с игроком за распознавание. Насколько
 * именно — измеряется на телефоне, в браузере на столе этого не увидеть.
 */
const music = new Music('/assets/audio/calm-ambient.mp3', storedMusic !== 'off', renderMusic);

/**
 * Вид кнопки. Три состояния, и все три различимы: играет, выключена игроком,
 * недоступна.
 */
function renderMusic(): void {
  musicButton.setAttribute('aria-pressed', String(music.enabled && !music.blocked));
  musicButton.setAttribute('aria-disabled', String(music.blocked));
  musicButton.setAttribute(
    'aria-label',
    t(uiLang, music.blocked ? 'play.musicBlocked' : 'play.music'),
  );
}

musicButton.addEventListener('click', () => {
  if (music.blocked) return;
  music.setEnabled(!music.enabled);
  remember(STORE_MUSIC, music.enabled ? 'on' : 'off');
  renderMusic();
});

/* ── Экраны ─────────────────────────────────────────────────────────────── */

function goTo(next: keyof typeof screens): void {
  if (next === current) return;
  swapScreens(screens[current], screens[next]);
  current = next;
  // Фон за телефонной колонкой на широком экране и цвет строки состояния
  // на телефоне — одно и то же решение, поэтому меняются вместе.
  document.body.dataset['screen'] = next;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', next === 'finish' ? '#ffffff' : '#3878e0');
}

/* ── Отрисовка предметов ────────────────────────────────────────────────── */

/**
 * Позиция задаётся трансформом, а не left/top: трансформ не вызывает
 * пересчёт раскладки, и при четырёх предметах на экране это разница между
 * ровным движением и рывками на слабом телефоне.
 *
 * Трансформ внешнего узла целиком принадлежит этой функции. Анимации GSAP
 * висят на внутреннем: пока и то и другое сидело на одном узле, тик затирал
 * твин, и появление предмета не было видно.
 */
function place(node: HTMLElement, item: FallingItem): void {
  const width = field.clientWidth;
  const height = field.clientHeight;
  const size = node.offsetWidth || 84;
  const x = item.x * width - size / 2;
  const y = item.y * (height - size);
  node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

function addNode(item: FallingItem): void {
  const node = document.createElement('div');
  node.className = 'object';

  const art = document.createElement('img');
  art.className = 'object__art';
  art.src = `/assets/objects/${item.concept.asset}`;
  art.alt = '';

  // Подсказка едет вместе с предметом и живёт в его же узле: иначе при
  // четырёх предметах пришлось бы держать второй список узлов и синхронно
  // двигать оба.
  const hint = document.createElement('span');
  hint.className = 'object__hint';
  hint.lang = learnLang;
  hint.textContent = item.word;

  node.append(art, hint);
  field.append(node);
  nodes.set(item.key, node);
  place(node, item);
  appear(art);
}

function applyEvents(events: GameEvent[]): void {
  for (const event of events) {
    if (event.type === 'spawn') {
      addNode(event.item);
      continue;
    }

    const node = nodes.get(event.item.key);
    nodes.delete(event.item.key);

    if (event.type === 'hit') {
      scoreLabel.textContent = String(game.stats.score);
      bumpScore(scoreLabel);
      if (node) void burst(node);
      continue;
    }

    if (node) node.remove();
    finishRound(event.item);
  }
}

/* ── Подсказка ──────────────────────────────────────────────────────────── */

/**
 * Слова видно, пока кнопку держат.
 *
 * Не переключатель: подсказка должна остаться разовым «подсмотреть», а не
 * режимом, в котором незаметно проходишь весь раунд. Отпускание снимает её
 * всегда — в том числе когда палец ушёл с кнопки или окно потеряло фокус.
 */
function setHint(on: boolean): void {
  field.dataset['hint'] = on ? 'on' : 'off';
  hintButton.setAttribute('aria-pressed', String(on));
}

hintButton.addEventListener('pointerdown', (event) => {
  // Только основная кнопка: правый клик на мыши иначе включал бы подсказку,
  // а отпускание его не выключало.
  if (event.button !== 0) return;
  event.preventDefault();
  hintButton.setPointerCapture(event.pointerId);
  setHint(true);
});
for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
  hintButton.addEventListener(type, () => setHint(false));
}
// С клавиатуры кнопка ведёт себя так же: нажал — держится, отпустил — гаснет.
hintButton.addEventListener('keydown', (event) => {
  if (event.key !== ' ' && event.key !== 'Enter') return;
  event.preventDefault();
  setHint(true);
});
hintButton.addEventListener('keyup', () => setHint(false));
hintButton.addEventListener('blur', () => setHint(false));
window.addEventListener('blur', () => setHint(false));

/* ── Игровой цикл ───────────────────────────────────────────────────────── */

function tick(): void {
  if (current !== 'play' || game.isOver) return;
  // deltaRatio(60) даёт кадры, а нам нужны секунды: иначе скорость падения
  // зависела бы от частоты обновления экрана, и на 120 Гц игра шла бы вдвое
  // быстрее, чем на 60.
  const dt = Math.min(gsap.ticker.deltaRatio(60) / 60, 0.1);

  const events = game.update(dt);
  for (const item of game.items) {
    const node = nodes.get(item.key);
    if (node) place(node, item);
  }
  applyEvents(events);
}

gsap.ticker.add(tick);

/* ── Распознавание ──────────────────────────────────────────────────────── */

function renderListening(): void {
  listening.dataset['state'] = recognizerState === 'listening' ? 'on' : 'off';
  // Подробность от движка (`network`, `audio-capture`) переводу не подлежит и
  // показывается как есть: это диагностика, а не текст интерфейса.
  listeningText.textContent =
    recognizerDetail && recognizerState !== 'listening'
      ? recognizerDetail
      : t(uiLang, LISTEN_TEXT[recognizerState]);
}

const recognizer = new Recognizer(learnLang, {
  onTranscript(segmentIndex, transcript) {
    if (current !== 'play') return;
    applyEvents(game.hear(segmentIndex, transcript));
  },
  onStateChange(state, detail) {
    recognizerState = state;
    recognizerDetail = detail;
    renderListening();

    pulseTween?.kill();
    pulseTween = null;
    gsap.set(listening, { opacity: 1 });
    if (state === 'listening') pulseTween = pulse(listening);
  },
  onSessionEnd() {
    // Хвост расшифровки принадлежал оборвавшейся сессии: нумерация пачек
    // начнётся заново, и старые позиции слов станут бессмысленными.
    game.forgetTranscript();
  },
});

/* ── Раунд ──────────────────────────────────────────────────────────────── */

function startRound(): void {
  field.replaceChildren();
  nodes.clear();
  setHint(false);
  game.reset();
  scoreLabel.textContent = '0';
  goTo('play');
  recognizer.start();
  // Внутри обработчика касания и никак иначе: AudioContext до жеста создаётся
  // `suspended`, и на iOS разбудить его больше нечем.
  music.enterRound();
}

function finishRound(missedItem: FallingItem): void {
  recognizer.stop();
  setHint(false);
  // Музыка уходит до появления экрана: там жмут «Послушать», и слово должно
  // звучать в тишине.
  music.leaveRound();

  const { seconds, score, words } = game.stats;
  el('stat-time').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  el('stat-score').textContent = String(score);
  el('stat-words').textContent = String(words);

  const image = el<HTMLImageElement>('finish-object');
  image.src = `/assets/objects/${missedItem.concept.asset}`;

  const word = el('finish-word');
  word.lang = learnLang;
  word.textContent = missedItem.word.charAt(0).toUpperCase() + missedItem.word.slice(1);

  goTo('finish');
}

/* ── Озвучка ────────────────────────────────────────────────────────────── */

el('speak').addEventListener('click', () => {
  const word = el('finish-word').textContent ?? '';
  if (!('speechSynthesis' in window) || !word) return;
  const utterance = new SpeechSynthesisUtterance(word);
  // Язык обучения, а не интерфейса: озвучивается слово, которое надо было
  // назвать. Голоса для него может не оказаться — тогда система промолчит,
  // и это лучше, чем прочитать вьетнамское слово английским голосом.
  utterance.lang = learnLang;
  utterance.rate = 0.85;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
});

/* ── Кнопки ─────────────────────────────────────────────────────────────── */

el('start-play').addEventListener('click', startRound);
// «Заново» — сразу новый раунд на том же языке. Сменить язык можно только на
// стартовом экране, и туда ведёт «Меню».
el('again').addEventListener('click', startRound);
el('menu').addEventListener('click', backToStart);
el('quit').addEventListener('click', backToStart);

/** Возврат на стартовый экран — одинаковый и по «Выйти», и по «Меню». */
function backToStart(): void {
  recognizer.stop();
  setHint(false);
  music.leaveRound();
  goTo('start');
}

/* ── Первый экран ───────────────────────────────────────────────────────── */

renderChoice(el('ui-langs'), 'seg__item', 'uiLang', UI_LANGS, (l) => ({ text: l.toUpperCase() }), setUiLang);
renderChoice(
  el('learn-langs'),
  'chip',
  'learnLang',
  LANG_CODES,
  (code) => ({ text: LANGS[code].native, lang: code }),
  setLearnLang,
);
markChoice('learnLang', learnLang);
applyUiLang();

if (blocker !== 'none') {
  // Молча показывать кнопку «Играть» там, где игра невозможна, — худший из
  // вариантов: человек нажмёт и решит, что сломалось приложение. Строку под
  // кнопкой проставил applyUiLang выше.
  el<HTMLButtonElement>('start-play').disabled = true;
}

floatIdle([...document.querySelectorAll<HTMLElement>('.start__object')]);

/* ── Снятие заставки ────────────────────────────────────────────────────── */

/**
 * Заставка держится до тех пор, пока интерфейс не перестанет меняться сам.
 *
 * Ждём три вещи: применённые строки и собранные кнопки (это уже сделано выше,
 * синхронно), готовый шрифт и раскодированные картинки стартового экрана.
 * Nunito приезжает отдельным файлом со `swap`, поэтому без ожидания текст
 * сначала рисуется системным шрифтом и потом прыгает по ширине.
 *
 * Обращение к offsetHeight не лишнее: `fonts.ready` отвечает про уже начатые
 * загрузки, а начинаются они при первом расчёте раскладки. Без этой строки
 * промис может выполниться раньше, чем шрифт вообще запросили.
 *
 * Потолок ожидания обязателен. Картинка или шрифт могут не приехать вовсе —
 * на плохой связи это обычное дело, — и тогда заставка осталась бы навсегда,
 * то есть игра выглядела бы намертво зависшей вместо просто некрасивой.
 */
async function ready(): Promise<void> {
  void document.body.offsetHeight;
  const images = [...document.querySelectorAll<HTMLImageElement>('#screen-start img')];
  await Promise.allSettled([document.fonts?.ready, ...images.map(decoded)]);
  // Ещё один кадр: строки применены, но браузер их пока не нарисовал.
  await new Promise(requestAnimationFrame);
}

/** Готовность картинки. `decode()` есть не везде, `complete` — везде. */
function decoded(image: HTMLImageElement): Promise<unknown> {
  if (typeof image.decode === 'function') return image.decode();
  if (image.complete) return Promise.resolve();
  return new Promise((resolve) => {
    image.addEventListener('load', resolve, { once: true });
    image.addEventListener('error', resolve, { once: true });
  });
}

const CAP = new Promise((resolve) => setTimeout(resolve, 4000));
void Promise.race([ready(), CAP]).then(() => hideBoot(el('boot')));
