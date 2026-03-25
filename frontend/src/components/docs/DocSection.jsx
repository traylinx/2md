export default function DocSection({ title, children }) {
  return (
    <section class="doc-section flat-box">
      {title && <div class="doc-header"><h2>{title}</h2></div>}
      <div class="doc-content">
        {children}
      </div>
    </section>
  );
}
