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
import { isRecognitionSupported, Recognizer, type RecognizerState } from './core/recognizer';
import { appear, bumpScore, burst, floatIdle, pulse, swapScreens } from './ui/motion';

const LANG = 'en-US';

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

const game = new Game({ lang: LANG });
/** Узлы предметов по ключу: игра оперирует состоянием, отрисовка — узлами. */
const nodes = new Map<number, HTMLElement>();

let current: keyof typeof screens = 'start';
let pulseTween: gsap.core.Tween | null = null;

/* ── Экраны ─────────────────────────────────────────────────────────────── */

function goTo(next: keyof typeof screens): void {
  if (next === current) return;
  swapScreens(screens[current], screens[next]);
  current = next;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', next === 'finish' ? '#ffffff' : '#3878e0');
}

/* ── Отрисовка предметов ────────────────────────────────────────────────── */

/**
 * Позиция задаётся трансформом, а не left/top: трансформ не вызывает
 * пересчёт раскладки, и при четырёх предметах на экране это разница между
 * ровным движением и рывками на слабом телефоне.
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
  const node = document.createElement('img');
  node.className = 'object';
  node.src = `/assets/objects/${item.concept.asset}`;
  node.alt = item.word;
  field.append(node);
  nodes.set(item.key, node);
  place(node, item);
  appear(node);
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

    // Промах: предмет остаётся на экране до самого перехода, иначе человек
    // не увидит, что именно он упустил.
    if (node) node.remove();
    finishRound(event.item);
  }
}

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

const STATE_TEXT: Record<RecognizerState, string> = {
  idle: 'Микрофон закрыт',
  starting: 'Включаю микрофон…',
  listening: 'Слушаю…',
  blocked: 'Нет доступа к микрофону',
  error: 'Распознавание недоступно',
};

const recognizer = new Recognizer(LANG, {
  onTranscript(segmentIndex, transcript) {
    if (current !== 'play') return;
    applyEvents(game.hear(segmentIndex, transcript));
  },
  onStateChange(state, detail) {
    listening.dataset['state'] = state === 'listening' ? 'on' : 'off';
    listeningText.textContent = detail && state !== 'listening' ? detail : STATE_TEXT[state];

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
  game.reset();
  scoreLabel.textContent = '0';
  goTo('play');
  recognizer.start();
}

function finishRound(missedItem: FallingItem): void {
  recognizer.stop();

  const { seconds, score, words } = game.stats;
  el('stat-time').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  el('stat-score').textContent = String(score);
  el('stat-words').textContent = String(words);

  const image = el<HTMLImageElement>('finish-object');
  image.src = `/assets/objects/${missedItem.concept.asset}`;
  image.alt = missedItem.word;
  el('finish-word').textContent = missedItem.word.charAt(0).toUpperCase() + missedItem.word.slice(1);

  goTo('finish');
}

/* ── Озвучка ────────────────────────────────────────────────────────────── */

el('speak').addEventListener('click', () => {
  const word = el('finish-word').textContent ?? '';
  if (!('speechSynthesis' in window) || !word) return;
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = LANG;
  utterance.rate = 0.85;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
});

/* ── Кнопки ─────────────────────────────────────────────────────────────── */

el('start-play').addEventListener('click', startRound);
el('again').addEventListener('click', startRound);
el('quit').addEventListener('click', () => {
  recognizer.stop();
  goTo('start');
});

/* ── Первый экран ───────────────────────────────────────────────────────── */

if (!isRecognitionSupported()) {
  // Молча показывать кнопку «Играть» там, где игра невозможна, — худший из
  // вариантов: человек нажмёт и решит, что сломалось приложение.
  const button = el<HTMLButtonElement>('start-play');
  button.disabled = true;
  el('start-note').textContent =
    'Этот браузер не умеет распознавать речь. Откройте игру в Safari на iPhone или в Chrome.';
}

floatIdle([...document.querySelectorAll<HTMLElement>('.start__object')]);
