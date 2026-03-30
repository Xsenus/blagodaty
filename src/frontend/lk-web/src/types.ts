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
};

export type AdminOverview = {
  stats: AdminStats;
  roles: AdminRoleDefinition[];
  users: AdminUser[];
};
