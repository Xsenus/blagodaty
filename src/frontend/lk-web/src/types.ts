export type UserSummary = {
  id: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  city?: string | null;
  churchName?: string | null;
  phoneNumber?: string | null;
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

export type RegistrationStatus = 'Draft' | 'Submitted' | 'Confirmed' | 'Cancelled';
export type AccommodationPreference = 'Tent' | 'Cabin' | 'Either';

export type CampRegistrationSnapshot = {
  id: string;
  status: RegistrationStatus;
  updatedAtUtc: string;
  submittedAtUtc?: string | null;
};

export type CurrentAccount = {
  user: UserSummary;
  registration?: CampRegistrationSnapshot | null;
  externalIdentities: ExternalIdentity[];
  availableExternalAuthProviders: PublicExternalAuthProvider[];
  hasPassword: boolean;
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

export type CampRegistration = {
  id: string;
  status: RegistrationStatus;
  fullName: string;
  birthDate: string;
  city: string;
  churchName: string;
  phoneNumber: string;
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
  fullName: string;
  birthDate: string;
  city: string;
  churchName: string;
  phoneNumber: string;
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
  registrationStatus?: RegistrationStatus | null;
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

export type UpdateExternalAuthProviderRequest = {
  enabled: boolean;
  widgetEnabled?: boolean;
  clientId?: string;
  clientSecret?: string;
  botUsername?: string;
  botToken?: string;
  webhookSecret?: string;
};
