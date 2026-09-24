/**
 * stockiq - Non-Automated Helper Parser
 *
 * Extracts structured parameters from raw signal text.
 * Strictly labels output as draft and requires explicit provider confirmation before publication.
 */

import {
  RecommendationAction,
  RecommendationActions,
  ParsedRecommendationDraft,
} from "./types.ts";

export class RecommendationParser {
  /**
   * Parses raw text into structured draft fields.
   * DOES NOT publish or confirm recommendations.
   */
  public parseRawText(rawText: string): ParsedRecommendationDraft {
    const textUpper = rawText.toUpperCase().trim();

    // Determine Direction
    let direction: RecommendationAction = RecommendationActions.BUY;
    if (textUpper.includes("SELL") || textUpper.includes("SHORT")) {
      direction = RecommendationActions.SELL;
    } else if (textUpper.includes("ACCUMULATE")) {
      direction = RecommendationActions.ACCUMULATE;
    } else if (textUpper.includes("REDUCE")) {
      direction = RecommendationActions.REDUCE;
    } else if (textUpper.includes("HOLD")) {
      direction = RecommendationActions.HOLD;
    }

    // Determine Instrument & Segment
    let instrumentType = "EQUITY";
    let segment = "CASH";

    if (textUpper.includes("FUTURES") || textUpper.includes("FUT")) {
      instrumentType = "DERIVATIVE_FUTURES";
      segment = "FUTURES";
    } else if (
      textUpper.includes("OPTIONS") ||
      textUpper.includes(" CE ") ||
      textUpper.includes(" PE ") ||
      textUpper.includes("CALL") ||
      textUpper.includes("PUT")
    ) {
      instrumentType = "DERIVATIVE_OPTIONS";
      segment = "OPTIONS";
    }

    // Extract Symbol
    let symbol = "UNKNOWN";
    const symbolMatch = rawText.match(/([A-Z0-9&-]{3,15})\s+(BUY|SELL|ABV|CMP|FUT|CE|PE)/i);
    if (symbolMatch) {
      symbol = symbolMatch[1].toUpperCase();
    } else {
      const words = rawText.split(/\s+/);
      if (words.length > 0 && words[0].length >= 2) {
        symbol = words[0].replace(/[^A-Z0-9&-]/gi, "").toUpperCase();
      }
    }

    // Extract Prices
    const prices: number[] = [];
    const numberMatches = rawText.match(/\d+(\.\d+)?/g);
    if (numberMatches) {
      for (const m of numberMatches) {
        const num = parseFloat(m);
        if (!isNaN(num) && num > 0) {
          prices.push(num);
        }
      }
    }

    // Parse Entry Price
    let entryPrice = 0;
    const cmpMatch = rawText.match(/(?:CMP|ABV|ABOVE|AT|ENTRY|BUY|SELL)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    if (cmpMatch) {
      entryPrice = parseFloat(cmpMatch[1]);
    } else if (prices.length > 0) {
      entryPrice = prices[0];
    }

    // Parse Targets
    const targets: { targetPrice: number; label?: string }[] = [];
    const tgtMatch = rawText.match(/(?:TGT|TARGET|TARGETS)\s*[:=]?\s*([\d\s.,\/]+)/i);
    if (tgtMatch) {
      const tgtNumbers = tgtMatch[1].match(/\d+(\.\d+)?/g);
      if (tgtNumbers) {
        tgtNumbers.forEach((t, index) => {
          const val = parseFloat(t);
          if (!isNaN(val) && val > 0) {
            targets.push({ targetPrice: val, label: `T${index + 1}` });
          }
        });
      }
    } else if (prices.length >= 2) {
      for (let i = 1; i < Math.min(prices.length, 4); i++) {
        targets.push({ targetPrice: prices[i], label: `T${i}` });
      }
    }

    // Parse Stop Loss
    let stopLossPrice = 0;
    const slMatch = rawText.match(/(?:SL|STOPLOSS|STOP\s*LOSS)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    if (slMatch) {
      stopLossPrice = parseFloat(slMatch[1]);
    } else if (prices.length >= 3 && targets.length > 0) {
      const lastPrice = prices[prices.length - 1];
      if (lastPrice !== entryPrice && !targets.some((t) => t.targetPrice === lastPrice)) {
        stopLossPrice = lastPrice;
      }
    }

    return {
      isDraft: true,
      requiresProviderConfirmation: true,
      originalMessage: rawText,
      symbol,
      direction,
      instrumentType,
      segment,
      entryPrice,
      targets,
      stopLossPrice,
      parsedFields: {
        rawText,
        extractedSymbol: symbol,
        extractedDirection: direction,
        extractedEntryPrice: entryPrice,
        extractedTargetsCount: targets.length,
        extractedStopLossPrice: stopLossPrice,
      },
    };
  }
}
