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
