import { Router, Request, Response, NextFunction } from "express";
import { ComplaintsService } from "../../modules/complaints/complaints.service.ts";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { AppError } from "../middleware/error-handler.middleware.js";
import { z } from "zod";

export const complaintsRouter = Router();
const complaintsService = new ComplaintsService();

// ==========================================================================
// 1. HELP CENTER
// ==========================================================================

/**
 * GET /api/v1/complaints/help
 * Returns all active published help articles, with optional search and category filters.
 */
complaintsRouter.get("/help", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const category = req.query.category as string | undefined;
    const search = req.query.search as string | undefined;

    const articles = await complaintsService.getHelpArticles(category, search);

    res.status(200).json({
      success: true,
      articles,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});


// ==========================================================================
// 2. SUPPORT TICKETS
// ==========================================================================

const CreateSupportTicketSchema = z.object({
  category: z.string().min(1, "Category is required"),
  subject: z.string().min(3, "Subject must be at least 3 characters"),
  description: z.string().min(10, "Description must be at least 10 characters")
});

/**
 * POST /api/v1/complaints/tickets
 * Submits a new technical support ticket.
 */
complaintsRouter.post("/tickets", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = CreateSupportTicketSchema.parse(req.body);
    const userId = req.user!.id;

    const ticket = await complaintsService.createSupportTicket(
      userId,
      data.category,
      data.subject,
      data.description
    );

    res.status(201).json({
      success: true,
      ticket,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/complaints/tickets
 * Lists support tickets belonging to the authenticated user.
 */
complaintsRouter.get("/tickets", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const tickets = await complaintsService.getSupportTickets(userId);

    res.status(200).json({
      success: true,
      tickets,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/complaints/tickets/:id
 * Retrieves details for a specific support ticket. (IDOR Protected)
 */
complaintsRouter.get("/tickets/:id", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = req.params.id as string;
    const userId = req.user!.id;

    const ticket = await complaintsService.getSupportTicketDetails(ticketId, userId);
    if (!ticket) {
      throw new AppError("Support ticket not found or access denied", 404, "NOT_FOUND");
    }

    res.status(200).json({
      success: true,
      ticket,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/complaints/tickets/:id/replies
 * Retrieves support ticket replies/timeline. (IDOR Protected)
 */
complaintsRouter.get("/tickets/:id/replies", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = req.params.id as string;
    const userId = req.user!.id;

    const replies = await complaintsService.getSupportReplies(ticketId, userId);

    res.status(200).json({
      success: true,
      replies,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

const CreateSupportReplySchema = z.object({
  message: z.string().min(1, "Message cannot be empty")
});

/**
 * POST /api/v1/complaints/tickets/:id/replies
 * Submits a response reply to an existing support ticket.
 */
complaintsRouter.post("/tickets/:id/replies", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = req.params.id as string;
    const userId = req.user!.id;
    const data = CreateSupportReplySchema.parse(req.body);

    // Verify authorized access to ticket first to prevent IDOR
    const ticket = await complaintsService.getSupportTicketDetails(ticketId, userId);
    if (!ticket) {
      throw new AppError("Support ticket not found or access denied", 404, "NOT_FOUND");
    }

    const reply = await complaintsService.createSupportReply(ticketId, userId, data.message);

    res.status(201).json({
      success: true,
      reply,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});


// ==========================================================================
// 3. GRIEVANCES / COMPLAINTS
// ==========================================================================

const CreateGrievanceSchema = z.object({
  category: z.string().min(1, "Category is required"),
  subject: z.string().min(3, "Subject must be at least 3 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  respondentProviderId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional()
});

/**
 * POST /api/v1/complaints/grievances
 * Submits a new regulatory or platform operations grievance/complaint.
 */
complaintsRouter.post("/grievances", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = CreateGrievanceSchema.parse(req.body);
    const userId = req.user!.id;

    const complaint = await complaintsService.createComplaint(
      userId,
      data.category,
      data.subject,
      data.description,
      data.respondentProviderId,
      data.serviceId
    );

    res.status(201).json({
      success: true,
      complaint,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/complaints/grievances
 * Lists grievances belonging to the authenticated user (either as complainant or respondent).
 */
complaintsRouter.get("/grievances", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const complaints = await complaintsService.getComplaints(userId);

    res.status(200).json({
      success: true,
      complaints,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/complaints/grievances/:id
 * Retrieves details for a specific grievance complaint. (IDOR Protected)
 */
complaintsRouter.get("/grievances/:id", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const complaintId = req.params.id as string;
    const userId = req.user!.id;

    const complaint = await complaintsService.getComplaintDetails(complaintId, userId);
    if (!complaint) {
      throw new AppError("Grievance complaint not found or access denied", 404, "NOT_FOUND");
    }

    res.status(200).json({
      success: true,
      complaint,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/complaints/grievances/:id/replies
 * Retrieves grievance timeline/replies. (IDOR Protected)
 */
complaintsRouter.get("/grievances/:id/replies", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const complaintId = req.params.id as string;
    const userId = req.user!.id;

    const replies = await complaintsService.getComplaintReplies(complaintId, userId);

    res.status(200).json({
      success: true,
      replies,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

const CreateGrievanceReplySchema = z.object({
  message: z.string().min(1, "Message cannot be empty")
});

/**
 * POST /api/v1/complaints/grievances/:id/replies
 * Adds a new comment or timeline reply to the grievance tracker.
 */
complaintsRouter.post("/grievances/:id/replies", authMiddleware(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const complaintId = req.params.id as string;
    const userId = req.user!.id;
    const data = CreateGrievanceReplySchema.parse(req.body);

    // Verify authorized access to grievance first to prevent IDOR
    const complaint = await complaintsService.getComplaintDetails(complaintId, userId);
    if (!complaint) {
      throw new AppError("Grievance complaint not found or access denied", 404, "NOT_FOUND");
    }

    const reply = await complaintsService.createComplaintReply(complaintId, userId, data.message);

    res.status(201).json({
      success: true,
      reply,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});
