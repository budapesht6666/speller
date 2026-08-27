/**
 * Словарь игры.
 *
 * Единица словаря — понятие, а не слово. У понятия одна картинка и подписи на
 * разных языках. Смена языка обучения = ещё один столбец подписей; картинка,
 * идентификатор и категория остаются общими. Это и есть заложенная в задачу
 * возможность приехать в другую страну и учить местные слова.
 *
 * Подписи подобраны под наличие иконок, а не наоборот: бесплатный набор
 * Streamline — витрина, и слова, для которых нет однозначной картинки, в
 * словарь не попадают. Критерий отбора один: увидев картинку, человек называет
 * ровно это слово и никакое другое.
 *
 * Синонимы через `|` — то, что засчитывается наравне с основным словом. Нужны
 * там, где картинка честно допускает два названия (lift / elevator, bát / tô),
 * иначе игрок будет прав, а игра скажет, что он ошибся. Первое слово — то,
 * которое показывается в подсказке и озвучивается на экране проигрыша.
 *
 * Подпись может отсутствовать: понятие тогда просто не выпадает на этом языке.
 * Это лучше, чем держать сомнительный перевод ради полноты таблицы, — иначе
 * игра научит человека неверному слову, и он об этом не узнает.
 */

import { PROFILES, type MatchProfile } from '../core/matcher';

export type LangCode = 'en-US' | 'ru-RU' | 'vi-VN';

export interface LangInfo {
  code: LangCode;
  /** Самоназвание. Не переводится: язык всегда подписан на себе самом. */
  native: string;
  /** Правила сравнения услышанного (см. core/matcher). */
  profile: MatchProfile;
}

/**
 * Языки обучения.
 *
 * Профиль сравнения — не деталь реализации, а часть описания языка: Double
 * Metaphone построен на английской фонетике, и на кириллице или вьетнамском он
 * не «работает хуже», а не значит ничего.
 */
export const LANGS: Record<LangCode, LangInfo> = {
  'en-US': { code: 'en-US', native: 'English', profile: PROFILES.en },
  'ru-RU': { code: 'ru-RU', native: 'Русский', profile: PROFILES.ru },
  'vi-VN': { code: 'vi-VN', native: 'Tiếng Việt', profile: PROFILES.vi },
};

export const LANG_CODES = Object.keys(LANGS) as LangCode[];

export function isLangCode(value: unknown): value is LangCode {
  return typeof value === 'string' && value in LANGS;
}

export type Category = 'food' | 'travel' | 'nature' | 'things' | 'leisure' | 'body' | 'places';

export interface Label {
  /** Основное слово — его же показываем в подсказке и озвучиваем. */
  word: string;
  /** Синонимы, которые засчитываются наравне с основным. */
  alt?: string[];
}

export interface Concept {
  id: string;
  /** Имя файла в /assets/objects. */
  asset: string;
  category: Category;
  labels: Partial<Record<LangCode, Label>>;
}

/**
 * Строка таблицы: id, файл, категория и три подписи.
 *
 * Таблица, а не объекты с ключами, ради одного: подписи трёх языков стоят
 * рядом в одной строке, и пропуск виден глазом. В столбце из объектов по
 * четыре строки каждый его пришлось бы искать.
 */
type Row = [id: string, asset: string, category: Category, en: string, ru: string, vi: string];

