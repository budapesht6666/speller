/**
 * Фоновая музыка игрового экрана.
 *
 * Трек — CC0, лежит в `public/assets/audio/` и собран петлёй: его конец
 * переходит в его же начало без шва (см. `scripts/fetch-music.mjs`). Поэтому
 * здесь достаточно `loop = true`, и не нужен ни второй экземпляр, ни
 * кроссфейд в рантайме.
 *
 * ── Почему Web Audio, а не просто `audio.volume` ─────────────────────────
 * На iOS `volume` у медиаэлемента только читается: присваивание молча
 * игнорируется, громкостью распоряжается железная качелька на боку телефона.
 * То есть `audio.volume = 0.26` на телефоне означает «играть в полную силу» —
 * ровно то, чего нельзя допускать в игре, которая одновременно слушает
 * микрофон. Громкость поэтому берёт на себя GainNode: он работает везде
 * одинаково.
 *
 * ── Почему затухание не через GSAP ───────────────────────────────────────
 * GSAP в этом проекте отвечает за дискретные события интерфейса. Плавность
 * звука — не событие интерфейса, а расписание параметра, и у Web Audio для
 * него есть собственный механизм с точностью до отсчёта. Тянуть громкость
 * тикером означало бы слышать частоту кадров: на просевшем кадре в затухании
 * появится ступенька.
 *
 * ── Чего это не чинит ────────────────────────────────────────────────────
 * Беззвучный режим iOS (качелька «Звонок/Бесшумно») глушит и это тоже. Так
 * ведёт себя любой звук на странице; обходится только сменой аудиосессии на
 * `playback`, а она конфликтует с записью с микрофона. Молчащая музыка при
 * включённом бесшумном режиме — правильное поведение телефона, а не поломка.
 */

/**
 * Может ли музыка звучать вообще.
 *
 * Это не «включена ли она» — намерение игрока живёт отдельно, в `enabled`.
 * Здесь отказ: файл не приехал или браузер запретил воспроизведение. Кнопка
 * обязана показывать это иначе, чем выключенную музыку, иначе человек нажмёт
 * и не поймёт, почему тишина.
 */
export type MusicState = 'ok' | 'blocked';

/** Фон под игрой, а не концерт: громче музыка начинает спорить с микрофоном. */
const VOLUME = 0.26;
/** Появление и уход. Резкий старт слышен как щелчок. */
const FADE_IN = 1.6;
const FADE_OUT = 0.5;

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export class Music {
  private readonly audio: HTMLAudioElement;
  private readonly onChange: (state: MusicState) => void;

  private context: AudioContext | null = null;
  private gain: GainNode | null = null;

  /** Чего хочет игрок. Хранится снаружи и переживает перезапуск. */
  private wanted: boolean;
  /** Идёт ли раунд: музыка звучит только в игре. */
  private inRound = false;
  private state: MusicState = 'ok';

  constructor(src: string, wanted: boolean, onChange: (state: MusicState) => void) {
    this.wanted = wanted;
    this.onChange = onChange;

    this.audio = new Audio();
    this.audio.src = src;
    this.audio.loop = true;
    // Полтора мегабайта не тянем, пока музыка выключена: у человека может быть
    // мобильный интернет, и оплачивать он должен только то, что слушает.
    this.audio.preload = wanted ? 'auto' : 'none';
    // Резервный путь для окружения без Web Audio. На iOS присваивание ничего
    // не делает — там громкостью распоряжается GainNode.
    this.audio.volume = VOLUME;
    // Файл может не приехать вовсе.
    this.audio.addEventListener('error', () => this.settle('blocked'));

    // Ушли из вкладки — музыка замолкает. Иначе она играет из свёрнутого
    // браузера, и найти, что именно звучит, человеку нечем.
    document.addEventListener('visibilitychange', () => this.sync());
  }

  get enabled(): boolean {
    return this.wanted;
  }

  get blocked(): boolean {
    return this.state === 'blocked';
  }

  /**
   * Разворачивает граф Web Audio.
   *
   * Только из жеста пользователя: до касания AudioContext создаётся в
   * состоянии `suspended`, и на iOS разбудить его больше нечем.
   */
  private ensureGraph(): void {
    if (this.context) return;
    const Ctor = audioContextCtor();
    if (!Ctor) return;
    try {
      const context = new Ctor();
      const gain = context.createGain();
      gain.gain.value = 0;
      context.createMediaElementSource(this.audio).connect(gain).connect(context.destination);
      this.context = context;
      this.gain = gain;
    } catch {
      /* нет Web Audio — играем через громкость медиаэлемента, без затуханий */
    }
  }

  /** Ведёт громкость к цели расписанием самого Web Audio. */
  private ramp(to: number, seconds: number): void {
    const { gain, context } = this;
    if (!gain || !context) return;
    const now = context.currentTime;
    // Отмена с фиксацией текущего значения: без неё новое расписание
    // начинается от того, что было до прошлого ramp, и громкость прыгает.
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(to, now + seconds);
  }

  private settle(state: MusicState): void {
    if (this.state === state) return;
    this.state = state;
    this.onChange(state);
  }

  private get shouldPlay(): boolean {
    return this.wanted && this.inRound && !document.hidden;
  }

  /** Единственное место, где решается, звучит музыка или нет. */
  private sync(): void {
    if (!this.shouldPlay) {
      if (this.audio.paused) return;
      this.ramp(0, FADE_OUT);
      // Пауза ставится после затухания, а не вместе с ним: иначе обрыв слышен.
      // Условие в таймере на случай, если за эти полсекунды музыку успели
      // включить обратно — тогда паузу ставить уже нельзя.
      window.setTimeout(() => {
        if (!this.shouldPlay) this.audio.pause();
      }, FADE_OUT * 1000);
      return;
    }

    this.ensureGraph();
    void this.context?.resume();
    this.ramp(VOLUME, FADE_IN);

    const started = this.audio.play();
    // play() возвращает промис не везде, и он отклоняется, когда браузер
    // запретил воспроизведение. Отказ обязан быть виден на кнопке: иначе
    // человек видит «музыка включена» и слышит тишину.
    if (started) started.then(() => this.settle('ok'), () => this.settle('blocked'));
    else this.settle('ok');
  }

  /** Раунд начался. Вызывать из обработчика касания — иначе iOS не пустит. */
  enterRound(): void {
    this.inRound = true;
    this.sync();
  }

  leaveRound(): void {
    this.inRound = false;
    this.sync();
  }

  setEnabled(on: boolean): void {
    if (on === this.wanted) return;
    this.wanted = on;
    if (on && this.audio.preload === 'none') this.audio.preload = 'auto';
    this.sync();
  }
}
