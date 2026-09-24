import { Router, Request, Response, NextFunction } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { PlatformRoles } from "../../modules/auth/roles.js";
import { invoicesService } from "../../modules/payments/invoices.service.js";
import { AppError } from "../middleware/error-handler.middleware.js";
import { ProviderService } from "../../modules/providers/provider.service.js";

const providerService = new ProviderService();

export const invoicesRouter = Router();

const getActiveRole = (roles: string[]): string => {
  const priority = ["SUPER_ADMIN", "COMPLIANCE_ADMIN", "FINANCE_ADMIN", "INVESTMENT_ADVISER", "RESEARCH_ANALYST"];
  for (const r of priority) {
    if (roles.includes(r)) return r;
  }
  return roles[0] || "INVESTOR_RETAIL";
};

invoicesRouter.get(
  "/",
  authMiddleware(true),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actorId = req.user!.id;
      const role = getActiveRole(req.user!.roles);

      let invoices;
      if (
        role === PlatformRoles.SUPER_ADMIN ||
        role === PlatformRoles.COMPLIANCE_ADMIN ||
        role === PlatformRoles.FINANCE_ADMIN
      ) {
        invoices = await invoicesService.listInvoices({});
      } else if (role === PlatformRoles.RESEARCH_ANALYST || role === PlatformRoles.INVESTMENT_ADVISER) {
        const providerProfile = await providerService.getProviderByUserId(actorId);
        const providerId = providerProfile ? providerProfile.id : "none";
        invoices = await invoicesService.listInvoices({ providerId });
      } else {
        invoices = await invoicesService.listInvoices({ userId: actorId });
      }

      const { serviceId, status, startDate, endDate, search } = req.query;
      if (serviceId) {
        invoices = invoices.filter((i) => i.serviceId === String(serviceId));
      }
      if (status) {
        invoices = invoices.filter((i) => i.status === String(status));
      }
      if (startDate) {
        const start = new Date(String(startDate));
        invoices = invoices.filter((i) => new Date(i.issuedAt) >= start);
      }
      if (endDate) {
        const end = new Date(String(endDate));
        invoices = invoices.filter((i) => new Date(i.issuedAt) <= end);
      }
      if (search) {
        const queryStr = String(search).toLowerCase();
        invoices = invoices.filter(
          (i) =>
            i.id.toLowerCase().includes(queryStr) ||
            i.invoiceNumber.toLowerCase().includes(queryStr) ||
            i.userId.toLowerCase().includes(queryStr)
        );
      }

      res.status(200).json({ status: "SUCCESS", invoices });
    } catch (err) {
      next(err);
    }
  }
);

invoicesRouter.get(
  "/:id",
  authMiddleware(true),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invoiceId = req.params.id as string;
      const actorId = req.user!.id;
      const role = getActiveRole(req.user!.roles);

      const invoice = await invoicesService.getInvoiceById(invoiceId);
      if (!invoice) {
        throw new AppError("Invoice not found", 404, "NOT_FOUND");
      }

      let isAuthorized =
        role === PlatformRoles.SUPER_ADMIN ||
        role === PlatformRoles.COMPLIANCE_ADMIN ||
        role === PlatformRoles.FINANCE_ADMIN ||
        invoice.userId === actorId;

      if (!isAuthorized && (role === PlatformRoles.RESEARCH_ANALYST || role === PlatformRoles.INVESTMENT_ADVISER)) {
        const providerProfile = await providerService.getProviderByUserId(actorId);
        if (providerProfile && invoice.providerId === providerProfile.id) {
          isAuthorized = true;
        }
      }

      if (!isAuthorized) {
        throw new AppError("Access denied to requested financial statement", 403, "FORBIDDEN");
      }

      res.status(200).json({ status: "SUCCESS", invoice });
    } catch (err) {
      next(err);
    }
  }
);
