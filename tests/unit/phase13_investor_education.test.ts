/**
 * stockiq - Unit Tests: Phase 13 / Milestone 12 (Investor Knowledge & Education)
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { EducationService } from "../../modules/education/education.service.ts";
import {
  EducationContentTypes,
  EducationTopicCategories,
  EducationLevels,
} from "../../modules/education/types.js";

describe("Unit: Investor Education Service (Milestone 12 / Phase 13)", () => {
  let educationService: EducationService;

  beforeEach(() => {
    EducationService.clearMemoryState();
    educationService = new EducationService();
  });

  it("should retrieve educational content list with filters and verified non-sponsored flag", async () => {
    const result = await educationService.getContent({
      type: EducationContentTypes.VIDEO,
      limit: 10,
    });

    assert.ok(result.items.length > 0, "Should return video content");
    assert.ok(result.items.every((i) => i.contentType === EducationContentTypes.VIDEO));
    assert.ok(
      result.items.every((i) => i.isSponsored === false),
      "Editorial independence: isSponsored must strictly remain false"
    );
  });

  it("should filter educational content by topic category", async () => {
    const result = await educationService.getContent({
      category: EducationTopicCategories.RISK_MANAGEMENT,
    });

    assert.ok(result.items.length > 0, "Should return risk management articles/videos");
    assert.ok(
      result.items.every((i) => i.category === EducationTopicCategories.RISK_MANAGEMENT)
    );
  });

  it("should perform multi-term search across title, description, and body", async () => {
    const searchResult = await educationService.getContent({
      search: "stop-loss",
    });

    assert.ok(searchResult.items.length > 0, "Should find stop-loss related articles/videos");
    assert.ok(
      searchResult.items.some((i) =>
        i.title.toLowerCase().includes("stop-loss") ||
        i.description.toLowerCase().includes("stop-loss") ||
        i.contentBody.toLowerCase().includes("stop-loss")
      )
    );
  });

  it("should fetch educational item details by slug and verify statutory disclaimer", async () => {
    const item = await educationService.getContentBySlug(
      "understanding-sebi-guidelines-ra-ia"
    );

    assert.ok(item, "Should return educational article item by slug");
    assert.equal(item.slug, "understanding-sebi-guidelines-ra-ia");
    assert.equal(item.isSponsored, false);
    assert.ok(
      item.disclaimer.includes("Educational content is provided for general informational purposes"),
      "Must contain non-personalized statutory disclaimer"
    );
  });

  it("should toggle user bookmarks for educational content", async () => {
    const testUserId = "user-investor-123";
    const contentId = "e0000001-0000-0000-0000-000000000001";

    const res1 = await educationService.toggleBookmark(testUserId, contentId);
    assert.equal(res1.isBookmarked, true, "First toggle should save bookmark");

    const bookmarks = await educationService.getBookmarks(testUserId);
    assert.equal(bookmarks.length, 1);
    assert.equal(bookmarks[0].id, contentId);

    const res2 = await educationService.toggleBookmark(testUserId, contentId);
    assert.equal(res2.isBookmarked, false, "Second toggle should remove bookmark");

    const emptyBookmarks = await educationService.getBookmarks(testUserId);
    assert.equal(emptyBookmarks.length, 0);
  });

  it("should list topic categories with item counts", async () => {
    const categories = await educationService.getCategories();
    assert.ok(categories.length > 0);
    const riskCat = categories.find(
      (c) => c.category === EducationTopicCategories.RISK_MANAGEMENT
    );
    assert.ok(riskCat, "Should include Risk Management category");
    assert.ok(riskCat.itemCount > 0, "Risk Management category should have seeded items");
  });
});
