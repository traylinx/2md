import { useState, useEffect } from 'preact/hooks';
import { useJobHistory } from '../hooks/useJobHistory';
import ClearHistoryDialog from './ClearHistoryDialog';

const TYPE_CONFIG = {
  convert:  { icon: 'document_scanner', color: '#60A5FA', label: 'Convert' },
  crawl:    { icon: 'travel_explore',   color: '#34D399', label: 'Crawl' },
  batch:    { icon: 'layers',           color: '#34D399', label: 'Batch' },
  agentify: { icon: 'smart_toy',        color: '#A78BFA', label: 'Agentify' },
  file2md:  { icon: 'upload_file',      color: '#FBBF24', label: 'File2MD' },
};

const STATUS_ICON = {
  running: '🔄',
  done: '✅',
  failed: '❌',
};

function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isStale(job) {
  if (job.status !== 'running') return false;
  const lastActivity = new Date(job.lastActivity || job.createdAt);
  const staleThreshold = 15 * 60 * 1000; // 15 minutes
  return (Date.now() - lastActivity) > staleThreshold;
}

export default function JobHistoryPanel({ open, onClose, onNavigate }) {
  const { jobs, startPolling, stopPolling, clearHistory } = useJobHistory();
  const [showClear, setShowClear] = useState(false);

  useEffect(() => {
    if (open) {
      startPolling();
    } else {
      stopPolling();
    }
  }, [open, startPolling, stopPolling]);

  if (!open) return null;

  const runningCount = jobs.filter(j => j.status === 'running').length;

  return (
    <>
      <div class="job-history-overlay" onClick={onClose} />
      <div class="job-history-panel">
        <div class="job-history-header">
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
            Job History
            {runningCount > 0 && (
              <span class="job-running-badge">{runningCount} running</span>
            )}
          </h3>
          <button class="job-history-close" onClick={onClose}>
            <span class="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
          </button>
        </div>

        <div class="job-history-list">
          {jobs.length === 0 && (
            <div class="job-history-empty">
              <span class="material-symbols-outlined" style={{ fontSize: '40px', color: 'var(--text-dim)', marginBottom: '12px' }}>history</span>
              <p style={{ color: 'var(--text-dim)', margin: 0, fontSize: '0.85rem' }}>No jobs yet. Start a conversion to see it here.</p>
            </div>
          )}

          {jobs.map(job => {
            const cfg = TYPE_CONFIG[job.type] || TYPE_CONFIG.convert;
            const stale = isStale(job);
            const statusIcon = stale ? '⚠️' : STATUS_ICON[job.status] || '❓';

            return (
              <div
                key={job.id}
                class={`job-history-item ${job.status}`}
                onClick={() => {
                  const tabMap = { convert: 'convert', crawl: 'crawl', batch: 'crawl', agentify: 'agentify', file2md: 'upload' };
                  const productMap = { convert: 'html2md', crawl: 'html2md', batch: 'html2md', agentify: 'html2md', file2md: 'file2md' };
                  if (onNavigate) onNavigate(productMap[job.type], tabMap[job.type], job);
                }}
              >
                <div class="job-history-item-main">
                  <span class="job-status-icon">{statusIcon}</span>
                  <span class="job-type-badge" style={{ background: `${cfg.color}22`, color: cfg.color }}>
                    <span class="material-symbols-outlined" style={{ fontSize: '12px', marginRight: '3px' }}>{cfg.icon}</span>
                    {cfg.label}
                  </span>
                  <span class="job-label" title={job.label}>{job.label}</span>
                </div>
                <div class="job-history-item-meta">
                  <span class="job-time">{timeAgo(job.createdAt)}</span>
                  {job.hasResult && job.status === 'done' && (
                    <span class="job-has-result" title="Results available">📋</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div class="job-history-footer" style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            class="outline-button small"
            onClick={() => setShowClear(true)}
            disabled={jobs.length === 0}
          >
            <span class="material-symbols-outlined" style={{ fontSize: '14px', marginRight: '6px' }}>delete_sweep</span>
            Clear History...
          </button>
        </div>
      </div>

      {showClear && (
        <ClearHistoryDialog
          jobCount={jobs.length}
          onClear={clearHistory}
          onClose={() => setShowClear(false)}
        />
      )}
    </>
  );
}
