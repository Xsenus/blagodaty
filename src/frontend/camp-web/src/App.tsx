import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPublicEvent, getPublicEvents, getPublicSiteSettings } from './lib/api';
import { lkBaseUrl } from './lib/config';
import { RegistrationModal } from './components/RegistrationModal';
import { NearbyActivitiesMap } from './components/NearbyActivitiesMap';
import { ChurchPreloader } from './components/ChurchPreloader';
import type {
  PublicEventContentBlock,
  PublicEventDetails,
  PublicEventMediaItem,
  PublicEventScheduleItem,
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
const galleryAssetModules = import.meta.glob('./assets/camp/gallery/*.{jpg,jpeg,png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const EXCLUDED_GALLERY_ASSET_IDS = new Set([
  'altai-lake-01',
  'altai-lake-02',
  'altai-mountains-01',
  'forest-mountains-02',
]);
const GALLERY_ASSET_TITLES: Record<string, string> = {
  'altai-lake-01': 'Горное озеро Алтая',
  'altai-lake-02': 'Озеро среди гор',
  'altai-mountains-01': 'Алтайские горы',
  'altai-mountains-02': 'Горный горизонт',
  'altai-mountains-03': 'Высокие хребты',
  'altai-mountains-04': 'Дорога к горам',
  'altai-river-01': 'Горная река',
  'altai-river-02': 'Река у хребтов',
  'chuya-road-01': 'Дорога через горы',
  'forest-mountains-01': 'Лес и горы',
  'forest-mountains-02': 'Горная тайга',
  'mountain-lake-01': 'Тихое горное озеро',
  'mountain-lake-02': 'Вода и вершины',
  'mountain-river-01': 'Бирюзовая река',
  'mountain-river-02': 'Речная долина',
  'mountain-river-03': 'Повороты горной реки',
  'mountain-river-04': 'Долина у воды',
  'mountain-steppe-01': 'Степь у гор',
  'mountain-steppe-02': 'Просторная степь',
  'mountain-steppe-03': 'Степной горизонт',
  'mountain-steppe-04': 'Горная степь',
};
const PLACE_IMAGES: PublicEventMediaItem[] = [
  {
    id: 'kurai-mountain-altai',
    type: 'Image',
    url: kuraiMountainAltaiImage,
    title: 'Курайская степь и горы',
  },
  {
    id: 'kurai-steppe-horses',
    type: 'Image',
    url: kuraiSteppeHorsesImage,
    title: 'Курайская степь',
  },
  {
    id: 'kurai-steppe-grassland',
    type: 'Image',
    url: kuraiSteppeGrasslandImage,
    title: 'Тропа через степь',
  },
  {
    id: 'altai-snow-mountains',
    type: 'Image',
    url: altaiSnowMountainsImage,
    title: 'Снежные вершины Алтая',
  },
  {
    id: 'altai-yak-steppe',
    type: 'Image',
    url: altaiYakSteppeImage,
    title: 'Высокогорная степь',
  },
];

const ACTIVITY_GALLERY_IMAGES: PublicEventMediaItem[] = [
  {
    id: 'altai-river-chuya',
    type: 'Image',
    url: altaiRiverChuyaImage,
    title: 'Чуя и горные повороты',
  },
  {
    id: 'geyser-lake-altai',
    type: 'Image',
    url: geyserLakeAltaiImage,
    title: 'Гейзерное озеро',
  },
];

const EXTRA_GALLERY_IMAGES: PublicEventMediaItem[] = Object.entries(galleryAssetModules)
  .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))
  .filter(([path]) => {
    const fileName = path.split('/').pop() ?? 'gallery-image.jpg';
    const id = fileName.replace(/\.(jpe?g|png|webp)$/i, '');

    return !EXCLUDED_GALLERY_ASSET_IDS.has(id);
  })
  .map(([path, url]) => {
    const fileName = path.split('/').pop() ?? 'gallery-image.jpg';
    const id = fileName.replace(/\.(jpe?g|png|webp)$/i, '');

    return {
      id: `extra-${id}`,
      type: 'Image',
      url,
      title: GALLERY_ASSET_TITLES[id] ?? 'Горный Алтай',
    };
  });

