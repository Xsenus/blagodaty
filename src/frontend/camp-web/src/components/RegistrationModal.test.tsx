import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { submitGuestEventRegistration } from '../lib/api';
import type { CampRegistration, PublicEventDetails, PublicEventSummary } from '../types';
import { RegistrationModal } from './RegistrationModal';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();

  return {
    ...actual,
    submitGuestEventRegistration: vi.fn(),
  };
});

const submitGuestEventRegistrationMock = vi.mocked(submitGuestEventRegistration);

function makeEventDetails(overrides: Partial<PublicEventDetails> = {}): PublicEventDetails {
  return {
    id: 'event-1',
    seriesSlug: 'blagodaty-camp',
    seriesTitle: 'Blagodaty Camp',
    kind: 'Camp',
    slug: 'blagodaty-camp-2026',
    title: 'Blagodaty Camp Лето 2026',
    seasonLabel: 'Лето 2026',
    shortDescription: 'Выезд в Горный Алтай',
    fullDescription: 'Палатки, домики, костры, молитва и общение.',
    location: 'Горный Алтай',
    timezone: 'Asia/Novosibirsk',
    status: 'RegistrationOpen',
    startsAtUtc: '2026-07-15T00:00:00Z',
    endsAtUtc: '2026-07-23T00:00:00Z',
    registrationOpensAtUtc: '2026-04-01T00:00:00Z',
    registrationClosesAtUtc: '2026-07-10T00:00:00Z',
    isRegistrationOpen: true,
    isRegistrationClosingSoon: false,
    capacity: 150,
    remainingCapacity: 150,
    waitlistEnabled: false,
    priceOptions: [
      {
        id: 'price-standard',
        code: 'standard',
        title: 'Стандартное участие',
        description: 'Базовый тариф для участия в лагере.',
        amount: 32000,
        currency: 'RUB',
        salesStartsAtUtc: null,
        salesEndsAtUtc: null,
        capacity: null,
        isDefault: true,
        isActive: true,
      },
    ],
    scheduleItems: [],
    contentBlocks: [],
    mediaItems: [],
    ...overrides,
  };
}

function makeEventSummary(event: PublicEventDetails): PublicEventSummary {
  return {
    id: event.id,
    seriesSlug: event.seriesSlug,
    seriesTitle: event.seriesTitle,
    kind: event.kind,
    slug: event.slug,
    title: event.title,
    seasonLabel: event.seasonLabel,
    shortDescription: event.shortDescription,
    location: event.location,
    startsAtUtc: event.startsAtUtc,
    endsAtUtc: event.endsAtUtc,
    registrationOpensAtUtc: event.registrationOpensAtUtc,
    registrationClosesAtUtc: event.registrationClosesAtUtc,
    isRegistrationOpen: event.isRegistrationOpen,
    isRegistrationClosingSoon: event.isRegistrationClosingSoon,
    capacity: event.capacity,
    remainingCapacity: event.remainingCapacity,
    waitlistEnabled: event.waitlistEnabled,
    priceFromAmount: event.priceOptions[0]?.amount,
    priceCurrency: event.priceOptions[0]?.currency,
    primaryImageUrl: null,
  };
}

function makeSavedRegistration(): CampRegistration {
  return {
    id: 'registration-1',
    eventEditionId: 'event-1',
    eventSlug: 'blagodaty-camp-2026',
    eventTitle: 'Blagodaty Camp Лето 2026',
    eventSeasonLabel: 'Лето 2026',
    eventSeriesTitle: 'Blagodaty Camp',
    eventLocation: 'Горный Алтай',
    selectedPriceOptionId: 'price-standard',
    selectedPriceOptionTitle: 'Стандартное участие',
    selectedPriceOptionAmount: 32000,
    selectedPriceOptionCurrency: 'RUB',
    status: 'Submitted',
    contactEmail: 'ivan@example.com',
    fullName: 'Иван Иванов',
    birthDate: '1990-01-10',
    city: 'Новосибирск',
    churchName: 'Благодать',
    phoneNumber: '+79991234567',
    phoneNumberConfirmed: false,
    hasCar: true,
    hasChildren: true,
    participantsCount: 2,
    participants: [
      { id: 'participant-1', fullName: 'Иван Иванов', isChild: false, sortOrder: 0 },
      { id: 'participant-2', fullName: 'Петр Иванов', isChild: true, sortOrder: 1 },
    ],
    emergencyContactName: '',
    emergencyContactPhone: '',
    accommodationPreference: 'Cabin',
    healthNotes: 'Без ограничений',
    allergyNotes: '',
    specialNeeds: '',
    motivation: 'Хочу участвовать',
    consentAccepted: true,
    createdAtUtc: '2026-04-26T00:00:00Z',
    updatedAtUtc: '2026-04-26T00:00:00Z',
    submittedAtUtc: '2026-04-26T00:00:00Z',
  };
}

function renderRegistrationModal(selectedEvent: PublicEventDetails | null = makeEventDetails()) {
  const onClose = vi.fn();
  const onSelectEvent = vi.fn();
  const onSubmitted = vi.fn();
  const events = selectedEvent ? [makeEventSummary(selectedEvent)] : [];

  render(
    <RegistrationModal
      isOpen
      onClose={onClose}
      events={events}
      selectedEvent={selectedEvent}
      selectedEventSlug={selectedEvent?.slug ?? null}
      onSelectEvent={onSelectEvent}
      onSubmitted={onSubmitted}
    />,
  );

  return { onClose, onSelectEvent, onSubmitted };
}

