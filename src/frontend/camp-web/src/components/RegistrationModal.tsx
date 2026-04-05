import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ApiError,
  getEventRegistration,
  saveEventRegistration,
  sendPhoneVerificationCode,
  verifyPhoneVerificationCode,
} from '../lib/api';
import type {
  AccommodationPreference,
  CampRegistration,
  CurrentAccount,
  PublicEventDetails,
  PublicEventSummary,
  SaveRegistrationRequest,
  SessionState,
} from '../types';

type RegistrationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  events: PublicEventSummary[];
  selectedEvent: PublicEventDetails | null;
  selectedEventSlug: string | null;
  onSelectEvent: (slug: string) => void;
  session: SessionState | null;
  account: CurrentAccount | null;
  isSessionReady: boolean;
  onLogin: (payload: { email: string; password: string }) => Promise<void>;
  onRegister: (payload: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    displayName?: string;
  }) => Promise<void>;
  withSession: <T>(operation: (accessToken: string) => Promise<T>) => Promise<T>;
  onOpenCabinet: (path?: string) => void;
  onReloadAccount: () => Promise<void>;
  onLogout: () => Promise<void>;
};

type EditableParticipant = {
  fullName: string;
  isChild: boolean;
};

type ModalScrollTarget = 'event' | 'phone' | 'form' | 'summary';

const EMPTY_PARTICIPANT: EditableParticipant = {
  fullName: '',
  isChild: false,
};

function getDraftStorageKey(userId?: string | null, eventSlug?: string | null) {
  if (!userId || !eventSlug) {
    return null;
  }

  return `blagodaty.camp.modal-draft:${userId}:${eventSlug}`;
}

function createEmptyForm(): SaveRegistrationRequest {
  return {
    selectedPriceOptionId: null,
    contactEmail: '',
    fullName: '',
    birthDate: '',
    city: '',
    churchName: '',
    phoneNumber: '',
    hasCar: false,
    hasChildren: false,
    participants: [{ ...EMPTY_PARTICIPANT }],
    emergencyContactName: '',
    emergencyContactPhone: '',
    accommodationPreference: 'Either',
    healthNotes: '',
    allergyNotes: '',
    specialNeeds: '',
    motivation: '',
    consentAccepted: false,
    submit: false,
  };
}

function readDraftForm(storageKey: string | null): SaveRegistrationRequest | null {
  if (!storageKey || typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SaveRegistrationRequest>;
    const participants = Array.isArray(parsed.participants)
      ? parsed.participants.map((participant) => ({
          fullName: typeof participant?.fullName === 'string' ? participant.fullName : '',
          isChild: Boolean(participant?.isChild),
        }))
      : [{ ...EMPTY_PARTICIPANT }];

    return {
      ...createEmptyForm(),
      ...parsed,
      selectedPriceOptionId:
        typeof parsed.selectedPriceOptionId === 'string' || parsed.selectedPriceOptionId === null
          ? parsed.selectedPriceOptionId ?? null
          : null,
      contactEmail: typeof parsed.contactEmail === 'string' ? parsed.contactEmail : '',
      fullName: typeof parsed.fullName === 'string' ? parsed.fullName : '',
      birthDate: typeof parsed.birthDate === 'string' ? parsed.birthDate : '',
      city: typeof parsed.city === 'string' ? parsed.city : '',
      churchName: typeof parsed.churchName === 'string' ? parsed.churchName : '',
      phoneNumber: typeof parsed.phoneNumber === 'string' ? parsed.phoneNumber : '',
      emergencyContactName: typeof parsed.emergencyContactName === 'string' ? parsed.emergencyContactName : '',
      emergencyContactPhone: typeof parsed.emergencyContactPhone === 'string' ? parsed.emergencyContactPhone : '',
      healthNotes: typeof parsed.healthNotes === 'string' ? parsed.healthNotes : '',
      allergyNotes: typeof parsed.allergyNotes === 'string' ? parsed.allergyNotes : '',
      specialNeeds: typeof parsed.specialNeeds === 'string' ? parsed.specialNeeds : '',
      motivation: typeof parsed.motivation === 'string' ? parsed.motivation : '',
      hasCar: Boolean(parsed.hasCar),
      hasChildren: Boolean(parsed.hasChildren),
      consentAccepted: Boolean(parsed.consentAccepted),
      participants: participants.length ? participants : [{ ...EMPTY_PARTICIPANT }],
      submit: false,
    };
  } catch {
    window.localStorage.removeItem(storageKey);
    return null;
  }
}

function writeDraftForm(storageKey: string | null, form: SaveRegistrationRequest) {
  if (!storageKey || typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    storageKey,
    JSON.stringify({
      ...form,
      submit: false,
    }),
  );
}

function clearDraftForm(storageKey: string | null) {
  if (!storageKey || typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(storageKey);
}

function isPriceOptionCurrentlyAvailable(
  option: {
    isActive: boolean;
    salesStartsAtUtc?: string | null;
    salesEndsAtUtc?: string | null;
  },
) {
  if (!option.isActive) {
    return false;
  }

  const now = Date.now();
  const startsAt = option.salesStartsAtUtc ? new Date(option.salesStartsAtUtc).getTime() : null;
  const endsAt = option.salesEndsAtUtc ? new Date(option.salesEndsAtUtc).getTime() : null;

  return (startsAt === null || startsAt <= now) && (endsAt === null || endsAt >= now);
}

function formatDateRangeCompact(startsAtUtc?: string | null, endsAtUtc?: string | null) {
  if (!startsAtUtc) {
    return 'Даты уточняются';
  }

  const formatter = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
  });

  if (!endsAtUtc) {
    return formatter.format(new Date(startsAtUtc));
  }

  return `${formatter.format(new Date(startsAtUtc))} - ${formatter.format(new Date(endsAtUtc))}`;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Уточняется';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatTimeOnly(value?: string | null) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatMoney(amount?: number | null, currency = 'RUB') {
  if (amount == null) {
    return 'Уточняется';
  }

  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function normalizePhone(value?: string | null) {
  if (!value) {
    return '';
  }

  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return value.trim();
  }

  if (digits.length === 11 && digits.startsWith('8')) {
    return `+7${digits.slice(1)}`;
  }

  return digits.length >= 10 ? `+${digits}` : value.trim();
}

