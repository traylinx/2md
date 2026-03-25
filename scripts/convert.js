#!/usr/bin/env node

/**
 * convert.js — Step 3: Convert extracted HTML to Markdown
 *
 * Uses Turndown.js with the GFM plugin for high-fidelity HTML → Markdown
 * conversion including tables, strikethrough, and task lists.
 *
 * Usage: node scripts/convert.js <job_dir>
 *
 * Reads:  <job_dir>/processing/extracted.html
 * Writes: <job_dir>/output/page.md
 */

const TurndownService = require("turndown");
const turndownPluginGfm = require("turndown-plugin-gfm");
const fs = require("fs");
const path = require("path");
const { sanitizeHtml } = require("../lib/sanitize");

const jobDir = process.argv[2];

if (!jobDir) {
  console.error("Usage: node scripts/convert.js <job_dir>");
  process.exit(1);
}

const extractedMdFile = path.join(jobDir, "processing", "extracted.md");
const inputFile = path.join(jobDir, "processing", "extracted.html");
const outputDir = path.join(jobDir, "output");
fs.mkdirSync(outputDir, { recursive: true });

// Check if Trafilatura outputted markdown directly
if (fs.existsSync(extractedMdFile)) {
  const mdContent = fs.readFileSync(extractedMdFile, "utf8");
  fs.writeFileSync(path.join(outputDir, "page.md"), mdContent, "utf8");
  
  const result = {
    success: true,
    inputSize: mdContent.length,
    outputSize: mdContent.length,
    reduction: "0.0",
    note: "passthrough markdown"
  };
  console.log(JSON.stringify(result));
  process.exit(0);
}

if (!fs.existsSync(inputFile)) {
  console.error(`Input file not found: ${inputFile}`);
  process.exit(1);
}

const html = fs.readFileSync(inputFile, "utf8");

// Read source URL and metadata from job.json
let sourceUrl = "";
let metadata = {};
const jobJsonPath = path.join(jobDir, "job.json");
if (fs.existsSync(jobJsonPath)) {
  try {
    const jobData = JSON.parse(fs.readFileSync(jobJsonPath, "utf8"));
    sourceUrl = jobData.url || "";
    metadata = jobData.metadata || {};
  } catch (_e) {
    // ignore
  }
}

// Initialize Turndown with GFM support
const turndownService = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  fence: "```",
  emDelimiter: "*",
  strongDelimiter: "**",
  linkStyle: "inlined",
  linkReferenceStyle: "full",
});

// Enable GFM plugin (tables, strikethrough, task lists)
turndownService.use(turndownPluginGfm.gfm);

// Remove noisy tags that shouldn't end up in Markdown
turndownService.remove(["script", "noscript", "style", "iframe", "svg", "nav", "footer"]);

// Custom rule: detect code language from class attributes
turndownService.addRule("fencedCodeBlockWithLanguage", {
  filter: function (node) {
    return (
      node.nodeName === "PRE" &&
      node.firstChild &&
      node.firstChild.nodeName === "CODE"
    );
  },
  replacement: function (_content, node) {
    const codeNode = node.firstChild;
    const className = codeNode.getAttribute("class") || "";

    // Extract language from common class patterns
    let language = "";
    const langMatch = className.match(
      /(?:language-|lang-|highlight-|brush:\s*)(\w+)/i
    );
    if (langMatch) {
      language = langMatch[1];
    }

    const code = codeNode.textContent || "";
    return `\n\n\`\`\`${language}\n${code.replace(/\n$/, "")}\n\`\`\`\n\n`;
  },
});

// Custom rule: convert YouTube/Vimeo iframes to Markdown links
turndownService.addRule("videoEmbed", {
  filter: function (node) {
    if (node.nodeName !== "IFRAME") return false;
    const src = node.getAttribute("src") || "";
    return (
      src.includes("youtube.com") ||
      src.includes("youtu.be") ||
      src.includes("vimeo.com")
    );
  },
  replacement: function (_content, node) {
    const src = node.getAttribute("src") || "";
    let videoUrl = src;
    let videoId = "";

    if (src.includes("youtube.com/embed/")) {
      videoId = src.split("youtube.com/embed/")[1]?.split("?")[0] || "";
      videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    } else if (src.includes("vimeo.com/video/")) {
      videoId = src.split("vimeo.com/video/")[1]?.split("?")[0] || "";
      videoUrl = `https://vimeo.com/${videoId}`;
    }

    const title = node.getAttribute("title") || "Video";

    if (videoId && src.includes("youtube")) {
      const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      return `\n\n[![${title}](${thumbnail})](${videoUrl})\n\n`;
    }

    return `\n\n[▶ ${title}](${videoUrl})\n\n`;
  },
});

// Custom rule: convert <details>/<summary> (pass through as HTML for GFM)
turndownService.addRule("details", {
  filter: "details",
  replacement: function (content, node) {
    const summary = node.querySelector("summary");
    const summaryText = summary ? summary.textContent.trim() : "Details";
    const innerContent = content.replace(summaryText, "").trim();

    return `\n\n<details>\n<summary>${summaryText}</summary>\n\n${innerContent}\n\n</details>\n\n`;
  },
});

// Custom rule: definition lists
turndownService.addRule("definitionList", {
  filter: "dl",
  replacement: function (_content, node) {
    let result = "\n\n";
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeName === "DT") {
        result += `**${child.textContent.trim()}**\n`;
      } else if (child.nodeName === "DD") {
        result += `: ${child.textContent.trim()}\n\n`;
      }
    }
    return result;
  },
});

// Custom rule: resolve relative URLs to absolute
if (sourceUrl) {
  turndownService.addRule("absoluteLinks", {
    filter: function (node) {
      return node.nodeName === "A" && node.getAttribute("href");
    },
    replacement: function (content, node) {
      let href = node.getAttribute("href") || "";
      const title = node.getAttribute("title");

      // Resolve relative URLs
      if (href && !href.startsWith("http") && !href.startsWith("mailto:") && !href.startsWith("#")) {
        try {
          href = new URL(href, sourceUrl).toString();
        } catch (_e) {
          // keep original
        }
      }

      if (!content.trim()) return "";

      const titlePart = title ? ` "${title}"` : "";
      return `[${content}](${href}${titlePart})`;
    },
  });

  turndownService.addRule("absoluteImages", {
    filter: function (node) {
      return node.nodeName === "IMG" && node.getAttribute("src");
    },
    replacement: function (_content, node) {
      let src = node.getAttribute("src") || "";
      const alt = node.getAttribute("alt") || "";
      const title = node.getAttribute("title");

      // Resolve relative URLs
      if (src && !src.startsWith("http") && !src.startsWith("data:")) {
        try {
          src = new URL(src, sourceUrl).toString();
        } catch (_e) {
          // keep original
        }
      }

      const titlePart = title ? ` "${title}"` : "";
      return `![${alt}](${src}${titlePart})`;
    },
  });
}

// Sanitize HTML before conversion
const cleanHtml = sanitizeHtml(html);

// Convert
const markdown = turndownService.turndown(cleanHtml);

// Write output
fs.writeFileSync(path.join(outputDir, "page.md"), markdown, "utf8");

// Output stats as JSON
const result = {
  success: true,
  inputSize: html.length,
  outputSize: markdown.length,
  reduction: ((1 - markdown.length / html.length) * 100).toFixed(1),
};

console.log(JSON.stringify(result));
