import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPublicEvent, getPublicEvents, getPublicSiteSettings } from './lib/api';
import { RegistrationModal } from './components/RegistrationModal';
import type {
  CampRegistration,
  PublicEventContentBlock,
  PublicEventDetails,
  PublicEventMediaItem,
  PublicSiteSocialLink,
} from './types';

const PLACE_URL = 'https://2gis.ru/gornoaltaysk/firm/70000001077460445/87.929919%2C50.228723';
const PLACE_REVIEWS_URL = 'https://2gis.ru/gornoaltaysk/firm/70000001077460445/tab/reviews';
const PLACE_PHOTOS_URL = 'https://2gis.ru/gornoaltaysk/firm/70000001077460445/tab/photos';
const PLACE_IMAGES: PublicEventMediaItem[] = [
  {
    id: 'ekoail-mountains',
    type: 'Image',
    url: 'https://i6.photo.2gis.com/main/branch/27/70000001077460445/common',
    title: 'Горный вид рядом с Экоаил',
    caption: 'Курай, Республика Алтай',
  },
  {
    id: 'ekoail-map',
    type: 'Image',
    url: 'https://share.api.2gis.ru/getimage?city=gornoaltaysk&zoom=17&center=87.929919%2C50.228723&title=%D0%AD%D0%BA%D0%BE%D0%B0%D0%B8%D0%BB&desc=%D0%A3%D0%BB%D0%B8%D1%86%D0%B0%20%D0%9C%D0%B8%D1%80%D0%B0%2C%C2%A07%D0%B0%3Cbr%20%2F%3E%D1%81.%C2%A0%D0%9A%D1%83%D1%80%D0%B0%D0%B9',
    title: 'Экоаил на карте',
    caption: '87.929919, 50.228723',
  },
];

const PLACE_FACTS = [
  'Экоаил',
  'ул. Мира, 7а, с. Курай',
  'Рейтинг 4.4 в 2ГИС',
  '22 оценки',
  '24 фото, 13 отзывов',
  'Коттедж, беседки, парковка',
  'До 15 мест',
];

const PLACE_REVIEWS = [
  {
    title: 'Вид на горы',
    text: 'В отзывах чаще всего отмечают панорамные окна и открытый вид на Северо-Чуйский хребет.',
  },
  {
    title: 'Тихая база',
    text: 'Гости пишут про спокойную территорию, простое размещение и отдых рядом с природой.',
  },
  {
    title: 'Что учесть',
    text: 'В карточке есть и критичные отзывы: заранее уточняйте заезд, бытовые условия и температуру в домиках.',
  },
];

const fallbackHighlights = [
  'Выезд в Горный Алтай с проживанием на природе.',
  'Палатки, домики, костры, общение и молитва.',
  'Заявка подаётся сразу на этой странице, аккаунт не нужен.',
];

const fallbackThingsToBring = [
  'Спальник, коврик, фонарик, удобную обувь и тёплые вещи.',
  'Средства личной гигиены, дождевик и личную аптечку.',
  'Библию, блокнот, ручку и документы.',
];

const fallbackFaq = [
  {
    question: 'Нужно ли создавать кабинет?',
    answer: 'Нет. Нажмите «Зарегистрироваться», заполните анкету и отправьте заявку.',
  },
  {
    question: 'Где находится место?',
    answer: 'Экоаил, улица Мира, 7а, село Курай, Республика Алтай.',
  },
  {
    question: 'Можно ли указать несколько участников?',
    answer: 'Да. В форме можно добавить участников и отметить детей.',
  },
];

const HISTORY_PAGE_FLAG = 'blagodatyCampPage';
const HISTORY_MODAL_PUSH_FLAG = 'blagodatyCampModalPushed';

