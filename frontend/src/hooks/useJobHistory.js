import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { API_BASE, getClientId } from '../utils';

export function useJobHistory(pollWhileOpen = false) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/jobs`, { headers: { 'X-Client-ID': getClientId() } });
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch (e) {
      console.error('Failed to fetch jobs:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const startPolling = useCallback(() => {
    fetchJobs();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchJobs, 10000);
  }, [fetchJobs]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const clearHistory = useCallback(async (beforeDate) => {
    try {
      const params = beforeDate ? `?before=${encodeURIComponent(beforeDate)}` : '';
      await fetch(`${API_BASE}/api/jobs${params}`, { method: 'DELETE', headers: { 'X-Client-ID': getClientId() } });
      await fetchJobs();
    } catch (e) {
      console.error('Failed to clear history:', e);
    }
  }, [fetchJobs]);

  const fetchJobResult = useCallback(async (jobId) => {
    try {
      const res = await fetch(`${API_BASE}/api/jobs/${jobId}/result`, { headers: { 'X-Client-ID': getClientId() } });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.error('Failed to fetch job result:', e);
      return null;
    }
  }, []);

  return { jobs, loading, fetchJobs, startPolling, stopPolling, clearHistory, fetchJobResult };
}
