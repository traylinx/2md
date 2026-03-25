Website Sitemap Generator | html2md

# The Web is Messy. Your Data Shouldn't Be.

Stop wrestling with messy HTML, tracking scripts, and pop-ups. We intelligently extract the core content from any URL and deliver perfectly formatted Markdown—ready for your AI agents, apps, or personal notes.

80% Token Reduction5x More Content Per Context Window0 External Dependencies

[document\_scannerConvert Page](/)[travel\_exploreCrawl Site](/crawl)[account\_treeSitemap](/map)[smart\_toyAgentify](/agentify)

Discover and visualize the **complete site structure** as a tree — no content conversion.

boltDiscover

iDepth012345iMax Pages10203050

---

## API Reference: Sitemap Discovery

Quickly map the structure of any website. Returns a visual tree and a flat list of all discovered URLs — no content conversion, minimal resource usage. You can cancel the process at any time, and export the resulting sitemap in `.txt`, `.md`, or `.json` formats.

### Parameters

| Parameter     | Type     | Default | Description                                                                  |
| ------------- | -------- | ------- | ---------------------------------------------------------------------------- |
| `url`required | `string` | `—`     | The root URL to start mapping from.                                          |
| `depth`       | `number` | `3`     | How many levels deep to follow links. 0 = single page only.                  |
| `maxPages`    | `number` | `50`    | Maximum number of pages to discover. Prevents runaway crawls on large sites. |

### Example: Map a Documentation Site

POST/api/crawl

Use treeOnly: true for fast discovery. Returns the site structure without converting any content.

#\_ Request (cURL){ } Response

BASHcontent\_copyCopy

```
curl -X POST https://2md.traylinx.com/api/crawl \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://docs.traylinx.com",
    "depth": 2,
    "maxPages": 50,
    "treeOnly": true
  }'
```

### 🚀 Get Your Free SwitchAI API Key

SwitchAI is Traylinx's unified LLM router — one key, access to GPT, Claude, Llama, Mistral, and more. Sign up in 30 seconds and start generating intelligent Skill Bundles immediately.

[Create Free Account →](https://traylinx.com/switchai)

Pay-as-you-go pricing · No monthly minimums · Your key, your data

## Frequently Asked Questions

Common questions about site mapping and URL discovery.

How does the Sitemap endpoint differ from the Crawl endpoint?+

Sitemap (Map) is purely a discovery tool — it returns a list of all URLs found starting from your root URL without converting any page content. Use it to preview the scope of a site before running a full Crawl. Crawl performs content extraction on each discovered page.

Does it use a sitemap.xml file or crawl the pages?+

Both. The engine first checks for a `sitemap.xml` (and sitemap index files) at the domain root. It also checks for `llms.txt` (an AI-first discovery file) and uses any URLs listed there as seed inputs. If neither is found, it falls back to link-following from the provided URL. This makes it fast for well-structured documentation sites.

Can I filter which URLs get included in the map?+

The crawler automatically filters out non-HTML assets (images, PDFs, stylesheets, scripts). It also respects domain boundaries — it will only follow links within the same domain as the starting URL, preventing accidental external link traversal.

What can I do with the URL list output?+

The URL list is perfect for feeding into a batch pipeline — you can select specific pages from the list and convert them individually via the Crawl endpoint. It is also useful for LLM training data preparation, SEO audits, and documentation indexing workflows.

How deep does the mapping go?+

Mapping depth is controlled by the depth parameter (default 3, max 10) and capped by maxPages (default 50). For most documentation sites, depth=3 and maxPages=100 is sufficient to discover the entire structure.

## Engineered for AI Data Pipelines

Raw HTML wastes tokens and confuses LLMs. HTML2MD automatically cleans, structures, and optimizes web content, delivering pristine Markdown that maximizes your context window and reduces AI hallucinations.

STEP 1

### Smart Method Selection

The `auto` method intelligently tries the fastest extraction path first: HTTP content negotiation (`native`), then lightweight static parsing (`static`), and only falls back to full headless Chromium (`browser`) when needed.

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
