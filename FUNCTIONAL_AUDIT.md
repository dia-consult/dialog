# Dialog — функціональний аудит: що потрібно клієнту, але не працює

Дата: 6 серпня 2026 · Обсяг: поточний репозиторій UI-прототипу.

## Головний висновок

Поточний Dialog — **інтерактивний статичний прототип**, а не робочий SaaS. Інтерфейс добре демонструє цільовий сценарій, але дані фіксовані у HTML, а більшість дій показують toast або змінюють локальний стан DOM. У репозиторії немає API-викликів, сервера, БД, авторизації, файлового сховища, черг обробки, реального плеєра, транскрипції чи інтеграцій.

Отже, до продажу як продукту треба не «додати ще екрани», а реалізувати наскрізний customer workflow: **підключити/завантажити розмову → обробити → побачити перевірюваний висновок → призначити дію → відстежити результат**.

## P0 — клієнт очікує це в першу чергу, але зараз функції немає

| Customer job | Що видно в UI | Реальний стан | Що має працювати для MVP |
|---|---|---|---|
| Підключити джерело дзвінків/чатів | Кнопки «Підключити» для Telegram, WhatsApp, Binotel тощо | Форма приймає API key і показує повідомлення; ключ не зберігається, перевірки підключення немає | OAuth/API-key flow на сервері, encrypted secrets, connection test, sync status, помилка й reconnect |
| Завантажити розмову | «Додати діалог» з вибором файлу | Файл не читається і нікуди не надсилається | Upload у scoped storage, virus/type/size validation, status processing/error, retry, видалення |
| Отримати аналіз дзвінка | Оцінка, ризики, next action, probability | Усі результати задані у HTML; AI не викликається | Transcription + rubric evaluation; versioned prompt/model; timestamped evidence; latency/cost/status |
| Прослухати і перевірити висновок | Waveform, play, markers, «Транскрипція» | `play` лише міняє символ і показує toast; аудіо та транскрипту немає | Streaming/download із авторизацією, seek до timestamp, speaker labels, transcript search, evidence jump-to-source |
| Побачити власні діалоги | Таблиця, фільтри, 86 діалогів | П’ять статичних рядків; пошук не працює, фільтри не фільтрують, усі деталі ведуть на той самий приклад | Tenant-scoped list API, pagination, search, filters, sort, stable IDs та individual detail pages |
| Перетворити insight на результат | «Створити задачу», рекомендації | Кнопка «Створити задачу» не має handler; task/CRM-об’єкта немає | Task із owner/due date/status, in-app follow-up або CRM write-back, approval перед автоматичною зміною |
| Побачити достовірну командну аналітику | KPI, динаміка менеджерів, прогноз імовірності | Всі цифри фіксовані; перемикачі періоду тільки змінюють active-state | Calculation pipeline, визначення метрик, period comparison, drill-down до source dialogs, updated-at/data coverage |
| Безпечно працювати командою | Учасники, ролі, кастомна роль | Запрошення та ролі — лише UI/toast; акаунтів і доступів немає | Authentication, organization/workspace, invites, roles/permissions enforced on every API/storage/job |

## P1 — заявлена цінність є, але workflow обривається або оманливий

| Функція в UI | Фактична поведінка | Чому це боляче клієнту | Мінімальне виправлення |
|---|---|---|---|
| Збереження акаунту | «Зберегти зміни» показує toast; значення не переживають refresh | Клієнт втрачає налаштування й довіру | Persisted organization settings + validation + success/error state |
| Налаштування оцінки | Toggle змінюється тільки у браузері; ваги/readiness не зберігаються | Рубрика, за якою оцінюють команду, не контролюється | Versioned scorecard; total-weight validation; apply-from date; re-evaluate policy |
| Інтеграційні фільтри | Змінюють лише активний вигляд | Неможливо знайти/керувати каналами | Реальні filter query + connection health/status |
| Запрошення в команду | Email не надсилається, нового user немає | Адміністратор не може onboard команду | Invite token, email delivery, expiration/resend/revoke, membership state |
| Member menu | Будь-яка дія дає «Дію підготовлено» | Немає керування доступами | Role change, deactivate/remove, ownership safeguards, audit log |
| Custom role | Форма не зберігає role | Enterprise/agency user не може обмежити дані | Permission model і серверна перевірка прав |
| Експорт | Експортує вшитий CSV з трьома рядками | Потенційний витік/помилкова звітність | Permission-checked async export за реальним filter scope; audit record |
| Тарифи та WayForPay | Після «оплати» toast прямо каже, що потрібні server keys | Платіж не створюється, subscription не змінюється | Server-side order, signed callback/webhook verification, idempotency, invoice/status, access provisioning |
| SOS-розбір / навчання | Запит не створюється, матеріал не відкривається | Обіцяна premium-support цінність не доставляється | Ticket/request queue, entitlement check, expert assignment; hosted content/progress |
| Referral | Копіює посилання, метрики статичні | Немає attribution або reward ledger | Referral code, attribution rules, eligible payment event, immutable balance ledger |