const ROWS: Row[] = [
  // ── Еда и напитки ────────────────────────────────────────────────────────
  ['burger', 'burger.svg', 'food', 'burger|hamburger', 'бургер|гамбургер', 'hamburger|bánh mì kẹp thịt'],
  ['cheese', 'cheese.svg', 'food', 'cheese', 'сыр', 'phô mai'],
  ['cherries', 'cherries.svg', 'food', 'cherries|cherry', 'вишня|черешня', 'quả anh đào|anh đào'],
  ['strawberry', 'strawberry.svg', 'food', 'strawberry', 'клубника', 'dâu tây'],
  ['watermelon', 'water-melon.svg', 'food', 'watermelon', 'арбуз', 'dưa hấu'],
  ['cake', 'cake-slice.svg', 'food', 'cake', 'торт|пирожное', 'bánh ngọt|bánh kem'],
  ['toast', 'toast.svg', 'food', 'toast|bread', 'хлеб|тост', 'bánh mì nướng|bánh mì'],
  ['wine', 'wine.svg', 'food', 'wine', 'вино', 'rượu vang'],
  ['beer', 'beer-pitch.svg', 'food', 'beer', 'пиво', 'bia'],
  ['icecream', 'ice-cream-2.svg', 'food', 'ice cream', 'мороженое', 'kem'],
  ['coffee', 'coffee-mug.svg', 'food', 'coffee|mug|cup', 'кофе|кружка', 'cà phê'],
  ['egg', 'fried-egg-breakfast.svg', 'food', 'egg', 'яйцо', 'trứng'],
  ['bowl', 'bowl-chop-stick.svg', 'food', 'bowl', 'миска', 'bát|tô'],
  ['plate', 'fork-plate.svg', 'food', 'plate', 'тарелка', 'đĩa|dĩa'],
  ['fridge', 'refrigerator.svg', 'food', 'fridge|refrigerator', 'холодильник', 'tủ lạnh'],
  ['fish', 'allergens-fish.svg', 'food', 'fish', 'рыба', 'cá'],
  ['meat', 'pork-meat.svg', 'food', 'meat|pork', 'мясо', 'thịt'],

  // ── Путешествие ──────────────────────────────────────────────────────────
  ['beach', 'beach.svg', 'travel', 'beach', 'пляж', 'bãi biển'],
  ['bicycle', 'bicycle-bike.svg', 'travel', 'bicycle|bike', 'велосипед', 'xe đạp'],
  ['bus', 'bus.svg', 'travel', 'bus', 'автобус', 'xe buýt'],
  ['train', 'high-speed-train-side.svg', 'travel', 'train', 'поезд', 'tàu hỏa|xe lửa'],
  ['ship', 'sail-ship.svg', 'travel', 'ship|boat', 'корабль|лодка', 'tàu thủy|thuyền'],
  ['airplane', 'travel-airport-landing.svg', 'travel', 'airplane|plane', 'самолёт', 'máy bay'],
  ['suitcase', 'suitcase-rolling.svg', 'travel', 'suitcase|luggage', 'чемодан', 'va li'],
  ['map', 'map-fold.svg', 'travel', 'map', 'карта', 'bản đồ'],
  ['bed', 'hotel-bed-5.svg', 'travel', 'bed', 'кровать', 'giường'],
  ['ticket', 'ticket-2.svg', 'travel', 'ticket', 'билет', 'vé'],
  ['flag', 'rectangle-flag.svg', 'travel', 'flag', 'флаг', 'lá cờ|cờ'],
  ['airballoon', 'hot-air-balloon.svg', 'travel', 'hot air balloon', 'воздушный шар', 'khinh khí cầu'],
  ['parachute', 'parachute-drop.svg', 'travel', 'parachute', 'парашют', 'dù|nhảy dù'],

  // ── Природа ──────────────────────────────────────────────────────────────
  ['dog', 'dog-1.svg', 'nature', 'dog', 'собака', 'con chó|chó'],
  ['tree', 'tree-1.svg', 'nature', 'tree', 'дерево', 'cây'],
  ['flower', 'potted-flower.svg', 'nature', 'flower', 'цветок', 'hoa'],
  ['leaf', 'leaf-protect.svg', 'nature', 'leaf', 'лист', 'lá cây|lá'],
  ['log', 'log.svg', 'nature', 'log|wood', 'бревно', 'khúc gỗ|gỗ'],
  ['sunset', 'sunset.svg', 'nature', 'sunset|sun', 'закат|солнце', 'hoàng hôn'],
  ['earth', 'earth-2.svg', 'nature', 'earth|planet|globe', 'земля|планета', 'trái đất'],
  ['galaxy', 'galaxy-2.svg', 'nature', 'galaxy', 'галактика', 'thiên hà'],

  // ── Предметы ─────────────────────────────────────────────────────────────
  ['ball', 'ball.svg', 'things', 'ball', 'мяч', 'quả bóng|bóng'],
  ['balloon', 'balloon.svg', 'things', 'balloon', 'шарик', 'bóng bay'],
  ['bag', 'bag.svg', 'things', 'bag', 'сумка', 'cái túi|túi'],
  ['gift', 'gift.svg', 'things', 'gift|present', 'подарок', 'món quà|quà'],
  ['sofa', 'sofa.svg', 'things', 'sofa|couch', 'диван', 'ghế sofa|sofa'],
  ['stool', 'stool.svg', 'things', 'stool|chair', 'табурет|стул', 'ghế đẩu|ghế'],
  ['wallet', 'wallet.svg', 'things', 'wallet', 'кошелёк', 'ví'],
  ['basket', 'shopping-basket-1.svg', 'things', 'basket', 'корзина', 'giỏ'],
  ['box', 'shipping-box-1.svg', 'things', 'box', 'коробка', 'cái hộp|hộp'],
  ['diamond', 'diamond-2.svg', 'things', 'diamond', 'алмаз|бриллиант', 'kim cương'],
  ['gold', 'gold.svg', 'things', 'gold', 'золото', 'vàng'],
  ['coin', 'dollar-coin.svg', 'things', 'coin', 'монета', 'đồng xu'],
  ['card', 'credit-card-5.svg', 'things', 'card', 'карточка', 'thẻ|thẻ tín dụng'],
  ['lipstick', 'lipstick.svg', 'things', 'lipstick', 'помада', 'son môi'],
  ['calculator', 'calculator-1.svg', 'things', 'calculator', 'калькулятор', 'máy tính'],
  ['newspaper', 'news-paper.svg', 'things', 'newspaper', 'газета', 'tờ báo|báo'],
  ['desk', 'workspace-desk.svg', 'things', 'desk', 'стол', 'bàn làm việc|bàn'],
  ['bell', 'bell.svg', 'things', 'bell', 'колокольчик', 'chuông'],
  ['telescope', 'telescope.svg', 'things', 'telescope', 'телескоп', 'kính thiên văn'],
  ['microscope', 'microscope-observation-sciene.svg', 'things', 'microscope', 'микроскоп', 'kính hiển vi'],
  ['chest', 'treasure-chest.svg', 'things', 'chest|treasure', 'сундук', 'rương|hòm'],
  ['safe', 'safe-vault.svg', 'things', 'safe', 'сейф', 'két sắt'],
  ['piggybank', 'piggy-bank.svg', 'things', 'piggy bank', 'копилка', 'heo đất'],
  ['bin', 'recycle-bin-4.svg', 'things', 'bin|trash can', 'мусорка|мусорное ведро', 'thùng rác'],
  ['earphones', 'earpods.svg', 'things', 'earphones|headphones', 'наушники', 'tai nghe'],
  ['pill', 'tablet-capsule.svg', 'things', 'pill', 'таблетка', 'viên thuốc|thuốc'],
  ['testtube', 'test-tube.svg', 'things', 'test tube', 'пробирка', 'ống nghiệm'],
  ['atom', 'atom.svg', 'things', 'atom', 'атом', 'nguyên tử'],
  ['virus', 'virus-antivirus.svg', 'things', 'virus', 'вирус', 'vi rút'],
  ['painting', 'painting-board.svg', 'things', 'painting', 'картина', 'bức tranh|tranh'],
  ['trafficlight', 'traffic-light.svg', 'things', 'traffic light', 'светофор', 'đèn giao thông'],
  ['moustache', 'moustache.svg', 'things', 'moustache|mustache', 'усы', 'ria mép'],

  // ── Досуг ────────────────────────────────────────────────────────────────
  ['camera', 'camera-video.svg', 'leisure', 'camera', 'камера', 'máy quay|máy ảnh'],
  ['dice', 'dices-entertainment-gaming-dices.svg', 'leisure', 'dice', 'кубик|кости', 'xúc xắc'],
  ['speaker', 'speaker-2.svg', 'leisure', 'speaker', 'колонка', 'loa'],
  ['megaphone', 'announcement-megaphone.svg', 'leisure', 'megaphone', 'мегафон', 'loa phóng thanh'],
  ['mask', 'theater-mask.svg', 'leisure', 'mask', 'маска', 'mặt nạ'],
  ['chess', 'chess-pawn.svg', 'leisure', 'chess|pawn', 'шахматы', 'cờ vua'],
  ['music', 'music-note-2.svg', 'leisure', 'music', 'музыка', 'âm nhạc|nhạc'],
  ['gamepad', 'nintendo-xbox-controller-1.svg', 'leisure', 'gamepad|controller', 'джойстик|геймпад', 'tay cầm chơi game|tay cầm'],

  // ── Тело ─────────────────────────────────────────────────────────────────
  ['eye', 'eye-optic.svg', 'body', 'eye', 'глаз', 'mắt'],
  ['ear', 'ear-speciality.svg', 'body', 'ear', 'ухо', 'tai'],

  // ── Места ────────────────────────────────────────────────────────────────
  ['park', 'park.svg', 'places', 'park', 'парк', 'công viên'],
  ['hotel', 'hotel-five-star.svg', 'places', 'hotel', 'отель|гостиница', 'khách sạn'],
  ['store', 'store-1.svg', 'places', 'store|shop', 'магазин', 'cửa hàng'],
  ['mall', 'mall.svg', 'places', 'mall', 'торговый центр', 'trung tâm thương mại'],
  ['office', 'building-office.svg', 'places', 'office', 'офис', 'văn phòng'],
  ['factory', 'factory-plant.svg', 'places', 'factory', 'завод|фабрика', 'nhà máy'],
  ['pharmacy', 'pharmacy.svg', 'places', 'pharmacy', 'аптека', 'nhà thuốc|hiệu thuốc'],
  ['warehouse', 'warehouse-1.svg', 'places', 'warehouse', 'склад', 'nhà kho|kho'],
  ['pool', 'pool-ladder.svg', 'places', 'pool', 'бассейн', 'hồ bơi|bể bơi'],
  ['hospital', 'hospital-sign-square.svg', 'places', 'hospital', 'больница', 'bệnh viện'],
  ['toilet', 'toilet-sign-man.svg', 'places', 'toilet|restroom', 'туалет', 'nhà vệ sinh'],
  ['elevator', 'lift.svg', 'places', 'elevator|lift', 'лифт', 'thang máy'],
  ['escalator', 'escalator-up.svg', 'places', 'escalator', 'эскалатор', 'thang cuốn'],
];

