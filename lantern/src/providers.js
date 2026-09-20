/* Lantern — what is true about each assistant.
 * ---------------------------------------------------------------------------
 * Lantern started as a ChatGPT tool. Everything it knew about "the assistant"
 * was baked into rules.js as if there were only one. There are three, they
 * disagree, and — this is the part that matters — advice that is correct on one
 * is actively wrong on another.
 *
 * The three worked examples, all from vendor documentation:
 *
 *   "Be concise."      Right on Claude Opus 5, which runs long by default.
 *                      WRONG on Claude Fable 5.1, which already formats less
 *                      than earlier models and loses structure the content
 *                      needs. Redundant on Gemini 3, which is terse by default
 *                      and has to be asked for warmth.
 *
 *   A role line.       Helps voice on Claude (one sentence, and Anthropic still
 *                      recommends it). A HAZARD on Gemini, where Google warns
 *                      the model "will sometimes ignore instructions in order
 *                      to maintain adherence to the described persona" — so a
 *                      persona can eat the user's own format instructions.
 *
 *   "Show your work."  Ordinary on ChatGPT. On Claude Fable 5 it trips a
 *                      documented `reasoning_extraction` refusal category and
 *                      causes a SILENT fallback to a weaker model. The user
 *                      gets a worse answer and is never told why. Lantern must
 *                      never emit it on Claude.
 *
 * So provider knowledge lives here, as data, in the same replaceable shape as
 * rules.js. The engine asks this file how to build, rather than assuming.
 *
 * Two design rules learned from the research:
 *
 * 1. MATCH TIERS, NOT NAMES. Google shipped four Flash versions in four months
 *    while Pro sat still, and its own help pages, its press coverage and its
 *    actual UI disagree about what the picker says. Anthropic's top model is
 *    now Fable, not Opus. Any name-keyed logic rots in weeks. Names are hints
 *    that map to a tier; an unrecognised name means the balanced default, which
 *    is the right answer anyway.
 *
 * 2. EVERY SELECTOR IS A GUESS, AND A MISS MUST BE SILENT. Same rule the rest
 *    of the extension follows. Selectors are arrays, tried in order, and a
 *    total miss degrades to a feature that quietly does not appear.
 */
