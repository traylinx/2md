import { useState } from 'preact/hooks';

const TIME_RANGES = [
  { label: 'Last 15 min', minutes: 15 },
  { label: 'Last hour', minutes: 60 },
  { label: 'Last 24 hours', minutes: 60 * 24 },
  { label: 'Last 7 days', minutes: 60 * 24 * 7 },
  { label: 'All time', minutes: null },
];

export default function ClearHistoryDialog({ jobCount, onClear, onClose }) {
  const [selected, setSelected] = useState(2); // default: Last 24 hours

  function handleDelete() {
    const range = TIME_RANGES[selected];
    let beforeDate = null;
    if (range.minutes !== null) {
      beforeDate = new Date(Date.now() - range.minutes * 60 * 1000).toISOString();
    }
    onClear(beforeDate);
    onClose();
  }

  return (
    <div class="clear-history-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="clear-history-dialog">
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem' }}>Clear Job History</h3>

        <div class="time-range-pills">
          {TIME_RANGES.map((range, idx) => (
            <button
              key={range.label}
              class={`time-range-pill ${selected === idx ? 'active' : ''}`}
              onClick={() => setSelected(idx)}
            >
              {selected === idx && <span style={{ marginRight: '4px' }}>✓</span>}
              {range.label}
            </button>
          ))}
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', margin: '16px 0' }}>
          {TIME_RANGES[selected].minutes === null
            ? `This will permanently delete all ${jobCount} job(s) from your history.`
            : `This will delete jobs from the ${TIME_RANGES[selected].label.toLowerCase()}.`
          }
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button class="outline-button" onClick={onClose}>Cancel</button>
          <button
            class="outline-button"
            style={{ borderColor: 'var(--error-color)', color: 'var(--error-color)' }}
            onClick={handleDelete}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
