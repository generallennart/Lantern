/* Lantern — the in-page layer.
 *
 * While the panel is open, Lantern stops being a box at the edge and puts its
 * affordances where the user is actually looking: room made for it instead of
 * content covered, the composer lit up so it is obvious where prompts land, and
 * a bar under the last answer showing what Lantern reads in it plus the two
 * follow-ups that fit.
 *
 * Everything here writes into ChatGPT's own DOM, so two rules govern it:
 *   1. Additive only. Nothing existing is moved, restyled or removed except a
 *      padding that is recorded and put back.
 *   2. Every change is undone by teardown(). If ChatGPT redesigns and a
 *      selector misses, the feature quietly does nothing — it never breaks the
 *      page it failed to find.
 */

(function () {
  'use strict';

  const INPAGE = 'data-ln-inpage';

  let on = false;
  let ctx = null;
  let inset = 0;
  let pushed = [];      // [{el, prop, previous}] so every push can be undone
  let tagTimer = null;
  let styleEl = null;
  let barEl = null;
  let composerTag = null;
  let pointTag = null;
  let composerMark = null;
  let pointMark = null;
  let answerMark = null;

  const CSS = `
[data-ln-inpage="composer-lit"] {
  box-shadow: 0 0 0 2px var(--ln-accent, #19a97b), 0 0 0 7px rgba(25,169,123,.13) !important;
  border-radius: 26px !important;
  transition: box-shadow .18s ease;
}
[data-ln-inpage="composer-tag"] {
  position: fixed; z-index: 2147482000;
  background: var(--ln-accent, #19a97b); color: var(--ln-accent-fg, #06120e);
  font: 600 11px/1 ui-sans-serif, system-ui, sans-serif;
  padding: 4px 9px; border-radius: 6px; pointer-events: none;
  box-shadow: 0 2px 10px rgba(0,0,0,.25);
  transition: opacity .5s ease;
}
[data-ln-inpage="composer-tag"][data-faded] { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  [data-ln-inpage="composer-lit"], [data-ln-inpage="composer-tag"] { transition: none !important; }
}
/* Pointing at one of the site's own controls. A ring and a small label, in the
   same visual language as the composer ring, because it means the same thing:
   this is the thing you want, and you are the one who presses it. */
[data-ln-inpage="point-lit"] {
  box-shadow: 0 0 0 2px var(--ln-accent, #19a97b), 0 0 0 6px rgba(25,169,123,.16) !important;
  border-radius: 10px !important;
}
[data-ln-inpage="point-tag"] {
  position: fixed; z-index: 2147482000;
  background: var(--ln-accent, #19a97b); color: var(--ln-accent-fg, #06120e);
  font: 600 11px/1 ui-sans-serif, system-ui, sans-serif;
  padding: 4px 9px; border-radius: 6px; pointer-events: none;
  box-shadow: 0 2px 10px rgba(0,0,0,.25);
}
[data-ln-inpage="answer-lit"] {
  position: relative;
  box-shadow: -3px 0 0 0 var(--ln-accent, #19a97b);
  padding-left: 14px !important;
  transition: box-shadow .18s ease;
}
[data-ln-inpage="bar"] {
  margin: 10px 0 4px; padding: 10px 12px;
  border: 1px solid var(--ln-line, #3a3b3f); border-radius: 12px;
  background: var(--ln-soft, rgba(25,169,123,.07));
  font: 12px/1.5 ui-sans-serif, system-ui, sans-serif;
  color: var(--ln-fg, inherit);
  display: flex; flex-wrap: wrap; align-items: center; gap: 7px;
}
[data-ln-inpage="bar"] .ln-bar-lead {
  font-weight: 700; font-size: 10.5px; letter-spacing: .05em;
  text-transform: uppercase; color: var(--ln-accent, #19a97b);
  width: 100%; margin-bottom: -2px;
}
[data-ln-inpage="bar"] .ln-read.ln-warn {
  border-style: solid; opacity: 1; font-weight: 700;
  color: #e0b464; border-color: #e0b464;
}
/* A soft pill, not a dashed outline. At 10.5px a dashed border renders as
   four or five visible dashes per side and reads as a broken box rather than
   a label — which is what a store screenshot made obvious. */
[data-ln-inpage="bar"] .ln-read {
  font-size: 10.5px; font-weight: 600; opacity: .85;
  background: rgba(127, 127, 127, .2); border-radius: 999px; padding: 2px 8px;
}
[data-ln-inpage="bar"] button {
  font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer;
  border: 1px solid var(--ln-accent, #19a97b); border-radius: 999px;
  background: transparent; color: var(--ln-accent, #19a97b);
  padding: 5px 12px;
}
[data-ln-inpage="bar"] button:hover { background: var(--ln-accent, #19a97b); color: var(--ln-accent-fg, #06120e); }
[data-ln-inpage="bar"] button.ln-strong { background: var(--ln-accent, #19a97b); color: var(--ln-accent-fg, #06120e); }
[data-ln-inpage="bar"] .ln-bar-sep { flex-basis: 100%; height: 0; }
`;

  function style() {
    if (!styleEl || !styleEl.isConnected) {
      styleEl = document.createElement('style');
      styleEl.setAttribute(INPAGE, 'style');
      styleEl.textContent = CSS;
      (document.head || document.documentElement).appendChild(styleEl);
    }
    return styleEl;
  }

  function mark(el, kind) {
    if (!el) return null;
    const previous = el.getAttribute(INPAGE);
    el.setAttribute(INPAGE, kind);
    return { el: el, kind: kind, previous: previous };
  }

  function unmark(record) {
    if (!record || !record.el) return;
    try {
      if (record.el.getAttribute(INPAGE) !== record.kind) return;
      if (record.previous === null) record.el.removeAttribute(INPAGE);
      else record.el.setAttribute(INPAGE, record.previous);
    } catch (e) {}
  }

  function removeOwned(el) {
    try { if (el && el.parentNode) el.parentNode.removeChild(el); } catch (e) {}
  }

  /* Make room rather than cover things up. Only ever adds padding, and only to
   * two places: the document body, and whichever pinned ancestor the composer
   * sits in. Both are recorded and restored exactly. If the composer cannot be
   * found the panel simply overlaps, as it did before. */
  /* Padding the body is enough only for a page whose layout the body actually
   * drives. Reported by a tester: it worked on one of the three assistants and
   * did nothing on the other two. The reason is structural rather than
   * per-site — a chat app whose scroll container is a pinned full-width box
   * lays itself out against the VIEWPORT, so the body can be padded all day
   * and nothing moves.
   *
   * So the body is still padded, and so is every pinned ancestor of the
   * composer or the conversation that actually reaches into the strip the
   * panel now occupies. Those are the elements that are deciding the width.
   * Reaching in is the test rather than being full width: a composer bar of a
   * fixed width, centred on the viewport, is not full width and is still
   * sitting half under the panel. Anything that already stops short of the
   * panel is clear and must not be nudged. Nothing here names a site or a
   * class: it is decided from computed position and measured geometry, which
   * is the only part of someone else's markup that does not get renamed in a
   * redesign.
   *
   * Every change is recorded and restored exactly, and a failure anywhere
   * leaves the page alone rather than half-pushed. */
  function pushable(node, px) {
    const seen = [];
    const covered = (document.documentElement.clientWidth || window.innerWidth) - px;
    for (let i = 0; node && i < 12; i++) {
      if (node === document.body || node === document.documentElement) break;
      const cs = getComputedStyle(node);
      const pinned = cs.position === 'fixed' || cs.position === 'sticky' || cs.position === 'absolute';
      if (pinned) {
        const r = node.getBoundingClientRect();
        /* Wide enough to be a layout element rather than a floating icon, and
         * it really does run under the panel. The last condition is what is
         * left for the content once the padding is on: on a border-box element
         * the padding eats the content instead of growing the box, and a
         * composer squeezed to a slot is worse than one that is overlapped. */
        const left = cs.boxSizing === 'border-box' ? r.width - px : r.width;
        if (r.width >= 200 && r.right > covered && left >= 280) seen.push(node);
      }
      node = node.parentElement;
    }
    return seen;
  }

  function push(px) {
    unpush();
    inset = px;
    if (!px || !document.body) return;
    try {
      remember(document.body, 'paddingRight');
      const bodyBase = parseFloat(getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = (bodyBase + px) + 'px';

      const roots = [];
      const add = (el) => {
        pushable(el, px).forEach(n => { if (roots.indexOf(n) === -1) roots.push(n); });
      };
      try { add(ctx && ctx.composer && ctx.composer()); } catch (e) {}
      try { add(ctx && ctx.lastAnswerEl && ctx.lastAnswerEl()); } catch (e) {}

      // Six is plenty for any real layout and stops a pathological page from
      // turning one setting into fifty style writes.
      roots.slice(0, 6).forEach(node => {
        remember(node, 'paddingRight');
        const base = parseFloat(getComputedStyle(node).paddingRight) || 0;
        node.style.paddingRight = (base + px) + 'px';
      });
    } catch (e) { /* leave the page alone rather than half-push it */ }
  }

  function remember(el, prop) {
    pushed.push({ el: el, prop: prop, previous: el.style[prop] });
  }

  function unpush() {
    pushed.forEach(p => { try { p.el.style[p.prop] = p.previous; } catch (e) {} });
    pushed = [];
    inset = 0;
  }

  function clearBar() {
    removeOwned(barEl);
    barEl = null;
    unmark(answerMark);
    answerMark = null;
  }

  /* Find the site's own control for a capability, by what it SAYS.
   *
   * Not by selector: a class name is the first thing a redesign changes and the
   * text is the last. Matching is on the visible text and the accessible name,
   * in both languages, and it is deliberately conservative — an unrecognised
   * control costs nothing, because the panel says where to look in words. A
   * ring around the wrong control would be worse than no ring at all. */
  function findControl(words) {
    if (!words || !words.length) return null;
    const nodes = document.querySelectorAll(
      'button, [role="button"], [role="menuitem"], [role="switch"], a[role="button"]');
    const limit = Math.min(nodes.length, 400);
    const candidates = [];
    for (let i = 0; i < limit; i++) {
      const el = nodes[i];
      if (el.closest('#lantern-root, [data-ln], nav, aside, [role="navigation"], [role="list"]')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const label = ((el.getAttribute('aria-label') || '') + ' ' +
        (el.textContent || '') + ' ' + (el.getAttribute('title') || ''))
        .toLowerCase().replace(/\s+/g, ' ').trim();
      if (label && label.length <= 90) candidates.push({ el: el, label: label });
    }
    for (let w = 0; w < words.length; w++) {
      const signal = String(words[w] || '').trim();
      if (!signal) continue;
      const escaped = signal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const whole = new RegExp('(?:^|[^\\p{L}\\p{N}])' + escaped + '(?=$|[^\\p{L}\\p{N}])', 'iu');
      for (let i = 0; i < candidates.length; i++) {
        if (whole.test(candidates[i].label)) return candidates[i].el;
      }
    }
    return null;
  }

  function clearPoint() {
    unmark(pointMark);
    pointMark = null;
    removeOwned(pointTag);
    pointTag = null;
  }

  function drawPoint() {
    clearPoint();
    if (!ctx || !ctx.point || !ctx.point.words) return;
    const el = findControl(ctx.point.words);
    if (!el) return;
    pointMark = mark(el, 'point-lit');
    const tag = document.createElement('div');
    tag.setAttribute(INPAGE, 'point-tag');
    tag.textContent = ctx.point.label;
    tag.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tag);
    const place = () => {
      try {
        const r = el.getBoundingClientRect();
        if (!r.width) { tag.style.display = 'none'; return; }
        tag.style.display = '';
        tag.style.left = Math.round(r.left) + 'px';
        tag.style.top = Math.round(Math.max(4, r.top - 24)) + 'px';
      } catch (e) {}
    };
    place();
    tag.__place = place;
    pointTag = tag;
  }

  function clearComposer() {
    clearTimeout(tagTimer);
    unmark(composerMark);
    composerMark = null;
    removeOwned(composerTag);
    composerTag = null;
  }

  /* The composer is where every button in the panel eventually delivers, so
   * while the panel is open it is worth making that obvious. */
  function lightComposer() {
    clearComposer();
    if (!ctx || !ctx.composer) return;
    const comp = ctx.composer();
    if (!comp) return;
    const box = comp.closest('form') || comp.parentElement || comp;
    composerMark = mark(box, 'composer-lit');

    const tag = document.createElement('div');
    tag.setAttribute(INPAGE, 'composer-tag');
    tag.textContent = ctx.i18n.pageComposer;
    // Purely a visual pointer; the panel says the same thing in words, so
    // announcing it again is noise.
    tag.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tag);

    const place = () => {
      try {
        const r = box.getBoundingClientRect();
        if (!r.width) { tag.style.display = 'none'; return; }
        tag.style.display = '';
        tag.style.left = Math.max(8, r.left + 10) + 'px';
        tag.style.top = Math.max(4, r.top - 25) + 'px';
      } catch (e) {}
    };
    place();
    tag.__place = place;
    composerTag = tag;
    /* It is an orientation cue, not permanent chrome. Left where the composer
     * starts it would sit over the conversation forever; right of it, under the
     * panel. So it says its piece and fades. */
    clearTimeout(tagTimer);
    tagTimer = setTimeout(() => { try { tag.setAttribute('data-faded', ''); } catch (e) {} }, 3800);
  }

  function reposition() {
    if (composerTag && composerTag.__place) composerTag.__place();
    if (pointTag && pointTag.__place) pointTag.__place();
  }

  /* A bar under the last answer: what Lantern reads in it, and the follow-ups
   * that fit — offered where the user just finished reading rather than behind
   * a tab they have to remember exists. */
  function drawBar() {
    clearBar();
    if (!ctx) return;
    const el = ctx.lastAnswerEl && ctx.lastAnswerEl();
    if (!el || !ctx.answer || !ctx.answer.present) return;

    answerMark = mark(el, 'answer-lit');

    const bar = document.createElement('div');
    bar.setAttribute(INPAGE, 'bar');
    bar.setAttribute('data-ln', '1');
    /* Lantern's own content, sitting in the middle of someone else's
     * conversation. Named and given a landmark role so a screen reader
     * announces whose it is and can skip past it, rather than reading it as
     * part of ChatGPT's answer. */
    bar.setAttribute('role', 'complementary');
    bar.setAttribute('aria-label', (ctx.i18n && ctx.i18n.brand) || 'Lantern');

    const lead = document.createElement('div');
    lead.className = 'ln-bar-lead';
    lead.textContent = ctx.i18n.pageBarLead;
    bar.appendChild(lead);

    if (ctx.warn) {
      const chip = document.createElement('span');
      chip.className = 'ln-read ln-warn';
      chip.textContent = '⚠ ' + ctx.warn;
      bar.appendChild(chip);
    }
    (ctx.reads || []).filter(r => r !== ctx.warn).slice(0, 3).forEach(text => {
      const chip = document.createElement('span');
      chip.className = 'ln-read';
      chip.textContent = text;
      bar.appendChild(chip);
    });

    if ((ctx.reads || []).length) {
      const sep = document.createElement('div');
      sep.className = 'ln-bar-sep';
      bar.appendChild(sep);
    }

    // Answering ChatGPT's own questions outranks everything else on offer.
    if (ctx.questionCount) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ln-strong';
      b.textContent = ctx.i18n.pageAnswerQuestions(ctx.questionCount);
      b.addEventListener('click', () => ctx.onQuestions());
      bar.appendChild(b);
    } else {
      (ctx.followUps || []).slice(0, 3).forEach((f, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        if (i === 0) b.className = 'ln-strong';
        b.textContent = f.label;
        b.title = f.why || '';
        b.addEventListener('click', () => ctx.onFollow(f.index));
        bar.appendChild(b);
      });
    }

    if (ctx.hasCode) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = ctx.i18n.pageGrab;
      b.addEventListener('click', () => ctx.onGrab());
      bar.appendChild(b);
    }

    /* As a SIBLING, never inside the message. Lantern reads the last answer
     * with innerText; a bar appended inside it would feed Lantern's own
     * words back in as ChatGPT's — which showed up as the question helper
     * offering to answer Lantern's own button labels. */
    try {
      if (el.parentNode) el.parentNode.insertBefore(bar, el.nextSibling);
      else el.appendChild(bar);
      barEl = bar;
    } catch (e) { /* nothing to attach to */ }
  }

  function enable(context) {
    ctx = context;
    on = true;
    style();
    if (ctx.makeRoom) push(ctx.inset || 0);
    lightComposer();
    drawPoint();
    drawBar();
    window.addEventListener('resize', reposition, true);
    window.addEventListener('scroll', reposition, true);
  }

  function refresh(context) {
    if (!on) return;
    ctx = context;
    if (ctx.makeRoom) push(ctx.inset || 0);
    else unpush();
    lightComposer();
    drawPoint();
    drawBar();
  }

  function disable() {
    on = false;
    window.removeEventListener('resize', reposition, true);
    window.removeEventListener('scroll', reposition, true);
    clearBar();
    clearComposer();
    clearPoint();
    unpush();
    removeOwned(styleEl);
    styleEl = null;
    ctx = null;
  }

  window.LN_INPAGE = { enable: enable, refresh: refresh, disable: disable, isOn: () => on };
})();
