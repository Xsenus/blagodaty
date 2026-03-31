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
