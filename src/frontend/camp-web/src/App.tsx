import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPublicEvent, getPublicEvents, getPublicSiteSettings } from './lib/api';
import { lkBaseUrl } from './lib/config';
import type {
  PublicEventContentBlock,
  PublicEventDetails,
  PublicEventMediaItem,
  PublicSiteSocialLink,
} from './types';

const fallbackHighlights = [
  'Походы, выезды и братское общение среди гор, леса и свежего воздуха.',
  'Поклонение, молитва, наставничество и живая церковная атмосфера.',
  'Понятная регистрация, личный кабинет и вся организационная часть в одном месте.',
];

const fallbackThingsToBring = [
  'Спальник, коврик, удобную одежду и тёплые вещи на вечер.',
  'Средства личной гигиены, дождевик и личную аптечку при необходимости.',
  'Библию, блокнот, ручку и открытое сердце к Богу и людям.',
];

const fallbackFaq = [
  {
    question: 'Зачем здесь личный кабинет?',
    answer:
      'Через кабинет участник заполняет анкету, следит за статусом заявки, получает уведомления и не теряет важные организационные детали.',
  },
  {
    question: 'Можно ли вести несколько событий сразу?',
    answer:
      'Да. Сайт уже поддерживает не один лагерь, а сезоны, ретриты, конференции и другие церковные поездки.',
  },
  {
    question: 'Что появится здесь дальше?',
    answer:
      'Фотографии, видео, расписание, тарифы и другие живые материалы по каждому мероприятию будут собираться в одной карточке события.',
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

function getSocialLinksForPlacement(links: PublicSiteSocialLink[] | undefined, placement: 'header' | 'footer') {
  return (links ?? []).filter((item) => (placement === 'header' ? item.showInHeader : item.showInFooter));
}

function isDirectVideoFile(url: string) {
  return /\.(mp4|webm|ogg)(\?.*)?$/i.test(url);
}

function resolveVideoEmbedUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (url.pathname === '/watch') {
        const id = url.searchParams.get('v');
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }

      if (url.pathname.startsWith('/embed/')) {
        return rawUrl;
      }
    }

    if (host === 'rutube.ru') {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'video' && parts[1]) {
        return `https://rutube.ru/play/embed/${parts[1]}`;
      }

      if (parts[0] === 'play' && parts[1] === 'embed' && parts[2]) {
        return rawUrl;
      }
    }

    if (host === 'vimeo.com') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }

  return null;
}

