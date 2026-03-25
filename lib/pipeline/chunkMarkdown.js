function chunkMarkdown(markdown, options = {}) {
  const { minHeadingLevel = 2 } = options;
  const headingPattern = new RegExp(`^(#{${minHeadingLevel},6})\\s+(.+)$`, 'gm');

  const chunks = [];
  let lastIndex = 0;
  let lastHeading = null;
  let match;

  while ((match = headingPattern.exec(markdown)) !== null) {
    // Capture content before this heading
    if (lastIndex < match.index) {
      const content = markdown.substring(lastIndex, match.index).trim();
      if (content.length > 0) {
        chunks.push(buildChunk(lastHeading, content));
      }
    }

    lastHeading = match[2].trim();
    lastIndex = match.index + match[0].length;
  }

  // Capture trailing content after the last heading
  if (lastIndex < markdown.length) {
    const content = markdown.substring(lastIndex).trim();
    if (content.length > 0) {
      chunks.push(buildChunk(lastHeading, content));
    }
  }

  // If no headings were found, return the entire markdown as one chunk
  if (chunks.length === 0 && markdown.trim().length > 0) {
    chunks.push(buildChunk(null, markdown.trim()));
  }

  return chunks;
}

function buildChunk(heading, content) {
  const words = content.split(/\s+/).filter(Boolean);
  return {
    heading: heading || null,
    content,
    wordCount: words.length,
    tokens: Math.ceil(content.length / 3.7),
  };
}

module.exports = { chunkMarkdown };