## P1 — відсутні функції, без яких клієнт не довірятиме AI

- **Докази висновку:** кожен finding має показувати цитату/фрагмент, timestamp, speaker, scorecard criterion і версію оцінки. Зараз UI показує твердження без джерела.
- **Correct / dismiss feedback:** менеджер або керівник має підтвердити, спростувати чи відредагувати insight із причиною. Це потрібне і для довіри, і для вимірювання якості.
- **Стан обробки та помилки:** queued / transcribing / analyzing / completed / failed, причина помилки, retry; інакше при першому поганому файлі користувач не розуміє, що сталося.
- **Контекст угоди:** зв’язок контакту, account, opportunity і попередніх взаємодій із CRM; нинішня «воронка клієнта» — статична.
- **Контроль доступу до записів:** окремі права view/listen/download/export і маскування PII. Роль не повинна дорівнювати доступу до всього аудіо.

## P2 — після робочого першого vertical slice

- Автоматичне створення CRM changes/tasks (тільки opt-in й з approval на старті).
- Прогноз імовірності угоди: спершу довести calibration на історичних даних та показувати, з яких signal-ів висновок.
- Cross-sell recommendations: потрібні product/customer data, правила та вимірюваний incremental outcome.
- Multi-channel identity resolution: пов’язання одного клієнта між дзвінком, Telegram, WhatsApp та CRM з можливістю виправити match.
- Referral programme, SOS marketplace, навчальна бібліотека та інші monetization add-ons.

## Конкретні дефекти прототипу, які не можна видавати за готову функцію

1. У `interactions.js` усі mutation-операції (upload, connection, invite, save, roles, payments, SOS) завершуються лише toast-повідомленням; немає `fetch`, `XMLHttpRequest` чи іншого transport до сервера.
2. «Додати діалог» має `input[type=file]`, але handler не читає `files`; файл фактично ігнорується.
3. Кнопка плеєра в `interactions.js` лише перемикає `▶`/`Ⅱ`; елемента `<audio>` та медіаджерела немає.
4. У `dialogs-list.html` поле пошуку не має listener-а, а filters призначаються тільки в UI; таблиця не змінюється.
5. Усі посилання «Детальніше» відкривають один `dialog-analysis.html`, тому немає detail view конкретного діалогу.
6. «Створити задачу» у `dialog-analysis.html` не має selector/обробника в JS — навіть імітації створення немає.
7. `settings-preview.js` лише перемикає вкладки; збереження account/evaluation не має persistence.
8. Файл `dialogs-preview.html` — redirect на список, а не окрема функціональна сторінка.

## Рекомендований MVP для першого платного пілота

Не реалізовувати одночасно всі канали та add-ons. Обрати **одну телефонію (наприклад, Binotel) + один sales use case**: "після кожного дзвінка знайти відсутній next step / незакриту потребу та дати керівнику список follow-up".

| Етап | Acceptance criterion |
|---|---|
| 1. Workspace і доступ | Адмін створює організацію, запрошує менеджера; запити й файли ізольовані по tenant |
| 2. Ingestion | Новий call з обраної телефонії з’являється автоматично; дубль не створює другого запису |
| 3. Processing | Видно статус; щонайменше 95% валідних записів завершуються; failure має retry і діагностику |
| 4. Evidence analysis | Insight містить rubric, цитату/timestamp і link до конкретного audio moment |
| 5. Action loop | Керівник підтверджує finding і створює задачу/CRM draft; видно owner, due date і status |
| 6. Reporting | Dashboard агрегує тільки реальні processed dialogs, має фільтр періоду/менеджера та drill-down |

## Порядок реалізації

1. Backend foundation: tenant-aware auth/RBAC, data model, audited storage, API і migrations.
2. Один ingestion connector + file upload + processing status/retry.
3. Transcript/player + evidence-backed evaluation + quality feedback.
4. Dialog list/detail/search/filter із реальними даними.
5. Task/CRM loop і dashboard calculations.
6. Onboarding, billing/WayForPay, additional connectors та advanced roles — лише після успішного пілота.

## Як перевіряти готовність у демо

Для кожної заявленої функції тестувати на новому tenant і новому файлі/дзвінку: refresh сторінку, увійти іншим користувачем, перевірити, що дані persist; викликати помилку integration; спробувати доступ до чужого dialog URL; перейти від evidence до аудіо; створити task і перевірити її в CRM/списку. Якщо шлях не проходить без ручної підміни даних — це ще не продуктова функція.
