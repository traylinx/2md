'use strict';
// Capture-only normalization. Legacy static conversion remains unchanged.
function preserveSemantics(doc) {
  // Card/article headers are content, not the site's navigation banner.
  for (const header of doc.querySelectorAll('header')) {
    if (!header.querySelector('h1,h2,h3,h4,h5,h6') || header.closest('nav,[role="navigation"],[role="banner"]')) continue;
    const replacement=doc.createElement('div');
    while(header.firstChild)replacement.append(header.firstChild);
    header.replaceWith(replacement);
  }
  // Keep explicitly supplied accessible text, never guess from SVG paths/colors.
  for(const icon of doc.querySelectorAll('[role="img"][aria-label],svg[aria-label],svg:has(title)')){
    if(icon.closest('[hidden],[aria-hidden="true"]'))continue;
    const label=(icon.getAttribute('aria-label')||icon.querySelector('title')?.textContent||'').trim();
    if(!label||label.length>256)continue;
    const span=doc.createElement('span');span.textContent=label;icon.replaceWith(span);
  }
  // Common comparison-table section rows span all columns. Preserve the section
  // label while retaining the rectangular data rows and their header alignment.
  for(const table of doc.querySelectorAll('table')){
    const rows=[...table.rows];if(!rows.length||table.querySelector('table,[rowspan]:not([rowspan="1"])'))continue;
    const width=Math.max(...rows.map(r=>r.cells.length));if(width<2||width>64)continue;
    for(const row of rows){
      if(row.cells.length!==1||row.cells[0].colSpan!==width)continue;
      row.cells[0].removeAttribute('colspan');
      for(let i=1;i<width;i++)row.append(doc.createElement('td'));
    }
  }
}
module.exports={preserveSemantics};
