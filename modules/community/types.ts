/**
 * stockiq - Community Domain Boundary Contracts
 *
 * Implements content moderation rules to prevent misleading claims, stock tipping, or unverified promises.
 */

export const CommunityContentTypes = {
  MARKET_THOUGHT: "MARKET_THOUGHT",
  QUESTION: "QUESTION",
  EDUCATIONAL: "EDUCATIONAL",
  GENERAL_DISCUSSION: "GENERAL_DISCUSSION",
} as const;

export type CommunityContentType =
  (typeof CommunityContentTypes)[keyof typeof CommunityContentTypes];

export const ContentModerationStatuses = {
  PUBLISHED: "PUBLISHED",
  PENDING_MODERATION: "PENDING_MODERATION",
  FLAGGED: "FLAGGED",
  HIDDEN: "HIDDEN",
  REMOVED: "REMOVED",
} as const;

export type ContentModerationStatus =
  (typeof ContentModerationStatuses)[keyof typeof ContentModerationStatuses];

export const ReportReasonCategories = {
  MISLEADING_CONTENT: "MISLEADING_CONTENT",
  IMPERSONATION: "IMPERSONATION",
  UNAUTHORIZED_PROFESSIONAL_CLAIM: "UNAUTHORIZED_PROFESSIONAL_CLAIM",
  GUARANTEED_RETURN_CLAIM: "GUARANTEED_RETURN_CLAIM",
  SUSPICIOUS_FRAUDULENT: "SUSPICIOUS_FRAUDULENT",
  INAPPROPRIATE_CONTENT: "INAPPROPRIATE_CONTENT",
  OTHER: "OTHER",
} as const;

export type ReportReasonCategory =
  (typeof ReportReasonCategories)[keyof typeof ReportReasonCategories];

export interface CommunityPost {
  id: string;
  authorUserId: string;
  authorRole: string;
  authorName: string;
  authorAvatarInitial: string;
  authorBadge?: string | null;
  isVerifiedProvider: boolean;
  contentType: CommunityContentType;
  title?: string | null;
  body: string;
  taggedSymbols: string[];
  mediaUrl?: string | null;
  likesCount: number;
  repliesCount: number;
  isLiked?: boolean;
  isFollowingAuthor?: boolean;
  moderationStatus: ContentModerationStatus;
  moderationReason?: string | null;
  isComplianceCleared: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityReply {
  id: string;
  postId: string;
  authorUserId: string;
  authorRole: string;
  authorName: string;
  authorAvatarInitial: string;
  authorBadge?: string | null;
  isVerifiedProvider: boolean;
  content: string;
  moderationStatus: ContentModerationStatus;
  createdAt: string;
}

export interface CommunityFollow {
  id: string;
  followerUserId: string;
  followingUserId: string;
  createdAt: string;
}

export interface CommunityReport {
  id: string;
  postId: string;
  reporterUserId: string;
  reasonCategory: ReportReasonCategory;
  description?: string | null;
  status: string;
  createdAt: string;
}

export interface CreatePostDto {
  contentType: CommunityContentType;
  title?: string;
  body: string;
  taggedSymbols?: string[];
  mediaUrl?: string;
}

export interface CreateReplyDto {
  content: string;
}

export interface ReportPostDto {
  reasonCategory: ReportReasonCategory;
  description?: string;
}
