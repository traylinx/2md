import { useState, useMemo } from 'preact/hooks';
import CodeSnippet from './CodeSnippet';

export default function ApiReferenceCard({ endpoint, method = 'POST', curlTemplate, responseJson, description }) {
  const [activeTab, setActiveTab] = useState('request');

  const renderedCurl = useMemo(() => {
    return curlTemplate(window.location.origin);
  }, [curlTemplate]);

  return (
    <div class="api-ref-card">
      <div class="api-ref-header">
        <span class={`badge badge-${method.toLowerCase()}`}>{method}</span>
        <span class="api-endpoint-text">{endpoint}</span>
      </div>
      
      {description && <p class="api-ref-desc">{description}</p>}

      <div class="format-tabs small-tabs">
        <button
          class={`format-tab ${activeTab === 'request' ? 'active' : ''}`}
          onClick={() => setActiveTab('request')}
        >
          <span class="tab-icon">#_</span> Request (cURL)
        </button>
        <button
          class={`format-tab ${activeTab === 'response' ? 'active' : ''}`}
          onClick={() => setActiveTab('response')}
        >
          <span class="tab-icon">{'{ }'}</span> Response
        </button>
      </div>

      <div class="api-ref-body">
        {activeTab === 'request' ? (
          <CodeSnippet code={renderedCurl} language="bash" />
        ) : (
          <CodeSnippet code={responseJson} language="json" />
        )}
      </div>
    </div>
  );
}
