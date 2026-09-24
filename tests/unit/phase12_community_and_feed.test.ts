/**
 * stockiq - Phase 12 Unit Tests: Investor Feed & Community (Milestone 11)
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CommunityService } from "../../modules/community/community.service.ts";
import {
  CommunityContentTypes,
  ContentModerationStatuses,
  ReportReasonCategories,
} from "../../modules/community/types.js";

describe("Unit: Backend Investor Feed & Community (Milestone 11)", () => {
  const service = new CommunityService();

  const mockInvestorId = "11111111-2222-3333-4444-555555555555";
  const mockProviderId = "22222222-3333-4444-5555-666666666666";
  const mockReaderId = "33333333-4444-5555-6666-777777777777";

  test("should create community post with server-derived author identity and publish if compliant", async () => {
    const post = await service.createPost(mockInvestorId, "INVESTOR", {
      contentType: CommunityContentTypes.MARKET_THOUGHT,
      title: "Nifty consolidation near 24,500",
      body: "Observing healthy sector rotation in IT and Banking. Waiting for breakout confirmation with volume.",
      taggedSymbols: ["NIFTY50", "BANKNIFTY"],
    });

    assert.ok(post.id);
    assert.equal(post.authorUserId, mockInvestorId);
    assert.equal(post.contentType, CommunityContentTypes.MARKET_THOUGHT);
    assert.equal(post.moderationStatus, ContentModerationStatuses.PUBLISHED);
    assert.equal(post.isComplianceCleared, true);
    assert.equal(post.likesCount, 0);
    assert.equal(post.repliesCount, 0);
  });

  test("should automatically flag posts violating anti-tipping / guaranteed return rules", async () => {
    const flaggedPost = await service.createPost(mockInvestorId, "INVESTOR", {
      contentType: CommunityContentTypes.MARKET_THOUGHT,
      title: "Sure Shot Jackpot Call",
      body: "Buy this stock now for 100% guaranteed profit by Friday! Sure shot tip, double your money!",
    });

    assert.equal(flaggedPost.moderationStatus, ContentModerationStatuses.FLAGGED);
    assert.equal(flaggedPost.isComplianceCleared, false);
    assert.ok(flaggedPost.moderationReason);
    assert.match(flaggedPost.moderationReason!, /Guaranteed return/i);
  });

  test("should retrieve feed filtered by category and search term", async () => {
    // Create educational post
    await service.createPost(mockInvestorId, "INVESTOR", {
      contentType: CommunityContentTypes.EDUCATIONAL,
      title: "Understanding Stop-Loss Discipline",
      body: "Position sizing is vital to protecting capital. Always calculate risk per trade before entering.",
    });

    // Create question post
    await service.createPost(mockInvestorId, "INVESTOR", {
      contentType: CommunityContentTypes.QUESTION,
      title: "Query regarding trailing stops",
      body: "How do you calculate ATR-based trailing stop losses for swing trades?",
    });

    // Filter by EDUCATIONAL
    const eduFeed = await service.getFeed({
      category: CommunityContentTypes.EDUCATIONAL,
    });
    assert.ok(eduFeed.posts.length >= 1);
    assert.ok(eduFeed.posts.every((p) => p.contentType === CommunityContentTypes.EDUCATIONAL));

    // Search query
    const searchFeed = await service.getFeed({
      search: "trailing stop",
    });
    assert.ok(searchFeed.posts.length >= 1);
    assert.ok(searchFeed.posts.some((p) => p.body.includes("ATR-based trailing stop")));
  });

  test("should support post replies with server-derived author and activity tracking", async () => {
    const post = await service.createPost(mockInvestorId, "INVESTOR", {
      contentType: CommunityContentTypes.GENERAL_DISCUSSION,
      body: "What are your thoughts on current midcap valuations?",
    });

    const reply = await service.createReply(post.id, mockReaderId, "INVESTOR", {
      content: "Valuations look elevated in select capital goods counters. Prudent to be stock-specific.",
    });

    assert.ok(reply.id);
    assert.equal(reply.postId, post.id);
    assert.equal(reply.authorUserId, mockReaderId);

    const replies = await service.getReplies(post.id);
    assert.ok(replies.length >= 1);
    assert.equal(replies[0]?.id, reply.id);
  });

  test("should toggle reactions without duplicate reaction counts", async () => {
    const post = await service.createPost(mockInvestorId, "INVESTOR", {
      contentType: CommunityContentTypes.MARKET_THOUGHT,
      body: "Sharing intraday support levels for Bank Nifty.",
    });

    // First like
    const like1 = await service.toggleReaction(post.id, mockReaderId);
    assert.equal(like1.isLiked, true);
    assert.equal(like1.likesCount, 1);

    // Unlike
    const unlike = await service.toggleReaction(post.id, mockReaderId);
    assert.equal(unlike.isLiked, false);
    assert.equal(unlike.likesCount, 0);

    // Like again
    const like2 = await service.toggleReaction(post.id, mockReaderId);
    assert.equal(like2.isLiked, true);
    assert.equal(like2.likesCount, 1);
  });

  test("should toggle follow/unfollow and filter feed by followed authors", async () => {
    // mockReader follows mockProvider
    const follow1 = await service.toggleFollow(mockReaderId, mockProviderId);
    assert.equal(follow1.isFollowing, true);

    // Create post by provider
    const provPost = await service.createPost(mockProviderId, "RESEARCH_ANALYST", {
      contentType: CommunityContentTypes.EDUCATIONAL,
      title: "Technical Analysis 101",
      body: "Understanding divergence between RSI and price action.",
    });

    // Fetch feed with filter='following' as mockReader
    const followingFeed = await service.getFeed({
      filter: "following",
      currentUserId: mockReaderId,
    });

    assert.ok(followingFeed.posts.some((p) => p.id === provPost.id));

    // Unfollow
    const unfollow = await service.toggleFollow(mockReaderId, mockProviderId);
    assert.equal(unfollow.isFollowing, false);
  });

  test("should submit content reports for inappropriate or misleading claims", async () => {
    const post = await service.createPost(mockInvestorId, "INVESTOR", {
      contentType: CommunityContentTypes.MARKET_THOUGHT,
      body: "Some suspicious claims made here.",
    });

    const report = await service.reportPost(post.id, mockReaderId, {
      reasonCategory: ReportReasonCategories.MISLEADING_CONTENT,
      description: "Post makes speculative unsubstantiated claims.",
    });

    assert.ok(report.id);
    assert.equal(report.postId, post.id);
    assert.equal(report.reporterUserId, mockReaderId);
    assert.equal(report.reasonCategory, ReportReasonCategories.MISLEADING_CONTENT);
    assert.equal(report.status, "PENDING_REVIEW");
  });
});
