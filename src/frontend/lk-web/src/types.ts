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
  roles: string[];
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

export type CurrentAccount = {
  user: UserSummary;
  registration?: CampRegistrationSnapshot | null;
  registrations: AccountRegistrationSummary[];
  externalIdentities: ExternalIdentity[];
  availableExternalAuthProviders: PublicExternalAuthProvider[];
  unreadNotificationsCount: number;
  hasPassword: boolean;
};

export type NotificationSeverity = 'Info' | 'Success' | 'Warning';
export type UserNotificationType =
  | 'Generic'
  | 'RegistrationSubmitted'
  | 'RegistrationStatusChanged'
  | 'RegistrationClosingSoon';

export type AccountNotification = {
  id: string;
  type: UserNotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  linkUrl?: string | null;
  eventEditionId?: string | null;
  registrationId?: string | null;
  eventSlug?: string | null;
  eventTitle?: string | null;
  isRead: boolean;
  createdAtUtc: string;
  readAtUtc?: string | null;
};

export type AccountNotificationsResponse = {
  items: AccountNotification[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  unreadCount: number;
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAtUtc: string;
  refreshTokenExpiresAtUtc: string;
  user: UserSummary;
};

export type ExternalAuthStartResponse = {
  provider: string;
  intent: 'signin' | 'link' | 'test';
  state: string;
  authUrl: string;
  returnUrl?: string | null;
  expiresAtUtc: string;
  pollIntervalMs: number;
};

export type ExternalAuthStatusResponse = {
  status: string;
  completed: boolean;
  provider?: string | null;
  linked: boolean;
  returnUrl?: string | null;
  message?: string | null;
  auth?: AuthResponse | null;
  identity?: ExternalIdentity | null;
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

export type UpdateProfileRequest = {
  firstName: string;
  lastName: string;
  displayName: string;
  phoneNumber?: string;
  city?: string;
  churchName?: string;
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

export type AdminStats = {
  totalUsers: number;
  totalRegistrations: number;
  submittedRegistrations: number;
  confirmedRegistrations: number;
};

export type AdminRoleDefinition = {
  id: AppRole;
  title: string;
  description: string;
  assignedUserCount: number;
  memberDisplayNames: string[];
};

export type AdminUser = {
  id: string;
  registrationId?: string | null;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  city?: string | null;
  churchName?: string | null;
  phoneNumber?: string | null;
  roles: AppRole[];
  createdAtUtc: string;
  lastLoginAtUtc?: string | null;
  registrationEventEditionId?: string | null;
  registrationEventSlug?: string | null;
  registrationEventTitle?: string | null;
  registrationStatus?: RegistrationStatus | null;
  registrationContactEmail?: string | null;
  registrationParticipantsCount?: number | null;
  registrationHasCar?: boolean | null;
  registrationHasChildren?: boolean | null;
  registrationUpdatedAtUtc?: string | null;
  externalIdentities: ExternalIdentity[];
};

export type AdminOverview = {
  stats: AdminStats;
  roles: AdminRoleDefinition[];
};

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type AdminExternalAuthProvider = {
  provider: string;
  displayName: string;
  mode: 'oauth' | 'telegram';
  enabled: boolean;
  ready: boolean;
  widgetEnabled: boolean;
  clientId?: string | null;
  clientSecretMasked?: string | null;
  botUsername?: string | null;
  botTokenMasked?: string | null;
  callbackUrl?: string | null;
  webhookUrl?: string | null;
  webhookSecretMasked?: string | null;
  hints: string[];
  diagnostics: AdminExternalAuthDiagnostic[];
};

export type AdminExternalAuthDiagnostic = {
  key: string;
  title: string;
  ok: boolean;
  message?: string | null;
};

export type AdminExternalAuthEvent = {
  id: string;
  userId?: string | null;
  provider: string;
  eventType: string;
  detail?: string | null;
  createdAtUtc: string;
};

export type AdminExternalAuthSettings = {
  providers: AdminExternalAuthProvider[];
  recentEvents: AdminExternalAuthEvent[];
};

export type TelegramChatKind = 'Unknown' | 'Private' | 'Group' | 'Supergroup' | 'Channel';
export type TelegramChatSubscriptionType = 'RegistrationSubmitted' | 'RegistrationStatusChanged' | 'RegistrationClosingSoon';
export type TelegramCommandLogStatus = 'Handled' | 'Ignored' | 'Forbidden' | 'Failed';

export type AdminTelegramSummary = {
  totalChats: number;
  activeChats: number;
  totalSubscriptions: number;
  recentCommandsCount: number;
};

export type AdminTelegramEventOption = {
  id: string;
  slug: string;
  title: string;
  status: EventEditionStatus;
};

export type AdminTelegramChatSubscription = {
  id: string;
  eventEditionId: string;
  eventSlug: string;
  eventTitle: string;
  subscriptionType: TelegramChatSubscriptionType;
  isEnabled: boolean;
  messageThreadId?: number | null;
  createdByUserId?: string | null;
  createdByDisplayName?: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
};

export type AdminTelegramChat = {
  id: string;
  chatId: number;
  kind: TelegramChatKind;
  title?: string | null;
  username?: string | null;
  isForum: boolean;
  isActive: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
  lastSeenAtUtc?: string | null;
  subscriptions: AdminTelegramChatSubscription[];
};

export type AdminTelegramCommandLog = {
  id: string;
  telegramChatId?: string | null;
  chatTitle?: string | null;
  chatExternalId?: number | null;
  telegramUserId?: number | null;
  telegramUsername?: string | null;
  userId?: string | null;
  userDisplayName?: string | null;
  command: string;
  arguments?: string | null;
  status: TelegramCommandLogStatus;
  responsePreview?: string | null;
  createdAtUtc: string;
};

export type AdminTelegramOverview = {
  summary: AdminTelegramSummary;
  events: AdminTelegramEventOption[];
  chats: AdminTelegramChat[];
  recentCommands: AdminTelegramCommandLog[];
};

export type CreateAdminTelegramSubscriptionRequest = {
  telegramChatId: string;
  eventEditionId: string;
  subscriptionType: TelegramChatSubscriptionType;
  messageThreadId?: number | null;
  isEnabled: boolean;
};

export type UpdateAdminTelegramSubscriptionRequest = {
  isEnabled: boolean;
  messageThreadId?: number | null;
};

export type UpdateExternalAuthProviderRequest = {
  enabled: boolean;
  widgetEnabled?: boolean;
  clientId?: string;
  clientSecret?: string;
  botUsername?: string;
  botToken?: string;
  webhookSecret?: string;
};

export type AdminEventSummary = {
  id: string;
  eventSeriesId: string;
  seriesSlug: string;
  seriesTitle: string;
  kind: EventKind;
  slug: string;
  title: string;
  seasonLabel?: string | null;
  status: EventEditionStatus;
  startsAtUtc: string;
  endsAtUtc: string;
  registrationClosesAtUtc?: string | null;
  capacity?: number | null;
  registrationsCount: number;
  submittedRegistrations: number;
  confirmedRegistrations: number;
  remainingCapacity?: number | null;
  primaryImageUrl?: string | null;
};

export type AdminEventsResponse = {
  events: AdminEventSummary[];
};

export type AdminDatabaseBackupItem = {
  fileName: string;
  relativePath: string;
  sizeBytes: number;
  createdAtUtc: string;
  trigger: string;
};

export type AdminDatabaseBackupDelivery = {
  fileName: string;
  candidateRecipients: number;
  deliveredCount: number;
};

export type AdminDatabaseBackupsOverview = {
  automaticEnabled: boolean;
  scheduleLocal: string;
  retentionDays: number;
  rootDirectory: string;
  timeZone: string;
  pgDumpCommand: string;
  telegramDeliveryEnabled: boolean;
  adminTelegramRecipientsCount: number;
  items: AdminDatabaseBackupItem[];
};

export type AdminDatabaseBackupCreateResponse = {
  backup: AdminDatabaseBackupItem;
  downloadUrl: string;
  delivery?: AdminDatabaseBackupDelivery | null;
};

export type UpdateAdminDatabaseBackupSettingsRequest = {
  automaticEnabled: boolean;
  scheduleLocal: string;
  retentionDays: number;
  telegramDeliveryEnabled: boolean;
  directory?: string;
  pgDumpPath?: string;
};

export type AdminSiteSocialLink = {
  id: string;
  preset: string;
  label: string;
  url: string;
  enabled: boolean;
  showInHeader: boolean;
  showInFooter: boolean;
  sortOrder: number;
};

export type AdminSiteSettings = {
  socialLinksEnabled: boolean;
  socialLinksTitle?: string | null;
  socialLinksDescription?: string | null;
  socialLinks: AdminSiteSocialLink[];
};

export type GalleryAssetKind = 'Image' | 'Video' | 'File';

export type AdminGalleryAsset = {
  id: string;
  kind: GalleryAssetKind;
  name: string;
  description?: string | null;
  contentType: string;
  fileExtension: string;
  originalFileName: string;
  diskPath: string;
  fileSizeBytes: number;
  createdAtUtc: string;
  updatedAtUtc: string;
  url: string;
  existsOnDisk: boolean;
};

export type AdminGalleryAssetsResponse = {
  items: AdminGalleryAsset[];
};

export type UpdateAdminSiteSocialLinkRequest = {
  id: string;
  preset: string;
  label: string;
  url: string;
  enabled: boolean;
  showInHeader: boolean;
  showInFooter: boolean;
  sortOrder: number;
};

export type UpdateAdminSiteSettingsRequest = {
  socialLinksEnabled: boolean;
  socialLinksTitle?: string;
  socialLinksDescription?: string;
  socialLinks: UpdateAdminSiteSocialLinkRequest[];
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

export type AdminEventPriceOption = {
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
  sortOrder: number;
};

export type AdminEventScheduleItem = {
  id: string;
  title: string;
  kind: EventScheduleItemKind;
  startsAtUtc: string;
  endsAtUtc?: string | null;
  location?: string | null;
  notes?: string | null;
  sortOrder: number;
};

export type AdminEventContentBlock = {
  id: string;
  blockType: EventContentBlockType;
  title?: string | null;
  body: string;
  isPublished: boolean;
  sortOrder: number;
};

export type AdminEventMediaItem = {
  id: string;
  type: EventMediaType;
  url: string;
  thumbnailUrl?: string | null;
  title?: string | null;
  caption?: string | null;
  isPublished: boolean;
  sortOrder: number;
};

export type AdminEventDetails = {
  id: string;
  eventSeriesId: string;
  seriesSlug: string;
  seriesTitle: string;
  kind: EventKind;
  seriesIsActive: boolean;
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
  capacity?: number | null;
  waitlistEnabled: boolean;
  sortOrder: number;
  priceOptions: AdminEventPriceOption[];
  scheduleItems: AdminEventScheduleItem[];
  contentBlocks: AdminEventContentBlock[];
  mediaItems: AdminEventMediaItem[];
};

export type UpsertAdminEventPriceOptionRequest = {
  code: string;
  title: string;
  description?: string;
  amount: number;
  currency: string;
  salesStartsAtUtc?: string | null;
  salesEndsAtUtc?: string | null;
  capacity?: number | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type UpsertAdminEventScheduleItemRequest = {
  title: string;
  kind: EventScheduleItemKind;
  startsAtUtc: string;
  endsAtUtc?: string | null;
  location?: string;
  notes?: string;
  sortOrder: number;
};

export type UpsertAdminEventContentBlockRequest = {
  blockType: EventContentBlockType;
  title?: string;
  body: string;
  isPublished: boolean;
  sortOrder: number;
};

export type UpsertAdminEventMediaItemRequest = {
  type: EventMediaType;
  url: string;
  thumbnailUrl?: string;
  title?: string;
  caption?: string;
  isPublished: boolean;
  sortOrder: number;
};

export type UpsertAdminEventRequest = {
  seriesSlug: string;
  seriesTitle: string;
  kind: EventKind;
  seriesIsActive: boolean;
  slug: string;
  title: string;
  seasonLabel?: string;
  shortDescription: string;
  fullDescription?: string;
  location?: string;
  timezone: string;
  status: EventEditionStatus;
  startsAtUtc: string;
  endsAtUtc: string;
  registrationOpensAtUtc?: string | null;
  registrationClosesAtUtc?: string | null;
  capacity?: number | null;
  waitlistEnabled: boolean;
  sortOrder: number;
  priceOptions: UpsertAdminEventPriceOptionRequest[];
  scheduleItems: UpsertAdminEventScheduleItemRequest[];
  contentBlocks: UpsertAdminEventContentBlockRequest[];
  mediaItems: UpsertAdminEventMediaItemRequest[];
};
