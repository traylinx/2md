/**
 * Scrap Agent - Handles web content extraction
 * Full port with retry logic, caching, and smart scraping
 */

import { BaseAgent } from "./base.js";
import { ScrapDeps, ScrapResponse, ScrapResult, AgentResponse } from "../types/index.js";
import {
    getConfig,
    getScrapBackend,
    getHtml2mdBaseUrl,
    getHtml2mdTimeoutMs,
    type ScrapBackend,
} from "../config/index.js";
import { withRetry, HTTP_RETRY_OPTIONS } from "../utils/retry.js";
import { getCache, setCache, getCacheKey, CACHE_TTL } from "../utils/cache.js";
import { ScrapService } from "../services/scrap-service.js";
import { Html2mdService } from "../services/html2md-service.js";

export class ScrapAgent extends BaseAgent {
    private scrapEngineModel: string;
    private backend: ScrapBackend;
    private localScrapService: ScrapService | null = null;
    private html2mdService: Html2mdService | null = null;

    constructor(authToken: string, baseUrl?: string) {
        super(authToken, baseUrl);
        this.scrapEngineModel = getConfig().scrapEngineModel;
        this.backend = getScrapBackend();
    }

    /**
     * Dispatch a single fetch+convert to the configured backend.
     * Returns the same {success, content, format, error} shape regardless
     * of which backend ran, so callers don't have to branch.
     */
    private async runActiveScrape(deps: ScrapDeps): Promise<ScrapResult> {
        if (this.backend === "html2md") {
            this.html2mdService ??= new Html2mdService(
                this.authToken,
                getHtml2mdBaseUrl(),
                getHtml2mdTimeoutMs()
            );
            return this.html2mdService.scrapeUrl(deps.url, {
                method: "auto",
                waitMs: deps.waitTime ?? deps.waitForSelector ?? 10_000,
                downloadImages: false,
                frontMatter: false,
                screenshot: false,
            });
        }

        // backend === "local"
        this.localScrapService ??= new ScrapService();
        return this.localScrapService.scrapeUrl(deps.url, deps.selector);
    }

    /**
     * Scrape content from a URL with retry and caching
     */
    async scrape(deps: ScrapDeps): Promise<AgentResponse<ScrapResponse>> {
        const startTime = Date.now();
        const useCache = deps.useCache !== false;

        // Check cache first
        if (useCache) {
            const cacheKey = getCacheKey("scrape", {
                url: deps.url,
                selector: deps.selector ?? "body",
                formats: deps.formats ?? ["markdown"],
            });

            const cached = getCache<AgentResponse<ScrapResponse>>(cacheKey);
            if (cached) {
                console.log(`[ScrapAgent] Cache hit for: ${deps.url}`);
                return {
                    ...cached,
                    metadata: {
                        ...cached.metadata,
                        fromCache: true,
                    },
                };
            }
        }

        try {
            const result = await withRetry(
                async () => this.executeScrape(deps, startTime),
                {
                    ...HTTP_RETRY_OPTIONS,
                    maxRetries: 2,
                    onRetry: (attempt, error, delayMs) => {
                        console.log(
                            `[ScrapAgent] Retry ${attempt}/2 for ${deps.url}: ${error.message}`
                        );
                    },
                }
            );

            // Cache successful result
            if (useCache && result.success) {
                const cacheKey = getCacheKey("scrape", {
                    url: deps.url,
                    selector: deps.selector ?? "body",
                    formats: deps.formats ?? ["markdown"],
                });
                setCache(cacheKey, result, CACHE_TTL.SCRAPE);
            }

            return result;
        } catch (error) {
            const executionTime = (Date.now() - startTime) / 1000;
            const errorMessage = error instanceof Error ? error.message : String(error);

            console.error(`[ScrapAgent] All retries failed for ${deps.url}: ${errorMessage}`);

            return {
                success: false,
                error: errorMessage,
                data: {
                    error: errorMessage,
                    url: deps.url,
                },
            };
        }
    }