describe('RegistrationModal', () => {
  it('opens the direct event form without account, city, or church fields', () => {
    renderRegistrationModal();

    expect(screen.getByRole('dialog', { name: /Анкета участника/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Blagodaty Camp Лето 2026' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Стандартное участие/i })).toBeChecked();

    expect(screen.getByLabelText(/^Email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Телефон$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Дата рождения основного участника/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Город$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Церковь$/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^ФИО$/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Ребёнок/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Размещение$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Доверенное лицо$/i)).not.toBeRequired();
    expect(screen.getByLabelText(/^Телефон доверенного лица$/i)).not.toBeRequired();
    expect(screen.getByRole('button', { name: /Отправить заявку/i })).toBeEnabled();

    expect(screen.queryByText(/Без аккаунта и входа в личный кабинет/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Пароль/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Создать кабинет/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Вход$/i })).not.toBeInTheDocument();
  });

  it('shows only required validation messages and does not submit an empty form', async () => {
    const user = userEvent.setup();
    renderRegistrationModal();

    await user.click(screen.getByRole('button', { name: /Отправить заявку/i }));

    expect(submitGuestEventRegistrationMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Перед отправкой заполните/i)).toBeInTheDocument();
    expect(screen.getByText(/Укажите email для связи/i)).toBeInTheDocument();
    expect(screen.getByText(/Укажите имя основного участника/i)).toBeInTheDocument();
    expect(screen.getByText(/Укажите дату рождения/i)).toBeInTheDocument();
    expect(screen.getByText(/Укажите телефон участника/i)).toBeInTheDocument();
    expect(screen.getByText(/Подтвердите согласие/i)).toBeInTheDocument();
    expect(screen.queryByText(/Укажите город/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Укажите церковь/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Укажите доверенное лицо/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Укажите телефон доверенного лица/i)).not.toBeInTheDocument();
  });

  it('adds participants and submits defaults with optional emergency contacts empty', async () => {
    const user = userEvent.setup();
    const onSubmitted = renderRegistrationModal().onSubmitted;
    submitGuestEventRegistrationMock.mockResolvedValue(makeSavedRegistration());

    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'ivan@example.com' } });
    fireEvent.change(screen.getByLabelText(/^Телефон$/i), { target: { value: '89991234567' } });
    fireEvent.change(screen.getByLabelText(/Дата рождения основного участника/i), { target: { value: '1990-01-10' } });
    fireEvent.change(screen.getByLabelText(/^ФИО$/i), { target: { value: 'Иван Иванов' } });

    await user.click(screen.getByRole('button', { name: /Добавить участника/i }));
    fireEvent.change(screen.getAllByLabelText(/^ФИО$/i)[1], { target: { value: 'Петр Иванов' } });
    await user.click(screen.getAllByRole('checkbox', { name: /Ребёнок/i })[1]);

    await user.selectOptions(screen.getByLabelText(/^Размещение$/i), 'Cabin');
    await user.click(screen.getByRole('checkbox', { name: /Есть автомобиль/i }));
    fireEvent.change(screen.getByLabelText(/Здоровье и ограничения/i), { target: { value: 'Без ограничений' } });
    fireEvent.change(screen.getByLabelText(/^Комментарий$/i), { target: { value: 'Хочу участвовать' } });
    await user.click(screen.getByRole('checkbox', { name: /Подтверждаю корректность данных/i }));
    await user.click(screen.getByRole('button', { name: /Отправить заявку/i }));

    await waitFor(() => expect(submitGuestEventRegistrationMock).toHaveBeenCalledTimes(1));
    expect(submitGuestEventRegistrationMock).toHaveBeenCalledWith(
      'blagodaty-camp-2026',
      expect.objectContaining({
        selectedPriceOptionId: 'price-standard',
        contactEmail: 'ivan@example.com',
        fullName: 'Иван Иванов',
        birthDate: '1990-01-10',
        city: 'Новосибирск',
        churchName: 'Благодать',
        phoneNumber: '+79991234567',
        hasCar: true,
        hasChildren: true,
        participants: [
          { fullName: 'Иван Иванов', isChild: false },
          { fullName: 'Петр Иванов', isChild: true },
        ],
        emergencyContactName: '',
        emergencyContactPhone: '',
        accommodationPreference: 'Cabin',
        healthNotes: 'Без ограничений',
        motivation: 'Хочу участвовать',
        consentAccepted: true,
        submit: true,
      }),
    );
    await screen.findByText(/Спасибо, мы получили анкету/i);
    expect(onSubmitted).toHaveBeenCalledWith(expect.objectContaining({ id: 'registration-1' }));
  });

  it('validates optional emergency phone only when it is filled', async () => {
    const user = userEvent.setup();
    renderRegistrationModal();

    await user.type(screen.getByLabelText(/^Email$/i), 'ivan@example.com');
    await user.type(screen.getByLabelText(/^Телефон$/i), '89991234567');
    await user.type(screen.getByLabelText(/Дата рождения основного участника/i), '1990-01-10');
    await user.type(screen.getByLabelText(/^ФИО$/i), 'Иван Иванов');
    await user.type(screen.getByLabelText(/^Телефон доверенного лица$/i), '123');
    await user.click(screen.getByRole('checkbox', { name: /Подтверждаю корректность данных/i }));
    await user.click(screen.getByRole('button', { name: /Отправить заявку/i }));

    expect(submitGuestEventRegistrationMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Проверьте телефон доверенного лица/i)).toBeInTheDocument();
  });
});