const GALLERY_IMAGE_LIMIT = 6;
const GALLERY_COLLECTION_LIMIT = 30;
const GALLERY_ROTATION_INTERVAL_MS = 7000;

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
  'Шесть дней в Горном Алтае: палаточный лагерь среди Курайской степи, горный воздух, молитва и живое общение без городской суеты.',
  'Камерный формат до 35 участников с 16 лет: общий ритм, внимательная команда и пространство, где легко быть частью лагеря.',
  'Место закрепляется после заявки до 10.07 и оплаты до 13.07, чтобы команда заранее подготовила размещение, питание и программу.',
];

const scheduleCopyByKind: Partial<Record<PublicEventScheduleItem['kind'], { title: string; body: string }>> = {
  Deadline: {
    title: 'Подтверждение участия',
    body: 'После оплаты место закрепляется за участником, а координатор отмечает заявку в общей таблице подготовки.',
  },
  Arrival: {
    title: 'Заезд и мягкий старт',
    body: 'Встречаемся в Курае, размещаемся в палаточном лагере, знакомимся с территорией и спокойно входим в общий ритм.',
  },
  MainProgram: {
    title: 'Дни программы',
    body: 'Горы, общение, молитва, активности на природе и общий распорядок, который помогает прожить эти дни глубоко и собранно.',
  },
  Departure: {
    title: 'Сбор лагеря и отъезд',
    body: 'Финальное утро проходит без спешки: собираем вещи, закрываем бытовые вопросы и выезжаем с хорошим запасом времени.',
  },
};

const fallbackThingsToBring = [
  'Сон и тепло: спальник по погоде, туристический коврик, маленькая подушка и удобная пижама.',
  'Одежда: футболки и удобные штаны для дневной программы, теплая кофта или толстовка, куртка, теплые носки и тонкая шапка для прохладных вечеров.',
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

type GalleryRotationState = {
  visibleIds: string[];
  remainingIds: string[];
  sourceKey: string;
};

type CrossfadeImageProps = {
  src: string;
  alt: string;
  className?: string;
  loading?: 'eager' | 'lazy';
  decorative?: boolean;
};

function CrossfadeImage({ src, alt, className, loading = 'lazy', decorative = false }: CrossfadeImageProps) {
  const [displayedSrc, setDisplayedSrc] = useState(src);
  const [previousSrc, setPreviousSrc] = useState<string | null>(null);
  const [isCurrentLoaded, setIsCurrentLoaded] = useState(false);

  useEffect(() => {
    if (src === displayedSrc) {
      return;
    }

    setPreviousSrc(displayedSrc);
    setDisplayedSrc(src);
    setIsCurrentLoaded(false);
  }, [displayedSrc, src]);

  const imageAlt = decorative ? '' : alt;
  const wrapperClassName = [
    'image-crossfade',
    isCurrentLoaded ? 'is-loaded' : 'is-loading',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={wrapperClassName} aria-hidden={decorative || undefined}>
      {!isCurrentLoaded ? <ChurchPreloader compact visualOnly label="Загружаем фото" className="image-preloader" /> : null}
      {previousSrc ? (
        <img className="image-crossfade-layer image-crossfade-previous" src={previousSrc} alt="" aria-hidden="true" decoding="async" />
      ) : null}
      <img
        className="image-crossfade-layer image-crossfade-current"
        src={displayedSrc}
        alt={imageAlt}
        key={displayedSrc}
        loading={loading}
        decoding="async"
        onLoad={() => setIsCurrentLoaded(true)}
        onError={() => setIsCurrentLoaded(true)}
        onAnimationEnd={previousSrc ? () => setPreviousSrc(null) : undefined}
      />
    </span>
  );
}

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

function getGallerySourceKey(items: PublicEventMediaItem[]) {
  return items.map((item) => item.id).join('|');
}

function createGalleryRotationState(items: PublicEventMediaItem[], previousVisibleIds: string[] = []): GalleryRotationState {
  const sourceIds = items.map((item) => item.id);
  const sourceKey = sourceIds.join('|');

  if (sourceIds.length <= GALLERY_IMAGE_LIMIT) {
    return {
      visibleIds: sourceIds,
      remainingIds: [],
      sourceKey,
    };
  }

  const previousVisibleSet = new Set(previousVisibleIds);
  const shuffledIds = shuffleItems(sourceIds);
  const orderedIds = [
    ...shuffledIds.filter((id) => !previousVisibleSet.has(id)),
    ...shuffledIds.filter((id) => previousVisibleSet.has(id)),
  ];

  return {
    visibleIds: orderedIds.slice(0, GALLERY_IMAGE_LIMIT),
    remainingIds: orderedIds.slice(GALLERY_IMAGE_LIMIT),
    sourceKey,
  };
}

function advanceGalleryRotationState(current: GalleryRotationState, items: PublicEventMediaItem[]) {
  const sourceKey = getGallerySourceKey(items);
  const sourceIds = items.map((item) => item.id);
  const sourceIdSet = new Set(sourceIds);

  if (sourceIds.length <= GALLERY_IMAGE_LIMIT || current.sourceKey !== sourceKey) {
    return createGalleryRotationState(items, current.visibleIds);
  }

  const remainingIds = current.remainingIds.filter((id) => sourceIdSet.has(id));
  if (remainingIds.length >= GALLERY_IMAGE_LIMIT) {
    return {
      visibleIds: remainingIds.slice(0, GALLERY_IMAGE_LIMIT),
      remainingIds: remainingIds.slice(GALLERY_IMAGE_LIMIT),
      sourceKey,
    };
  }

  return createGalleryRotationState(items, current.visibleIds);
}

function resolveGalleryVisibleItems(state: GalleryRotationState, items: PublicEventMediaItem[]) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const visibleItems = state.visibleIds.map((id) => itemById.get(id)).filter((item): item is PublicEventMediaItem => Boolean(item));

  return visibleItems.length ? visibleItems : items.slice(0, GALLERY_IMAGE_LIMIT);
}

