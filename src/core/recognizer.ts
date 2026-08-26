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

export function isRecognitionSupported(): boolean {
  return getConstructor() !== null;
}

export class Recognizer {
  private recognition: SpeechRecognitionLike | null = null;
  private wanted = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private state: RecognizerState = 'idle';

  constructor(
    private readonly lang: string,
    private readonly events: RecognizerEvents,
  ) {}

  /** Обязан вызываться из обработчика касания: Safari иначе не даст микрофон. */
  start(): void {
    if (this.wanted) return;
    const Ctor = getConstructor();
    if (!Ctor) {
      this.setState('error', 'В этом браузере нет распознавания речи');
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
        this.setState('blocked', 'Микрофон недоступен');
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
          this.setState('error', 'не удалось перезапустить распознавание');
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
