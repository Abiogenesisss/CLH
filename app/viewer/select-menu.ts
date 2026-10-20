// Keep the select as the value/change contract; only its presentation is replaced.
export function enhanceSelect(select: HTMLSelectElement) {
  const host = document.createElement('div'), trigger = document.createElement('button');
  const label = document.createElement('span'), menu = document.createElement('div');
  host.className = 'select-menu'; trigger.className = 'select-trigger'; trigger.type = 'button';
  trigger.id = select.id + '-trigger'; trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-label', select.getAttribute('aria-label') || '选择');
  trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
  menu.id = select.id + '-options'; menu.className = 'select-options'; menu.hidden = true;
  menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', trigger.getAttribute('aria-label'));
  trigger.setAttribute('aria-controls', menu.id); label.className = 'select-value';
  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  arrow.classList.add('shell-icon'); arrow.setAttribute('aria-hidden', 'true');
  use.setAttribute('href', '#vault-icon-chevron'); arrow.append(use); trigger.append(label, arrow);
  select.before(host); host.append(select, trigger, menu); select.hidden = true;
  let expanded = false, active = -1, closing: ReturnType<typeof setTimeout>, query = '', typedAt = 0;

  function options() { return [...select.options]; }
  function highlight(index: number, scroll = false) {
    active = index;
    [...menu.children].forEach((node, i) => node.classList.toggle('is-active', i === index));
    const item = menu.children[index] as HTMLElement;
    if (expanded && item) {
      trigger.setAttribute('aria-activedescendant', item.id);
      if (scroll) item.scrollIntoView({ block: 'nearest' });
    } else trigger.removeAttribute('aria-activedescendant');
  }
  function position() {
    const rect = trigger.getBoundingClientRect(), below = window.innerHeight - rect.bottom - 12, above = rect.top - 12;
    const upwards = below < Math.min(menu.scrollHeight, 280) && above > below;
    host.dataset.side = upwards ? 'top' : 'bottom';
    menu.style.maxHeight = Math.max(0, Math.min(280, upwards ? above : below)) + 'px';
  }
  function close(immediate = false) {
    if (menu.hidden || (!expanded && !immediate)) return;
    expanded = false; query = ''; host.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false'); trigger.removeAttribute('aria-activedescendant');
    // The closing surface is visual only; it must not intercept clicks or be announced.
    menu.setAttribute('aria-hidden', 'true'); menu.inert = true; clearTimeout(closing);
    if (immediate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) menu.hidden = true;
    else closing = setTimeout(() => { menu.hidden = true; }, 140);
  }
  function sync() {
    const rows = options(); label.textContent = rows[select.selectedIndex]?.textContent || '请选择';
    trigger.disabled = select.disabled || !rows.some(option => !option.disabled);
    menu.replaceChildren(...rows.map((option, index) => {
      const item = document.createElement('div'); item.id = select.id + '-option-' + index;
      item.className = 'select-option'; item.setAttribute('role', 'option'); item.dataset.index = String(index);
      item.setAttribute('aria-selected', String(option.selected)); item.setAttribute('aria-disabled', String(option.disabled));
      const text = document.createElement('span'); text.textContent = option.textContent;
      const check = document.createElement('span'); check.className = 'select-check'; check.textContent = '✓'; check.setAttribute('aria-hidden', 'true');
      item.append(text, check); return item;
    }));
    highlight(select.selectedIndex);
    if (expanded) {
      if (trigger.disabled || host.parentElement?.closest('[hidden]')) close(true);
      else { position(); highlight(active, true); }
    }
  }
  function open() {
    if (trigger.disabled) return;
    // Opening a different menu also dismisses the previous one for keyboard users.
    document.dispatchEvent(new CustomEvent('vault-select-open', { detail: select.id }));
    clearTimeout(closing); sync(); expanded = true; menu.hidden = false; menu.inert = false;
    menu.removeAttribute('aria-hidden'); position();
    // Resolve the closed state once so repeated openings animate consistently.
    void menu.offsetHeight; host.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true'); highlight(select.selectedIndex, true);
  }
  function choose(index: number) {
    const option = select.options[index]; if (!option || option.disabled) return;
    const changed = select.selectedIndex !== index; select.selectedIndex = index;
    close(); trigger.focus({ preventScroll: true });
    if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  trigger.addEventListener('click', () => expanded ? close() : open());
  trigger.addEventListener('keydown', event => {
    if (event.isComposing || event.ctrlKey || event.metaKey) return;
    const rows = options(), enabled = rows.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
    if (!enabled.length) return;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!expanded) { open(); if (event.key === 'ArrowDown' || event.key === 'ArrowUp') return; }
      const at = enabled.indexOf(active);
      const next = event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1)
        : enabled[Math.max(0, Math.min(enabled.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))];
      highlight(next, true);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); if (expanded) choose(active); else open();
    } else if (event.key === 'Escape' && expanded) {
      event.preventDefault(); event.stopPropagation(); close();
    } else if (event.key === 'Tab') close();
    else if (event.key.length === 1 && !event.altKey) {
      if (!expanded) open();
      const now = Date.now(); query = (now - typedAt > 700 ? '' : query) + event.key.toLocaleLowerCase(); typedAt = now;
      const repeated = [...query].every(char => char === query[0]), prefix = repeated ? query[0] : query;
      const start = repeated ? active + 1 : active;
      const matches = [...enabled.filter(index => index >= start), ...enabled.filter(index => index < start)];
      const next = matches.find(index => rows[index].textContent.trim().toLocaleLowerCase().startsWith(prefix));
      if (next != null) { event.preventDefault(); highlight(next, true); }
    }
  });
  menu.addEventListener('pointerdown', event => event.preventDefault());
  menu.addEventListener('pointermove', event => {
    const item = (event.target as Element).closest<HTMLElement>('[data-index]');
    if (expanded && item && item.getAttribute('aria-disabled') !== 'true') highlight(Number(item.dataset.index));
  });
  menu.addEventListener('click', event => {
    const item = (event.target as Element).closest<HTMLElement>('[data-index]');
    if (expanded && item) choose(Number(item.dataset.index));
  });
  host.addEventListener('focusout', event => { if (!host.contains(event.relatedTarget as Node)) close(); });
  document.addEventListener('pointerdown', event => { if (expanded && !host.contains(event.target as Node)) close(); });
  document.addEventListener('vault-select-open', (event: CustomEvent) => { if (event.detail !== select.id) close(true); });
  window.addEventListener('resize', () => { if (expanded) position(); });
  document.addEventListener('scroll', event => { if (expanded && !menu.contains(event.target as Node)) position(); }, true);
  select.addEventListener('change', sync); sync();
  return { sync, close };
}
