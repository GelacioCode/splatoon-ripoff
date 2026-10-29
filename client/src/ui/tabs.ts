export interface Tab {
  id: string;
  label: string;
  content: HTMLElement;
}

/**
 * A row of tab buttons over one page at a time (the rest stay in the DOM, hidden, so their
 * state is kept). `onChange` runs when another tab is picked.
 */
export function createTabs(
  tabs: readonly Tab[],
  className: string,
  onChange?: (id: string) => void,
  start = tabs[0]?.id ?? '',
) {
  const element = document.createElement('div');
  element.className = `tabs ${className}`;
  const bar = document.createElement('div');
  bar.className = 'tab-bar';
  bar.setAttribute('role', 'tablist');
  const pages = document.createElement('div');
  pages.className = 'tab-pages';
  const buttons = new Map<string, HTMLButtonElement>();
  let current = '';

  const select = (id: string) => {
    if (id === current || !tabs.some((t) => t.id === id)) return;
    current = id;
    for (const tab of tabs) {
      const on = tab.id === id;
      tab.content.hidden = !on;
      const button = buttons.get(tab.id);
      button?.classList.toggle('active', on);
      button?.setAttribute('aria-selected', String(on));
    }
    onChange?.(id);
  };

  for (const tab of tabs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tab';
    button.setAttribute('role', 'tab');
    button.textContent = tab.label;
    button.addEventListener('click', () => select(tab.id));
    buttons.set(tab.id, button);
    bar.append(button);
    tab.content.classList.add('tab-page');
    pages.append(tab.content);
  }
  element.append(bar, pages);
  select(start);

  return {
    element,
    select,
    get current(): string {
      return current;
    },
  };
}
