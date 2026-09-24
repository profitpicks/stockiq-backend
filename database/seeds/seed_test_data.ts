import { OtpService } from "../../modules/auth/otp.service.js";
import { PasswordService } from "../../modules/auth/password.service.js";
import { PlatformRoles } from "../../modules/auth/roles.js";
import { ProviderService } from "../../modules/providers/provider.service.js";
import { ServiceManagementService } from "../../modules/services/management.service.js";
import { ProviderTypes, ProviderEntityTypes } from "../../modules/providers/types.js";

export async function seedTestData(): Promise<void> {
  const otpService = new OtpService();
  const providerService = new ProviderService();
  const serviceManagementService = new ServiceManagementService(providerService);

  const testPasswordHash = await PasswordService.hashPassword("Trade@123");

  // Account 1: Investor Trader
  const investor = await otpService.findOrCreateUser("User001", "Demo Retail Investor", "INVESTOR");
  await PasswordService.setPassword(investor.id, "User001", testPasswordHash);
  await PasswordService.unlockAccount("User001");
  await PasswordService.unlockAccount(investor.id);
  await otpService.setUserRole(investor.id, PlatformRoles.INVESTOR_RETAIL);

  // Account 2: Provider Research Analyst
  const providerUser = await otpService.findOrCreateUser("Tradenexusresearch", "Tradenexus Research Admin", "PROVIDER");
  await PasswordService.setPassword(providerUser.id, "Tradenexusresearch", testPasswordHash);
  await PasswordService.unlockAccount("Tradenexusresearch");
  await PasswordService.unlockAccount(providerUser.id);
  await otpService.setUserRole(providerUser.id, PlatformRoles.RESEARCH_ANALYST);

  // Register Provider Dossier for Tradenexus Research (DEMO / TEST)
  let providerDossier = await providerService.getProviderByUserId(providerUser.id);
  if (!providerDossier) {
    providerDossier = await providerService.registerProvider({
      userId: providerUser.id,
      providerType: ProviderTypes.RESEARCH_ANALYST,
      entityType: ProviderEntityTypes.CORPORATE,
      legalName: "Tradenexus Research (Demo)",
      tradeName: "Tradenexus Research",
      sebiRegistrationNumber: "INH000000123",
      validFrom: "2024-01-01",
      registeredOfficeAddress: "Suite 404, Finance Towers, Mumbai, MH",
      isNismCertified: true,
      complianceOfficerName: "A. K. Sharma",
      complianceOfficerEmail: "compliance@tradenexus.demo",
    });
  }

  // Account 3: Super Admin
  const adminUser = await otpService.findOrCreateUser("stockiq_superadmin", "Stockiq Super Admin", "ADMIN");
  await PasswordService.setPassword(adminUser.id, "stockiq_superadmin", testPasswordHash);
  await PasswordService.unlockAccount("stockiq_superadmin");
  await PasswordService.unlockAccount(adminUser.id);
  await otpService.setUserRole(adminUser.id, PlatformRoles.SUPER_ADMIN);

  // Seed Services for Tradenexus Research
  if (providerDossier) {
    const existingServices = await serviceManagementService.getProviderServices(providerDossier.id);

    if (!existingServices.some((s) => s.serviceName === "INDEX OPTIONS")) {
      await serviceManagementService.createServiceDraft(providerDossier.id, providerUser.id, {
        serviceName: "INDEX OPTIONS",
        serviceCategory: "RESEARCH",
        shortDescription: "Index options research service for Nifty and BankNifty options.",
        detailedDescription: "Comprehensive intraday and positional index options research recommendations.",
        serviceType: "PAID_RESEARCH",
        marketSegment: "DERIVATIVES",
        pricingReference: "MONTHLY_11800",
        feeInPaise: 1180000, // ₹11,800 inclusive of tax
        billingDuration: "MONTHLY",
      });
    }

    if (!existingServices.some((s) => s.serviceName === "STOCK OPTIONS")) {
      await serviceManagementService.createServiceDraft(providerDossier.id, providerUser.id, {
        serviceName: "STOCK OPTIONS",
        serviceCategory: "RESEARCH",
        shortDescription: "Stock options research service focused on liquid F&O stocks.",
        detailedDescription: "High conviction stock options calls with explicit entry, targets, and stop-loss levels.",
        serviceType: "PAID_RESEARCH",
        marketSegment: "DERIVATIVES",
        pricingReference: "MONTHLY_11800",
        feeInPaise: 1180000, // ₹11,800 inclusive of tax
        billingDuration: "MONTHLY",
      });
    }
  }
}
