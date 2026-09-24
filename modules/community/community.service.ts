/**
 * stockiq - Community & Investor Feed Service
 *
 * Implements:
 * 1. Community post creation with anti-tipping moderation and server-authoritative identity.
 * 2. Feed retrieval with categorization, following filter, and search.
 * 3. Comments / replies with notifications to post authors.
 * 4. Toggle reactions with server-authoritative counts.
 * 5. Follow / unfollow functionality with notification triggers.
 * 6. Content reporting integrated with moderation workflows.
 * 7. Resilient in-memory fallback for test environments without live DB.
 */

import { db } from "../../database/connection.js";
import { v4 as uuidv4 } from "uuid";
import {
  CommunityPost,
  CommunityReply,
  CommunityFollow,
  CommunityReport,
  CommunityContentType,
  CommunityContentTypes,
  ContentModerationStatuses,
  ReportReasonCategories,
  CreatePostDto,
  CreateReplyDto,
  ReportPostDto,
} from "./types.js";
import { NotificationService } from "../notifications/notifications.service.ts";
import { NotificationTypes } from "../notifications/types.js";

const notificationService = new NotificationService();

// Prohibited claims violating SEBI code of conduct / anti-tipping rules
const PROHIBITED_ANTI_TIPPING_PATTERNS = [
  /guaranteed\s+(return|profit|gain)/i,
  /100%\s+(profit|win|return|accuracy)/i,
  /risk\s*free\s+(profit|money|return)/i,
  /double\s+your\s+money/i,
  /sure\s*shot\s+(tip|call|gain)/i,
  /insider\s+(tip|leak|info)/i,
  /fixed\s+(return|profit)/i,
  /jackpot\s+(call|tip|share)/i,
];

export class CommunityService {
  // Static in-memory fallback storage
  private static memoryPosts = new Map<string, CommunityPost>();
  private static memoryReplies = new Map<string, CommunityReply[]>(); // postId -> replies
  private static memoryReactions = new Map<string, Set<string>>(); // postId -> Set<userId>
  private static memoryFollows = new Map<string, Set<string>>(); // followerId -> Set<followingId>
  private static memoryReports = new Map<string, CommunityReport[]>(); // postId -> reports

  /**
   * Helper to inspect post body against anti-tipping and guaranteed return rules
   */
  public evaluateAntiTippingModeration(text: string): {
    flagged: boolean;
    reason?: string;
  } {
    for (const pattern of PROHIBITED_ANTI_TIPPING_PATTERNS) {
      if (pattern.test(text)) {
        return {
          flagged: true,
          reason:
            "Prohibited claim detected: Guaranteed return or risk-free profit assertion violates SEBI advertising code of conduct.",
        };
      }
    }
    return { flagged: false };
  }

  /**
   * Fetch user and provider verification display details
   */
  public async getAuthorMetadata(userId: string): Promise<{
    name: string;
    avatarInitial: string;
    role: string;
    badge: string | null;
    isVerifiedProvider: boolean;
  }> {
    try {
      const pool = db.getPool();

      // Check if user is a verified provider
      const providerRes = await pool.query(
        `SELECT trade_name, legal_name, registration_type, status 
         FROM provider_profiles 
         WHERE user_id = $1 AND status = 'VERIFIED'`,
        [userId]
      );

      if (providerRes.rows.length > 0) {
        const p = providerRes.rows[0];
        const regType = p.registration_type === "RESEARCH_ANALYST"
          ? "SEBI Registered RA"
          : p.registration_type === "INVESTMENT_ADVISER"
          ? "SEBI Registered IA"
          : "Verified Provider";
        const name = p.trade_name || p.legal_name || "Verified Provider";
        return {
          name,
          avatarInitial: name.charAt(0).toUpperCase() || "P",
          role: p.registration_type || "PROVIDER",
          badge: regType,
          isVerifiedProvider: true,
        };
      }

      // Check user profile
      const userRes = await pool.query(
        `SELECT u.role, up.full_name, up.display_name, u.phone, u.email 
         FROM users u
         LEFT JOIN user_profiles up ON up.user_id = u.id
         WHERE u.id = $1`,
        [userId]
      );

      if (userRes.rows.length > 0) {
        const u = userRes.rows[0];
        const displayName = u.display_name || u.full_name || (u.email ? u.email.split("@")[0] : "Community Member");
        return {
          name: displayName,
          avatarInitial: displayName.charAt(0).toUpperCase() || "I",
          role: u.role || "INVESTOR",
          badge: null,
          isVerifiedProvider: false,
        };
      }
    } catch {
      // In-memory fallback
    }

    return {
      name: "Community Member",
      avatarInitial: "C",
      role: "INVESTOR",
      badge: null,
      isVerifiedProvider: false,
    };
  }

