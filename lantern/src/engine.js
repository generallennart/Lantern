/* Lantern — the local prompt engine.
 *
 * No network, no model call, no randomness. Given a rough request it:
 *   1. guesses the language          detectLanguage()
 *   2. guesses the kind of task      detectArchetype()
 *   3. guesses what the user wants back  detectGoal()
 *   4. judges how under-specified it is  assess()
 *   5. decides whether a template is enough or a live model is worth a message
 *                                    route()
 *   6. assembles the prompt          buildPrompt() / buildMetaPrompt()
 *
 * Everything is deterministic and inspectable: the same input always yields the
 * same prompt and the same routing verdict, and every verdict carries its
 * reasons so the interface can explain itself.
 */

(function () {
  'use strict';

  /* The German list was missing most of the commonest German words, which is
   * how "was muss in eine grundschuldbestellung rein" came out as English: one
   * German marker (eine) against one English one (in), a tie, and the tie goes
   * to the fallback. A German office worker then gets an English prompt built
   * for a German document.
   *
   * What is added here is only words with no English homograph. `man`, `hat`,
   * `war`, `so`, `an`, `in` and `die` are all English words too and are left
   * out on purpose — a marker that scores for both sides is not a marker, and
   * on a short sentence it is the difference between a tie and a decision. */
  const DE_MARK = /\b(der|die|das|und|ich|ein|eine|einen|einem|einer|eines|nicht|für|mit|auf|ist|wie|kann|soll|sollen|können|muss|müssen|mir|mich|mein|meine|von|zu|zum|zur|dem|den|des|beim|vom|bei|nach|um|damit|bitte|brauche|braucht|möchte|machen|mach|schreib|schreibe|fasse|fass|zusammenfasse|zusammenfassen|übersetze|übersetzen|ubersetze|ubersetzen|prüfe|pruefe|bearbeite|korrigiere|über|dass|wir|sie|es|im|am|aber|oder|noch|schon|sehr|auch|nur|was|wer|wo|warum|wieso|weshalb|wenn|dann|hier|sich|kein|keine|alle|jede|jeden|wird|werden|habe|hab|du|dir|dein|deine|etwas|nichts|wegen|ohne|durch|vor|unter|zwischen|welche|welches|welchen|gibt|geht|als|mehr)\b/gi;
  const EN_MARK = /\b(the|and|i|a|an|for|with|on|is|how|can|should|me|my|of|to|please|need|want|make|write|translate|summarize|summarise|review|rewrite|edit|fix|debug|compare|give|list|about|that|we|you|it|in|at|but|or|still|already|very|also|just|this)\b/gi;
  const DE_STRONG = /\b(?:überprüf\w*|ueberpruef\w*|reparier\w*|hilfe|danke)\b/i;

  /* A hosted rules file OVERLAYS the bundled one; it does not replace it.
   *
   * This was a wholesale replacement, and that could not have worked: ten
   * fields in rules.js are functions — `clarify`, and the four `extractLines`
   * builders per language — and JSON cannot carry a function. Any realistic
   * hosted file would therefore have arrived missing them, and the first prompt
   * built afterwards would have thrown on `R.clarify[lang](...)`. The update
   * channel was a loaded gun pointed at the panel.
   *
   * Merging fixes it and is also the better semantics: a hosted file can say
  * only what it wants to change. Objects merge, record lists keyed by id
  * overlay their matching bundled entries, and compatible value lists replace
  * wholesale. Anything the file does not mention — or gets structurally
  * wrong — keeps the bundled value, functions included. */
  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function safeKey(key) {
    return key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
  }

  function mergeList(base, over) {
    if (!Array.isArray(base) || !Array.isArray(over)) return base;
    const records = (list) => list.every(item => isObject(item) &&
      typeof item.id === 'string' && item.id.length > 0);
    if (records(base)) {
      // Required records such as archetypes and goals may be updated, never
      // removed or replaced by a partial object from a JSON file.
      if (!over.length || !records(over)) return base;
      const changes = Object.create(null);
      over.forEach(item => { changes[item.id] = item; });
      return base.map(item => Object.prototype.hasOwnProperty.call(changes, item.id)
        ? mergeRules(item, changes[item.id]) : item);
    }

    // An empty bundled list has no schema to infer. Leaving it alone is safer
    // than letting a malformed update change an optional list's value type.
    if (!base.length) return base;
    const sample = base[0];
    if (!over.every(item => typeof item === typeof sample &&
      (typeof item !== 'object' || item === null))) return base;
    return over;
  }

  function mergeRules(base, over) {
    if (!isObject(over) || !isObject(base)) return base;
    var out = {};
    Object.keys(base).forEach(function (k) {
      if (safeKey(k)) out[k] = base[k];
    });
    Object.keys(over).forEach(function (k) {
      if (!safeKey(k)) return;
      var b = base[k], o = over[k];
      if (Array.isArray(o) && Array.isArray(b)) {
        out[k] = mergeList(b, o);
      } else if (isObject(o) && isObject(b)) {
        out[k] = mergeRules(b, o);
      } else if (typeof b === 'function') {
        return; // JSON cannot safely replace executable bundled behavior.
      } else if (b === null && typeof o === 'string') {
        // Optional text entries start as null and may be supplied by an update.
        out[k] = o;
      } else if (o !== undefined && o !== null && typeof o === typeof b) {
        out[k] = o;
      }
    });
    return out;
  }

  var _merged = null, _mergedFrom = null;
  function rules() {
    var over = window.LN_RULES_OVERRIDE;
    if (!over || !over.archetypes) return window.LN_RULES;
    // Merging on every call would be wasteful; it is called constantly.
    if (_mergedFrom !== over) { _merged = mergeRules(window.LN_RULES, over); _mergedFrom = over; }
    return _merged;
  }

  function lang2(l) { return l === 'de' ? 'de' : 'en'; }
  function words(t) { return String(t || '').trim().split(/\s+/).filter(Boolean); }

  /* --------------------------------------------------------------- matching */

  /* A keyword counts only where it begins at a word start. Without this,
   * "funktion" fires inside "funktioniert" and an explain request is mistaken
   * for a coding request. Suffixes still match, which is what German needs
   * ("schreib" -> "schreibe", "schreibst"). */
  const WORD_CHAR = /[a-zäöüß0-9]/;
  function kwHit(padded, kw) {
    let i = padded.indexOf(kw);
    while (i !== -1) {
      if (i === 0 || !WORD_CHAR.test(padded[i - 1])) return true;
      i = padded.indexOf(kw, i + 1);
    }
    return false;
  }

  /* Whole-word match, both ends. Used for the vagueness vocabulary, where
   * prefix matching would fire "halt" inside "Inhalt" and "gut" inside
   * "Gutachten". */
  function wordHit(padded, w) {
    let i = padded.indexOf(w);
    while (i !== -1) {
      const before = i === 0 ? ' ' : padded[i - 1];
      const after = padded[i + w.length] === undefined ? ' ' : padded[i + w.length];
      if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return true;
      i = padded.indexOf(w, i + 1);
    }
    return false;
  }

  function scoreKeywords(padded, list) {
    let score = 0;
    let longest = 0;
    for (const kw of (list || [])) {
      if (kwHit(padded, kw)) {
        score += kw.length >= 6 ? 2 : 1;
        if (kw.length > longest) longest = kw.length;
      }
    }
    return { score: score, longest: longest };
  }

  /* ------------------------------------------------------------- detection */

  function detectLanguage(text, fallback) {
    const t = taskSurface(text).toLowerCase();
    const short = t.trim();
    if (!short) return lang2(fallback);
    if (/[äöüß]/.test(short) || DE_STRONG.test(short)) return 'de';
    if (short.length < 8) return lang2(fallback);
    const de = (t.match(DE_MARK) || []).length;
    const en = (t.match(EN_MARK) || []).length;
    if (de === en) return lang2(fallback);
    return de > en ? 'de' : 'en';
  }

  /* Returns the winner plus the runner-up, because the *margin* between them is
   * what tells the router whether the classification can be trusted. */
  function rankArchetypes(text) {
    const R = rules();
    const surface = taskSurface(text);
    const padded = ' ' + surface.toLowerCase() + ' ';
    const ranked = [];
    for (const a of R.archetypes) {
      if (!(a.keywords && a.keywords.length) && !(a.strong && a.strong.length)) continue;
      const r = scoreKeywords(padded, a.keywords);
      // Words that name the deliverable count for far more than words that
      // merely describe it.
      const st = scoreKeywords(padded, a.strong);
      const score = r.score + st.score * 2;
      const longest = Math.max(r.longest, st.longest ? st.longest + 6 : 0);
      if (score > 0) ranked.push({ id: a.id, score: score, longest: longest });
    }
    /* German compounds. A word-boundary match cannot see the „plan" inside
     * „Einarbeitungsplan", so the deliverable nouns are also matched as
     * endings — on a real compound only, and worth one ordinary hit. */
    const endings = R.compoundEndings || {};
    const wordList = surface.toLowerCase().match(/[a-zäöüß]{6,}/g) || [];
    Object.keys(endings).forEach(end => {
      const hit = wordList.some(w => w.length >= end.length + 4 && w.slice(-end.length) === end);
      if (!hit) return;
      const id = endings[end];
      const found = ranked.find(r => r.id === id);
      if (found) { found.score += 2; found.longest = Math.max(found.longest, end.length); }
      else ranked.push({ id: id, score: 2, longest: end.length });
    });

    // Ties broken by the longest single keyword matched: "vor- und nachteile"
    // is far stronger evidence than two three-letter hits.
    ranked.sort((x, y) => (y.score - x.score) || (y.longest - x.longest) || x.id.localeCompare(y.id));
    return ranked;
  }

  /* Goal from the wording alone, with no archetype fallback — so it can be used
   * to break archetype ties without the two detectors depending on each other. */
  function goalFromKeywords(text) {
    const R = rules();
    const padded = ' ' + taskSurface(text).toLowerCase() + ' ';
    let best = null, bestScore = 0, bestLongest = 0;
    for (const g of R.goals) {
      const r = scoreKeywords(padded, g.keywords);
      if (r.score > bestScore || (r.score === bestScore && r.score > 0 && r.longest > bestLongest)) {
        best = g.id; bestScore = r.score; bestLongest = r.longest;
      }
    }
    return best;
  }

  /* What the user wants back is stronger evidence than one generic keyword.
   *
   * "Look at my cover letter and tell me what is weak about it" matches nothing
   * in the analyse vocabulary but matches 'what is' in the explain vocabulary —
   * and would come back with the role of a patient explainer rather than a
   * reviewer. Wanting feedback settles it, whether or not analyse scored.
   *
   * Only two mappings are safe enough to apply this way. Wanting instructions
   * does NOT imply a planning task: most "how do I…" questions are small
   * how-tos, and routing them through the planner's machinery (effort
   * estimates, dependencies, likely obstacles) makes them worse, not better. */
  const GOAL_AFFINITY = { feedback: 'analyze' };
  const OPTION_COMPARISON = /^\s*(?:compare|vergleiche?)\b/i;
  const COMPARISON_MATERIAL = /\b(?:this|these|the following|my|our|attached|diese[mnrs]?|meine[mnrs]?|den folgenden)\b/i;

  function isOptionComparison(text) {
    const value = String(text || '');
    return OPTION_COMPARISON.test(value) && !COMPARISON_MATERIAL.test(value);
  }

  function detectArchetype(text) {
    if (isOptionComparison(text)) return 'decide';
    const ranked = rankArchetypes(text);
    const pref = GOAL_AFFINITY[goalFromKeywords(text)];
    if (!ranked.length) return pref || 'general';
    if (!pref || ranked[0].id === pref) return ranked[0].id;

    // ...but only against a leader that is itself generic. Whether the leader
    // rests on a short common phrase or on a distinctive one is the difference
    // between "what is weak about my cv" (generic 'what is' — the goal should
    // win) and "what was the word, something like compatulate" (distinctive
    // 'something like' — the goal must not steal it from `recall`).
    const GENERIC = 8;
    if (ranked[0].longest >= GENERIC) return ranked[0].id;

    const prefEntry = ranked.find(r => r.id === pref);
    if (prefEntry && (ranked[0].score - prefEntry.score) <= 1) return pref;
    if (!prefEntry && ranked[0].score <= 2) return pref;
    return ranked[0].id;
  }

  /* An imperative at the very front is the plainest statement of intent a short
   * request carries, and no keyword list holds every verb.
   *
   * „Make a mtg deck focused on Dina" matched nothing at all, fell through to
   * the default goal — an answer to a question — and was therefore treated as
   * a request that needed no facts from the user. The model was then told to
   * assume and carry on. It chose the format, the budget and the power level.
   * One regex in front of the fallback is the whole fix; it only ever runs
   * when the keyword lists found nothing, so it cannot overrule them. */
  const MAKE_FIRST = /^\s*(?:(?:please|bitte)\s+)?(?:mach|mache|bau|baue|erstell|erstelle|entwirf|entwickle|schreib|schreibe|formulier|formuliere|plane|zeichne|make|build|create|design|draft|write|compose|plan|generate)\b/i;

  function detectGoal(text, archetypeId) {
    const R = rules();
    if (/\?\s*$/.test(String(text || ''))) return 'answer';
    if (MAKE_FIRST.test(String(text || ''))) return 'artifact';
    const kw = goalFromKeywords(text);
    if (kw) return kw;
    return R.goalDefaults[archetypeId] || R.goalDefaults.general || 'answer';
  }

  function archetypeById(id) {
    const R = rules();
    return R.archetypes.find(a => a.id === id) || R.archetypes.find(a => a.id === 'general');
  }

  /* Which family of prompt the model in use wants. */
  function tierOf(modelName) {
    const R = rules();
    const n = String(modelName || '').toLowerCase();
    if (!n) return 'balanced';
    for (const t of (R.modelTiers || [])) {
      if ((t.names || []).some(x => n.indexOf(x) !== -1)) return t.id;
    }
    return 'balanced';
  }

  function goalById(id) {
    const R = rules();
    return R.goals.find(g => g.id === id) || R.goals[0];
  }

  /* ------------------------------------------------------------ vagueness */

  /* Archetypes where "who is this for?" genuinely changes the output. For a
   * coding or planning request it usually does not, so its absence should not
   * count as missing information. */
  const AUDIENCE_MATTERS = ['write', 'analyze', 'learn', 'summarize', 'image'];

  /* Which gaps actually hurt depends on what the user wants back.
   *
   * "Write me an email to my landlord" cannot be answered without facts, so its
   * missing audience, format and background are real gaps and asking first is
   * the right move. "How do I insert a table of contents in Word" is complete
   * as it stands — the steps are the same whoever is asking — and interrogating
   * the user before answering is pure friction. The earlier version treated
   * both the same and pestered people asking simple questions. */
  const GAP_SENSITIVITY = {
    artifact: { length: 1, audience: true, format: true, context: true, example: true },
    feedback: { length: 1, audience: true, format: false, context: true, example: false },
    ideas: { length: 1, audience: false, format: true, context: false, example: false },
    answer: { length: 0.5, audience: false, format: false, context: false, example: false },
    guidance: { length: 0.5, audience: false, format: false, context: false, example: false }
  };

  function sensitivity(goal) { return GAP_SENSITIVITY[goal] || GAP_SENSITIVITY.artifact; }

  /* ------------------------------------------------------------ extraction */

  function rx(pattern, flags) {
    try { return pattern ? new RegExp(pattern, flags || 'i') : null; } catch (e) { return null; }
  }

  /* Runs of text ending in a question mark. Used both for "the user asked
   * several things at once" and for "ChatGPT asked the user something back".
   *
   * Written as a single pass on purpose. The obvious regex — /[^.?!\n]{6,}\?/g
   * — is quadratic on text containing no question mark at all: from every
   * starting position it scans to the end looking for one, fails, and
   * backtracks. A 20,000-word paste took a full second here, and extract(),
   * assess() and analyzeAnswer() all inherited that cost. */
  function splitQuestions(text) {
    const t = String(text || '');
    const out = [];
    let start = 0;
    for (let i = 0; i < t.length; i++) {
      const c = t.charCodeAt(i);
      // . ! ? or newline
      if (c === 46 || c === 33 || c === 63 || c === 10) {
        if (c === 63) {
          const seg = t.slice(start, i).trim();
          if (seg.length >= 6) out.push(seg + '?');
        }
        start = i + 1;
      }
    }
    return out;
  }

  /* A short instruction followed by a big block of stuff is the commonest shape
   * of "here is my material, do something with it" — a deck list, an inventory,
   * a pasted letter, a spreadsheet dump. Left whole, the instruction drowns:
   * "recommend cuts in this deck" disappears into four hundred words of card
   * names, and the assembled prompt puts all of it under TASK. */
  function splitMaterial(text) {
    const t = String(text || '');
    const all = words(t);
    if (all.length < 80) return null;
    const cut = (i) => ({ task: all.slice(0, i).join(' '), material: all.slice(i).join(' ') });

    // A real sentence boundary near the start.
    for (let i = 0; i < all.length && i <= 45; i++) {
      if (/[.!?]$/.test(all[i])) {
        const idx = i + 1;
        return (idx >= 4 && all.length - idx >= 40) ? cut(idx) : null;
      }
    }
    // Otherwise the point where prose turns into a list of "N Something".
    for (let i = 3; i < all.length - 1 && i <= 45; i++) {
      if (/^\d+$/.test(all[i]) && /^[A-ZÄÖÜ]/.test(all[i + 1] || '')) {
        return (all.length - i >= 40) ? cut(i) : null;
      }
    }
    return null;
  }

  /* The same request can already contain every word the model needs, but in
   * an order that buries its task under a long source. This preserves both
   * pieces exactly and changes only their order; it deliberately recognises
   * only a short source-processing instruction followed by substantial text. */
  function splitLeadingTaskMaterial(text) {
    const original = String(text || '').trim();
    if (words(original).length < 80) return null;
    const token = /\S+/g;
    let match, count = 0;
    while ((match = token.exec(original)) && count++ < 45) {
      const tail = match[0];
      const after = original.slice(token.lastIndex);
      const sentenceEnd = /[.!?]["')\]]*$/.test(tail);
      const labelEnd = /[:\uff1a]["')\]]*$/.test(tail) && /^\s*\n\s*\n/.test(after);
      if (!sentenceEnd && !labelEnd) continue;
      const task = original.slice(0, token.lastIndex).trim();
      const material = after.trim();
      if (words(task).length < 4 || words(material).length < 40) return null;
      if (!LEADING_MATERIAL_TASK.test(task)) return null;
      return { task: task, material: material };
    }
    return null;
  }

  /* Read structure out of the user's own wording.
   *
   * People routinely write "in 3 sätzen an meine chefin, sachlich" and then get
   * asked for length, audience and tone anyway. Anything liftable straight from
   * the text is one fewer question and a visibly better prompt for no effort.
   * Precision is deliberately favoured over recall: a wrong detection costs the
   * user more than a missed one, because they have to notice and undo it. */
  function extract(text, lang) {
    const X = rules().extract;
    const L = lang2(lang);
    const t = String(text || '');
    const out = {
      length: null, audience: null, tone: null, register: null, ranking: null,
      rankingProse: false, urls: [], continues: false, figures: [],
      questions: [], material: false, promptish: false, iterating: false
    };
    if (!X || !t) return out;

    const lm = t.match(rx(X.length && X.length[L], 'i') || /$^/);
    if (lm) out.length = lm[0].trim();

    const tm = t.match(rx(X.tone && X.tone[L], 'i') || /$^/);
    if (tm) out.tone = tm[0].trim();

    // Every candidate is tried, not just the first: "for a formal audience, to
    // my manager" has to get past "a formal" to reach "my manager". The noun is
    // checked against a list before it is trusted, so "für die Heizung" cannot
    // become an audience.
    const audRe = rx(X.audience && X.audience[L], 'gi');
    if (audRe) {
      let am;
      while ((am = audRe.exec(t))) {
        const noun = (am[1] || '').toLowerCase();
        if ((X.audienceNouns || []).some(n => noun === n || noun.indexOf(n) === 0)) {
          // Drop the leading preposition so the label reads "meinen Vermieter"
          // rather than "an meinen Vermieter".
          out.audience = am[0].replace(/^(?:für|an|for|to)\s+/i, '').trim();
          break;
        }
      }
    }

    const rm = t.match(rx(X.register && X.register[L], 'i') || /$^/);
    if (rm) out.register = rm[0].trim();

    const km = t.match(rx(X.ranking && X.ranking[L], 'i') || /$^/);
    if (km) {
      out.ranking = km[0].trim();
      out.rankingProse = !!rx(X.rankingNegative, 'i').test(out.ranking);
    }

    out.urls = (t.match(rx(X.urls, 'gi') || /$^/) || []).slice(0, 4);
    out.continues = !!(rx(X.continues && X.continues[L], 'i') || /$^/).test(t);

    const figRe = rx(X.figures, 'gi');
    if (figRe) out.figures = (t.match(figRe) || []).slice(0, 6).map(s => s.trim());

    const qs = splitQuestions(t);
    if (qs.length >= 2) out.questions = qs;

    // Upper bound matters as much as the lower one: {60,} with no closing
    // quote in sight backtracks from every position in the string.
    out.material = hasEmbeddedMaterial(t);

    const pRe = rx(X.promptish && X.promptish[L], 'i');
    out.promptish = !!(pRe && pRe.test(taskSurface(t)));

    const iRe = rx(X.iterating && X.iterating[L], 'i');
    out.iterating = !!(iRe && iRe.test(t));

    return out;
  }

  /* What counts as supplied, once extraction has had its say. Everything that
   * judges completeness — the checklist, the ask-first score, the router's
   * credit for detail — goes through here, so a user who wrote the audience
   * into their sentence is never asked for it again. */
  function gaps(s) {
    const x = (s && s._x) || extract(s && s.text, s && s.lang);
    const own = (k) => (s && s[k] && String(s[k]).trim()) ? String(s[k]).trim() : '';
    /* Collected parts are material, and material is context. Without this a
     * user who has just pasted four pages in pieces is told their request is
     * under-specified and asked three questions about it. */
    const hasParts = !!(s && s.parts && s.parts.filter(p => String(p || '').trim()).length);
    return {
      x: x,
      audience: own('audience') || x.audience || '',
      format: own('format') || x.length || '',
      context: own('context') || ((x.material || hasParts) ? 'material' : ''),
      example: own('example')
    };
  }

  /* What a good prompt for THIS request would still need. Drives the live
   * checklist in the panel: the point is not to nag but to show a beginner,
   * concretely and in context, what the missing pieces of a prompt even are.
   * Only pieces that matter for the current goal are listed. */
  function checklist(s) {
    const sens = sensitivity(s && s.goal);
    const g = gaps(s);
    const items = [{ key: 'task', ok: words(s && s.text).length >= 6 }];
    if (sens.audience && AUDIENCE_MATTERS.indexOf(s.archetype) !== -1) {
      items.push({ key: 'audience', ok: !!g.audience, auto: !!(g.audience && !s.audience) });
    }
    if (sens.format) items.push({ key: 'format', ok: !!g.format, auto: !!(g.format && !s.format) });
    if (sens.context) items.push({ key: 'context', ok: !!g.context, auto: !!(g.context && !s.context) });
    if (sens.example) items.push({ key: 'example', ok: !!g.example });
    return items;
  }

  /* --------------------------------------------------- reading the last reply */

  /* Normalise once, so that a phrase list written with straight apostrophes
   * still matches text a model typed with curly ones.
   *
   * This is not cosmetic. Assistants routinely write "You're absolutely right"
   * with U+2019, and every entry in the flattery list is written with U+0027.
   * Without this line the single best-attested signal in the whole file would
   * silently never fire, and nothing would look broken. */
  function normalize(t) {
    return String(t || '')
      .replace(/[\u2018\u2019\u02bc\u2032]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u00a0\u2009\u202f]/g, ' ');
  }

  /* Which phrases from `list` occur in `hay`, as whole words.
   *
   * The boundary check is the point: a plain indexOf for "got it" also matches
   * "forgot it", and "you're right" inside "you're rightly cautious" is not the
   * failure being looked for. Only the character *before* is checked — the
   * lists end in complete words, and requiring a boundary after would miss
   * "great question," and "you're absolutely right!". */
  var LETTER = /[a-z\u00e0-\u00f6\u00f8-\u00ff]/;
  function phraseMatches(hay, list) {
    const out = [];
    const h = ' ' + normalize(hay).toLowerCase().replace(/\s+/g, ' ') + ' ';
    (list || []).forEach(function (raw) {
      const needle = normalize(raw).toLowerCase();
      if (!needle) return;
      let i = h.indexOf(needle);
      while (i !== -1) {
        if (!LETTER.test(h.charAt(i - 1))) { out.push({ phrase: raw, at: i, end: i + needle.length }); return; }
        i = h.indexOf(needle, i + 1);
      }
    });
    return out;
  }
  function phraseHits(hay, list) { return phraseMatches(hay, list).map(m => m.phrase); }

  /* How many separate places in the text matched — not how many list entries
   * did.
   *
   * The lists overlap by design: "please consult" and "consult a professional"
   * are both worth having, and both match the same six words. Counting entries
   * made one polite sentence look like two complaints and pushed a perfectly
   * good answer over the "this is a lecture" threshold. Counting regions is
   * what the thresholds were always meant to mean. */
  function distinctHits(matches) {
    const sorted = (matches || []).slice().sort((a, b) => a.at - b.at);
    let count = 0, reach = -1;
    sorted.forEach(function (m) {
      if (m.at > reach) { count++; reach = m.end; }
      else if (m.end > reach) reach = m.end;
    });
    return count;
  }

  /* Did the reply stop, or was it cut off?
   *
   * Worth being conservative about in both directions. Telling someone their
   * answer was truncated when it was not sends them a pointless message; the
   * reverse leaves them reading half an answer as if it were the whole one.
   *
   * The reason this is a text-shape test rather than a UI test is Gemini:
   * users report answers ending mid-sentence while the API reports normal
   * completion, so there may be no marker anywhere to read. The shape of the
   * last sentence is the only evidence that exists. */
  function looksTruncated(t, n, R, SH) {
    if (n < (SH.truncateMinWords != null ? SH.truncateMinWords : 25)) return false;

    // An odd number of code fences means one was opened and never closed.
    if (((t.match(/```/g) || []).length) % 2 === 1) return true;

    let tail = t.replace(/\s+$/, '');
    if (/```$/.test(tail)) return false;             // a properly closed block
    tail = tail.replace(/[*_`~\s]+$/, '');           // trailing emphasis marks
    if (!tail) return false;

    const last = tail.slice(-1);
    if (/[.!?:;"')\]}\u2026\u00bb\u201c\u3002\uff01\uff1f|]/.test(last)) return false;

    // A trailing comma or dash is a sentence that was going somewhere.
    if (/[,\u2013\u2014-]$/.test(tail)) return true;

    // So is a final word that cannot end a sentence.
    const m = normalize(tail).toLowerCase().match(/[a-z\u00e0-\u00f6\u00f8-\u00ff]+$/);
    if (m && (R.danglingWords || []).indexOf(m[0]) !== -1) return true;

    /* Otherwise only prose counts. A list item ending "- Berlin" has no full
     * stop and never needed one, so a short final line proves nothing. */
    const lines = tail.split('\n');
    const lastLine = lines[lines.length - 1] || '';
    return words(lastLine).length >= (SH.danglingLineWords != null ? SH.danglingLineWords : 8);
  }

  /* What is actually in the last answer. Drives which follow-ups are offered,
   * so that they are about this reply rather than a generic menu.
   *
   * `opts.provider` changes nothing about what is detected — only what the
   * detection is worth later, in rankFollowUps. Detecting the same things
   * everywhere means one set of thresholds to get right instead of three, and
   * it means a signal does not vanish when a vendor's reputation changes. */
  function analyzeAnswer(text, opts) {
    const R = rules();
    const AR = R.answerRules || {};
    const SH = AR.shared || {};
    const t = String(text || '');
    const n = words(t).length;
    const a = { present: n >= 10, words: n, signals: [], questions: [], numberedQuestions: [], memoryEcho: [] };
    if (!a.present) return a;

    const low = normalize(t).toLowerCase();
    const open = low.slice(0, SH.openWindow != null ? SH.openWindow : 240);
    a.hasList = /^\s*(?:[-*•]|\d+[.)])\s+/m.test(t);
    a.hasCode = /```/.test(t) || /^ {4,}\S/m.test(t);
    a.hasTable = /\|[^\n]*\|/.test(t);
    a.hasNumbers = (t.match(/\d/g) || []).length >= 5;
    a.hasSources = /https?:\/\/|\[\d+\]|quelle|source/i.test(t);
    a.hedgeCount = (R.hedges || []).filter(h => low.indexOf(h) !== -1).length;

    a.questions = splitQuestions(t);
    a.numberedQuestions = (t.match(/^[ \t]*\d+[.)][^\n]{0,300}\?[ \t]*$/gm) || [])
      .map(q => q.replace(/^[ \t]*\d+[.)][ \t]*/, '').trim());
    // Lantern's own prompts ask ChatGPT to number its questions, so numbered
    // ones are the strong signal; a short reply that is mostly questions counts too.
    a.askedQuestions = a.numberedQuestions.length >= 2 || (a.questions.length >= 2 && n < 220);

    const num = (k, d) => (SH[k] != null ? SH[k] : d);

    if (n > num('longWords', 350)) a.signals.push('long');
    if (n < num('shortWords', 90)) a.signals.push('short');
    if (a.hedgeCount >= num('hedgeMin', 2)) a.signals.push('hedging');
    if (a.hasList) a.signals.push('hasList');
    if (a.hasCode) a.signals.push('hasCode');
    // A source request only fits an answer making checkable numeric claims.
    // On ordinary prose, "no sources" is not a diagnosis; it is clutter.
    if (!a.hasSources && a.hasNumbers) a.signals.push('noSources');

    /* --------------------------------------------- how this answer went wrong
     *
     * Everything above is a property of the text. Everything below is a named
     * failure mode, each one taken from something a vendor published about its
     * own model or from a measurement someone else published about all of
     * them. The sources are written out beside the phrase lists in rules.js,
     * where they can be checked and, when they stop being true, replaced. */

    /* Agreeing with the user instead of answering. Opening window only — the
     * failure is a first move, and "you're right that this is subtle" halfway
     * through a good answer is not it. */
    const syco = phraseMatches(open, R.sycophancyPhrases);
    a.sycophancyHits = syco.map(m => m.phrase);
    if (syco.length) a.signals.push('sycophancy');

    /* Throat-clearing before the content. Same window, same reason. */
    const pre = phraseMatches(open, R.preamblePhrases);
    a.preambleHits = pre.map(m => m.phrase);
    if (pre.length) a.signals.push('preamble');

    /* Declining to land anywhere. Two separate places, or one in an answer
     * short enough that the refusal is most of what is there. */
    const abst = phraseMatches(low, R.abstainPhrases);
    a.abstainHits = abst.map(m => m.phrase);
    a.abstainCount = distinctHits(abst);
    a.abstained = a.abstainCount >= num('abstainMin', 2) ||
      (a.abstainCount >= 1 && n < num('abstainShortWords', 250));
    if (a.abstained) a.signals.push('abstained');

    /* Warning instead of answering — Anthropic's "wet blanket". */
    const mor = phraseMatches(low, R.moralizePhrases);
    a.moralizeHits = mor.map(m => m.phrase);
    a.moralizeCount = distinctHits(mor);
    a.moralizing = a.moralizeCount >= num('moralizeMin', 2) ||
      (a.moralizeCount >= 1 && n < num('moralizeShortWords', 150));
    if (a.moralizing) a.signals.push('moralizing');

    /* Sure of itself with nothing to point at. Not the same as being wrong,
     * and not detectable as being wrong — what is detectable is an answer that
     * makes factual-looking claims, hedges nowhere, and cites nothing. */
    a.certain = a.hedgeCount === 0 && a.hasNumbers && !a.hasSources &&
      n >= num('certainMin', 60);
    if (a.certain) a.signals.push('certain');

    /* Almost all bullets. Both conditions, because six bullets inside a long
     * answer is a list and a long answer, not a failure to write.
     *
     * The share is measured in WORDS, not lines. Counting lines made the test
     * depend on where the paragraphs happened to break: six bullets beside two
     * long unwrapped paragraphs read as 75% bullets, because each paragraph is
     * one line. Words are what the reader actually gets. */
    const contentLines = t.split('\n').filter(l => l.trim());
    const isBullet = l => /^\s*(?:[-*•]|\d+[.)])\s+/.test(l);
    a.bulletLines = contentLines.filter(isBullet).length;
    const bulletWords = contentLines.filter(isBullet)
      .reduce((sum, l) => sum + words(l).length, 0);
    a.bulletShare = n > 0 ? bulletWords / n : 0;
    a.bulletHeavy = a.bulletLines >= num('bulletMin', 6) &&
      a.bulletShare >= num('bulletRatio', 0.5);
    if (a.bulletHeavy) a.signals.push('bulletHeavy');

    /* Stopped mid-sentence. */
    a.truncated = looksTruncated(t, n, R, SH);
    if (a.truncated) a.signals.push('truncated');

    /* Memory speaking rather than context. A claim of prior knowledge is only
     * suspicious early: by the third or fourth thing the user has said, "as you
     * mentioned" usually refers to something they did mention. */
    a.memoryEcho = (R.memoryEchoes || []).filter(p => low.indexOf(p) !== -1);
    const turns = (opts && typeof opts.turns === 'number') ? opts.turns : 0;
    a.memorySuspect = a.memoryEcho.length > 0 && turns <= 2;
    if (a.memorySuspect) a.signals.push('memory');

    return a;
  }

  /* What one matched signal is worth on this assistant.
   *
   * Three layers, most specific first: the per-assistant table, the shared
   * fallback, then a flat default. A weight of exactly 0 is a real answer and
   * has to survive the lookup — `weights[x] || 2` would quietly turn "this
   * does not matter here" into "this matters as much as anything else", which
   * is how Gemini would end up being told its deliberately terse answers are
   * too short. Hence the explicit null checks. */
  function signalWeight(pid, sig) {
    const R = rules();
    const AR = R.answerRules || {};
    const per = (pid && AR[pid] && AR[pid].weights) || {};
    if (per[sig] != null) return per[sig];
    const glob = R.signalWeights || {};
    if (glob[sig] != null) return glob[sig];
    return AR.base != null ? AR.base : 2;
  }

  /* Order the follow-ups by how much they have to do with this answer.
   * A matched signal is worth more than a matched goal, because the signal is
   * about what the assistant actually just said, not about what was asked for.
   *
   * The same signal is worth different amounts on different assistants — see
   * `answerRules` in rules.js for which, and why each number is what it is. */
  function rankFollowUps(answer, ctx) {
    const all = rules().followUps || [];
    const sig = (answer && answer.signals) || [];
    const goal = ctx && ctx.goal;
    /* Two signals are not one complaint among several — they are a reason not
     * to trust any of the others yet, so their cards sort to the front rather
     * than competing on points.
     *
     * A suspected memory leak, because if the answer was built partly out of
     * something the user never said in this chat, then every other objection
     * to it is downstream of that. And a truncated answer, because "too short"
     * and "no sources" are not defects of half an answer — you need the rest
     * before any of that means anything.
     *
     * Adding to the score would not do: scores are sums of matched signals and
     * therefore unbounded, so any number chosen here could be outvoted by a
     * card that happened to match three ordinary things at once. That is
     * exactly how a memory warning ended up second. */
    const dominant = ((rules().answerRules || {}).dominant) || ['memory', 'truncated'];
    /* Some pushes only make sense against a particular assistant's failure
     * mode. "Do not just agree" is aimed at sycophancy that doubles under
     * pushback on Claude; "mark what is uncertain" is aimed at Gemini
     * answering confidently where another model would abstain. Offering
     * either one everywhere would be noise. */
    const pid = ctx && ctx.provider;
    const list = all.filter(f => !f.only || (pid && f.only.indexOf(pid) !== -1));
    return list.map((f, i) => {
      const matched = (f.signals || []).filter(x => sig.indexOf(x) !== -1);
      const goalMatch = !!(goal && (f.goals || []).indexOf(goal) !== -1);
      const weight = matched.reduce((sum, x) => sum + signalWeight(pid, x), 0);
      /* Sort the matched signals so the heaviest one is the reason shown — and
       * never show a zero-weight one as the reason, since by definition it is
       * not why this card is here. */
      const why = matched.filter(x => signalWeight(pid, x) > 0)
        .sort((x, y) => signalWeight(pid, y) - signalWeight(pid, x))[0];
      const score = weight + (weight > 0 && goalMatch ? 1 : 0);
      return {
        index: i,
        id: f.id,
        lead: matched.some(x => dominant.indexOf(x) !== -1),
        score: score,
        why: why || (goalMatch ? 'goal' : null)
      };
    }).sort((a, b) => (b.lead - a.lead) || (b.score - a.score) || (a.index - b.index));
  }

  /* How much is still missing? Higher = vaguer. 3+ triggers ask-first.
   * Length alone is a poor signal: a short request packed with dates, figures
   * and names is more answerable than a long rambling one, so concrete detail
   * earns the score back down. */
  function assess(text, s) {
    const R = rules();
    const t = String(text || '');
    const padded = ' ' + t.toLowerCase() + ' ';
    const n = words(t).length;
    const lang = lang2(s && s.lang);
    const sens = sensitivity(s && s.goal);
    // assess() receives the text separately, but gaps() reads s.text — stitch
    // them back together or extraction runs against nothing.
    const g = gaps(Object.assign({}, s, { text: t }));
    let score = 0;

    /* Below six words there is usually nothing to work with — but "Pedant what
     * does that mean" is four words and complete. A formed question needs no
     * more from the user, so the floor only applies to requests that are short
     * AND not questions. Without this, asking for a definition was met with
     * four clarifying questions. */
    const formed = /\?/.test(t) || goalFromKeywords(t) === 'answer';
    /* Collected parts are part of the payload. "Summarise both sections" is
     * eight words and would score as a throwaway request, but with four
     * paragraphs attached it is nothing of the kind — and being asked three
     * clarifying questions right after pasting four paragraphs is the most
     * annoying possible response. */
    const partWords = (s && s.parts || []).reduce((a, p) => a + words(p).length, 0);
    const nAll = n + partWords;
    if (nAll < 6) score += (formed && sens.length <= 0.5) ? 1 : 3;
    else score += Math.round((nAll < 10 ? 2 : (nAll < 20 ? 1 : 0)) * sens.length);

    if (sens.audience && AUDIENCE_MATTERS.indexOf(s.archetype) !== -1 && !g.audience) score += 1;
    if (sens.format && !g.format) score += 1;
    if (sens.context && !g.context && n < 30) score += 1;

    // Asking for feedback on material you did not supply is the one gap that is
    // always fatal, however long the request is.
    if (s.goal === 'feedback' && !g.context && !/["„»]/.test(t)) score += 2;

    // "irgendwas mit Mauern und Festung" is not a lazy request — for someone
    // hunting a half-remembered word, the vagueness is the thing they are
    // asking about, and there is nothing more they could tell you.
    if (s.archetype !== 'recall') {
      let vagueHits = 0;
      for (const w of R.vagueWords) if (wordHit(padded, w)) vagueHits++;
      score += Math.min(vagueHits, 2);
    }

    // Credit for concrete detail: figures, dates, amounts, quoted things.
    let specifics = (t.match(/\d+/g) || []).length;
    specifics += (t.match(/["„»][^"“«]{3,200}["“«]/g) || []).length;
    // Capitalised words only count as names in English. German capitalises
    // every noun, so this would hand a bonus to any correctly typed German
    // sentence regardless of how specific it is.
    if (lang === 'en' && (t.match(/(?!^)\b[A-Z][a-z]{2,}/g) || []).length >= 2) specifics += 1;

    if (specifics >= 3) score -= 2;
    else if (specifics >= 1) score -= 1;

    if (score < 0) score = 0;
    return { score: score, vague: score >= 3 };
  }

  /* ---------------------------------------------------------------- router */

  const SPLIT_RE = /\b(und dann|und danach|außerdem|zusätzlich|des weiteren|sowie auch|and then|and after that|additionally|as well as that|on top of that)\b/gi;
  const COND_RE = /\b(wenn|falls|sofern|ansonsten|andernfalls|je nachdem|abhängig davon|if|unless|otherwise|depending on|in case)\b/gi;
  const MATERIAL_RE = /(hier ist mein|hier ist der|hier der text|anbei|im folgenden text|unten steht|here is my|here's my|below is my|following text|i pasted)/i;
  const MATERIAL_OPERATION = /\b(?:summari[sz]e|condense|shorten|review|analyse|analy[sz]e|edit|rewrite|translate|proofread|fass(?:e)?\s+.*\s+zusammen|k\u00fcrz|pr\u00fcf|bewert|\u00fcberarbeit|umschreib|\u00fcbersetz)\b/i;
  const LEADING_MATERIAL_TASK = /^\s*(?:(?:please|bitte)\s+)?(?:summari[sz]e|condense|shorten|review|analyse|analy[sz]e|edit|rewrite|translate|proofread|extract|classify|compare|list|identify|fass(?:e)?|k\u00fcrz|pr\u00fcf|bewert|\u00fcberarbeit|umschreib|\u00fcbersetz|extrahier|vergleiche|ordne)\b/i;

  function hasSeparatedMaterial(text) {
    const sections = String(text || '').split(/\n\s*\n/).map(section => section.trim()).filter(Boolean);
    if (sections.length < 2) return false;
    const introduction = sections[0];
    const remainder = sections.slice(1).join('\n\n');
    if (!MATERIAL_OPERATION.test(introduction)) return false;
    return /[:\uff1a]\s*$/.test(introduction) ||
      words(remainder).length >= Math.max(12, words(introduction).length * 2);
  }

  function hasEmbeddedMaterial(text) {
    const value = String(text || '');
    return MATERIAL_RE.test(value) || /["\u201e\u00bb][^"\u201c\u00ab]{60,400}["\u201c\u00ab]/.test(value) ||
      hasSeparatedMaterial(value) || !!splitMaterial(value);
  }

  /* Counts how many separate things are being asked for. Imperative verbs and
   * question marks each start a new "part"; joiners like "und dann" add one. */
  function countParts(text, lang) {
    const t = String(text || '');
    const joiners = (t.match(SPLIT_RE) || []).length;
    const questions = (t.match(/\?/g) || []).length;
    const bullets = (t.match(/^\s*(\d+[.)]|[-*•])\s+/gm) || []).length;
    const sentences = t.split(/(?:[!?\n]+|(?<!\d)\.(?!\d)+)/).map(s => s.trim()).filter(s => words(s).length >= 3).length;
    // A single sentence with no joiners is one part, whatever its length.
    let parts = 1 + joiners + Math.max(0, questions - 1) + Math.max(0, bullets - 1);
    if (sentences > 2) parts += sentences - 2;
    return parts;
  }

  /* German builds compounds, so raw length is a fair proxy for a specialist
   * term in both languages once the threshold is high enough. Alphanumeric
   * mixes (model numbers, error codes, API names) count too. */
  function countJargon(text) {
    let n = 0;
    for (const w of words(text)) {
      const clean = w.replace(/[^\wäöüßÄÖÜ-]/g, '');
      if (clean.length >= 14) n++;
      else if (/[a-zA-Z]/.test(clean) && /\d/.test(clean) && clean.length >= 4) n++;
    }
    return n;
  }

  /* The decision: is a template enough, or is this request worth one message?
   *
   * Local templating handles one clean task of a recognised kind. It cannot
   * take a request apart. So the score rises with everything that needs taking
   * apart — several tasks, embedded material, conditional branches, an
   * unrecognisable subject — and falls when the user has already done the
   * structuring work themselves. */
  function route(s) {
    const R = rules();
    const W = R.router.weights;
    const lang = lang2(s.lang);
    const names = R.router.reasons[lang];
    const text = String(s.text || '');
    const n = words(text).length;

    let score = 0;
    const reasons = [];
    const add = (points, key) => {
      if (!points) return;
      score += points;
      reasons.push({ key: key, points: points, label: names[key] });
    };

    const parts = countParts(text, lang);
    if (parts >= 3) add(W.manyParts, 'manyParts');
    else if (parts === 2) add(W.twoParts, 'twoParts');

    if (n > 80) add(W.veryLong, 'veryLong');
    else if (n > 40) add(W.long, 'long');
    else if (n > 25) add(W.mediumLength, 'mediumLength');

    const collected = (s && s.parts || []).filter(p => String(p || '').trim()).length;
    if (hasEmbeddedMaterial(text) || collected) add(W.material, 'material');

    if (COND_RE.test(text)) add(W.conditional, 'conditional');

    // Low confidence in the classification matters as much as ambiguity: if the
    // whole match rests on one short keyword, the template is probably picking
    // the wrong role and format, which is precisely when a live model helps.
    const ranked = rankArchetypes(text);
    if (!ranked.length) add(W.unclearKind, 'unclearKind');
    else if (ranked.length > 1 && (ranked[0].score - ranked[1].score) <= 1) add(W.ambiguousKind, 'ambiguousKind');
    else if (ranked[0].score <= 1) add(W.weakKind, 'weakKind');

    const jargon = countJargon(text);
    if (jargon >= 3) add(W.jargonHigh, 'jargonHigh');
    else if (jargon >= 1) add(W.jargonSome, 'jargonSome');

    // Detail written into the sentence counts the same as detail typed into a
    // field — the user supplied it either way.
    const g = gaps(s);
    let filled = 0;
    ['audience', 'format', 'context', 'example'].forEach(k => { if (g[k]) filled++; });
    ['include', 'avoid'].forEach(k => { if (s[k] && String(s[k]).trim()) filled++; });
    if (filled) add(Math.max(W.maxSlotCredit, W.perFilledSlot * filled), 'slots');

    // Rewriting an existing prompt is something a live model does far better
    // than a template, which can only wrap it in more scaffolding.
    if (g.x.promptish) add(W.alreadyPrompt, 'alreadyPrompt');

    if (n <= 12 && parts <= 1 && ranked.length && ranked[0].score >= 2) add(W.simple, 'simple');

    const recommend = score >= R.router.threshold ? 'model' : 'local';
    const spread = Math.abs(score - R.router.threshold);
    return {
      recommend: recommend,
      score: score,
      threshold: R.router.threshold,
      confidence: spread >= 3 ? 'high' : (spread >= 1 ? 'medium' : 'low'),
      reasons: reasons,
      // Only the reasons that pushed the verdict in the winning direction are
      // worth showing; the rest are noise to a beginner.
      topReasons: reasons
        .filter(r => (recommend === 'model' ? r.points > 0 : r.points < 0))
        .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
        .slice(0, 2)
        .map(r => r.label),
      verdict: R.router.verdict[lang][recommend]
    };
  }

  /* -------------------------------------------------------------- assembly */

  /* Strip greetings and "can you please" so the TASK line starts with substance.
   * Verbs are never stripped — "schreib mir eine Mail" must keep its verb. */
  /* Sentences whose opening words carry the whole verb. Do not touch these.
   *
   * From a real A/B that Lantern lost: „ich möchte ein ärztliches Attest aber
   * es ist zu spät und die haben zu" came out of here as „Ein ärtzliches artest
   * aber es ist zu spät und die haben zu." — the lead-in stripper took „ich
   * möchte", which was the only verb in the sentence, and left a noun phrase
   * glued to a subordinate clause. It is not a sentence any more, and the model
   * had to guess what was being asked. It guessed vaguely, which is exactly
   * what the raw request did not do.
   *
   * The stripper is right about „ich brauche eine E-Mail an meinen Vermieter",
   * where what is left still reads as the job. It is wrong the moment a second
   * clause follows, because then the opener was not filler — it was the frame
   * the rest of the sentence hangs off. So: one clause, strip; more than one,
   * leave the person's own words alone. */
  const MULTI_CLAUSE = /(^|[\s,])(aber|doch|weil|denn|obwohl|damit|sodass|falls|sobald|nachdem|w\u00e4hrend|und dann|but|because|although|so that|once|after|while)([\s,]|$)/i;

  function cleanTask(text) {
    const R = rules();
    const original = String(text || '').trim();
    let t = original;
    const leaveAlone = MULTI_CLAUSE.test(original);
    for (let round = 0; !leaveAlone && round < 6; round++) {
      const low = t.toLowerCase();
      let cut = false;
      for (const lead of R.leadIns) {
        if (low.startsWith(lead + ' ') || low.startsWith(lead + ',')) {
          const rest = t.slice(lead.length).replace(/^[\s,:.!-]+/, '');
          // Never strip a lead-in down to almost nothing.
          if (words(rest).length >= 2) { t = rest; cut = true; }
          break;
        }
      }
      if (!cut) break;
    }
    if (!t) t = original;
    // Never touch a leading URL, path or code token — capitalising it corrupts
    // it ("Https://..."), and people paste links as the first thing constantly.
    if (!/^(?:https?:\/\/|www\.|[\/~.]|[A-Za-z]:\\)/i.test(t)) {
      t = t.charAt(0).toUpperCase() + t.slice(1);
    }
    const endsInUrl = /(?:https?:\/\/|www\.)[^\s<>"']+$/i.test(t);
    if (!endsInUrl && !/[.!?:]$/.test(t)) t += '.';
    return t;
  }

  function section(out, heading, lines) {
    const body = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
    if (!body.length) return;
    if (out.length) out.push('');
    out.push(heading);
    out.push.apply(out, body);
  }

  /* ------------------------------------------------- assembling per provider
   *
   * The sections a prompt is made of are the same everywhere. The *order* they
   * go in, and how they are marked off from each other, are not — and both are
   * things the vendors have published measurements about:
   *
   *   Anthropic: "Place your long documents and inputs near the top of your
   *   prompt, above your query… Queries at the end can improve response quality
   *   by up to 30 percent."   Google says the same thing in its own words.
   *   Anthropic also recommends XML tags specifically; Google says pick XML or
   *   Markdown and never mix, and leads with Markdown.
   *
   * So blocks are collected by name and assembled at the end, rather than
   * appended in a fixed order as they are built. ChatGPT keeps exactly the
   * order and headings it had, because no equivalent claim exists for it and
   * changing it on someone else's evidence would be guessing.
   */
  function put(blocks, id, heading, lines) {
    const body = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
    if (!body.length) return;
    blocks[id] = { heading: heading, body: body };
  }

  function escapeXmlText(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function assemble(blocks, order, wrap, tags) {
    const out = [];
    (order || []).forEach(id => {
      const b = blocks[id];
      if (!b) return;
      const body = wrap === 'xml' ? b.body.map(escapeXmlText) : b.body;
      if (out.length) out.push('');
      if (wrap === 'xml' && tags && tags[id]) {
        out.push('<' + tags[id] + '>');
        out.push.apply(out, body);
        out.push('</' + tags[id] + '>');
      } else {
        out.push(b.heading);
        out.push.apply(out, body);
      }
    });
    // Anything the order does not mention still has to appear, or a rules file
    // that adds a section would silently drop it.
    Object.keys(blocks).forEach(id => {
      if ((order || []).indexOf(id) !== -1) return;
      const b = blocks[id];
      const body = wrap === 'xml' ? b.body.map(escapeXmlText) : b.body;
      if (out.length) out.push('');
      if (wrap === 'xml' && tags && tags[id]) {
        out.push('<' + tags[id] + '>');
        out.push.apply(out, body);
        out.push('</' + tags[id] + '>');
      } else {
        out.push(b.heading);
        out.push.apply(out, body);
      }
    });
    return out.join('\n');
  }

  /* Will this text turn into a file attachment when it is pasted?
   *
   * All three convert a long paste into an attachment. ChatGPT's threshold is
   * documented (5,000 characters) and it offers a way back ("Show in text
   * field"). Claude's is neither documented nor a character count — measured on
   * a real account as "wildly inconsistent, sometimes less than 1000 letters
   * sometimes over, not at 2999" — which means length is one input among
   * several and line breaks are very likely another.
   *
   * So this deliberately does not pretend to know. It answers "probably" or
   * "no", never "at 4000 characters", and the wording downstream says "can"
   * rather than "will". A confident threshold would fire the warning at the
   * wrong moment in both directions, which is worse than not warning at all. */
  function pasteRisk(text, provider) {
    const t = String(text || '');
    if (!t || !provider || !provider.paste) return null;
    const P = provider.paste;
    const chars = t.length;
    const lines = t.split('\n').length;

    if (P.limit) {
      // Documented: a real number, and a real way back out of it.
      if (chars >= P.limit) return { likely: true, why: 'length', sure: !!P.documented, revert: P.revert || null };
      if (chars >= P.limit * 0.8) return { likely: false, near: true, why: 'length', revert: P.revert || null };
      return null;
    }
    if (P.softChars || P.softLines) {
      const byChars = P.softChars && chars >= P.softChars;
      const byLines = P.softLines && lines >= P.softLines;
      if (byChars || byLines) {
        return { likely: true, why: byLines ? 'lines' : 'length', sure: false, revert: P.revert || null };
      }
      return null;
    }
    return null;   // nothing known about this provider — say nothing
  }

  function providerOf(s) {
    try {
      const P = (typeof window !== 'undefined') && window.LN_PROVIDERS;
      if (!P) return null;
      if (s && s.provider) return P.byId(s.provider) || null;
      return null;
    } catch (e) { return null; }
  }

  /* s = { text, lang, archetype, goal, audience, format, include, avoid,
   *       context, steps, improve, sources } */
  /* --------------------------------------------- does Lantern help at all?
   *
   * The question that should have been asked first, and was not until a real
   * A/B came back against us.
   *
   * The request: „ich möchte ein ärztliches Attest aber es ist zu spät und die
   * haben zu". Raw, ChatGPT named the 116117 Bereitschaftsdienst, the
   * Bereitschaftspraxis, a video consultation and a word with the school —
   * four things the person could do that evening. Through Lantern it said it
   * depends, mentioned the Bereitschaftsdienst once inside a hedge, and asked
   * what the certificate was for.
   *
   * Every single line Lantern had added made that worse. „Die Antwort zuerst in
   * ein bis zwei Sätzen" suppressed the list. „Bleib bei dem, worum ich gebeten
   * habe" forbade volunteering the other routes. „Was das Ergebnis noch besser
   * machen würde" restated the question it had just asked. And the task line
   * had lost its verb on the way in.
   *
   * The lesson is not that those lines are bad. It is that they are lines for
   * something being BUILT, and this was a question. A question already has a
   * good default answer; everything Lantern adds competes with it for the
   * model's attention, and the measurements say that competition is real.
   *
   * So this runs before anything else, and it is allowed to say no. Three
   * answers:
   *
   *   build       there is something to specify, and specifying it helps
   *   capability  the wording cannot be improved, but a capability would help
   *   no          leave it alone and say so
   *
   * That is also what makes a usefulness target reachable at all. Lantern
   * cannot be right about every request; it can decline the ones it would be
   * wrong about. */
  const QUESTION_GOALS = ['answer', 'guidance'];
  const QUESTION_OPENING = /^\s*(?:what|when|where|who|why|how|can|could|should|is|are|do|does|will|would|explain|define|tell me|was|wann|wo|wer|warum|wieso|wie|kann|könn|soll|ist|sind|erklär)/i;
  const EXTERNAL_ACTION = /^\s*(?:book|reserve|order|buy|call|schedule|cancel|register|apply|send|submit|file|renew|pay|transfer|make\s+(?:an?\s+)?(?:restaurant\s+)?(?:appointment|reservation|booking)|buch(?:e|en)?|reservier(?:e|en)?|bestell(?:e|en)?|kauf(?:e|en)?|ruf(?:e|en)?\s+an|vereinbar(?:e|en)?|kündig(?:e|en)?|schick(?:e|en)?|send(?:e|en)?|überweis(?:e|en)?|bezahl(?:e|en)?|mach(?:e|en)?\s+(?:einen?\s+)?(?:termin|reservierung|buchung))\b/i;
  const EXTERNAL_NOUN_ACTION = /^(?:(?:an?\s+)?(?:restaurant\s+)?(?:appointment|reservation|booking)|(?:einen?\s+)?termin\b.*\bvereinbar(?:e|en)?)\b/i;
  const ACTION_LEAD = /^(?:(?:please|kindly)\s+|(?:can|could|would|will)\s+you\s+|i\s+(?:need|want|would like)\s+(?:you\s+)?to\s+|bitte\s+|(?:kannst|könntest|würdest)\s+du\s+)/i;
  const CREATIVE_FORM = /\b(?:haiku|limerick|poem|gedicht|slogan|tagline|headline|überschrift|title|betreffzeile|subject line)\b/i;
  const MESSAGE_PURPOSE = /\b(?:about|regarding|because|ask for|request|for|wegen|bezüglich|betreffend|bitte um)\b/i;
  const QUOTED_TEXT = /(?:"[^"]+"|„[^“]+“|»[^«]+«|(?<![\p{L}\p{N}])'(?:[^']|'(?=[\p{L}\p{N}]))+'(?![\p{L}\p{N}]))/u;
  const QUOTED_SPAN = /(?:"[^"]*"|„[^“]*“|»[^«]*«|(?<![\p{L}\p{N}])'(?:[^']|'(?=[\p{L}\p{N}]))*'(?![\p{L}\p{N}]))/gu;
  const URL_SPAN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
  const STATED_AMOUNT = /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|ein|eine|einen|einem|einer|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn)\b/i;
  const CODE_FIX_REQUEST = /\b(?:fix|debug|error|bug|exception|stack trace|fehlermeldung|fehler)\b/i;
  const CODE_SNIPPET = /```|(?:\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=|\b(?:function|class)\s+[A-Za-z_$][\w$]*\s*(?:\(|\{)|\bdef\s+[A-Za-z_]\w*\s*\(|\b(?:print|console\.log)\s*\(|\b(?:import|from)\s+[\w.]+(?:\s+import\s+\w+)?|\bselect\s+.+\s+\bfrom\b|(?:^|[\s;{}])[A-Za-z_$][\w$]{0,80}(?:\.[A-Za-z_$][\w$]{0,80})?\s*\([^\)\n]{0,80}\)\s*;)/i;
  const SELF_CONTAINED_FORM = /\b(?:tier\s*list|tierliste|flash ?cards?|quiz(?:zes)?|trivia|riddle|r\u00e4tsel)\b/i;
  const STRUCTURED_OUTPUT_DIRECTIVE = /\b(?:return|respond|reply|output|format|gib|antworte|liefere|ausgabe)\b[\s\S]{0,48}\b(?:json|ya?ml|xml|csv)\b/i;
  const STRUCTURED_OUTPUT_ONLY = /\b(?:json|ya?ml|xml|csv)\b[\s\S]{0,24}\b(?:only|just|strictly|exactly|nur|ausschlie\u00dflich|genau)\b/i;

  function hasOutputContract(text) {
    const value = taskSurface(text);
    return STRUCTURED_OUTPUT_DIRECTIVE.test(value) || STRUCTURED_OUTPUT_ONLY.test(value);
  }

  function taskSurface(text) {
    return String(text || '').replace(QUOTED_SPAN, ' ').replace(URL_SPAN, ' ');
  }

  function isExternalAction(s) {
    if (!s || s.archetype === 'code') return false;
    const text = taskSurface(s.text).trim().replace(ACTION_LEAD, '');
    return EXTERNAL_ACTION.test(text) || EXTERNAL_NOUN_ACTION.test(text) ||
      /^ruf(?:e|en)?\b(?=[^.?!\n]{0,80}\ban\b)/i.test(text);
  }

  function isSimpleQuestion(s, x) {
    if (!s || QUESTION_GOALS.indexOf(s.goal) === -1) return false;
    if (s.archetype === 'calculate' || s.archetype === 'recall') return false;
    if (x && (x.material || x.iterating || x.continues || (x.urls || []).length)) return false;
    const text = String(s.text || '');
    return countParts(text, lang2(s.lang)) <= 1 &&
      (/\?\s*$/.test(text) || QUESTION_OPENING.test(text));
  }

  function isClearArtifact(s, x) {
    if (!s) return false;
    const text = String(s.text || '');
    const n = words(text).length;
    if (n >= 8 && n <= 40 && SELF_CONTAINED_FORM.test(text) && !hasSourceMaterial(s, x)) return true;
    if (hasSourceMaterial(s, x) && n <= 20 &&
        (s.archetype === 'summarize' || s.archetype === 'edit' || s.goal === 'feedback' ||
          (s.archetype === 'code' && CODE_FIX_REQUEST.test(text)))) return true;
    if (s.archetype === 'translate' && QUOTED_TEXT.test(text)) return true;
    if (s.archetype === 'write' && n <= 14 && CREATIVE_FORM.test(text)) return true;
    if (s.goal === 'ideas' && n <= 12 && STATED_AMOUNT.test(text)) return true;
    return s.archetype === 'write' && n >= 9 && n <= 24 && !!(x && x.audience) &&
      MESSAGE_PURPOSE.test(text);
  }

  function isDetailedArtifact(s, x) {
    if (!s || s.goal !== 'artifact' || !x || x.material || x.iterating || x.continues ||
        (x.urls || []).length || words(s.text).length < 24 || /\?\s*$/.test(String(s.text || ''))) return false;
    const text = taskSurface(s.text);
    const stated = [x.audience, x.length, x.tone, x.register].filter(Boolean).length;
    const constraints = [
      /\b(?:include|mention|cover|explain|enthalt(?:e|en)?|nenn(?:e|en)?|erwähn(?:e|en)?)\b/i,
      /\b(?:avoid|without|vermeid(?:e|en)?|ohne)\b/i,
      /\b(?:keep|under|at most|no more than|höchstens|unter|halte)\b/i,
      /\b(?:finish|end|checklist|beend(?:e|en)?|abschluss)\b/i,
      /\b(?:use|tone|calm|practical|formal|nutze|ton|sachlich)\b/i
    ].filter(re => re.test(text)).length;
    return stated + constraints >= 3;
  }

  function hasSourceMaterial(s, x) {
    return !!((s && s.context && String(s.context).trim()) ||
      (s && s.parts && s.parts.some(part => String(part || '').trim())) ||
      (x && x.material) || QUOTED_TEXT.test(String(s && s.text || '')) ||
      CODE_SNIPPET.test(String(s && s.text || '')));
  }

  function materialNeed(s, x) {
    if (hasSourceMaterial(s, x)) return null;
    if (s && (s.archetype === 'summarize' || s.archetype === 'edit' || s.goal === 'feedback')) {
      return 'sourceMissing';
    }
    if (s && s.archetype === 'code' && s.goal === 'artifact' &&
        CODE_FIX_REQUEST.test(String(s.text || ''))) {
      return 'codeMissing';
    }
    return null;
  }

  function isSimpleCalculation(s, x) {
    if (!s || s.archetype !== 'calculate') return false;
    const supplied = ['context', 'example', 'audience', 'format', 'include', 'avoid']
      .some(key => s[key] && String(s[key]).trim());
    const text = String(s.text || '');
    return !supplied && !(s.parts || []).length && !s.scope && !s.sources && !s.ignoreMemory && !s.ask &&
      !(s.improve && s.improveExplicit) &&
      words(text).length <= 18 && countParts(text, lang2(s.lang)) <= 1 &&
      !(x && (x.material || (x.urls || []).length || x.iterating || x.continues));
  }

  function isThinArtifact(s, x) {
    if (!s || !s._helps || s._helps.helps !== 'build' || s.goal !== 'artifact' ||
        s.force || isClearArtifact(s, x) || materialNeed(s, x)) return false;
    const supplied = ['context', 'example', 'audience', 'format', 'include', 'avoid']
      .some(key => s[key] && String(s[key]).trim());
    const text = String(s.text || '');
    return !supplied && !(s.parts || []).length && !s.scope && !s.sources && !s.ignoreMemory && !s.ask &&
      !(s.improve && s.improveExplicit) &&
      words(text).length <= 14 && countParts(text, lang2(s.lang)) <= 1 &&
      !(x && (x.material || (x.urls || []).length || x.iterating || x.continues));
  }

  function reorderableMaterial(s) {
    if (!s || s.force || s.lean || s.ask) return null;
    const explicit = ['context', 'example', 'audience', 'format', 'include', 'avoid']
      .some(k => s[k] && String(s[k]).trim()) || (s.parts || []).length ||
      (s.caps || []).length || s.scope || s.sources || s.ignoreMemory ||
      (s.improve && s.improveExplicit);
    if (explicit) return null;

    /* Anthropic and Google explicitly recommend material before the task. The
     * ChatGPT order intentionally remains untouched: no equivalent evidence is
     * available there, so reordering would be a confident guess. */
    const P = providerOf(s);
    const order = P && P.order;
    if (!order || order.indexOf('material') < 0 || order.indexOf('task') < 0 ||
        order.indexOf('material') > order.indexOf('task')) return null;
    return splitLeadingTaskMaterial(s.text);
  }

  function suggestCaps(s) {
    const R = rules();
    const out = [];
    const capText = String(s.text || '').replace(QUOTED_SPAN, ' ');
    const padded = ' ' + capText.toLowerCase() + ' ';
    const sig = (R.capSignals && R.capSignals.web) || [];
    for (let i = 0; i < sig.length; i++) {
      if (kwHit(padded, sig[i])) { out.push('web'); break; }
    }
    if (isExternalAction(s) && out.indexOf('web') === -1) out.push('web');
    if (s.archetype === 'calculate') out.push('code');
    if (s.archetype === 'image') out.push('image');
    return out;
  }

  function helpsWith(s, x) {
    /* An action outside the chat. No capability makes this possible, so no
     * capability is offered: the panel would otherwise answer „Lantern cannot
     * book you a table" with „what actually helps here: search the web", which
     * is confident, adjacent and wrong. Saying only the true half is better
     * than filling the space. */
    if (isExternalAction(s)) {
      return { helps: 'capability', why: 'externalAction', suggest: [] };
    }

    /* Everything here is the user having said something Lantern could not have
     * worked out on its own. `corrected` is the newest member: the user tapped
     * a different kind or goal under "Verstanden als", which is a correction of
     * this exact sentence and therefore a choice, not a default. It sits in
     * this list rather than beside `force` so that the two honest limits below
     * — a missing source, an action a chat cannot perform — still win. */
    const explicit = ['context', 'example', 'audience', 'format', 'include', 'avoid']
      .some(k => s[k] && String(s[k]).trim()) || (s.parts || []).length ||
      (s.caps || []).length || s.scope || s.sources || s.ignoreMemory || s.corrected ||
      (s.improve && s.improveExplicit);
    const need = materialNeed(s, x);
    if (hasOutputContract(s.text)) return { helps: 'no', why: 'outputContract', suggest: [] };
    if (x && x.promptish && !explicit && !s.force) {
      return { helps: 'no', why: 'ownPrompt', suggest: [] };
    }
    if (need) return { helps: 'material', why: need, suggest: [] };

    /* The user may overrule a judgement call, not a missing input or an action
     * a chat cannot perform. Those two limits remain honest even on force. */
    if (s.force) return { helps: 'build', why: 'youAsked', suggest: [] };

    if (explicit) {
      return { helps: 'build', why: 'supplied', suggest: [] };
    }
    if (isDetailedArtifact(s, x)) return { helps: 'no', why: 'clearRequest', suggest: [] };
    const reordered = reorderableMaterial(s);
    if (reordered) return { helps: 'reorder', why: 'reordered', suggest: [], reordered: reordered };
    if (isSimpleQuestion(s, x) || isOptionComparison(s.text) || isClearArtifact(s, x)) {
      const suggest = suggestCaps(s);
      return { helps: suggest.length ? 'capability' : 'no', why: 'clearRequest', suggest: suggest };
    }
    if (x && x.material) return { helps: 'build', why: 'supplied', suggest: [] };
    /* Something concrete was read out of their own sentence — a register, an
     * audience, a length, figures to keep, numbered questions to answer. That
     * is not Lantern guessing at the shape of an answer, it is Lantern carrying
     * something the person actually said into a place the model will read it.
     * Whatever the archetype came out as, there is work to do. */
    if (x && (x.register || x.audience || x.length || x.tone || x.ranking ||
              (x.figures || []).length || (x.questions || []).length ||
              (x.urls || []).length || x.iterating || x.continues)) {
      return { helps: 'build', why: 'readSomething', suggest: suggestCaps(s) };
    }

    /* The rule, and it took two goes to find.
     *
     * The first attempt was „a question is not a job" — no frame on any
     * question. That is too broad, and it throws away Lantern's best case:
     * somebody asking for an explanation genuinely does benefit from asking
     * for a worked everyday example and for jargon to be unpacked in brackets,
     * and they would never think to ask. The same goes for a calculation that
     * should show its working, or a lookup that must not invent a source.
     *
     * What actually went wrong on the Attest request is narrower and worse:
     * the archetype came out as `general`. That is the fallback — it means
     * Lantern did not recognise what kind of request this was — and every line
     * it then added was a generic guess about the shape of an answer it had not
     * understood. On somebody's real problem, a guess about shape costs them
     * the answer.
     *
     * So the rule is the project's own, applied to itself: an unrecognised
     * request costs nothing, a confidently wrong one costs everything. If
     * Lantern cannot say what kind of request this is, it does not get to say
     * how the answer should look. */
    const unrecognised = s.archetype === 'general' || !s.archetype;
    /* …unless they have written a lot. Somebody who spends thirty words on a
     * request has told you several things at once, and putting those in order
     * is worth something whether or not the keyword lists recognised the kind.
     * The failure this rule is about was a short unrecognised one. */
    const long = words(s.text).length >= 25;
    if (unrecognised && !long && QUESTION_GOALS.indexOf(s.goal) !== -1) {
      const suggest = suggestCaps(s);
      return {
        helps: suggest.length ? 'capability' : 'no',
        why: 'questionNotTask',
        suggest: suggest
      };
    }
    return { helps: 'build', why: 'makeSomething', suggest: suggestCaps(s) };
  }

  function assessUse(s) {
    const input = Object.assign({}, s || {});
    return helpsWith(input, extract(input.text, input.lang));
  }

  /* Which of the picked capabilities actually contribute a line here.
   *
   * Two get dropped: one the assistant cannot do at all, and one it can only be
   * given by pressing its own button. Writing „leg das als Canvas an" into a
   * Gemini prompt is an instruction that cannot be obeyed, and an instruction
   * that cannot be obeyed still costs attention — see the budget note below. */
  function capLines(s, lang) {
    const R = rules();
    const C = R.capabilities;
    if (!C || !(s.caps || []).length) return [];
    const P = providerOf(s);
    const where = (P && C.where && C.where[P.id]) || {};
    const lines = (C.lines && C.lines[lang]) || {};
    const out = [];
    (s.caps || []).forEach(id => {
      const w = where[id];
      if (w && (w.how === 'none' || w.line === false)) return;
      if (lines[id] && out.indexOf(lines[id]) === -1) out.push(lines[id]);
    });
    return out;
  }

  /* ------------------------------------------------------- how much frame
   *
   * The measurement that forced this: a six-word request came back as a
   * hundred and seventy-six word message. So did every other short request —
   * the frame was a constant, and the thing the user actually wanted was three
   * per cent of what got sent. A tester put it plainly: the prompt came out
   * worse than what he would have written himself, and he would never spend
   * three minutes on a twenty-second question.
   *
   * He was right, and not only about the time. A model given eighteen generic
   * instructions and one real sentence answers the instructions. „Wie lange
   * muss ich Kartoffeln kochen" was being turned into a request for a
   * two-sentence summary, a worked everyday example, sections, a closing
   * three-sentence recap and a list of assumptions. The tool was making the
   * answer worse, which is the exact inversion of the point.
   *
   * So the frame has to be earned. Three levels:
   *
   *   none   the request is already a good prompt. Lantern says so and hands
   *          back what the user typed, unchanged. This is the honest answer
   *          far more often than a prompt tool would like it to be.
   *   light  a line or two genuinely helps — what to lead with, what not to
   *          pad — and nothing else does.
   *   full   what Lantern always did: the user brought material or filled
   *          fields in, or the request is long enough that structure is worth
   *          more than brevity. The same tester: „Ich sehe aber bei komplexeren
   *          aufgaben das sich das lohnt."
   *
   * The thresholds are word counts because word counts are the one thing that
   * cannot be wrong about someone else's sentence. */
  /* ------------------------------------------------- the instruction budget
   *
   * Not a style preference. Measured, in 2026, on realistic constraints rather
   * than toy ones: follow rates fall from about 96% with a single instruction
   * to 60% on Claude Sonnet, 43% on Gemini and 20% on GPT-5-mini once twenty
   * are stacked, and the curve is sigmoid rather than linear — it gives way
   * suddenly. About 12% of instruction pairs that are perfectly satisfiable on
   * paper turn out to conflict in practice.
   *   arXiv:2608.02639, "Instruction Stacking Collapse"
   *
   * Two things follow, and both are uncomfortable for a prompt tool.
   *
   * First: there is no free instruction. Every line Lantern adds spends a
   * little of the model's compliance on every other line, including the user's
   * actual request. A tester said the same thing from the other end — „wenn 90%
   * der nachricht instructions sind vergisst er die original frage" — and he
   * was describing a measured effect, not an impression.
   *
   * Second: the weakest model takes the worst of it, and the weakest model is
   * what somebody on a free plan is talking to. The people this tool exists for
   * are exactly the people whose model drops instructions first.
   *
   * So a prompt gets a budget, and going over it costs the generic lines
   * first, because those are the ones nobody would have typed themselves. */
  const BUDGET = { none: 4, light: 12, full: 16 };

  /* What the BUDGET is spent on: instructions Lantern added, not the user's own
   * words. Their request, their pasted material, their background and their
   * example are the payload — counting those would mean a longer request got a
   * thinner prompt, which is backwards. The example's note is an instruction
   * and is counted as one; the example itself is not. */
  const CONTENT_BLOCKS = { task: 1, material: 1, parts: 1, context: 1 };

  function countAdded(blocks) {
    let n = 0;
    Object.keys(blocks).forEach(k => {
      if (CONTENT_BLOCKS[k]) return;
      if (k === 'example') { n += 1; return; }
      n += countInstructions((blocks[k].body || []).join('\n'));
    });
    return n;
  }

  /* One instruction is one sentence, or one bullet regardless of how many
   * sentences it contains. Headings are not instructions. */
  function countInstructions(text) {
    let n = 0;
    String(text || '').split('\n').forEach(line => {
      const l = line.trim();
      if (!l) return;
      if (/^[A-ZÄÖÜ][A-ZÄÖÜ \u2019'-]+$/.test(l)) return;          // a heading
      if (/^<\/?[a-z_]+>$/.test(l)) return;                        // an xml wrapper
      if (l.indexOf('- ') === 0) { n += 1; return; }
      const hits = l.match(/[.!?](\s|$)/g);
      n += hits ? hits.length : 1;
    });
    return n;
  }

  function frameOf(s, x) {
    /* The user overruling the verdict from the panel. Asked for by the first
     * person to see it: say leave it as it is, but leave a way to build it out
     * anyway, because sometimes they know something about the request that its
     * length does not show. `lean` is the same handle pulled the other way, on
     * a long request that did not need everything the length implied. */
    /* Hard limits from helpsWith always win. The user can override an automatic
     * judgement, not the fact that a source is missing or an action is outside
     * the chat's capabilities. */
    if (s._helps && s._helps.helps === 'reorder') return 'reorder';
    if (s._helps && s._helps.helps !== 'build') return 'none';
    if (s.force) return 'full';
    if (s.lean) return 'light';
    /* Anything the user typed into a field is a decision they made, and
     * dropping it to keep the message short would be throwing their work
     * away. Same for collected parts and pasted material. */
    const supplied = ['context', 'example', 'audience', 'format', 'include', 'avoid']
      .some(k => s[k] && String(s[k]).trim());
    if (supplied) return 'full';
    if ((s.parts || []).length) return 'full';
    /* Only switches the user actually reached for. Improvement tips are opt-in:
     * useful when asked for, but an unrequested closing section is still extra
     * prompt weight. */
    if (s.scope || s.sources || s.ignoreMemory) return 'full';
    if (x && (x.material || (x.figures || []).length || (x.urls || []).length)) return 'full';
    /* Somebody who already wrote a prompt gets theirs, not a second one on top:
     * two frames give the model two sets of instructions to reconcile. */
    if (x && x.promptish) return 'none';

    const n = words(s.text).length;
    if (n >= 25) return 'full';
    if (countParts(s.text, lang2(s.lang)) > 1) return 'full';
    if (n >= 8) return 'light';
    return 'none';
  }

  function buildPrompt(s) {
    const R = rules();
    const lang = lang2(s.lang);
    const H = R.headers[lang];
    const A = archetypeById(s.archetype);
    const G = goalById(s.goal);
    const x = extract(s.text, lang);
    const XL = (R.extractLines && R.extractLines[lang]) || {};
    s = Object.assign({}, s, { _x: x });
    const v = assess(s.text, s);
    const P = providerOf(s);
    const shape = (P && P.shape) || {};
    const fam = P && P.familyRules && s.family ? P.familyRules[s.family] : null;
    const blocks = {};

    /* Two reasons to leave the role line out.
     *
     * One: somebody who already wrote "Du bist ein erfahrener…" has chosen a
     * role, and stacking ours gives the model two identities.
     *
     * Two: a persona helps a model adopt a *voice*, but the 2026 write-ups are
     * consistent that it does not help it think and can constrain reasoning. So
     * on a reasoning model doing reasoning-shaped work, the role goes. It stays
     * for writing, editing and translating, where the voice is the point. */
    const tier = s.tier || 'balanced';

    /* What this build did differently because of WHICH assistant and WHICH
     * model is in front of it.
     *
     * From the first person outside this project to use it: "not sure if it
     * actually correctly adjusts prompts from the different claude or chatgpt
     * models." That doubt is not unreasonable and it was not answerable — the
     * adaptations are real, they are the whole argument for the provider
     * layer, and every one of them was invisible. A feature nobody can see is
     * a feature nobody can trust, and nobody can debug either.
     *
     * So each decision writes down an id and the reason it fired. The panel
     * shows them in one line; the self-check carries the list. Ids rather than
     * sentences, because the words belong in i18n and the list has to survive
     * being pasted into a report by somebody who reads neither language. */
    const adapted = [];
    const adapt = (id, detail) => {
      if (!adapted.some(a => a.id === id)) adapted.push(detail === undefined ? { id: id } : { id: id, detail: detail });
    };

    const helps = helpsWith(s, x);
    s = Object.assign({}, s, { _helps: helps });
    const F = frameOf(s, x);
    /* Whether the request asks for something to be MADE. A question being
     * answered has nothing for the model to decide on the user's behalf; a
     * thing being built usually does. */
    const makeish = (G.id === 'artifact' || G.id === 'ideas');

    if (F === 'reorder' && helps.reordered) {
      adapt('reordered');
      return {
        prompt: helps.reordered.material + '\n\n' + helps.reordered.task,
        frame: 'reorder',
        helps: helps.helps,
        why: helps.why,
        suggest: helps.suggest,
        asIs: false,
        asked: false,
        instructions: 0,
        vague: v.vague,
        score: v.score,
        archetype: A.id,
        goal: G.id,
        tier: tier,
        roleDropped: true,
        provider: P ? P.id : null,
        adapted: adapted,
        extracted: x
      };
    }

    if (isSimpleCalculation(s, x)) {
      const micro = ((R.microPrompts || {}).calculate || {})[lang] || '';
      const body = String(s.text || '').trim();
      return {
        prompt: micro ? body + '\n\n' + micro : body,
        frame: 'light',
        helps: helps.helps,
        why: helps.why,
        suggest: helps.suggest,
        asIs: !micro,
        asked: false,
        instructions: micro ? 1 : 0,
        vague: v.vague,
        score: v.score,
        archetype: A.id,
        goal: G.id,
        tier: tier,
        roleDropped: true,
        provider: P ? P.id : null,
        adapted: adapted,
        extracted: x
      };
    }

    if (isThinArtifact(s, x)) {
      const brief = (R.briefAsk && R.briefAsk[lang]) || '';
      const body = String(s.text || '').trim();
      return {
        prompt: brief ? body + '\n\n' + brief : body,
        frame: 'light',
        helps: helps.helps,
        why: helps.why,
        suggest: helps.suggest,
        asIs: !brief,
        asked: !!brief,
        instructions: brief ? countInstructions(brief) : 0,
        vague: v.vague,
        score: v.score,
        archetype: A.id,
        goal: G.id,
        tier: tier,
        roleDropped: true,
        provider: P ? P.id : null,
        adapted: adapted,
        extracted: x
      };
    }

    /* Nothing to add. The honest output is what they typed.
     *
     * The panel says so in as many words and the button inserts their own
     * sentence unchanged. A tool that pads a good request in order to look
     * busy is worse than no tool, and this is the case where saying so costs
     * nothing and buys the trust that makes the other two levels believable.
     *
     * The one exception is a request to make something. There the model may
     * have to settle things that are the user's to settle, and one line stops
     * it doing that silently — the line, not a block, because Lantern does not
     * know which requests carry hidden decisions and the model does. */
    if (F === 'none') {
      if (x.promptish) adapt('roleYours');
      const ask = s.ask ? (R.askFirst && R.askFirst[lang]) :
        ((makeish && helps.helps === 'build') && R.briefAsk && R.briefAsk[lang]);
      const caps = capLines(s, lang);
      let body = String(s.text || '').trim();
      /* A capability the user picked is part of the request, so it rides along
       * even here, where nothing else does. */
      if (caps.length) body += '\n\n' + caps.join('\n');
      const improve = s.improve && s.improveExplicit && R.toggles &&
        R.toggles.improve && R.toggles.improve[lang];
      if (improve) body += '\n\n' + H.quality + '\n- ' + improve;
      return {
        prompt: ask ? (body + '\n\n' + H.clarify + '\n' + ask) : body,
        frame: 'none',
        helps: helps.helps,
        why: helps.why,
        suggest: helps.suggest,
        asIs: !ask && !caps.length && !improve,
        asked: !!ask,
        instructions: (ask ? countInstructions(ask) : 0) + caps.length +
          (improve ? countInstructions(improve) : 0),
        vague: v.vague,
        score: v.score,
        archetype: A.id,
        goal: G.id,
        tier: tier,
        roleDropped: true,
        provider: P ? P.id : null,
        adapted: adapted,
        extracted: x
      };
    }

    /* The role line, and the reason it is now the exception rather than the rule.
     *
     * Measured in 2026 across 1,140 questions and 38 expert roles: adding an
     * expert persona moves the aggregate score DOWN slightly (4.373 against a
     * 4.390 baseline), buys depth at the cost of clarity, and on the MMLU
     * knowledge benchmark costs real accuracy — 71.6% with no persona, 68.0%
     * with a minimal one, 66.3% with a long one. The proposed mechanism is that
     * an expert identity puts the model into sounding-authoritative mode, which
     * competes with recall. It helps on writing, style and extraction; it hurts
     * on maths, code and factual knowledge.
     *   arXiv:2605.29420 — and a longer persona is worse than a short one.
     *
     * The earlier rule here dropped the role on a reasoning MODEL doing
     * reasoning-shaped work. That was half right: the cost tracks the TASK, not
     * the model, so a cheap model answering a factual question was paying it
     * too. Now the role survives only where the voice is the product. */
    const voiceWork = (R.voiceArchetypes || []).indexOf(A.id) !== -1;
    let dropRole = x.promptish || !voiceWork;
    if (x.promptish) adapt('roleYours');
    else if (dropRole) adapt('roleCost');
    /* Google warns that Gemini "will sometimes ignore instructions in order to
     * maintain adherence to the described persona" — so on Gemini a role line
     * can eat the user's own format and scope instructions, and it is left out
     * entirely rather than trimmed. */
    if (shape.persona === 'avoid') { dropRole = true; adapt('roleProvider'); }
    /* A role line is a voice instruction, and on a short request an unasked-for
     * voice is Lantern deciding how the answer should sound. So at `light` it
     * survives only where the voice is the point — writing, editing,
     * translating, presenting — which is the same rule the tier logic above
     * already applies for its own reasons. */
    if (!dropRole) put(blocks, 'role', '', [A.role[lang]]);

    /* Parts the user collected instead of sending several messages.
     *
     * "I'll explain more in the next message" is a workaround for a small text
     * box, and it makes the answer worse: the model starts reasoning about half
     * a problem. Lantern detects that intent already. This is the other half —
     * once the pieces are collected they go into one message as numbered
     * sections, which is what an experienced user would have done by hand. */
    const parts = (s.parts || []).map(p => String(p || '').trim()).filter(Boolean);

    // Only split when the user has not already put their material in the
    // background field — otherwise it would be carried twice.
    const split = (s.context && s.context.trim()) ? null : splitMaterial(s.text);
    put(blocks, 'task', H.task, cleanTask(split ? split.task : s.text));
    /* The short form at `light`: the same instruction with the qualifications
     * taken off. On a fifteen-word request the third sentence of a directive
     * costs more attention than it earns. */
    put(blocks, 'goal', H.goal,
      (F === 'light' && G.brief && G.brief[lang]) ? G.brief[lang] : G.directive[lang]);
    if (split) put(blocks, 'material', H.material, (XL.materialNote || '') + '\n\n' + split.material);
    if (parts.length) {
      put(blocks, 'parts', H.parts, (XL.partsNote || '') + '\n\n' +
        parts.map((p, i) => (XL.partLabel ? XL.partLabel(i + 1) : ('— ' + (i + 1) + ' —')) + '\n' + p).join('\n\n'));
    }

    if (s.context && s.context.trim()) put(blocks, 'context', H.context, s.context.trim());

    // A worked example is a strong lever and almost no beginner knows it. The
    // README used to call it "the strongest single lever", which overstates
    // what is actually known: few-shot is well established for classification
    // and extraction, and much thinner for open-ended writing. See
    // claude/what-we-actually-know.md. The note matters as much as the example
    // either way: without it models lift the example's content, not its shape.
    // One string, not an array: section() drops falsy entries, so a bare ''
    // would not survive as the blank line separating note from example.
    if (s.example && s.example.trim()) {
      put(blocks, 'example', H.example, H.exampleNote + '\n\n' + s.example.trim());
    }

    const reqs = [];
    if (s.audience && s.audience.trim()) reqs.push(H.audienceLabel + ': ' + s.audience.trim());
    else if (x.audience) reqs.push(H.audienceLabel + ': ' + x.audience);
    if (!s.format && x.length) reqs.push(H.lengthLabel + ': ' + x.length);
    if (x.tone) reqs.push(H.toneLabel + ': ' + x.tone);
    if (x.register && XL.register) reqs.push(XL.register(x.register));
    if (x.ranking) reqs.push(x.rankingProse ? XL.rankProse : XL.rankList);
    if (x.urls.length && XL.urls) reqs.push(XL.urls);
    /* Once the parts are assembled, nothing more is coming — so the line
     * telling ChatGPT to wait for the next message would be a lie, and the
     * model would sit there waiting for a message that never arrives. */
    if (x.continues && XL.continues && !parts.length) reqs.push(XL.continues);
    if (s.include && s.include.trim()) reqs.push(H.includeLabel + ': ' + s.include.trim());
    if (s.avoid && s.avoid.trim()) reqs.push(H.avoidLabel + ': ' + s.avoid.trim());

    /* Capabilities the user picked from the row under the box. First, because
     * they change what the assistant is being asked to DO, and because being
     * first is the only place the budget can never reach them. */
    capLines(s, lang).forEach(l => reqs.push(l));

    // Things the wording itself demands, whatever the archetype is.
    if (x.figures.length && XL.figures) reqs.push(XL.figures(x.figures.join(', ')));
    if (x.questions.length && XL.questions) reqs.push(XL.questions(x.questions.length));
    if (x.material && XL.material) reqs.push(XL.material);
    if (x.iterating && XL.iterating) reqs.push(XL.iterating);

    /* The archetype's own requirements are the generic half — true of every
     * request of that kind, and therefore not news to the model. At `light`
     * only the requirements read out of the user's own words survive, which
     * is the half that carries information. */
    /* Everything pushed so far was read out of the user's own words or typed
     * into a field by them. The archetype's own list starts here, and the
     * budget above cuts from this end. */
    const userReqs = reqs.length;
    if (F === 'full') (A.requirements[lang] || []).forEach(r => reqs.push(r));
    if (reqs.length) put(blocks, 'req', H.req, reqs.map(r => '- ' + r));

    // Precedence: what the user typed, then what the goal demands, then the
    // archetype default. A goal like "instructions" changes the shape of the
    // output more than the subject matter does.
    const fmt = (s.format && s.format.trim())
      ? s.format.trim()
      : ((G.format && G.format[lang]) || A.format[lang]);
    /* A prescribed shape is worth having when the user asked for one or when
     * the request is big enough to come back shapeless. On a short one it is
     * Lantern deciding what the answer should look like, which is not what it
     * was asked to do. */
    if (F === 'full' || makeish || (s.format && s.format.trim())) put(blocks, 'format', H.format, fmt);

    /* Whether something is being BUILT here, which is what the delivery guard
     * and the improve line are for. A question can still build something — a
     * calculation with its working shown, an explanation, a piece of code —
     * so the archetype gets a say and not only the goal. */
    const DELIVERS = ['write', 'edit', 'translate', 'present', 'summarize',
                      'code', 'data', 'image', 'calculate', 'plan'];
    const building = QUESTION_GOALS.indexOf(G.id) === -1 || DELIVERS.indexOf(A.id) !== -1;
    let quality = []
      .concat(A.guards[lang] || [])
      .concat(R.universalGuards[lang] || [])
      .concat(building ? (R.deliveryGuards[lang] || []) : [])
      .concat(R.modelTips[lang] || []);

    /* Leanness is the current guidance, not thoroughness: OpenAI measured
     * leaner prompts scoring 10-15% better on 41-66% fewer tokens, and a
     * reasoning model needs the fewest reminders of all. Duplicates go first,
     * so the cap never drops a real constraint to keep a repeat of one. */
    const seen = {};
    quality = quality.filter(g => (g && !seen[g]) ? (seen[g] = true) : false);
    /* Two caps, and the tighter one usually wins. The model tier says how many
     * reminders that model needs; the frame says how many this request can
     * carry without the reminders outweighing it. */
    const tierCap = tier === 'deep' ? 3 : (tier === 'fast' ? 6 : 5);
    const cap = F === 'light' ? Math.min(2, tierCap) : tierCap;
    if (quality.length > cap) quality = quality.slice(0, cap);

    /* Two halves, and only the first one is ever trimmed.
     *
     * Everything above came from a table; everything below is a switch the user
     * reached for, or a line this particular model needs. An instruction budget
     * that could silently drop the toggle somebody just ticked would be worse
     * than no budget — it would make the panel lie. */
    const genericQuality = quality.length;
    if (s.scope && R.toggles.scope) quality.push(R.toggles.scope[lang]);
    if (s.sources) quality.push(R.toggles.sources[lang]);
    if (s.ignoreMemory && R.toggles.ignoreMemory) quality.push(R.toggles.ignoreMemory[lang]);
    /* „Was das Ergebnis noch besser machen würde" teaches somebody what to say
     * next time, which is the whole brief — on something being built. On a
     * question the model has already asked its own follow-up, and this just
     * restates it under a heading. Seen doing exactly that in a real A/B. */
    if (s.improve && s.improveExplicit) quality.push(R.toggles.improve[lang]);
    const tl = (R.tierLines && R.tierLines[lang] && R.tierLines[lang][tier]) || null;
    if (tl) quality.push(tl);
    put(blocks, 'quality', H.quality, quality.map(g => '- ' + g));
    /* How many of the quality lines are the trimmable kind. Family lines are
     * appended below and are model facts, so they are counted as chosen too. */
    let trimmableQuality = genericQuality;

    /* Who deals with what the user did not say.
     *
     * At `full` the request is big, so the old pair still applies: interrogate
     * when the request is genuinely too thin to act on, otherwise assume and
     * declare it. At `light` neither is worth four lines — the one sentence
     * that hands the judgement to the model covers both, and only for a
     * request that asks for something to be made. A question being answered
     * needs nothing here at all. */
    let asked = false;
    if (s.ask && R.askFirst && R.askFirst[lang]) {
      asked = true;
      /* Asked for by hand, from under the result. It outranks both of the
       * automatic choices below, because a user who pressed it has told you
       * something the request did not. */
      put(blocks, 'clarify', H.clarify, R.askFirst[lang]);
    } else if (F === 'light') {
      if (makeish && R.askFirst && R.askFirst[lang]) {
        asked = true;
        put(blocks, 'clarify', H.clarify, R.askFirst[lang]);
      }
    } else if (v.vague) {
      asked = true;
      put(blocks, 'clarify', H.clarify, R.clarify[lang](v.score >= 5 ? 4 : 3, A.asks[lang]));
    } else {
      put(blocks, 'assume', H.assume, R.assume[lang]);
    }

    /* Per-model adjustments Anthropic publishes that contradict each other
     * between its own models: Opus 5 runs long and should be asked for brevity
     * but must NOT be told to verify itself (it over-verifies); Fable 5.1
     * already formats sparsely, so asking it for brevity makes it worse;
     * Sonnet 5 takes instructions literally and will not generalise them. */
    const FL = (R.familyLines && R.familyLines[lang]) || {};
    if (fam) {
      const extra = [];
      // Opus 5 runs longer than prior models and needs asking; Fable 5.1
      // already formats sparsely, so the same line makes it worse.
      if (fam.concise === true && FL.opusConcise) extra.push(FL.opusConcise);
      // Sonnet 5 "does not silently generalize an instruction from one item to
      // another", so the scope has to be said out loud.
      if (fam.stateScope && FL.sonnetScope) extra.push(FL.sonnetScope);
      // Fable writes fewer progress updates, so they are asked for.
      if (fam.askProgress && FL.fableProgress) extra.push(FL.fableProgress);
      if (extra.length && blocks.quality) {
        blocks.quality.body = blocks.quality.body.concat(extra.map(l => '- ' + l));
      } else if (extra.length) {
        put(blocks, 'quality', H.quality, extra.map(l => '- ' + l));
      }
      /* Opus 5 verifies its own work well, and a verification instruction
       * inherited from a prompt tuned for an older model causes
       * over-verification. Anthropic's advice is to remove it, not reword it. */
      if (fam.selfCheck === false && blocks.quality) {
        const verify = /(prüf|überprüf|kontrollier)[^.]*\b(selbst|noch einmal|nochmal)|verify (your|the) (answer|work)|double.?check/i;
        blocks.quality.body = blocks.quality.body.filter(l => !verify.test(String(l)));
      }
    }

    /* Google: "place your core request and most critical restrictions as the
     * final line… negative constraints should be placed at the end." So on
     * Gemini the avoid line is lifted out of the requirements and moved last,
     * where it is actually read. */
    if (shape.negativesLast && blocks.req) {
      const avoidLabel = H.avoidLabel;
      const isNeg = (l) => avoidLabel && String(l).indexOf('- ' + avoidLabel) === 0;
      const negs = blocks.req.body.filter(isNeg);
      if (negs.length) {
        adapt('negativesLast');
        blocks.req.body = blocks.req.body.filter(l => !isNeg(l));
        if (!blocks.req.body.length) delete blocks.req;
        const prev = blocks.close ? blocks.close.body : [];
        put(blocks, 'close', H.close || '', negs.concat(prev));
      }
    }

    /* Google asks for an explicit anchor after long context, and puts the most
     * important constraint last on purpose. */
    if (shape.anchorClosing && (blocks.material || blocks.parts || blocks.context)) {
      const anchor = (R.closingAnchor && R.closingAnchor[lang]) || null;
      if (anchor) {
        adapt('anchor');
        // Keep the user-supplied avoid line last after adding the material anchor.
        const closing = (blocks.close && blocks.close.body) || [];
        put(blocks, 'close', H.close || '', [anchor].concat(closing));
      }
    }

    /* Lantern must never ask Claude to show its reasoning: on Fable 5 that
     * trips a documented refusal category and silently falls back to a weaker
     * model, so the user gets a worse answer and is never told why. Nothing
     * currently generates such a line, and this is the guard that keeps it
     * that way if a rules file ever adds one. */
    if (shape.askForReasoning === 'never') {
      const bad = /(zeig|schreib).{0,20}(gedankengang|denkweg)|show (me )?your (work|reasoning|thinking)|chain of thought|denke laut/i;
      let stripped = false;
      Object.keys(blocks).forEach(k => {
        const before = blocks[k].body.length;
        blocks[k].body = blocks[k].body.filter(l => !bad.test(String(l)));
        if (blocks[k].body.length !== before) stripped = true;
        if (!blocks[k].body.length) delete blocks[k];
      });
      if (stripped) adapt('noReasoningAsk');
    }

    const order = (P && P.order) || null;
    /* The two structural ones. Both are provider facts rather than decisions
     * taken here, so they are recorded unconditionally when they apply — they
     * are the ones a reader is most likely to notice and wonder about. */
    if (order && order[1] === 'material') adapt('materialFirst');
    if (P && P.wrap === 'xml') adapt('xmlTags');
    const qc = P && P.tierRules && P.tierRules[tier] && P.tierRules[tier].qualityCap;
    if (qc) adapt('qualityCap', qc);
    if (P && P.tierRules && P.tierRules[tier] && P.tierRules[tier].orderLine) adapt('orderLine');

    /* Spend down to the budget before assembling. The generic quality lines go
     * first and the archetype's own requirements second, because between them
     * they are everything in here that the user did not say and would not have
     * thought to say. What they typed, and what was read out of what they
     * typed, is never what gets cut. */
    const budget = BUDGET[F] || BUDGET.full;
    const count = () => countAdded(blocks);
    let guard = 0;
    while (count() > budget && guard++ < 24) {
      /* Generic quality lines first, down to one. Then the archetype's own
       * requirements. Then that last quality line. Nothing the user typed,
       * switched on, or that this model specifically needs is ever cut. */
      if (trimmableQuality > 1 && blocks.quality) {
        blocks.quality.body.splice(trimmableQuality - 1, 1);
        trimmableQuality--;
        continue;
      }
      if (blocks.req && blocks.req.body.length > userReqs) {
        blocks.req.body.pop();
        if (!blocks.req.body.length) delete blocks.req;
        continue;
      }
      if (trimmableQuality > 0 && blocks.quality) {
        blocks.quality.body.splice(trimmableQuality - 1, 1);
        trimmableQuality--;
        if (!blocks.quality.body.length) delete blocks.quality;
        continue;
      }
      break;
    }

    const prompt = assemble(blocks, order, P && P.wrap, P && P.tags);

    return {
      prompt: prompt,
      frame: F,
      helps: helps.helps,
      why: helps.why,
      suggest: helps.suggest,
      asIs: false,
      asked: asked,
      instructions: countAdded(blocks),
      vague: v.vague,
      score: v.score,
      archetype: A.id,
      goal: G.id,
      tier: tier,
      roleDropped: dropRole,
      provider: P ? P.id : null,
      adapted: adapted,
      extracted: x
    };
  }

  /* The wrapper sent to an assistant when a live model should write the prompt.
   * The rough request remains authoritative: automatic detections are hints for
   * Lantern's UI, not facts the user has confirmed for another model to obey. */
  function buildMetaPrompt(s) {
    const R = rules();
    const lang = lang2(s.lang);
    const L = R.metaLabels[lang];
    const H = R.headers[lang];
    const P = providerOf(s);
    const meta = String(R.meta[lang] || '').split('{ai}').join((P && P.label) || 'assistant');
    const parts = [
      meta, '', L.request, '<rough_request>',
      escapeXmlText(String(s.text || '').trim()),
      '</rough_request>'
    ];
    const userText = (value) => escapeXmlText(String(value || '').trim());

    const details = [];
    if (s.manualKind) details.push('- ' + L.kind + ': ' + archetypeById(s.archetype).label[lang]);
    if (s.manualGoal) details.push('- ' + L.goal + ': ' + goalById(s.goal).label[lang]);
    if (s.audience && s.audience.trim()) details.push('- ' + H.audienceLabel + ': ' + userText(s.audience));
    if (s.format && s.format.trim()) details.push('- ' + H.format + ': ' + userText(s.format));
    if (s.include && s.include.trim()) details.push('- ' + H.includeLabel + ': ' + userText(s.include));
    if (s.avoid && s.avoid.trim()) details.push('- ' + H.avoidLabel + ': ' + userText(s.avoid));
    if (s.context && s.context.trim()) details.push('- ' + H.context + ': ' + userText(s.context));
    if (s.example && s.example.trim()) details.push('- ' + H.example + ' (' + H.exampleNote + '):\n' + userText(s.example));
    if (s.scope && R.toggles.scope) details.push('- ' + R.toggles.scope[lang]);
    if (s.sources) details.push('- ' + R.toggles.sources[lang]);
    if (s.ignoreMemory && R.toggles.ignoreMemory) details.push('- ' + R.toggles.ignoreMemory[lang]);
    if (s.improve && s.improveExplicit) details.push('- ' + R.toggles.improve[lang]);

    if (details.length) parts.push('', L.details, '<user_details>', details.join('\n'), '</user_details>');
    return parts.join('\n');
  }

  /* ------------------------------------------------------------- handover */

  /* The prompt that makes the current chat write its own handover. */
  function buildHandoverRequest(opts) {
    const R = rules();
    const H = R.handover;
    if (!H) return '';
    const lang = lang2(opts && opts.lang);
    const T = H.request[lang];
    const chosen = opts && opts.parts ? opts.parts : [];
    const lines = H.parts
      .filter(p => p.always || chosen.indexOf(p.id) !== -1)
      .map(p => '- ' + p[lang]);
    return [T.head, '', T.listHead, lines.join('\n'), '', T.rulesHead,
      T.rules.map(r => '- ' + r).join('\n')].join('\n');
  }

  /* The opening message for the new chat: the handover plus the framing that
   * stops the fresh model quietly losing or overriding it. */
  function buildHandoverLaunch(handover, opts) {
    const R = rules();
    const H = R.handover;
    if (!H) return String(handover || '');
    const lang = lang2(opts && opts.lang);
    const T = H.launch[lang];
    const next = (opts && opts.next && opts.next.trim()) ? opts.next.trim() : T.nextDefault;
    return [
      T.head, '',
      T.rulesHead,
      T.rules.map(r => '- ' + r).join('\n'), '',
      T.handoverHead,
      '<handover>',
      escapeXmlText(String(handover || '').trim()),
      '</handover>', '',
      T.nextHead,
      '<next_step>',
      escapeXmlText(next),
      '</next_step>'
    ].join('\n');
  }

  window.LN_ENGINE = {
    buildHandoverRequest: buildHandoverRequest,
    buildHandoverLaunch: buildHandoverLaunch,
    detectLanguage: detectLanguage,
    detectArchetype: detectArchetype,
    detectGoal: detectGoal,
    tierOf: tierOf,
    assess: assess,
    checklist: checklist,
    extract: extract,
    gaps: gaps,
    splitMaterial: splitMaterial,
    analyzeAnswer: analyzeAnswer,
    rankFollowUps: rankFollowUps,
    signalWeight: signalWeight,
    assessUse: assessUse,
    phraseHits: phraseHits,
    distinctHits: distinctHits,
    route: route,
    cleanTask: cleanTask,
    pasteRisk: pasteRisk,
    mergeRules: mergeRules,
    buildPrompt: buildPrompt,
    buildMetaPrompt: buildMetaPrompt
  };
})();
