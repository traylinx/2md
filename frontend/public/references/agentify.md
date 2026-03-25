Agentify Website for AI | html2md

# The Web is Messy. Your Data Shouldn't Be.

Stop wrestling with messy HTML, tracking scripts, and pop-ups. We intelligently extract the core content from any URL and deliver perfectly formatted Markdown—ready for your AI agents, apps, or personal notes.

80% Token Reduction5x More Content Per Context Window0 External Dependencies

[document\_scannerConvert Page](/)[travel\_exploreCrawl Site](/crawl)[account\_treeSitemap](/map)[smart\_toyAgentify](/agentify)

We crawl your website, extract every page into clean Markdown, then use AI to generate an **agent-ready Skill Bundle** — so tools like Cursor, Windsurf, and Claude know your docs without hallucinating.

iSwitchAI API Key (BYOK) — Required

saveSave Key

Currently, Agentify is exclusively powered by **[Traylinx SwitchAI](https://traylinx.com/switchai)**. After extracting your pages, we call the LLM router to classify and index the content into a `SKILL.md` routing file. Your key is stored securely in the browser and never touches our logs.

boltDiscover Pages

iMax Pages10203050

---

## What Is a Skill Bundle?

AI coding assistants like Cursor, Windsurf, Claude Code, and GitHub Copilot can load external knowledge from structured Markdown folders called **Skills**. A Skill is a curated folder that replaces massive monolithic context blobs with modular, token-efficient reference files.

**The Architecture:** A generated bundle contains three core parts:
1\. `SKILL.md`: The routing index. Maps agent tasks to specific reference files.
2\. `llms.txt`: The public discovery file for web crawlers.
3\. `references/*.md`: Individual Markdown files for each page, keeping token usage minimal.

### Pipeline Phases

-   **Terrain Mapping:** Headless Chromium discovers all pages.
-   **Deep Extraction:** Pages are cleaned of ads/navigation and converted to pure Markdown.
-   **AI Synthesis (optional):** An LLM reads page summaries and builds an intelligent routing index.
-   **Bundle & Edit:** Review the VFS in-browser, edit files, and export to `.zip`.

## Why Use AI? — Free vs. AI-Powered

Agentify works perfectly fine **without** an API key — you get all your pages extracted as clean Markdown. But when you add a **SwitchAI API key**, the output transforms from a flat file dump into an **intelligent, agent-ready knowledge base** that your IDE agent can consume instantly.

| Feature                                | Free (No Key) | With SwitchAI Key |
| -------------------------------------- | ------------- | ----------------- |
| Site crawling & page discovery         | ✓             | ✓                 |
| Clean Markdown extraction              | ✓             | ✓                 |
| Individual `references/*.md` files     | ✓             | ✓                 |
| In-browser editing & ZIP export        | ✓             | ✓                 |
| AI-generated `SKILL.md` routing index  | —             | ✓                 |
| AI-generated `llms.txt` discovery file | —             | ✓                 |
| Intelligent topic classification       | —             | ✓                 |
| Task-to-file mapping for AI agents     | —             | ✓                 |

**In short:** Without AI you get raw ingredients. With AI, you get a fully assembled, production-ready Skill that your IDE agent can consume instantly — no manual curation needed.

## API Reference: /api/agentify

You can trigger the Agentify pipeline programmatically. The `apiKey` parameter is **optional** — if omitted, extraction still runs but the AI synthesis step (SKILL.md & llms.txt generation) is skipped.

**Response Modes:** Use `format=json` for a clean JSON response (default for API tools), or `format=stream` for live NDJSON log events with `__JSON__` result (Web UI default).

**Async Workflows:** Pass `"async": true` to immediately get a `202 Accepted` response with a `job_id`. Optionally pass `"webhook_url"` to receive an HTTP POST callback when the job finishes.

### Parameters

| Parameter          | Type       | Default | Description                                                                         |
| ------------------ | ---------- | ------- | ----------------------------------------------------------------------------------- |
| `url`required      | `string`   | `—`     | The root URL of the website to Agentify.                                            |
| `maxPages`         | `number`   | `50`    | Maximum number of pages to discover and extract.                                    |
| `apiKey`           | `string`   | `—`     | Optional SwitchAI API Key. If provided, enables AI-generated SKILL.md and llms.txt. |
| `targetAgent`      | `string`   | `web`   | Target agent context: `web` or `local`.                                             |
| `includeApiSchema` | `boolean`  | `false` | Generate API schemas in the bundle.                                                 |
| `urls`             | `string[]` | `[]`    | Optional predefined URL list (skip discovery).                                      |
| `format`           | `string`   | `json`  | Response format: `json` or `stream`.                                                |
| `async`            | `boolean`  | `false` | Return 202 immediately, process in background.                                      |
| `webhook_url`      | `string`   | `—`     | URL to receive POST callback on completion.                                         |

### Example Usage

POST/api/agentify

A successful response includes the complete 'files' object. Without an API key, SKILL.md and llms.txt will contain placeholder templates instead of AI-generated content.

#\_ Request (cURL){ } Response

BASHcontent\_copyCopy

```
curl -X POST https://2md.traylinx.com/api/agentify \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com/docs",
    "maxPages": 20,
    "apiKey": "sk-lf-your-switchai-key"
  }'
```

### 🚀 Get Your Free SwitchAI API Key

SwitchAI is Traylinx's unified LLM router — one key, access to GPT, Claude, Llama, Mistral, and more. Sign up in 30 seconds and start generating intelligent Skill Bundles immediately.

[Create Free Account →](https://traylinx.com/switchai)

Pay-as-you-go pricing · No monthly minimums · Your key, your data

## Frequently Asked Questions

Common questions about Agentify, Skill Bundles, and SwitchAI integration.

Can I use Agentify without a SwitchAI API key?+

Yes! Without a key, Agentify still crawls your entire site and extracts all pages as clean Markdown reference files. The only difference is that SKILL.md and llms.txt will be blank templates instead of AI-generated intelligent routing indexes. You can fill these in manually.

What exactly is a SKILL.md file?+

SKILL.md is a structured Markdown manifest that tells an AI coding assistant (like Cursor or Windsurf) which reference file to load for which type of question. For example: "If the user asks about authentication, read references/auth.md." It replaces the need to dump your entire documentation into the context window.

How do I use the generated Skill Bundle in Cursor or Windsurf?+

Download the ZIP, extract it into your project (e.g., .skills/your-docs/), and reference the SKILL.md in your IDE's agent configuration. In Cursor, add it to .cursorrules. In Windsurf, add it to your context settings. The AI will then automatically fetch the relevant reference file for each task.

Why Traylinx SwitchAI and not OpenAI directly?+

SwitchAI is a unified LLM router — your single key gives access to GPT-4, Claude, Llama, Mistral, and more. This means your Skill Bundles are model-agnostic. One bundle works for every agent, on every IDE, regardless of which underlying model powers it.

Can I edit the generated files before downloading?+

Absolutely. The 3-panel Agent Console lets you click on any file in the bundle and edit it directly in the browser before downloading the ZIP. This is useful for adding custom routing rules to SKILL.md or adjusting summaries in llms.txt.

How large of a site can I Agentify?+

The maxPages limit (default 20, max 50 via UI) prevents runaway jobs. For larger documentation sites (100+ pages), use the API directly and increase maxPages. The pipeline is designed to handle enterprise documentation sites efficiently, grouping crawl jobs by domain to maximize caching.

## Engineered for AI Data Pipelines

Raw HTML wastes tokens and confuses LLMs. HTML2MD automatically cleans, structures, and optimizes web content, delivering pristine Markdown that maximizes your context window and reduces AI hallucinations.

STEP 1

### Smart Fetch & Render

Intelligently decides between blazing-fast raw HTTP requests and full headless Chromium rendering via Puppeteer to extract content—even from React, Vue, or SPAs.

STEP 2

### Readability Extraction

Leverages Mozilla's Readability.js algorithm to instantly strip away navigation menus, footers, popups, and ads, isolating only the core article text and images.

STEP 3

### Turndown Polish

Converts the isolated content into perfectly clean, Git-compatible Markdown using Turndown, optimizing links, transforming tables, and pruning unnecessary tags.

## REST API Reference

For programmatic access, HTML2MD exposes a clean REST API. Check the **Convert** and **Crawl** tabs for real-world usage examples and endpoint specifics.

GET/api/health

Check the health of the rendering engine.

#\_ Request (cURL){ } Response

BASHcontent\_copyCopy

```
curl ${host}/api/health
```

## Built For

Developers, AI agents, and teams building the next generation of intelligent applications.

smart\_toy

#### AI agents that browse and summarize the web

menu\_book

#### RAG pipelines that need clean document chunks

psychology

#### Training data preparation for LLMs

inventory\_2

#### Deep-site documentation crawling & archival
