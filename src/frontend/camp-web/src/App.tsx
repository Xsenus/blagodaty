import { useQuery } from '@tanstack/react-query';
import { getCampOverview } from './lib/api';
import { lkBaseUrl } from './lib/config';
import type { CampOverview } from './types';

const fallbackOverview: CampOverview = {
  name: 'Blagodaty Camp',
  season: 'Лето 2026',
  tagline:
    'Поездка церковью в Горный Алтай: горы, палатки, домики, костры, молитва и теплое братское общение.',
  location: 'Горный Алтай',
  suggestedDonation: 32000,
  startsAtUtc: '2026-07-15T08:00:00Z',
  endsAtUtc: '2026-07-23T08:00:00Z',
  highlights: [
    'Походы, прогулки по горным маршрутам и время вдали от городской суеты.',
    'Сочетание палаточного формата и спокойных домиков для разных участников поездки.',
    'Живая церковная атмосфера: молитва, наставничество, вечерние беседы и служение.',
  ],
  thingsToBring: [
    'Спальник, коврик, фонарик и базовую походную одежду.',
    'Теплые вещи, дождевик, удобную обувь и личную гигиену.',
    'Библию, блокнот, ручку и открытость к Богу и людям.',
  ],
};

const timeline = [
  {
    title: 'До выезда',
    text: 'Регистрируемся, подтверждаем поездку и собираем важную медицинскую и контактную информацию.',
  },
  {
    title: 'Путь и размещение',
    text: 'Команда встречает участников, помогает с заселением и знакомит с пространством лагеря.',
  },
  {
    title: 'Дни в лагере',
    text: 'Молитвы, общие собрания, прогулки, походные активности, костры и время для настоящего общения.',
  },
  {
    title: 'После возвращения',
    text: 'В личном кабинете сохраняются статусы заявки, оргсообщения и дальнейшая коммуникация команды.',
  },
];

const experienceCards = [
  {
    label: 'Что это за проект',
    value: 'Летняя поездка церкви на Алтай',
  },
  {
    label: 'Для кого',
    value: 'Для молодежи, семей и друзей церкви',
  },
  {
    label: 'Формат проживания',
    value: 'Палатки и домики',
  },
  {
    label: 'Ключевая цель',
    value: 'Сообщество, вера, отдых и регистрация в одном пространстве',
  },
];

const faqItems = [
  {
    question: 'Зачем отдельный личный кабинет?',
    answer:
      'Через кабинет участник сможет заполнить анкету, получить подтверждение, видеть статус заявки и позже читать организационные сообщения.',
  },
  {
    question: 'Можно сначала просто посмотреть лагерь?',
    answer:
      'Да. Camp-сайт работает как понятная входная точка: описание поездки, атмосфера, условия и переход в кабинет тогда, когда человек готов.',
  },
  {
    question: 'Что будет дальше по проекту?',
    answer:
      'Следующие этапы: полноценная регистрация, админка команды, уведомления, сценарии оплаты и расширенная работа с участниками.',
  },
];

