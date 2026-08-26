/**
 * Словарь игры.
 *
 * Единица словаря — понятие, а не слово. У понятия одна картинка и подписи на
 * разных языках. Смена языка обучения = добавление ключа в labels; картинка,
 * идентификатор и категория остаются общими. Это и есть заложенная в задачу
 * возможность приехать в другую страну и учить местные слова.
 *
 * Подписи подобраны под наличие иконок, а не наоборот: бесплатный набор
 * Streamline — витрина, и слова, для которых нет однозначной картинки, в
 * словарь не попадают. Критерий отбора один: увидев картинку, человек называет
 * ровно это слово и никакое другое.
 *
 * Поле alt — синонимы, которые тоже засчитываются. Нужно там, где картинка
 * честно допускает два названия (lift / elevator), иначе игрок будет прав,
 * а игра скажет, что он ошибся.
 */

export type LangCode = 'en-US';

export type Category =
  | 'food'
  | 'travel'
  | 'nature'
  | 'things'
  | 'leisure'
  | 'body'
  | 'places';

export interface Label {
  /** Основное слово — его же показываем на экране проигрыша и озвучиваем. */
  word: string;
  /** Синонимы, которые засчитываются наравне с основным. */
  alt?: string[];
}

export interface Concept {
  id: string;
  /** Имя файла в /assets/objects. */
  asset: string;
  category: Category;
  labels: Record<LangCode, Label>;
}

const en = (word: string, alt?: string[]): Record<LangCode, Label> => ({
  'en-US': alt ? { word, alt } : { word },
});

