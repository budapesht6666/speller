/**
 * Стенд дизайн-системы.
 *
 * Читает tokens.css как текст и строит образцы по нему, а не по заранее
 * составленному списку. Из этого следует главное свойство стенда: он не может
 * разъехаться с системой. Переименовали токен — образец исчез, добавили —
 * появился сам, и никого не нужно об этом уведомлять.
 */

import '@fontsource-variable/nunito';
import tokensSource from './styles/tokens.css?raw';
import './styles/base.css';
import './styles/design-system.css';

interface Token {
  name: string;
  value: string;
  comment?: string;
}

interface Section {
  title: string;
  intro?: string;
  tokens: Token[];
}

/** Кусок :root целиком — дальше режем только его, чтобы не поймать медиазапрос. */
function rootBlock(css: string): string {
  const start = css.indexOf(':root');
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  return '';
}

/**
 * Разбирает :root на разделы и токены. Заголовок раздела — комментарий вида
 * `── НАЗВАНИЕ ──`, всё остальное в том же комментарии становится пояснением
 * под заголовком: обоснования уже написаны в файле, дублировать их незачем.
 */
function parse(css: string): Section[] {
  const body = rootBlock(css);
  const sections: Section[] = [];
  let current: Section = { title: 'Прочее', tokens: [] };

  // Комментарии и объявления в порядке появления.
  const re = /\/\*([\s\S]*?)\*\/|(--[\w-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  let pendingComment: string | undefined;

  while ((m = re.exec(body))) {
    if (m[1] !== undefined) {
      const text = m[1];
      const header = /──\s*(.+?)\s*──/.exec(text)?.[1];
      if (header) {
        if (current.tokens.length) sections.push(current);
        const intro = text
          .replace(/──.*?──/, '')
          .split('\n')
          .map((l) => l.replace(/^\s*/, '').trim())
          .filter(Boolean)
          .join(' ')
          .trim();
        current = intro ? { title: header, intro, tokens: [] } : { title: header, tokens: [] };
      } else {
        // Короткий хвостовой комментарий — пояснение к следующему токену.
        const oneLine = text.trim();
        if (oneLine && !oneLine.includes('\n')) pendingComment = oneLine;
      }
      continue;
    }
    const name = m[2];
    const raw = m[3];
    if (name && raw) {
      const value = raw.trim().replace(/\s+/g, ' ');
      current.tokens.push(pendingComment ? { name, value, comment: pendingComment } : { name, value });
    }
    pendingComment = undefined;
  }
  if (current.tokens.length) sections.push(current);
  return sections;
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** По имени токена решаем, чем его показывать. Имена и есть классификация. */
function sampleFor(token: Token): HTMLElement {
  const { name } = token;
  const v = `var(${name})`;
  const box = el('div', 'ds-sample');

  if (name.startsWith('--sky-gradient') || name === '--shadow-cta' || name.startsWith('--shadow-')) {
    const chip = el('div', 'ds-chip');
    if (name.startsWith('--shadow')) {
      chip.style.background = 'var(--c-paper)';
      chip.style.boxShadow = v;
    } else {
      chip.style.background = v;
    }
    box.append(chip);
    return box;
  }

  if (name.startsWith('--c-')) {
    const chip = el('div', 'ds-chip ds-chip--color');
    chip.style.background = v;
    box.append(chip);
    return box;
  }

  if (name.startsWith('--space-') || name === '--gutter') {
    const bar = el('div', 'ds-bar');
    bar.style.width = v;
    box.append(bar);
    return box;
  }

  if (name.startsWith('--radius-')) {
    const chip = el('div', 'ds-chip ds-chip--radius');
    chip.style.borderRadius = v;
    box.append(chip);
    return box;
  }

  if (name.startsWith('--text-')) {
    const t = el('div', 'ds-type', 'Ball');
    t.style.fontSize = v;
    box.append(t);
    return box;
  }

  if (name.startsWith('--weight-')) {
    const t = el('div', 'ds-type', 'Ball 60');
    t.style.fontWeight = v;
    box.append(t);
    return box;
  }

  if (name.startsWith('--duration-') || name.startsWith('--ease-')) {
    const track = el('div', 'ds-track');
    const dot = el('div', 'ds-dot');
    if (name.startsWith('--duration-')) {
      dot.style.transitionDuration = v;
      dot.style.transitionTimingFunction = 'var(--ease-out)';
    } else {
      dot.style.transitionDuration = 'var(--duration-slow)';
      dot.style.transitionTimingFunction = v;
    }
    track.append(dot);
    track.addEventListener('click', () => track.classList.toggle('is-end'));
    box.append(track);
    const hint = el('span', 'ds-hint', 'нажми');
    box.append(hint);
    return box;
  }

  box.append(el('code', 'ds-raw', token.value));
  return box;
}

function render(): void {
  const root = document.getElementById('ds-root')!;
  const sections = parse(tokensSource);

  for (const section of sections) {
    const wrap = el('section', 'ds-section');
    wrap.append(el('h2', 'ds-section__title', section.title));
    if (section.intro) wrap.append(el('p', 'ds-section__intro', section.intro));

    const table = el('div', 'ds-table');
    for (const token of section.tokens) {
      const row = el('div', 'ds-row');
      row.append(sampleFor(token));

      const meta = el('div', 'ds-meta');
      meta.append(el('code', 'ds-name', token.name));
      meta.append(el('code', 'ds-value', token.value));
      if (token.comment) meta.append(el('span', 'ds-comment', token.comment));
      row.append(meta);

      table.append(row);
    }
    wrap.append(table);
    root.append(wrap);
  }

  const count = sections.reduce((n, s) => n + s.tokens.length, 0);
  document.getElementById('ds-count')!.textContent = `${count} токенов в ${sections.length} разделах`;
}

render();
