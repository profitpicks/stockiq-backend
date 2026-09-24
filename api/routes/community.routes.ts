/**
 * stockiq - Community & Investor Feed Routes
 */

import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { CommunityService } from "../../modules/community/community.service.ts";
import {
  CreatePostDto,
  CreateReplyDto,
  ReportPostDto,
} from "../../modules/community/types.js";

export const communityRouter = Router();
const communityService = new CommunityService();

/**
 * GET /api/v1/community/feed
 * GET /api/v1/community/posts
 * Public access supported (Guests can browse).
 * If authenticated, user-specific flags (isLiked, isFollowingAuthor) are returned.
 */
communityRouter.get("/feed", authMiddleware(false), async (req: Request, res: Response) => {
  try {
    const category = req.query.category as string | undefined;
    const filter = req.query.filter as string | undefined;
    const search = req.query.search as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
    const currentUserId = req.user?.id;

    const result = await communityService.getFeed({
      category,
      filter,
      search,
      currentUserId,
      limit,
      offset,
    });

    res.status(200).json({
      success: true,
      data: result.posts,
      total: result.total,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve community feed",
    });
  }
});

communityRouter.get("/posts", authMiddleware(false), async (req: Request, res: Response) => {
  try {
    const category = req.query.category as string | undefined;
    const filter = req.query.filter as string | undefined;
    const search = req.query.search as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
    const currentUserId = req.user?.id;

    const result = await communityService.getFeed({
      category,
      filter,
      search,
      currentUserId,
      limit,
      offset,
    });

    res.status(200).json({
      success: true,
      data: result.posts,
      total: result.total,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve community feed",
    });
  }
});

/**
 * POST /api/v1/community/posts
 * Requires authentication. Strictly derives author identity from server session.
 */
communityRouter.post("/posts", authMiddleware(true), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.roles?.[0] || "INVESTOR";
    const dto: CreatePostDto = req.body;

    if (!dto.body || dto.body.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Post content is required",
      });
    }

    const post = await communityService.createPost(userId, userRole, dto);
    res.status(201).json({
      success: true,
      data: post,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || "Failed to create community post",
    });
  }
});

/**
 * GET /api/v1/community/posts/:id
 */
communityRouter.get("/posts/:id", authMiddleware(false), async (req: Request, res: Response) => {
  try {
    const postId = req.params.id as string;
    const currentUserId = req.user?.id;
    const post = await communityService.getPostById(postId, currentUserId);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Community post not found",
      });
    }

    res.status(200).json({
      success: true,
      data: post,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve community post",
    });
  }
});

/**
 * GET /api/v1/community/posts/:id/replies
 */
communityRouter.get("/posts/:id/replies", authMiddleware(false), async (req: Request, res: Response) => {
  try {
    const postId = req.params.id as string;
    const replies = await communityService.getReplies(postId);

    res.status(200).json({
      success: true,
      data: replies,
      total: replies.length,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve replies",
    });
  }
});

/**
 * POST /api/v1/community/posts/:id/replies
 * Requires authentication. Strictly derives reply author identity from server session.
 */
communityRouter.post("/posts/:id/replies", authMiddleware(true), async (req: Request, res: Response) => {
  try {
    const postId = req.params.id as string;
    const userId = req.user!.id;
    const userRole = req.user!.roles?.[0] || "INVESTOR";
    const dto: CreateReplyDto = req.body;

    if (!dto.content || dto.content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Reply content cannot be empty",
      });
    }

    const reply = await communityService.createReply(postId, userId, userRole, dto);
    res.status(201).json({
      success: true,
      data: reply,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || "Failed to add reply",
    });
  }
});

/**
 * POST /api/v1/community/posts/:id/reactions
 * Requires authentication. Toggles reaction/like.
 */
communityRouter.post("/posts/:id/reactions", authMiddleware(true), async (req: Request, res: Response) => {
  try {
    const postId = req.params.id as string;
    const userId = req.user!.id;

    const result = await communityService.toggleReaction(postId, userId);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || "Failed to update reaction",
    });
  }
});

/**
 * POST /api/v1/community/follow
 * Requires authentication. Toggles follow/unfollow for target user or provider.
 */
communityRouter.post("/follow", authMiddleware(true), async (req: Request, res: Response) => {
  try {
    const followerUserId = req.user!.id;
    const targetUserId = req.body.targetUserId;

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: "targetUserId is required",
      });
    }

    const result = await communityService.toggleFollow(followerUserId, targetUserId);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || "Failed to toggle follow status",
    });
  }
});

/**
 * POST /api/v1/community/posts/:id/report
 * Requires authentication. Submits content moderation report.
 */
communityRouter.post("/posts/:id/report", authMiddleware(true), async (req: Request, res: Response) => {
  try {
    const postId = req.params.id as string;
    const reporterUserId = req.user!.id;
    const dto: ReportPostDto = req.body;

    if (!dto.reasonCategory) {
      return res.status(400).json({
        success: false,
        message: "Reason category is required",
      });
    }

    const report = await communityService.reportPost(postId, reporterUserId, dto);
    res.status(201).json({
      success: true,
      data: report,
      message: "Post reported for content moderation review",
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || "Failed to submit post report",
    });
  }
});
