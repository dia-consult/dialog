import { useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom';
import './interface-scale.css';

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

function Settings() { return <Shell><section className="page settings"><span className="eyebrow">РОБОЧИЙ ПРОСТІР</span><h1>Налаштування</h1><p>Керуйте доступами, інтеграціями, параметрами оцінки та DIA-балами.</p><div className="settings-layout"><aside><a href="#profile">Акаунт</a><a href="#interface">Розмір інтерфейсу</a><a href="#team">Команда й ролі</a><a href="#score">Оцінка діалогів</a><a href="#integrations">Інтеграції</a><a href="#billing">Тарифи й ліміти</a><a href="#help">Інструкції</a></aside><div className="settings-content"><section id="profile"><span className="eyebrow">АКАУНТ</span><h2>Профіль і доступ</h2><p>Безпечний вхід і сесія для вашого робочого простору.</p><NavLink className="lime button" to="/login">Увійти до робочого простору</NavLink></section><InterfaceSizeControl/><section id="team"><span className="eyebrow">ДОСТУПИ</span><h2>Команда й ролі</h2><div className="role-grid">{[['Менеджер','Власні діалоги й прогрес'],['Керівник','Команда, оцінки та рекомендації'],['Адміністратор','Користувачі, інтеграції, тарифи']].map(([r,d])=><article key={r}><b>{r}</b><h3>{d}</h3><p>Налаштований рівень доступу для роботи у Dialog.</p></article>)}</div></section><section id="integrations"><span className="eyebrow">ДЖЕРЕЛА ДАНИХ</span><h2>Інтеграції</h2><p>Ringostat підключено на сервері. Дані зберігаються в PostgreSQL і будуть показані лише після входу.</p></section><section id="billing"><span className="eyebrow">DIA-БАЛИ</span><h2>Баланс і тарифи</h2><p>68% DIA-балів залишилося у вашому поточному плані.</p><div className="plans"><b>Starter · $99</b><b>Growth · $349</b><b>Scale · $799</b></div></section></div></div></section></Shell>; }

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
