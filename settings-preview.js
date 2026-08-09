const tabs = document.querySelectorAll('[data-settings-tab]');
const panels = document.querySelectorAll('[data-settings-panel]');

const activateTab = (target) => {
  if (!target) return;
  tabs.forEach((item) => {
    const active = item.dataset.settingsTab === target;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', String(active));
  });
  panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.settingsPanel === target));
};

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.settingsTab;
    activateTab(target);
    history.replaceState(null, '', `#${target}`);
  });
});

activateTab(location.hash.slice(1) || 'account');

const openRouterForm = document.querySelector('#openrouter-form');
const openRouterKey = document.querySelector('#openrouter-key');
const openRouterState = document.querySelector('#openrouter-state');
const secretToggle = document.querySelector('.secret-toggle');

secretToggle?.addEventListener('click', () => {
  const reveal = openRouterKey.type === 'password';
  openRouterKey.type = reveal ? 'text' : 'password';
  secretToggle.setAttribute('aria-pressed', String(reveal));
  secretToggle.setAttribute('aria-label', reveal ? 'Приховати ключ' : 'Показати ключ');
  secretToggle.textContent = reveal ? '◌' : '◉';
});

openRouterForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const key = openRouterKey.value.trim();
  if (!key) return openRouterKey.focus();
  openRouterKey.value = '';
  openRouterKey.placeholder = '••••••••••••••••••••••••';
  openRouterState.textContent = 'Ключ додано — очікує серверного підключення';
  openRouterState.classList.add('connected');
});
