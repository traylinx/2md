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
        <a href="https://traylinx.com/privacy" target="_blank" rel="noopener noreferrer" class="footer-link">Privacy</a>
        <span class="footer-sep">·</span>
        <a href="https://traylinx.com/terms" target="_blank" rel="noopener noreferrer" class="footer-link">Terms</a>
        <span class="footer-sep">·</span>
        <a href="https://traylinx.com/security" target="_blank" rel="noopener noreferrer" class="footer-link">Security</a>
        <span class="footer-sep">·</span>
        <a href="https://traylinx.com/subprocessors" target="_blank" rel="noopener noreferrer" class="footer-link">Subprocessors</a>
        <span class="footer-sep">·</span>
        <span class="footer-copy">
          Recommended:{" "}
          <a
            href="https://scoutica.com/"
            target="_blank"
            rel="noopener noreferrer"
            class="footer-link"
          >
            Scoutica Protocol
          </a>
          {" "}and{" "}
          <a
            href="https://ail.traylinx.com/"
            target="_blank"
            rel="noopener noreferrer"
            class="footer-link"
          >
            switch AIL ocal
          </a>
        </span>
      </div>
    </footer>
  );
}
