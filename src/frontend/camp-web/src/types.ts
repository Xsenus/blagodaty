export type AppRole = 'Member' | 'CampManager' | 'Admin';
export type EventKind = 'Camp' | 'Conference' | 'Retreat' | 'Trip' | 'Other';
export type EventEditionStatus =
  | 'Draft'
  | 'Published'
  | 'RegistrationOpen'
  | 'RegistrationClosed'
  | 'InProgress'
  | 'Completed'
  | 'Archived';

export type EventScheduleItemKind = 'Arrival' | 'MainProgram' | 'Departure' | 'Meeting' | 'Deadline' | 'Other';
export type EventContentBlockType = 'Hero' | 'About' | 'Highlight' | 'WhatToBring' | 'Program' | 'ImportantNotice' | 'Faq';
export type EventMediaType = 'Image' | 'Video';
export type RegistrationStatus = 'Draft' | 'Submitted' | 'Confirmed' | 'Cancelled';
export type AccommodationPreference = 'Tent' | 'Cabin' | 'Either';

export type PublicEventSummary = {
  id: string;
  seriesSlug: string;
  seriesTitle: string;
  kind: EventKind;
  slug: string;
  title: string;
  seasonLabel?: string | null;
  shortDescription: string;
  location?: string | null;
  startsAtUtc: string;
  endsAtUtc: string;
  registrationOpensAtUtc?: string | null;
  registrationClosesAtUtc?: string | null;
  isRegistrationOpen: boolean;
  isRegistrationClosingSoon: boolean;
  capacity?: number | null;
  remainingCapacity?: number | null;
  waitlistEnabled: boolean;
  priceFromAmount?: number | null;
  priceCurrency?: string | null;
  primaryImageUrl?: string | null;
};

export type PublicEventPriceOption = {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  amount: number;
  currency: string;
  salesStartsAtUtc?: string | null;
  salesEndsAtUtc?: string | null;
  capacity?: number | null;
  isDefault: boolean;
  isActive: boolean;
};

export type PublicEventScheduleItem = {
  id: string;
  title: string;
  kind: EventScheduleItemKind;
  startsAtUtc: string;
  endsAtUtc?: string | null;
  location?: string | null;
  notes?: string | null;
};

export type PublicEventContentBlock = {
  id: string;
  blockType: EventContentBlockType;
  title?: string | null;
  body: string;
};

export type PublicEventMediaItem = {
  id: string;
  type: EventMediaType;
  url: string;
  thumbnailUrl?: string | null;
  title?: string | null;
  caption?: string | null;
};

export type PublicSiteSocialLink = {
  id: string;
  preset: string;
  label: string;
  url: string;
  showInHeader: boolean;
  showInFooter: boolean;
  sortOrder: number;
};

export type PublicSiteSettings = {
  socialLinksEnabled: boolean;
  socialLinksTitle?: string | null;
  socialLinksDescription?: string | null;
  socialLinks: PublicSiteSocialLink[];
};

export type PublicEventDetails = {
  id: string;
  seriesSlug: string;
  seriesTitle: string;
  kind: EventKind;
  slug: string;
  title: string;
  seasonLabel?: string | null;
  shortDescription: string;
  fullDescription?: string | null;
  location?: string | null;
  timezone: string;
  status: EventEditionStatus;
  startsAtUtc: string;
  endsAtUtc: string;
  registrationOpensAtUtc?: string | null;
  registrationClosesAtUtc?: string | null;
  isRegistrationOpen: boolean;
  isRegistrationClosingSoon: boolean;
  capacity?: number | null;
  remainingCapacity?: number | null;
  waitlistEnabled: boolean;
  priceOptions: PublicEventPriceOption[];
  scheduleItems: PublicEventScheduleItem[];
  contentBlocks: PublicEventContentBlock[];
  mediaItems: PublicEventMediaItem[];
};

export type UserSummary = {
  id: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  city?: string | null;
  churchName?: string | null;
  phoneNumber?: string | null;
  phoneNumberConfirmed: boolean;
  roles: AppRole[];
};

export type CampRegistrationSnapshot = {
  id: string;
  eventEditionId?: string | null;
  eventSlug?: string | null;
  status: RegistrationStatus;
  participantsCount: number;
  updatedAtUtc: string;
  submittedAtUtc?: string | null;
};