  /**
   * Create a new community post
   */
  public async createPost(
    userId: string,
    userRole: string,
    dto: CreatePostDto
  ): Promise<CommunityPost> {
    if (!dto.body || dto.body.trim().length === 0) {
      throw new Error("Post content cannot be empty");
    }

    // Validate content type
    const validTypes = Object.values(CommunityContentTypes);
    const contentType = validTypes.includes(dto.contentType)
      ? dto.contentType
      : CommunityContentTypes.GENERAL_DISCUSSION;

    // Check anti-tipping moderation rules
    const moderation = this.evaluateAntiTippingModeration(
      `${dto.title || ""} ${dto.body}`
    );

    const moderationStatus = moderation.flagged
      ? ContentModerationStatuses.FLAGGED
      : ContentModerationStatuses.PUBLISHED;

    const authorMeta = await this.getAuthorMetadata(userId);

    const now = new Date().toISOString();
    const post: CommunityPost = {
      id: uuidv4(),
      authorUserId: userId,
      authorRole: authorMeta.role || userRole,
      authorName: authorMeta.name,
      authorAvatarInitial: authorMeta.avatarInitial,
      authorBadge: authorMeta.badge,
      isVerifiedProvider: authorMeta.isVerifiedProvider,
      contentType,
      title: dto.title?.trim() || null,
      body: dto.body.trim(),
      taggedSymbols: dto.taggedSymbols || [],
      mediaUrl: dto.mediaUrl?.trim() || null,
      likesCount: 0,
      repliesCount: 0,
      isLiked: false,
      isFollowingAuthor: false,
      moderationStatus,
      moderationReason: moderation.reason || null,
      isComplianceCleared: !moderation.flagged,
      createdAt: now,
      updatedAt: now,
    };

    try {
      const pool = db.getPool();
      await pool.query(
        `INSERT INTO community_posts 
          (id, author_user_id, content_type, title, body, tagged_symbols, media_url, moderation_status, moderation_reason, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          post.id,
          post.authorUserId,
          post.contentType,
          post.title,
          post.body,
          post.taggedSymbols,
          post.mediaUrl,
          post.moderationStatus,
          post.moderationReason,
          post.createdAt,
          post.updatedAt,
        ]
      );
    } catch {
      // In-memory fallback
      CommunityService.memoryPosts.set(post.id, post);
    }

    return post;
  }

  /**
   * Retrieve community feed with optional filters, search, and pagination
   */
  public async getFeed(params: {
    category?: string;
    filter?: string; // 'following'
    search?: string;
    currentUserId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ posts: CommunityPost[]; total: number }> {
    const limit = params.limit || 50;
    const offset = params.offset || 0;

    try {
      const pool = db.getPool();
      let whereClauses: string[] = [
        "(p.moderation_status = 'PUBLISHED' OR p.author_user_id = $1)",
      ];
      const queryParams: any[] = [params.currentUserId || "00000000-0000-0000-0000-000000000000"];
      let paramIndex = 2;

      // Category filter
      if (params.category && params.category !== "All" && params.category !== "ALL") {
        whereClauses.push(`p.content_type = $${paramIndex}`);
        queryParams.push(params.category.toUpperCase());
        paramIndex++;
      }

      // Following filter
      if (params.filter === "following" && params.currentUserId) {
        whereClauses.push(
          `p.author_user_id IN (SELECT following_user_id FROM community_follows WHERE follower_user_id = $${paramIndex})`
        );
        queryParams.push(params.currentUserId);
        paramIndex++;
      }

      // Search filter
      if (params.search && params.search.trim().length > 0) {
        whereClauses.push(
          `(p.body ILIKE $${paramIndex} OR p.title ILIKE $${paramIndex})`
        );
        queryParams.push(`%${params.search.trim()}%`);
        paramIndex++;
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

      const countRes = await pool.query(
        `SELECT COUNT(*) as total FROM community_posts p ${whereSql}`,
        queryParams
      );
      const total = parseInt(countRes.rows[0]?.total || "0", 10);

      const querySql = `
        SELECT 
          p.id,
          p.author_user_id,
          p.content_type,
          p.title,
          p.body,
          p.tagged_symbols,
          p.media_url,
          p.moderation_status,
          p.moderation_reason,
          p.created_at,
          p.updated_at,
          COALESCE(prov.trade_name, prov.legal_name, up.display_name, up.full_name, 'Community Member') as author_name,
          COALESCE(prov.registration_type, u.role, 'INVESTOR') as author_role,
          CASE 
            WHEN prov.registration_type = 'RESEARCH_ANALYST' THEN 'SEBI Registered RA'
            WHEN prov.registration_type = 'INVESTMENT_ADVISER' THEN 'SEBI Registered IA'
            WHEN prov.status = 'VERIFIED' THEN 'Verified Provider'
            ELSE NULL 
          END as author_badge,
          (prov.status = 'VERIFIED') as is_verified_provider,
          (SELECT COUNT(*) FROM community_reactions WHERE post_id = p.id) as likes_count,
          (SELECT COUNT(*) FROM community_replies WHERE post_id = p.id) as replies_count,
          CASE 
            WHEN $1::uuid IS NOT NULL THEN EXISTS (
              SELECT 1 FROM community_reactions WHERE post_id = p.id AND user_id = $1::uuid
            )
            ELSE false 
          END as is_liked,
          CASE 
            WHEN $1::uuid IS NOT NULL THEN EXISTS (
              SELECT 1 FROM community_follows WHERE follower_user_id = $1::uuid AND following_user_id = p.author_user_id
            )
            ELSE false 
          END as is_following_author
        FROM community_posts p
        JOIN users u ON u.id = p.author_user_id
        LEFT JOIN user_profiles up ON up.user_id = u.id
        LEFT JOIN provider_profiles prov ON prov.user_id = u.id AND prov.status = 'VERIFIED'
        ${whereSql}
        ORDER BY p.is_pinned DESC, p.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      queryParams.push(limit, offset);
      const { rows } = await pool.query(querySql, queryParams);

      const posts: CommunityPost[] = rows.map((r) => ({
        id: r.id,
        authorUserId: r.author_user_id,
        authorRole: r.author_role,
        authorName: r.author_name,
        authorAvatarInitial: (r.author_name as string).charAt(0).toUpperCase() || "U",
        authorBadge: r.author_badge,
        isVerifiedProvider: !!r.is_verified_provider,
        contentType: r.content_type,
        title: r.title,
        body: r.body,
        taggedSymbols: r.tagged_symbols || [],
        mediaUrl: r.media_url,
        likesCount: parseInt(r.likes_count || "0", 10),
        repliesCount: parseInt(r.replies_count || "0", 10),
        isLiked: !!r.is_liked,
        isFollowingAuthor: !!r.is_following_author,
        moderationStatus: r.moderation_status,
        moderationReason: r.moderation_reason,
        isComplianceCleared: r.moderation_status === "PUBLISHED",
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));

      return { posts, total };
    } catch {
      // In-memory fallback
      let allPosts = Array.from(CommunityService.memoryPosts.values());

      // Filter visible
      allPosts = allPosts.filter(
        (p) =>
          p.moderationStatus === ContentModerationStatuses.PUBLISHED ||
          (params.currentUserId && p.authorUserId === params.currentUserId)
      );

      // Category filter
      if (params.category && params.category !== "All" && params.category !== "ALL") {
        allPosts = allPosts.filter(
          (p) => p.contentType.toUpperCase() === params.category!.toUpperCase()
        );
      }

      // Following filter
      if (params.filter === "following" && params.currentUserId) {
        const followingSet = CommunityService.memoryFollows.get(params.currentUserId) || new Set();
        allPosts = allPosts.filter((p) => followingSet.has(p.authorUserId));
      }

      // Search filter
      if (params.search && params.search.trim().length > 0) {
        const q = params.search.trim().toLowerCase();
        allPosts = allPosts.filter(
          (p) =>
            p.body.toLowerCase().includes(q) ||
            (p.title && p.title.toLowerCase().includes(q))
        );
      }

      // Sort newest first
      allPosts.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const total = allPosts.length;
      const sliced = allPosts.slice(offset, offset + limit).map((p) => {
        const likes = CommunityService.memoryReactions.get(p.id) || new Set();
        const replies = CommunityService.memoryReplies.get(p.id) || [];
        const following = params.currentUserId
          ? CommunityService.memoryFollows.get(params.currentUserId)?.has(p.authorUserId) || false
          : false;

        return {
          ...p,
          likesCount: likes.size,
          repliesCount: replies.length,
          isLiked: params.currentUserId ? likes.has(params.currentUserId) : false,
          isFollowingAuthor: following,
        };
      });

      return { posts: sliced, total };
    }
  }

  /**
   * Get post by ID
   */
  public async getPostById(
    postId: string,
    currentUserId?: string
  ): Promise<CommunityPost | null> {
    try {
      const pool = db.getPool();
      const { rows } = await pool.query(
        `SELECT 
          p.id,
          p.author_user_id,
          p.content_type,
          p.title,
          p.body,
          p.tagged_symbols,
          p.media_url,
          p.moderation_status,
          p.moderation_reason,
          p.created_at,
          p.updated_at,
          COALESCE(prov.trade_name, prov.legal_name, up.display_name, up.full_name, 'Community Member') as author_name,
          COALESCE(prov.registration_type, u.role, 'INVESTOR') as author_role,
          CASE 
            WHEN prov.registration_type = 'RESEARCH_ANALYST' THEN 'SEBI Registered RA'
            WHEN prov.registration_type = 'INVESTMENT_ADVISER' THEN 'SEBI Registered IA'
            WHEN prov.status = 'VERIFIED' THEN 'Verified Provider'
            ELSE NULL 
          END as author_badge,
          (prov.status = 'VERIFIED') as is_verified_provider,
          (SELECT COUNT(*) FROM community_reactions WHERE post_id = p.id) as likes_count,
          (SELECT COUNT(*) FROM community_replies WHERE post_id = p.id) as replies_count,
          CASE 
            WHEN $2::uuid IS NOT NULL THEN EXISTS (
              SELECT 1 FROM community_reactions WHERE post_id = p.id AND user_id = $2::uuid
            )
            ELSE false 
          END as is_liked,
          CASE 
            WHEN $2::uuid IS NOT NULL THEN EXISTS (
              SELECT 1 FROM community_follows WHERE follower_user_id = $2::uuid AND following_user_id = p.author_user_id
            )
            ELSE false 
          END as is_following_author
        FROM community_posts p
        JOIN users u ON u.id = p.author_user_id
        LEFT JOIN user_profiles up ON up.user_id = u.id
        LEFT JOIN provider_profiles prov ON prov.user_id = u.id AND prov.status = 'VERIFIED'
        WHERE p.id = $1`,
        [postId, currentUserId || "00000000-0000-0000-0000-000000000000"]
      );

      if (rows.length === 0) return null;
      const r = rows[0];

      return {
        id: r.id,
        authorUserId: r.author_user_id,
        authorRole: r.author_role,
        authorName: r.author_name,
        authorAvatarInitial: (r.author_name as string).charAt(0).toUpperCase() || "U",
        authorBadge: r.author_badge,
        isVerifiedProvider: !!r.is_verified_provider,
        contentType: r.content_type,
        title: r.title,
        body: r.body,
        taggedSymbols: r.tagged_symbols || [],
        mediaUrl: r.media_url,
        likesCount: parseInt(r.likes_count || "0", 10),
        repliesCount: parseInt(r.replies_count || "0", 10),
        isLiked: !!r.is_liked,
        isFollowingAuthor: !!r.is_following_author,
        moderationStatus: r.moderation_status,
        moderationReason: r.moderation_reason,
        isComplianceCleared: r.moderation_status === "PUBLISHED",
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    } catch {
      const post = CommunityService.memoryPosts.get(postId);
      if (!post) return null;

      const likes = CommunityService.memoryReactions.get(postId) || new Set();
      const replies = CommunityService.memoryReplies.get(postId) || [];
      const following = currentUserId
        ? CommunityService.memoryFollows.get(currentUserId)?.has(post.authorUserId) || false
        : false;

      return {
        ...post,
        likesCount: likes.size,
        repliesCount: replies.length,
        isLiked: currentUserId ? likes.has(currentUserId) : false,
        isFollowingAuthor: following,
      };
    }
  }

  /**
   * Create reply on a post
   */
  public async createReply(
    postId: string,
    userId: string,
    userRole: string,
    dto: CreateReplyDto
  ): Promise<CommunityReply> {
    if (!dto.content || dto.content.trim().length === 0) {
      throw new Error("Reply content cannot be empty");
    }

    const post = await this.getPostById(postId);
    if (!post) {
      throw new Error("Post not found");
    }

    const authorMeta = await this.getAuthorMetadata(userId);
    const now = new Date().toISOString();

    const reply: CommunityReply = {
      id: uuidv4(),
      postId,
      authorUserId: userId,
      authorRole: authorMeta.role || userRole,
      authorName: authorMeta.name,
      authorAvatarInitial: authorMeta.avatarInitial,
      authorBadge: authorMeta.badge,
      isVerifiedProvider: authorMeta.isVerifiedProvider,
      content: dto.content.trim(),
      moderationStatus: ContentModerationStatuses.PUBLISHED,
      createdAt: now,
    };

    try {
      const pool = db.getPool();
      await pool.query(
        `INSERT INTO community_replies (id, post_id, author_user_id, content, moderation_status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          reply.id,
          reply.postId,
          reply.authorUserId,
          reply.content,
          reply.moderationStatus,
          reply.createdAt,
        ]
      );
    } catch {
      const existing = CommunityService.memoryReplies.get(postId) || [];
      existing.push(reply);
      CommunityService.memoryReplies.set(postId, existing);
    }

    // Trigger notification if replying user is not the post author
    if (post.authorUserId !== userId) {
      try {
        await notificationService.createNotification({
          recipientId: post.authorUserId,
          notificationType: NotificationTypes.COMMUNITY_REPLY,
          title: "New Reply on Your Post",
          message: `${authorMeta.name} replied to your post: "${dto.content.slice(0, 60)}..."`,
          relatedEntityType: "COMMUNITY_POST",
          relatedEntityId: postId,
        });
      } catch (err) {
        console.error("[Community Notification Error]", err);
      }
    }

    return reply;
  }

  /**
   * Retrieve replies for a post
   */
  public async getReplies(postId: string): Promise<CommunityReply[]> {
    try {
      const pool = db.getPool();
      const { rows } = await pool.query(
        `SELECT 
          r.id,
          r.post_id,
          r.author_user_id,
          r.content,
          r.moderation_status,
          r.created_at,
          COALESCE(prov.trade_name, prov.legal_name, up.display_name, up.full_name, 'Community Member') as author_name,
          COALESCE(prov.registration_type, u.role, 'INVESTOR') as author_role,
          CASE 
            WHEN prov.registration_type = 'RESEARCH_ANALYST' THEN 'SEBI Registered RA'
            WHEN prov.registration_type = 'INVESTMENT_ADVISER' THEN 'SEBI Registered IA'
            WHEN prov.status = 'VERIFIED' THEN 'Verified Provider'
            ELSE NULL 
          END as author_badge,
          (prov.status = 'VERIFIED') as is_verified_provider
        FROM community_replies r
        JOIN users u ON u.id = r.author_user_id
        LEFT JOIN user_profiles up ON up.user_id = u.id
        LEFT JOIN provider_profiles prov ON prov.user_id = u.id AND prov.status = 'VERIFIED'
        WHERE r.post_id = $1 AND r.moderation_status = 'PUBLISHED'
        ORDER BY r.created_at ASC`,
        [postId]
      );

      return rows.map((r) => ({
        id: r.id,
        postId: r.post_id,
        authorUserId: r.author_user_id,
        authorRole: r.author_role,
        authorName: r.author_name,
        authorAvatarInitial: (r.author_name as string).charAt(0).toUpperCase() || "U",
        authorBadge: r.author_badge,
        isVerifiedProvider: !!r.is_verified_provider,
        content: r.content,
        moderationStatus: r.moderation_status,
        createdAt: r.created_at,
      }));
    } catch {
      return CommunityService.memoryReplies.get(postId) || [];
    }
  }

  /**
   * Toggle reaction (Like) on a post
   */
  public async toggleReaction(
    postId: string,
    userId: string
  ): Promise<{ isLiked: boolean; likesCount: number }> {
    const post = await this.getPostById(postId);
    if (!post) {
      throw new Error("Post not found");
    }

    try {
      const pool = db.getPool();

      // Check existing reaction
      const existing = await pool.query(
        `SELECT id FROM community_reactions WHERE post_id = $1 AND user_id = $2`,
        [postId, userId]
      );

      let isLiked = false;
      if (existing.rows.length > 0) {
        // Delete reaction
        await pool.query(
          `DELETE FROM community_reactions WHERE post_id = $1 AND user_id = $2`,
          [postId, userId]
        );
        isLiked = false;
      } else {
        // Add reaction
        await pool.query(
          `INSERT INTO community_reactions (id, post_id, user_id, reaction_type, created_at)
           VALUES ($1, $2, $3, 'LIKE', $4)`,
          [uuidv4(), postId, userId, new Date().toISOString()]
        );
        isLiked = true;

        // Notify author if liker is not author
        if (post.authorUserId !== userId) {
          const userMeta = await this.getAuthorMetadata(userId);
          await notificationService.createNotification({
            recipientId: post.authorUserId,
            notificationType: NotificationTypes.COMMUNITY_REACTION,
            title: "New Reaction",
            message: `${userMeta.name} liked your post.`,
            relatedEntityType: "COMMUNITY_POST",
            relatedEntityId: postId,
          });
        }
      }

      const countRes = await pool.query(
        `SELECT COUNT(*) as total FROM community_reactions WHERE post_id = $1`,
        [postId]
      );
      const likesCount = parseInt(countRes.rows[0]?.total || "0", 10);

      return { isLiked, likesCount };
    } catch {
      // In-memory fallback
      let userSet = CommunityService.memoryReactions.get(postId);
      if (!userSet) {
        userSet = new Set<string>();
        CommunityService.memoryReactions.set(postId, userSet);
      }

      let isLiked = false;
      if (userSet.has(userId)) {
        userSet.delete(userId);
        isLiked = false;
      } else {
        userSet.add(userId);
        isLiked = true;

        if (post.authorUserId !== userId) {
          const userMeta = await this.getAuthorMetadata(userId);
          await notificationService.createNotification({
            recipientId: post.authorUserId,
            notificationType: NotificationTypes.COMMUNITY_REACTION,
            title: "New Reaction",
            message: `${userMeta.name} liked your post.`,
            relatedEntityType: "COMMUNITY_POST",
            relatedEntityId: postId,
          });
        }
      }

      return { isLiked, likesCount: userSet.size };
    }
  }

  /**
   * Toggle follow / unfollow target user or provider
   */
  public async toggleFollow(
    followerUserId: string,
    targetUserId: string
  ): Promise<{ isFollowing: boolean }> {
    if (followerUserId === targetUserId) {
      throw new Error("Cannot follow yourself");
    }

    try {
      const pool = db.getPool();
      const existing = await pool.query(
        `SELECT id FROM community_follows WHERE follower_user_id = $1 AND following_user_id = $2`,
        [followerUserId, targetUserId]
      );

      let isFollowing = false;
      if (existing.rows.length > 0) {
        await pool.query(
          `DELETE FROM community_follows WHERE follower_user_id = $1 AND following_user_id = $2`,
          [followerUserId, targetUserId]
        );
        isFollowing = false;
      } else {
        await pool.query(
          `INSERT INTO community_follows (id, follower_user_id, following_user_id, created_at)
           VALUES ($1, $2, $3, $4)`,
          [uuidv4(), followerUserId, targetUserId, new Date().toISOString()]
        );
        isFollowing = true;

        // Notify target user
        const followerMeta = await this.getAuthorMetadata(followerUserId);
        await notificationService.createNotification({
          recipientId: targetUserId,
          notificationType: NotificationTypes.COMMUNITY_FOLLOW,
          title: "New Follower",
          message: `${followerMeta.name} is now following your market updates.`,
          relatedEntityType: "USER",
          relatedEntityId: followerUserId,
        });
      }

      return { isFollowing };
    } catch {
      let followingSet = CommunityService.memoryFollows.get(followerUserId);
      if (!followingSet) {
        followingSet = new Set<string>();
        CommunityService.memoryFollows.set(followerUserId, followingSet);
      }

      let isFollowing = false;
      if (followingSet.has(targetUserId)) {
        followingSet.delete(targetUserId);
        isFollowing = false;
      } else {
        followingSet.add(targetUserId);
        isFollowing = true;

        const followerMeta = await this.getAuthorMetadata(followerUserId);
        await notificationService.createNotification({
          recipientId: targetUserId,
          notificationType: NotificationTypes.COMMUNITY_FOLLOW,
          title: "New Follower",
          message: `${followerMeta.name} is now following your market updates.`,
          relatedEntityType: "USER",
          relatedEntityId: followerUserId,
        });
      }

      return { isFollowing };
    }
  }

  /**
   * Submit report for a post
   */
  public async reportPost(
    postId: string,
    reporterUserId: string,
    dto: ReportPostDto
  ): Promise<CommunityReport> {
    const post = await this.getPostById(postId);
    if (!post) {
      throw new Error("Post not found");
    }

    const validCategories = Object.values(ReportReasonCategories);
    const category = validCategories.includes(dto.reasonCategory)
      ? dto.reasonCategory
      : ReportReasonCategories.OTHER;

    const report: CommunityReport = {
      id: uuidv4(),
      postId,
      reporterUserId,
      reasonCategory: category,
      description: dto.description?.trim() || null,
      status: "PENDING_REVIEW",
      createdAt: new Date().toISOString(),
    };

    try {
      const pool = db.getPool();
      await pool.query(
        `INSERT INTO community_reports (id, post_id, reporter_user_id, reason_category, description, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          report.id,
          report.postId,
          report.reporterUserId,
          report.reasonCategory,
          report.description,
          report.status,
          report.createdAt,
        ]
      );
    } catch {
      const reports = CommunityService.memoryReports.get(postId) || [];
      reports.push(report);
      CommunityService.memoryReports.set(postId, reports);
    }

    return report;
  }
}
