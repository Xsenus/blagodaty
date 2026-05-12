import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPublicEvent, getPublicEvents, getPublicSiteSettings } from './lib/api';
import { RegistrationModal } from './components/RegistrationModal';
import { NearbyActivitiesMap } from './components/NearbyActivitiesMap';
import type {
  CampRegistration,
  PublicEventContentBlock,
  PublicEventDetails,
  PublicEventMediaItem,
  PublicSiteContactPerson,
  PublicSiteSocialLink,
} from './types';

const PLACE_URL = 'https://2gis.ru/gornoaltaysk/firm/70000001077460445/87.929919%2C50.228723';
const PLACE_REVIEWS_URL = 'https://2gis.ru/gornoaltaysk/firm/70000001077460445/tab/reviews';
const kuraiMountainAltaiImage = new URL('./assets/camp/kurai-mountain-altai.jpg', import.meta.url).href;
const kuraiSteppeHorsesImage = new URL('./assets/camp/kurai-steppe-horses.jpg', import.meta.url).href;
const kuraiSteppeGrasslandImage = new URL('./assets/camp/kurai-steppe-grassland.jpg', import.meta.url).href;
const altaiSnowMountainsImage = new URL('./assets/camp/altai-snow-mountains.jpg', import.meta.url).href;
const altaiYakSteppeImage = new URL('./assets/camp/altai-yak-steppe.jpg', import.meta.url).href;
const PLACE_IMAGES: PublicEventMediaItem[] = [
  {
    id: 'kurai-mountain-altai',
    type: 'Image',
    url: kuraiMountainAltaiImage,
    title: 'Курайская степь и горы',
    caption: 'Курай, Республика Алтай. Фото: sivakovdenis / Pixabay',
  },
  {
    id: 'kurai-steppe-horses',
    type: 'Image',
    url: kuraiSteppeHorsesImage,
    title: 'Курайская степь',
    caption: 'Алтайские пастбища у гор. Фото: DariaBelykh / Pixabay',
  },
  {
    id: 'kurai-steppe-grassland',
    type: 'Image',
    url: kuraiSteppeGrasslandImage,
    title: 'Тропа через степь',
    caption: 'Простор Курайской степи. Фото: DariaBelykh / Pixabay',
  },
  {
    id: 'altai-snow-mountains',
    type: 'Image',
    url: altaiSnowMountainsImage,
    title: 'Снежные вершины Алтая',
    caption: 'Горный Алтай. Фото: Pixabay',
  },
  {
    id: 'altai-yak-steppe',
    type: 'Image',
    url: altaiYakSteppeImage,
    title: 'Высокогорная степь',
    caption: 'Окрестности Алтая. Фото: Pixabay',
  },
];

const PLACE_FACTS = [
  'Экоаил',
  'ул. Мира, 7а',
  'село Курай',
  'Палаточный формат',
  'До 35 мест',
];

const PLACE_REVIEWS = [
  {
    title: 'Погода и условия',
    text: 'В августе в Курае важно быть готовым к солнцу, ветру, дождю и прохладным вечерам, поэтому берем одежду слоями.',
  },
  {
    title: 'База и география',
    text: 'Место находится среди алтайских гор, рядом с открытыми видами и природой. Размещение планируется в палаточном формате.',
  },
  {
    title: 'Правила поведения',
    text: 'На походе действует общий распорядок, служительские указания и запрет на алкогольные, табачные и наркотические вещества.',
  },
];

const fallbackHighlights = [
  'Палаточный поход в Горном Алтае с 17 по 22 августа.',
  'Возраст участников: с 16 лет. Количество мест ограничено: 35.',
  'Регистрация открыта до 10.07, оплату нужно внести до 13.07.',
];

const fallbackThingsToBring = [
  'Для сна: спальник, туристический коврик, маленькую подушку, пижаму.',
  'Гигиена: средства гигиены, полотенце для лица, сменное нижнее белье.',
  'Для активного отдыха: пляжное полотенце, головной убор, удобную одежду и обувь, солнцезащитный крем.',
  'На случай дождя: дождевик, резиновые сапоги, большие черные пакеты для вещей.',
  'На прохладную погоду: теплую кофту или толстовку, теплые носки, куртку, тонкую шапку.',
  'Прочее: средство от насекомых, фонарик, несколько подарков для игры «Тайный друг».',
  'Канцелярия: Библию, ручку, блокнот или тетрадку.',
];

const fallbackImportantNotices = [
  {
    title: 'Ответственность за вещи',
    body: 'За сохранность ценных вещей участники самостоятельно несут ответственность.',
  },
  {
    title: 'Запрещено привозить',
    body: 'На территорию запрещено привозить спиртное и табачные изделия.',
  },
  {
    title: 'Правила поведения',
    body: 'Запрещено уединение разнополых людей; обязательно строгое соблюдение общего распорядка; запрещено употребление алкогольных, табачных и наркотических веществ; необходимо соблюдать указания служительского состава.',
  },
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
    answer: 'Да. В форме можно добавить участников и отметить несовершеннолетних 16-17 лет.',
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
  if (!endsAtUtc) {
    return starts;
  }

  const ends = formatter.format(new Date(endsAtUtc));
  return starts === ends ? starts : `${starts} - ${ends}`;
}

