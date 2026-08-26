/**
 * Всё движение приложения собрано здесь.
 *
 * Кривая одна на весь проект и продублирована из tokens.css: GSAP не умеет
 * читать CSS-переменные как ease, поэтому значение приходится держать в двух
 * местах. Расходиться им нельзя — иначе интерфейс начинает двигаться двумя
 * почерками сразу, и это видно, даже когда не получается объяснить, чем.
 */

import { gsap } from 'gsap';

export const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
export const EASE_POP = 'back.out(1.7)';

/** Уважение к prefers-reduced-motion решается один раз и в одном месте. */
export const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

gsap.defaults({ ease: EASE_OUT, duration: 0.45 });

/** Появление предмета: прилетает сверху и оседает. */
export function appear(node: HTMLElement): void {
  if (calm) return;
  gsap.from(node, { scale: 0.4, opacity: 0, duration: 0.4, ease: EASE_POP });
}

/**
 * Попадание. Предмет разлетается, а не исчезает: мгновенная пропажа читается
 * как сбой отрисовки, а не как результат действия игрока.
 *
 * Возвращает промис, потому что узел нельзя убрать из DOM до конца анимации.
 */
export function burst(node: HTMLElement): Promise<void> {
  if (calm) {
    node.remove();
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    gsap
      .timeline({
        onComplete: () => {
          node.remove();
          resolve();
        },
      })
      .to(node, { scale: 1.25, duration: 0.12, ease: EASE_POP })
      .to(node, { scale: 0, opacity: 0, rotate: 18, duration: 0.22, ease: 'power2.in' });
  });
}

/** Счёт подскакивает: без этого прибавка очков проходит незамеченной. */
export function bumpScore(node: HTMLElement): void {
  if (calm) return;
  gsap.fromTo(node, { scale: 1 }, { scale: 1.28, duration: 0.14, yoyo: true, repeat: 1, ease: EASE_POP });
}

/** Пилюля «Слушаю» тихо дышит, пока микрофон открыт. */
export function pulse(node: HTMLElement): gsap.core.Tween | null {
  if (calm) return null;
  return gsap.to(node, {
    opacity: 0.45,
    duration: 0.9,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
  });
}

/** Смена экрана. Уходящий гасится, приходящий приподнимается. */
export function swapScreens(from: HTMLElement, to: HTMLElement): void {
  to.hidden = false;
  if (calm) {
    from.hidden = true;
    return;
  }
  gsap.set(to, { opacity: 0, y: 16 });
  gsap
    .timeline()
    .to(from, { opacity: 0, duration: 0.2, onComplete: () => {
      from.hidden = true;
      gsap.set(from, { opacity: 1, y: 0 });
    } })
    .to(to, { opacity: 1, y: 0, duration: 0.5 });
}

/** Предметы на стартовом экране лениво покачиваются. */
export function floatIdle(nodes: HTMLElement[]): void {
  if (calm) return;
  nodes.forEach((node, i) => {
    gsap.to(node, {
      y: -10,
      duration: 1.6 + i * 0.25,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
      delay: i * 0.18,
    });
  });
}