function formatResendCountdown(seconds: number) {
  if (seconds < 60) {
    return `${seconds} сек.`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (!remainingSeconds) {
    return `${minutes} мин.`;
  }

  return `${minutes} мин. ${remainingSeconds} сек.`;
}

function parseCooldownSeconds(message: string) {
  const match = message.match(/(\d+)\s*сек/i);
  if (!match) {
    return null;
  }

  const seconds = Number.parseInt(match[1], 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidPhone(value: string) {
  return /^\+\d{10,15}$/.test(normalizePhone(value));
}

function ensureParticipants(participants: EditableParticipant[], fallbackFullName = '') {
  const sanitized = participants.map((participant) => ({
    fullName: participant.fullName,
    isChild: participant.isChild,
  }));

  if (sanitized.length > 0) {
    return sanitized;
  }

  return [
    {
      fullName: fallbackFullName,
      isChild: false,
    },
  ];
}

function syncParticipants(current: SaveRegistrationRequest, participants: EditableParticipant[]) {
  const nextParticipants = ensureParticipants(participants, current.fullName);
  return {
    ...current,
    participants: nextParticipants,
    fullName: nextParticipants[0]?.fullName ?? '',
    hasChildren: current.hasChildren || nextParticipants.some((participant) => participant.isChild),
  };
}

function buildDraftPayload(form: SaveRegistrationRequest): SaveRegistrationRequest {
  const participants = ensureParticipants(form.participants, form.fullName)
    .map((participant) => ({
      fullName: participant.fullName.trim(),
      isChild: participant.isChild,
    }))
    .filter((participant) => participant.fullName);

  return {
    ...form,
    selectedPriceOptionId: form.selectedPriceOptionId ?? null,
    contactEmail: form.contactEmail.trim(),
    fullName: participants[0]?.fullName ?? form.fullName.trim(),
    birthDate: form.birthDate,
    city: form.city.trim(),
    churchName: form.churchName.trim(),
    phoneNumber: form.phoneNumber.trim(),
    hasChildren: form.hasChildren || participants.some((participant) => participant.isChild),
    participants,
    emergencyContactName: form.emergencyContactName.trim(),
    emergencyContactPhone: form.emergencyContactPhone.trim(),
    healthNotes: form.healthNotes?.trim() ?? '',
    allergyNotes: form.allergyNotes?.trim() ?? '',
    specialNeeds: form.specialNeeds?.trim() ?? '',
    motivation: form.motivation?.trim() ?? '',
    submit: false,
  };
}

function getPreferredName(account: CurrentAccount | null) {
  if (!account) {
    return '';
  }

  const fullName = `${account.user.firstName} ${account.user.lastName}`.trim();
  if (fullName) {
    return fullName;
  }

  return account.user.displayName.trim();
}

function getPreferredEmail(account: CurrentAccount | null) {
  if (!account) {
    return '';
  }

  return account.user.email.trim();
}

function collectRegistrationValidationErrors(
  form: SaveRegistrationRequest,
  selectedEvent: PublicEventDetails | null,
  requireConfirmedPhone: boolean,
  isPhoneConfirmed: boolean,
) {
  const errors: string[] = [];
  const hasActivePriceOptions = Boolean(selectedEvent?.priceOptions.some((option) => option.isActive));
  const primaryParticipantName = form.participants[0]?.fullName.trim() || form.fullName.trim();

  if (!selectedEvent) {
    errors.push('Сначала выберите мероприятие.');
    return errors;
  }

  if (!requireConfirmedPhone) {
    return errors;
  }

  if (hasActivePriceOptions && !form.selectedPriceOptionId) {
    errors.push('Выберите тариф участия.');
  }

  if (!form.contactEmail.trim()) {
    errors.push('Укажите email для связи.');
  } else if (!isValidEmail(form.contactEmail)) {
    errors.push('Проверьте формат email.');
  }

  if (!primaryParticipantName) {
    errors.push('Укажите имя основного участника.');
  }

  if (!form.birthDate) {
    errors.push('Укажите дату рождения основного участника.');
  }

  if (!form.city.trim()) {
    errors.push('Укажите город.');
  }

  if (!form.churchName.trim()) {
    errors.push('Укажите церковь.');
  }

  if (!form.phoneNumber.trim()) {
    errors.push('Укажите телефон участника.');
  } else if (!isValidPhone(form.phoneNumber)) {
    errors.push('Проверьте телефон участника.');
  }

  if (!form.emergencyContactName.trim()) {
    errors.push('Укажите доверенное лицо для экстренной связи.');
  }

  if (!form.emergencyContactPhone.trim()) {
    errors.push('Укажите телефон доверенного лица.');
  } else if (!isValidPhone(form.emergencyContactPhone)) {
    errors.push('Проверьте телефон доверенного лица.');
  }

  if (!form.consentAccepted) {
    errors.push('Подтвердите согласие на обработку персональных данных.');
  }

  if (requireConfirmedPhone && !isPhoneConfirmed) {
    errors.push('Подтвердите номер телефона перед отправкой заявки.');
  }

  return errors;
}

function getRegistrationScrollTarget(
  form: SaveRegistrationRequest,
  selectedEvent: PublicEventDetails | null,
  requireConfirmedPhone: boolean,
  isPhoneConfirmed: boolean,
): ModalScrollTarget {
  if (!selectedEvent) {
    return 'event';
  }

  if (requireConfirmedPhone) {
    if (!form.phoneNumber.trim() || !isValidPhone(form.phoneNumber) || !isPhoneConfirmed) {
      return 'phone';
    }
  }

  return 'summary';
}

function registrationToForm(currentRegistration: CampRegistration): SaveRegistrationRequest {
  const participants = currentRegistration.participants.length > 0
    ? currentRegistration.participants
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((participant) => ({
          fullName: participant.fullName,
          isChild: participant.isChild,
        }))
    : [
        {
          fullName: currentRegistration.fullName,
          isChild: currentRegistration.hasChildren,
        },
      ];

  return {
    selectedPriceOptionId: currentRegistration.selectedPriceOptionId ?? null,
    contactEmail: currentRegistration.contactEmail,
    fullName: currentRegistration.fullName,
    birthDate: currentRegistration.birthDate,
    city: currentRegistration.city,
    churchName: currentRegistration.churchName,
    phoneNumber: currentRegistration.phoneNumber,
    hasCar: currentRegistration.hasCar,
    hasChildren: currentRegistration.hasChildren,
    participants,
    emergencyContactName: currentRegistration.emergencyContactName,
    emergencyContactPhone: currentRegistration.emergencyContactPhone,
    accommodationPreference: currentRegistration.accommodationPreference,
    healthNotes: currentRegistration.healthNotes ?? '',
    allergyNotes: currentRegistration.allergyNotes ?? '',
    specialNeeds: currentRegistration.specialNeeds ?? '',
    motivation: currentRegistration.motivation ?? '',
    consentAccepted: currentRegistration.consentAccepted,
    submit: false,
  };
}

function buildPrefillForm(
  account: CurrentAccount | null,
  selectedEvent: PublicEventDetails,
  current: SaveRegistrationRequest,
): SaveRegistrationRequest {
  const defaultPriceOption = selectedEvent.priceOptions.find((option) => option.isDefault && isPriceOptionCurrentlyAvailable(option))
    ?? selectedEvent.priceOptions.find((option) => isPriceOptionCurrentlyAvailable(option))
    ?? selectedEvent.priceOptions.find((option) => option.isActive)
    ?? null;
  const preferredName = getPreferredName(account);
  const participants = preferredName
    ? [{ fullName: preferredName, isChild: false }]
    : current.participants.length
      ? current.participants
      : [{ ...EMPTY_PARTICIPANT }];

  return {
    ...current,
    selectedPriceOptionId: defaultPriceOption?.id ?? current.selectedPriceOptionId ?? null,
    contactEmail: getPreferredEmail(account),
    fullName: participants[0]?.fullName ?? '',
    participants,
    city: account?.user.city ?? '',
    churchName: account?.user.churchName ?? '',
    phoneNumber: account?.user.phoneNumber ?? '',
  };
}

export function RegistrationModal({
  isOpen,
  onClose,
  events,
  selectedEvent,
  selectedEventSlug,
  onSelectEvent,
  session,
  account,
  isSessionReady,
  onLogin,
  onRegister,
  withSession,
  onOpenCabinet,
  onReloadAccount,
  onLogout,
}: RegistrationModalProps) {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [authForm, setAuthForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    displayName: '',
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);

  const [registration, setRegistration] = useState<CampRegistration | null>(null);
  const [completedRegistration, setCompletedRegistration] = useState<CampRegistration | null>(null);
  const [form, setForm] = useState<SaveRegistrationRequest>(() => createEmptyForm());
  const [isLoadingRegistration, setIsLoadingRegistration] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [validationMode, setValidationMode] = useState<'draft' | 'submit' | null>(null);
  const [draftSyncState, setDraftSyncState] = useState<'idle' | 'syncing' | 'saved' | 'error'>('idle');
  const [draftSyncError, setDraftSyncError] = useState<string | null>(null);
  const [draftSyncAtUtc, setDraftSyncAtUtc] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [verificationCode, setVerificationCode] = useState('');
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationExpiresAtUtc, setVerificationExpiresAtUtc] = useState<string | null>(null);
  const [verificationDebugCode, setVerificationDebugCode] = useState<string | null>(null);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [cooldownUntilMs, setCooldownUntilMs] = useState<number | null>(null);
  const [cooldownTick, setCooldownTick] = useState(() => Date.now());
  const lastDraftSnapshotRef = useRef<string | null>(null);
  const eventSectionRef = useRef<HTMLElement | null>(null);
  const phoneSectionRef = useRef<HTMLElement | null>(null);
  const formSectionRef = useRef<HTMLElement | null>(null);
  const validationSummaryRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setAuthError(null);
      setFormError(null);
      setFormMessage(null);
      setVerificationError(null);
      setVerificationMessage(null);
      setVerificationCode('');
      setVerificationDebugCode(null);
      setVerificationExpiresAtUtc(null);
      setCompletedRegistration(null);
      setCooldownUntilMs(null);
      setDraftNotice(null);
      setValidationMode(null);
      setDraftSyncState('idle');
      setDraftSyncError(null);
      setDraftSyncAtUtc(null);
      lastDraftSnapshotRef.current = null;
    }
  }, [isOpen]);

  const draftStorageKey = useMemo(
    () => getDraftStorageKey(account?.user.id ?? null, selectedEvent?.slug ?? null),
    [account?.user.id, selectedEvent?.slug],
  );

  useEffect(() => {
    if (!isOpen || !selectedEvent) {
      return;
    }

    if (!session?.accessToken) {
      const nextForm = buildPrefillForm(account, selectedEvent, createEmptyForm());
      setRegistration(null);
      setCompletedRegistration(null);
      setForm(nextForm);
      lastDraftSnapshotRef.current = JSON.stringify(buildDraftPayload(nextForm));
      setDraftSyncState('idle');
      setDraftSyncError(null);
      setDraftSyncAtUtc(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      setIsLoadingRegistration(true);
      setFormError(null);
      setValidationMode(null);

      try {
        let currentRegistration: CampRegistration | null = null;

        try {
          currentRegistration = await withSession((accessToken) => getEventRegistration(accessToken, selectedEvent.slug));
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 404)) {
            throw error;
          }
        }

        if (cancelled) {
          return;
        }

        setRegistration(currentRegistration);
        setCompletedRegistration(null);
        if (currentRegistration) {
          const nextForm = registrationToForm(currentRegistration);
          clearDraftForm(draftStorageKey);
          setDraftNotice(null);
          setForm(nextForm);
          lastDraftSnapshotRef.current = JSON.stringify(buildDraftPayload(nextForm));
          setDraftSyncState('saved');
          setDraftSyncError(null);
          setDraftSyncAtUtc(currentRegistration.updatedAtUtc);
          return;
        }

        const baseForm = buildPrefillForm(account, selectedEvent, createEmptyForm());
        const storedDraft = readDraftForm(draftStorageKey);
        const nextForm = storedDraft ? { ...baseForm, ...storedDraft } : baseForm;
        setDraftNotice(storedDraft ? 'Локальный черновик восстановлен с этого устройства.' : null);
        setForm(nextForm);
        lastDraftSnapshotRef.current = JSON.stringify(buildDraftPayload(nextForm));
        setDraftSyncState('idle');
        setDraftSyncError(null);
        setDraftSyncAtUtc(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setFormError(error instanceof Error ? error.message : 'Не удалось открыть форму регистрации.');
      } finally {
        if (!cancelled) {
          setIsLoadingRegistration(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [account, draftStorageKey, isOpen, selectedEvent, session?.accessToken]);

  const completedParticipants = useMemo(
    () => form.participants.filter((participant) => participant.fullName.trim()),
    [form.participants],
  );
  const participantsCount = Math.max(completedParticipants.length, 1);
  const childrenCount = completedParticipants.filter((participant) => participant.isChild).length;
  const effectiveHasChildren = form.hasChildren || childrenCount > 0;
  const availablePriceOptions = selectedEvent?.priceOptions.filter((option) => option.isActive) ?? [];
  const normalizedFormPhone = normalizePhone(form.phoneNumber);
  const normalizedAccountPhone = normalizePhone(account?.user.phoneNumber ?? '');
  const phoneReady = Boolean(account?.user.phoneNumberConfirmed) && normalizedFormPhone !== '' && normalizedFormPhone === normalizedAccountPhone;
  const previousPhoneRef = useRef(normalizedFormPhone);
  const resendCountdown = cooldownUntilMs ? Math.max(0, Math.ceil((cooldownUntilMs - cooldownTick) / 1000)) : 0;
  const validationErrors = useMemo(
    () =>
      validationMode
        ? collectRegistrationValidationErrors(form, selectedEvent, validationMode === 'submit', phoneReady)
        : [],
    [form, phoneReady, selectedEvent, validationMode],
  );
  const hasTariffChoice = !selectedEvent?.priceOptions.some((option) => option.isActive) || Boolean(form.selectedPriceOptionId);
  const hasContactDetails =
    Boolean(form.contactEmail.trim()) &&
    isValidEmail(form.contactEmail) &&
    Boolean(form.birthDate) &&
    Boolean(form.city.trim()) &&
    Boolean(form.churchName.trim());
  const hasEmergencyContact =
    Boolean(form.emergencyContactName.trim()) &&
    Boolean(form.emergencyContactPhone.trim()) &&
    isValidPhone(form.emergencyContactPhone);
  const hasParticipantDetails = completedParticipants.length > 0;
  const readinessCompleteCount = [
    hasTariffChoice,
    hasContactDetails,
    hasEmergencyContact,
    hasParticipantDetails,
    form.consentAccepted,
  ].filter(Boolean).length;

  function scrollToTarget(target: ModalScrollTarget) {
    const nextElement =
      target === 'event'
        ? eventSectionRef.current
        : target === 'phone'
          ? phoneSectionRef.current
          : target === 'form'
            ? formSectionRef.current
            : validationSummaryRef.current;

    window.requestAnimationFrame(() => {
      nextElement?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      if (target === 'summary') {
        validationSummaryRef.current?.focus();
      }
    });
  }

  useEffect(() => {
    if (!cooldownUntilMs) {
      return undefined;
    }

    if (cooldownUntilMs <= Date.now()) {
      setCooldownUntilMs(null);
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setCooldownTick(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [cooldownUntilMs]);

  useEffect(() => {
    if (previousPhoneRef.current && previousPhoneRef.current !== normalizedFormPhone) {
      setVerificationCode('');
      setVerificationMessage(null);
      setVerificationError(null);
      setVerificationExpiresAtUtc(null);
      setVerificationDebugCode(null);
      setCooldownUntilMs(null);
    }

    previousPhoneRef.current = normalizedFormPhone;
  }, [normalizedFormPhone]);

  useEffect(() => {
    if (!isOpen || !session?.accessToken || !draftStorageKey || isLoadingRegistration || registration || completedRegistration) {
      return;
    }

    writeDraftForm(draftStorageKey, form);
  }, [completedRegistration, draftStorageKey, form, isLoadingRegistration, isOpen, registration, session?.accessToken]);

  useEffect(() => {
    if (!isOpen || !session?.accessToken || !selectedEvent || isLoadingRegistration || isSaving || completedRegistration) {
      return undefined;
    }

    const payload = buildDraftPayload(form);
    const nextSnapshot = JSON.stringify(payload);
    if (nextSnapshot === lastDraftSnapshotRef.current) {
      return undefined;
    }

    setDraftSyncState('syncing');
    setDraftSyncError(null);

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const saved = await withSession((accessToken) => saveEventRegistration(accessToken, selectedEvent.slug, payload));
          lastDraftSnapshotRef.current = nextSnapshot;
          setRegistration(saved);
          setDraftSyncState('saved');
          setDraftSyncError(null);
          setDraftSyncAtUtc(saved.updatedAtUtc);
        } catch (error) {
          setDraftSyncState('error');
          setDraftSyncError(error instanceof Error ? error.message : 'Не удалось автоматически сохранить черновик.');
        }
      })();
    }, 1600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [completedRegistration, form, isLoadingRegistration, isOpen, isSaving, selectedEvent, session?.accessToken, withSession]);

  function updateParticipants(updater: (participants: EditableParticipant[]) => EditableParticipant[]) {
    setForm((current) => syncParticipants(current, updater(current.participants)));
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError(null);
    setIsAuthSubmitting(true);

    try {
      if (authMode === 'login') {
        await onLogin({
          email: authForm.email,
          password: authForm.password,
        });
      } else {
        await onRegister({
          email: authForm.email,
          password: authForm.password,
          firstName: authForm.firstName,
          lastName: authForm.lastName,
          displayName: authForm.displayName || undefined,
        });
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Не удалось выполнить вход.');
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  async function handleSendCode() {
    if (!session?.accessToken) {
      return;
    }

    if (!form.phoneNumber.trim()) {
      setVerificationMessage(null);
      setVerificationError('Укажите телефон участника, чтобы получить код подтверждения.');
      scrollToTarget('phone');
      return;
    }

    if (!isValidPhone(form.phoneNumber)) {
      setVerificationMessage(null);
      setVerificationError('Проверьте формат телефона участника перед отправкой кода.');
      scrollToTarget('phone');
      return;
    }

    setVerificationError(null);
    setVerificationMessage(null);
    setFormError(null);
    setIsSendingCode(true);

    try {
      const response = await withSession((accessToken) => sendPhoneVerificationCode(accessToken, {
        phoneNumber: form.phoneNumber,
      }));

      setForm((current) => ({
        ...current,
        phoneNumber: response.phoneNumber,
      }));
      setVerificationCode('');
      setVerificationExpiresAtUtc(response.alreadyVerified ? null : response.expiresAtUtc);
      setVerificationDebugCode(response.alreadyVerified ? null : response.debugCode ?? null);
      setVerificationMessage(response.message ?? 'Код подтверждения создан.');
      setCooldownTick(Date.now());
      setCooldownUntilMs(
        response.alreadyVerified || response.resendCooldownSeconds <= 0
          ? null
          : Date.now() + response.resendCooldownSeconds * 1000,
      );

      if (response.alreadyVerified) {
        await onReloadAccount();
      }
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'Не удалось отправить код подтверждения.';
      const cooldownSeconds = parseCooldownSeconds(nextMessage);
      if (cooldownSeconds) {
        setCooldownTick(Date.now());
        setCooldownUntilMs(Date.now() + cooldownSeconds * 1000);
      }

      setVerificationError(nextMessage);
    } finally {
      setIsSendingCode(false);
    }
  }

  async function handleVerifyCode() {
    if (!session?.accessToken) {
      return;
    }

    setVerificationError(null);
    setVerificationMessage(null);
    setIsVerifyingCode(true);

    try {
      const response = await withSession((accessToken) => verifyPhoneVerificationCode(accessToken, {
        phoneNumber: form.phoneNumber,
        code: verificationCode,
      }));

      setForm((current) => ({
        ...current,
        phoneNumber: response.phoneNumber,
      }));
      setVerificationCode('');
      setVerificationDebugCode(null);
      setCooldownUntilMs(null);
      setVerificationMessage('Телефон подтверждён. Можно отправлять заявку.');
      await onReloadAccount();
    } catch (error) {
      setVerificationError(error instanceof Error ? error.message : 'Не удалось подтвердить номер.');
    } finally {
      setIsVerifyingCode(false);
    }
  }

  async function handleSave(submitMode: boolean) {
    if (!session?.accessToken || !selectedEvent) {
      return;
    }

    const nextValidationMode = submitMode ? 'submit' : 'draft';
    const nextValidationErrors = collectRegistrationValidationErrors(form, selectedEvent, submitMode, phoneReady);
    setValidationMode(nextValidationMode);

    if (nextValidationErrors.length > 0) {
      setFormMessage(null);
      setFormError(
        submitMode
          ? 'Перед отправкой заявки заполните обязательные поля и подтвердите контактные данные.'
          : 'Чтобы сохранить текущий черновик, заполните обязательные поля формы.',
      );
      scrollToTarget(
        getRegistrationScrollTarget(form, selectedEvent, submitMode, phoneReady),
      );
      return;
    }

    setValidationMode(null);
    setFormMessage(null);
    setFormError(null);
    setIsSaving(true);

    try {
      const payload: SaveRegistrationRequest = {
        ...form,
        fullName: form.participants[0]?.fullName.trim() || form.fullName.trim(),
        phoneNumber: form.phoneNumber.trim(),
        city: form.city.trim(),
        churchName: form.churchName.trim(),
        contactEmail: form.contactEmail.trim(),
        emergencyContactName: form.emergencyContactName.trim(),
        emergencyContactPhone: form.emergencyContactPhone.trim(),
        participants: ensureParticipants(form.participants, form.fullName)
          .map((participant) => ({
            fullName: participant.fullName.trim(),
            isChild: participant.isChild,
          }))
          .filter((participant) => participant.fullName),
        hasChildren: effectiveHasChildren,
        submit: submitMode,
      };

      const saved = await withSession((accessToken) => saveEventRegistration(accessToken, selectedEvent.slug, payload));
      setRegistration(saved);
      const nextForm = registrationToForm(saved);
      setForm(nextForm);
      lastDraftSnapshotRef.current = JSON.stringify(buildDraftPayload(nextForm));
      setDraftSyncState('saved');
      setDraftSyncError(null);
      setDraftSyncAtUtc(saved.updatedAtUtc);
      clearDraftForm(draftStorageKey);
      setDraftNotice(null);
      await onReloadAccount();

      if (submitMode) {
        setCompletedRegistration(saved);
      } else {
        setFormMessage('Черновик сохранён. Можно вернуться и продолжить позже.');
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Не удалось сохранить заявку.');
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-root" aria-hidden={!isOpen}>
      <div className="modal-backdrop" onClick={onClose} />

      <section className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="camp-modal-title">
        <aside className="modal-sidebar">
          <div className="modal-sidebar-head">
            <p className="section-kicker">Регистрация без переходов</p>
            <h2 id="camp-modal-title">Оформите участие прямо здесь</h2>
            <p>
              Аккаунт, подтверждение телефона и анкета участника теперь собираются в одном окне.
            </p>
          </div>

          {selectedEvent ? (
            <article className="modal-event-summary">
              <span className="summary-chip">{selectedEvent.seasonLabel || selectedEvent.seriesTitle}</span>
              <strong>{selectedEvent.title}</strong>
              <p>{selectedEvent.shortDescription}</p>
              <div className="modal-summary-list">
                <span>{selectedEvent.location || 'Локация уточняется'}</span>
                <span>{formatDateRangeCompact(selectedEvent.startsAtUtc, selectedEvent.endsAtUtc)}</span>
                <span>{selectedEvent.remainingCapacity ?? selectedEvent.capacity ?? 'Без лимита'} мест</span>
              </div>
            </article>
          ) : (
            <article className="modal-event-summary">
              <strong>Активное событие готовится</strong>
              <p>Как только команда опубликует ближайший выезд, его можно будет оформить из этого окна.</p>
            </article>
          )}

          <div className="modal-step-list">
            <article className={`modal-step-card${session ? ' complete' : ''}`}>
              <strong>1. Аккаунт</strong>
              <span>{session ? 'Вход выполнен' : 'Создайте кабинет или войдите'}</span>
            </article>
            <article className={`modal-step-card${phoneReady ? ' complete' : ''}`}>
              <strong>2. Телефон</strong>
              <span>{phoneReady ? 'Номер подтверждён' : 'Подтвердите номер в этом окне'}</span>
            </article>
            <article className={`modal-step-card${completedRegistration ? ' complete' : ''}`}>
              <strong>3. Заявка</strong>
              <span>{completedRegistration ? 'Заявка отправлена' : 'Заполните и отправьте форму'}</span>
            </article>
          </div>

          <div className="modal-sidebar-actions">
            <button className="button button-secondary" type="button" onClick={() => onOpenCabinet('/')}>
              Открыть кабинет отдельно
            </button>
          </div>
        </aside>

        <div className="modal-main">
          <button className="modal-close" type="button" aria-label="Закрыть окно" onClick={onClose}>
            ×
          </button>

          {!isSessionReady ? (
            <div className="modal-state-card">
              <strong>Проверяем текущую сессию</strong>
              <p>Если вы уже входили ранее, анкета подгрузится автоматически.</p>
            </div>
          ) : !session ? (
            <div className="modal-auth-layout">
              <div className="modal-auth-copy">
                <p className="section-kicker">Шаг 1</p>
                <h3>{authMode === 'login' ? 'Вход в кабинет участника' : 'Создание кабинета участника'}</h3>
                <p>
                  После входа откроем подтверждение номера и саму форму лагеря без отдельной вкладки с личным кабинетом.
                </p>
              </div>

              <form className="modal-auth-card" onSubmit={handleAuthSubmit}>
                <div className="modal-auth-switch">
                  <button
                    className={authMode === 'register' ? 'active' : ''}
                    type="button"
                    onClick={() => setAuthMode('register')}
                  >
                    Регистрация
                  </button>
                  <button
                    className={authMode === 'login' ? 'active' : ''}
                    type="button"
                    onClick={() => setAuthMode('login')}
                  >
                    Вход
                  </button>
                </div>

                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={authForm.email}
                    onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="name@example.com"
                    required
                  />
                </label>

                <label>
                  <span>Пароль</span>
                  <input
                    type="password"
                    value={authForm.password}
                    onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                    placeholder="Минимум 8 символов"
                    required
                  />
                </label>

                {authMode === 'register' ? (
                  <>
                    <div className="modal-form-grid">
                      <label>
                        <span>Имя</span>
                        <input
                          type="text"
                          value={authForm.firstName}
                          onChange={(event) => setAuthForm((current) => ({ ...current, firstName: event.target.value }))}
                          required
                        />
                      </label>

                      <label>
                        <span>Фамилия</span>
                        <input
                          type="text"
                          value={authForm.lastName}
                          onChange={(event) => setAuthForm((current) => ({ ...current, lastName: event.target.value }))}
                          required
                        />
                      </label>
                    </div>

                    <label>
                      <span>Как показывать вас в кабинете</span>
                      <input
                        type="text"
                        value={authForm.displayName}
                        onChange={(event) => setAuthForm((current) => ({ ...current, displayName: event.target.value }))}
                        placeholder="Например, Александр"
                      />
                    </label>
                  </>
                ) : null}

                {authError ? <p className="form-error">{authError}</p> : null}

                <button className="button button-primary modal-submit" type="submit" disabled={isAuthSubmitting}>
                  {isAuthSubmitting
                    ? 'Подождите...'
                    : authMode === 'login'
                      ? 'Войти и открыть форму'
                      : 'Создать кабинет и открыть форму'}
                </button>
              </form>
            </div>
          ) : completedRegistration ? (
            <div className="modal-success-view">
              <p className="section-kicker">Готово</p>
              <h3>Заявка отправлена</h3>
              <p>
                Мы сохранили анкету по событию <strong>{completedRegistration.eventTitle || selectedEvent?.title}</strong>. Статус можно
                отслеживать прямо в кабинете, но вы уже завершили весь сценарий не покидая эту страницу.
              </p>

              <div className="success-summary-grid">
                <article>
                  <span>Событие</span>
                  <strong>{completedRegistration.eventTitle || selectedEvent?.title || 'Blagodaty Camp'}</strong>
                </article>
                <article>
                  <span>Статус</span>
                  <strong>{completedRegistration.status}</strong>
                </article>
                <article>
                  <span>Участников</span>
                  <strong>{completedRegistration.participantsCount}</strong>
                </article>
                <article>
                  <span>Обновлено</span>
                  <strong>{formatDateTime(completedRegistration.updatedAtUtc)}</strong>
                </article>
              </div>

              <div className="modal-action-row">
                <button className="button button-primary" type="button" onClick={onClose}>
                  Вернуться к странице
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => onOpenCabinet(`/camp-registration?event=${completedRegistration.eventSlug ?? selectedEventSlug ?? ''}`)}
                >
                  Открыть заявку в кабинете
                </button>
              </div>
            </div>
          ) : (
            <div className="modal-form-layout">
              <div className="modal-account-bar">
                <div>
                  <p className="section-kicker">Аккаунт активен</p>
                  <strong>{account?.user.displayName || account?.user.email}</strong>
                  <span>{account?.user.email}</span>
                </div>

                <button className="button button-secondary" type="button" onClick={() => void onLogout()}>
                  Сменить аккаунт
                </button>
              </div>

              <div className="modal-progress-grid" aria-label="Состояние регистрации">
                <button
                  className={`modal-progress-card${selectedEvent && hasTariffChoice ? ' complete' : ' warning'}`}
                  type="button"
                  onClick={() => scrollToTarget('event')}
                >
                  <span>Событие</span>
                  <strong>{selectedEvent?.title || 'Выберите событие'}</strong>
                  <em>
                    {selectedEvent
                      ? hasTariffChoice
                        ? 'Сезон и тариф уже выбраны.'
                        : 'Откройте блок события и выберите тариф участия.'
                      : 'Сначала выберите лагерь, сезон или выезд.'}
                  </em>
                </button>

                <button
                  className={`modal-progress-card${phoneReady ? ' complete' : ' warning'}`}
                  type="button"
                  onClick={() => scrollToTarget('phone')}
                >
                  <span>Телефон</span>
                  <strong>{phoneReady ? 'Номер подтверждён' : form.phoneNumber.trim() ? 'Нужна проверка номера' : 'Укажите телефон'}</strong>
                  <em>
                    {phoneReady
                      ? `${form.phoneNumber} готов для уведомлений и отправки заявки.`
                      : 'Получите код и подтвердите номер, не выходя из модалки.'}
                  </em>
                </button>

                <button
                  className={`modal-progress-card${completedRegistration || readinessCompleteCount === 5 ? ' complete' : ' warning'}`}
                  type="button"
                  onClick={() => scrollToTarget('form')}
                >
                  <span>Анкета</span>
                  <strong>{completedRegistration ? 'Заявка уже отправлена' : `Готово блоков: ${readinessCompleteCount}/5`}</strong>
                  <em>
                    {completedRegistration
                      ? 'Статус уже сохранён, детали можно открыть и позже.'
                      : 'Проверьте контакты, участников и согласие перед отправкой.'}
                  </em>
                </button>
              </div>

              <section className="modal-panel" ref={eventSectionRef}>
                <div className="section-inline">
                  <div>
                    <p className="section-kicker">Выбор события</p>
                    <h3>Куда оформляем заявку</h3>
                  </div>
                  <p className="section-inline-note">Можно переключаться между сезонами прямо внутри модалки.</p>
                </div>

                <div className="modal-event-grid">
                  {events.map((eventItem) => (
                    <button
                      key={eventItem.id}
                      className={`modal-event-card${selectedEventSlug === eventItem.slug ? ' active' : ''}`}
                      type="button"
                      onClick={() => onSelectEvent(eventItem.slug)}
                    >
                      <span>{eventItem.seasonLabel || eventItem.seriesTitle}</span>
                      <strong>{eventItem.title}</strong>
                      <em>{formatDateRangeCompact(eventItem.startsAtUtc, eventItem.endsAtUtc)}</em>
                    </button>
                  ))}
                </div>
              </section>

              {selectedEvent ? (
                <>
                  <section className="modal-panel" ref={phoneSectionRef}>
                    <div className="section-inline">
                      <div>
                        <p className="section-kicker">Подтверждение телефона</p>
                        <h3>Шаг 2. Закрепляем номер за этой заявкой</h3>
                      </div>
                      <p className="section-inline-note">
                        Перед финальной отправкой номер должен быть подтверждён. Это же условие теперь проверяет backend.
                      </p>
                    </div>

                    <div className={`verification-banner${phoneReady ? ' success' : ''}`}>
                      <div>
                        <strong>{phoneReady ? 'Номер подтверждён' : 'Номер пока не подтверждён'}</strong>
                        <p>
                          {phoneReady
                            ? `Подтверждён номер ${form.phoneNumber}. Можно отправлять анкету.`
                            : 'Введите телефон участника, получите код и подтвердите его в этом окне.'}
                        </p>
                      </div>
                    </div>

                    <div className="verification-grid">
                      <label>
                        <span>Телефон участника</span>
                        <input
                          value={form.phoneNumber}
                          onChange={(event) => setForm((current) => ({ ...current, phoneNumber: event.target.value }))}
                          placeholder="+7 999 123-45-67"
                          required
                        />
                      </label>

                      <button
                        className="button button-secondary verification-send"
                        type="button"
                        disabled={isSendingCode || resendCountdown > 0}
                        onClick={handleSendCode}
                      >
                        {isSendingCode ? 'Создаём код...' : phoneReady ? 'Отправить код повторно' : 'Получить код'}
                      </button>
                    </div>

                    {resendCountdown > 0 ? (
                      <p className="form-muted verification-hint">
                        Повторный запрос станет доступен через {formatResendCountdown(resendCountdown)}
                      </p>
                    ) : null}

                    <div className="verification-grid verification-grid-code">
                      <label>
                        <span>Код подтверждения</span>
                        <input
                          value={verificationCode}
                          onChange={(event) => setVerificationCode(event.target.value)}
                          placeholder="Введите код"
                        />
                        {verificationExpiresAtUtc ? (
                          <small className="form-muted">Код действует до {formatDateTime(verificationExpiresAtUtc)}.</small>
                        ) : null}
                      </label>

                      <button className="button button-primary verification-send" type="button" disabled={isVerifyingCode || !verificationCode.trim()} onClick={handleVerifyCode}>
                        {isVerifyingCode ? 'Проверяем...' : 'Подтвердить номер'}
                      </button>
                    </div>

                    {verificationDebugCode ? (
                      <p className="form-success">Тестовый режим: код для проверки {verificationDebugCode}</p>
                    ) : null}
                    {verificationMessage ? <p className="form-success">{verificationMessage}</p> : null}
                    {verificationError ? <p className="form-error">{verificationError}</p> : null}
                  </section>

                  <section className="modal-panel" ref={formSectionRef}>
                    <div className="section-inline">
                      <div>
                        <p className="section-kicker">Анкета события</p>
                        <h3>Шаг 3. Заполните данные участника</h3>
                      </div>
                      <p className="section-inline-note">
                        {selectedEvent.isRegistrationOpen
                          ? 'Черновик можно сохранять в любой момент, а отправка станет активной после подтверждения телефона.'
                          : 'Окно регистрации сейчас закрыто, но черновик можно подготовить заранее.'}
                      </p>
                    </div>

                    {isLoadingRegistration ? (
                      <div className="modal-state-card">
                        <strong>Загружаем текущую заявку</strong>
                        <p>Если у вас уже был черновик по этому событию, мы подставим его в форму.</p>
                      </div>
                    ) : (
                      <>
                        <div className="modal-metrics-grid">
                          <article>
                            <span>Даты</span>
                            <strong>{formatDateRangeCompact(selectedEvent.startsAtUtc, selectedEvent.endsAtUtc)}</strong>
                          </article>
                          <article>
                            <span>Локация</span>
                            <strong>{selectedEvent.location || 'Уточняется'}</strong>
                          </article>
                          <article>
                            <span>Мест осталось</span>
                            <strong>{selectedEvent.remainingCapacity ?? selectedEvent.capacity ?? 'Без лимита'}</strong>
                          </article>
                          <article>
                            <span>Статус заявки</span>
                            <strong>{registration?.status || 'Новая'}</strong>
                          </article>
                        </div>

                        {availablePriceOptions.length ? (
                          <div className="price-option-list">
                            {availablePriceOptions.map((option) => {
                              const isSelected = form.selectedPriceOptionId === option.id;
                              const isAvailable = isPriceOptionCurrentlyAvailable(option);

                              return (
                                <label className={`price-option-card${isSelected ? ' active' : ''}`} key={option.id}>
                                  <input
                                    type="radio"
                                    name="priceOption"
                                    value={option.id}
                                    checked={isSelected}
                                    onChange={() => setForm((current) => ({ ...current, selectedPriceOptionId: option.id }))}
                                  />
                                  <span>{option.title}</span>
                                  <strong>{formatMoney(option.amount, option.currency)}</strong>
                                  <em>{option.description || (isAvailable ? 'Тариф доступен для выбора' : 'Тариф пока недоступен')}</em>
                                </label>
                              );
                            })}
                          </div>
                        ) : null}

                        {draftNotice ? <p className="form-success">{draftNotice}</p> : null}
                        {validationErrors.length ? (
                          <div className="validation-summary" ref={validationSummaryRef} tabIndex={-1}>
                            <strong>
                              {validationMode === 'submit'
                                ? 'Перед отправкой осталось проверить:'
                                : 'Перед сохранением заполните:'}
                            </strong>
                            <ul className="validation-list">
                              {validationErrors.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        <div className="modal-section-grid">
                          <section className="modal-subpanel">
                            <h4>Контакты</h4>

                            <div className="modal-form-grid">
                              <label>
                                <span>Email</span>
                                <input
                                  type="email"
                                  value={form.contactEmail}
                                  onChange={(event) => setForm((current) => ({ ...current, contactEmail: event.target.value }))}
                                  required
                                />
                              </label>

                              <label>
                                <span>Дата рождения основного участника</span>
                                <input
                                  type="date"
                                  value={form.birthDate}
                                  onChange={(event) => setForm((current) => ({ ...current, birthDate: event.target.value }))}
                                  required
                                />
                              </label>

                              <label>
                                <span>Город</span>
                                <input
                                  value={form.city}
                                  onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                                  required
                                />
                              </label>

                              <label>
                                <span>Церковь</span>
                                <input
                                  value={form.churchName}
                                  onChange={(event) => setForm((current) => ({ ...current, churchName: event.target.value }))}
                                  required
                                />
                              </label>
                            </div>
                          </section>

                          <section className="modal-subpanel">
                            <h4>Состав заявки</h4>

                            <div className="participant-summary-row">
                              <span className="summary-chip">Участников: {participantsCount}</span>
                              <span className="summary-chip">Детей: {childrenCount}</span>
                            </div>

                            <div className="participant-list">
                              {form.participants.map((participant, index) => (
                                <article className="participant-card" key={`participant-${index}`}>
                                  <div className="participant-card-header">
                                    <strong>{index === 0 ? 'Основной участник' : `Участник ${index + 1}`}</strong>
                                    {form.participants.length > 1 ? (
                                      <button
                                        className="text-button"
                                        type="button"
                                        onClick={() => updateParticipants((items) => items.filter((_, currentIndex) => currentIndex !== index))}
                                      >
                                        Удалить
                                      </button>
                                    ) : null}
                                  </div>

                                  <div className="modal-form-grid participant-grid">
                                    <label>
                                      <span>ФИО</span>
                                      <input
                                        value={participant.fullName}
                                        onChange={(event) => {
                                          const fullName = event.target.value;
                                          if (index === 0) {
                                            setForm((current) => {
                                              const nextParticipants = [...current.participants];
                                              nextParticipants[0] = { ...nextParticipants[0], fullName };
                                              return {
                                                ...current,
                                                participants: nextParticipants,
                                                fullName,
                                              };
                                            });
                                            return;
                                          }

                                          updateParticipants((items) =>
                                            items.map((item, currentIndex) =>
                                              currentIndex === index
                                                ? { ...item, fullName }
                                                : item,
                                            ),
                                          );
                                        }}
                                        required={index === 0}
                                      />
                                    </label>

                                    <label className="checkbox-row compact-checkbox-row">
                                      <input
                                        type="checkbox"
                                        checked={participant.isChild}
                                        onChange={(event) =>
                                          updateParticipants((items) =>
                                            items.map((item, currentIndex) =>
                                              currentIndex === index
                                                ? { ...item, isChild: event.target.checked }
                                                : item,
                                            ),
                                          )
                                        }
                                      />
                                      <span>Ребёнок</span>
                                    </label>
                                  </div>
                                </article>
                              ))}
                            </div>

                            <button className="button button-secondary compact-button" type="button" onClick={() => updateParticipants((items) => [...items, { ...EMPTY_PARTICIPANT }])}>
                              Добавить участника
                            </button>
                          </section>
                        </div>

                        <div className="modal-section-grid">
                          <section className="modal-subpanel">
                            <h4>Размещение и контакты на случай экстренной связи</h4>

                            <div className="modal-form-grid">
                              <label>
                                <span>Предпочтение по размещению</span>
                                <select
                                  value={form.accommodationPreference}
                                  onChange={(event) =>
                                    setForm((current) => ({
                                      ...current,
                                      accommodationPreference: event.target.value as AccommodationPreference,
                                    }))
                                  }
                                >
                                  <option value="Either">Подойдёт любой формат</option>
                                  <option value="Tent">Палатка</option>
                                  <option value="Cabin">Домик</option>
                                </select>
                              </label>

                              <label>
                                <span>Контакт доверенного лица</span>
                                <input
                                  value={form.emergencyContactName}
                                  onChange={(event) => setForm((current) => ({ ...current, emergencyContactName: event.target.value }))}
                                  required
                                />
                              </label>

                              <label>
                                <span>Телефон доверенного лица</span>
                                <input
                                  value={form.emergencyContactPhone}
                                  onChange={(event) => setForm((current) => ({ ...current, emergencyContactPhone: event.target.value }))}
                                  required
                                />
                              </label>
                            </div>

                            <div className="checkbox-grid">
                              <label className="checkbox-row">
                                <input
                                  type="checkbox"
                                  checked={form.hasCar}
                                  onChange={(event) => setForm((current) => ({ ...current, hasCar: event.target.checked }))}
                                />
                                <span>Есть автомобиль</span>
                              </label>

                              <label className="checkbox-row">
                                <input
                                  type="checkbox"
                                  checked={form.hasChildren}
                                  onChange={(event) => setForm((current) => ({ ...current, hasChildren: event.target.checked }))}
                                />
                                <span>Еду с детьми</span>
                              </label>
                            </div>
                          </section>

                          <section className="modal-subpanel">
                            <h4>Дополнительные заметки</h4>

                            <div className="modal-form-grid">
                              <label>
                                <span>Здоровье и ограничения</span>
                                <textarea
                                  rows={3}
                                  value={form.healthNotes}
                                  onChange={(event) => setForm((current) => ({ ...current, healthNotes: event.target.value }))}
                                />
                              </label>

                              <label>
                                <span>Аллергии</span>
                                <textarea
                                  rows={3}
                                  value={form.allergyNotes}
                                  onChange={(event) => setForm((current) => ({ ...current, allergyNotes: event.target.value }))}
                                />
                              </label>

                              <label>
                                <span>Особые условия</span>
                                <textarea
                                  rows={3}
                                  value={form.specialNeeds}
                                  onChange={(event) => setForm((current) => ({ ...current, specialNeeds: event.target.value }))}
                                />
                              </label>

                              <label>
                                <span>Почему хотите поехать</span>
                                <textarea
                                  rows={3}
                                  value={form.motivation}
                                  onChange={(event) => setForm((current) => ({ ...current, motivation: event.target.value }))}
                                />
                              </label>
                            </div>
                          </section>
                        </div>

                        <label className="checkbox-row consent-row">
                          <input
                            type="checkbox"
                            checked={form.consentAccepted}
                            onChange={(event) => setForm((current) => ({ ...current, consentAccepted: event.target.checked }))}
                          />
                          <span>Подтверждаю корректность данных и согласие на обработку анкеты.</span>
                        </label>

                        {formMessage ? <p className="form-success">{formMessage}</p> : null}
                        {formError ? <p className="form-error">{formError}</p> : null}
                        {!formError && draftSyncError ? <p className="form-error draft-sync-status">Автосохранение не удалось: {draftSyncError}</p> : null}
                        {!formError && !draftSyncError && draftSyncState === 'syncing' ? (
                          <p className="form-muted draft-sync-status">Черновик синхронизируется с сервером...</p>
                        ) : null}
                        {!formError && !draftSyncError && draftSyncState === 'saved' && draftSyncAtUtc ? (
                          <p className="form-muted draft-sync-status">Черновик сохранён автоматически в {formatTimeOnly(draftSyncAtUtc)}.</p>
                        ) : null}

                        <div className="modal-action-row">
                          <button className="button button-secondary" type="button" disabled={isSaving} onClick={() => void handleSave(false)}>
                            {isSaving ? 'Сохраняем...' : 'Сохранить черновик'}
                          </button>
                          <button
                            className="button button-primary"
                            type="button"
                            disabled={isSaving || !selectedEvent.isRegistrationOpen}
                            onClick={() => void handleSave(true)}
                          >
                            {isSaving ? 'Отправляем...' : selectedEvent.isRegistrationOpen ? 'Отправить заявку' : 'Регистрация закрыта'}
                          </button>
                        </div>
                      </>
                    )}
                  </section>
                </>
              ) : (
                <div className="modal-state-card">
                  <strong>Нет опубликованного события</strong>
                  <p>Как только команда откроет сезон, форма регистрации появится здесь автоматически.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
