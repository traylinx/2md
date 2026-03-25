import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { API_BASE, getClientId } from '../utils';

const POLL_INTERVAL_MS = 3000;

export function useAsyncJob() {
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [polling, setPolling] = useState(false);
  const intervalRef = useRef(null);
  const jobIdRef = useRef(null);

  const fetchStatus = useCallback(async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/jobs/${id}`, {
        headers: { 'X-Client-ID': getClientId() },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, []);

  const fetchResult = useCallback(async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/jobs/${id}/result`, {
        headers: { 'X-Client-ID': getClientId() },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPolling(false);
  }, []);

  const startPolling = useCallback((id) => {
    setJobId(id);
    jobIdRef.current = id;
    setStatus('running');
    setResult(null);
    setError(null);
    setPolling(true);

    if (intervalRef.current) clearInterval(intervalRef.current);

    const poll = async () => {
      const data = await fetchStatus(jobIdRef.current);
      if (!data) return;

      setStatus(data.status);

      if (data.status === 'done' || data.status === 'completed') {
        stopPolling();
        setStatus('done');
        const resultData = await fetchResult(jobIdRef.current);
        if (resultData) {
          setResult(resultData);
        }
      } else if (data.status === 'failed') {
        stopPolling();
        setError(data.error || 'Job failed');
      }
    };

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
  }, [fetchStatus, fetchResult, stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    setJobId(null);
    setStatus(null);
    setResult(null);
    setError(null);
  }, [stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  return { jobId, status, result, error, polling, startPolling, stopPolling, reset };
}
