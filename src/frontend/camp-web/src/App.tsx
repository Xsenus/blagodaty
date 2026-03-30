import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPublicEvent, getPublicEvents } from './lib/api';
import { lkBaseUrl } from './lib/config';
import type { PublicEventContentBlock, PublicEventDetails } from './types';

const fallbackHighlights = [
  'Походы и выезды в горы Алтая вместе с церковной командой.',
  'Палатки, домики, костры и теплые вечерние встречи под открытым небом.',
  'Поклонение, молитва, наставничество и живое братское общение.',
];

const fallbackThingsToBring = [
  'Спальник, коврик, фонарик и базовую походную одежду.',
  'Средства личной гигиены, теплые вещи и дождевик на случай перемены погоды.',
  'Библию, блокнот, ручку и открытое сердце к Богу и людям.',
];

const fallbackFaq = [
  {
    question: 'Зачем отдельный личный кабинет?',
    answer:
      'Через кабинет участник сможет заполнить анкету, получить подтверждение, видеть статус заявки и позже читать организационные сообщения.',
  },
  {
    question: 'Можно сначала просто посмотреть мероприятия?',
    answer:
      'Да. Эта страница нужна как понятная входная точка: описание события, атмосфера, даты, тарифы и переход к регистрации тогда, когда человек уже готов.',
  },
  {
    question: 'Будут ли здесь и другие события?',
    answer:
      'Да. Теперь сайт умеет показывать не только один лагерь, но и сезоны, ретриты, конференции и другие церковные поездки.',
  },
];

function formatDateRange(startsAtUtc?: string | null, endsAtUtc?: string | null) {
  if (!startsAtUtc) {
    return 'Даты уточняются';
  }

  const formatter = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const starts = formatter.format(new Date(startsAtUtc));
  return endsAtUtc ? `${starts} - ${formatter.format(new Date(endsAtUtc))}` : starts;
}

