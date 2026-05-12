import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPublicEvent, getPublicEvents, getPublicSiteSettings } from './lib/api';
import { RegistrationModal } from './components/RegistrationModal';
import { NearbyActivitiesMap } from './components/NearbyActivitiesMap';
import type {
  PublicEventContentBlock,
  PublicEventDetails,
  PublicEventMediaItem,
  PublicSiteContactPerson,
  PublicSiteSocialLink,
} from './types';

const PLACE_URL = 'https://2gis.ru/gornoaltaysk/firm/70000001077460445/87.929919%2C50.228723';
const kuraiMountainAltaiImage = new URL('./assets/camp/kurai-mountain-altai.jpg', import.meta.url).href;
const kuraiSteppeHorsesImage = new URL('./assets/camp/kurai-steppe-horses.jpg', import.meta.url).href;
const kuraiSteppeGrasslandImage = new URL('./assets/camp/kurai-steppe-grassland.jpg', import.meta.url).href;
const altaiSnowMountainsImage = new URL('./assets/camp/altai-snow-mountains.jpg', import.meta.url).href;
const altaiYakSteppeImage = new URL('./assets/camp/altai-yak-steppe.jpg', import.meta.url).href;
const altaiRiverChuyaImage = new URL('./assets/camp/altai-river-chuya.jpg', import.meta.url).href;
const geyserLakeAltaiImage = new URL('./assets/camp/geyser-lake-altai.jpg', import.meta.url).href;
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

const ACTIVITY_GALLERY_IMAGES: PublicEventMediaItem[] = [
  {
    id: 'altai-river-chuya',
    type: 'Image',
    url: altaiRiverChuyaImage,
    title: 'Чуя и горные повороты',
    caption: 'Окрестности Чуйского тракта. Фото: DariaBelykh / Pixabay',
  },
  {
    id: 'geyser-lake-altai',
    type: 'Image',
    url: geyserLakeAltaiImage,
    title: 'Гейзерное озеро',
    caption: 'Улаганский район, Республика Алтай. Фото: Ludvig14 / Wikimedia Commons, CC BY-SA 4.0',
  },
];

const GALLERY_IMAGE_LIMIT = 6;

const PLACE_REVIEWS = [
  {
    title: 'Погода и условия',
    text: 'Август в Курае - это яркое солнце днем, сухой горный воздух и прохладные вечера у гор. Берем одежду слоями, чтобы спокойно встречать рассветы, гулять по степи и не зависеть от перемены ветра.',
  },
  {
    title: 'База и география',
    text: 'Экоаил стоит в Курайской степи, где горизонт открывается на Северо-Чуйский хребет. Это настоящий палаточный формат: простое размещение, костровая атмосфера, много воздуха и горы прямо вокруг.',
  },
];

const fallbackHighlights = [
  'Палаточный поход в Горном Алтае с 17 по 22 августа.',
  'Возраст участников: с 16 лет. Количество мест ограничено: 35.',
  'Регистрация открыта до 10.07, оплату нужно внести до 13.07.',
];

const fallbackThingsToBring = [
  'Сон и тепло: спальник по погоде, туристический коврик, маленькая подушка и удобная пижама.',
  'Одежда слоями: футболки, удобные штаны, теплая кофта, куртка, теплые носки и тонкая шапка для вечера.',
  'Обувь: надежные кроссовки или треккинговая пара для прогулок и резиновые сапоги на случай дождя.',
  'Гигиена: зубная щетка, паста, шампунь, влажные салфетки, полотенце для лица и сменное белье.',
  'Солнце и вода: головной убор, солнцезащитный крем и пляжное полотенце для теплых дневных выходов.',
  'Дождь: дождевик и большие плотные пакеты, чтобы быстро защитить вещи от влаги.',
  'Вечер и лагерь: фонарик обязательно, средство от насекомых и несколько подарков для игры «Тайный друг».',
  'Для встреч: Библия, ручка, блокнот или тетрадь для заметок и общих разборов.',
];

