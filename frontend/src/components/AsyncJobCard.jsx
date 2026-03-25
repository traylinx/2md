export default function AsyncJobCard({ jobId, status, error, pageCount, onLoadResults, onCancel }) {
  const isRunning = status === 'running';
  const isDone = status === 'done';
  const isFailed = status === 'failed';

  return (
    <div class="output-card async-job-card">
      <div class="async-job-header">
        <div class="async-job-status-row">
          {isRunning && (
            <>
              <div class="async-spinner" />
              <span class="async-status-text">Converting {pageCount} pages in background...</span>
            </>
          )}
          {isDone && (
            <>
              <span class="async-status-icon done">✓</span>
              <span class="async-status-text done">Batch conversion complete!</span>
            </>
          )}
          {isFailed && (
            <>
              <span class="async-status-icon failed">✗</span>
              <span class="async-status-text failed">Job failed</span>
            </>
          )}
        </div>

        <span class="async-job-id-badge" title={jobId}>
          <span class="material-symbols-outlined" style={{ fontSize: '14px', marginRight: '4px' }}>tag</span>
          {jobId}
        </span>
      </div>

      {isFailed && error && (
        <div class="async-error-message">{error}</div>
      )}

      <div class="async-job-actions">
        {isDone && (
          <button class="outline-button action-btn" onClick={onLoadResults}>
            <span class="material-symbols-outlined" style={{ fontSize: '16px', marginRight: '6px' }}>download</span>
            Load Results
          </button>
        )}
        {isRunning && (
          <p class="async-hint">
            <span class="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>info</span>
            You can close this tab — the job will keep running. Check <strong>Job History</strong> to reload results later.
          </p>
        )}
        {isRunning && onCancel && (
          <button class="outline-button small danger" onClick={onCancel}>
            <span class="material-symbols-outlined" style={{ fontSize: '14px', marginRight: '4px' }}>cancel</span>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
