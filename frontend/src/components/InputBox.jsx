import { useState, useEffect } from 'preact/hooks';

function ToggleSwitches({ optPrefix, downloadImages, frontMatter, screenshot, onToggleImages, onToggleFrontMatter, onToggleScreenshot }) {
  return (
    <>
      <label class="switch-label small-switch">
        <span class="info-icon" data-tooltip="Downloads all images from the URL and saves them locally, updating the Markdown links to point to the local files instead of the web links.">i</span>
        <span class="switch-text">Images</span>
        <div class="switch-wrapper">
          <input
            type="checkbox"
            id={`${optPrefix}opt-images`}
            checked={downloadImages}
            onChange={onToggleImages}
          />
          <span class="switch-slider" />
        </div>
      </label>
      <label class="switch-label small-switch">
        <span class="info-icon" data-tooltip="Extracts the Title, Author, Date, and Description and puts them at the top of the file. Provides powerful context for AI Agents.">i</span>
        <span class="switch-text">Metadata</span>
        <div class="switch-wrapper">
          <input
            type="checkbox"
            id={`${optPrefix}opt-frontmatter`}
            checked={frontMatter}
            onChange={onToggleFrontMatter}
          />
          <span class="switch-slider" />
        </div>
      </label>
      <label class="switch-label small-switch">
        <span class="info-icon" data-tooltip="Takes a full-page screenshot of the rendered page. Included in ZIP downloads.">i</span>
        <span class="switch-text">Screenshots</span>
        <div class="switch-wrapper">
          <input
            type="checkbox"
            id={`${optPrefix}opt-screenshot`}
            checked={screenshot}
            onChange={onToggleScreenshot}
          />
          <span class="switch-slider" />
        </div>
      </label>
    </>
  );
}

export default function InputBox({ 
  urlId, btnId, btnText, placeholder, 
  showDepth, 
  showMaxPages = showDepth,
  showToggles = true, 
  optPrefix = '', 
  onSubmit, 
  disabled,
  defaultUrl
}) {
  const [url, setUrl] = useState(defaultUrl || '');
  const [downloadImages, setDownloadImages] = useState(false);
  const [frontMatter, setFrontMatter] = useState(true);
  const [screenshot, setScreenshot] = useState(false);
  const [depth, setDepth] = useState(1);
  const [maxPages, setMaxPages] = useState(10);
  const [urlError, setUrlError] = useState('');

  useEffect(() => {
    if (defaultUrl) setUrl(defaultUrl);
  }, [defaultUrl]);

  function normalizeUrl(raw) {
    let val = raw.trim();
    if (!val) return '';
    if (!/^https?:\/\//i.test(val)) {
      val = 'https://' + val;
    }
    return val;
  }

  function handleSubmit() {
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    try {
      new URL(normalized);
    } catch {
      setUrlError('Please enter a valid URL (e.g., docs.traylinx.com)');
      return;
    }
    setUrlError('');
    setUrl(normalized);
    
    const payload = { url: normalized, downloadImages, frontMatter, screenshot };
    if (showDepth) payload.depth = depth;
    if (showMaxPages) payload.maxPages = maxPages;
    
    onSubmit(payload);
  }

  function handleKeyPress(e) {
    if (e.key === 'Enter') handleSubmit();
  }

  const toggleProps = {
    optPrefix,
    downloadImages,
    frontMatter,
    screenshot,
    onToggleImages: () => setDownloadImages(prev => !prev),
    onToggleFrontMatter: () => setFrontMatter(prev => !prev),
    onToggleScreenshot: () => setScreenshot(prev => !prev)
  };

  return (
    <div class="input-container flat-box">
      <div class="input-wrapper">
        <input
          type="url"
          id={urlId}
          placeholder={placeholder}
          required
          autocomplete="off"
          value={url}
          onInput={(e) => { setUrl(e.target.value); setUrlError(''); }}
          onKeyPress={handleKeyPress}
          disabled={disabled}
        />
        <button
          id={btnId}
          class="outline-button action-btn"
          onClick={handleSubmit}
          disabled={disabled || !url.trim()}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span class="material-symbols-outlined" style={{ fontSize: '18px', marginRight: '6px' }}>bolt</span>
          {btnText}
        </button>
      </div>
      {urlError && <p style={{ color: 'var(--error-color)', fontSize: '0.85rem', margin: '0.25rem 0 0.5rem 0' }}>{urlError}</p>}

      <div class="input-options-row">
        {showDepth && (
          <label class="input-option-label">
            <span class="info-icon" data-tooltip="How deep to crawl. 0 = Single page. 1 = Target page + links on it. 2 = One level deeper, etc.">i</span>
            <span>Depth</span>
            <select
              id={`${optPrefix}depth`}
              class="input-option-select"
              value={depth}
              onChange={(e) => setDepth(parseInt(e.target.value))}
            >
              {[0, 1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        )}
        {showMaxPages && (
          <label class="input-option-label">
            <span class="info-icon" data-tooltip="Absolute limit on discovered pages. Prevents accidentally crawling giant wikis or looping sites.">i</span>
            <span>Max Pages</span>
            <select
              id={`${optPrefix}max`}
              class="input-option-select"
              value={maxPages}
              onChange={(e) => setMaxPages(parseInt(e.target.value))}
            >
              {[10, 20, 30, 50].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        )}
        {showToggles && (
          <div class="input-toggles">
            <ToggleSwitches {...toggleProps} />
          </div>
        )}
      </div>
    </div>
  );
}