function splitMedia(items: PublicEventMediaItem[]) {
  return {
    images: items.filter((item) => item.type === 'Image'),
    videos: items.filter((item) => item.type === 'Video'),
  };
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

  const siteSettingsQuery = useQuery({
    queryKey: ['public-site-settings'],
    queryFn: getPublicSiteSettings,
    retry: false,
  });

  const events = eventsQuery.data?.events ?? [];
  const details = featuredEventQuery.data;
  const siteSettings = siteSettingsQuery.data;
  const headerSocials = getSocialLinksForPlacement(siteSettings?.socialLinks, 'header');
  const footerSocials = getSocialLinksForPlacement(siteSettings?.socialLinks, 'footer');
  const highlights = getBlocks(details, 'Highlight');
  const thingsToBring = getBlocks(details, 'WhatToBring');
  const faqBlocks = details?.contentBlocks
    .filter((block) => block.blockType === 'Faq')
    .map((block) => ({
      question: block.title || 'Вопрос',
      answer: block.body,
    })) ?? [];
  const { images: imageItems, videos: videoItems } = splitMedia(details?.mediaItems ?? []);

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
          {details?.mediaItems.length ? <a href="#media">Медиа</a> : null}
          <a href="#program">Программа</a>
          <a href="#faq">FAQ</a>
          <a className="nav-cta" href={featuredEvent ? `${lkBaseUrl}/camp-registration?event=${featuredEvent.slug}` : `${lkBaseUrl}/register`}>
            Регистрация
          </a>
        </nav>

        {headerSocials.length ? (
          <div className="header-socials">
            {headerSocials.map((item) => (
              <a className={`social-link social-link-${item.preset}`} href={item.url} key={item.id} target="_blank" rel="noreferrer">
                {item.label}
              </a>
            ))}
          </div>
        ) : null}
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <p className="eyebrow">{featuredEvent?.seasonLabel || featuredEvent?.seriesTitle || 'Blagodaty events'}</p>
            <h1>{featuredEvent?.title || 'Сезоны, поездки и церковные события'}</h1>
            <p className="hero-lead">
              {details?.shortDescription ||
                featuredEvent?.shortDescription ||
                'Система мероприятий с понятными датами, тарифами, заявками, медиа и личным кабинетом для участников.'}
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
                Здесь можно вести не один лагерь, а сразу несколько сезонов и событий: открывать регистрацию по датам,
                показывать тарифы, публиковать фото и видео и направлять человека прямо в нужную анкету.
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

        {details?.mediaItems.length ? (
          <section className="timeline-section" id="media">
            <div className="section-heading">
              <p className="section-kicker">Медиа</p>
              <h2>Фото и видео атмосферы события</h2>
            </div>

            {imageItems.length ? (
              <div className="media-gallery">
                {imageItems.map((item) => (
                  <a className="media-card media-card-image" href={item.url} key={item.id} target="_blank" rel="noreferrer">
                    <img src={item.url} alt={item.title || details?.title || 'Фото события'} loading="lazy" />
                    <div className="media-card-copy">
                      <strong>{item.title || 'Фотография события'}</strong>
                      {item.caption ? <span>{item.caption}</span> : null}
                    </div>
                  </a>
                ))}
              </div>
            ) : null}

            {videoItems.length ? (
              <div className="video-grid">
                {videoItems.map((item) => {
                  const embedUrl = resolveVideoEmbedUrl(item.url);

                  return (
                    <article className="video-card" key={item.id}>
                      <div className="video-frame">
                        {embedUrl ? (
                          <iframe
                            src={embedUrl}
                            title={item.title || 'Видео события'}
                            loading="lazy"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                          />
                        ) : isDirectVideoFile(item.url) ? (
                          <video controls preload="metadata" poster={item.thumbnailUrl || undefined}>
                            <source src={item.url} />
                          </video>
                        ) : (
                          <a className="video-fallback" href={item.url} target="_blank" rel="noreferrer">
                            Открыть видео
                          </a>
                        )}
                      </div>

                      <div className="media-card-copy">
                        <strong>{item.title || 'Видео события'}</strong>
                        {item.caption ? <span>{item.caption}</span> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="timeline-section" id="events">
          <div className="section-heading">
            <p className="section-kicker">События</p>
            <h2>Текущие сезоны и предстоящие мероприятия</h2>
          </div>

          <div className="timeline-grid">
            {events.length ? (
              events.map((eventItem) => (
                <article className="timeline-card" key={eventItem.id}>
                  {eventItem.primaryImageUrl ? (
                    <div className="timeline-media">
                      <img src={eventItem.primaryImageUrl} alt={eventItem.title} loading="lazy" />
                    </div>
                  ) : null}
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

      {siteSettings?.socialLinksEnabled && (footerSocials.length || siteSettings?.socialLinksTitle || siteSettings?.socialLinksDescription) ? (
        <footer className="site-footer">
          <div className="site-footer-copy">
            <p className="section-kicker">{siteSettings?.socialLinksTitle || 'Мы на связи'}</p>
            <p>{siteSettings?.socialLinksDescription || 'Следите за новостями, объявлениями и новыми событиями общины.'}</p>
          </div>

          {footerSocials.length ? (
            <div className="footer-socials">
              {footerSocials.map((item) => (
                <a className={`social-link social-link-${item.preset}`} href={item.url} key={item.id} target="_blank" rel="noreferrer">
                  {item.label}
                </a>
              ))}
            </div>
          ) : null}
        </footer>
      ) : null}
    </div>
  );
}