function buildGalleryImages(eventImages: PublicEventMediaItem[]) {
  const sourceImages = [
    ...PLACE_IMAGES,
    ...ACTIVITY_GALLERY_IMAGES,
    ...EXTRA_GALLERY_IMAGES,
    ...eventImages.filter((item) => ![...PLACE_IMAGES, ...ACTIVITY_GALLERY_IMAGES].some((baseImage) => baseImage.url === item.url)),
  ];
  const uniqueImages = sourceImages.filter((item, index, items) => items.findIndex((candidate) => candidate.url === item.url) === index);

  return shuffleItems(uniqueImages).slice(0, Math.min(GALLERY_COLLECTION_LIMIT, uniqueImages.length));
}

function getProgramScheduleCopy(item: PublicEventScheduleItem) {
  const copy = scheduleCopyByKind[item.kind];

  return {
    title: copy?.title ?? item.title,
    body: copy?.body ?? item.notes ?? item.location ?? 'Подробности появятся ближе к дате.',
  };
}

function getContactLinkKind(link: PublicSiteContactPerson['links'][number]) {
  const value = `${link.preset} ${link.label} ${link.url}`.toLowerCase();
  if (value.includes('telegram') || value.includes('t.me')) {
    return 'telegram';
  }

  if (value.includes('phone') || value.includes('телефон') || link.url.toLowerCase().startsWith('tel:')) {
    return 'phone';
  }

  return 'link';
}

function ContactLinkIcon({ link }: { link: PublicSiteContactPerson['links'][number] }) {
  const kind = getContactLinkKind(link);

  if (kind === 'telegram') {
    return (
      <svg className="contact-link-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21.8 4.4 18.6 19c-.2 1-.8 1.2-1.6.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.4-4.8 8.7-7.9c.4-.3-.1-.5-.6-.2L6.8 12.9 2.2 11.5c-1-.3-1-1 .2-1.4L20.4 3c.8-.3 1.6.2 1.4 1.4Z" />
      </svg>
    );
  }

  if (kind === 'phone') {
    return (
      <svg className="contact-link-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6.6 10.8c1.5 2.9 3.7 5.1 6.6 6.6l2.2-2.2c.3-.3.8-.4 1.2-.3 1.3.4 2.7.6 4.1.6.7 0 1.3.6 1.3 1.3v3.5c0 .7-.6 1.3-1.3 1.3C10.6 21.6 2.4 13.4 2.4 3.3 2.4 2.6 3 2 3.7 2h3.5c.7 0 1.3.6 1.3 1.3 0 1.4.2 2.8.6 4.1.1.4 0 .9-.3 1.2l-2.2 2.2Z" />
      </svg>
    );
  }

  return (
    <svg className="contact-link-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13.5 4.5h6v6h-2V8l-7.1 7.1-1.5-1.5L16 6.5h-2.5v-2ZM5 6h6v2H7v9h9v-4h2v6H5V6Z" />
    </svg>
  );
}

