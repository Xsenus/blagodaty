import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ApiError,
  createSessionTransferTicket,
  getCurrentAccount,
  getPublicEvent,
  getPublicEvents,
  getPublicSiteSettings,
  login as loginRequest,
  logout as logoutRequest,
  refreshSession as refreshSessionRequest,
  register as registerRequest,
} from './lib/api';
import { RegistrationModal } from './components/RegistrationModal';
import { lkBaseUrl } from './lib/config';
import type {
  AccountRegistrationSummary,
  AuthResponse,
  PublicEventContentBlock,
  PublicEventDetails,
  PublicEventMediaItem,
  PublicEventSummary,
  PublicSiteSocialLink,
  SessionState,
} from './types';

const STORAGE_KEY = 'blagodaty.camp.session';

const fallbackHighlights = [
  'Походы, молитва, вечерние костры и спокойный темп, где церковь проводит время вместе.',
  'Прозрачная логистика: даты, тарифы, состав заявки, контакты и статусы участия в одном месте.',
  'Регистрация теперь проходит прямо на лендинге: без скачков по страницам и без потери контекста.',
];

const fallbackThingsToBring = [
  'Спальник, коврик, удобную одежду и тёплые вещи на вечер.',
  'Средства личной гигиены, дождевик и личную аптечку при необходимости.',
  'Библию, блокнот, ручку и открытое сердце к Богу и людям.',
];

const fallbackFaq = [
  {
    question: 'Что изменилось в регистрации?',
    answer: 'Теперь пользователь может создать аккаунт, подтвердить телефон и отправить анкету, не покидая эту страницу.',
  },
  {
    question: 'Где смотреть статус после отправки?',
    answer: 'Статус заявки по-прежнему хранится в личном кабинете, но переход туда больше не обязателен для самой регистрации.',
  },
  {
    question: 'Почему здесь показаны фото и видео, даже если команда их ещё не загрузила?',
    answer: 'Для теста добавлены демо-блоки медиа. Когда появится реальный контент, он автоматически заменит демо-варианты.',
  },
];

const fallbackImageItems: PublicEventMediaItem[] = [
  {
    id: 'demo-photo-1',
    type: 'Image',
    url: '/demo/camp-public-demo.png',
    title: 'Демо-фото атмосферы',
    caption: 'Здесь затем появятся реальные кадры лагеря и выезда.',
  },
  {
    id: 'demo-photo-2',
    type: 'Image',
    url: '/demo/camp-app-demo.png',
    title: 'Демо-фото территории',
    caption: 'Карточка проверяет сетку, адаптив и подписи.',
  },
  {
    id: 'demo-photo-3',
    type: 'Image',
    url: '/demo/lk-app-demo.png',
    title: 'Демо-фото программы',
    caption: 'После загрузки из админки этот блок заменится автоматически.',
  },
];
const fallbackVideoPosterUrl = '/demo/camp-public-demo.png';
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

function formatRegistrationStatus(status?: AccountRegistrationSummary['status'] | null) {
  switch (status) {
    case 'Draft':
      return 'Черновик';
    case 'Submitted':
      return 'Отправлена';
    case 'Confirmed':
      return 'Подтверждена';
    case 'Cancelled':
      return 'Отменена';
    default:
      return 'Новая заявка';
  }
}

type CabinetFocus = 'event' | 'phone' | 'form' | 'summary';

function buildCabinetRegistrationPath(eventSlug?: string | null, focus?: CabinetFocus | null) {
  const search = new URLSearchParams();
  if (eventSlug) {
    search.set('event', eventSlug);
  }

  if (focus) {
    search.set('focus', focus);
  }

  const query = search.toString();
  return query ? `/camp-registration?${query}` : '/camp-registration';
}

function getCabinetPathForRegistration(
  registration: AccountRegistrationSummary | null,
  fallbackEventSlug?: string | null,
  isPhoneConfirmed = false,
) {
  if (!registration) {
    return buildCabinetRegistrationPath(fallbackEventSlug, fallbackEventSlug ? 'event' : undefined);
  }

  const eventSlug = registration.eventSlug ?? fallbackEventSlug;
  if (registration.status === 'Draft' && registration.isRegistrationOpen) {
    return buildCabinetRegistrationPath(eventSlug, isPhoneConfirmed ? 'form' : 'phone');
  }

  if (
    registration.status === 'Draft' ||
    registration.status === 'Submitted' ||
    registration.status === 'Confirmed' ||
    registration.status === 'Cancelled'
  ) {
    return buildCabinetRegistrationPath(eventSlug, 'summary');
  }

  return buildCabinetRegistrationPath(eventSlug);
}

