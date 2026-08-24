import { useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom';
import './interface-scale.css';
import './settings-ui.css';

const nav = [
  ['/', 'Огляд'],
  ['/dialogs', 'Діалоги'],
  ['/settings', 'Налаштування']
];

const analysisStatus = {
  ready: 'Очікує DIA-аналізу',
  pending: 'У черзі на аналіз',
  processing: 'Триває DIA-аналіз',
  completed: 'Аналіз готовий',
  failed: 'Не вдалося проаналізувати',
  no_recording: 'Немає запису'
};

function toneForScore(score) {
  if (score == null) return 'mid';
  if (score >= 75) return 'good';
  if (score >= 50) return 'mid';
  return 'risk';
}

function formatDateTime(value) {
  if (!value) return 'Дата не вказана';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return 'Дата не вказана';
  return new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatDuration(seconds) {
  const total = Number(seconds || 0);
  if (!Number.isFinite(total) || total <= 0) return 'тривалість не вказана';
  const minutes = Math.floor(total / 60);
  const remainder = Math.round(total % 60);
  return minutes ? `${minutes} хв ${remainder ? `${remainder} с` : ''}`.trim() : `${remainder} с`;
}

const interfaceScaleMin = 0.85;
const interfaceScaleMax = 1.2;
const interfaceScaleStep = 0.05;

function getInterfaceScale() {
  const stored = Number(localStorage.getItem('dialog-interface-scale'));
  if (!Number.isFinite(stored)) return 1;
  return Math.min(interfaceScaleMax, Math.max(interfaceScaleMin, stored));
}

function scaleForViewport(value) {
  const preferred = Math.min(interfaceScaleMax, Math.max(interfaceScaleMin, Number(value)));
  const viewportWidth = window.innerWidth || 1440;
  // Keep room for the rounded frame and avoid horizontal clipping when a
  // preference selected on a large display is reused on a smaller laptop.
  const viewportLimit = Math.min(interfaceScaleMax, Math.max(interfaceScaleMin, viewportWidth / 1180));
  return Math.min(preferred, viewportLimit);
}

function applyInterfaceScale(value, persist = false) {
  const effective = scaleForViewport(value);
  document.documentElement.style.setProperty('--ui-scale', effective);
  if (persist) localStorage.setItem('dialog-interface-scale', value);
}

function InterfaceSizeControl() {
  const [selected, setSelected] = useState(getInterfaceScale);
  const [applied, setApplied] = useState(() => scaleForViewport(getInterfaceScale()));
  const chooseScale = (value) => {
    const next = Number(value);
    setSelected(next);
    applyInterfaceScale(next, true);
    setApplied(scaleForViewport(next));
  };

  useEffect(() => {
    const syncScale = () => setApplied(scaleForViewport(selected));
    window.addEventListener('resize', syncScale);
    return () => window.removeEventListener('resize', syncScale);
  }, [selected]);

  return <section id="interface" className="interface-size">
    <span className="eyebrow">ВИГЛЯД</span>
    <h2>Розмір інтерфейсу</h2>
    <p>Налаштуйте масштаб Dialog під свій екран. Зміна застосовується одразу на всіх сторінках.</p>
    <div className="scale-slider" aria-label="Розмір інтерфейсу">
      <span>85%</span>
      <input type="range" min={interfaceScaleMin} max={interfaceScaleMax} step={interfaceScaleStep} value={selected} onChange={(event) => chooseScale(event.target.value)} aria-label="Масштаб інтерфейсу" />
      <span>120%</span>
      <output title={applied < selected ? 'Масштаб тимчасово зменшено, щоб інтерфейс повністю помістився' : undefined}>{Math.round(applied * 100)}%</output>
    </div>
    {applied < selected && <small className="scale-fit-note">Автоматично підлаштовано під ширину вікна</small>}
  </section>;
}

function Shell({ children }) {
  const [noticeOpen, setNoticeOpen] = useState(false);
  return <main className="app-shell">
    <header className="app-header">
      <div className="global-nav-panel">
        <NavLink to="/" className="brand" aria-label="Dialog"><img src="/dialog-logo-final.svg" alt="dialog" /></NavLink>
        <nav className="main-nav" aria-label="Основна навігація">{nav.map(([to, title]) => <NavLink key={to} to={to} end={to === '/'}>{title}</NavLink>)}</nav>
        <div className="header-tools">
          <NavLink to="/settings#billing" className="balance" title="DIA-бали"><span className="liquid" /><b>68%</b></NavLink>
          <button className="bell" onClick={() => setNoticeOpen(v => !v)} aria-label="Сповіщення">♧<i /></button>
          <NavLink className="avatar" to="/settings#profile">D</NavLink>
          {noticeOpen && <div className="notice-pop"><strong>Останні події</strong><p>Ringostat підключено</p><p>Дані будуть доступні після входу</p></div>}
        </div>
      </div>
    </header>
    {children}
  </main>;
}

function Overview() {
  return <Shell><section className="page intro"><span className="eyebrow">ОГЛЯД ЗА ТИЖДЕНЬ</span><h1>Якість продажів</h1><p>Контролюйте якість комунікацій та бачте можливості для зростання.</p>
    <div className="metric-grid">
      <NavLink to="/dialogs" className="metric-card clickable"><span>ЯКІСТЬ КОМУНІКАЦІЙ</span><strong>72%</strong><small>↑ 6% за цей тиждень</small><div className="ring">72</div></NavLink>
      <NavLink to="/dialogs?filter=risk" className="metric-card clickable"><span>ПОТРЕБУЮТЬ УВАГИ</span><strong>12</strong><small className="coral">5 критичних</small></NavLink>
      <NavLink to="/dialogs?filter=cross-sell" className="metric-card clickable"><span>ПОТЕНЦІАЛ ДОПРОДАЖІВ</span><strong>$4 800</strong><small>8 клієнтів для cross-sell</small></NavLink>
    </div>
    <section className="team-panel"><div><span className="eyebrow">КОМАНДА</span><h2>Динаміка менеджерів</h2></div><button>Цей місяць⌄</button><div className="manager-list">{['Анна К.','Ольга М.','Дмитро П.'].map((name, i) => <div key={name}><b>{name}</b><span>{[78, 69, 64][i]}%</span><em>+{[8, 5, 3][i]}% до минулого місяця</em></div>)}</div></section>
  </section></Shell>;
}

function Dialogs() {
  const [query, setQuery] = useState('');
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadCalls = async () => {
    try {
      setError('');
      const response = await fetch('/api/dialogs');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не вдалося отримати діалоги');
      setCalls(payload.calls || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCalls(); }, []);
  useEffect(() => {
    if (!calls.some(call => ['pending', 'processing'].includes(call.status))) return undefined;
    const timer = window.setInterval(loadCalls, 5000);
    return () => window.clearInterval(timer);
  }, [calls]);

  const syncRingostat = async () => {
    setSyncing(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/ringostat/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не вдалося синхронізувати Ringostat');
      setMessage(`Імпортовано ${payload.imported} дзвінків. У черзі на DIA-аналіз: ${payload.queued || 0}.`);
      await loadCalls();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSyncing(false);
    }
  };

  const normalized = query.trim().toLowerCase();
  const rows = calls.filter(call => !normalized || [call.client, call.manager, call.phone].filter(Boolean).some(value => value.toLowerCase().includes(normalized)));
  return <Shell><section className="page"><span className="eyebrow">РОБОЧИЙ ПРОСТІР · ДІАЛОГИ</span><h1>Усі діалоги</h1><p>Реальні дзвінки з Ringostat, їхні записи, транскрипції та DIA-оцінки.</p>
    <div className="filters"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Пошук клієнта, номера або менеджера"/><button>Усі канали⌄</button><button>За 30 днів⌄</button><button>Усі менеджери⌄</button><button className="outline">Потребують уваги&nbsp; {calls.filter(call => (call.evaluation?.contact_probability ?? 100) < 50).length}</button><button className="lime" onClick={syncRingostat} disabled={syncing}>{syncing ? 'Імпортуємо…' : '↻ Оновити Ringostat'}</button><button className="lime">↑ Завантажити з ПК</button></div>
    {message && <div className="dialog-notice">{message}</div>}
    {error && <div className="dialog-notice error">{error}{error === 'Потрібен вхід' && <> · <NavLink to="/login">Увійти</NavLink></>}</div>}
    <div className="legend"><i className="green"/>75–100% висока імовірність <i className="amber"/>50–74% можна покращити <i className="red"/>0–49% потрібна увага</div>
    <div className="table"><div className="table-head"><span>Діалог ↕</span><span>Клієнт / канал</span><span>Менеджер</span><span>Імовірність контакту</span><span>DIA-висновок</span><span/></div>
      {loading && <div className="table-empty">Завантажуємо реальні дзвінки…</div>}
      {!loading && !error && !rows.length && <div className="table-empty">Ще немає імпортованих дзвінків із записом. Натисніть «Оновити Ringostat» — буде імпортовано до 10 останніх записів.</div>}
      {rows.map((call) => {
        const probability = call.evaluation?.contact_probability;
        const tone = toneForScore(probability);
        const summary = call.evaluation?.summary || analysisStatus[call.status] || 'Очікуємо дані';
        return <div className="dialog-row" key={call.id}><span>{formatDateTime(call.occurredAt)}</span><span><b>{call.client}</b><small>☎ Ringostat · {formatDuration(call.durationSeconds)}</small></span><span>{call.manager}</span><span className={`score ${tone}`}>{probability == null ? '—' : `${probability}%`}</span><span className={`insight ${call.status === 'failed' ? 'risk' : tone}`}>{summary}</span><NavLink to={`/dialogs/${call.id}`}>Детальніше →</NavLink></div>;
      })}
    </div>
  </section></Shell>;
}

const settingsTabs = [
  ['profile', 'Акаунт'], ['team', 'Команда й ролі'], ['score', 'Оцінка діалогів'],
  ['integrations', 'Інтеграції'], ['billing', 'Тарифи й ліміти'], ['help', 'Інструкції']
];

const integrationGroups = {
  'Месенджери': [['Telegram', 'Чати та голосові повідомлення'], ['Instagram Direct', 'Звернення з Direct'], ['Viber', 'Діалоги з клієнтами'], ['WhatsApp Business', 'Чати та шаблони']],
  'Телефонія': [['Ringostat', 'API та події після дзвінка'], ['Binotel', 'Хмарна телефонія для бізнесу'], ['Zadarma', 'Хмарна телефонія'], ['UniTalk', 'Дзвінки з CRM'], ['Phonet', 'Webhooks, REST API та WebSocket']],
  'CRM': [['KeyCRM', 'Угоди, контакти та менеджери'], ['HubSpot', 'CRM і воронка продажів'], ['Pipedrive', 'Угоди та активності']]
};

function SettingsModal({ title, children, onClose, action = 'Зберегти', onAction }) {
  return <div className="settings-modal-backdrop" role="presentation" onMouseDown={onClose}><div className="settings-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Закрити">×</button><h2>{title}</h2><div className="modal-copy">{children}</div><div className="modal-actions"><button className="ghost-control" onClick={onClose}>Скасувати</button><button className="lime" onClick={onAction}>{action}</button></div></div></div>;
}

function TeamPanel({ openModal }) {
  const people = [['Анна К.', 'Керівник', 'anna@dia.consulting'], ['Ольга М.', 'Менеджер', 'olha@dia.consulting'], ['Дмитро П.', 'Менеджер', 'dmytro@dia.consulting'], ['Ірина С.', 'Менеджер', 'iryna@dia.consulting']];
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('Усі ролі');
  const rows = people.filter(([name, itemRole]) => (!query || name.toLowerCase().includes(query.toLowerCase())) && (role === 'Усі ролі' || role === itemRole));
  return <section className="settings-screen"><div className="settings-heading"><div><span className="eyebrow">ДОСТУПИ</span><h2>Команда й ролі</h2><p>Ролі визначають, хто бачить діалоги, оцінки, рекомендації та налаштування.</p></div><button className="lime" onClick={() => openModal('invite')}>+ Запросити учасника</button></div><div className="role-grid rich-roles">{[['Менеджер','Працює зі своїми діалогами','Власні діалоги та прогрес'],['Керівник','Розвиває команду','Команда, оцінки та рекомендації'],['Адміністратор','Керує робочим простором','Користувачі, інтеграції, тарифи']].map(([roleName,title,description]) => <article key={roleName}><b>{roleName}</b><h3>{title}</h3><p>{description}</p><button className="text-control" onClick={() => openModal('roles')}>Переглянути доступ →</button></article>)}<article className="custom-role"><b>КАСТОМНА РОЛЬ</b><h3>Доступ під ваш процес</h3><p>Створіть окремі права для аудитора, партнера або рекрутера.</p><button className="text-control" onClick={() => openModal('customRole')}>Налаштувати доступ →</button></article></div><article className="team-management"><div><span className="eyebrow">УЧАСНИКИ</span><h3>Конкретні люди та доступи</h3></div><div className="team-filters"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Пошук за ім’ям або email"/><select value={role} onChange={e => setRole(e.target.value)}><option>Усі ролі</option><option>Адміністратор</option><option>Керівник</option><option>Менеджер</option></select></div><div className="people-list">{rows.map(([name,itemRole,email]) => <div className="person-row" key={email}><span className="person-avatar">{name[0]}</span><div><b>{name}</b><small>{email}</small></div><em className={`role-badge ${itemRole === 'Керівник' ? 'leader' : ''}`}>{itemRole}</em><button className="ghost-control" onClick={() => openModal('person', { name, itemRole, email })}>Керувати</button></div>)}</div></article></section>;
}

function ScorePanel({ showSaved }) {
  const [goal, setGoal] = useState('Продажі B2B');
  const [crossSell, setCrossSell] = useState(true);
  const stages = [['Встановлення контакту', 20], ['Виявлення потреби', 30], ['Презентація рішення', 20], ['Робота із запереченнями', 15], ['Завершення контакту', 15]];
  return <section className="settings-screen"><div className="settings-heading"><div><span className="eyebrow">DIA-ОЦІНКА</span><h2>Параметри оцінки діалогів</h2><p>Оберіть ціль і те, на чому Dialog має робити акцент у кожному контакті.</p></div><button className="lime" onClick={showSaved}>Зберегти параметри</button></div><article className="goal-card"><div><b>Головна ціль аналізу</b><p>Збільшити конверсію в угоду та якість наступного кроку.</p></div><select value={goal} onChange={e => setGoal(e.target.value)}><option>Продажі B2B</option><option>Продажі B2C</option><option>Повернення клієнта</option><option>Підтримка клієнтів</option></select></article><div className="criteria-table"><div className="criteria-head"><span>Етап продажу</span><span>Вага</span><span>Відстежувати</span></div>{stages.map(([stage, weight], index) => <div className="criteria-row" key={stage}><div><i>{String(index + 1).padStart(2,'0')}</i><span><b>{stage}</b><small>{['Тон, довіра, контекст', 'Запитання, біль, критерії рішення', 'Цінність і персоналізація', 'Причина сумніву та відповідь', 'Домовленість і дедлайн'][index]}</small></span></div><label className="weight-control"><input type="range" min="5" max="40" defaultValue={weight}/><output>{weight}%</output></label><input type="checkbox" defaultChecked aria-label={`Відстежувати ${stage}`}/></div>)}</div><article className="toggle-option"><div><b>Cross-sell / Up-sell</b><p>Додатково перевіряти можливість розширити угоду.</p></div><button className={`switch ${crossSell ? 'active' : ''}`} onClick={() => setCrossSell(value => !value)} aria-label="Cross-sell / Up-sell">●</button></article></section>;
}

function IntegrationsPanel({ openModal }) {
  const [filter, setFilter] = useState('Усі');
  const visibleGroups = Object.entries(integrationGroups).filter(([group]) => filter === 'Усі' || filter === group);
  return <section className="settings-screen"><div className="settings-heading"><div><span className="eyebrow">ДЖЕРЕЛА ДАНИХ</span><h2>Інтеграції</h2><p>Підключайте канали для автоматичного імпорту дзвінків, переписок і воронок.</p></div><div className="settings-heading-actions"><button className="help-control" onClick={() => openModal('integrationHelp')}>?</button><button className="ghost-control" onClick={() => openModal('connectionCheck')}>Перевірити підключення</button></div></div><div className="segment-tabs">{['Усі', ...Object.keys(integrationGroups)].map(item => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>{visibleGroups.map(([group, items]) => <div className="integration-section" key={group}><h3>{group}</h3><div className="integration-grid">{items.map(([name,description]) => { const connected = name === 'Ringostat'; return <article className={`integration-card ${connected ? 'connected' : ''}`} key={name}><span className="integration-mark">{name[0]}</span><div><b>{name}</b><p>{connected ? '● Підключено · імпорт записів увімкнено' : description}</p></div><button className={connected ? 'ghost-control' : 'lime'} onClick={() => openModal('integration', { name, description, connected })}>{connected ? 'Налаштувати' : 'Підключити'}</button></article>; })}</div></div>)}</section>;
}

function BillingPanel() { return <section className="settings-screen"><div className="settings-heading"><div><span className="eyebrow">DIA-БАЛИ</span><h2>Тарифи й ліміти</h2><p>Керуйте обсягом аналізу та можливостями команди.</p></div><button className="ghost-control">Історія оплат →</button></div><article className="usage-card"><div><b>Growth</b><p>Поточний план · $349 / міс</p></div><div><strong>4 160</strong><span> / 6 000 DIA-балів залишилося</span><i><em/></i></div></article><article className="referral-card"><span className="eyebrow">DIA-РЕФЕРАЛИ</span><h3>Діліться Dialog — отримуйте DIA-бали щомісяця</h3><p>Бонус нараховується після успішної оплати залученого клієнта.</p><div><b>Start · 4%</b><b>Growth · 7%</b><b>Scale · 10%</b></div></article><div className="plans-grid">{[['Start','$99','1 500 DIA-балів'],['Growth','$349','6 000 DIA-балів'],['Scale','$799','20 000 DIA-балів']].map(([name,price,limit]) => <article key={name} className={name === 'Growth' ? 'current-plan' : ''}><b>{name}</b><h3>{price}<small> / міс</small></h3><p>{limit}</p><button className={name === 'Growth' ? 'lime' : 'ghost-control'}>{name === 'Growth' ? 'Поточний план' : `Обрати ${name}`}</button></article>)}</div></section>; }

function HelpPanel() { return <section className="settings-screen"><span className="eyebrow">ДОПОМОГА</span><h2>Інструкції</h2><p>Побудуйте процес аналізу комунікацій разом із командою.</p><article className="guide-hero"><span>✦</span><div><b>ШВИДКИЙ СТАРТ</b><h3>Перший результат — за 15 хвилин</h3><p>Підключіть джерело діалогів, оберіть параметри оцінки та відкрийте перший DIA-аналіз.</p></div><button className="lime">Почати вступний урок</button></article><div className="guides-grid">{['Налаштуйте акаунт','Підключіть канали','Оберіть оцінку','Проведіть перший аналіз'].map((item, index) => <article key={item}><i>{String(index + 1).padStart(2,'0')}</i><h3>{item}</h3><p>{index < 2 ? 'Готово' : 'Відкрити інструкцію →'}</p></article>)}</div></section>; }

function Settings() {
  const location = useLocation();
  const requested = location.hash.replace('#', '');
  const valid = settingsTabs.some(([key]) => key === requested) ? requested : 'profile';
  const [active, setActive] = useState(valid);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [account, setAccount] = useState({ email: 'dia.office.kiev@gmail.com', name: 'Dia Consulting' });
  useEffect(() => setActive(valid), [valid]);
  useEffect(() => { fetch('/api/auth/session').then(response => response.ok ? response.json() : null).then(data => { if (data?.member?.email) setAccount({ email: data.member.email, name: data.member.name || data.organization?.name || 'Dialog' }); }).catch(() => {}); }, []);
  const change = key => { setActive(key); window.history.replaceState(null, '', `#${key}`); };
  const openModal = (type, details = {}) => setModal({ type, ...details });
  const save = text => { setModal(null); setToast(text); window.setTimeout(() => setToast(''), 3200); };
  const startPasswordReset = async () => {
    try {
      const response = await fetch('/api/auth/password/reset/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email }) });
      if (!response.ok) throw new Error();
      save('Перевірте email: надіслано безпечне посилання для встановлення пароля.');
    } catch { save('Не вдалося надіслати лист. Спробуйте ще раз.'); }
  };
  const modalContent = () => {
    if (!modal) return null;
    if (modal.type === 'invite') return <SettingsModal title="Запросити учасника" onClose={() => setModal(null)} onAction={() => save('Запрошення підготовлено — його можна надіслати учаснику.')}><label>Робочий email<input type="email" placeholder="name@company.com"/></label><label>Роль<select><option>Менеджер</option><option>Керівник</option><option>Адміністратор</option></select></label></SettingsModal>;
    if (modal.type === 'person') return <SettingsModal title={`Доступ: ${modal.name}`} onClose={() => setModal(null)} onAction={() => save(`Права для ${modal.name} збережено.`)}><label>Роль<select defaultValue={modal.itemRole}><option>Менеджер</option><option>Керівник</option><option>Адміністратор</option><option>Кастомна роль</option></select></label><label className="check-line"><input type="checkbox" defaultChecked/> Доступ до DIA-рекомендацій</label><label className="check-line"><input type="checkbox"/> Доступ до налаштувань</label></SettingsModal>;
    if (modal.type === 'roles' || modal.type === 'customRole') return <SettingsModal title={modal.type === 'roles' ? 'Рівні доступу' : 'Кастомна роль'} onClose={() => setModal(null)} onAction={() => save('Налаштування ролі збережено.')}><label>{modal.type === 'customRole' ? 'Назва ролі' : 'Роль'}<input defaultValue={modal.type === 'customRole' ? 'Аудитор' : 'Керівник'}/></label>{['Діалоги та переписки','Аналітика команди','DIA-поради та задачі','Параметри оцінки','Команда й ролі','Інтеграції та тариф'].map(item => <label className="modal-permission" key={item}><span>{item}</span><select defaultValue="view"><option value="none">Немає доступу</option><option value="view">Перегляд</option><option value="work">Робота</option><option value="manage">Керування</option></select></label>)}</SettingsModal>;
    if (modal.type === 'integrationHelp') return <SettingsModal title="Як підключити інтеграції" action="Зрозуміло" onClose={() => setModal(null)} onAction={() => setModal(null)}><ol className="help-list"><li><b>Телефонія:</b> створіть API-ключ або webhook у кабінеті сервісу.</li><li><b>CRM:</b> надайте доступ до контактів, угод і менеджерів.</li><li><b>Месенджери:</b> підключіть бізнес-акаунт або бот.</li><li><b>Безпека:</b> ключі зберігаються на сервері, а не в браузері.</li></ol></SettingsModal>;
    if (modal.type === 'connectionCheck') return <SettingsModal title="Перевірка підключень" action="Перевірити" onClose={() => setModal(null)} onAction={() => save('Ringostat підключено. Інші інтеграції очікують налаштування.')}><p>Ми перевіримо доступність підключених джерел даних і повідомимо про результат.</p></SettingsModal>;
    if (modal.type === 'security') return <SettingsModal title="Безпека і вхід" action="Надіслати посилання" onClose={() => setModal(null)} onAction={startPasswordReset}><p>Надішлемо на робочий email одноразове посилання. На сторінці Dialog ви зможете створити або змінити пароль.</p><label>Робочий email<input type="email" value={account.email} readOnly/></label><label className="check-line"><input type="checkbox" defaultChecked readOnly/> Дозволити вхід за паролем</label></SettingsModal>;
    if (modal.type === 'integration') return <SettingsModal title={`${modal.connected ? 'Налаштувати' : 'Підключити'} ${modal.name}`} onClose={() => setModal(null)} onAction={() => save(`${modal.name}: налаштування збережено у формі. Серверні ключі не показуються в інтерфейсі.`)}><p>{modal.connected ? 'Імпорт історії та нові дзвінки через webhook увімкнені.' : 'Додайте дані підключення. Вони мають зберігатися як секрет на сервері.'}</p><label>Назва підключення<input defaultValue={modal.name}/></label><label>API-ключ / токен<input type="password" placeholder="Вставте ключ із кабінету сервісу"/></label><label>Імпорт історії<select><option>Останні 30 днів</option><option>Останні 7 днів</option><option>Свій діапазон</option></select></label><label className="check-line"><input type="checkbox" defaultChecked/> Автоматично додавати нові записи до DIA-аналізу</label></SettingsModal>;
    return null;
  };
  return <Shell><section className="page settings settings-rich"><span className="eyebrow">РОБОЧИЙ ПРОСТІР</span><h1>Налаштування</h1><p>Керуйте профілем, доступами, інтеграціями, параметрами оцінки та DIA-балами.</p><div className="settings-layout"><aside className="settings-menu">{settingsTabs.map(([key,label]) => <button key={key} className={active === key ? 'active' : ''} onClick={() => change(key)}>{label}</button>)}<div className="menu-note"><i/> Усі зміни зберігаються для вашої команди.</div></aside><div className="settings-content rich-content">{active === 'profile' && <><section className="settings-screen"><span className="eyebrow">АКАУНТ</span><h2>Ваш профіль</h2><div className="profile-row"><span className="profile-avatar">D</span><div><h3>Dia Consulting</h3><p>Адміністратор робочого простору<br/>dia.office.kiev@gmail.com</p></div><button className="ghost-control">Змінити аватар</button></div><div className="profile-form"><label>Назва компанії<input defaultValue="Dia Consulting"/></label><label>Короткий опис<textarea defaultValue="Аналітика продажів та клієнтських діалогів"/></label><button className="lime" onClick={() => save('Профіль збережено.')}>Зберегти зміни</button></div></section><section className="settings-screen security-panel"><span className="eyebrow">БЕЗПЕКА</span><h2>Пароль і вхід</h2><p>Керуйте способом входу до Dialog. Паролі обробляє захищений сервіс авторизації, вони не зберігаються у Dialog.</p><div className="security-options"><article><b>Вхід через email</b><p>Увімкнено · одноразове посилання на робочий email.</p><span className="security-state">Активно</span></article><article><b>Вхід за паролем</b><p>Створіть або оновіть пароль через безпечне посилання.</p><button className="lime" onClick={() => openModal('security')}>Налаштувати пароль</button></article><article><b>Поточна сесія</b><p>Захищена сесія у цьому браузері.</p><button className="ghost-control" onClick={() => save('Щоб вийти, скористайтеся меню аватара у верхній панелі.')}>Керувати сесією</button></article></div></section></>}{active === 'team' && <TeamPanel openModal={openModal}/>} {active === 'score' && <ScorePanel showSaved={() => save('Параметри DIA-оцінки збережено.')}/>} {active === 'integrations' && <IntegrationsPanel openModal={openModal}/>} {active === 'billing' && <BillingPanel/>} {active === 'help' && <HelpPanel/>}</div></div></section>{toast && <div className="settings-toast">✓ {toast}</div>}{modalContent()}</Shell>;
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [method, setMethod] = useState('email');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault(); setLoading(true); setError(''); setStatus('');
    try {
      const response = await fetch(method === 'password' ? '/api/auth/password' : '/api/auth/magic-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(method === 'password' ? { email, password } : { email }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не вдалося надіслати посилання');
      if (method === 'password') window.location.assign('/');
      else setStatus('Перевірте пошту: ми надіслали безпечне посилання для входу.');
    } catch (requestError) { setError(requestError.message); } finally { setLoading(false); }
  };
  return <section className="login-page login-page-new"><div className="login-orbit one"/><div className="login-orbit two"/><div className="login-card login-card-new">
    <a href="/login" className="login-brand"><img src="/dialog-logo-final.svg" alt="dialog" /></a>
    <span className="eyebrow">БЕЗПЕЧНИЙ ВХІД</span><h1>Увійдіть до<br/>свого простору</h1><p>Оберіть безпечне посилання на email або вхід за паролем.</p>
    <div className="login-methods" role="tablist"><button type="button" className={method === 'email' ? 'active' : ''} onClick={() => { setMethod('email'); setError(''); setStatus(''); }}>Через email</button><button type="button" className={method === 'password' ? 'active' : ''} onClick={() => { setMethod('password'); setError(''); setStatus(''); }}>За паролем</button></div>
    <form onSubmit={submit}>
      <label htmlFor="email">Робочий email</label>
      <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email"/>
      {method === 'password' && <><label htmlFor="password">Пароль</label><input id="password" type="password" required minLength="8" value={password} onChange={e => setPassword(e.target.value)} placeholder="Ваш пароль" autoComplete="current-password"/></>}
      <button className="lime login-submit" type="submit" disabled={loading}>{loading ? 'Перевіряємо…' : method === 'password' ? <>Увійти <span>→</span></> : <>Продовжити з email <span>→</span></>}</button>
    </form>
    {status && <div className="login-status">{status}</div>}
    {error && <div className="login-status login-error">{error}</div>}
    {method === 'password' && <p className="password-hint">Ще не створювали пароль? <button type="button" className="inline-link" onClick={() => { setMethod('email'); setError(''); setStatus(''); }}>Надішліть посилання на email</button>, щоб встановити або відновити його.</p>}
    <div className="separator"><span/>або<span/></div>
    <button className="oauth" type="button" disabled><b className="google">G</b> Google — незабаром</button>
    <small className="terms">Продовжуючи, ви погоджуєтеся з умовами використання та політикою конфіденційності DIA Consulting.</small>
  </div><aside className="login-side"><span className="eyebrow">DIALOG В ОДНОМУ ВІКНІ</span><h2>Кожна розмова<br/><em>має наступний крок.</em></h2><div className="login-preview"><span>Імовірність угоди</span><b>42%</b><i/><small>+24% можливого росту після контакту</small></div><p>Ваші дані зберігаються у захищеному робочому просторі.</p></aside></section>;
}

function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const submit = async event => {
    event.preventDefault(); setError('');
    if (password !== confirm) return setError('Паролі не збігаються.');
    setLoading(true);
    try {
      const response = await fetch('/api/auth/password/reset/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не вдалося оновити пароль');
      window.location.assign('/');
    } catch (requestError) { setError(requestError.message); } finally { setLoading(false); }
  };
  return <section className="login-page login-page-new"><div className="login-orbit one"/><div className="login-orbit two"/><div className="login-card login-card-new"><a href="/login" className="login-brand"><img src="/dialog-logo-final.svg" alt="dialog"/></a><span className="eyebrow">БЕЗПЕЧНИЙ ДОСТУП</span><h1>Створіть<br/>новий пароль</h1><p>Він захистить ваш робочий простір Dialog.</p>{!token ? <div className="login-status login-error">Посилання неповне або вже недійсне. Запросіть нове в налаштуваннях профілю.</div> : <form onSubmit={submit}><label htmlFor="new-password">Новий пароль</label><input id="new-password" type="password" minLength="8" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password"/><label htmlFor="confirm-password">Повторіть пароль</label><input id="confirm-password" type="password" minLength="8" required value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password"/><button className="lime login-submit" type="submit" disabled={loading}>{loading ? 'Зберігаємо…' : <>Зберегти пароль <span>→</span></>}</button></form>}{error && <div className="login-status login-error">{error}</div>}</div></section>;
}

function Detail() {
  const { id } = useParams();
  const [dialog, setDialog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);
  const [error, setError] = useState('');
  const [requesting, setRequesting] = useState(false);

  const loadDialog = async () => {
    try {
      setError('');
      const response = await fetch(`/api/dialogs/${id}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не вдалося отримати діалог');
      setDialog(payload);
    } catch (requestError) {
      setError(requestError.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadDialog(); }, [id]);
  useEffect(() => {
    if (!['pending', 'processing', 'ready'].includes(dialog?.status)) return undefined;
    const timer = window.setInterval(loadDialog, 5000);
    return () => window.clearInterval(timer);
  }, [dialog?.status, id]);

  const requestAnalysis = async () => {
    setRequesting(true); setError('');
    try {
      const response = await fetch(`/api/dialogs/${id}/analyze`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не вдалося додати в чергу');
      await loadDialog();
    } catch (requestError) { setError(requestError.message); } finally { setRequesting(false); }
  };

  if (loading) return <Shell><section className="page"><p>Завантажуємо DIA-аналіз…</p></section></Shell>;
  if (error || !dialog) return <Shell><section className="page"><NavLink className="back" to="/dialogs">← Усі діалоги</NavLink><div className="dialog-notice error">{error || 'Діалог не знайдено'}</div></section></Shell>;

  const evaluation = dialog.evaluation;
  const probability = evaluation?.contact_probability;
  const tone = toneForScore(probability);
  const stages = [
    ['Встановлення контакту', 'contact'], ['Виявлення потреби', 'needs'], ['Презентація', 'presentation'],
    ['Робота із запереченнями', 'objections'], ['Cross-sell / Up-sell', 'cross_sell'], ['Завершення контакту', 'closing']
  ];
  return <Shell><section className="page detail-page"><NavLink className="back" to="/dialogs">← Усі діалоги</NavLink><span className="eyebrow">ДЕТАЛЬНИЙ DIA-АНАЛІЗ</span><h1>Розмова з {dialog.client}</h1><p>{formatDateTime(dialog.occurredAt)} · {dialog.manager} · Дзвінок · {formatDuration(dialog.durationSeconds)}</p>
    <div className="player"><div><b>{dialog.client}</b><small>{dialog.phone || 'Номер не вказано'} · {dialog.deal.contacts} контакт{dialog.deal.contacts === 1 ? '' : 'ів'} у воронці</small></div><button onClick={() => setShowTranscript(value => !value)}>{showTranscript ? 'Сховати транскрипцію' : 'Транскрипція'}</button><div className="wave">▮▯▮▮▯▮▯▮▮▯▮▯▮</div>{dialog.hasRecording ? <audio className="recording-audio" controls preload="metadata" src={`/api/dialogs/${dialog.id}/audio`}>Ваш браузер не підтримує аудіо.</audio> : <div className="timeline">Запис відсутній</div>}
      {showTranscript && <div className="transcript">{dialog.transcript || (dialog.status === 'failed' ? `Помилка: ${dialog.error || 'невідома'}` : 'Транскрипція ще готується…')}</div>}
    </div>
    {['ready', 'pending', 'processing', 'failed'].includes(dialog.status) && <div className="analysis-pending"><b>{analysisStatus[dialog.status]}</b><span>{dialog.status === 'failed' ? dialog.error || 'Спробуйте повторити аналіз.' : 'Сторінка оновиться автоматично після готовності.'}</span>{dialog.status !== 'processing' && <button className="lime" onClick={requestAnalysis} disabled={requesting}>{requesting ? 'Додаємо…' : 'Запустити DIA-аналіз'}</button>}</div>}
    <div className="analysis-grid"><article><span className={`eyebrow ${tone === 'risk' ? 'coral' : ''}`}>ІМОВІРНІСТЬ ЦЬОГО ДЗВІНКА</span><strong className={`big ${tone === 'risk' ? 'coral' : ''}`}>{probability == null ? '—' : `${probability}%`}</strong><p>{evaluation?.summary || analysisStatus[dialog.status]}</p></article><article className="deal"><span className="eyebrow">ІМОВІРНІСТЬ УГОДИ</span><strong className="big">{dialog.deal.probability == null ? '—' : `${dialog.deal.probability}%`}</strong><p>Ураховано {dialog.deal.contacts} контакт{dialog.deal.contacts === 1 ? '' : 'ів'} із цим номером у воронці.</p></article></div>
    {evaluation && <section className="stage-panel"><div><span className="eyebrow">ЯКІСТЬ ЦЬОГО ДІАЛОГУ</span><h2>Відпрацювання етапів</h2></div><div className="stage-grid">{stages.map(([title, key], index) => { const score = evaluation.stages?.[key] ?? 0; return <article key={key}><span>0{index + 1}</span><b>{title}</b><strong className={toneForScore(score)}>{score}%</strong><i><em style={{ width: `${score}%` }}/></i></article>; })}</div></section>}
    {evaluation?.recommendations?.length > 0 && <section className="recommendations"><span className="eyebrow">DIA-ПОРАДА</span><h2>Що сказати далі</h2>{evaluation.recommendations.map((item, index) => <article key={`${item.issue}-${index}`}><b>{item.issue}</b><p>«{item.say}»</p></article>)}</section>}
  </section></Shell>;
}

function mainSection(pathname) {
  if (pathname.startsWith('/settings')) return 2;
  if (pathname.startsWith('/dialogs')) return 1;
  return 0;
}

export default function App() {
  const location = useLocation();
  const [shownLocation, setShownLocation] = useState(location);
  const [transition, setTransition] = useState('idle');
  const [direction, setDirection] = useState('forward');
  const [authState, setAuthState] = useState('checking');
  const enterTimer = useRef();

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session', { cache: 'no-store' })
      .then(response => active && setAuthState(response.ok ? 'authenticated' : 'anonymous'))
      .catch(() => active && setAuthState('anonymous'));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    applyInterfaceScale(getInterfaceScale());
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    const fitToViewport = () => applyInterfaceScale(getInterfaceScale());
    window.addEventListener('resize', fitToViewport);
    return () => window.removeEventListener('resize', fitToViewport);
  }, []);

  useEffect(() => {
    if (location.pathname === shownLocation.pathname) return undefined;
    setDirection(mainSection(location.pathname) >= mainSection(shownLocation.pathname) ? 'forward' : 'back');
    setTransition('exit');
    const switchTimer = window.setTimeout(() => {
      setShownLocation(location);
      setTransition('enter');
      enterTimer.current = window.setTimeout(() => setTransition('idle'), 280);
    }, 180);
    return () => {
      window.clearTimeout(switchTimer);
      window.clearTimeout(enterTimer.current);
    };
  }, [location, shownLocation]);

  if (authState === 'checking') return <main className="auth-check" aria-live="polite"><img src="/dialog-logo-final.svg" alt="dialog"/><span>Перевіряємо безпечний вхід…</span></main>;
  if (authState === 'anonymous' && !['/login', '/reset-password'].includes(location.pathname)) return <Navigate to="/login" replace/>;
  if (authState === 'authenticated' && location.pathname === '/login') return <Navigate to="/" replace/>;

  return <div className={`route-transition ${transition} ${direction}`}>
    <Routes location={shownLocation}>
      <Route path="/" element={<Overview/>}/>
      <Route path="/dialogs" element={<Dialogs/>}/>
      <Route path="/dialogs/preview" element={<Navigate to="/dialogs" replace/>}/>
      <Route path="/dialogs/:id" element={<Detail/>}/>
      <Route path="/settings" element={<Settings/>}/>
      <Route path="/login" element={<Login/>}/>
      <Route path="/reset-password" element={<ResetPassword/>}/>
      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Routes>
  </div>;
}
