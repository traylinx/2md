import { useState, useCallback, useRef } from 'preact/hooks';
import { API_BASE, getClientId } from '../utils';

const MAX_LOG_LINES = 200;

// Filter out noisy lines that are raw CSS/HTML dumps, not useful log output
function isNoisyLine(line) {
  if (line.length > 500) return true;
  const l = line.trimStart();
  if (!l) return false;
  // CSS property dumps
  if (/^[\.\#\@\*\:\-]/.test(l) && /[\{;:]/.test(l) && l.includes('{')) return true;
  if (/\{[a-z\-]+:/.test(l)) return true;
  if (/^@(font-face|media|keyframes|import|charset)/.test(l)) return true;
  if (/transition-property|font-family:|border-radius:|grid-template|scrollbar/.test(l)) return true;
  // HTML style/link/meta tags
  if (/^<(style|link|meta|!DOCTYPE)/i.test(l)) return true;
  return false;
}

function capLog(logStr) {
  // Hard limit on total length to prevent rendering crashes from massive single-line dumps
  if (logStr.length > 50000) {
    logStr = '[...earlier output truncated due to length]\n' + logStr.slice(-50000);
  }
  const lines = logStr.split('\n');
  if (lines.length <= MAX_LOG_LINES) return logStr;
  return '[...earlier output truncated]\n' + lines.slice(-MAX_LOG_LINES).join('\n');
}

export function useStreamFetch() {
  const [log, setLog] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const streamFetch = useCallback(async (endpoint, body, onComplete) => {
    setLoading(true);
    setError(null);
    const isFormData = body instanceof FormData;
    setLog(isFormData ? '[file2md] Initializing secure transfer to server...\n[file2md] Uploading file... Please wait, this may take a moment for large files.\n' : '');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const isFormData = body instanceof FormData;
      const headers = isFormData ? { 'X-Client-ID': getClientId() } : { 'Content-Type': 'application/json', 'X-Client-ID': getClientId() };
      const reqBody = isFormData ? body : JSON.stringify(body);

      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers,
        body: reqBody,
        signal: controller.signal
      });

      if (!response.ok) {
        const errBody = await response.text();
        try {
          const errJson = JSON.parse(errBody);
          throw new Error(errJson.error || `Server error (${response.status})`);
        } catch (parseErr) {
          if (parseErr.message.startsWith('Server error')) throw parseErr;
          throw new Error(`Server error (${response.status}): ${errBody.substring(0, 200)}`);
        }
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      let hasJson = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const clean = chunk.replace(/\x1b\[[0-9;]*m/g, '');
        fullText += clean;

        // Stop adding to UI logs once we hit the JSON payload boundary
        if (!hasJson) {
           const jsonMatch = fullText.indexOf('__JSON__');
           if (jsonMatch !== -1) {
             hasJson = true;
           } else {
             const filtered = clean.split('\n')
               .filter(line => !line.includes('Crawling with Puppeteer') && !line.includes('renders JavaScript'))
               .filter(line => !isNoisyLine(line))
               .join('\n');
             if (filtered.trim()) setLog(prev => capLog(prev + filtered));
           }
        }
      }

      const jsonIdx = fullText.indexOf('__JSON__');
      let jsonStr = '';
      if (jsonIdx === -1) {
        const trimmed = fullText.trim();
        if (trimmed.startsWith('{')) {
          jsonStr = trimmed;
        } else {
          throw new Error('No data returned from server.');
        }
      } else {
        jsonStr = fullText.substring(jsonIdx + 8);
      }

      let braceCount = 0;
      let endIndex = -1;
      let inString = false;
      let escapeNext = false;

      for (let i = 0; i < jsonStr.length; i++) {
        const char = jsonStr[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === '\\') {
          escapeNext = true;
          continue;
        }

        if (char === '"') {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === '{') {
            braceCount++;
          } else if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
              endIndex = i;
              break;
            }
          }
        }
      }

      if (endIndex === -1) throw new Error('Invalid JSON payload received.');
      
      const cleanJsonStr = jsonStr.substring(0, endIndex + 1).trim();
      const data = JSON.parse(cleanJsonStr);
      
      if (!data.success) {
        throw new Error(data.error || 'Operation failed.');
      }

      if (onComplete) onComplete(data);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, []);

  const abort = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  return { log, loading, error, streamFetch, abort };
}