function formatDateRangeParts(startsAtUtc?: string | null, endsAtUtc?: string | null) {
  if (!startsAtUtc) {
    return ['Даты уточняются'];
  }

  const formatter = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const starts = formatter.format(new Date(startsAtUtc));
  if (!endsAtUtc) {
    return [starts];
  }

  const ends = formatter.format(new Date(endsAtUtc));
  return starts === ends ? [starts] : [starts, ends];
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

function getTitledBlocks(details: PublicEventDetails | undefined, blockType: PublicEventContentBlock['blockType']) {
  return (
    details?.contentBlocks
      .filter((block) => block.blockType === blockType)
      .map((block) => ({
        title: block.title || 'Важно',
        body: block.body,
      })) ?? []
  );
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

function getFooterContacts(people: PublicSiteContactPerson[] | undefined) {
  return (people ?? []).filter((item) => item.showInFooter && item.links.length > 0);
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

function isLegacyExternalPlaceImage(url?: string | null) {
  return Boolean(url && (url.includes('photo.2gis.com') || url.includes('share.api.2gis.ru')));
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
  const footerContacts = getFooterContacts(siteSettings?.contactPeople);
  const highlights = getBlocks(details, 'Highlight');
  const thingsToBringBlocks = getTitledBlocks(details, 'WhatToBring');
  const importantNotices = getTitledBlocks(details, 'ImportantNotice');
  const faqBlocks = getFaqBlocks(details);
  const actualMedia = splitMedia(details?.mediaItems ?? []);
  const eventImages = actualMedia.images.filter((item) => !isLegacyExternalPlaceImage(item.url));
  const imageItems = [
    ...PLACE_IMAGES,
    ...eventImages.filter((item) => !PLACE_IMAGES.some((placeImage) => placeImage.url === item.url)),
  ];
  const videoItems = actualMedia.videos;
  const customHeroImage = isLegacyExternalPlaceImage(selectedEventSummary?.primaryImageUrl) ? null : selectedEventSummary?.primaryImageUrl;
  const heroImage = eventImages[0]?.url || customHeroImage || PLACE_IMAGES[0].url;
  const factDateParts = formatDateRangeParts(
    details?.startsAtUtc || selectedEventSummary?.startsAtUtc,
    details?.endsAtUtc || selectedEventSummary?.endsAtUtc,
  );
  const activeHighlights = highlights.length ? highlights : fallbackHighlights;
  const activeThingsToBring = thingsToBringBlocks.length
    ? thingsToBringBlocks.map((item) => `${item.title}: ${item.body}`)
    : fallbackThingsToBring;
  const activeImportantNotices = importantNotices.length ? importantNotices : fallbackImportantNotices;
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
          <a href="#activities">Активности</a>
          <a href="#reviews">Отзывы</a>
          <a href="#program">Программа</a>
          <a href="#notices">Важно</a>
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
            <strong className="facts-date-lines">
              {factDateParts.map((date) => (
                <span key={date}>{date}</span>
              ))}
            </strong>
          </article>
          <article>
            <span>Место</span>
            <strong className="facts-place-lines">
              <span>Экоаил</span>
              <span>село Курай</span>
            </strong>
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
            <h2>
              Экоаил
              <span>село Курай</span>
            </h2>
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
              <img
                className={index === 0 ? 'place-photo-main' : 'place-photo-side'}
                src={item.url}
                alt={item.title || 'Экоаил'}
                key={item.id}
                loading={index === 0 ? 'eager' : 'lazy'}
              />
            ))}
          </div>
        </section>

        <NearbyActivitiesMap />

        <section className="section-block container place-reviews-section" id="reviews">
          <div className="section-heading">
            <p className="section-kicker">О походе</p>
            <h2>Что пишут о походе</h2>
            <p>Главные бытовые ориентиры перед выездом: погода, география базы, формат размещения и правила общего порядка.</p>
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
            <span>Перед поездкой можно открыть карточку места и посмотреть фотографии территории в 2ГИС.</span>
            <a className="button button-secondary" href={PLACE_REVIEWS_URL} target="_blank" rel="noreferrer">
              Открыть место
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
            <span>Подборка локальных фотографий помогает заранее почувствовать район Курая и горное окружение.</span>
            <a className="button button-secondary" href={PLACE_URL} target="_blank" rel="noreferrer">
              Смотреть место в 2ГИС
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

        <section className="section-block container" id="notices">
          <div className="section-heading">
            <p className="section-kicker">Важно</p>
            <h2>Правила и ограничения</h2>
          </div>

          <div className="faq-grid">
            {activeImportantNotices.map((item) => (
              <article className="faq-card" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
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

      {(siteSettings?.contactsEnabled && footerContacts.length) ||
      (siteSettings?.socialLinksEnabled && (footerSocials.length || siteSettings?.socialLinksTitle || siteSettings?.socialLinksDescription)) ? (
        <footer className="site-footer container">
          <div className="site-footer-copy">
            <p className="section-kicker">{siteSettings?.contactsTitle || siteSettings?.socialLinksTitle || 'Контакты'}</p>
            <p>{siteSettings?.contactsDescription || siteSettings?.socialLinksDescription || 'Следите за новостями и объявлениями общины.'}</p>
          </div>

          {footerContacts.length ? (
            <div className="footer-contacts">
              {footerContacts.map((person) => (
                <article className="footer-contact" key={person.id}>
                  <div>
                    <strong>{person.name}</strong>
                    <span>{person.role}</span>
                    {person.description ? <p>{person.description}</p> : null}
                  </div>
                  <div className="footer-contact-links">
                    {person.links.map((link) => (
                      <a className="social-link" href={link.url} key={link.id} target="_blank" rel="noreferrer">
                        {link.label}
                      </a>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : null}

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
