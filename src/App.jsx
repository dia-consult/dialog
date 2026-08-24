import { useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom';
import './interface-scale.css';
import './responsive.css';

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

function getInterfaceScale() {
  return interfaceScaleMax;
}

function scaleForViewport(value) {
  const preferred = Math.min(interfaceScaleMax, Math.max(interfaceScaleMin, Number(value)));
  const viewportWidth = window.innerWidth || 1440;
  // Keep room for the rounded frame and avoid horizontal clipping when a
  // preference selected on a large display is reused on a smaller laptop.
  const viewportLimit = Math.min(interfaceScaleMax, Math.max(interfaceScaleMin, viewportWidth / 1180));
  return Math.min(preferred, viewportLimit);
}

function applyInterfaceScale(value) {
  const effective = scaleForViewport(value);
  document.documentElement.style.setProperty('--ui-scale', effective);
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

function SettingsDrawer({ type, onClose }) {
  const copy = {
    profile: ['Редагувати профіль', 'Оновіть дані, які бачить ваша команда.'],
    avatar: ['Змінити аватар', 'Оберіть спосіб оновлення зображення профілю.'],
    invite: ['Запросити учасника', 'Надішліть запрошення та задайте базову роль.'],
    permissions: ['Налаштувати доступ', 'Оберіть, що може бачити й змінювати ця роль.'],
    score: ['Параметри DIA-оцінки', 'Вкажіть, на яких етапах продажу має фокусуватися аналіз.'],
    ringostat: ['Ringostat', 'Перевірте джерело дзвінків та параметри синхронізації.'],
    crm: ['Підключити CRM', 'Оберіть CRM для передачі контактів і результатів аналізу.'],
    messenger: ['Підключити месенджер', 'Оберіть канал, листування з якого потрібно аналізувати.'],
    billing: ['Тариф і DIA-бали', 'Оберіть план для вашого робочого простору.'],
    help: ['Навчальний матеріал', 'Оберіть формат, у якому зручніше пройти інструкцію.']
  }[type] || ['Налаштування', 'Оберіть потрібні параметри.'];
  return <div className="settings-drawer-backdrop" role="presentation" onMouseDown={onClose}><section className="settings-drawer" role="dialog" aria-modal="true" aria-label={copy[0]} onMouseDown={event => event.stopPropagation()}><button className="drawer-close" type="button" onClick={onClose}>×</button><span className="eyebrow">DIALOG</span><h2>{copy[0]}</h2><p>{copy[1]}</p><label>Режим / джерело<select defaultValue="default"><option value="default">За замовчуванням</option><option>Для всієї команди</option><option>Лише для мене</option></select></label><label>Коментар<input placeholder="Додайте короткий коментар" /></label>{['score','permissions'].includes(type) && <div className="checkbox-list"><label><input type="checkbox" defaultChecked/> Виявлення потреби</label><label><input type="checkbox" defaultChecked/> Робота із запереченнями</label><label><input type="checkbox"/> Cross-sell / Up-sell</label></div>}<button className="lime drawer-save" type="button" onClick={onClose}>Зберегти зміни</button></section></div>;
}

function Settings() {
  const tabs = [
    ['profile', 'Акаунт'], ['team', 'Команда й ролі'], ['score', 'Оцінка діалогів'],
    ['integrations', 'Інтеграції'], ['billing', 'Тарифи й ліміти'], ['help', 'Інструкції']
  ];
  const getActiveTab = () => tabs.some(([id]) => id === window.location.hash.slice(1)) ? window.location.hash.slice(1) : 'profile';
  const [active, setActive] = useState(getActiveTab);
  const [drawer, setDrawer] = useState(null);

  useEffect(() => {
    const syncActive = () => setActive(getActiveTab());
    window.addEventListener('hashchange', syncActive);
    return () => window.removeEventListener('hashchange', syncActive);
  }, []);

  const selectTab = (id) => {
    if (window.location.hash !== `#${id}`) window.location.hash = id;
    else setActive(id);
  };

  return <Shell><section className="page settings"><span className="eyebrow">РОБОЧИЙ ПРОСТІР</span><h1>Налаштування</h1><p>Керуйте профілем, доступами, інтеграціями, параметрами оцінки та DIA-балами.</p><div className="settings-layout">
    <aside aria-label="Розділи налаштувань">{tabs.map(([id, title]) => <button key={id} type="button" className={active === id ? 'active' : ''} onClick={() => selectTab(id)}>{title}</button>)}</aside>
    <div className="settings-content">
      {active === 'profile' && <section className="profile-settings"><span className="eyebrow">АКАУНТ</span><h2>Ваш профіль</h2><div className="profile-summary"><div className="profile-avatar">D</div><div><b>Dia Consulting</b><small>Адміністратор робочого простору</small><span>dia.office.kiev@gmail.com</span></div><button type="button" onClick={() => setDrawer('avatar')}>Змінити аватар</button></div><div className="profile-actions"><button type="button" onClick={() => setDrawer('profile')}>Редагувати профіль</button><NavLink className="button" to="/login">Керувати входом</NavLink></div></section>}
      {active === 'team' && <section><div className="settings-section-heading"><div><span className="eyebrow">ДОСТУПИ</span><h2>Команда й ролі</h2></div><button className="lime" type="button" onClick={() => setDrawer('invite')}>+ Запросити учасника</button></div><p>Визначте, хто бачить діалоги, оцінки, рекомендації та налаштування.</p><div className="role-grid">{[['Менеджер','Власні діалоги й прогрес'],['Керівник','Команда, оцінки та рекомендації'],['Адміністратор','Користувачі, інтеграції, тарифи']].map(([r,d])=><article key={r}><b>{r}</b><h3>{d}</h3><p>Налаштований рівень доступу для роботи у Dialog.</p><button type="button" onClick={() => setDrawer('permissions')}>Налаштувати доступ</button></article>)}</div></section>}
      {active === 'score' && <section><div className="settings-section-heading"><div><span className="eyebrow">DIA-ОЦІНКА</span><h2>Параметри оцінки діалогів</h2></div><button className="lime" type="button" onClick={() => setDrawer('score')}>Налаштувати оцінку</button></div><p>Dialog оцінює контакт, виявлення потреби, презентацію, заперечення, cross-sell та наступний крок.</p><div className="plans"><button type="button" onClick={() => setDrawer('score')}>Етапи продажу · 6⌄</button><button type="button" onClick={() => setDrawer('score')}>Cross-sell / Up-sell⌄</button><button type="button" onClick={() => setDrawer('score')}>Рекомендації DIA⌄</button></div></section>}
      {active === 'integrations' && <section><span className="eyebrow">ДЖЕРЕЛА ДАНИХ</span><h2>Інтеграції</h2><p>Підключайте телефонію, CRM і месенджери для автоматичного імпорту розмов.</p><div className="plans"><button type="button" onClick={() => setDrawer('ringostat')}>Ringostat · підключено ⚙</button><button type="button" onClick={() => setDrawer('crm')}>CRM · додати⌄</button><button type="button" onClick={() => setDrawer('messenger')}>Месенджери · додати⌄</button></div></section>}
      {active === 'billing' && <section><div className="settings-section-heading"><div><span className="eyebrow">DIA-БАЛИ</span><h2>Баланс і тарифи</h2></div><button className="lime" type="button" onClick={() => setDrawer('billing')}>Керувати тарифом</button></div><p>68% DIA-балів залишилося у вашому поточному плані.</p><div className="plans"><button type="button" onClick={() => setDrawer('billing')}>Starter · $99</button><button type="button" onClick={() => setDrawer('billing')}>Growth · $349</button><button type="button" onClick={() => setDrawer('billing')}>Scale · $799</button></div></section>}
      {active === 'help' && <section><span className="eyebrow">ДОПОМОГА</span><h2>Інструкції</h2><p>Короткі інструкції для старту: підключення Ringostat, імпорт розмов, DIA-аналіз і робота з рекомендаціями.</p><div className="plans"><button type="button" onClick={() => setDrawer('help')}>1. Підключити джерело</button><button type="button" onClick={() => setDrawer('help')}>2. Імпортувати діалоги</button><button type="button" onClick={() => setDrawer('help')}>3. Переглянути DIA-пораду</button></div></section>}
    </div>
  </div>{drawer && <SettingsDrawer type={drawer} onClose={() => setDrawer(null)}/>}</section></Shell>;
}

function Login() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault(); setLoading(true); setError(''); setStatus('');
    try {
      const response = await fetch('/api/auth/magic-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не вдалося надіслати посилання');
      setStatus('Перевірте пошту: ми надіслали безпечне посилання для входу.');
    } catch (requestError) { setError(requestError.message); } finally { setLoading(false); }
  };
  return <Shell><section className="login-page login-page-new"><div className="login-orbit one"/><div className="login-orbit two"/><div className="login-card login-card-new">
    <NavLink to="/" className="login-brand"><img src="/dialog-logo-final.svg" alt="dialog" /></NavLink>
    <span className="eyebrow">БЕЗПЕЧНИЙ ВХІД</span><h1>Увійдіть до<br/>свого простору</h1><p>Продовжуйте роботу з діалогами, командою та DIA-порадами.</p>
    <form onSubmit={submit}>
      <label htmlFor="email">Робочий email</label>
      <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email"/>
      <button className="lime login-submit" type="submit" disabled={loading}>{loading ? 'Надсилаємо…' : <>Продовжити з email <span>→</span></>}</button>
    </form>
    {status && <div className="login-status">{status}</div>}
    {error && <div className="login-status login-error">{error}</div>}
    <div className="separator"><span/>або<span/></div>
    <button className="oauth" type="button" disabled><b className="google">G</b> Google — незабаром</button>
    <small className="terms">Продовжуючи, ви погоджуєтеся з умовами використання та політикою конфіденційності DIA Consulting.</small>
  </div><aside className="login-side"><span className="eyebrow">DIALOG В ОДНОМУ ВІКНІ</span><h2>Кожна розмова<br/><em>має наступний крок.</em></h2><div className="login-preview"><span>Імовірність угоди</span><b>42%</b><i/><small>+24% можливого росту після контакту</small></div><p>Ваші дані зберігаються у захищеному робочому просторі.</p></aside></section></Shell>;
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
  const enterTimer = useRef();

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

  return <div className={`route-transition ${transition} ${direction}`}>
    <Routes location={shownLocation}>
      <Route path="/" element={<Overview/>}/>
      <Route path="/dialogs" element={<Dialogs/>}/>
      <Route path="/dialogs/preview" element={<Navigate to="/dialogs" replace/>}/>
      <Route path="/dialogs/:id" element={<Detail/>}/>
      <Route path="/settings" element={<Settings/>}/>
      <Route path="/login" element={<Login/>}/>
      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Routes>
  </div>;
}
