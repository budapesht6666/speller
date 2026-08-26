/**
 * Точка входа игры.
 *
 * M1: экраны статичны, задача этапа — утвердить вид на живом телефоне.
 * Игровой цикл, распознавание и матчер приходят в M2; здесь сознательно нет
 * ни одного из них, чтобы вид утверждался отдельно от механики.
 */

import '@fontsource-variable/nunito';
import './styles/base.css';

import { CONCEPTS, displayWord } from './data/concepts';

const play = document.getElementById('screen-play')!;
const finish = document.getElementById('screen-finish')!;
const devSwitch = document.getElementById('dev-switch')!;

/**
 * Пока цикла нет, экран проигрыша нужно чем-то наполнить. Берём случайное
 * понятие из настоящего словаря, а не выдуманную строку: так сразу видно,
 * как экран ведёт себя с длинными словами вроде strawberry, и не приходится
 * ловить это потом.
 */
function fillFinishWithRandomConcept(): void {
  const concept = CONCEPTS[Math.floor(Math.random() * CONCEPTS.length)]!;
  const word = displayWord(concept, 'en-US');

  const image = document.getElementById('finish-object') as HTMLImageElement;
  image.src = `/assets/objects/${concept.asset}`;
  image.alt = word;

  const label = document.getElementById('finish-word')!;
  label.textContent = word.charAt(0).toUpperCase() + word.slice(1);
}

function show(screen: 'play' | 'finish'): void {
  play.hidden = screen !== 'play';
  finish.hidden = screen !== 'finish';
  if (screen === 'finish') fillFinishWithRandomConcept();
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', screen === 'play' ? '#3878e0' : '#ffffff');
}

devSwitch.addEventListener('click', () => {
  show(play.hidden ? 'play' : 'finish');
});

/**
 * Озвучка слова. Единственная живая функция этапа — она отвечает на вопрос,
 * который иначе пришлось бы проверять отдельно: доступен ли на iOS в standalone
 * английский голос speechSynthesis. Если голоса нет, экран проигрыша теряет
 * половину смысла, и узнать об этом лучше сейчас.
 */
document.getElementById('speak')!.addEventListener('click', () => {
  const word = document.getElementById('finish-word')!.textContent ?? '';
  if (!('speechSynthesis' in window) || !word) return;
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'en-US';
  utterance.rate = 0.85;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
});

show('play');
