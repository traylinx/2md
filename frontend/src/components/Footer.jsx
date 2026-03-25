const CURRENT_YEAR = new Date().getFullYear();

export default function Footer() {
  return (
    <footer class="site-footer">
      <div class="footer-inner">
        <span class="footer-copy">© {CURRENT_YEAR} Traylinx</span>
        <span class="footer-sep">·</span>
        <a
          href="https://github.com/traylinx/2md"
          target="_blank"
          rel="noopener noreferrer"
          class="footer-link"
        >
          GitHub
        </a>
        <span class="footer-sep">·</span>
        <a
          href="https://traylinx.com"
          target="_blank"
          rel="noopener noreferrer"
          class="footer-link"
        >
          Powered by <strong>Traylinx</strong>
        </a>
        <span class="footer-sep">·</span>
        <a href="/docs" class="footer-link">Docs</a>
        <span class="footer-sep">·</span>
        <a href="/privacy" class="footer-link">Privacy</a>
        <span class="footer-sep">·</span>
        <a href="/terms" class="footer-link">Terms</a>
        <span class="footer-sep">·</span>
        <a href="/security" class="footer-link">Security</a>
      </div>
    </footer>
  );
}
