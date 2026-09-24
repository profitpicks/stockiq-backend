/**
 * stockiq - Investor Knowledge & Education Routes
 *
 * Implements public and investor endpoints for educational articles, videos, FAQs, and webinars.
 * Strictly separates educational market-awareness material from provider commercial recommendations.
 */

import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { EducationService } from "../../modules/education/education.service.ts";

export const educationRouter = Router();
const educationService = new EducationService();

/**
 * GET /api/v1/education/content
 * Public access supported (Guests & authenticated investors).
 * Returns list of published educational items matching optional filters.
 */
educationRouter.get("/content", authMiddleware(false), async (req: Request, res: Response) => {
  try {
    const type = req.query.type as string | undefined;
    const category = req.query.category as string | undefined;
    const level = req.query.level as string | undefined;
    const search = req.query.search as string | undefined;
    const featured = req.query.featured !== undefined ? req.query.featured === "true" : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
    const currentUserId = req.user?.id;

    const result = await educationService.getContent({
      type,
      category,
      level,
      search,
      featured,
      currentUserId,
      limit,
      offset,
    });

    res.status(200).json({
      success: true,
      data: result.items,
      total: result.total,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve educational content",
    });
  }
});

/**
 * GET /api/v1/education/featured
 * Shortcut to fetch featured educational items.
 */
educationRouter.get("/featured", authMiddleware(false), async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user?.id;
    const result = await educationService.getContent({
      featured: true,
      currentUserId,
      limit: 10,
    });

    res.status(200).json({
      success: true,
      data: result.items,
      total: result.total,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve featured educational content",
    });
  }
});

/**
 * GET /api/v1/education/categories
 * Returns all topic categories and item counts.
 */
educationRouter.get("/categories", async (_req: Request, res: Response) => {
  try {
    const categories = await educationService.getCategories();
    res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve categories",
    });
  }
});

/**
 * GET /api/v1/education/bookmarks
 * Returns saved items for authenticated user.
 */
educationRouter.get("/bookmarks", authMiddleware(true), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const items = await educationService.getBookmarks(userId);
    res.status(200).json({
      success: true,
      data: items,
      total: items.length,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve bookmarks",
    });
  }
});

/**
 * POST /api/v1/education/bookmarks/:id
 * Toggle bookmark for authenticated user.
 */
educationRouter.post("/bookmarks/:id", authMiddleware(true), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const contentId = req.params.id as string;
    const result = await educationService.toggleBookmark(userId, contentId);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Failed to toggle bookmark",
    });
  }
});

/**
 * GET /api/v1/education/content/slug/:slug
 * Retrieve content by slug.
 */
educationRouter.get("/content/slug/:slug", authMiddleware(false), async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug as string;
    const currentUserId = req.user?.id;
    const item = await educationService.getContentBySlug(slug, currentUserId);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Educational content not found",
      });
    }

    res.status(200).json({
      success: true,
      data: item,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve educational content item",
    });
  }
});

/**
 * GET /api/v1/education/content/:id
 * Retrieve content by ID.
 */
educationRouter.get("/content/:id", authMiddleware(false), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const currentUserId = req.user?.id;
    const item = await educationService.getContentById(id, currentUserId);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Educational content not found",
      });
    }

    res.status(200).json({
      success: true,
      data: item,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve educational content item",
    });
  }
});