const fallbackImportantNotices = [
  {
    title: 'Ответственность за вещи',
    body: 'Ценные вещи лучше оставить дома или держать при себе: походный формат живой и общий, поэтому каждый отвечает за свои документы, деньги и технику.',
  },
  {
    title: 'Запрещено привозить',
    body: 'На территорию не привозим и не употребляем алкоголь, табак и наркотические вещества. Сохраняем пространство лагеря трезвым, чистым и безопасным для всех.',
  },
  {
    title: 'Правила поведения',
    body: 'Живем по общему расписанию, бережно относимся к людям и территории, не уединяемся разнополыми парами и следуем указаниям служительской команды.',
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

function splitIntoColumns<T>(items: T[], columnsCount: number) {
  const columnSize = Math.ceil(items.length / columnsCount);
  return Array.from({ length: columnsCount }, (_, index) => items.slice(index * columnSize, (index + 1) * columnSize))
    .filter((column) => column.length > 0);
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

function shuffleItems<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

function buildGalleryImages(eventImages: PublicEventMediaItem[]) {
  const sourceImages = [
    ...PLACE_IMAGES,
    ...ACTIVITY_GALLERY_IMAGES,
    ...eventImages.filter((item) => ![...PLACE_IMAGES, ...ACTIVITY_GALLERY_IMAGES].some((baseImage) => baseImage.url === item.url)),
  ];
  const uniqueImages = sourceImages.filter((item, index, items) => items.findIndex((candidate) => candidate.url === item.url) === index);

  return shuffleItems(uniqueImages).slice(0, Math.min(GALLERY_IMAGE_LIMIT, uniqueImages.length));
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
  const [selectedGalleryIndex, setSelectedGalleryIndex] = useState<number | null>(null);

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
  const actualMedia = splitMedia(details?.mediaItems ?? []);
  const eventImages = actualMedia.images.filter((item) => !isLegacyExternalPlaceImage(item.url));
  const imageItems = useMemo(() => buildGalleryImages(eventImages), [details?.id, details?.mediaItems]);
  const videoItems = actualMedia.videos;
  const selectedGalleryImage = selectedGalleryIndex === null ? null : imageItems[selectedGalleryIndex] ?? null;
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
  const thingsToBringColumns = splitIntoColumns(activeThingsToBring, 2);
  const activeImportantNotices = importantNotices.length ? importantNotices : fallbackImportantNotices;

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

  function handleSubmitted() {
    void eventsQuery.refetch();
    void selectedEventQuery.refetch();
  }

  useEffect(() => {
    if (!selectedGalleryImage) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedGalleryIndex(null);
      }

      if (event.key === 'ArrowRight') {
        setSelectedGalleryIndex((current) => (current === null ? current : (current + 1) % imageItems.length));
      }

      if (event.key === 'ArrowLeft') {
        setSelectedGalleryIndex((current) => (current === null ? current : (current - 1 + imageItems.length) % imageItems.length));
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [imageItems.length, selectedGalleryImage]);

  useEffect(() => {
    if (selectedGalleryIndex !== null && selectedGalleryIndex >= imageItems.length) {
      setSelectedGalleryIndex(null);
    }
  }, [imageItems.length, selectedGalleryIndex]);

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
          <a href="#reviews">Информация</a>
          <a href="#program">Программа</a>
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
            <div className="place-copy-overlay">
              <p className="section-kicker">Место</p>
              <h2>
                Экоаил
                <span>село Курай</span>
              </h2>
              <p>Открытая Курайская степь, вид на Северо-Чуйский хребет и палаточный формат рядом с горами.</p>

              <div className="place-copy-notes" aria-label="Особенности места">
                <span>просторная территория</span>
                <span>горные виды</span>
                <span>палаточный поход</span>
              </div>
            </div>
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
            <h2>Информация о походе</h2>
          </div>

          <div className="place-review-grid">
            {PLACE_REVIEWS.map((review) => (
              <article className="place-review-card" key={review.title}>
                <strong>{review.title}</strong>
                <p>{review.text}</p>
              </article>
            ))}
          </div>

          <div className="info-section-stack">
            <div className="info-subsection">
              <h3>Правила и ограничения</h3>
              <div className="faq-grid">
                {activeImportantNotices.map((item) => (
                  <article className="faq-card" key={item.title}>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </article>
                ))}
              </div>
            </div>

            <article className="content-card info-bring-card">
              <h3>Что взять с собой</h3>
              <div className="info-bring-columns">
                {thingsToBringColumns.map((column, index) => (
                  <ul className="content-list" key={`bring-column-${index + 1}`}>
                    {column.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className="section-block container" id="media">
          <div className="section-heading">
            <h2>Территория и окрестности</h2>
          </div>

          <div className="media-grid">
            {imageItems.map((item, index) => (
              <button
                className="media-card media-card-image"
                key={item.id}
                type="button"
                onClick={() => setSelectedGalleryIndex(index)}
              >
                <img src={item.url} alt={item.title || selectedEventSummary?.title || 'Фото места'} loading="lazy" />
                <div className="media-card-copy">
                  <strong>{item.title || 'Фото'}</strong>
                  {item.caption ? <span>{item.caption}</span> : null}
                </div>
              </button>
            ))}
          </div>

          {selectedGalleryImage ? (
            <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={selectedGalleryImage.title || 'Просмотр фото'}>
              <button
                className="photo-viewer-backdrop"
                type="button"
                onClick={() => setSelectedGalleryIndex(null)}
                aria-label="Закрыть просмотр"
              />
              <div className="photo-viewer-panel">
                <button className="photo-viewer-close" type="button" onClick={() => setSelectedGalleryIndex(null)} aria-label="Закрыть">
                  ×
                </button>
                <button
                  className="photo-viewer-nav photo-viewer-prev"
                  type="button"
                  onClick={() => setSelectedGalleryIndex((current) => (current === null ? current : (current - 1 + imageItems.length) % imageItems.length))}
                  aria-label="Предыдущее фото"
                >
                  ‹
                </button>
                <img src={selectedGalleryImage.url} alt={selectedGalleryImage.title || 'Фото места'} />
                <button
                  className="photo-viewer-nav photo-viewer-next"
                  type="button"
                  onClick={() => setSelectedGalleryIndex((current) => (current === null ? current : (current + 1) % imageItems.length))}
                  aria-label="Следующее фото"
                >
                  ›
                </button>
                <div className="photo-viewer-caption">
                  <strong>{selectedGalleryImage.title || 'Фото'}</strong>
                  {selectedGalleryImage.caption ? <span>{selectedGalleryImage.caption}</span> : null}
                </div>
              </div>
            </div>
          ) : null}

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

        <section className="content-grid container program-grid" id="program">
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
        </section>

        <section className="cta-banner container">
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
