const STORAGE_KEY = 'vault-theme-v1';

function applyTheme(value: string) {
  const theme = value === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]').content = theme;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]').content = theme === 'light' ? '#ffffff' : '#000000';
  return theme;
}

// Restore the preference in <head>, before the stylesheet can paint.
let storedTheme: string;
try { storedTheme = localStorage.getItem(STORAGE_KEY); } catch {}
applyTheme(storedTheme);

export function initializeThemeToggle(button: HTMLButtonElement) {
  function updateButton() {
    const light = document.documentElement.dataset.theme === 'light';
    const label = light ? '切换到深色主题' : '切换到浅色主题';
    button.setAttribute('aria-label', label); button.title = label;
    button.querySelector('use').setAttribute('href', '#vault-icon-' + (light ? 'moon' : 'sun'));
  }
  updateButton();
  button.addEventListener('click', () => {
    const theme = applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
    updateButton();
    try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
  });
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    applyTheme(event.newValue); updateButton();
  });
}
