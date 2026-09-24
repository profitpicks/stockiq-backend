/**
 * stockiq - Education Domain Boundary Contracts
 *
 * Implements an unbiased investor education repository free of commercial endorsements.
 * Educational content must never be presented as personalized investment advice.
 */

export const EducationContentTypes = {
  ARTICLE: "ARTICLE",
  VIDEO: "VIDEO",
  FAQ: "FAQ",
  WEBINAR: "WEBINAR",
  ANNOUNCEMENT: "ANNOUNCEMENT",
} as const;

export type EducationContentType =
  (typeof EducationContentTypes)[keyof typeof EducationContentTypes];

export const EducationTopicCategories = {
  MARKET_BASICS: "MARKET_BASICS",
  OPTIONS_BASICS: "OPTIONS_BASICS",
  RISK_MANAGEMENT: "RISK_MANAGEMENT",
  FUNDAMENTAL_ANALYSIS: "FUNDAMENTAL_ANALYSIS",
  TECHNICAL_ANALYSIS: "TECHNICAL_ANALYSIS",
  REGULATORY_AWARENESS: "REGULATORY_AWARENESS",
  INVESTOR_PROTECTION: "INVESTOR_PROTECTION",
  PLATFORM_HOW_TO: "PLATFORM_HOW_TO",
} as const;

export type EducationTopicCategory =
  (typeof EducationTopicCategories)[keyof typeof EducationTopicCategories];

export const EducationLevels = {
  BEGINNER: "BEGINNER",
  INTERMEDIATE: "INTERMEDIATE",
  ADVANCED: "ADVANCED",
} as const;

export type EducationLevel =
  (typeof EducationLevels)[keyof typeof EducationLevels];

export const EducationContentStatuses = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
  HIDDEN: "HIDDEN",
} as const;

export type EducationContentStatus =
  (typeof EducationContentStatuses)[keyof typeof EducationContentStatuses];

export interface EducationContentItem {
  id: string;
  contentType: EducationContentType;
  title: string;
  slug: string;
  description: string;
  contentBody: string;
  mediaUrl?: string | null;
  category: EducationTopicCategory;
  level: EducationLevel;
  status: EducationContentStatus;
  isFeatured: boolean;
  isSponsored: false; // Must strictly remain false to enforce editorial independence
  durationOrReadTime?: string | null;
  authorSource: string;
  disclaimer: string;
  eventDate?: string | null;
  eventTime?: string | null;
  speaker?: string | null;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  isBookmarked?: boolean;
}

export interface EducationalArticle {
  id: string;
  slug: string;
  title: string;
  category: "REGULATORY_LITERACY" | "RISK_MANAGEMENT" | "MARKET_BASICS" | "INVESTOR_RIGHTS";
  contentMarkdown: string;
  readingTimeMinutes: number;
  isSponsored: false; // Must strictly remain false to enforce editorial independence
  publishedAt: string;
}

export interface GetEducationContentQueryDto {
  type?: string;
  category?: string;
  level?: string;
  search?: string;
  featured?: boolean;
  currentUserId?: string;
  limit?: number;
  offset?: number;
}

export interface EducationCategorySummary {
  category: EducationTopicCategory;
  displayName: string;
  description: string;
  itemCount: number;
}