type CampUrlState = {
  eventSlug: string | null;
  isRegistrationOpen: boolean;
};

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
  if (value == null) {
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

function getFaqBlocks(details: PublicEventDetails | undefined) {
  return (
    details?.contentBlocks
      .filter((block) => block.blockType === 'Faq')
      .map((block) => ({
        question: block.title || 'Вопрос',
        answer: block.body,
      })) ?? []
  );
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

function readCampUrlState(): CampUrlState {
  if (typeof window === 'undefined') {
    return {
      eventSlug: null,
      isRegistrationOpen: false,
    };
  }

  const search = new URLSearchParams(window.location.search);
  const registerParam = search.get('register');

  return {
    eventSlug: search.get('event'),
    isRegistrationOpen: registerParam === '1' || registerParam === 'true',
  };
}

function getCampHistoryState() {
  if (typeof window === 'undefined') {
    return {
      isModalPushed: false,
    };
  }

  const rawState = window.history.state as Record<string, unknown> | null;
  return {
    isModalPushed: rawState?.[HISTORY_MODAL_PUSH_FLAG] === true,
  };
}

function writeCampUrlState(nextState: CampUrlState, options?: { historyMode?: 'push' | 'replace'; modalPushed?: boolean }) {
  if (typeof window === 'undefined') {
    return;
  }

  const nextUrl = new URL(window.location.href);
  if (nextState.eventSlug) {
    nextUrl.searchParams.set('event', nextState.eventSlug);
  } else {
    nextUrl.searchParams.delete('event');
  }

  if (nextState.isRegistrationOpen) {
    nextUrl.searchParams.set('register', '1');
  } else {
    nextUrl.searchParams.delete('register');
  }

  const nextHistoryState = {
    ...((window.history.state as Record<string, unknown> | null) ?? {}),
    [HISTORY_PAGE_FLAG]: true,
    [HISTORY_MODAL_PUSH_FLAG]: options?.modalPushed ?? false,
  };

  if (options?.historyMode === 'push') {
    window.history.pushState(nextHistoryState, '', nextUrl);
    return;
  }

  window.history.replaceState(nextHistoryState, '', nextUrl);
}

export default function App() {
  const [selectedEventSlug, setSelectedEventSlug] = useState<string | null>(() => readCampUrlState().eventSlug);
  const [isModalOpen, setIsModalOpen] = useState(() => readCampUrlState().isRegistrationOpen);
  const [lastSubmittedRegistration, setLastSubmittedRegistration] = useState<CampRegistration | null>(null);

  const eventsQuery = useQuery({
    queryKey: ['public-events'],
    queryFn: getPublicEvents,
    staleTime: 30_000,
  });

  const siteSettingsQuery = useQuery({
    queryKey: ['public-site-settings'],
    queryFn: getPublicSiteSettings,
    staleTime: 60_000,
  });

  const events = eventsQuery.data?.events ?? [];

  useEffect(() => {
    if (selectedEventSlug || !events.length) {
      return;
    }

    const initialSlug = events.find((event) => event.isRegistrationOpen)?.slug ?? events[0]?.slug ?? null;
    if (initialSlug) {
      setSelectedEventSlug(initialSlug);
      writeCampUrlState({ eventSlug: initialSlug, isRegistrationOpen: isModalOpen }, { historyMode: 'replace' });
    }
  }, [events, isModalOpen, selectedEventSlug]);

  useEffect(() => {
    const handlePopState = () => {
      const nextState = readCampUrlState();
      setSelectedEventSlug(nextState.eventSlug);
      setIsModalOpen(nextState.isRegistrationOpen);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const selectedEventSummary = useMemo(
    () => events.find((event) => event.slug === selectedEventSlug) ?? events[0] ?? null,
    [events, selectedEventSlug],
  );

  const selectedEventQuery = useQuery({
    queryKey: ['public-event', selectedEventSummary?.slug],
    queryFn: () => getPublicEvent(selectedEventSummary?.slug ?? ''),
    enabled: Boolean(selectedEventSummary?.slug),
    staleTime: 30_000,
  });

  const details = selectedEventQuery.data;
  const siteSettings = siteSettingsQuery.data;
  const headerSocials = getSocialLinksForPlacement(siteSettings?.socialLinks, 'header');
  const footerSocials = getSocialLinksForPlacement(siteSettings?.socialLinks, 'footer');
  const highlights = getBlocks(details, 'Highlight');
  const thingsToBring = getBlocks(details, 'WhatToBring');
  const faqBlocks = getFaqBlocks(details);
  const actualMedia = splitMedia(details?.mediaItems ?? []);
  const imageItems = [
    ...PLACE_IMAGES,
    ...actualMedia.images.filter((item) => !PLACE_IMAGES.some((placeImage) => placeImage.url === item.url)),
  ];
  const videoItems = actualMedia.videos;
  const heroImage = selectedEventSummary?.primaryImageUrl || actualMedia.images[0]?.url || PLACE_IMAGES[0].url;
  const activeHighlights = highlights.length ? highlights : fallbackHighlights;
  const activeThingsToBring = thingsToBring.length ? thingsToBring : fallbackThingsToBring;
  const activeFaq = faqBlocks.length ? faqBlocks : fallbackFaq;

  function selectEvent(slug: string, options?: { historyMode?: 'push' | 'replace'; isRegistrationOpen?: boolean }) {
    const nextModalOpen = options?.isRegistrationOpen ?? isModalOpen;
    setSelectedEventSlug(slug);
    writeCampUrlState(
      {
        eventSlug: slug,
        isRegistrationOpen: nextModalOpen,
      },
      {
        historyMode: options?.historyMode ?? 'replace',
        modalPushed: nextModalOpen,
      },
    );
  }

  function openRegistration(slug?: string | null) {
    const nextSlug = slug ?? selectedEventSummary?.slug ?? selectedEventSlug ?? null;
    if (nextSlug) {
      setSelectedEventSlug(nextSlug);
    }

    setIsModalOpen(true);
    writeCampUrlState(
      {
        eventSlug: nextSlug,
        isRegistrationOpen: true,
      },
      {
        historyMode: 'push',
        modalPushed: true,
      },
    );
  }

  function closeRegistration() {
    setIsModalOpen(false);

    if (typeof window !== 'undefined' && getCampHistoryState().isModalPushed) {
      window.history.back();
      return;
    }

    writeCampUrlState(
      {
        eventSlug: selectedEventSlug,
        isRegistrationOpen: false,
      },
      {
        historyMode: 'replace',
      },
    );
  }

  function handleSubmitted(registration: CampRegistration) {
    setLastSubmittedRegistration(registration);
    void eventsQuery.refetch();
    void selectedEventQuery.refetch();
  }

  return (
    <div className="camp-page">
      <header className="camp-header container">
        <a className="brand-lockup" href="#top" aria-label="Blagodaty Camp">
          <span className="brand-mark">B</span>
          <span>
            <span className="brand-kicker">Blagodaty</span>
            <span className="brand-title">Camp</span>
          </span>
        </a>

        <nav className="site-nav">
          <a href="#facts">О событии</a>
          <a href="#place">Место</a>
          <a href="#reviews">Отзывы</a>
          <a href="#program">Программа</a>
          <a href="#faq">FAQ</a>
        </nav>

        <div className="header-actions">
          {headerSocials.length ? (
            <div className="header-socials">
              {headerSocials.map((item) => (
                <a className="social-link" href={item.url} key={item.id} target="_blank" rel="noreferrer">
                  {item.label}
                </a>
              ))}
            </div>
          ) : null}

          <button className="button button-primary" type="button" onClick={() => openRegistration(selectedEventSummary?.slug)}>
            Зарегистрироваться
          </button>
        </div>
      </header>

      <main className="camp-main" id="top">
        <section className="hero-panel" style={{ backgroundImage: `linear-gradient(90deg, rgba(18, 29, 35, 0.78), rgba(18, 29, 35, 0.22)), url("${heroImage}")` }}>
          <div className="container hero-inner">
            <p className="section-kicker">{selectedEventSummary?.seasonLabel || 'Лето 2026'}</p>
            <h1>{selectedEventSummary?.title || 'Blagodaty Camp'}</h1>
            <p className="hero-lead">
              {details?.shortDescription ||
                selectedEventSummary?.shortDescription ||
                'Церковный выезд в Горный Алтай: проживание на природе, общение, молитва и совместное время.'}
            </p>

            <div className="hero-badges">
              <span>{details?.location || selectedEventSummary?.location || 'с. Курай, Республика Алтай'}</span>
              <span>{formatDateRange(details?.startsAtUtc || selectedEventSummary?.startsAtUtc, details?.endsAtUtc || selectedEventSummary?.endsAtUtc)}</span>
              <span>{formatCurrency(selectedEventSummary?.priceFromAmount, selectedEventSummary?.priceCurrency || 'RUB')}</span>
            </div>

            <div className="hero-actions">
              <button className="button button-primary" type="button" onClick={() => openRegistration(selectedEventSummary?.slug)}>
                Зарегистрироваться
              </button>
              <a className="button button-secondary hero-map-link" href={PLACE_URL} target="_blank" rel="noreferrer">
                Открыть место в 2ГИС
              </a>
            </div>
          </div>
        </section>

        <section className="facts-strip container" id="facts">
          <article>
            <span>Даты</span>
            <strong>{formatDateRange(details?.startsAtUtc || selectedEventSummary?.startsAtUtc, details?.endsAtUtc || selectedEventSummary?.endsAtUtc)}</strong>
          </article>
          <article>
            <span>Место</span>
            <strong>Экоаил, с. Курай</strong>
          </article>
          <article>
            <span>Стоимость</span>
            <strong>{formatCurrency(selectedEventSummary?.priceFromAmount, selectedEventSummary?.priceCurrency || 'RUB')}</strong>
          </article>
          <article>
            <span>Места</span>
            <strong>{details?.remainingCapacity ?? selectedEventSummary?.remainingCapacity ?? details?.capacity ?? selectedEventSummary?.capacity ?? 'Без лимита'}</strong>
          </article>
        </section>

        {events.length > 1 ? (
          <section className="section-block container" id="events">
            <div className="section-heading">
              <p className="section-kicker">События</p>
              <h2>Доступные сезоны</h2>
            </div>

            <div className="event-grid">
              {events.map((eventItem) => (
                <article className={`event-card${selectedEventSlug === eventItem.slug ? ' active' : ''}`} key={eventItem.id}>
                  <div className="event-card-head">
                    <span className="summary-chip">{eventItem.seasonLabel || eventItem.seriesTitle}</span>
                    <span className="summary-chip">{eventItem.isRegistrationOpen ? 'Открыта' : 'Закрыта'}</span>
                  </div>
                  <h3>{eventItem.title}</h3>
                  <p>{eventItem.shortDescription}</p>
                  <div className="event-meta">
                    <span>{formatDateRange(eventItem.startsAtUtc, eventItem.endsAtUtc)}</span>
                    <span>{eventItem.location || 'Локация уточняется'}</span>
                    <span>{formatCurrency(eventItem.priceFromAmount, eventItem.priceCurrency || 'RUB')}</span>
                  </div>
                  <div className="event-card-actions">
                    <button className="button button-secondary" type="button" onClick={() => selectEvent(eventItem.slug)}>
                      {selectedEventSlug === eventItem.slug ? 'Выбрано' : 'Показать'}
                    </button>
                    <button className="button button-primary" type="button" onClick={() => openRegistration(eventItem.slug)}>
                      Зарегистрироваться
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="place-section container" id="place">
          <div className="place-copy">
            <p className="section-kicker">Место</p>
            <h2>Экоаил, село Курай</h2>
            <p>Улица Мира, 7а, Кош-Агачский район, Республика Алтай.</p>

            <div className="place-facts">
              {PLACE_FACTS.map((fact) => (
                <span key={fact}>{fact}</span>
              ))}
            </div>

            <a className="button button-secondary" href={PLACE_URL} target="_blank" rel="noreferrer">
              Смотреть в 2ГИС
            </a>
          </div>

          <div className="place-photos">
            {PLACE_IMAGES.map((item, index) => (
              <img className={index === 0 ? 'place-photo-main' : 'place-photo-map'} src={item.url} alt={item.title || 'Экоаил'} key={item.id} loading="lazy" />
            ))}
          </div>
        </section>

        <section className="section-block container place-reviews-section" id="reviews">
          <div className="section-heading">
            <p className="section-kicker">Отзывы 2ГИС</p>
            <h2>Что пишут о комплексе</h2>
            <p>По карточке Экоаила в 2ГИС: рейтинг 4.4, 22 оценки, 13 отзывов и 24 фото.</p>
          </div>

          <div className="place-review-grid">
            {PLACE_REVIEWS.map((review) => (
              <article className="place-review-card" key={review.title}>
                <strong>{review.title}</strong>
                <p>{review.text}</p>
              </article>
            ))}
          </div>

          <div className="place-review-footer">
            <span>Перед поездкой можно открыть свежие отзывы и все фото места в 2ГИС.</span>
            <a className="button button-secondary" href={PLACE_REVIEWS_URL} target="_blank" rel="noreferrer">
              Открыть отзывы
            </a>
          </div>
        </section>

        <section className="section-block container" id="media">
          <div className="section-heading">
            <p className="section-kicker">Фото</p>
            <h2>Территория и окрестности</h2>
          </div>

          <div className="media-grid">
            {imageItems.map((item) => (
              <a className="media-card media-card-image" href={item.url} key={item.id} target="_blank" rel="noreferrer">
                <img src={item.url} alt={item.title || selectedEventSummary?.title || 'Фото места'} loading="lazy" />
                <div className="media-card-copy">
                  <strong>{item.title || 'Фото'}</strong>
                  {item.caption ? <span>{item.caption}</span> : null}
                </div>
              </a>
            ))}
          </div>

          <div className="place-review-footer media-source-footer">
            <span>В карточке места опубликованы 24 фото комплекса и окрестностей.</span>
            <a className="button button-secondary" href={PLACE_PHOTOS_URL} target="_blank" rel="noreferrer">
              Все фото в 2ГИС
            </a>
          </div>

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
                      <strong>{item.title || 'Видео'}</strong>
                      {item.caption ? <span>{item.caption}</span> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>

        <section className="content-grid container" id="program">
          <article className="content-card">
            <p className="section-kicker">Главное</p>
            <h2>{selectedEventSummary?.title || 'Blagodaty Camp'}</h2>
            <ul className="content-list">
              {activeHighlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            {details?.scheduleItems.length ? (
              <div className="timeline-list">
                {details.scheduleItems.slice(0, 4).map((item) => (
                  <article className="timeline-row" key={item.id}>
                    <strong>{item.title}</strong>
                    <span>{formatDateRange(item.startsAtUtc, item.endsAtUtc || item.startsAtUtc)}</span>
                    <p>{item.location || item.notes || 'Подробности появятся ближе к дате.'}</p>
                  </article>
                ))}
              </div>
            ) : null}
          </article>

          <article className="content-card">
            <p className="section-kicker">С собой</p>
            <h2>Что взять</h2>
            <ul className="content-list">
              {activeThingsToBring.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            {details?.priceOptions.length ? (
              <div className="pricing-stack">
                {details.priceOptions.filter((option) => option.isActive).map((option) => (
                  <article className="pricing-row" key={option.id}>
                    <div>
                      <strong>{option.title}</strong>
                      <p>{option.description || 'Тариф участия'}</p>
                    </div>
                    <span>{formatCurrency(option.amount, option.currency)}</span>
                  </article>
                ))}
              </div>
            ) : null}
          </article>
        </section>

        <section className="section-block container" id="faq">
          <div className="section-heading">
            <p className="section-kicker">FAQ</p>
            <h2>Коротко по делу</h2>
          </div>

          <div className="faq-grid">
            {activeFaq.map((item) => (
              <article className="faq-card" key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="cta-banner container">
          <div>
            <p className="section-kicker">Заявка</p>
            <h2>Регистрация без кабинета</h2>
            <p>Форма откроется сразу на этом сайте.</p>
            {lastSubmittedRegistration ? <p>Последняя отправленная заявка: {lastSubmittedRegistration.fullName}</p> : null}
          </div>

          <button className="button button-primary" type="button" onClick={() => openRegistration(selectedEventSummary?.slug)}>
            Зарегистрироваться
          </button>
        </section>
      </main>

      {siteSettings?.socialLinksEnabled && (footerSocials.length || siteSettings?.socialLinksTitle || siteSettings?.socialLinksDescription) ? (
        <footer className="site-footer container">
          <div className="site-footer-copy">
            <p className="section-kicker">{siteSettings?.socialLinksTitle || 'Контакты'}</p>
            <p>{siteSettings?.socialLinksDescription || 'Следите за новостями и объявлениями общины.'}</p>
          </div>

          {footerSocials.length ? (
            <div className="footer-socials">
              {footerSocials.map((item) => (
                <a className="social-link" href={item.url} key={item.id} target="_blank" rel="noreferrer">
                  {item.label}
                </a>
              ))}
            </div>
          ) : null}
        </footer>
      ) : null}

      <RegistrationModal
        isOpen={isModalOpen}
        onClose={closeRegistration}
        events={events}
        selectedEvent={details ?? null}
        selectedEventSlug={selectedEventSlug}
        onSelectEvent={(slug) => selectEvent(slug, { isRegistrationOpen: isModalOpen })}
        onSubmitted={handleSubmitted}
      />
    </div>
  );
}
