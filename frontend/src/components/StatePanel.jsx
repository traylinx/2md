import LogOutput from './LogOutput';

export function LoadingPanel({ message, log, onCancel }) {
  return (
    <div class="state-panel">
      <div class="spinner-purple" />
      <p>{message}</p>
      {onCancel && (
        <button class="outline-button" onClick={onCancel} style={{ marginTop: '0.5rem', marginBottom: '1rem', borderColor: 'var(--error-color)', color: 'var(--error-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span class="material-symbols-outlined" style={{ fontSize: '16px', marginRight: '6px' }}>cancel</span>
          Cancel Process
        </button>
      )}
      {log !== undefined && <LogOutput log={log} />}
    </div>
  );
}

export function ErrorPanel({ title = 'Error', message }) {
  return (
    <div class="state-panel error">
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}
