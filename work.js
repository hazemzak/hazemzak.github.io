/* Progressive enhancement: the HTML list is the only source of project data. */
(() => {
  'use strict';
  const list = document.getElementById('work-list');
  const results = document.getElementById('work-results');
  const controls = document.getElementById('work-controls');
  const status = document.getElementById('work-count');
  if (!list || !results || !controls || !status) return;
  const entries = [...list.children];
  if (!entries.length) return;

  // Group headings add a level; project titles remain beneath them in both views.
  entries.forEach(entry => {
    const title = entry.querySelector('h3');
    if (!title) return;
    const heading = document.createElement('h4');
    heading.append(...title.childNodes);
    title.replaceWith(heading);
  });

  const lastYear = period => Math.max(0, ...(period.match(/\d{4}/g) || []).map(Number));
  function render(view) {
    const groups = new Map();
    for (const entry of entries) {
      const key = view === 'year' ? entry.dataset.period || 'Undated' : entry.dataset.field || 'Other work';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    }
    const ordered = [...groups];
    if (view === 'year') ordered.sort(([a], [b]) => lastYear(b) - lastYear(a) || b.localeCompare(a));
    const fragment = document.createDocumentFragment();
    ordered.forEach(([label, projects], index) => {
      const group = document.createElement('section');
      group.className = 'work-group';
      const headingId = `work-group-${view}-${index}`;
      group.setAttribute('aria-labelledby', headingId);
      const heading = document.createElement('h3');
      heading.id = headingId;
      heading.className = 'work-group-title';
      heading.textContent = label;
      const items = document.createElement('ul');
      items.className = 'projects';
      items.setAttribute('role', 'list');
      items.append(...projects);
      group.append(heading, items);
      fragment.append(group);
    });
    // Native radios keep focus. Instant reflow avoids moving a large wall of cards.
    results.replaceChildren(fragment);
    results.dataset.view = view;
    status.textContent = `${entries.length} entries · ${view === 'year' ? 'by year / period' : 'by field'}`;
  }

  controls.addEventListener('change', event => {
    if (event.target.matches('input[name="work-view"]')) render(event.target.value);
  });
  render(controls.querySelector('input:checked').value);
  controls.hidden = false;
})();