export const CONCEPTS: Concept[] = [
  // ── Еда и напитки ────────────────────────────────────────────────────────
  { id: 'burger', asset: 'burger.svg', category: 'food', labels: en('burger', ['hamburger']) },
  { id: 'cheese', asset: 'cheese.svg', category: 'food', labels: en('cheese') },
  { id: 'cherries', asset: 'cherries.svg', category: 'food', labels: en('cherries', ['cherry']) },
  { id: 'strawberry', asset: 'strawberry.svg', category: 'food', labels: en('strawberry') },
  { id: 'watermelon', asset: 'water-melon.svg', category: 'food', labels: en('watermelon') },
  { id: 'cake', asset: 'cake-slice.svg', category: 'food', labels: en('cake') },
  { id: 'toast', asset: 'toast.svg', category: 'food', labels: en('toast', ['bread']) },
  { id: 'wine', asset: 'wine.svg', category: 'food', labels: en('wine') },
  { id: 'beer', asset: 'beer-pitch.svg', category: 'food', labels: en('beer') },
  { id: 'icecream', asset: 'ice-cream-2.svg', category: 'food', labels: en('ice cream') },
  { id: 'coffee', asset: 'coffee-mug.svg', category: 'food', labels: en('coffee', ['mug', 'cup']) },
  { id: 'egg', asset: 'fried-egg-breakfast.svg', category: 'food', labels: en('egg') },
  { id: 'bowl', asset: 'bowl-chop-stick.svg', category: 'food', labels: en('bowl') },
  { id: 'plate', asset: 'fork-plate.svg', category: 'food', labels: en('plate') },
  { id: 'fridge', asset: 'refrigerator.svg', category: 'food', labels: en('fridge', ['refrigerator']) },

  // ── Путешествие ──────────────────────────────────────────────────────────
  { id: 'beach', asset: 'beach.svg', category: 'travel', labels: en('beach') },
  { id: 'bicycle', asset: 'bicycle-bike.svg', category: 'travel', labels: en('bicycle', ['bike']) },
  { id: 'bus', asset: 'bus.svg', category: 'travel', labels: en('bus') },
  { id: 'train', asset: 'high-speed-train-side.svg', category: 'travel', labels: en('train') },
  { id: 'ship', asset: 'sail-ship.svg', category: 'travel', labels: en('ship', ['boat']) },
  { id: 'suitcase', asset: 'suitcase-rolling.svg', category: 'travel', labels: en('suitcase', ['luggage']) },
  { id: 'map', asset: 'map-fold.svg', category: 'travel', labels: en('map') },
  { id: 'bed', asset: 'hotel-bed-5.svg', category: 'travel', labels: en('bed') },
  { id: 'ticket', asset: 'ticket-2.svg', category: 'travel', labels: en('ticket') },
  { id: 'flag', asset: 'rectangle-flag.svg', category: 'travel', labels: en('flag') },
  { id: 'balloon', asset: 'hot-air-balloon.svg', category: 'travel', labels: en('balloon') },

  // ── Природа ──────────────────────────────────────────────────────────────
  { id: 'dog', asset: 'dog-1.svg', category: 'nature', labels: en('dog') },
  { id: 'tree', asset: 'tree-1.svg', category: 'nature', labels: en('tree') },
  { id: 'flower', asset: 'potted-flower.svg', category: 'nature', labels: en('flower') },
  { id: 'leaf', asset: 'leaf-protect.svg', category: 'nature', labels: en('leaf') },
  { id: 'log', asset: 'log.svg', category: 'nature', labels: en('log', ['wood']) },
  { id: 'sunset', asset: 'sunset.svg', category: 'nature', labels: en('sunset', ['sun']) },
  { id: 'earth', asset: 'earth-2.svg', category: 'nature', labels: en('earth', ['planet', 'globe']) },
  { id: 'galaxy', asset: 'galaxy-2.svg', category: 'nature', labels: en('galaxy') },

  // ── Предметы ─────────────────────────────────────────────────────────────
  { id: 'ball', asset: 'ball.svg', category: 'things', labels: en('ball') },
  { id: 'bag', asset: 'bag.svg', category: 'things', labels: en('bag') },
  { id: 'gift', asset: 'gift.svg', category: 'things', labels: en('gift', ['present']) },
  { id: 'sofa', asset: 'sofa.svg', category: 'things', labels: en('sofa', ['couch']) },
  { id: 'stool', asset: 'stool.svg', category: 'things', labels: en('stool', ['chair']) },
  { id: 'wallet', asset: 'wallet.svg', category: 'things', labels: en('wallet') },
  { id: 'basket', asset: 'shopping-basket-1.svg', category: 'things', labels: en('basket') },
  { id: 'box', asset: 'shipping-box-1.svg', category: 'things', labels: en('box') },
  { id: 'diamond', asset: 'diamond-2.svg', category: 'things', labels: en('diamond') },
  { id: 'gold', asset: 'gold.svg', category: 'things', labels: en('gold') },
  { id: 'coin', asset: 'dollar-coin.svg', category: 'things', labels: en('coin') },
  { id: 'card', asset: 'credit-card-5.svg', category: 'things', labels: en('card') },
  { id: 'lipstick', asset: 'lipstick.svg', category: 'things', labels: en('lipstick') },
  { id: 'calculator', asset: 'calculator-1.svg', category: 'things', labels: en('calculator') },
  { id: 'newspaper', asset: 'news-paper.svg', category: 'things', labels: en('newspaper') },
  { id: 'desk', asset: 'workspace-desk.svg', category: 'things', labels: en('desk') },
  { id: 'bell', asset: 'bell.svg', category: 'things', labels: en('bell') },
  { id: 'telescope', asset: 'telescope.svg', category: 'things', labels: en('telescope') },
  { id: 'microscope', asset: 'microscope-observation-sciene.svg', category: 'things', labels: en('microscope') },
  { id: 'chest', asset: 'treasure-chest.svg', category: 'things', labels: en('chest', ['treasure']) },

  // ── Досуг ────────────────────────────────────────────────────────────────
  { id: 'camera', asset: 'camera-video.svg', category: 'leisure', labels: en('camera') },
  { id: 'dice', asset: 'dices-entertainment-gaming-dices.svg', category: 'leisure', labels: en('dice') },
  { id: 'speaker', asset: 'speaker-2.svg', category: 'leisure', labels: en('speaker') },
  { id: 'mask', asset: 'theater-mask.svg', category: 'leisure', labels: en('mask') },
  { id: 'chess', asset: 'chess-pawn.svg', category: 'leisure', labels: en('chess', ['pawn']) },

  // ── Тело ─────────────────────────────────────────────────────────────────
  { id: 'eye', asset: 'eye-optic.svg', category: 'body', labels: en('eye') },
  { id: 'ear', asset: 'ear-speciality.svg', category: 'body', labels: en('ear') },

  // ── Места ────────────────────────────────────────────────────────────────
  { id: 'park', asset: 'park.svg', category: 'places', labels: en('park') },
  { id: 'hotel', asset: 'hotel-five-star.svg', category: 'places', labels: en('hotel') },
  { id: 'store', asset: 'store-1.svg', category: 'places', labels: en('store', ['shop']) },
  { id: 'mall', asset: 'mall.svg', category: 'places', labels: en('mall') },
  { id: 'office', asset: 'building-office.svg', category: 'places', labels: en('office') },
  { id: 'factory', asset: 'factory-plant.svg', category: 'places', labels: en('factory') },
  { id: 'pharmacy', asset: 'pharmacy.svg', category: 'places', labels: en('pharmacy') },
  { id: 'warehouse', asset: 'warehouse-1.svg', category: 'places', labels: en('warehouse') },
  { id: 'pool', asset: 'pool-ladder.svg', category: 'places', labels: en('pool') },
];

/** Все слова, которые засчитываются для понятия на данном языке. */
export function acceptedWords(concept: Concept, lang: LangCode): string[] {
  const label = concept.labels[lang];
  return [label.word, ...(label.alt ?? [])];
}

/** Подпись, которую показываем и озвучиваем. */
export function displayWord(concept: Concept, lang: LangCode): string {
  return concept.labels[lang].word;
}