    /**
     * Execute a single scrape attempt
     */
    private async executeScrape(
        deps: ScrapDeps,
        startTime: number
    ): Promise<AgentResponse<ScrapResponse>> {
        console.log(`[ScrapAgent] Scraping URL: ${deps.url} via backend=${this.backend}`);

        const result = await this.runActiveScrape(deps);

        const executionTime = (Date.now() - startTime) / 1000;

        if (!result.success) {
            throw new Error(`Scraping failed: ${result.error}`);
        }

        const content = result.content;

        if (!content || content.length < 50) {
            throw new Error("Scraped content too short or empty");
        }

        const scrapResponse: ScrapResponse = {
            content,
            statusCode: 200,
            metadata: {
                url: deps.url,
                executionTime,
                format: deps.formats?.[0] ?? "markdown",
                contentLength: content.length,
                backend: this.backend,
            },
            url: deps.url,
        };

        console.log(
            `[ScrapAgent] Scrape completed in ${executionTime.toFixed(2)}s, content length: ${content.length}`
        );

        return {
            success: true,
            data: scrapResponse,
            metadata: {
                url: deps.url,
                executionTime,
                backend: this.backend,
                // For billing: html2md cache hits are not fresh conversions.
                // Local cheerio path is always free (no API call).
                billableCall: this.backend === "html2md" && result.cache !== "hit",
            },
        };
    }

    /**
     * Smart scrape - extract only content relevant to a query
     * Uses LLM to identify and extract the most relevant sections
     */
    async smartScrape(
        url: string,
        query: string,
        maxChars: number = 3000,
        opts: { waitMs?: number } = {}
    ): Promise<AgentResponse<ScrapResponse>> {
        // First, do a regular scrape (forward html2md tuning knobs)
        const scrapResult = await this.scrape({
            url,
            formats: ["markdown"],
            waitTime: opts.waitMs,
        });

        if (!scrapResult.success || !scrapResult.data?.content) {
            return scrapResult;
        }

        let content = scrapResult.data.content;
        const originalLength = content.length;

        // If content is within limits, return as-is
        if (content.length <= maxChars) {
            return {
                ...scrapResult,
                data: {
                    ...scrapResult.data,
                    metadata: {
                        ...scrapResult.data.metadata,
                        query,
                        truncated: false,
                        originalLength,
                    },
                },
            };
        }

        // Smart truncation: try to find relevant sections based on query keywords
        const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        const paragraphs = content.split(/\n\n+/);

        // Score paragraphs by relevance
        const scoredParagraphs = paragraphs.map((para) => {
            const paraLower = para.toLowerCase();
            const score = queryWords.reduce((acc, word) => {
                return acc + (paraLower.includes(word) ? 1 : 0);
            }, 0);
            return { para, score };
        });

        // Sort by relevance and take top paragraphs
        scoredParagraphs.sort((a, b) => b.score - a.score);

        let relevantContent = "";
        for (const { para } of scoredParagraphs) {
            if (relevantContent.length + para.length + 2 > maxChars) {
                break;
            }
            relevantContent += para + "\n\n";
        }

        // If we couldn't find relevant content, fall back to truncation
        if (relevantContent.length < 200) {
            const truncated = content.substring(0, maxChars);
            const lastPeriod = truncated.lastIndexOf(".");
            const lastNewline = truncated.lastIndexOf("\n");
            const cutPoint = Math.max(lastPeriod, lastNewline, maxChars * 0.8);
            content = truncated.substring(0, cutPoint) + "...";
        } else {
            content = relevantContent.trim();
        }

        return {
            ...scrapResult,
            data: {
                ...scrapResult.data,
                content,
                metadata: {
                    ...scrapResult.data.metadata,
                    query,
                    truncated: true,
                    originalLength,
                    smartExtracted: relevantContent.length >= 200,
                },
            },
        };
    }
}