(function () {
  'use strict';

  /* Section order.
   *
   * Not cosmetic. Anthropic measured queries-at-the-end as worth "up to 30
   * percent" on complex multi-document inputs, and Google independently tells
   * users to "place your specific instructions or questions at the end of the
   * prompt, after the data context". Both vendors are saying the same thing,
   * and both are saying the opposite of what a beginner does — which is to type
   * the instruction and then paste four pages under it.
   *
   * ChatGPT's own guidance does not make this claim, so its order is left as it
   * was rather than changed on someone else's evidence.
   */
  /* `clarify` / `assume` are listed explicitly, and `close` after them, because
   * "put the critical restriction last" only means anything if nothing is
   * appended after it. Leaving them out let the ask-first block fall through to
   * the end and sit below the line that was supposed to be final. */
  var ORDER_INSTRUCTION_FIRST = [
    'role', 'task', 'goal', 'material', 'parts', 'context', 'example',
    'req', 'format', 'quality', 'clarify', 'assume', 'close'
  ];
  var ORDER_MATERIAL_FIRST = [
    'role', 'material', 'parts', 'context', 'example',
    'task', 'goal', 'req', 'format', 'quality', 'clarify', 'assume', 'close'
  ];

  /* Tag names for the XML wrapping Anthropic recommends. Only Claude uses
   * these; Google's guidance is explicitly "pick one and do not mix", and its
   * own examples lead with Markdown, so Gemini keeps headings. */
  var XML_TAGS = {
    role: 'role', task: 'task', goal: 'goal', material: 'material',
    parts: 'material', context: 'context', example: 'example',
    req: 'requirements', format: 'output_format', quality: 'quality_bar',
    clarify: 'before_you_start', assume: 'handling_gaps', close: 'final_instruction'
  };

  var PROVIDERS = {

    /* ------------------------------------------------------------ ChatGPT */
    chatgpt: {
      id: 'chatgpt',
      label: 'ChatGPT',
      /* Words to look for when pointing at the control for a capability.
       *
       * Matched against a button's visible text and its aria-label, not against
       * a class or a selector, because the text is the part that survives a
       * redesign — the same reasoning the model-picker detection already uses.
       * Both languages, because the interface follows the browser and half the
       * people this was handed to run it in German. Finding nothing is a normal
       * outcome: the panel still says in words where to look. */
      capWords: {
        web: ['search the web', 'web search', 'im web suchen', 'websuche', 'suche'],
        canvas: ['canvas'],
        research: ['deep research', 'deep-research', 'recherche'],
        image: ['create image', 'bild erstellen', 'bild erzeugen'],
        code: ['code interpreter', 'data analysis', 'datenanalyse']
      },
      vendor: 'OpenAI',
      hosts: ['chatgpt.com', 'chat.openai.com'],
      accent: '#10a37f',

      dom: {
        composer: ['#prompt-textarea', 'div[contenteditable="true"]', 'textarea[data-id]'],
        message: '[data-message-author-role]',
        assistant: '[data-message-author-role="assistant"]',
        user: '[data-message-author-role="user"]',
        code: 'pre code',
        modelPicker: ['[data-testid="model-switcher-dropdown-button"]',
                      'button[aria-label*="odel"]']
      },

      /* Message prefill parameters are undocumented provider behavior. Lantern
       * never puts message text in a URL, because the provider could interpret
       * it as a send. The carried copy is shown in Lantern for one explicit
       * "Insert into chat" action instead. */
      newChat: function (base, _text, temporary) {
        var u = base || 'https://chatgpt.com/';
        return temporary ? u + '?temporary-chat=true' : u;
      },
      prefillSupported: false,

      /* Documented: 5,000 characters, shipped 25 March 2026, Plus/Pro/Business.
       * Uniquely, ChatGPT offers a way back — "Show in text field". */
      paste: { limit: 5000, documented: true, revert: 'Show in text field' },

      order: ORDER_INSTRUCTION_FIRST,
      wrap: 'headings',          // ALL-CAPS section headings, as before

      shape: {
        persona: 'ok',           // a role line is fine and helps
        askForReasoning: 'ok',   // no refusal risk in asking it to show working
        selfCheck: 'ok',
        anchorClosing: false,    // no "based on the above" line needed
        negativesLast: false
      },

      /* "pro" and "auto" were here for one round and are deliberately gone.
       *
       * A real account came back with model "Pro" while the picker itself said
       * only "Switch model" — so the word was scraped off something else on the
       * page, almost certainly a subscription button, and ChatGPT Pro is a
       * *plan* name as much as a model name. That false positive is expensive:
       * "pro" mapped to the deep tier, which drops the role line and shortens
       * the quality bar, so a wrong guess quietly makes every prompt worse.
       *
       * An unrecognised model costs nothing — it means the balanced prompt,
       * which is the right shape when you know nothing. So ambiguous words do
       * not belong in this list at all. Only names that can only be a model. */
      tiers: [
        { id: 'deep',     names: ['astra', 'sol', 'thinking', 'reasoning'],
          label: { de: 'weniger Prompt-Vorgaben', en: 'lighter prompt framing' } },
        { id: 'balanced', names: ['terra'],
          label: { de: 'ausgewogene Prompt-Vorgaben', en: 'balanced prompt framing' } },
        { id: 'fast',     names: ['luna', 'mini', 'instant'],
          label: { de: 'explizitere Prompt-Vorgaben', en: 'more explicit prompt framing' } }
      ],

      /* VERIFIED, 2026-09-07: the switcher's accessible name is the *verb*
       * "Switch model" — it does not contain the model at all. So on ChatGPT
       * the name has to be looked for around the control, not inside it. */
      pickerIsVerb: true,

      /* Per-tier prompt adjustments. `drop` removes something Lantern would
       * otherwise add; `add` is an extra requirement line. */
      tierRules: {
        deep:     { dropRoleForReasoning: true, qualityCap: 3 },
        balanced: { qualityCap: 5 },
        fast:     { qualityCap: 6, orderLine: true }
      },

      /* Statuspage serves this with Access-Control-Allow-Origin, so it needs no
       * host permission — the same contract the rules channel uses. */
      status: { url: 'https://status.openai.com/api/v2/status.json', kind: 'statuspage' },

      /* Two different ceilings, and conflating them would be a bug.
       *
       * QUOTA — you have used your allowance. Sourced from a Free-plan user's
       * paste on OpenAI's own community forum, 20 August 2026, verified
       * against the raw thread JSON rather than the rendered page. The heading
       * is the anchor because it is the distinctive half; the body sentence is
       * feature-scoped, which fits what changed on 6 August 2026 — free
       * accounts got unlimited plain-text chats, and what is left of the free
       * limits is images and file uploads.
       *
       * CONTEXT — this conversation has got too long for the model to hold. A
       * different problem with a different fix, and the fix is the handover,
       * not the queue. Parking messages because the chat is full would leave
       * someone waiting for a reset that is never coming. */
      limits: {
        window: '5h',
        showsReset: true,
        strings: [
          'Chat paused until usage resets',
          'reached the limit for chats that include files or images'
        ],
        /* Matched separately, and routed to the handover rather than the
         * queue. Verbatim from the same forum, 5 April 2026. */
        contextStrings: ['This chat is nearing its limit'],
        note: { de: 'ChatGPT zeigt beim Limit an, wann es zurückkommt. Seit August 2026 sind reine Textchats auch ohne Abo unbegrenzt – die Grenzen betreffen vor allem Bilder und Dateien.',
                en: 'ChatGPT tells you when the limit comes back. Since August 2026 plain text chats are unlimited even without a subscription — what is still capped is mostly images and files.' }
      }
    },

    /* ------------------------------------------------------------- Claude */
    claude: {
      id: 'claude',
      label: 'Claude',
      capWords: {
        web: ['web search', 'search the web', 'websuche', 'im web suchen'],
        canvas: ['artifact', 'artefakt'],
        research: ['research', 'recherche'],
        image: [],
        code: ['analysis', 'analyse']
      },
      vendor: 'Anthropic',
      hosts: ['claude.ai'],
      accent: '#d97757',

      dom: {
        composer: ['div[contenteditable="true"].ProseMirror',
             '[data-testid="chat-input"] [contenteditable="true"]',
             '[data-testid="chat-input"] textarea',
             '[data-testid="chat-input"]',
             '[contenteditable="true"][role="textbox"]'],
        message: '[data-testid="user-message"], .font-claude-message, [data-is-streaming]',
        assistant: '.font-claude-message, [data-is-streaming="false"]',
        user: '[data-testid="user-message"]',
        code: 'pre code',
        /* VERIFIED on a live Pro account, 2026-09-07: the chip sits at the
         * bottom right of the composer and reads "Opus 5  Extra" — model and
         * effort in one element, and the effort is *abbreviated* ("Extra", not
         * "Extra high"), which the first version of the effort regex did not
         * match. The selectors below are still guesses; only the text is
         * confirmed. */
        modelPicker: ['[data-testid="model-selector-dropdown"]',
                      'button[aria-haspopup="menu"][aria-label*="odel"]',
                      'button[data-testid*="model"]']
      },

      /* Lantern opens a new chat and keeps the text in its carried copy rather
       * than relying on a provider URL parameter to prefill a composer. */
      newChat: function (base) { return (base || 'https://claude.ai/') + 'new'; },
      prefillSupported: false,

      /* MEASURED, 2026-09-07, and the measurement killed the number.
       *
       * A real user tried it repeatedly: "wildly inconsistent. sometimes less
       * than 1000 letters sometimes over, not at 2999." So Claude's conversion
       * is not a character count at all — length is one input among several,
       * and line breaks are very likely another (the one third-party extension
       * that reverse-engineered this also triggers on any newline).
       *
       * A single number here would fire the warning at the wrong moment in both
       * directions, which is worse than no warning. So there is no number: the
       * heuristic below is deliberately soft, and the wording says "can" rather
       * than "will". There is no "show in text field" here to undo it with,
       * which is why warning early matters more on Claude than on ChatGPT. */
      paste: { limit: null, documented: false, revert: null,
               softLines: 12, softChars: 1200 },

      order: ORDER_MATERIAL_FIRST,
      wrap: 'xml',               // Anthropic's own recommendation
      tags: XML_TAGS,

      shape: {
        persona: 'light',        // one sentence, no stacked identities
        /* The important one. On Fable 5 this trips a documented refusal
         * category and silently downgrades the model. Never emitted. */
        askForReasoning: 'never',
        selfCheck: 'tier',       // depends on the model — see tierRules
        anchorClosing: true,     // "Based on the material above, …"
        negativesLast: false,
        prefill: false           // 400s on every model from 4.6 onward
      },

      tiers: [
        { id: 'deep',     names: ['fable', 'mythos', 'opus'], label: { de: 'weniger Prompt-Vorgaben', en: 'lighter prompt framing' } },
        { id: 'balanced', names: ['sonnet'],                  label: { de: 'ausgewogene Prompt-Vorgaben', en: 'balanced prompt framing' } },
        { id: 'fast',     names: ['haiku'],                   label: { de: 'explizitere Prompt-Vorgaben', en: 'more explicit prompt framing' } }
      ],

      /* Claude is the provider where the *model* matters most, because
       * Anthropic's own per-model guidance contradicts itself between models.
       * These are keyed on the model family, not the tier, for that reason. */
      familyRules: {
        fable: {
          concise: false,        // already formats less; asking for less hurts
          antiMarkdown: false,   // would suppress structure the content needs
          askProgress: true,
          why: { de: 'Fable formatiert von sich aus sparsam – „kurz fassen" macht es hier schlechter, nicht besser.',
                 en: 'Fable already formats sparsely — asking for brevity here makes it worse, not better.' }
        },
        opus: {
          concise: true,         // runs longer than prior models
          selfCheck: false,      // verifies well unprompted; asking causes over-verification
          why: { de: 'Opus antwortet ausführlich und prüft sich selbst – Lantern bittet um Kürze und lässt Prüf-Anweisungen weg.',
                 en: 'Opus answers at length and self-verifies — Lantern asks for brevity and leaves verification instructions out.' }
        },
        sonnet: {
          concise: true,
          /* "Interprets prompts literally… does not silently generalize an
           * instruction from one item to another." */
          stateScope: true,
          why: { de: 'Sonnet nimmt Anweisungen wörtlich und überträgt sie nicht von selbst – Lantern sagt ausdrücklich, worauf sie sich beziehen.',
                 en: 'Sonnet takes instructions literally and will not generalise them — Lantern says explicitly what they apply to.' }
        },
        haiku: { concise: true, orderLine: true }
      },

      tierRules: {
        deep:     { dropRoleForReasoning: false, qualityCap: 4 },
        balanced: { qualityCap: 5 },
        fast:     { qualityCap: 6, orderLine: true }
      },

      status: { url: 'https://status.anthropic.com/api/v2/status.json', kind: 'statuspage' },

      /* Verbatim from Anthropic's own troubleshooting page, which is why the
       * reset time can be surfaced: the string contains it. */
      /* Shown in the picker menu as Low / Medium / High (Default) / Extra high /
       * Max, but abbreviated on the chip itself. The last two are the ones
       * worth warning about: Anthropic says higher effort reaches the usage
       * limit faster, and the UI gives no hint that the setting costs
       * anything. */
      efforts: ['low', 'medium', 'high', 'extra high', 'max'],
      costlyEfforts: ['extra high', 'max'],

      limits: {
        window: '5h + weekly',
        showsReset: true,
        strings: ['Approaching 5-hour limit', '5-hour limit reached'],
        dashboard: 'Settings → Usage',
        /* Anthropic deliberately does not publish message counts, so Lantern
         * must not invent one. Effort level and conversation length are the
         * levers a user can actually pull. */
        noMessageCount: true,
        note: { de: 'Claude zählt keine Nachrichten, sondern Aufwand. Die Stufe neben dem Modellnamen (Low bis Max) und die Länge des Chats bestimmen, wie schnell dein Limit fällt.',
                en: 'Claude counts effort, not messages. The level next to the model name (Low to Max) and the length of the chat are what drain your limit.' }
      },

      /* Anthropic's own Opus 5 system card: sycophancy roughly doubles when the
       * user pushes back. That is a specific, checkable thing to warn about,
       * and it is the opposite of what a beginner expects — they think
       * disagreeing gets them a better answer. */
      sycophancy: {
        risk: 'high',
        note: { de: 'Wenn du widersprichst, stimmt Claude messbar häufiger einfach zu, statt bei seiner Einschätzung zu bleiben. Frag lieber „was spricht dagegen?" als „bist du sicher?".',
                en: 'When you push back, Claude measurably more often just agrees instead of holding its position. Ask "what argues against this?" rather than "are you sure?".' }
      }
    },

    /* ------------------------------------------------------------- Gemini */
    gemini: {
      id: 'gemini',
      label: 'Gemini',
      capWords: {
        /* Google's help page gives one route for both of these: the button in
         * the text box that also takes files. So both point at the same place,
         * and Canvas points at nothing else because there is nothing else. */
        web: [],
        canvas: ['canvas', 'dateien hinzuf\u00fcgen', 'add files'],
        research: ['deep research', 'dateien hinzuf\u00fcgen', 'add files'],
        image: [],
        code: []
      },
      vendor: 'Google',
      hosts: ['gemini.google.com'],
      accent: '#4285f4',

      dom: {
        composer: ['rich-textarea .ql-editor', 'div[contenteditable="true"]',
                   'textarea[aria-label]'],
        message: 'user-query, model-response',
        assistant: 'model-response, message-content.model-response-text',
        user: 'user-query, .query-text',
        code: 'pre code',
        /* Sits under the composer, and its label has changed at least three
         * times in nine months. Tier matching, not name matching. */
        modelPicker: ['bard-mode-switcher button', '[data-test-id="bard-mode-menu-button"]',
                      'button[aria-label*="odel"]']
      },

      newChat: function (base) { return (base || 'https://gemini.google.com/') + 'app'; },
      prefillSupported: false,

      /* No documented conversion threshold found. Left null rather than guessed
       * — a wrong number here produces a warning that fires at the wrong time,
       * which is worse than no warning. */
      paste: { limit: null, documented: false, revert: null },

      order: ORDER_MATERIAL_FIRST,
      wrap: 'headings',          // Google: XML or Markdown, pick one, never mix

      shape: {
        /* Google's own warning: the model "will sometimes ignore instructions in
         * order to maintain adherence to the described persona". A role line
         * can eat the user's format and scope instructions, so Lantern leaves
         * it out unless the user set one themselves. */
        persona: 'avoid',
        askForReasoning: 'ok',
        selfCheck: 'ok',
        /* Google asks for an explicit anchor after long context. */
        anchorClosing: true,
        /* "Place your core request and most critical restrictions as the final
         * line… negative constraints should be placed at the end." */
        negativesLast: true,
        /* "Gemini 3 responds best to direct, clear instructions" and "may
         * over-analyze verbose or overly complex prompt engineering techniques
         * used for older models." So the built prompt itself stays lean. */
        leanPrompt: true
      },

      tiers: [
        { id: 'deep',     names: ['pro', 'ultra', 'deep think'], label: { de: 'weniger Prompt-Vorgaben', en: 'lighter prompt framing' } },
        { id: 'balanced', names: ['flash', 'thinking'],          label: { de: 'ausgewogene Prompt-Vorgaben', en: 'balanced prompt framing' } },
        { id: 'fast',     names: ['flash-lite', 'lite', 'fast'], label: { de: 'explizitere Prompt-Vorgaben', en: 'more explicit prompt framing' } }
      ],

      tierRules: {
        deep:     { qualityCap: 3 },
        balanced: { qualityCap: 4 },
        fast:     { qualityCap: 5, orderLine: true }
      },

      /* Google does not run a Statuspage for Gemini — its dashboards are HTML
       * with no CORS-readable feed. Left null rather than pointed at something
       * that cannot be read: a status line that never loads is worse than an
       * honest absence. */
      status: null,

      /* Gemini exposes a reasoning-effort control too, unusually for a consumer
       * chat app: Standard / Extended / Deep Think (Ultra only). Extended burns
       * the compute quota much faster, and as with Claude's effort chip nothing
       * in the UI says that the setting costs anything. */
      efforts: ['standard', 'extended', 'deep think'],
      costlyEfforts: ['extended', 'deep think'],

      limits: {
        window: '5h + weekly',
        showsReset: true,
        dashboard: 'gemini.google.com/usage',
        /* Two facts a Gemini user can act on that nobody tells them: the picker
         * is sticky, so one Pro selection keeps costing; and Flash-Lite does
         * not count against the quota at all. */
        sticky: true,
        freeTier: { id: 'fast', unmetered: true },

        /* THE STRING IS A GUESS AND IS MARKED AS ONE.
         *
         * Google moved to compute-based five-hourly and weekly limits on
         * 17 May 2026, and the only verbatim limit strings anyone has posted
         * are from 2025 and name per-model caps that no longer exist
         * ("your limit on 2.5 Pro until Sep 10, 5:17 PM"). Google confirms in
         * its own help pages that both a nearing-limit and a limit-reached
         * notification exist, and publishes neither wording.
         *
         * So this matches only the stem that survived every observed variant,
         * and `requireTime` makes it useless on its own: it fires only when a
         * clock time or a date sits beside it, outside every message node.
         * A limit banner names when it lifts; a paragraph *about* limits
         * usually does not. Without that second condition the phrase is a
         * false-positive generator, because the likeliest place on the page
         * for the words "you have reached your limit" is inside an answer to
         * someone who asked what happens when you reach your limit. */
        strings: ['reached your limit', 'reached the limit for this feature'],
        requireTime: true,

        note: { de: 'Das Modell bleibt ausgewählt, auch in neuen Chats – wer einmal Pro gewählt hat, verbraucht weiter Pro-Kontingent. Flash-Lite zählt gar nicht gegen dein Limit. Wie viel du verbraucht hast, steht auf gemini.google.com/usage.',
                en: 'The model stays selected across chats — pick Pro once and you keep spending Pro quota. Flash-Lite does not count against your limit at all. What you have used is shown at gemini.google.com/usage.' }
      },

      /* The free tier's context window is 32k, not the 1M Google advertises.
       * "Gemini forgets things in long chats" is not a bug the user can fix by
       * complaining; it is the ceiling they are on. */
      context: {
        note: { de: 'Ohne Abo hat Gemini ein deutlich kürzeres Gedächtnis (rund 32.000 Zeichenblöcke). Dass es in langen Chats den Faden verliert, ist keine Störung, sondern die Grenze – dagegen hilft nur umziehen.',
                en: 'Without a subscription Gemini has a much shorter memory (about 32k tokens). Losing the thread in a long chat is not a fault, it is the ceiling — the fix is to move the chat.' }
      },

      /* Gemini's characteristic failure is not refusing and not hedging. It is
       * fluent, confident assertion where another model would abstain, and it
       * leans on user-generated content far more than its peers when it does
       * search. Both are worth a requirement line, not just a warning. */
      assertsConfidently: {
        risk: 'high',
        note: { de: 'Gemini rät eher selbstbewusst, als zu sagen „weiß ich nicht". Bei Fakten lohnt es sich, ausdrücklich Quellen und ein „sag es, wenn du unsicher bist" zu verlangen.',
                en: 'Gemini will guess confidently rather than say "I do not know". For factual work it is worth explicitly demanding sources and a "say so if you are unsure".' }
      }
    }
  };

  /* Which assistant are we standing in? Hostname only — never the page title or
   * anything the page can change. */
  function detect(hostname, doc) {
    var h = String(hostname || '').toLowerCase().replace(/^www\./, '');

    /* Loopback only: let a local test page declare which provider it is
     * standing in for, via <html data-ln-provider="claude">.
     *
     * This is a test seam, and it is written to be one that cannot be abused.
     * The gate is the hostname, checked first and exactly: only 127.0.0.1 and
     * localhost, which no remote site can present. A page on the open web
     * cannot reach this branch however it labels itself, so a lookalike domain
     * gains nothing by adding the attribute. The alternative — shipping a
     * separate build for tests — means the tested code is not the shipped
     * code, which is worse. */
    if (h === '127.0.0.1' || h === 'localhost') {
      try {
        var want = (doc || document).documentElement.getAttribute('data-ln-provider');
        if (want && PROVIDERS[want]) return PROVIDERS[want];
      } catch (e) {}
      return null;
    }

    for (var id in PROVIDERS) {
      if (!Object.prototype.hasOwnProperty.call(PROVIDERS, id)) continue;
      var hosts = PROVIDERS[id].hosts;
      for (var i = 0; i < hosts.length; i++) {
        if (h === hosts[i] || h.slice(-(hosts[i].length + 1)) === '.' + hosts[i]) {
          return PROVIDERS[id];
        }
      }
    }
    return null;
  }

  /* A model name → a tier, defensively. An unrecognised model is 'balanced',
   * which is the right default anyway, so a renamed model degrades to sensible
   * rather than to broken. Longest match wins so "flash-lite" beats "flash". */
  function tierOf(provider, name) {
    if (!provider || !name) return 'balanced';
    var n = String(name).toLowerCase();
    var best = null, bestLen = 0;
    (provider.tiers || []).forEach(function (t) {
      (t.names || []).forEach(function (k) {
        if (n.indexOf(k) !== -1 && k.length > bestLen) { best = t.id; bestLen = k.length; }
      });
    });
    return best || 'balanced';
  }

  /* The model family, for the per-model rules Anthropic publishes. Same
   * defensive shape: no match means no family-specific adjustment. */
  function familyOf(provider, name) {
    if (!provider || !name || !provider.familyRules) return null;
    var n = String(name).toLowerCase();
    var best = null, bestLen = 0;
    Object.keys(provider.familyRules).forEach(function (f) {
      if (n.indexOf(f) !== -1 && f.length > bestLen) { best = f; bestLen = f.length; }
    });
    return best;
  }

  var API = {
    all: PROVIDERS,
    detect: detect,
    tierOf: tierOf,
    familyOf: familyOf,
    byId: function (id) { return PROVIDERS[id] || null; },
    ids: function () { return Object.keys(PROVIDERS); }
  };

  if (typeof window !== 'undefined') window.LN_PROVIDERS = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
