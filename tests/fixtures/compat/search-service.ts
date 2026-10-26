/**
 * html2md Service - delegates scraping to the html2md API
 * (https://api.2md.traylinx.com).
 *
 * Why: gives us Puppeteer-rendered DOM, Mozilla Readability + Trafilatura
 * extraction, GFM-aware Turndown, and stealth headers — none of which the
 * local cheerio-based ScrapService can do.
 *
 * The user's bearer token is forwarded so usage is metered against the
 * caller's account, not the platform's.
 */

import { ScrapResult } from "../types/index.js";

export interface Html2mdOptions {
    /** auto | native | static | browser. Default: "auto" (let html2md decide). */
    method?: "auto" | "native" | "static" | "browser";
    /** ms to wait after page load when the browser path runs. Default 10000. */
    waitMs?: number;
    /** Whether html2md should download and embed images. Default false (we don't need them in the markdown body for LLM context). */
    downloadImages?: boolean;
    /** Whether to prepend YAML front matter (title/source/date). Default false. */
    frontMatter?: boolean;
    /** Capture a full-page screenshot. Default false. */
    screenshot?: boolean;
    /** Server-side cache TTL hint, seconds. */
    maxAge?: number;
    /** Force-bypass server-side cache. */
    force?: boolean;
}

interface Html2mdResponse {
    success: boolean;
    markdown?: string;
    url?: string;
    method?: string;
    cache?: string;
    tokens?: { html?: number; md?: number };
    metadata?: Record<string, unknown>;
    quality?: Record<string, unknown>;
    fallbackReason?: string | null;
    error?: string;
    code?: string;
}

export class Html2mdService {
    private readonly baseUrl: string;
    private readonly authToken: string;
    private readonly timeoutMs: number;

    constructor(authToken: string, baseUrl: string, timeoutMs = 60_000) {
        this.authToken = authToken;
        this.baseUrl = baseUrl.replace(/\/+$/, "");
        this.timeoutMs = timeoutMs;
    }

    async scrapeUrl(url: string, options: Html2mdOptions = {}): Promise<ScrapResult> {
        const body = {
            url,
            method: options.method ?? "auto",
            downloadImages: options.downloadImages ?? false,
            frontMatter: options.frontMatter ?? false,
            screenshot: options.screenshot ?? false,
            waitMs: options.waitMs ?? 10_000,
        };

        const qs = new URLSearchParams();
        if (options.maxAge !== undefined) qs.set("maxAge", String(options.maxAge));
        if (options.force) qs.set("force", "true");
        const queryString = qs.toString() ? `?${qs}` : "";
        const endpoint = `${this.baseUrl}/api/convert${queryString}`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    Authorization: `Bearer ${this.authToken}`,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            clearTimeout(timer);

            if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                return {
                    url,
                    content: "",
                    format: "markdown",
                    success: false,
                    error: `html2md ${response.status}: ${errorText.slice(0, 300)}`,
                };
            }

            const data = (await response.json()) as Html2mdResponse;

            if (!data.success || !data.markdown) {
                return {
                    url,
                    content: "",
                    format: "markdown",
                    success: false,
                    error: data.error ?? "html2md returned no markdown",
                };
            }

            return {
                url,
                content: data.markdown,
                format: "markdown",
                success: true,
                backend: data.method,
                cache: data.cache,
                tokens: data.tokens,
            };
        } catch (error) {
            clearTimeout(timer);
            const msg = error instanceof Error ? error.message : String(error);
            const isAbort = error instanceof Error && error.name === "AbortError";
            return {
                url,
                content: "",
                format: "markdown",
                success: false,
                error: isAbort
                    ? `html2md request timed out after ${this.timeoutMs}ms`
                    : msg,
            };
        }
    }
}
