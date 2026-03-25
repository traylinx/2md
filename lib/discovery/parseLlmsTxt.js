function parseLlmsTxt(content, baseUrl) {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  const result = { title: '', description: '', urls: [] };

  // First non-empty line starting with # is the title
  const titleLine = lines.find(l => l.startsWith('# '));
  if (titleLine) {
    result.title = titleLine.replace(/^#\s+/, '').trim();
  }

  // Lines starting with > are description
  const descLines = lines.filter(l => l.startsWith('> '));
  if (descLines.length > 0) {
    result.description = descLines.map(l => l.replace(/^>\s*/, '')).join(' ').trim();
  }

  // Parse markdown links: - [title](url) or [title](url)
  const linkPattern = /\[([^\]]*)\]\(([^)]+)\)/g;
  let match;

  for (const line of lines) {
    linkPattern.lastIndex = 0;
    while ((match = linkPattern.exec(line)) !== null) {
      const title = match[1].trim();
      let url = match[2].trim();

      // Resolve relative URLs
      if (url && !url.startsWith('http') && !url.startsWith('mailto:') && !url.startsWith('#')) {
        try {
          url = new URL(url, baseUrl).toString();
        } catch { continue; }
      }

      if (url.startsWith('http')) {
        result.urls.push({ url, title: title || null });
      }
    }
  }

  // Also parse bare URLs on their own line
  for (const line of lines) {
    if (line.startsWith('http') && !line.includes('[') && !line.includes(']')) {
      const bareUrl = line.split(/\s/)[0];
      // Avoid duplicates
      if (!result.urls.some(u => u.url === bareUrl)) {
        result.urls.push({ url: bareUrl, title: null });
      }
    }
  }

  return result;
}

module.exports = { parseLlmsTxt };
