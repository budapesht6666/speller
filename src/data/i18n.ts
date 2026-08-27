/**
 * Строки интерфейса.
 *
 * Язык интерфейса и язык обучения — разные вещи, и путать их нельзя: человек
 * приезжает во Вьетнам учить вьетнамский, а объяснения ему на первых порах
 * нужны на родном. Набор языков сейчас совпадает, порядок в обоих списках тоже
 * — это проверяется тестом, а не поддерживается вниманием.
 *
 * Разметка помечена атрибутами `data-i18n` и `data-i18n-aria`, а не собирается
 * в коде: так строку видно там, где она показывается, и HTML остаётся читаемым
 * без запуска приложения.
 */

export type UiLang = 'en' | 'ru' | 'vi';

/** Порядок — тот же, что у языков обучения в concepts.ts. */
export const UI_LANGS: UiLang[] = ['en', 'ru', 'vi'];

export type StringKey =
  | 'start.sub'
  | 'start.learn'
  | 'start.play'
  | 'start.note'
  | 'start.unsupported'
  | 'start.insecure'
  | 'start.uiLang'
  | 'play.quit'
  | 'play.hint'
  | 'play.score'
  | 'listen.idle'
  | 'listen.starting'
  | 'listen.listening'
  | 'listen.blocked'
  | 'listen.error'
  | 'finish.title'
  | 'finish.lead'
  | 'finish.time'
  | 'finish.score'
  | 'finish.words'
  | 'finish.eyebrow'
  | 'finish.speak'
  | 'finish.again';

const EN: Record<StringKey, string> = {
  'start.sub': 'Objects fall. Say the word in time and the object goes down. Miss one and the round is over.',
  'start.learn': 'I am learning',
  'start.play': 'Play',
  'start.note': 'Needs a microphone and the internet: recognition runs on a server.',
  'start.unsupported': 'This browser cannot recognise speech. Open the game in Safari or in Chrome.',
  'start.insecure':
    'An https address is required: over http the browser gives neither the microphone nor recognition. localhost works on your own machine; from a phone you need a tunnel.',
  'start.uiLang': 'Interface language',
  'play.quit': 'Quit',
  'play.hint': 'Show the words: press and hold',
  'play.score': 'Score',
  'listen.idle': 'Microphone closed',
  'listen.starting': 'Opening the microphone…',
  'listen.listening': 'Listening…',
  'listen.blocked': 'No access to the microphone',
  'listen.error': 'Recognition unavailable',
  'finish.title': 'Down!',
  'finish.lead': 'One word got away. Listen to it below and take off again.',
  'finish.time': 'Time',
  'finish.score': 'Score',
  'finish.words': 'Words',
  'finish.eyebrow': 'The word that beat you',
  'finish.speak': 'Listen',
  'finish.again': 'Again',
};

const RU: Record<StringKey, string> = {
  'start.sub': 'Предметы падают. Успей назвать вслух — предмет сбит. Упустишь один — раунд окончен.',
  'start.learn': 'Учу язык',
  'start.play': 'Играть',
  'start.note': 'Нужен микрофон и интернет: распознавание работает на сервере.',
  'start.unsupported': 'Этот браузер не умеет распознавать речь. Откройте игру в Safari или в Chrome.',
  'start.insecure':
    'Нужен адрес по https: по http браузер не даёт ни микрофон, ни распознавание. На своей машине работает localhost, с телефона — только туннель.',
  'start.uiLang': 'Язык интерфейса',
  'play.quit': 'Выйти',
  'play.hint': 'Показать слова: нажать и держать',
  'play.score': 'Очки',
  'listen.idle': 'Микрофон закрыт',
  'listen.starting': 'Включаю микрофон…',
  'listen.listening': 'Слушаю…',
  'listen.blocked': 'Нет доступа к микрофону',
  'listen.error': 'Распознавание недоступно',
  'finish.title': 'Сбит!',
  'finish.lead': 'Одно слово от вас ускользнуло. Послушайте его ниже и взлетайте снова.',
  'finish.time': 'Время',
  'finish.score': 'Очки',
  'finish.words': 'Слова',
  'finish.eyebrow': 'Слово, которое вас подвело',
  'finish.speak': 'Послушать',
  'finish.again': 'Ещё раз',
};

const VI: Record<StringKey, string> = {
  'start.sub': 'Đồ vật rơi xuống. Gọi tên kịp lúc — đồ vật bị hạ. Bỏ lỡ một cái là hết lượt.',
  'start.learn': 'Tôi đang học',
  'start.play': 'Chơi',
  'start.note': 'Cần micrô và kết nối mạng: nhận dạng giọng nói chạy trên máy chủ.',
  'start.unsupported':
    'Trình duyệt này không nhận dạng được giọng nói. Hãy mở trò chơi trong Safari hoặc Chrome.',
  'start.insecure':
    'Cần địa chỉ https: qua http trình duyệt không cấp micrô lẫn nhận dạng giọng nói. Trên máy của bạn thì localhost vẫn chạy, còn từ điện thoại thì cần đường hầm.',
  'start.uiLang': 'Ngôn ngữ giao diện',
  'play.quit': 'Thoát',
  'play.hint': 'Hiện từ cần nói: nhấn và giữ',
  'play.score': 'Điểm',
  'listen.idle': 'Micrô đã tắt',
  'listen.starting': 'Đang bật micrô…',
  'listen.listening': 'Đang nghe…',
  'listen.blocked': 'Không truy cập được micrô',
  'listen.error': 'Không dùng được nhận dạng giọng nói',
  'finish.title': 'Trượt rồi!',
  'finish.lead': 'Một từ đã lọt lưới. Nghe lại bên dưới rồi cất cánh lần nữa.',
  'finish.time': 'Thời gian',
  'finish.score': 'Điểm',
  'finish.words': 'Từ',
  'finish.eyebrow': 'Từ đã đánh bại bạn',
  'finish.speak': 'Nghe',
  'finish.again': 'Chơi lại',
};

const STRINGS: Record<UiLang, Record<StringKey, string>> = { en: EN, ru: RU, vi: VI };

export function t(lang: UiLang, key: StringKey): string {
  return STRINGS[lang][key];
}

export function isUiLang(value: unknown): value is UiLang {
  return typeof value === 'string' && (UI_LANGS as string[]).includes(value);
}

/**
 * Язык интерфейса по настройкам браузера.
 *
 * Совпадение только по коду языка, страна не смотрится: `vi-VN` и `vi` — одно
 * и то же, а угадывать язык по стране бессмысленно. Английский остаётся
 * запасным вариантом: неверная догадка встречает человека непонятным экраном.
 */
export function detectUiLang(): UiLang {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of languages) {
    const code = tag?.toLowerCase().split('-')[0];
    if (isUiLang(code)) return code;
  }
  return 'en';
}

/**
 * Проставляет строки по разметке.
 *
 * `data-i18n` меняет текст, `data-i18n-aria` — подпись для экранного диктора.
 * Второе нужно там, где на кнопке одна иконка и текста нет вовсе.
 */
export function applyStrings(root: ParentNode, lang: UiLang): void {
  for (const node of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = node.dataset['i18n'] as StringKey;
    if (key in STRINGS[lang]) node.textContent = t(lang, key);
  }
  for (const node of root.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
    const key = node.dataset['i18nAria'] as StringKey;
    if (key in STRINGS[lang]) node.setAttribute('aria-label', t(lang, key));
  }
}