function formatCurrency(value?: number | null, currency = 'RUB') {
  if (value === null || value === undefined) {
    return 'По запросу';
  }

  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function getBlocks(details: PublicEventDetails | undefined, blockType: PublicEventContentBlock['blockType']) {
  return details?.contentBlocks.filter((block) => block.blockType === blockType).map((block) => block.body) ?? [];
}

export default function App() {
  const eventsQuery = useQuery({
    queryKey: ['public-events'],
    queryFn: getPublicEvents,
    retry: false,
  });

  const featuredEvent = useMemo(() => {
    const events = eventsQuery.data?.events ?? [];
    return events.find((event) => event.isRegistrationOpen) ?? events[0] ?? null;
  }, [eventsQuery.data]);

  const featuredEventQuery = useQuery({
    queryKey: ['public-event', featuredEvent?.slug],
    queryFn: () => getPublicEvent(featuredEvent!.slug),
    enabled: Boolean(featuredEvent?.slug),
    retry: false,
  });

  const events = eventsQuery.data?.events ?? [];
  const details = featuredEventQuery.data;
  const highlights = getBlocks(details, 'Highlight');
  const thingsToBring = getBlocks(details, 'WhatToBring');
  const faqBlocks = details?.contentBlocks
    .filter((block) => block.blockType === 'Faq')
    .map((block) => ({
      question: block.title || 'Вопрос',
      answer: block.body,
    })) ?? [];

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
            <p className="brand-title">Events</p>
          </div>
        </div>

        <nav className="site-nav">
          <a href="#events">События</a>
          <a href="#program">Программа</a>
          <a href="#faq">FAQ</a>
          <a className="nav-cta" href={featuredEvent ? `${lkBaseUrl}/camp-registration?event=${featuredEvent.slug}` : `${lkBaseUrl}/register`}>
            Регистрация
          </a>
        </nav>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <p className="eyebrow">{featuredEvent?.seasonLabel || featuredEvent?.seriesTitle || 'Blagodaty events'}</p>
            <h1>{featuredEvent?.title || 'Сезоны, поездки и церковные события'}</h1>
            <p className="hero-lead">
              {details?.shortDescription || featuredEvent?.shortDescription || 'Система мероприятий с понятными датами, тарифами, заявками и личным кабинетом для участников.'}
            </p>

            <div className="hero-actions">
              <a
                className="button button-primary"
                href={featuredEvent ? `${lkBaseUrl}/camp-registration?event=${featuredEvent.slug}` : `${lkBaseUrl}/register`}
              >
                Подать заявку
              </a>
              <a className="button button-secondary" href={`${lkBaseUrl}/login`}>
                Войти в кабинет
              </a>
            </div>

            <div className="hero-meta">
              <span>{details?.location || featuredEvent?.location || 'Локация уточняется'}</span>
              <span>{formatDateRange(details?.startsAtUtc || featuredEvent?.startsAtUtc, details?.endsAtUtc || featuredEvent?.endsAtUtc)}</span>
              <span>{formatCurrency(featuredEvent?.priceFromAmount, featuredEvent?.priceCurrency || 'RUB')}</span>
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
                Теперь здесь можно вести не один лагерь, а сразу несколько сезонов и событий: открывать регистрацию по датам,
                показывать тарифы и направлять человека прямо в нужную анкету.
              </p>
            </div>
          </div>
        </section>

        <section className="facts-grid">
          <article className="fact-card">
            <p>Активных событий</p>
            <strong>{events.length}</strong>
          </article>
          <article className="fact-card">
            <p>Ближайшая серия</p>
            <strong>{featuredEvent?.seriesTitle || 'Blagodaty events'}</strong>
          </article>
          <article className="fact-card">
            <p>Статус окна</p>
            <strong>
              {featuredEvent?.isRegistrationOpen
                ? featuredEvent.isRegistrationClosingSoon
                  ? 'Скоро закрывается'
                  : 'Регистрация открыта'
                : 'Регистрация закрыта'}
            </strong>
          </article>
          <article className="fact-card">
            <p>Мест осталось</p>
            <strong>{featuredEvent?.remainingCapacity ?? featuredEvent?.capacity ?? 'Без лимита'}</strong>
          </article>
        </section>

        <section className="timeline-section" id="events">
          <div className="section-heading">
            <p className="section-kicker">События</p>
            <h2>Текущие сезоны и предстоящие мероприятия</h2>
          </div>

          <div className="timeline-grid">
            {events.length ? (
              events.map((eventItem) => (
                <article className="timeline-card" key={eventItem.id}>
                  <h3>{eventItem.title}</h3>
                  <p>{eventItem.shortDescription}</p>
                  <p>{formatDateRange(eventItem.startsAtUtc, eventItem.endsAtUtc)}</p>
                  <p>{eventItem.location || 'Локация уточняется'}</p>
                  <p>{formatCurrency(eventItem.priceFromAmount, eventItem.priceCurrency || 'RUB')}</p>
                  <div className="hero-actions" style={{ marginTop: 12 }}>
                    <a className="button button-secondary" href={`${lkBaseUrl}/camp-registration?event=${eventItem.slug}`}>
                      Открыть регистрацию
                    </a>
                  </div>
                </article>
              ))
            ) : (
              <article className="timeline-card">
                <h3>События скоро появятся</h3>
                <p>Команда уже готовит новые карточки мероприятий. Пока можно открыть личный кабинет и следить за обновлениями.</p>
              </article>
            )}
          </div>
        </section>

        <section className="content-grid" id="program">
          <article className="content-panel">
            <p className="section-kicker">Что важно сразу</p>
            <h2>{featuredEvent?.title || 'Главное о ближайшем событии'}</h2>
            <ul>
              {(highlights.length ? highlights : fallbackHighlights).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="content-panel checklist-panel">
            <p className="section-kicker">Что взять с собой</p>
            <h2>Организационная часть останется ясной и спокойной</h2>
            <ul>
              {(thingsToBring.length ? thingsToBring : fallbackThingsToBring).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </section>

        <section className="timeline-section">
          <div className="section-heading">
            <p className="section-kicker">Программа</p>
            <h2>Ключевые этапы ближайшего события</h2>
          </div>

          <div className="timeline-grid">
            {details?.scheduleItems.length ? (
              details.scheduleItems.slice(0, 4).map((item) => (
                <article className="timeline-card" key={item.id}>
                  <h3>{item.title}</h3>
                  <p>{formatDateRange(item.startsAtUtc, item.endsAtUtc || item.startsAtUtc)}</p>
                  <p>{item.location || item.notes || 'Подробности появятся ближе к дате события.'}</p>
                </article>
              ))
            ) : (
              fallbackHighlights.map((item) => (
                <article className="timeline-card" key={item}>
                  <h3>Ближайшая программа</h3>
                  <p>{item}</p>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="faq-section" id="faq">
          <div className="section-heading">
            <p className="section-kicker">FAQ</p>
            <h2>Что уже продумано на старте</h2>
          </div>

          <div className="faq-grid">
            {(faqBlocks.length ? faqBlocks : fallbackFaq).map((item) => (
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
            <h2>Выберите нужное событие и переходите к анкете уже в нужный сезон</h2>
          </div>

          <div className="hero-actions">
            <a
              className="button button-primary"
              href={featuredEvent ? `${lkBaseUrl}/camp-registration?event=${featuredEvent.slug}` : `${lkBaseUrl}/register`}
            >
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