export type AccountRegistrationSummary = {
  id: string;
  eventEditionId?: string | null;
  eventSlug?: string | null;
  eventTitle?: string | null;
  eventSeasonLabel?: string | null;
  eventSeriesTitle?: string | null;
  eventLocation?: string | null;
  eventStartsAtUtc?: string | null;
  eventEndsAtUtc?: string | null;
  registrationOpensAtUtc?: string | null;
  registrationClosesAtUtc?: string | null;
  isRegistrationOpen: boolean;
  isRegistrationClosingSoon: boolean;
  remainingCapacity?: number | null;
  selectedPriceOptionId?: string | null;
  selectedPriceOptionTitle?: string | null;
  selectedPriceOptionAmount?: number | null;
  selectedPriceOptionCurrency?: string | null;
  participantsCount: number;
  status: RegistrationStatus;
  createdAtUtc: string;
  updatedAtUtc: string;
  submittedAtUtc?: string | null;
};

export type ExternalIdentity = {
  provider: string;
  displayName: string;
  providerUsername?: string | null;
  providerEmail?: string | null;
  providerEmailVerified: boolean;
  avatarUrl?: string | null;
  profileUrl?: string | null;
  createdAtUtc: string;
  verifiedAtUtc?: string | null;
  lastUsedAtUtc?: string | null;
};

export type PublicExternalAuthProvider = {
  provider: string;
  displayName: string;
  mode: 'oauth' | 'telegram';
  enabled: boolean;
  widgetEnabled: boolean;
  botUsername?: string | null;
};

export type CurrentAccount = {
  user: UserSummary;
  registration?: CampRegistrationSnapshot | null;
  registrations: AccountRegistrationSummary[];
  externalIdentities: ExternalIdentity[];
  availableExternalAuthProviders: PublicExternalAuthProvider[];
  unreadNotificationsCount: number;
  hasPassword: boolean;
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAtUtc: string;
  refreshTokenExpiresAtUtc: string;
  user: UserSummary;
};

export type SessionState = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAtUtc: string;
  refreshTokenExpiresAtUtc: string;
};

export type CampRegistrationParticipant = {
  id: string;
  fullName: string;
  isChild: boolean;
  sortOrder: number;
};

export type CampRegistration = {
  id: string;
  eventEditionId?: string | null;
  eventSlug?: string | null;
  eventTitle?: string | null;
  eventSeasonLabel?: string | null;
  eventSeriesTitle?: string | null;
  eventLocation?: string | null;
  selectedPriceOptionId?: string | null;
  selectedPriceOptionTitle?: string | null;
  selectedPriceOptionAmount?: number | null;
  selectedPriceOptionCurrency?: string | null;
  status: RegistrationStatus;
  contactEmail: string;
  fullName: string;
  birthDate: string;
  city: string;
  churchName: string;
  phoneNumber: string;
  phoneNumberConfirmed: boolean;
  hasCar: boolean;
  hasChildren: boolean;
  participantsCount: number;
  participants: CampRegistrationParticipant[];
  emergencyContactName: string;
  emergencyContactPhone: string;
  accommodationPreference: AccommodationPreference;
  healthNotes?: string | null;
  allergyNotes?: string | null;
  specialNeeds?: string | null;
  motivation?: string | null;
  consentAccepted: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
  submittedAtUtc?: string | null;
};

export type SaveRegistrationRequest = {
  selectedPriceOptionId?: string | null;
  contactEmail: string;
  fullName: string;
  birthDate: string;
  city: string;
  churchName: string;
  phoneNumber: string;
  hasCar: boolean;
  hasChildren: boolean;
  participants: Array<{
    fullName: string;
    isChild: boolean;
  }>;
  emergencyContactName: string;
  emergencyContactPhone: string;
  accommodationPreference: AccommodationPreference;
  healthNotes?: string;
  allergyNotes?: string;
  specialNeeds?: string;
  motivation?: string;
  consentAccepted: boolean;
  submit: boolean;
};

export type SendPhoneVerificationCodeResponse = {
  phoneNumber: string;
  expiresAtUtc: string;
  resendCooldownSeconds: number;
  alreadyVerified: boolean;
  isTestMode: boolean;
  debugCode?: string | null;
  message?: string | null;
};

export type VerifyPhoneVerificationCodeResponse = {
  phoneNumber: string;
  verified: boolean;
};

export type SessionTransferTicketResponse = {
  token: string;
  expiresAtUtc: string;
};