function RegisterActionIcon() {
  return (
    <svg className="floating-action-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3h10a2 2 0 0 1 2 2v14.5a1 1 0 0 1-1.5.9L12 17.5l-5.5 2.9a1 1 0 0 1-1.5-.9V5a2 2 0 0 1 2-2Zm0 2v12.8l4.5-2.4a1 1 0 0 1 .9 0l4.6 2.4V5H7Zm2.2 4.2h5.6v2H9.2v-2Zm0 3.5h3.8v2H9.2v-2Z" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg className="floating-action-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4.4 5.6 10.8 7 12.2l4-4V20h2V8.2l4 4 1.4-1.4L12 4.4Z" />
    </svg>
  );
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

function getSafeReturnUrl() {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawReturnUrl = new URLSearchParams(window.location.search).get('returnUrl');
  if (!rawReturnUrl) {
    return null;
  }

  try {
    const returnUrl = new URL(rawReturnUrl, window.location.origin);
    const allowedHosts = new Set([
      window.location.host,
      'lk.blagodaty.ru',
      'lk.blagodaty.online',
    ]);

    if (!allowedHosts.has(returnUrl.host)) {
      return null;
    }

    if (returnUrl.hostname === 'lk.blagodaty.online') {
      returnUrl.hostname = new URL(lkBaseUrl).hostname;
    }

    return returnUrl.toString();
  } catch {
    return null;
  }
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
  const [galleryRotation, setGalleryRotation] = useState<GalleryRotationState>(() => createGalleryRotationState([]));
  const [placeImageRotation, setPlaceImageRotation] = useState<GalleryRotationState>(() => createGalleryRotationState([]));
  const [isBackToTopVisible, setIsBackToTopVisible] = useState(false);
  const [isFloatingRegistrationVisible, setIsFloatingRegistrationVisible] = useState(false);

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
  const galleryImages = useMemo(() => buildGalleryImages(eventImages), [details?.id, details?.mediaItems]);
  const gallerySourceKey = useMemo(() => getGallerySourceKey(galleryImages), [galleryImages]);
  const imageItems = useMemo(() => resolveGalleryVisibleItems(galleryRotation, galleryImages), [galleryImages, galleryRotation]);
  const placeImageItems = useMemo(() => resolveGalleryVisibleItems(placeImageRotation, galleryImages), [galleryImages, placeImageRotation]);
  const videoItems = actualMedia.videos;
  const selectedGalleryImage = selectedGalleryIndex === null ? null : imageItems[selectedGalleryIndex] ?? null;
  const customHeroImage = isLegacyExternalPlaceImage(selectedEventSummary?.primaryImageUrl) ? null : selectedEventSummary?.primaryImageUrl;
  const heroImage = eventImages[0]?.url || customHeroImage || PLACE_IMAGES[0].url;
  const placeVisualItems = placeImageItems.length ? placeImageItems : PLACE_IMAGES;
  const placeBackgroundImage = placeVisualItems[0]?.url || heroImage;
  const placePhotoItems = placeVisualItems.slice(1, GALLERY_IMAGE_LIMIT);
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

    const returnUrl = getSafeReturnUrl();
    if (returnUrl) {
      window.location.assign(returnUrl);
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
    setGalleryRotation(createGalleryRotationState(galleryImages));
    setSelectedGalleryIndex(null);
  }, [galleryImages, gallerySourceKey]);

  useEffect(() => {
    setPlaceImageRotation(createGalleryRotationState(galleryImages));
  }, [galleryImages, gallerySourceKey]);

  useEffect(() => {
    if (selectedGalleryImage || galleryImages.length <= GALLERY_IMAGE_LIMIT) {
      return undefined;
    }

    const galleryTimer = window.setInterval(() => {
      setGalleryRotation((current) => advanceGalleryRotationState(current, galleryImages));
    }, GALLERY_ROTATION_INTERVAL_MS);

    return () => window.clearInterval(galleryTimer);
  }, [galleryImages, selectedGalleryImage]);

  useEffect(() => {
    if (selectedGalleryImage || galleryImages.length <= GALLERY_IMAGE_LIMIT) {
      return undefined;
    }

    const placeTimer = window.setInterval(() => {
      setPlaceImageRotation((current) => advanceGalleryRotationState(current, galleryImages));
    }, GALLERY_ROTATION_INTERVAL_MS);

    return () => window.clearInterval(placeTimer);
  }, [galleryImages, selectedGalleryImage]);

  function scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  useEffect(() => {
    let animationFrameId = 0;

    const updateFloatingActions = () => {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = window.requestAnimationFrame(() => {
        const registrationButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-registration-cta="true"]'));
        const hasVisibleRegistrationButton = registrationButtons.some((button) => {
          const rect = button.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.bottom > 24 && rect.top < window.innerHeight - 24;
        });

        setIsBackToTopVisible(window.scrollY > 520);
        setIsFloatingRegistrationVisible(!hasVisibleRegistrationButton && window.scrollY > 180);
      });
    };

    updateFloatingActions();
    const layoutCheckTimeout = window.setTimeout(updateFloatingActions, 220);
    const lateLayoutCheckTimeout = window.setTimeout(updateFloatingActions, 700);
    window.addEventListener('scroll', updateFloatingActions, { passive: true });
    window.addEventListener('resize', updateFloatingActions);
    window.addEventListener('hashchange', updateFloatingActions);
    return () => {
      window.clearTimeout(layoutCheckTimeout);
      window.clearTimeout(lateLayoutCheckTimeout);
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener('scroll', updateFloatingActions);
      window.removeEventListener('resize', updateFloatingActions);
      window.removeEventListener('hashchange', updateFloatingActions);
    };
  }, [events.length, selectedEventSlug, selectedEventSummary?.slug]);

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

  const isInitialPageLoading = !eventsQuery.data && (eventsQuery.isLoading || siteSettingsQuery.isLoading);

  if (isInitialPageLoading) {
    return (
      <ChurchPreloader
        fullscreen
        label="Загружаем Blagodaty Camp"
        description="Готовим страницу, мероприятия и фотографии."
      />
    );
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

          <button className="button button-primary" type="button" data-registration-cta="true" onClick={() => openRegistration(selectedEventSummary?.slug)}>
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
              <button className="button button-primary" type="button" data-registration-cta="true" onClick={() => openRegistration(selectedEventSummary?.slug)}>
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
                    <button className="button button-primary" type="button" data-registration-cta="true" onClick={() => openRegistration(eventItem.slug)}>
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
            <CrossfadeImage className="place-copy-visual" src={placeBackgroundImage} alt="" loading="eager" decorative />
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
            {placePhotoItems.map((item, index) => (
              <CrossfadeImage
                className={index === 0 ? 'place-photo-main' : 'place-photo-side'}
                src={item.url}
                alt={item.title || 'Экоаил'}
                key={`place-photo-${index}`}
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
                key={`media-card-${index}`}
                type="button"
                onClick={() => setSelectedGalleryIndex(index)}
              >
                <CrossfadeImage className="media-card-visual" src={item.url} alt={item.title || selectedEventSummary?.title || 'Фото места'} />
                <div className="media-card-copy">
                  <strong>{item.title || 'Фото'}</strong>
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
                </div>
              </div>
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
          <article className="content-card program-card">
            <h2>{selectedEventSummary?.title || 'Blagodaty Camp'}</h2>
            <div className="program-highlights">
              {activeHighlights.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>

            {details?.scheduleItems.length ? (
              <div className="timeline-list">
                {details.scheduleItems.slice(0, 4).map((item) => {
                  const scheduleCopy = getProgramScheduleCopy(item);

                  return (
                    <article className="timeline-row" key={item.id}>
                      <strong>{scheduleCopy.title}</strong>
                      <span>{formatDateRange(item.startsAtUtc, item.endsAtUtc || item.startsAtUtc)}</span>
                      <p>{scheduleCopy.body}</p>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </article>
        </section>

        <section className="cta-banner container">
          <button className="button button-primary" type="button" data-registration-cta="true" onClick={() => openRegistration(selectedEventSummary?.slug)}>
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
                      <a className="social-link contact-link" href={link.url} key={link.id} target="_blank" rel="noreferrer">
                        <ContactLinkIcon link={link} />
                        <span>{link.label}</span>
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

      {(isFloatingRegistrationVisible || isBackToTopVisible) && !isModalOpen && !selectedGalleryImage ? (
        <div className="floating-actions" aria-label="Быстрые действия">
          {isFloatingRegistrationVisible ? (
            <button className="floating-register" type="button" onClick={() => openRegistration(selectedEventSummary?.slug)}>
              <RegisterActionIcon />
              <span>Регистрация</span>
            </button>
          ) : null}

          {isBackToTopVisible ? (
            <button className="floating-scroll-top" type="button" onClick={scrollToTop} aria-label="Наверх" title="Наверх">
              <ArrowUpIcon />
            </button>
          ) : null}
        </div>
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