type LandingPrimaryAction =
  | {
      kind: 'modal';
      eventSlug?: string | null;
    }
  | {
      kind: 'cabinet';
      path: string;
    };

function getLandingPrimaryAction(
  registration: AccountRegistrationSummary | null,
  fallbackEventSlug?: string | null,
  isAuthenticated = false,
  isPhoneConfirmed = false,
): LandingPrimaryAction {
  if (!isAuthenticated || !registration) {
    return {
      kind: 'modal',
      eventSlug: fallbackEventSlug,
    };
  }

  if (registration.status === 'Draft') {
    return {
      kind: 'modal',
      eventSlug: registration.eventSlug ?? fallbackEventSlug,
    };
  }

  if (registration.status === 'Cancelled' && registration.isRegistrationOpen) {
    return {
      kind: 'modal',
      eventSlug: registration.eventSlug ?? fallbackEventSlug,
    };
  }

  return {
    kind: 'cabinet',
    path: getCabinetPathForRegistration(registration, fallbackEventSlug, isPhoneConfirmed),
  };
}

function getLandingActionState(
  registration: AccountRegistrationSummary | null,
  isAuthenticated: boolean,
  eventTitle?: string | null,
) {
  const title = eventTitle || 'выбранное событие';

  if (!isAuthenticated) {
    return {
      headerButtonLabel: 'Регистрация',
      heroPrimaryLabel: 'Зарегистрироваться здесь',
      heroNoteTitle: 'Весь путь теперь собран в одном окне',
      heroNoteDescription: 'Сначала событие, затем аккаунт, подтверждение телефона, анкета и отправка без перехода в другой интерфейс.',
      ctaTitle: 'Откройте модалку и пройдите весь путь регистрации прямо на этой странице',
      ctaDescription: 'Создание кабинета, подтверждение телефона и отправка заявки теперь не разорваны между публичным сайтом и отдельным интерфейсом.',
    };
  }

  if (!registration) {
    return {
      headerButtonLabel: 'Оформить участие',
      heroPrimaryLabel: 'Оформить участие',
      heroNoteTitle: 'Аккаунт уже активен, можно начинать без повторного входа',
      heroNoteDescription: `По событию "${title}" заявки пока нет. Откройте модалку и сохраните первый черновик прямо отсюда.`,
      ctaTitle: 'Аккаунт уже готов, осталось открыть заявку по нужному событию',
      ctaDescription: 'Модалка откроется сразу в рабочем сценарии: номер, анкета и отправка заявки без повторной авторизации.',
    };
  }

  if (registration.status === 'Draft') {
    return {
      headerButtonLabel: 'Продолжить заявку',
      heroPrimaryLabel: 'Продолжить заявку',
      heroNoteTitle: 'Черновик уже сохранён',
      heroNoteDescription: `По событию "${title}" уже есть черновик. Можно вернуться в модалку, подтвердить номер и довести заявку до отправки.`,
      ctaTitle: 'Черновик уже создан, осталось завершить регистрацию',
      ctaDescription: 'Лендинг теперь подходит и для возврата в процесс: не нужно искать кабинет, если вы просто хотите продолжить заявку.',
    };
  }

  if (registration.status === 'Submitted') {
    return {
      headerButtonLabel: 'Моя заявка',
      heroPrimaryLabel: 'Открыть мою заявку',
      heroNoteTitle: 'Заявка уже отправлена команде',
      heroNoteDescription: `По событию "${title}" анкета уже отправлена. Здесь можно быстро вернуться к деталям, а в кабинете следить за статусом и уведомлениями.`,
      ctaTitle: 'Регистрация уже завершена, теперь важны статус и уведомления',
      ctaDescription: 'Страница стала полезной и после отправки: можно быстро открыть заявку снова или перейти в кабинет без повторного входа.',
    };
  }

  if (registration.status === 'Confirmed') {
    return {
      headerButtonLabel: 'Моя поездка',
      heroPrimaryLabel: 'Открыть детали поездки',
      heroNoteTitle: 'Участие уже подтверждено',
      heroNoteDescription: `По событию "${title}" участие подтверждено. Отсюда можно быстро перейти к деталям заявки и кабинету, не теряя контекст.`,
      ctaTitle: 'Заявка подтверждена, детали поездки уже доступны',
      ctaDescription: 'Публичная страница теперь остаётся полезной и после подтверждения: это не тупик, а удобная точка входа обратно в сценарий.',
    };
  }

  return {
    headerButtonLabel: 'Открыть заявку',
    heroPrimaryLabel: 'Открыть заявку',
    heroNoteTitle: 'Сценарий можно продолжить с текущего состояния',
    heroNoteDescription: `По событию "${title}" уже есть история регистрации. Откройте форму или кабинет, чтобы посмотреть актуальное состояние.`,
    ctaTitle: 'Откройте текущую заявку и продолжите с сохранённого места',
    ctaDescription: 'Публичная страница теперь не обрывает путь пользователя, а возвращает его прямо к актуальной заявке.',
  };
}

