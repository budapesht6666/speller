/**
 * Обёртка над Web Speech API.
 *
 * Всё поведение здесь продиктовано замерами на живом iPhone
 * (research/PROBE-RESULTS.md), а не документацией:
 *
 * - слушаем `interim`, а не `FINAL`: первый даёт реакцию за 0.2–0.4 с, второй
 *   приходит через ~2 с после того, как игрок замолчал, и слова, названные
 *   подряд, им не отследить вовсе;
 * - `maxAlternatives = 5` выставляем, хотя в `interim` альтернатива всегда
 *   одна: на финале они появляются, и терять их незачем;
 * - `confidence` не используем нигде — в `interim` он всегда 0.00;
 * - запускать можно только из пользовательского жеста, иначе Safari
 *   не отдаст микрофон;
 * - сессия живёт больше минуты даже в тишине, поэтому авторестарт по `onend`
 *   существует как страховка, а не как основной механизм.
 */

export type RecognizerState = 'idle' | 'starting' | 'listening' | 'blocked' | 'error';

export interface RecognizerEvents {
  /** Промежуточная расшифровка: индекс пачки и её текст. */
  onTranscript(segmentIndex: number, transcript: string, isFinal: boolean): void;
  /**
   * Состояние микрофона. `detail` — код ошибки движка (`network`,
   * `audio-capture`) и только он: тексты для человека живут в data/i18n.ts,
   * потому что переводятся, а этот модуль про язык интерфейса не знает.
   */
  onStateChange(state: RecognizerState, detail?: string): void;
  /** Сессия оборвалась и вот-вот перезапустится: хвост надо сбросить. */
  onSessionEnd(): void;
}

/* Минимальные описания: в стандартной библиотеке TypeScript этих типов нет,
   а тянуть пакет ради трёх интерфейсов не стоит. */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResultLike {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((e: Event) => void) | null;
  onend: ((e: Event) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getConstructor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Что именно мешает распознаванию прямо сейчас. */
export type RecognitionBlocker = 'none' | 'insecure' | 'unsupported';

/**
 * Проверка перед показом кнопки «Играть».
 *
 * Защищённый контекст проверяется первым, и это главное здесь. По http
 * распознавания нет ни в одном браузере, причём WebKit в этом случае просто не
 * заводит конструктор — то есть отсутствие конструктора на телефоне означает
 * «открыто по http», а вовсе не «браузер не умеет». Совет сменить браузер в
 * этой ситуации отправляет человека чинить не то.
 *
 * `localhost` защищённым считается: поэтому на своей машине всё идёт, а с
 * телефона по адресу вида `http://192.168.x.x` не работает ничего. Проверено:
 * по https на iPhone распознавание есть в любом браузере, не только в Safari.
 */
export function recognitionBlocker(): RecognitionBlocker {
  if (!window.isSecureContext) return 'insecure';
  return getConstructor() ? 'none' : 'unsupported';
}

export class Recognizer {
  private recognition: SpeechRecognitionLike | null = null;
  private wanted = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private state: RecognizerState = 'idle';

  constructor(
    private lang: string,
    private readonly events: RecognizerEvents,
  ) {}

  /**
   * Смена языка распознавания.
   *
   * Применяется к следующей сессии, а не к текущей: `lang` живущей сессии
   * Safari игнорирует, а перезапуск ради этого означал бы отпустить микрофон
   * посреди раунда — после чего он, по замерам, возвращается мёртвым.
   * Язык меняют на стартовом экране, где сессии и нет.
   */
  setLang(lang: string): void {
    this.lang = lang;
  }

  /** Обязан вызываться из обработчика касания: Safari иначе не даст микрофон. */
  start(): void {
    if (this.wanted) return;
    const Ctor = getConstructor();
    if (!Ctor) {
      this.setState('error');
      return;
    }
    this.wanted = true;
    this.setState('starting');
    this.spawn(Ctor);
  }

  stop(): void {
    this.wanted = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    try {
      this.recognition?.stop();
    } catch {
      /* остановка уже остановленной сессии — не повод падать */
    }
    this.recognition = null;
    this.setState('idle');
  }

  private setState(state: RecognizerState, detail?: string): void {
    if (this.state === state) return;
    this.state = state;
    this.events.onStateChange(state, detail);
  }

  private spawn(Ctor: SpeechRecognitionCtor): void {
    const recognition = new Ctor();
    recognition.lang = this.lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 5;

    recognition.onstart = () => this.setState('listening');

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const best = result[0];
        if (!best) continue;
        this.events.onTranscript(i, best.transcript, result.isFinal);
      }
    };

    recognition.onerror = (event) => {
      // Отказ в доступе — единственная ошибка, после которой перезапуск
      // бессмыслен: она не рассосётся сама и требует действий человека.
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this.wanted = false;
        this.setState('blocked');
        return;
      }
      // `no-speech` и `aborted` — рабочий шум, а не сбой: движок так сообщает
      // о паузе. Реагировать на них сообщением означало бы мигать ошибкой
      // каждые несколько секунд молчания.
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        this.setState('error', event.error);
      }
    };

    recognition.onend = () => {
      this.recognition = null;
      this.events.onSessionEnd();
      if (!this.wanted) {
        this.setState('idle');
        return;
      }
      // Пауза перед перезапуском обязательна: мгновенный start() после end()
      // Safari отвергает как повторный запуск уже идущей сессии.
      this.restartTimer = setTimeout(() => {
        if (!this.wanted) return;
        try {
          this.spawn(Ctor);
        } catch {
          this.setState('error');
        }
      }, 150);
    };

    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      // Единственный ожидаемый случай — сессия уже идёт. Тогда ничего делать
      // не надо: она и есть то, что нам нужно.
      this.setState('listening');
    }
  }
}
