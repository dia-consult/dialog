import { useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import './interface-scale.css';

const nav = [
  ['/', 'Огляд'],
  ['/dialogs', 'Діалоги'],
  ['/settings', 'Налаштування']
];

const demoDialogs = [
  ['Сьогодні, 10:42', 'Олексій К.', 'Дзвінок · 12 хв', 'Анна К.', '18%', 'Не виявлено потребу — немає наступного кроку', 'risk'],
  ['Сьогодні, 09:15', 'Марія В.', 'Telegram · 18 повідомлень', 'Ольга М.', '34%', 'Не зафіксовано наступний крок', 'mid'],
  ['Учора, 17:26', 'Ірина С.', 'Дзвінок · 8 хв', 'Дмитро П.', '41%', 'Не запропоновано cross-sell', 'mid'],
  ['Учора, 16:03', 'Дмитро П.', 'Дзвінок · 14 хв', 'Анна К.', '83%', 'Гарне відпрацювання, домовлено про зустріч', 'good']
];

const interfaceScales = [
  { id: 'compact', value: '0.9', label: 'Компактний', note: 'Більше даних на екрані' },
  { id: 'standard', value: '1', label: 'Стандартний', note: 'Збалансований вигляд' },
  { id: 'large', value: '1.08', label: 'Великий', note: 'Зручніше читати текст' }
];

function getInterfaceScale() {
  const stored = localStorage.getItem('dialog-interface-scale');
  return interfaceScales.some((item) => item.value === stored) ? stored : '1';
}

function applyInterfaceScale(value) {
  document.documentElement.style.setProperty('--ui-scale', value);
  localStorage.setItem('dialog-interface-scale', value);
}

function InterfaceSizeControl() {
  const [selected, setSelected] = useState(getInterfaceScale);
  const chooseScale = (value) => {
    setSelected(value);
    applyInterfaceScale(value);
  };

  return <section id="interface" className="interface-size">
    <span className="eyebrow">ВИГЛЯД</span>
    <h2>Розмір інтерфейсу</h2>
    <p>Налаштуйте масштаб Dialog під свій екран. Зміна застосовується одразу на всіх сторінках.</p>
    <div className="scale-options" role="radiogroup" aria-label="Розмір інтерфейсу">
      {interfaceScales.map((item) => <button type="button" role="radio" aria-checked={selected === item.value} className={selected === item.value ? 'selected' : ''} onClick={() => chooseScale(item.value)} key={item.id}>
        <span className="scale-preview" style={{ '--preview-scale': item.value }}><i/><i/><i/></span>
        <b>{item.label}</b><small>{item.note}</small>
      </button>)}
    </div>
  </section>;
}

function Shell({ children }) {
  const [noticeOpen, setNoticeOpen] = useState(false);
  return <main className="app-shell">
    <header className="app-header">
      <NavLink to="/" className="brand" aria-label="Dialog"><img src="/dialog-logo-final.svg" alt="dialog" /></NavLink>
      <nav className="main-nav">{nav.map(([to, title]) => <NavLink key={to} to={to} end={to === '/'}>{title}</NavLink>)}</nav>
      <div className="header-tools">
        <NavLink to="/settings#billing" className="balance" title="DIA-бали"><span className="liquid" /><b>68%</b></NavLink>
        <button className="bell" onClick={() => setNoticeOpen(v => !v)} aria-label="Сповіщення">♧<i /></button>
        <NavLink className="avatar" to="/settings#profile">D</NavLink>
        {noticeOpen && <div className="notice-pop"><strong>Останні події</strong><p>Ringostat підключено</p><p>Дані будуть доступні після входу</p></div>}
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
  const rows = demoDialogs.filter(d => d[1].toLowerCase().includes(query.toLowerCase()));
  return <Shell><section className="page"><span className="eyebrow">РОБОЧИЙ ПРОСТІР · ДІАЛОГИ</span><h1>Усі діалоги</h1><p>Реальні дзвінки та листування будуть доступні після авторизації.</p>
    <div className="filters"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Пошук клієнта або менеджера"/><button>Усі канали⌄</button><button>Сьогодні⌄</button><button>Усі менеджери⌄</button><button className="outline">Потребують уваги&nbsp; 12</button><button className="lime">↑ Завантажити з ПК</button></div>
    <div className="legend"><i className="green"/>75–100% висока імовірність <i className="amber"/>50–74% можна покращити <i className="red"/>0–49% потрібна увага</div>
    <div className="table"><div className="table-head"><span>Діалог ↕</span><span>Клієнт / канал</span><span>Менеджер</span><span>Імовірність угоди</span><span>DIA-висновок</span><span/></div>{rows.map((d) => <div className="dialog-row" key={d[1]}><span>{d[0]}</span><span><b>{d[1]}</b><small>{d[2]}</small></span><span>{d[3]}</span><span className={`score ${d[6]}`}>{d[4]}</span><span className={`insight ${d[6]}`}>{d[5]}</span><NavLink to="/dialogs/preview">Детальніше →</NavLink></div>)}</div>
  </section></Shell>;
}

function Settings() { return <Shell><section className="page settings"><span className="eyebrow">РОБОЧИЙ ПРОСТІР</span><h1>Налаштування</h1><p>Керуйте доступами, інтеграціями, параметрами оцінки та DIA-балами.</p><div className="settings-layout"><aside><a href="#profile">Акаунт</a><a href="#interface">Розмір інтерфейсу</a><a href="#team">Команда й ролі</a><a href="#score">Оцінка діалогів</a><a href="#integrations">Інтеграції</a><a href="#billing">Тарифи й ліміти</a><a href="#help">Інструкції</a></aside><div className="settings-content"><section id="profile"><span className="eyebrow">АКАУНТ</span><h2>Профіль і доступ</h2><p>Stytch забезпечує безпечний вхід та сесію робочого простору.</p><NavLink className="lime button" to="/login">Увійти через Stytch</NavLink></section><InterfaceSizeControl/><section id="team"><span className="eyebrow">ДОСТУПИ</span><h2>Команда й ролі</h2><div className="role-grid">{[['Менеджер','Власні діалоги й прогрес'],['Керівник','Команда, оцінки та рекомендації'],['Адміністратор','Користувачі, інтеграції, тарифи']].map(([r,d])=><article key={r}><b>{r}</b><h3>{d}</h3><p>Налаштований рівень доступу для роботи у Dialog.</p></article>)}</div></section><section id="integrations"><span className="eyebrow">ДЖЕРЕЛА ДАНИХ</span><h2>Інтеграції</h2><p>Ringostat підключено на сервері. Дані зберігаються в PostgreSQL і будуть показані лише після входу.</p></section><section id="billing"><span className="eyebrow">DIA-БАЛИ</span><h2>Баланс і тарифи</h2><p>68% DIA-балів залишилося у вашому поточному плані.</p><div className="plans"><b>Starter · $99</b><b>Growth · $349</b><b>Scale · $799</b></div></section></div></div></section></Shell>; }

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

function Detail() { return <Shell><section className="page"><NavLink className="back" to="/dialogs">← Усі діалоги</NavLink><span className="eyebrow">ДЕТАЛЬНИЙ DIA-АНАЛІЗ</span><h1>Розмова з Олексієм К.</h1><div className="player"><div><b>Олексій К.</b><small>+38 067 123 45 67 · 4 попередні контакти</small></div><button>Транскрипція</button><div className="wave">▮▯▮▮▯▮▯▮▮▯▮▯▮</div><div className="timeline">▶ <i/> <i/> <i/></div></div><div className="analysis-grid"><article><span className="eyebrow coral">ІМОВІРНІСТЬ ЦЬОГО ДЗВІНКА</span><strong className="big coral">18%</strong><p>Менеджер встановив контакт, але не виявив потребу та не зафіксував наступний крок.</p></article><article className="deal"><span className="eyebrow">ІМОВІРНІСТЬ УГОДИ</span><strong className="big">42%</strong><p>Ураховано 5 дзвінків і листувань у воронці.</p></article></div></section></Shell>; }

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
      <Route path="/dialogs/preview" element={<Detail/>}/>
      <Route path="/settings" element={<Settings/>}/>
      <Route path="/login" element={<Login/>}/>
      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Routes>
  </div>;
}