function getEventCardPrimaryActionLabel(
  eventItem: PublicEventSummary,
  registration: AccountRegistrationSummary | null,
  isAuthenticated: boolean,
) {
  if (!registration) {
    if (!eventItem.isRegistrationOpen) {
      return isAuthenticated ? 'Подготовить анкету' : 'Открыть форму';
    }

    return 'Оформить участие';
  }

  switch (registration.status) {
    case 'Draft':
      return eventItem.isRegistrationOpen ? 'Продолжить заявку' : 'Открыть черновик';
    case 'Submitted':
      return 'Открыть заявку';
    case 'Confirmed':
      return 'Детали поездки';
    case 'Cancelled':
      return eventItem.isRegistrationOpen ? 'Подать заново' : 'Посмотреть статус';
    default:
      return isAuthenticated ? 'Открыть заявку' : 'Оформить участие';
  }
}

function getEventCardNote(
  eventItem: PublicEventSummary,
  registration: AccountRegistrationSummary | null,
  isAuthenticated: boolean,
) {
  if (registration) {
    switch (registration.status) {
      case 'Draft':
        return eventItem.isRegistrationOpen
          ? 'Черновик уже сохранён. Можно вернуться и завершить заявку без повторного входа.'
          : 'Черновик сохранён, но окно регистрации сейчас закрыто. Детали всё равно можно открыть и проверить.';
      case 'Submitted':
        return 'Заявка уже отправлена команде. Здесь удобно быстро вернуться к деталям и текущему статусу.';
      case 'Confirmed':
        return 'Участие подтверждено. Карточка теперь работает как быстрый вход обратно в детали поездки.';
      case 'Cancelled':
        return eventItem.isRegistrationOpen
          ? 'Предыдущая заявка закрыта. При необходимости можно открыть форму и оформить участие заново.'
          : 'Заявка отменена. Сейчас карточка полезна как быстрый доступ к истории и деталям события.';
      default:
        break;
    }
  }

  if (eventItem.isRegistrationClosingSoon) {
    return 'Регистрация скоро закроется, поэтому лучше не откладывать анкету на потом.';
  }

  if (!eventItem.isRegistrationOpen) {
    return 'Окно регистрации сейчас закрыто, но событие уже можно посмотреть и заранее подготовить данные.';
  }

  return isAuthenticated
    ? 'Аккаунт уже активен. Можно открыть модалку и начать заявку сразу по выбранному сезону.'
    : 'Регистрация начинается прямо на этой странице: без перехода в кабинет и без потери контекста.';
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

function readStoredSession(): SessionState | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SessionState;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function writeStoredSession(session: SessionState | null) {
  if (!session) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export default function App() {
  const [selectedEventSlug, setSelectedEventSlug] = useState<string | null>(() => readCampUrlState().eventSlug);
  const [isModalOpen, setIsModalOpen] = useState(() => readCampUrlState().isRegistrationOpen);
  const [session, setSession] = useState<SessionState | null>(null);
  const [account, setAccount] = useState<Awaited<ReturnType<typeof getCurrentAccount>> | null>(null);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const refreshPromiseRef = useRef<Promise<SessionState> | null>(null);

  const eventsQuery = useQuery({
    queryKey: ['public-events'],
    queryFn: getPublicEvents,
    retry: false,
  });

  const siteSettingsQuery = useQuery({
    queryKey: ['public-site-settings'],
    queryFn: getPublicSiteSettings,
    retry: false,
  });

  const events = eventsQuery.data?.events ?? [];

  useEffect(() => {
    if (events.length === 0) {
      return;
    }

    if (selectedEventSlug && events.some((event) => event.slug === selectedEventSlug)) {
      return;
    }

    const initialSlug = events.find((event) => event.isRegistrationOpen)?.slug ?? events[0]?.slug ?? null;
    if (initialSlug) {
      selectEvent(initialSlug);
    }
  }, [events, selectedEventSlug]);

  const selectedEventSummary = useMemo(
    () => events.find((event) => event.slug === selectedEventSlug) ?? events.find((event) => event.isRegistrationOpen) ?? events[0] ?? null,
    [events, selectedEventSlug],
  );

  const selectedEventQuery = useQuery({
    queryKey: ['public-event', selectedEventSummary?.slug],
    queryFn: () => getPublicEvent(selectedEventSummary!.slug),
    enabled: Boolean(selectedEventSummary?.slug),
    retry: false,
  });

  useEffect(() => {
    const stored = readStoredSession();
    if (!stored) {
      setIsSessionReady(true);
      return;
    }

    void bootstrap(stored);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    writeCampUrlState(
      {
        eventSlug: selectedEventSlug,
        isRegistrationOpen: isModalOpen,
      },
      {
        historyMode: 'replace',
        modalPushed: false,
      },
    );

    const handlePopState = () => {
      const nextState = readCampUrlState();
      setSelectedEventSlug(nextState.eventSlug);
      setIsModalOpen(nextState.isRegistrationOpen);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  async function bootstrap(stored: SessionState) {
    try {
      const currentAccount = await getCurrentAccount(stored.accessToken);
      setSession(stored);
      setAccount(currentAccount);
      writeStoredSession(stored);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        try {
          const nextSession = await refreshActiveSession(stored);
          const currentAccount = await getCurrentAccount(nextSession.accessToken);
          setSession(nextSession);
          setAccount(currentAccount);
          writeStoredSession(nextSession);
        } catch {
          clearSessionState();
        }
      } else {
        clearSessionState();
      }
    } finally {
      setIsSessionReady(true);
    }
  }

  function applySession(payload: AuthResponse) {
    const nextSession = {
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      accessTokenExpiresAtUtc: payload.accessTokenExpiresAtUtc,
      refreshTokenExpiresAtUtc: payload.refreshTokenExpiresAtUtc,
    };

    setSession(nextSession);
    writeStoredSession(nextSession);
    return nextSession;
  }

  function clearSessionState() {
    writeStoredSession(null);
    setSession(null);
    setAccount(null);
  }

  async function refreshActiveSession(currentSession: SessionState) {
    if (!refreshPromiseRef.current) {
      refreshPromiseRef.current = (async () => {
        const refreshed = await refreshSessionRequest(currentSession);
        return applySession({
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          accessTokenExpiresAtUtc: refreshed.accessTokenExpiresAtUtc,
          refreshTokenExpiresAtUtc: refreshed.refreshTokenExpiresAtUtc,
          user: refreshed.user,
        });
      })().finally(() => {
        refreshPromiseRef.current = null;
      });
    }

    return await refreshPromiseRef.current;
  }

  async function withSessionRetry<T>(operation: (accessToken: string) => Promise<T>) {
    if (!session) {
      throw new Error('Сессия не найдена. Войдите снова.');
    }

    try {
      return await operation(session.accessToken);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        throw error;
      }

      try {
        const refreshedSession = await refreshActiveSession(session);
        return await operation(refreshedSession.accessToken);
      } catch (refreshError) {
        if (refreshError instanceof ApiError) {
          clearSessionState();
          throw new Error('Сессия истекла. Войдите снова, локальный черновик формы сохранён.');
        }

        throw refreshError;
      }
    }
  }

  async function acceptAuthResponse(payload: AuthResponse) {
    const nextSession = applySession(payload);
    const currentAccount = await getCurrentAccount(nextSession.accessToken);
    setAccount(currentAccount);
  }

  async function handleLogin(payload: { email: string; password: string }) {
    const response = await loginRequest(payload);
    await acceptAuthResponse(response);
  }

  async function handleRegister(payload: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    displayName?: string;
  }) {
    const response = await registerRequest(payload);
    await acceptAuthResponse(response);
  }

  async function handleLogout() {
    if (session?.refreshToken) {
      try {
        await logoutRequest(session.refreshToken);
      } catch {
        // ignore transport errors on logout
      }
    }

    clearSessionState();
  }

  async function reloadAccount() {
    const currentAccount = await withSessionRetry((accessToken) => getCurrentAccount(accessToken));
    setAccount(currentAccount);
  }

  const details = selectedEventQuery.data;
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
  const actualMedia = splitMedia(details?.mediaItems ?? []);
  const imageItems = actualMedia.images.length ? actualMedia.images : fallbackImageItems;
  const videoItems = actualMedia.videos;
  const isUsingFallbackMedia = (details?.mediaItems.length ?? 0) === 0;
  const showFallbackVideoCard = videoItems.length === 0;
  const heroImage = selectedEventSummary?.primaryImageUrl || actualMedia.images[0]?.url || fallbackImageItems[0].url;
  const registrationsByEventSlug = useMemo(
    () =>
      new Map(
        (account?.registrations ?? [])
          .filter((item) => Boolean(item.eventSlug))
          .map((item) => [item.eventSlug as string, item]),
      ),
    [account?.registrations],
  );
  const selectedRegistration =
    (selectedEventSummary?.slug ? registrationsByEventSlug.get(selectedEventSummary.slug) : null) ?? null;
  const isCabinetPhoneConfirmed =
    Boolean(account?.user.phoneNumberConfirmed) &&
    Boolean(account?.user.phoneNumber?.trim());
  const isAuthenticated = Boolean(account);
  const selectedCabinetPath = getCabinetPathForRegistration(
    selectedRegistration,
    selectedEventSummary?.slug ?? selectedEventSlug,
    isCabinetPhoneConfirmed,
  );
  const selectedPrimaryAction = getLandingPrimaryAction(
    selectedRegistration,
    selectedEventSummary?.slug ?? selectedEventSlug,
    isAuthenticated,
    isCabinetPhoneConfirmed,
  );
  const landingAction = getLandingActionState(
    selectedRegistration,
    isAuthenticated,
    selectedEventSummary?.title ?? details?.title ?? null,
  );

  function selectEvent(
    slug: string,
    options?: {
      historyMode?: 'push' | 'replace';
      isRegistrationOpen?: boolean;
      modalPushed?: boolean;
    },
  ) {
    const nextModalOpen = options?.isRegistrationOpen ?? isModalOpen;
    setSelectedEventSlug(slug);
    writeCampUrlState(
      {
        eventSlug: slug,
        isRegistrationOpen: nextModalOpen,
      },
      {
        historyMode: options?.historyMode ?? 'replace',
        modalPushed: options?.modalPushed ?? (nextModalOpen ? getCampHistoryState().isModalPushed : false),
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
        historyMode: isModalOpen ? 'replace' : 'push',
        modalPushed: true,
      },
    );
  }

  function closeRegistration() {
    if (typeof window === 'undefined') {
      setIsModalOpen(false);
      return;
    }

    if (getCampHistoryState().isModalPushed) {
      window.history.back();
      return;
    }

    setIsModalOpen(false);
    writeCampUrlState(
      {
        eventSlug: selectedEventSlug,
        isRegistrationOpen: false,
      },
      {
        historyMode: 'replace',
        modalPushed: false,
      },
    );
  }

  function openCabinet(path = '/') {
    if (typeof window === 'undefined') {
      return;
    }

    const targetWindow = window.open('about:blank', '_blank');

    void (async () => {
      const nextUrl = new URL(path, lkBaseUrl);

      if (session?.accessToken) {
        try {
          const transfer = await withSessionRetry((accessToken) => createSessionTransferTicket(accessToken));
          nextUrl.searchParams.set('transfer', transfer.token);
        } catch {
          // fall back to the regular cabinet URL if transfer creation fails
        }
      }

      if (targetWindow) {
        targetWindow.opener = null;
        targetWindow.location.replace(nextUrl.toString());
        return;
      }

      window.location.assign(nextUrl.toString());
    })();
  }

  function runLandingPrimaryAction(action: LandingPrimaryAction) {
    if (action.kind === 'cabinet') {
      openCabinet(action.path);
      return;
    }

    openRegistration(action.eventSlug);
  }

  return (
    <div className="camp-page">
      <div className="camp-glow camp-glow-left" aria-hidden="true" />
      <div className="camp-glow camp-glow-right" aria-hidden="true" />
      <div className="camp-grid-noise" aria-hidden="true" />

      <header className="camp-header container">
        <div className="brand-lockup">
          <span className="brand-mark">B</span>
          <div>
            <p className="brand-kicker">Blagodaty</p>
            <p className="brand-title">Camp & Events</p>
          </div>
        </div>

        <nav className="site-nav">
          <a href="#events">События</a>
          <a href="#media">Фото и видео</a>
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

          {account ? (
            <div className="account-chip">
              <span>{account.user.displayName || account.user.email}</span>
            </div>
          ) : null}

          <button className="button button-primary" type="button" onClick={() => runLandingPrimaryAction(selectedPrimaryAction)}>
            {landingAction.headerButtonLabel}
          </button>
        </div>
      </header>

      <main className="camp-main container">
        <section className="hero-grid">
          <div className="hero-copy">
            <p className="section-kicker">{selectedEventSummary?.seasonLabel || selectedEventSummary?.seriesTitle || 'Blagodaty Camp'}</p>
            <h1>{selectedEventSummary?.title || 'Летний выезд и церковные события Blagodaty'}</h1>
            <p className="hero-lead">
              {details?.shortDescription ||
                selectedEventSummary?.shortDescription ||
                'Собранная страница мероприятия с медиа, программой и полноценной регистрацией прямо внутри модального окна.'}
            </p>

            <div className="hero-badges">
              <span>{details?.location || selectedEventSummary?.location || 'Локация уточняется'}</span>
              <span>{formatDateRange(details?.startsAtUtc || selectedEventSummary?.startsAtUtc, details?.endsAtUtc || selectedEventSummary?.endsAtUtc)}</span>
              <span>{formatCurrency(selectedEventSummary?.priceFromAmount, selectedEventSummary?.priceCurrency || 'RUB')}</span>
              {selectedRegistration ? <span>{formatRegistrationStatus(selectedRegistration.status)}</span> : null}
            </div>

            <div className="hero-actions">
              <button className="button button-primary" type="button" onClick={() => runLandingPrimaryAction(selectedPrimaryAction)}>
                {landingAction.heroPrimaryLabel}
              </button>
              <a className="button button-secondary" href="#media">
                Смотреть медиа
              </a>
              <button className="button button-secondary" type="button" onClick={() => openCabinet(selectedCabinetPath)}>
                Личный кабинет
              </button>
            </div>

            <div className="hero-note-card">
              <strong>{landingAction.heroNoteTitle}</strong>
              <p>{landingAction.heroNoteDescription}</p>
              {selectedRegistration ? (
                <div className="hero-note-pills">
                  <span>{formatRegistrationStatus(selectedRegistration.status)}</span>
                  <span>Участников: {selectedRegistration.participantsCount}</span>
                  {selectedRegistration.isRegistrationClosingSoon ? <span>Скоро закрывается</span> : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="hero-visual-stack">
            <article className="hero-poster-card">
              <img src={heroImage} alt={selectedEventSummary?.title || 'Blagodaty Camp'} />
              <div className="poster-overlay">
                <span className="summary-chip">{selectedEventSummary?.isRegistrationOpen ? 'Регистрация открыта' : 'Следите за анонсом'}</span>
                <strong>{selectedEventSummary?.seriesTitle || 'Blagodaty events'}</strong>
                <p>{details?.fullDescription || 'Живая страница события с фото, видео, расписанием и заявкой без лишних переходов.'}</p>
              </div>
            </article>

            <article className="hero-side-card">
              <p className="section-kicker">Путь участника</p>
              <ol className="process-list">
                <li>Выбрать событие и открыть модалку.</li>
                <li>Войти или создать кабинет без смены страницы.</li>
                <li>Подтвердить телефон и сразу отправить анкету.</li>
              </ol>
              <button className="button button-secondary" type="button" onClick={() => runLandingPrimaryAction(selectedPrimaryAction)}>
                {landingAction.heroPrimaryLabel}
              </button>
            </article>
          </div>
        </section>

        <section className="section-block" id="events">
          <div className="section-heading">
            <p className="section-kicker">События</p>
            <h2>Выберите сезон без ощущения, что страница разваливается по блокам</h2>
          </div>

          <div className="event-grid">
            {events.length ? (
              events.map((eventItem) => {
                const eventRegistration = registrationsByEventSlug.get(eventItem.slug) ?? null;
                const primaryActionLabel = getEventCardPrimaryActionLabel(eventItem, eventRegistration, Boolean(account));
                const eventNote = getEventCardNote(eventItem, eventRegistration, Boolean(account));

                return (
                  <article className={`event-card${selectedEventSlug === eventItem.slug ? ' active' : ''}`} key={eventItem.id}>
                    <div className="event-card-head">
                      <span className="summary-chip">{eventItem.seasonLabel || eventItem.seriesTitle}</span>
                      {eventRegistration ? (
                        <span className={`event-status-chip status-${eventRegistration.status.toLowerCase()}`}>
                          {formatRegistrationStatus(eventRegistration.status)}
                        </span>
                      ) : null}
                    </div>
                    <h3>{eventItem.title}</h3>
                    <p>{eventItem.shortDescription}</p>
                    <div className="event-meta">
                      <span>{formatDateRange(eventItem.startsAtUtc, eventItem.endsAtUtc)}</span>
                      <span>{eventItem.location || 'Локация уточняется'}</span>
                      <span>{formatCurrency(eventItem.priceFromAmount, eventItem.priceCurrency || 'RUB')}</span>
                      {eventItem.isRegistrationClosingSoon ? <span>Скоро закрывается</span> : null}
                    </div>
                    <div className="event-card-note">
                      <strong>{eventRegistration ? 'Ваше состояние по событию' : 'Что можно сделать сейчас'}</strong>
                      <p>{eventNote}</p>
                      {eventRegistration ? (
                        <div className="event-card-note-pills">
                          <span>Участников: {eventRegistration.participantsCount}</span>
                          <span>
                            Обновлено:{' '}
                            {new Intl.DateTimeFormat('ru-RU', {
                              day: '2-digit',
                              month: 'short',
                            }).format(new Date(eventRegistration.updatedAtUtc))}
                          </span>
                        </div>
                      ) : null}
                    </div>
                    <div className="event-card-actions">
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => selectEvent(eventItem.slug, { isRegistrationOpen: isModalOpen })}
                      >
                        {selectedEventSlug === eventItem.slug ? 'Сейчас выбрано' : 'Показать детали'}
                      </button>
                      <button
                        className="button button-primary"
                        type="button"
                        onClick={() =>
                          runLandingPrimaryAction(
                            getLandingPrimaryAction(
                              eventRegistration,
                              eventItem.slug,
                              isAuthenticated,
                              isCabinetPhoneConfirmed,
                            ),
                          )
                        }
                      >
                        {primaryActionLabel}
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <article className="event-card">
                <h3>Список событий появится здесь</h3>
                <p>Страница уже готова к нескольким сезонам и мероприятиям, даже если публикации еще не заполнены.</p>
              </article>
            )}
          </div>
        </section>

        <section className="feature-grid">
          <article className="feature-card">
            <p className="section-kicker">Сильная сторона</p>
            <h3>Хорошая событийная база</h3>
            <p>В проекте уже есть каталог событий, цены, расписание, медиа, кабинет и роли. Основа у системы сильная.</p>
          </article>
          <article className="feature-card">
            <p className="section-kicker">Слабая сторона</p>
            <h3>Разорванный пользовательский путь</h3>
            <p>Раньше публичная страница только подталкивала к переходу в кабинет, а ключевое действие распадалось на несколько экранов.</p>
          </article>
          <article className="feature-card">
            <p className="section-kicker">Что исправлено</p>
            <h3>Собранный сценарий</h3>
            <p>Теперь акцент смещен с “посмотрите и уйдите” на “прочитайте, убедитесь и зарегистрируйтесь здесь же”.</p>
          </article>
        </section>

        <section className="section-block" id="media">
          <div className="section-heading">
            <p className="section-kicker">Фото и видео</p>
            <h2>Медиаблоки появились сразу, а не только когда их когда-нибудь загрузят</h2>
          </div>

          {isUsingFallbackMedia ? (
            <p className="section-hint">Сейчас показаны демо-медиа для теста верстки. Когда команда добавит реальные материалы, секция автоматически подхватит их из backend.</p>
          ) : null}

          <div className="media-grid">
            {imageItems.map((item) => (
              <a className="media-card media-card-image" href={item.url} key={item.id} target="_blank" rel="noreferrer">
                <img src={item.url} alt={item.title || selectedEventSummary?.title || 'Фото события'} loading="lazy" />
                <div className="media-card-copy">
                  <strong>{item.title || 'Фотография события'}</strong>
                  {item.caption ? <span>{item.caption}</span> : null}
                </div>
              </a>
            ))}
          </div>

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

            {showFallbackVideoCard ? (
              <article className="video-card video-card-placeholder">
                <div className="video-frame video-frame-placeholder">
                  <img src={fallbackVideoPosterUrl} alt="Демо-видео Blagodaty Camp" loading="lazy" />
                  <div className="video-placeholder-overlay">
                    <span className="play-badge">▶</span>
                    <strong>Тестовый видео-блок</strong>
                  </div>
                </div>

                <div className="media-card-copy">
                  <strong>Здесь появятся реальные видео</strong>
                  <span>Пока секция проверяет композицию, высоты карточек и адаптив даже без загруженных роликов.</span>
                </div>
              </article>
            ) : null}
          </div>
        </section>

        <section className="content-grid" id="program">
          <article className="content-card">
            <p className="section-kicker">Что важно сразу</p>
            <h2>{selectedEventSummary?.title || 'Главное о ближайшем событии'}</h2>
            <ul className="content-list">
              {(highlights.length ? highlights : fallbackHighlights).map((item) => (
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
            <p className="section-kicker">Организация</p>
            <h2>Что взять с собой и как подготовиться спокойно</h2>
            <ul className="content-list">
              {(thingsToBring.length ? thingsToBring : fallbackThingsToBring).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            {details?.priceOptions.length ? (
              <div className="pricing-stack">
                {details.priceOptions.filter((option) => option.isActive).map((option) => (
                  <article className="pricing-row" key={option.id}>
                    <div>
                      <strong>{option.title}</strong>
                      <p>{option.description || 'Активный тариф для этого события.'}</p>
                    </div>
                    <span>{formatCurrency(option.amount, option.currency)}</span>
                  </article>
                ))}
              </div>
            ) : null}
          </article>
        </section>

        <section className="section-block" id="faq">
          <div className="section-heading">
            <p className="section-kicker">FAQ</p>
            <h2>Что уже продумано в новом сценарии страницы</h2>
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

        <section className="cta-banner">
          <div>
            <p className="section-kicker">Следующий шаг</p>
            <h2>{landingAction.ctaTitle}</h2>
            <p>{landingAction.ctaDescription}</p>
          </div>

          <div className="cta-actions">
            <button className="button button-primary" type="button" onClick={() => runLandingPrimaryAction(selectedPrimaryAction)}>
              {landingAction.heroPrimaryLabel}
            </button>
            <button className="button button-secondary" type="button" onClick={() => openCabinet(selectedCabinetPath)}>
              Перейти в кабинет
            </button>
          </div>
        </section>
      </main>

      {siteSettings?.socialLinksEnabled && (footerSocials.length || siteSettings?.socialLinksTitle || siteSettings?.socialLinksDescription) ? (
        <footer className="site-footer container">
          <div className="site-footer-copy">
            <p className="section-kicker">{siteSettings?.socialLinksTitle || 'Мы на связи'}</p>
            <p>{siteSettings?.socialLinksDescription || 'Следите за новостями, объявлениями и новыми событиями общины.'}</p>
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
        session={session}
        account={account}
        isSessionReady={isSessionReady}
        onLogin={handleLogin}
        onRegister={handleRegister}
        withSession={withSessionRetry}
        onOpenCabinet={openCabinet}
        onReloadAccount={reloadAccount}
        onLogout={handleLogout}
      />
    </div>
  );
}
