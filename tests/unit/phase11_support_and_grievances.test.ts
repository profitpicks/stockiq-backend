import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ComplaintsService } from "../../modules/complaints/complaints.service.ts";

describe("Unit: Backend Support & Grievance (Milestone 10)", () => {
  const complaintsService = new ComplaintsService();

  const mockUserA = "33333333-3333-3333-3333-33333333333a";
  const mockUserB = "33333333-3333-3333-3333-33333333333b";

  it("should fetch default Help Center FAQ articles successfully", async () => {
    const articles = await complaintsService.getHelpArticles();
    assert.ok(Array.isArray(articles), "Articles must be returned as an array");
    assert.ok(articles.length > 0, "Default seeded help articles must be retrieved");
    
    // Test filter by category
    const complianceArticles = await complaintsService.getHelpArticles("Compliance");
    assert.ok(complianceArticles.every(a => a.category === "Compliance"), "All filtered articles must belong to Category 'Compliance'");
  });

  it("should create and retrieve support tickets with strict IDOR isolation", async () => {
    // 1. Create ticket for User A
    const ticketA = await complaintsService.createSupportTicket(
      mockUserA,
      "TECHNICAL",
      "Unable to compose recommendations",
      "Receiving a timeout error when calling recommendation publish ledger."
    );

    assert.equal(ticketA.userId, mockUserA);
    assert.equal(ticketA.status, "OPEN");

    // 2. Retrieve A's tickets
    const ticketsA = await complaintsService.getSupportTickets(mockUserA);
    assert.ok(ticketsA.length > 0);
    assert.ok(ticketsA.some(t => t.id === ticketA.id));

    // 3. User B should not see A's ticket (Strict IDOR Isolation)
    const ticketsB = await complaintsService.getSupportTickets(mockUserB);
    assert.ok(!ticketsB.some(t => t.id === ticketA.id), "User B must not see User A's support ticket");

    // 4. Try retrieving ticket details directly for unauthorized user (B)
    const detailsUnauthorized = await complaintsService.getSupportTicketDetails(ticketA.id, mockUserB);
    assert.equal(detailsUnauthorized, null, "Direct lookup must fail for unauthorized user B");

    // 5. Direct lookup authorized (A)
    const detailsAuthorized = await complaintsService.getSupportTicketDetails(ticketA.id, mockUserA);
    assert.notEqual(detailsAuthorized, null);
    assert.equal(detailsAuthorized?.id, ticketA.id);
  });

  it("should support adding and retrieving replies for a support ticket", async () => {
    const ticket = await complaintsService.createSupportTicket(
      mockUserA,
      "BILLING",
      "Incorrect invoice CGST calculation",
      "CGST was calculated at 10% instead of 9% for Maharashtra."
    );

    // Add reply
    const reply = await complaintsService.createSupportReply(ticket.id, mockUserA, "Update: verified with local advisor, the rate should be 9%.");
    assert.equal(reply.ticketId, ticket.id);
    assert.equal(reply.senderId, mockUserA);

    // Retrieve replies authorized
    const replies = await complaintsService.getSupportReplies(ticket.id, mockUserA);
    assert.equal(replies.length, 1);
    assert.equal(replies[0].id, reply.id);

    // Try retrieving replies unauthorized
    await assert.rejects(async () => {
      await complaintsService.getSupportReplies(ticket.id, mockUserB);
    }, /Access denied/, "Unauthorized user B should be prevented from reading ticket replies");
  });

  it("should create and isolate grievances with calculated SEBI SLA timeline", async () => {
    // Create platform grievance for User A
    const complaint = await complaintsService.createComplaint(
      mockUserA,
      "SERVICE_DEFICIENCY",
      "Delay in subscription synchronization",
      "Completed subscription payment but the service channel access remains locked for over 2 hours."
    );

    assert.equal(complaint.complainantUserId, mockUserA);
    assert.equal(complaint.status, "LODGED");
    assert.ok(complaint.slaDeadline, "Grievance must have an auto-computed SLA deadline");

    // Parse the SLA deadline and verify it is set exactly 21 days from now
    const deadlineDate = new Date(complaint.slaDeadline);
    const createdDate = new Date(complaint.createdAt);
    const timeDiff = deadlineDate.getTime() - createdDate.getTime();
    const daysDiff = Math.round(timeDiff / (1000 * 3600 * 24));
    assert.equal(daysDiff, 21, "SLA deadline must be configured for exactly 21 days");

    // Direct detail check
    const details = await complaintsService.getComplaintDetails(complaint.id, mockUserA);
    assert.notEqual(details, null);
    assert.equal(details?.id, complaint.id);

    // Unauthorized access prevention
    const unauthorizedDetails = await complaintsService.getComplaintDetails(complaint.id, mockUserB);
    assert.equal(unauthorizedDetails, null, "User B must not have access to User A's grievance");
  });

  it("should ensure Help Center returns empty array when search query matches nothing", async () => {
    const emptyArticles = await complaintsService.getHelpArticles(undefined, "XYZ_NON_EXISTENT_QUERY_9999");
    assert.ok(Array.isArray(emptyArticles));
    assert.equal(emptyArticles.length, 0, "Non-existent search must produce a genuine empty state");
  });

  it("should ensure server-authoritative status and preserve ticket timeline history", async () => {
    // 1. Create a ticket
    const ticket = await complaintsService.createSupportTicket(
      mockUserA,
      "SERVICES",
      "Pricing decimal validation issue",
      "Channel subscription fee rejects custom paise amounts."
    );
    assert.equal(ticket.status, "OPEN", "Initial server status must be OPEN");

    // 2. Add multiple replies
    await complaintsService.createSupportReply(ticket.id, mockUserA, "Followup: confirmed on Android build 1.0.4.");
    await complaintsService.createSupportReply(ticket.id, "platform-support-officer", "Support acknowledged: ticket logged for compliance review.");

    // 3. Verify timeline history is preserved in order
    const replies = await complaintsService.getSupportReplies(ticket.id, mockUserA);
    assert.equal(replies.length, 2, "All history events must be preserved in chronological order");
    assert.equal(replies[0].message, "Followup: confirmed on Android build 1.0.4.");
    assert.equal(replies[1].senderId, "platform-support-officer");
  });
});