function formatDateRange(startsAtUtc: string, endsAtUtc: string) {
  const formatter = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  });

  return `${formatter.format(new Date(startsAtUtc))} - ${formatter.format(new Date(endsAtUtc))}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value);
}

export default function App() {
  const overviewQuery = useQuery({
    queryKey: ['camp-overview'],
    queryFn: getCampOverview,
    retry: false,
  });

  const overview = overviewQuery.data ?? fallbackOverview;
  const dateRange = formatDateRange(overview.startsAtUtc, overview.endsAtUtc);

  return (
    <div className="page-shell">
      <div className="ambient ambient-left" aria-hidden="true" />
      <div className="ambient ambient-right" aria-hidden="true" />
      <div className="particles" aria-hidden="true" />

      <header className="site-header">
        <div className="brand-lockup">
          <span className="brand-mark">B</span>
          <div>
            <p className="brand-kicker">Blagodaty</p>
            <p className="brand-title">Camp</p>
          </div>
        </div>

        <nav className="site-nav">
          <a href="#program">Программа</a>
          <a href="#conditions">Условия</a>
          <a href="#faq">FAQ</a>
          <a className="nav-cta" href={`${lkBaseUrl}/register`}>
            Регистрация
          </a>
        </nav>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <p className="eyebrow">{overview.season}</p>
            <h1>{overview.name}</h1>
            <p className="hero-lead">{overview.tagline}</p>

            <div className="hero-actions">
              <a className="button button-primary" href={`${lkBaseUrl}/register`}>
                Подать заявку
              </a>
              <a className="button button-secondary" href={`${lkBaseUrl}/login`}>
                Войти в кабинет
              </a>
            </div>

            <div className="hero-meta">
              <span>{overview.location}</span>
              <span>{dateRange}</span>
              <span>{formatCurrency(overview.suggestedDonation)}</span>
            </div>
          </div>

          <div className="hero-card">
            <div className="sun" aria-hidden="true" />
            <div className="mountain-stack" aria-hidden="true">
              <span className="mountain mountain-back" />
              <span className="mountain mountain-mid" />
              <span className="mountain mountain-front" />
            </div>

            <div className="hero-panel">
              <p className="panel-title">Зачем этот сайт</p>
              <p className="panel-text">
                Мы строим не просто лендинг, а понятную современную систему: описание поездки,
                регистрация, личный кабинет и дальнейшая коммуникация с участниками.
              </p>
            </div>
          </div>
        </section>

        <section className="facts-grid">
          {experienceCards.map((item) => (
            <article className="fact-card" key={item.label}>
              <p>{item.label}</p>
              <strong>{item.value}</strong>
            </article>
          ))}
        </section>

        <section className="content-grid" id="program">
          <article className="content-panel">
            <p className="section-kicker">Основа структуры</p>
            <h2>Сайт будет не про формальную анкету, а про путь участника</h2>
            <p>
              Мы сохраняем важное: описание поездки, даты, условия, список вещей, регистрацию и
              кабинет. Но визуально проект уходит в более живую, теплую и современную сторону.
            </p>
          </article>

          <article className="content-panel checklist-panel">
            <p className="section-kicker">Что важно сразу</p>
            <ul>
              {overview.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </section>

        <section className="timeline-section" id="conditions">
          <div className="section-heading">
            <p className="section-kicker">Маршрут продукта</p>
            <h2>Мы сразу строим не просто промостраницу, а систему лагеря</h2>
          </div>

          <div className="timeline-grid">
            {timeline.map((step) => (
              <article className="timeline-card" key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="content-grid dual-layout">
          <article className="content-panel">
            <p className="section-kicker">Список вещей</p>
            <h2>Организационная часть останется ясной и спокойной</h2>
            <ul>
              {overview.thingsToBring.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="content-panel status-panel">
            <p className="section-kicker">Личный кабинет</p>
            <h2>Через lk участник сможет</h2>
            <ul>
              <li>создать аккаунт и войти</li>
              <li>заполнить анкету для поездки</li>
              <li>обновлять профиль и контакты</li>
              <li>видеть статус своей заявки</li>
            </ul>
          </article>
        </section>

        <section className="faq-section" id="faq">
          <div className="section-heading">
            <p className="section-kicker">FAQ</p>
            <h2>Что уже продумано на старте</h2>
          </div>

          <div className="faq-grid">
            {faqItems.map((item) => (
              <article className="faq-card" key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="cta-section">
          <div>
            <p className="section-kicker">Следующий шаг</p>
            <h2>Регистрация и дальнейшее сопровождение уже идут через личный кабинет</h2>
          </div>

          <div className="hero-actions">
            <a className="button button-primary" href={`${lkBaseUrl}/register`}>
              Перейти к регистрации
            </a>
            <a className="button button-secondary" href={`${lkBaseUrl}/dashboard`}>
              Открыть кабинет
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