/** `слово|синоним|синоним` → Label. Пустая строка означает «подписи нет». */
function label(spec: string): Label | undefined {
  const [word, ...alt] = spec
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!word) return undefined;
  return alt.length ? { word, alt } : { word };
}

export const CONCEPTS: Concept[] = ROWS.map(([id, asset, category, en, ru, vi]) => {
  const labels: Partial<Record<LangCode, Label>> = {};
  const enLabel = label(en);
  const ruLabel = label(ru);
  const viLabel = label(vi);
  if (enLabel) labels['en-US'] = enLabel;
  if (ruLabel) labels['ru-RU'] = ruLabel;
  if (viLabel) labels['vi-VN'] = viLabel;
  return { id, asset, category, labels };
});

/** Понятия, у которых есть подпись на этом языке. Остальные не выпадают. */
export function conceptsFor(lang: LangCode): Concept[] {
  return CONCEPTS.filter((c) => c.labels[lang]);
}

/** Все слова, которые засчитываются для понятия на данном языке. */
export function acceptedWords(concept: Concept, lang: LangCode): string[] {
  const item = concept.labels[lang];
  if (!item) return [];
  return [item.word, ...(item.alt ?? [])];
}

/** Подпись, которую показываем и озвучиваем. */
export function displayWord(concept: Concept, lang: LangCode): string {
  return concept.labels[lang]?.word ?? '';
}
