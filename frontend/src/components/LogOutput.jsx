import { useRef, useEffect } from 'preact/hooks';

export default function LogOutput({ log }) {
  const preRef = useRef(null);

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [log]);

  return <pre ref={preRef} class="log-output">{log}</pre>;
}
