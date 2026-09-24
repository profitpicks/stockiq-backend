/**
 * stockiq - Investor Knowledge & Education Service
 *
 * Implements:
 * 1. Unbiased educational resource management and delivery.
 * 2. Strict editorial independence: isSponsored = false enforced across all items.
 * 3. Separation from commercial provider recommendations and financial advice.
 * 4. Filtering by content type (Videos, Guides/Articles, FAQs, Webinars).
 * 5. Multi-dimensional search across title, description, and keywords.
 * 6. Categorization by topics (Market Basics, Options Basics, Risk Management, etc.) and difficulty levels.
 * 7. Resilient in-memory fallback for test and non-database environments.
 */

import { db } from "../../database/connection.js";
import { v4 as uuidv4 } from "uuid";
import {
  EducationContentItem,
  EducationContentTypes,
  EducationTopicCategories,
  EducationLevels,
  EducationContentStatuses,
  GetEducationContentQueryDto,
  EducationCategorySummary,
} from "./types.js";

const DEFAULT_DISCLAIMER =
  "Educational content is provided for general informational purposes and should not be treated as personalized investment advice.";

// Initial platform seed content for in-memory and standalone test execution
const PLATFORM_SEED_ITEMS: EducationContentItem[] = [
  {
    id: "e0000001-0000-0000-0000-000000000001",
    contentType: EducationContentTypes.VIDEO,
    title: "Understanding SEBI Guidelines for RAs & IAs",
    slug: "understanding-sebi-guidelines-ra-ia",
    description: "A comprehensive overview of what SEBI registration means, regulatory disclosures, and investor rights.",
    contentBody: "This educational masterclass breaks down the legal and operational differences between SEBI-registered Research Analysts (RAs) and Investment Advisers (IAs). Learn about mandatory disclosures, code of conduct compliance, qualification standards, and why unregistered social media tipsters carry significant financial and legal risk.",
    mediaUrl: "https://stockiq.internal/education/videos/sebi-guidelines",
    category: EducationTopicCategories.REGULATORY_AWARENESS,
    level: EducationLevels.BEGINNER,
    status: EducationContentStatuses.PUBLISHED,
    isFeatured: true,
    isSponsored: false,
    durationOrReadTime: "14 mins",
    authorSource: "StockIQ Regulatory & Education Team",
    disclaimer: DEFAULT_DISCLAIMER,
    publishedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
  {
    id: "e0000001-0000-0000-0000-000000000002",
    contentType: EducationContentTypes.VIDEO,
    title: "Risk Management in Options Trading & Capital Protection",
    slug: "risk-management-in-options-trading",
    description: "Learn how stop-losses, position sizing, and capital protection safeguard your portfolio against market volatility.",
    contentBody: "Derivative products such as equity index options involve non-linear risk and time decay. This video explores practical risk management frameworks including defining maximum risk per trade (typically 1-2% of total capital), using hard stop-losses, and avoiding leveraged overnight naked positions.",
    mediaUrl: "https://stockiq.internal/education/videos/risk-management-options",
    category: EducationTopicCategories.RISK_MANAGEMENT,
    level: EducationLevels.INTERMEDIATE,
    status: EducationContentStatuses.PUBLISHED,
    isFeatured: false,
    isSponsored: false,
    durationOrReadTime: "18 mins",
    authorSource: "StockIQ Regulatory & Education Team",
    disclaimer: DEFAULT_DISCLAIMER,
    publishedAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 4).toISOString(),
  },
  {
    id: "e0000001-0000-0000-0000-000000000003",
    contentType: EducationContentTypes.VIDEO,
    title: "Fundamental Analysis Essentials for Long-Term Investors",
    slug: "fundamental-analysis-essentials",
    description: "Learn how to read balance sheets, evaluate cash flows, and interpret return on capital ratios.",
    contentBody: "This guide walks through the essential components of company valuation: understanding revenue vs EBITDA, debt-to-equity leverage thresholds, working capital cycles, and identifying sustainable competitive moats.",
    mediaUrl: "https://stockiq.internal/education/videos/fundamental-analysis",
    category: EducationTopicCategories.FUNDAMENTAL_ANALYSIS,
    level: EducationLevels.BEGINNER,
    status: EducationContentStatuses.PUBLISHED,
    isFeatured: false,
    isSponsored: false,
    durationOrReadTime: "12 mins",
    authorSource: "StockIQ Research Education Team",
    disclaimer: DEFAULT_DISCLAIMER,
    publishedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: "e0000001-0000-0000-0000-000000000004",
    contentType: EducationContentTypes.ARTICLE,
    title: "Investor Suitability & Risk Profiling Guide",
    slug: "investor-suitability-risk-profiling-guide",
    description: "Why suitability matters and how Stockiq ensures recommendations align with your financial risk capacity.",
    contentBody: "Suitability assessment is the cornerstone of responsible investing. Financial capacity encompasses your investment horizon, liquid emergency reserves, dependency ratio, and tolerance for interim drawdowns. On Stockiq, suitability profiling ensures that investors are never onboarded into high-risk derivative research plans if their profile indicates conservative capital preservation.",
    mediaUrl: null,
    category: EducationTopicCategories.INVESTOR_PROTECTION,
    level: EducationLevels.BEGINNER,
    status: EducationContentStatuses.PUBLISHED,
    isFeatured: false,
    isSponsored: false,
    durationOrReadTime: "6 min read",
    authorSource: "StockIQ Investor Protection Desk",
    disclaimer: DEFAULT_DISCLAIMER,
    publishedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: "e0000001-0000-0000-0000-000000000005",
    contentType: EducationContentTypes.ARTICLE,
    title: "Understanding the Differences Between SEBI Registered RA and IA",
    slug: "differences-between-sebi-ra-and-ia",
    description: "A clear breakdown of Research Analysts vs Investment Advisers under Indian securities regulations.",
    contentBody: "Under the SEBI (Research Analysts) Regulations, 2014, an RA prepares and publishes research reports or recommendations regarding securities to clients or the public, without managing client funds or executing trades. In contrast, under SEBI (Investment Advisers) Regulations, 2013, an IA provides personal investment advice tailored to individual risk profiles and financial goals, acting as a direct fiduciary. Both are prohibited from guaranteeing returns.",
    mediaUrl: null,
    category: EducationTopicCategories.REGULATORY_AWARENESS,
    level: EducationLevels.BEGINNER,
    status: EducationContentStatuses.PUBLISHED,
    isFeatured: false,
    isSponsored: false,
    durationOrReadTime: "8 min read",
    authorSource: "StockIQ Legal & Regulatory Desk",
    disclaimer: DEFAULT_DISCLAIMER,
    publishedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "e0000001-0000-0000-0000-000000000006",
    contentType: EducationContentTypes.ARTICLE,
    title: "Fixed Stop-Loss Discipline & Position Sizing Rules",
    slug: "fixed-stop-loss-discipline-position-sizing",
    description: "Safeguarding capital through rigorous position sizing and mechanical exit discipline.",
    contentBody: "No trading strategy has a 100% win rate. Professional risk management is governed by the 1% risk rule: calculating trade quantity such that the maximum loss from entry to stop-loss does not exceed 1% of total portfolio value. This guide covers position sizing formulas, slippage buffers, and why emotional averaging down is a common pitfall.",
    mediaUrl: null,
    category: EducationTopicCategories.RISK_MANAGEMENT,
    level: EducationLevels.INTERMEDIATE,
    status: EducationContentStatuses.PUBLISHED,
    isFeatured: false,
    isSponsored: false,
    durationOrReadTime: "5 min read",
    authorSource: "StockIQ Risk Desk",
    disclaimer: DEFAULT_DISCLAIMER,
    publishedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "e0000001-0000-0000-0000-000000000007",
    contentType: EducationContentTypes.FAQ,
    title: "How are track records verified on Stockiq?",
    slug: "faq-how-track-records-are-verified",
    description: "Detailed breakdown of the TR-STD-V1 methodology, immutable ledger records, and verification framework.",
    contentBody: "Stockiq uses the TR-STD-V1 standardized verification methodology. When a registered provider publishes a recommendation, an immutable cryptographic SHA-256 hash snapshot is timestamped on the ledger. Signal lifecycle events (Entry, Target 1, Target 2, Stop-Loss, Expiry) are verified against official exchange tick feeds. Neither providers nor administrators can alter or erase past recommendation outcomes.",
    mediaUrl: null,
    category: EducationTopicCategories.PLATFORM_HOW_TO,
    level: EducationLevels.BEGINNER,
    status: EducationContentStatuses.PUBLISHED,
    isFeatured: false,
    isSponsored: false,
    durationOrReadTime: "4 min read",
    authorSource: "StockIQ Ledger Team",
    disclaimer: DEFAULT_DISCLAIMER,
    publishedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
  {
    id: "e0000001-0000-0000-0000-000000000008",
    contentType: EducationContentTypes.FAQ,
    title: "What recourse does an investor have under SCORES and SMART ODR?",
    slug: "faq-scores-and-smart-odr-recourse",
    description: "How SEBI Complaints Redress System and Online Dispute Resolution protect market participants.",
    contentBody: "If an investor has an unresolved grievance with a SEBI-registered intermediary, they can lodge a complaint directly on SEBI SCORES (scores.sebi.gov.in) within prescribed timelines. Furthermore, the SMART ODR portal (smartodr.in) provides conciliation and arbitration mechanisms to resolve disputes online in an impartial, regulated environment.",
    mediaUrl: null,
    category: EducationTopicCategories.INVESTOR_PROTECTION,
    level: EducationLevels.BEGINNER,
    status: EducationContentStatuses.PUBLISHED,
    isFeatured: false,
    isSponsored: false,
    durationOrReadTime: "5 min read",
    authorSource: "StockIQ Compliance Desk",
    disclaimer: DEFAULT_DISCLAIMER,
    publishedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
  {
    id: "e0000001-0000-0000-0000-000000000009",
    contentType: EducationContentTypes.FAQ,
    title: "Are past performance statistics indicative of future returns?",
    slug: "faq-past-performance-disclaimer",
    description: "Why historical track records reflect past compliance audits and cannot predict future market returns.",
    contentBody: "Securities markets are subject to macroeconomic fluctuations, liquidity shifts, and systemic risks. Under SEBI regulations and Stockiq platform policies, past performance records published on the immutable ledger are factual historical audits only. They do not constitute a promise, guarantee, or projection of future profits.",
    mediaUrl: null,
    category: EducationTopicCategories.RISK_MANAGEMENT,
    level: EducationLevels.BEGINNER,
    status: EducationContentStatuses.PUBLISHED,
    isFeatured: false,
    isSponsored: false,
    durationOrReadTime: "3 min read",
    authorSource: "StockIQ Risk Desk",
    disclaimer: DEFAULT_DISCLAIMER,
    publishedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
  {
    id: "e0000001-0000-0000-0000-000000000010",
    contentType: EducationContentTypes.WEBINAR,
    title: "Options Risk Controls & Fixed Stop-Loss Discipline",
    slug: "webinar-options-risk-controls",
    description: "Join our upcoming interactive educational session on managing volatility and setting disciplined stop losses.",
    contentBody: "In this live interactive investor education session, industry compliance experts and market educators discuss practical risk controls in options trading. Topics include position sizing formulas, recognizing theta decay, and setting strict exit parameters.",
    mediaUrl: "https://stockiq.internal/education/webinars/options-risk-controls",
    category: EducationTopicCategories.RISK_MANAGEMENT,
    level: EducationLevels.INTERMEDIATE,
    status: EducationContentStatuses.PUBLISHED,
    isFeatured: false,
    isSponsored: false,
    durationOrReadTime: "45 mins",
    authorSource: "StockIQ Education Desk",
    disclaimer: DEFAULT_DISCLAIMER,
    eventDate: "Thursday, 24 Oct",
    eventTime: "06:00 PM IST",
    speaker: "Compliance & Education Panel",
    publishedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
  {
    id: "e0000001-0000-0000-0000-000000000011",
    contentType: EducationContentTypes.WEBINAR,
    title: "Reading Financial Ledgers & Standardized Methodology",
    slug: "webinar-financial-ledgers-methodology",
    description: "Learn how to audit verified track records and inspect recommendation lifecycle logs.",
    contentBody: "This educational webinar explains how to interpret standardized performance indicators, win/loss ratios, average holding periods, and maximum drawdowns. Understand how cryptographic verification protects investors from survivorship bias.",
    mediaUrl: "https://stockiq.internal/education/webinars/financial-ledgers",
    category: EducationTopicCategories.PLATFORM_HOW_TO,
    level: EducationLevels.BEGINNER,
    status: EducationContentStatuses.PUBLISHED,
    isFeatured: false,
    isSponsored: false,
    durationOrReadTime: "40 mins",
    authorSource: "StockIQ Education Desk",
    disclaimer: DEFAULT_DISCLAIMER,
    eventDate: "Saturday, 26 Oct",
    eventTime: "11:00 AM IST",
    speaker: "Regulatory Research Team",
    publishedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
];

export class EducationService {
  private static memoryItems: Map<string, EducationContentItem> = new Map(
    PLATFORM_SEED_ITEMS.map((item) => [item.id, { ...item }])
  );
  private static memoryBookmarks: Map<string, Set<string>> = new Map(); // userId -> Set<contentId>

  public static clearMemoryState(): void {
    this.memoryItems = new Map(PLATFORM_SEED_ITEMS.map((item) => [item.id, { ...item }]));
    this.memoryBookmarks.clear();
  }

  /**
   * Normalize DB row into EducationContentItem
   */
  private mapRowToItem(row: any, isBookmarked: boolean = false): EducationContentItem {
    return {
      id: row.id,
      contentType: row.content_type,
      title: row.title,
      slug: row.slug,
      description: row.description || "",
      contentBody: row.content_body || "",
      mediaUrl: row.media_url || null,
      category: row.category,
      level: row.level,
      status: row.status,
      isFeatured: Boolean(row.is_featured),
      isSponsored: false, // Strictly enforced
      durationOrReadTime: row.duration_or_read_time || null,
      authorSource: row.author_source || "StockIQ Regulatory & Education Team",
      disclaimer: row.disclaimer || DEFAULT_DISCLAIMER,
      eventDate: row.event_date || null,
      eventTime: row.event_time || null,
      speaker: row.speaker || null,
      publishedAt: row.published_at ? new Date(row.published_at).toISOString() : new Date().toISOString(),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      isBookmarked,
    };
  }

  /**
   * Retrieve educational content with optional filters, search, and pagination.
   * Only returns PUBLISHED content for public investors.
   */
  public async getContent(query: GetEducationContentQueryDto): Promise<{
    items: EducationContentItem[];
    total: number;
  }> {
    const limit = query.limit ? Math.min(Math.max(query.limit, 1), 100) : 50;
    const offset = query.offset ? Math.max(query.offset, 0) : 0;

    try {
      const pool = db.getPool();
      const conditions: string[] = ["status = 'PUBLISHED'"];
      const params: any[] = [];
      let pIdx = 1;

      if (query.type) {
        conditions.push(`content_type = $${pIdx++}`);
        params.push(query.type.toUpperCase());
      }

      if (query.category) {
        conditions.push(`category = $${pIdx++}`);
        params.push(query.category.toUpperCase());
      }

      if (query.level) {
        conditions.push(`level = $${pIdx++}`);
        params.push(query.level.toUpperCase());
      }

      if (query.featured !== undefined) {
        conditions.push(`is_featured = $${pIdx++}`);
        params.push(Boolean(query.featured));
      }

      if (query.search && query.search.trim().length > 0) {
        const term = `%${query.search.trim()}%`;
        conditions.push(`(title ILIKE $${pIdx} OR description ILIKE $${pIdx} OR content_body ILIKE $${pIdx})`);
        params.push(term);
        pIdx++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const countRes = await pool.query(
        `SELECT COUNT(*) as count FROM education_content ${whereClause}`,
        params
      );
      const total = parseInt(countRes.rows[0]?.count || "0", 10);

      const itemsRes = await pool.query(
        `SELECT * FROM education_content 
         ${whereClause} 
         ORDER BY is_featured DESC, published_at DESC 
         LIMIT $${pIdx++} OFFSET $${pIdx++}`,
        [...params, limit, offset]
      );

      let bookmarkedIds = new Set<string>();
      if (query.currentUserId) {
        const bmRes = await pool.query(
          `SELECT content_id FROM education_bookmarks WHERE user_id = $1`,
          [query.currentUserId]
        );
        bookmarkedIds = new Set(bmRes.rows.map((r) => r.content_id));
      }

      const items = itemsRes.rows.map((row) =>
        this.mapRowToItem(row, bookmarkedIds.has(row.id))
      );

      return { items, total };
    } catch {
      // In-memory fallback
      let filtered = Array.from(EducationService.memoryItems.values()).filter(
        (i) => i.status === EducationContentStatuses.PUBLISHED
      );

      if (query.type) {
        const normalizedType = query.type.toUpperCase();
        filtered = filtered.filter((i) => i.contentType.toUpperCase() === normalizedType);
      }

      if (query.category) {
        const normalizedCat = query.category.toUpperCase();
        filtered = filtered.filter((i) => i.category.toUpperCase() === normalizedCat);
      }

      if (query.level) {
        const normalizedLevel = query.level.toUpperCase();
        filtered = filtered.filter((i) => i.level.toUpperCase() === normalizedLevel);
      }

      if (query.featured !== undefined) {
        filtered = filtered.filter((i) => i.isFeatured === query.featured);
      }

      if (query.search && query.search.trim().length > 0) {
        const s = query.search.toLowerCase().trim();
        filtered = filtered.filter(
          (i) =>
            i.title.toLowerCase().includes(s) ||
            i.description.toLowerCase().includes(s) ||
            i.contentBody.toLowerCase().includes(s)
        );
      }

      filtered.sort((a, b) => {
        if (a.isFeatured !== b.isFeatured) {
          return a.isFeatured ? -1 : 1;
        }
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      });

      const userBookmarks = query.currentUserId
        ? EducationService.memoryBookmarks.get(query.currentUserId) || new Set()
        : new Set();

      const total = filtered.length;
      const paginated = filtered.slice(offset, offset + limit).map((i) => ({
        ...i,
        isBookmarked: userBookmarks.has(i.id),
      }));

      return { items: paginated, total };
    }
  }

  /**
   * Get single educational content item by ID
   */
  public async getContentById(id: string, currentUserId?: string): Promise<EducationContentItem | null> {
    try {
      const pool = db.getPool();
      const res = await pool.query(
        `SELECT * FROM education_content WHERE id = $1 AND status = 'PUBLISHED'`,
        [id]
      );
      if (res.rows.length === 0) return null;

      let isBookmarked = false;
      if (currentUserId) {
        const bmRes = await pool.query(
          `SELECT 1 FROM education_bookmarks WHERE user_id = $1 AND content_id = $2`,
          [currentUserId, id]
        );
        isBookmarked = bmRes.rows.length > 0;
      }

      return this.mapRowToItem(res.rows[0], isBookmarked);
    } catch {
      const item = EducationService.memoryItems.get(id);
      if (!item || item.status !== EducationContentStatuses.PUBLISHED) return null;
      const userBookmarks = currentUserId
        ? EducationService.memoryBookmarks.get(currentUserId) || new Set()
        : new Set();
      return { ...item, isBookmarked: userBookmarks.has(item.id) };
    }
  }

  /**
   * Get single educational content item by Slug
   */
  public async getContentBySlug(slug: string, currentUserId?: string): Promise<EducationContentItem | null> {
    try {
      const pool = db.getPool();
      const res = await pool.query(
        `SELECT * FROM education_content WHERE slug = $1 AND status = 'PUBLISHED'`,
        [slug]
      );
      if (res.rows.length === 0) return null;

      const itemRow = res.rows[0];
      let isBookmarked = false;
      if (currentUserId) {
        const bmRes = await pool.query(
          `SELECT 1 FROM education_bookmarks WHERE user_id = $1 AND content_id = $2`,
          [currentUserId, itemRow.id]
        );
        isBookmarked = bmRes.rows.length > 0;
      }

      return this.mapRowToItem(itemRow, isBookmarked);
    } catch {
      const item = Array.from(EducationService.memoryItems.values()).find(
        (i) => i.slug === slug && i.status === EducationContentStatuses.PUBLISHED
      );
      if (!item) return null;
      const userBookmarks = currentUserId
        ? EducationService.memoryBookmarks.get(currentUserId) || new Set()
        : new Set();
      return { ...item, isBookmarked: userBookmarks.has(item.id) };
    }
  }

  /**
   * Get list of topics and categories with metadata and item counts
   */
  public async getCategories(): Promise<EducationCategorySummary[]> {
    const defaultMeta: Record<string, { name: string; desc: string }> = {
      MARKET_BASICS: {
        name: "Market Basics",
        desc: "Core concepts of stock exchanges, market mechanics, and trading hours.",
      },
      OPTIONS_BASICS: {
        name: "Options Basics",
        desc: "Calls, puts, strike prices, greeks, and options volatility principles.",
      },
      RISK_MANAGEMENT: {
        name: "Risk Management",
        desc: "Position sizing, stop-loss discipline, and drawdown containment.",
      },
      FUNDAMENTAL_ANALYSIS: {
        name: "Fundamental Analysis",
        desc: "Financial statements, balance sheets, ratios, and valuation models.",
      },
      TECHNICAL_ANALYSIS: {
        name: "Technical Analysis",
        desc: "Support, resistance, price action, trend indicators, and chart patterns.",
      },
      REGULATORY_AWARENESS: {
        name: "Regulatory Awareness",
        desc: "SEBI compliance frameworks, RA vs IA roles, and mandatory disclosures.",
      },
      INVESTOR_PROTECTION: {
        name: "Investor Protection",
        desc: "Suitability, risk profiles, anti-fraud vigilance, and SCORES/ODR redressal.",
      },
      PLATFORM_HOW_TO: {
        name: "Platform How-To",
        desc: "Standardized track record methodology, cryptographic ledger, and audit tools.",
      },
    };

    try {
      const pool = db.getPool();
      const res = await pool.query(
        `SELECT category, COUNT(*) as count 
         FROM education_content 
         WHERE status = 'PUBLISHED' 
         GROUP BY category 
         ORDER BY count DESC`
      );

      const countMap = new Map<string, number>();
      for (const row of res.rows) {
        countMap.set(row.category, parseInt(row.count, 10));
      }

      return Object.entries(EducationTopicCategories).map(([key, value]) => {
        const meta = defaultMeta[key] || { name: key, desc: "" };
        return {
          category: value,
          displayName: meta.name,
          description: meta.desc,
          itemCount: countMap.get(value) || 0,
        };
      });
    } catch {
      const countMap = new Map<string, number>();
      for (const item of EducationService.memoryItems.values()) {
        if (item.status === EducationContentStatuses.PUBLISHED) {
          countMap.set(item.category, (countMap.get(item.category) || 0) + 1);
        }
      }

      return Object.entries(EducationTopicCategories).map(([key, value]) => {
        const meta = defaultMeta[key] || { name: key, desc: "" };
        return {
          category: value,
          displayName: meta.name,
          description: meta.desc,
          itemCount: countMap.get(value) || 0,
        };
      });
    }
  }

  /**
   * Toggle bookmark for an authenticated user
   */
  public async toggleBookmark(
    userId: string,
    contentId: string
  ): Promise<{ isBookmarked: boolean }> {
    try {
      const pool = db.getPool();
      const existing = await pool.query(
        `SELECT id FROM education_bookmarks WHERE user_id = $1 AND content_id = $2`,
        [userId, contentId]
      );

      if (existing.rows.length > 0) {
        await pool.query(
          `DELETE FROM education_bookmarks WHERE user_id = $1 AND content_id = $2`,
          [userId, contentId]
        );
        return { isBookmarked: false };
      } else {
        await pool.query(
          `INSERT INTO education_bookmarks (id, user_id, content_id) VALUES ($1, $2, $3)`,
          [uuidv4(), userId, contentId]
        );
        return { isBookmarked: true };
      }
    } catch {
      let userSet = EducationService.memoryBookmarks.get(userId);
      if (!userSet) {
        userSet = new Set<string>();
        EducationService.memoryBookmarks.set(userId, userSet);
      }

      if (userSet.has(contentId)) {
        userSet.delete(contentId);
        return { isBookmarked: false };
      } else {
        userSet.add(contentId);
        return { isBookmarked: true };
      }
    }
  }

  /**
   * Get user's saved/bookmarked educational content
   */
  public async getBookmarks(userId: string): Promise<EducationContentItem[]> {
    try {
      const pool = db.getPool();
      const res = await pool.query(
        `SELECT ec.* FROM education_content ec
         INNER JOIN education_bookmarks eb ON eb.content_id = ec.id
         WHERE eb.user_id = $1 AND ec.status = 'PUBLISHED'
         ORDER BY eb.created_at DESC`,
        [userId]
      );

      return res.rows.map((row) => this.mapRowToItem(row, true));
    } catch {
      const userSet = EducationService.memoryBookmarks.get(userId) || new Set<string>();
      const items: EducationContentItem[] = [];
      for (const id of userSet) {
        const item = EducationService.memoryItems.get(id);
        if (item && item.status === EducationContentStatuses.PUBLISHED) {
          items.push({ ...item, isBookmarked: true });
        }
      }
      return items;
    }
  }
}
