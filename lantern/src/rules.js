/* Lantern — rules and templates.
 *
 * This file is the *knowledge* of the local engine. It is separated from
 * engine.js on purpose: engine.js holds the stable structure, this file holds
 * everything that might age. A hosted rules.json with the same shape can
 * replace it at runtime (see background.js), so advice can be updated without
 * shipping a new extension build.
 */

window.LN_RULES = {
  version: '1.0.1',
  updated: '2026-09-20',

  /* Section headings used when assembling the prompt. */
  headers: {
    de: {
      task: 'AUFGABE',
      goal: 'WAS ICH ZURÜCK HABEN WILL',
      context: 'KONTEXT',
      example: 'BEISPIEL',
      material: 'MEIN MATERIAL',
      parts: 'MEIN MATERIAL (IN TEILEN)',
      close: 'ZUM SCHLUSS',
      req: 'ANFORDERUNGEN',
      format: 'AUSGABEFORMAT',
      quality: 'QUALITÄT',
      clarify: 'BEVOR DU ANFÄNGST',
      assume: 'UMGANG MIT LÜCKEN',
      audienceLabel: 'Zielgruppe',
      lengthLabel: 'Länge',
      toneLabel: 'Ton',
      includeLabel: 'Muss enthalten',
      avoidLabel: 'Unbedingt vermeiden',
      exampleNote: 'Orientiere dich an diesem Beispiel für Aufbau, Länge und Ton. Übernimm keine Inhalte daraus — nur die Form.'
    },
    en: {
      task: 'TASK',
      goal: 'WHAT I WANT BACK',
      context: 'CONTEXT',
      example: 'EXAMPLE',
      material: 'MY MATERIAL',
      parts: 'MY MATERIAL (IN PARTS)',
      close: 'FINALLY',
      req: 'REQUIREMENTS',
      format: 'OUTPUT FORMAT',
      quality: 'QUALITY BAR',
      clarify: 'BEFORE YOU START',
      assume: 'HANDLING GAPS',
      audienceLabel: 'Audience',
      lengthLabel: 'Length',
      toneLabel: 'Tone',
      includeLabel: 'Must include',
      avoidLabel: 'Must avoid',
      exampleNote: 'Use this example as a guide for structure, length and tone. Do not reuse any of its content — only its shape.'
    }
  },

  /* Phrases people put in front of a request that carry no information.
   * IMPORTANT: only pure framing belongs here. Verbs like "schreib mir" or
   * "erstelle mir" ARE the instruction — stripping them turns "schreib mir eine
   * Mail" into the bare fragment "eine Mail" and loses the task. */
  leadIns: [
    'hey chatgpt', 'hallo chatgpt', 'chatgpt', 'hey', 'hallo', 'hi',
    'kannst du mir', 'kannst du', 'könntest du bitte', 'könntest du',
    'ich brauche', 'ich bräuchte', 'ich will', 'ich möchte', 'ich hätte gerne',
    'ich suche', 'bitte',
    'can you please', 'can you', 'could you please', 'could you',
    'i need', 'i want', 'i would like', "i'd like", 'please'
  ],

  /* Words that signal the request has not been thought through yet.
   * Matched on whole-word boundaries only — as substrings, "halt" fires inside
   * "Inhalt"/"Verhalten" and "gut" inside "Gutachten". */
  vagueWords: [
    'irgendwie', 'irgendwas', 'irgendein', 'etwas', 'sowas', 'halt',
    'einfach mal', 'kurz mal', 'gut', 'besser', 'schön', 'professionell',
    'ansprechend', 'ordentlich', 'passend',
    'something', 'somehow', 'nice', 'good', 'better', 'professional',
    'engaging', 'quick', 'stuff', 'decent', 'proper'
  ],

  /* Applied to every prompt. Deliberately short, and shorter than it was.
   *
   * OpenAI's GPT-5.6 guidance and independent write-ups both land in the same
   * place: leaner prompts score better, and "behavioural prohibitions targeting
   * obsolete weaknesses" are now noise. The 2024 failure mode was laziness; the
   * 2026 one is over-eagerness and scope creep. So the anti-preamble nagging is
   * gone and a scope boundary took its place — the guard that matches the
   * failure these models actually have. */
  /* The one guard that is right everywhere. Saying „ich weiß es nicht" instead
   * of inventing helps a question and a deliverable equally. */
  universalGuards: {
    de: [
      'Wenn dir Informationen fehlen oder du bei einer Tatsache unsicher bist, sag das deutlich, statt zu raten.'
    ],
    en: [
      'If information is missing or you are unsure about a fact, say so plainly instead of guessing.'
    ]
  },

  /* The one that used to be universal and should never have been.
   *
   * From the A/B Lantern lost: „ich möchte ein ärztliches Attest aber es ist zu
   * spät und die haben zu". Without Lantern, ChatGPT volunteered the 116117
   * Bereitschaftsdienst, the Bereitschaftspraxis, a video consultation and a
   * word with the school. With Lantern it volunteered nothing and asked a
   * question instead — because this line had told it not to volunteer.
   *
   * It is a good guard on something being BUILT, where the 2026 failure mode is
   * over-delivery. On a question it forbids exactly the thing that makes an
   * answer useful. So it goes where it belongs and nowhere else. */
  deliveryGuards: {
    de: [
      'Bleib bei dem, worum ich gebeten habe. Wenn dir zusätzliche Arbeit sinnvoll erscheint, schlag sie vor, statt sie ungefragt zu erledigen.'
    ],
    en: [
      'Stay within what I asked for. If further work seems worthwhile, suggest it rather than doing it unasked.'
    ]
  },

  /* Words that say the useful answer depends on something that changes. Used
   * only to SUGGEST the web-search chip, never to switch anything on, so a miss
   * costs nothing and a false hit costs a sentence. */
  capSignals: {
    web: [
      'aktuell', 'gerade', 'heute', 'jetzt', 'momentan', 'zurzeit', 'derzeit',
      'öffnungszeit', 'geöffnet', 'geschlossen', 'haben zu', 'hat zu', 'notdienst',
      'in der nähe', 'nähe', 'wo finde ich', 'wo bekomme ich', 'wo kann ich',
      'preis', 'kostet', 'kosten', 'telefonnummer', 'nummer von', 'adresse',
      'dieses jahr', 'neueste', 'neuesten', 'aktuelle', 'aktuellen', 'wer ist',
      'currently', 'right now', 'today', 'nearest', 'near me', 'opening hours',
      'open now', 'closed', 'price of', 'how much does', 'latest', 'this year',
      'who is the', 'where can i', 'where do i'
    ]
  },

  /* -------------------------------------------------------------------------
   * MODEL TIERS
   *
  * ChatGPT's 2026 line-up is Astra, then GPT-5.6 Sol / Terra / Luna. Lantern
  * maps them to prompt-framing profiles, not a ranking by price, speed, or
  * quality. The only claim is about how much scaffolding this prompt needs.
   *
   * It also means the sharpen step does not need the expensive one — writing a
   * prompt is a light job.
   * --------------------------------------------------------------------- */
  modelTiers: [
    { id: 'deep', names: ['astra', 'sol'], label: { de: 'weniger Prompt-Vorgaben', en: 'lighter prompt framing' } },
    { id: 'balanced', names: ['terra'], label: { de: 'ausgewogene Prompt-Vorgaben', en: 'balanced prompt framing' } },
    { id: 'fast', names: ['luna', 'mini'], label: { de: 'explizitere Prompt-Vorgaben', en: 'more explicit prompt framing' } }
  ],

  /* Reasoning-shaped work. A persona helps a model adopt a *voice*; it does not
   * help it think, and the write-ups say it actively constrains reasoning. So
   * the role line is dropped for these when a reasoning model is in use. */
  reasoningArchetypes: ['calculate', 'analyze', 'decide', 'plan', 'data', 'recall', 'learn'],

  /* The other side of the same coin. A persona helps a model adopt a voice and
   * does not help it think, so on a short request the role line is kept only
   * where the voice IS the work. */
  voiceArchetypes: ['write', 'edit', 'translate', 'present', 'summarize'],

  /* German builds its nouns by gluing them together, and a word-boundary match
   * cannot see inside the result. „Einarbeitungsplan" is a plan; „Jahresbericht"
   * is a report; the keyword lists saw neither and the archetype came out as
   * `general` — which, since 1.5.0, means Lantern says nothing at all. A
   * detection gap in German is now a silence, so it is worth closing.
   *
   * Only endings that name a deliverable, only on a real compound (the word has
   * to be meaningfully longer than the ending), and scored like an ordinary
   * keyword rather than a certainty. */
  compoundEndings: {
    plan: 'plan',
    liste: 'plan',
    konzept: 'plan',
    fahrplan: 'plan',
    bericht: 'write',
    brief: 'write',
    mail: 'write',
    vorlage: 'write',
    schreiben: 'write',
    protokoll: 'summarize',
    zusammenfassung: 'summarize',
    übersicht: 'summarize',
    analyse: 'analyze',
    auswertung: 'analyze'
  },

  /* --------------------------------------------------------------------------
   * CAPABILITIES — what each assistant can do beyond writing a reply, and how a
   * person actually gets at it.
   *
   * Checked 11 September 2026 against the three vendors' own help pages. It
   * will go stale; that is what the rules channel is for.
   *
   * The three do NOT work the same way, and the differences are the whole
   * reason this table exists rather than one sentence:
   *
   *   Claude's artifacts appear by themselves, and the only thing that can stop
   *   them is a setting the user has probably never opened.
   *   Gemini's Canvas cannot be asked for at all. It is a button under the
   *   text box and nothing you write in the message will summon it.
   *   ChatGPT's deep research is metered by the month, so switching it on for
   *   somebody without telling them spends something of theirs.
   *
   * That last one settles what Lantern is allowed to do here. It words the
   * request, it says where the control is, and the in-page layer rings the
   * control if it can find it — and then the person presses it. Lantern does
   * not press it. Partly because a wrong selector would be clicking something
   * unknown in somebody's account, partly because of the quota, and mostly
   * because the person who pressed it once knows where it is forever, and the
   * person it was pressed for does not.
   * ------------------------------------------------------------------------ */
  capabilities: {
    checked: '2026-09-11',
    list: ['web', 'canvas', 'research', 'image', 'code'],

    labels: {
      de: {
        web: 'Im Netz suchen',
        canvas: 'Bearbeitbares Dokument',
        research: 'Gründlich recherchieren',
        image: 'Ein Bild erzeugen',
        code: 'Mit Code rechnen'
      },
      en: {
        web: 'Search the web',
        canvas: 'An editable document',
        research: 'Research it properly',
        image: 'Make a picture',
        code: 'Work it out with code'
      }
    },

    /* What each one is FOR, in the user's terms. Shown once, under the row,
     * for the one that is selected — not five tooltips nobody opens. */
    what: {
      de: {
        web: 'Für alles, was sich ändert: Preise, Regeln, wer gerade was ist. Ohne das antwortet die KI aus dem Gedächtnis und merkt nicht, dass es veraltet ist.',
        canvas: 'Für längere Texte und Code. Du bekommst ein Fenster zum Bearbeiten statt einer Chatnachricht, die beim nächsten Versuch von vorn anfängt.',
        research: 'Für große Fragen. Die KI liest erst mehrere Quellen und antwortet dann. Das dauert Minuten statt Sekunden.',
        image: 'Für Bilder statt Text.',
        code: 'Für Zahlen. Gerechnet ist zuverlässiger als geschätzt, und beim Schätzen sieht man der Antwort nicht an, dass sie geschätzt war.'
      },
      en: {
        web: 'For anything that changes: prices, rules, who currently holds a job. Without it the AI answers from memory and cannot tell that the memory is out of date.',
        canvas: 'For longer text and code. You get a window you can edit rather than a chat message that starts over on the next attempt.',
        research: 'For big questions. The AI reads several sources first and answers afterwards. That takes minutes rather than seconds.',
        image: 'For pictures instead of text.',
        code: 'For numbers. Worked out beats estimated, and an estimate does not look like an estimate once it is written down.'
      }
    },

    /* The line that goes into the prompt. Never trimmed by the instruction
     * budget: the user picked it, so it is theirs. */
    lines: {
      de: {
        web: 'Such dafür im Netz. Nenne die Quellen, die du benutzt hast, mit Datum.',
        canvas: 'Leg das Ergebnis als bearbeitbares Dokument an, nicht als Chatnachricht.',
        research: 'Recherchier das gründlich, bevor du antwortest. Nenne deine Quellen.',
        image: 'Erzeuge dazu ein Bild.',
        code: 'Rechne das mit Code aus, statt zu schätzen. Zeig mir die Rechnung.'
      },
      en: {
        web: 'Search the web for this. Name the sources you used, with dates.',
        canvas: 'Put the result in an editable document rather than a chat message.',
        research: 'Research this properly before answering. Name your sources.',
        image: 'Make a picture of this as well.',
        code: 'Work this out with code rather than estimating it. Show me the working.'
      }
    },

    /* how:
     *   'ask'     — asking in the message is enough, there is nothing to press
     *   'auto'    — it happens by itself when it applies
     *   'button'  — there is a control, and the words may not be enough alone
     *   'setting' — a one-time switch somewhere in the settings
     *   'none'    — this assistant cannot do it
     * line: false — do not put the prompt line in for this one, it does nothing
     */
    where: {
      chatgpt: {
        web: { how: 'button',
          de: 'Die Websuche sitzt im Plus-Menü unter dem Eingabefeld. Meistens sucht ChatGPT aber schon, wenn du in der Nachricht darum bittest.',
          en: 'Web search sits in the plus menu under the text box. Usually ChatGPT will search anyway if the message asks it to.' },
        canvas: { how: 'button',
          de: 'Canvas steht im selben Plus-Menü. Bei längeren Texten schaltet ChatGPT es oft von allein ein.',
          en: 'Canvas is in the same plus menu. For longer text ChatGPT often turns it on by itself.' },
        research: { how: 'button', meter: true,
          de: 'Deep research findest du im Plus-Menü unter dem Eingabefeld. Davon hast du pro Monat nur eine begrenzte Zahl. Heb es dir für große Fragen auf.',
          en: 'Deep research is in the plus menu under the text box. You only get a limited number of these a month, so save them for big questions.' },
        image: { how: 'ask',
          de: 'Ein Bild erzeugt ChatGPT direkt aus deiner Nachricht. Du musst nichts einschalten.',
          en: 'ChatGPT makes a picture straight from your message. There is nothing to switch on.' },
        code: { how: 'ask',
          de: 'ChatGPT rechnet auf Wunsch mit Code. Du musst nichts einschalten.',
          en: 'ChatGPT will work things out with code if asked. There is nothing to switch on.' }
      },
      claude: {
        web: { how: 'button',
          de: 'Die Websuche sitzt im Menü unter dem Eingabefeld. Die Bitte in der Nachricht reicht meistens auch.',
          en: 'Web search sits in the menu under the text box. Asking in the message usually works too.' },
        canvas: { how: 'auto',
          de: 'Claude legt so etwas von selbst als Artifact an. Falls nicht, schalte es einmalig in den Einstellungen unter Capabilities ein. Der Punkt heißt „Code execution and file creation“.',
          en: 'Claude makes these by itself, as an Artifact. If it does not, switch it on once in Settings under Capabilities. The item is called "Code execution and file creation".' },
        research: { how: 'button',
          de: 'Research findest du im Menü unter dem Eingabefeld.',
          en: 'Research is in the menu under the text box.' },
        image: { how: 'none', line: false,
          de: 'Claude erzeugt keine Bilder. Dafür sind ChatGPT und Gemini da.',
          en: 'Claude does not make pictures. ChatGPT and Gemini do.' },
        code: { how: 'ask',
          de: 'Claude rechnet auf Wunsch mit Code. Du musst nichts einschalten.',
          en: 'Claude will work things out with code if asked. There is nothing to switch on.' }
      },
      gemini: {
        web: { how: 'auto',
          de: 'Gemini sucht bei aktuellen Fragen meist von selbst. Die Bitte in der Nachricht macht es sicherer.',
          en: 'Gemini usually searches by itself on current questions. Asking in the message makes it surer.' },
        /* The one that cannot be asked for. Google's own help page gives the
         * button and gives no text route at all, so a prompt line here would be
         * an instruction that does nothing — and an instruction that does
         * nothing still costs attention. */
        canvas: { how: 'button', line: false,
          de: 'Canvas gibt es bei Gemini nur über den Knopf. Im Eingabefeld auf Dateien hinzufügen, dann Canvas. Die Bitte in der Nachricht allein genügt dort nicht.',
          en: 'On Gemini, Canvas is the button or nothing. In the text box choose Add Files, then Canvas. Asking for it in the message will not do it.' },
        research: { how: 'button', meter: true,
          de: 'Deep Research wählst du im Eingabefeld unter Dateien hinzufügen. Wie viele du am Tag hast, hängt von deinem Tarif ab.',
          en: 'Choose Deep Research in the text box, under Add Files. How many you get a day depends on your plan.' },
        image: { how: 'ask',
          de: 'Gemini erzeugt Bilder direkt aus deiner Nachricht.',
          en: 'Gemini makes pictures straight from your message.' },
        code: { how: 'ask',
          de: 'Gemini rechnet auf Wunsch mit Code.',
          en: 'Gemini will work things out with code if asked.' }
      }
    }
  },

  tierLines: {
    de: {
      fast: 'Geh die Abschnitte oben der Reihe nach durch und lass keinen aus.',
      deep: null, balanced: null
    },
    en: {
      fast: 'Work through the sections above in order and skip none of them.',
      deep: null, balanced: null
    }
  },

  /* Optional behaviours the user switches on with the toggles. */
  /* Two strings below keep straight ASCII quotes deliberately: `toggles.improve`
   * and `assume` are sent TO the assistant and quote a literal heading it is
   * asked to produce. Typographic quotes there would ask for a heading nobody
   * would type back. Display text uses „…“ and “…”. */
  toggles: {
    /* Removed in 0.8.0: "outline your approach first". Explicit
     * chain-of-thought prompting measurably reduced instruction-following
     * across 15 models, and current models expose reasoning effort as a
     * setting rather than something you ask for in prose. */
    scope: {
      de: 'Liefere genau das Angefragte und nichts darüber hinaus. Sag mir am Ende in einer Zeile, was du bewusst weggelassen hast.',
      en: 'Deliver exactly what was asked and nothing beyond it. Tell me in one line at the end what you deliberately left out.'
    },
    /* „Das gehört nicht zum Ergebnis selbst" is not padding. It resolves a
     * contradiction this file shipped with: the artifact goal says to deliver
     * the finished thing with no preamble and no closing remarks, and this
     * toggle — which is ON by default — then asks for a closing section. Both
     * lines were in every prompt a tester was shown. The stacking-collapse work
     * finds about 12% of instruction pairs that are satisfiable on paper
     * conflict in practice, and this is one of them: the model has to decide
     * which of the two to believe, and nothing tells it. Now something does. */
    improve: {
      de: 'Setze unter das fertige Ergebnis eine Überschrift „Was das Ergebnis noch besser machen würde“ mit bis zu drei konkreten Angaben, die ich dir liefern könnte. Das gehört nicht zum Ergebnis selbst.',
      en: 'Below the finished result, add a heading "What would make this better" with up to three specific things I could tell you. That part is not the result itself.'
    },
    sources: {
      de: 'Belege überprüfbare Aussagen mit Quellen. Markiere klar, was gesichert ist und was Einschätzung ist.',
      en: 'Back verifiable claims with sources. Clearly mark what is established fact and what is your judgement.'
    },
    ignoreMemory: {
      de: 'Nutze für diese Aufgabe ausschließlich, was in dieser Nachricht steht. Ignoriere gespeicherte Informationen über mich – wenn dir etwas fehlt, frag nach, statt es zu ergänzen.',
      en: 'For this task use only what is in this message. Ignore anything you have saved about me — if something is missing, ask me rather than filling it in.'
    }
  },

  clarify: {
    de: (n, hints) =>
      `Diese Anfrage lässt noch wichtige Punkte offen. Stelle mir zuerst höchstens ${n} kurze, konkrete Fragen${hints ? ' (zum Beispiel: ' + hints + ')' : ''}. Nummeriere sie und warte auf meine Antwort, bevor du mit der Aufgabe beginnst.`,
    en: (n, hints) =>
      `This request leaves important points open. First ask me at most ${n} short, specific questions${hints ? ' (for example: ' + hints + ')' : ''}. Number them and wait for my answer before starting the task.`
  },

  /* Reported by a tester, on a request reading „Make a mtg deck focused on
   * Dina": the model chose which Dina, which format, which budget and which
   * power level, and delivered a hundred cards nobody had asked for. It was
   * doing what it was told. The old wording here handed it a licence — make a
   * sensible assumption and carry on — and the clarify block that was supposed
   * to hold it back only fired on requests the engine had already called
   * vague. Two instructions that contradict each other get resolved the lazy
   * way, every time.
   *
   * So the licence is gone. Assumptions are still listed, because that part was
   * always useful; what changed is that a decision big enough to change the
   * result is no longer one the model may take. */
  assume: {
    de: 'Nimm die naheliegendste Möglichkeit, wenn ich etwas nicht gesagt habe. Schreib solche Annahmen am Ende unter „Annahmen“ auf. Wenn eine Festlegung das ganze Ergebnis verändert, frag mich lieber vorher.',
    en: 'Take the most likely option where I did not say. List those assumptions at the end under "Assumptions". If a choice would change the whole result, ask me first instead.'
  },

  /* The one line that replaces a whole clarify block on a short request.
   *
   * Lantern cannot know that a Commander deck needs a format and a poem does
   * not — that is knowledge about decks, and there is no list of it. The model
   * has that knowledge. So the judgement is handed to the model in one
   * sentence, and it comes out right in both directions: the poem gets written,
   * the deck gets a question about which Dina. */
  askFirst: {
    de: 'Frag mich vorher, wenn du dafür etwas festlegen musst, das eigentlich meine Entscheidung ist. Höchstens vier kurze Fragen, sonst fang direkt an. Erfinde keine Vorgaben, die ich dir nicht gegeben habe.',
    en: 'Ask me first if you have to settle something here that is really mine to settle. At most four short questions, otherwise get straight on with it. Do not invent requirements I did not give you.'
  },

  briefAsk: {
    de: 'Frag vor dem Schreiben nur nach den fehlenden Angaben. Erfinde keine davon.',
    en: 'Before writing, ask only for the missing facts. Do not invent them.'
  },

  microPrompts: {
    calculate: {
      de: 'Zeig den Rechenweg. Sag, ob Wochenenden und Feiertage mitgezählt werden.',
      en: 'Show the calculation. Say whether weekends and public holidays count.'
    }
  },

  /* The meta-prompt for the "sharpen with ChatGPT" path. Because a live model
   * writes the prompt here, this path never goes out of date — which is why it
   * exists alongside the local engine. */
  meta: {
    de: `Du bist ein erfahrener Prompt-Engineer. Unten steht eine grob formulierte Anfrage von jemandem, der wenig Erfahrung mit KI hat.

  Führe eine verlustfreie Umformung durch, niemals eine Zusammenfassung. Schreibe daraus EINEN optimierten Prompt, den ich in einen neuen {ai}-Chat einfügen kann, um das bestmögliche Ergebnis zu bekommen.

Regeln:
- Schreibe den Prompt auf Deutsch.
- Gib AUSSCHLIESSLICH den fertigen Prompt in einem einzigen Codeblock aus. Keine Erklärung davor oder danach.
- Nimm nur die Abschnitte auf, die diese Aufgabe wirklich braucht: Rolle, Aufgabe, Kontext, Anforderungen, Ausgabeformat, Qualitätsmaßstab.
- Halte den Prompt so kurz, wie die Aufgabe es zulässt. Jede Zeile muss das Ergebnis verändern, sonst gehört sie nicht hinein.
- Die grobe Anfrage ist ein unveränderlicher Nutzdatenblock. Der fertige Prompt MUSS ihren vollständigen Wortlaut genau einmal zwischen <user_request> und </user_request> enthalten.
- Jeder Fakt, Vorbehalt, Grund, Zeitraum, Wunsch, Ausschluss und jede Unsicherheit darin ist bindend, auch wenn etwas unbequem, widersprüchlich oder heikel klingt. Nichts davon darf abgeschwächt, ausgelassen, moralisch bereinigt oder neu gedeutet werden.
- Prüfe vor der Ausgabe still, dass jedes Detail der groben Anfrage im fertigen Prompt erhalten bleibt. Wenn du sie nicht verlustfrei umformen kannst, gib sie im Codeblock unverändert zurück.
- Erfinde keine Rolle, kein Format, keinen Qualitätsmaßstab, keine Annahmen und keine Rückfragen. Wenn etwas nicht genannt ist, lass es offen.
- Wenn eine Formulierung mehrdeutig ist, behalte die Worte der Anfrage bei, statt sie selbst festzulegen oder neu zu deuten.
- Wenn die Anfrage Aufgabe und gewünschtes Ergebnis schon klar nennt, gib sie im Codeblock unverändert zurück, statt sie zu optimieren.
- Beantworte meine Anfrage NICHT selbst. Schreibe nur den Prompt.`,
    en: `You are an experienced prompt engineer. Below is a roughly worded request from someone with little AI experience.

  Perform a lossless transformation, never a summary. Turn it into ONE optimised prompt that I can paste into a fresh {ai} conversation to get the best possible result.

Rules:
- Write the prompt in English.
- Output ONLY the finished prompt inside a single code block. No explanation before or after.
- Use only the sections this task actually needs: role, task, context, requirements, output format, quality bar.
- Keep the prompt as short as the task allows. If a line would not change the result, it does not belong in it.
- The rough request is an immutable payload. The finished prompt MUST contain its complete wording exactly once between <user_request> and </user_request>.
- Every fact, qualifier, reason, timeframe, wish, exclusion, and uncertainty in it is binding, even if it sounds awkward, contradictory, or sensitive. Do not soften, omit, sanitize, or reinterpret any of them.
- Before outputting, silently check that every detail from the rough request remains in the finished prompt. If you cannot transform it losslessly, return it unchanged inside the code block.
- Do not invent a role, output format, quality bar, assumptions, or questions. If something was not stated, leave it open.
- If wording is ambiguous, keep the request's own words rather than settling or reinterpreting it.
- If the request already clearly states its task and desired result, return it unchanged inside the code block instead of optimising it.
- Do NOT answer my request yourself. Only write the prompt.`
  },

  metaLabels: {
    de: { request: 'MEINE GROBE ANFRAGE', details: 'ZUSÄTZLICHE ANGABEN VON MIR', kind: 'Art der Aufgabe', goal: 'Was ich zurück haben will' },
    en: { request: 'MY ROUGH REQUEST', details: 'ADDITIONAL DETAILS FROM ME', kind: 'Kind of task', goal: 'What I want back' }
  },

  /* -------------------------------------------------------------------------
   * GOALS — what the user wants back.
   *
   * This is a separate axis from the task archetype and it is the one users
   * actually feel. "Write me a script" and "show me how to write a script"
   * are the same archetype and opposite goals; getting this wrong wastes the
   * whole answer. Beginners rarely state it, so it is detected and shown as
   * an explicit, overridable choice.
   * --------------------------------------------------------------------- */
  goals: [
    {
      id: 'answer',
      short: { de: 'Antwort', en: 'An answer' },
      label: { de: 'Antwort auf eine Frage', en: 'An answer to a question' },
      hint: { de: 'Du willst etwas wissen.', en: 'You want to know something.' },
      keywords: ['was ist', 'was sind', 'was war', 'was bedeutet', 'wie viel', 'wieviel', 'wie groß', 'wie lang', 'wie oft', 'wie heißt', 'wie nennt man', 'warum', 'wieso', 'weshalb', 'wer ist', 'wann ist', 'stimmt es', 'gibt es', 'kann das', 'kann man', 'ist es normal',
                 'what is', 'what are', 'what was', 'what does', 'how much', 'how many', 'how large', 'how big', 'how long', 'how often', 'how far', 'how likely', 'why is', 'why do', 'who is', 'when did', 'is it true', 'is it normal', 'can that', 'can it', 'does it', 'what happens', 'odds'],
      directive: {
        de: 'Beantworte meine Frage. Fang mit der Antwort an, danach erst die Begründung. Wenn die Sache umstritten oder unsicher ist, sag das ausdrücklich, statt dich auf eine Seite zu schlagen.',
        en: 'Answer my question. Start with the answer, and only then give the reasoning. If the matter is contested or uncertain, say so explicitly instead of picking a side.'
      },
      brief: {
        /* No length cap here any more. „Die Antwort zuerst in ein bis zwei
         * Sätzen" was meant against preamble and was read as a limit: on a
         * question whose useful answer is four options, it produced two hedging
         * sentences and left the options out. The aim was the order, not the
         * size. */
        de: 'Beantworte meine Frage. Fang mit der Antwort an, nicht mit Vorrede.',
        en: 'Answer my question. Start with the answer, not with a preamble.'
      }
    },
    {
      id: 'artifact',
      short: { de: 'Fertiges Ergebnis', en: 'A finished thing' },
      label: { de: 'Ein fertiges Ergebnis zum Verwenden', en: 'A finished thing I can use' },
      hint: { de: 'Text, Code, Tabelle, Bild – etwas, das du direkt benutzt.', en: 'Text, code, a table, an image — something you use directly.' },
      keywords: ['schreib', 'erstell', 'mach mir', 'mache mir', 'generier', 'entwirf', 'formulier', 'baue mir', 'write me', 'create', 'generate', 'draft me', 'build me', 'design me'],
      directive: {
        de: 'Liefere das fertige Ergebnis, direkt verwendbar. Keine Einleitung, keine Beschreibung deines Vorgehens, kein Nachwort – es sei denn, ich verlange es ausdrücklich.',
        en: 'Deliver the finished result, ready to use. No preamble, no description of your approach, no closing remarks — unless I explicitly ask for them.'
      },
      brief: {
        de: 'Liefere das fertige Ergebnis. Keine Einleitung und kein Nachwort.',
        en: 'Deliver the finished result. No preamble and no closing remarks.'
      }
    },
    {
      id: 'guidance',
      short: { de: 'Anleitung', en: 'Instructions' },
      label: { de: 'Eine Anleitung, damit ich es selbst mache', en: 'Instructions so I can do it myself' },
      hint: { de: 'Du willst es selbst machen und brauchst den Weg dahin.', en: 'You want to do it yourself and need the route.' },
      keywords: ['wie kann ich', 'wie mache ich', 'wie gehe ich', 'wie komme ich', 'anleitung', 'schritt für schritt', 'how do i', 'how can i', 'how to', 'step by step', 'walk me through', 'tutorial'],
      directive: {
        de: 'Gib mir eine Anleitung, die ich selbst ausführen kann. Nenne die konkreten Werkzeuge, Menüpunkte oder Befehle. Erledige die Aufgabe nicht für mich.',
        en: 'Give me instructions I can carry out myself. Name the concrete tools, menu items or commands. Do not do the task for me.'
      },
      brief: {
        de: 'Gib mir die Schritte in der Reihenfolge, in der ich sie ausführen muss.',
        en: 'Give me the steps in the order I have to carry them out.'
      },
      format: {
        de: 'Nummerierte Schritte, einer pro Punkt, in der Reihenfolge der Ausführung. Zu jedem Schritt eine Zeile, woran ich merke, dass er geklappt hat.',
        en: 'Numbered steps, one per point, in the order they are done. For each step, one line on how I know it worked.'
      }
    },
    {
      id: 'feedback',
      short: { de: 'Rückmeldung', en: 'Feedback' },
      label: { de: 'Rückmeldung zu etwas von mir', en: 'Feedback on something of mine' },
      hint: { de: 'Du hast schon etwas und willst wissen, was daran nicht stimmt.', en: 'You already have something and want to know what is wrong with it.' },
      keywords: ['bewerte', 'prüf mal', 'prüfe', 'was hältst du', 'was sagst du zu', 'korrigier', 'gegenlesen', 'feedback', 'review my', 'check my', 'critique', 'what do you think of', 'look at my'],
      directive: {
        de: 'Bewerte mein Material, statt es neu zu schreiben. Beziehe dich auf konkrete Stellen. Schreibe nur dann eine überarbeitete Fassung, wenn ich ausdrücklich darum bitte.',
        en: 'Assess my material rather than rewriting it. Point to specific places in it. Only produce a revised version if I explicitly ask for one.'
      },
      brief: {
        de: 'Bewerte mein Material, statt es neu zu schreiben. Beziehe dich auf konkrete Stellen.',
        en: 'Assess my material rather than rewriting it. Point to specific places in it.'
      },
      format: {
        de: 'Punkte nach Wichtigkeit sortiert. Zu jedem: die Stelle, was daran problematisch ist, und was ich stattdessen tun sollte.',
        en: 'Points ordered by importance. For each: the place, what is wrong with it, and what I should do instead.'
      }
    },
    {
      id: 'ideas',
      short: { de: 'Ideen', en: 'Options' },
      label: { de: 'Mehrere Ideen zur Auswahl', en: 'Options to choose from' },
      hint: { de: 'Du willst verschiedene Möglichkeiten sehen.', en: 'You want to see several possibilities.' },
      keywords: ['ideen', 'vorschläge', 'vorschlag', 'möglichkeiten', 'optionen', 'brainstorm', 'inspiration', 'namen für', 'nenne mir', 'beispiele für', 'gib mir ein paar',
                 'ideas', 'suggestions', 'options for', 'alternatives', 'names for', 'name a thing', 'name some', 'give me examples', 'examples of', 'list some'],
      directive: {
        de: 'Gib mir mehrere deutlich verschiedene Möglichkeiten – keine Varianten derselben Idee. Bewerte sie nicht vorab – das mache ich selbst.',
        en: 'Give me several clearly different possibilities — not variations of the same idea. Do not pre-judge them for me; I will do that.'
      },
      brief: {
        de: 'Gib mir mehrere deutlich verschiedene Möglichkeiten, keine Varianten derselben Idee.',
        en: 'Give me several clearly different possibilities, not variations of the same idea.'
      },
      format: {
        de: 'Nummerierte Liste. Zu jeder Möglichkeit ein Satz, wofür sie sich eignet, und ein Satz, wo ihr Nachteil liegt.',
        en: 'Numbered list. Per option, one sentence on what it suits and one sentence on its drawback.'
      }
    }
  ],

  /* Fallback goal per archetype when nothing in the text signals one. */
  goalDefaults: {
    write: 'artifact', edit: 'artifact', present: 'artifact', analyze: 'feedback', code: 'artifact', learn: 'answer',
    plan: 'guidance', decide: 'answer', summarize: 'artifact', data: 'artifact',
    image: 'artifact', translate: 'artifact', recall: 'answer',
    calculate: 'answer', general: 'answer'
  },

  /* -------------------------------------------------------------------------
   * EXTRACTION — patterns to read out of the user's own wording.
   *
   * People routinely say things like "in 3 sätzen an meine chefin, sachlich"
   * and then get asked for length, audience and tone anyway. Everything the
   * engine can lift straight out of the text is one less question, one less
   * empty field, and a visibly better prompt for no extra effort.
   *
   * Patterns are stored as strings so a hosted rules.json can replace them.
   * Precision beats recall here: a wrong auto-detection is worse than none,
   * because the user has to notice it and undo it.
   * --------------------------------------------------------------------- */
  extract: {
    length: {
      de: '(?:in|mit|max\\.?|maximal|höchstens|unter|ca\\.?|etwa|nicht mehr als)\\s+\\d+\\s*(?:wörtern|wörter|worte|worten|zeichen|sätzen|sätze|satz|stichpunkten|stichpunkte|punkten|punkte|zeilen|absätzen|absätze|seiten)|\\d+\\s*(?:wörter|wörtern|worte|zeichen|sätze|sätzen|stichpunkte|stichpunkten|punkte|zeilen|absätze|seiten)',
      en: '(?:in|with|max\\.?|maximum|at most|no more than|under|about|around)\\s+\\d+\\s*(?:words|characters|sentences|bullet ?points|bullets|points|lines|paragraphs|pages)|\\d+\\s*(?:words|characters|sentences|bullet ?points|bullets|lines|paragraphs|pages)'
    },
    tone: {
      de: '(?:förmlich|formell|höflich|freundlich|sachlich|nüchtern|locker|lässig|witzig|humorvoll|streng|bestimmt|direkt|neutral|herzlich)',
      en: '(?:formal|polite|friendly|casual|informal|funny|humorous|strict|firm|direct|blunt|neutral|warm)'
    },
    // The captured word is checked against audienceNouns before it is trusted:
    // "für die Heizung" must not become an audience.
    audience: {
      de: '(?:für|an)\\s+(?:meine[nrs]?|unsere[nrs]?|die|den|das|einen?|eine)\\s+([A-Za-zÄÖÜäöüß-]{3,})',
      en: '(?:for|to)\\s+(?:my|our|the|an?)\\s+([A-Za-z-]{3,})'
    },
    audienceNouns: [
      'vermieter', 'vermieterin', 'chef', 'chefin', 'kunde', 'kunden', 'kundin',
      'kollegen', 'kollegin', 'team', 'lehrer', 'lehrerin', 'arzt', 'ärztin',
      'bank', 'versicherung', 'eltern', 'freund', 'freundin', 'nachbarn',
      'nachbar', 'mieter', 'mitarbeiter', 'geschäftsführer', 'anwalt', 'amt',
      'behörde', 'schüler', 'studenten', 'anfänger', 'leser', 'publikum',
      'zielgruppe', 'personalabteilung', 'vorgesetzten', 'vorgesetzte',
      'boss', 'manager', 'client', 'clients', 'customer', 'customers',
      'teacher', 'doctor', 'landlord', 'colleagues', 'colleague', 'students',
      'beginners', 'readers', 'audience', 'parents', 'neighbour', 'neighbor',
      'lawyer', 'recruiter', 'insurer', 'staff', 'kids', 'children'
    ],
    /* Register is a different axis from tone: "academic word", "in simple
     * terms". Experienced users type it by hand; that is exactly the kind of
     * trick this tool exists to apply for everyone else. */
    register: {
      de: '(?:akademisch\\w*|wissenschaftlich\\w*|fachlich\\w*|fachbegriff\\w*|umgangssprachlich\\w*|laienverständlich|für laien|einfach erklärt|kindgerecht|juristisch\\w*)',
      en: '(?:academic|scholarly|scientific|technical term|technical word|formal register|colloquial|layman\'?s?|in simple terms|plain english|jargon.?free|for a child)'
    },
    /* Whether the user wants a ranked list or explicitly does not want one.
     * Both halves matter — "no bullet points" is a request too. */
    ranking: {
      de: '(?:rangliste|ranking|rangfolge|ranke sie|nach rang|geordnet nach|sortiert nach|top ?\\d+|als liste|in stichpunkten|keine liste|keine stichpunkte|als fließtext|im fließtext)',
      en: '(?:rank them|rank these|ranked|ranking|in order of|order them|top ?\\d+|as a list|as bullet|in bullet|no list|no bullets?|not a list|in prose|as prose|paragraph form)'
    },
    rankingNegative: '(?:keine liste|keine stichpunkte|fließtext|no list|no bullet|not a list|in prose|as prose|paragraph form)',
    /* People paste links constantly and models confabulate what is behind them. */
    urls: 'https?://[^\\s]+',
    /* "I will continue explaining in the next message" — models answer anyway. */
    continues: {
      /* The verb-then-adverb shape ("ich schicke dir gleich…") is deliberate.
       * A looser "ich schicke … noch" matches "ich schicke das an meinen
       * Vermieter und brauche noch einen Satz", which is an ordinary request,
       * and the cost of a false positive here is high: the built prompt would
       * tell ChatGPT to wait for a message that never comes, so the user gets
       * "alright, I'm ready" instead of an answer. */
      de: '(?:folgt noch|kommt noch|folgt gleich|kommt gleich|im nächsten|(?:in der )?nächste[rn]? nachricht|noch nicht fertig|bin noch nicht durch|erkläre gleich weiter|mehr gleich|ich (?:schicke|sende)(?: dir| euch| ihnen| es| ihn| sie| das)? (?:gleich|noch|dann|später|im nächsten|in der nächsten)|mehrere nachrichten|in mehreren teilen)',
      en: '(?:next message|continue in the next|still not done|not quite done|more to come|more coming|will continue|i.?m not finished|one more message|i.?ll send (?:you )?(?:the )?(?:rest|more)|sending the rest|part \\d+ of \\d+|in several messages)'
    },
    figures: '\\d{1,2}\\.\\d{1,2}\\.\\d{0,4}|\\d+(?:[.,]\\d+)?\\s*(?:€|euro|eur|\\$|usd|%|prozent|tagen|tage|wochen|monaten|monate|jahren|jahre|days|weeks|months|years|uhr)|\\d{1,2}\\.\\s?(?:januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember|january|february|march|april|may|june|july|august|september|october|november|december)',
    /* Also catches a role the user assigned themselves — "as the character bee
     * … you know a LOT about this topic". Stacking Lantern's role on top of
     * theirs would give the model two conflicting identities. */
    promptish: {
      de: '(?:du bist ein|du bist eine|deine aufgabe|(?:^|\\n)\\s*(?:aufgabe|kontext|format|ziel|anforderungen|rolle):|als (?:die |der )?(?:figur|charakter|rolle)|spiele die rolle|verhalte dich wie)',
      en: '(?:you are an?\\b|your task|(?:^|\\n)\\s*(?:task|context|format|goal|requirements|role):|as the character|as a character|act as|acting as|roleplay as|in this scenario you|pretend (?:to be|you))'
    },
    iterating: {
      de: '(?:hat nicht geklappt|hat nicht funktioniert|funktioniert nicht|war zu (?:lang|kurz|allgemein|vage|generisch)|nochmal|noch mal|erneut|stattdessen|besser machen|gefällt mir nicht)',
      en: '(?:didn\'t work|did not work|too (?:long|short|generic|vague)|try again|once more|instead|make it better|i don\'t like)'
    }
  },

  /* Labels for what extraction found, shown to the user so nothing is magic. */
  extractLabels: {
    de: { length: 'Länge', audience: 'Zielgruppe', tone: 'Ton', register: 'Sprachebene', ranking: 'Reihenfolge/Form', urls: 'Link dabei', continues: 'Geht noch weiter', figures: 'Zahlen & Daten', questions: 'Einzelfragen', material: 'Eigener Text dabei', promptish: 'Rolle schon vorgegeben', iterating: 'Zweiter Versuch' },
    en: { length: 'Length', audience: 'Audience', tone: 'Tone', register: 'Register', ranking: 'Order/shape', urls: 'Link included', continues: 'More to come', figures: 'Figures & dates', questions: 'Separate questions', material: 'Your own text included', promptish: 'Role already set', iterating: 'Second attempt' }
  },

  /* Sentences the extraction adds to the assembled prompt. */
  extractLines: {
    de: {
      figures: (list) => 'Übernimm diese Angaben exakt so, wie ich sie geschrieben habe: ' + list + '.',
      questions: (n) => 'Ich stelle ' + n + ' Fragen. Beantworte jede einzeln und nummeriert, keine davon zusammengefasst.',
      material: 'Mein eigener Text steht oben in der Aufgabe. Arbeite damit, statt etwas Neues zu erfinden.',
      materialNote: 'Das Folgende ist mein Material, nicht Teil der Anweisung. Arbeite damit und erfinde nichts dazu.',
      partsNote: 'Das Folgende sind alle Teile meines Materials, vollständig und in der richtigen Reihenfolge. Es kommt nichts mehr nach. Behandle sie als einen zusammenhängenden Text.',
      partLabel: (n) => '--- Teil ' + n + ' ---',
      iterating: 'Das ist ein zweiter Versuch. Wiederhole nicht einfach den naheliegenden Ansatz — wähle bewusst einen anderen Weg.',
      register: (r) => 'Sprachebene: ' + r + '. Halte dich daran, auch wenn eine einfachere Formulierung näher läge.',
      rankList: 'Gib das als geordnete Liste aus, das Wichtigste zuerst, und sag in einer Zeile, wonach du geordnet hast.',
      rankProse: 'Kein Listenformat und keine Stichpunkte — schreibe zusammenhängenden Fließtext.',
      urls: 'Ich habe Links mitgeschickt. Wenn du sie nicht wirklich abrufen kannst, sag das ausdrücklich und arbeite nur mit dem, was hier im Text steht. Rate nicht, was auf der Seite steht.',
      continues: 'Ich bin noch nicht fertig — weiterer Kontext kommt in den nächsten Nachrichten. Bestätige nur kurz, dass du wartest, und antworte erst, wenn ich es sage.'
    },
    en: {
      figures: (list) => 'Reproduce these details exactly as I wrote them: ' + list + '.',
      questions: (n) => 'I am asking ' + n + ' questions. Answer each one separately and numbered; do not merge them.',
      material: 'My own text is in the task above. Work with it rather than inventing something new.',
      materialNote: 'What follows is my material, not part of the instruction. Work with it and add nothing to it.',
      partsNote: 'What follows is all the parts of my material, complete and in order. Nothing more is coming. Treat them as one continuous text.',
      partLabel: (n) => '--- Part ' + n + ' ---',
      iterating: 'This is a second attempt. Do not simply repeat the obvious approach — deliberately take a different route.',
      register: (r) => 'Register: ' + r + '. Hold to it even where a plainer wording would come more naturally.',
      rankList: 'Give this as an ordered list, most important first, and say in one line what you ordered it by.',
      rankProse: 'No list and no bullet points — write connected prose.',
      urls: 'I have included links. If you cannot actually retrieve them, say so plainly and work only from what is written here. Do not guess what is on the page.',
      continues: 'I am not finished — more context is coming in the next messages. Just confirm briefly that you are waiting, and do not answer until I say so.'
    }
  },

  /* -------------------------------------------------------------------------
   * MEMORY ECHOES — phrases where the assistant claims knowledge of the user.
   *
   * On their own these are innocent: "given your budget of 900 euro" is fine
   * when the user said 900 euro. What makes them suspicious is *when* they
   * appear — a claim of prior knowledge in a chat where the user has barely
   * said anything is not context, it is saved memory speaking. So the phrase
   * list is only half the test; the other half is the turn count.
   *
   * This is deliberately framed to the user as a suspicion, not a finding.
   * --------------------------------------------------------------------- */
  memoryEchoes: [
    'wie du erwähnt', 'wie du bereits', 'wie du sagtest', 'wie du schon sagtest',
    'du hattest erwähnt', 'wie besprochen', 'da du ja', 'weil du ja',
    'ich weiß, dass du', 'ich weiß ja', 'du bevorzugst', 'du magst ja',
    'aus unseren früheren', 'wie beim letzten mal', 'wie immer', 'für dein projekt',
    'as you mentioned', 'as you said', 'you mentioned', 'you told me',
    'i remember you', 'i know you', 'as we discussed', 'from our previous',
    'like last time', 'as always', 'you prefer', 'you usually', 'for your project',
    'based on what you told me', 'since you are a', "since you're a"
  ],

  /* Hedging vocabulary — used to judge how non-committal an answer was. */
  hedges: [
    'kommt darauf an', 'kommt drauf an', 'in der regel', 'je nach', 'je nachdem',
    'grundsätzlich', 'im allgemeinen', 'kann variieren', 'unter umständen',
    'möglicherweise', 'eventuell', 'tendenziell', 'oft', 'häufig',
    'it depends', 'in general', 'generally', 'typically', 'usually', 'may vary',
    'might', 'could be', 'often', 'in most cases', 'broadly speaking'
  ],

  /* -------------------------------------------------------------------------
   * WHAT THE ANSWER DID WRONG — the phrase lists.
   *
   * These live here rather than in providers.js on purpose. providers.js holds
   * structural facts (which host, which selector, which prompt shape) that
   * change when a vendor rebuilds its interface. This holds *behavioural*
   * knowledge, which decays much faster: the research these lists are built on
   * says in as many words that heuristics keyed to the 2025 stereotypes
   * ("Claude is the cautious one, GPT is the confident one") will not survive
   * contact with 2027. rules.js is the file the hosted update channel can
   * overlay, so putting them here means a wrong list can be corrected without
   * shipping a new extension version.
   *
   * Every list is matched case-insensitively against the lowercased answer.
   * --------------------------------------------------------------------- */

  /* Agreement and flattery aimed at the user rather than at the question.
   *
   * Matched only in the OPENING of the answer (see `answerRules.openWindow`),
   * for two reasons. The failure mode being detected is an opener — Anthropic's
   * own issue tracker has the canonical example, a reply beginning "You're
   * absolutely right!" to a message that made no claim at all — and matching
   * the whole text would fire on "you're right that this is subtle" halfway
   * through an otherwise excellent technical answer, which is not the same
   * thing and not worth a button.
   *
   * OpenAI names its own version of this in its prompting guide and tells
   * developers to suppress it: "avoid stock acknowledgments like 'Got it' or
   * 'Thanks for checking in'". */
  sycophancyPhrases: [
    'du hast völlig recht', 'du hast vollkommen recht', 'du hast absolut recht',
    'da hast du recht', 'da hast du völlig recht', 'du hast recht',
    'da hast du natürlich recht', 'völlig richtig', 'ganz genau',
    'gute frage', 'sehr gute frage', 'ausgezeichnete frage', 'spannende frage',
    'guter punkt', 'guter einwand', 'gut erkannt', 'gut aufgepasst',
    'entschuldige die verwirrung', 'entschuldigung für die verwirrung',
    'danke für den hinweis', 'danke für die korrektur',
    "you're absolutely right", 'you are absolutely right',
    "you're absolutely correct", 'you are absolutely correct',
    "you're completely right", "you're right", 'you are right',
    'great question', 'excellent question', 'good question', 'fantastic question',
    'great point', "that's a great point", 'good point', 'fair point',
    'good catch', 'nice catch', 'well spotted',
    'i apologize for the confusion', 'i apologise for the confusion',
    'my apologies', 'thank you for pointing that out',
    'thanks for checking in', 'got it', "you're spot on"
  ],

  /* Refusing to land on an answer.
   *
   * This is a Claude-shaped failure in the sourced record: Anthropic's own
   * Sonnet 5 system card reports accuracy on *disambiguated* BBQ questions
   * falling to 72.4% from 88.1%, and says the difference "is almost entirely
   * attributable to Sonnet 5 selecting the 'cannot be determined' answer option
   * even when the question's context explicitly identified the correct answer."
   * A model that will not commit when the context does decide the question is
   * not being careful, and the user is the one who pays for it.
   *
   * No equivalent is published for the other two, which is why the weight
   * differs per assistant rather than the detection. */
  abstainPhrases: [
    'lässt sich nicht bestimmen', 'lässt sich nicht sagen',
    'lässt sich nicht eindeutig', 'kann ich nicht beurteilen',
    'kann ich nicht sagen', 'kann ich dir nicht sagen',
    'nicht eindeutig zu beantworten', 'keine eindeutige antwort',
    'ohne weitere informationen', 'dazu fehlen mir', 'mir fehlen dazu',
    'das hängt ganz davon ab', 'unmöglich zu sagen', 'schwer zu sagen',
    'cannot be determined', "can't be determined", 'can not be determined',
    "i don't have enough information", 'i do not have enough information',
    'insufficient information', "it's impossible to say",
    'impossible to say', "there's no way to know", 'no way to know',
    "i can't say for certain", 'i cannot say for certain',
    'without more information', 'without knowing more',
    'it depends entirely on', "i'm not able to determine",
    'i am not able to determine', 'i am unable to determine'
  ],

  /* "Wet blanket" — Anthropic's own term, defined in the Claude Sonnet 5
   * system card as responses "that entail an excessively discouraging,
   * dismissive, or moralizing tone toward the user", and reported there as
   * *slightly increased* in that model. A vendor naming and measuring its own
   * regression is the strongest kind of evidence available for a list like
   * this one.
   *
   * The follow-up this feeds does NOT ask the assistant to drop the caution.
   * A blanket "no disclaimers" button would be both unhelpful and, on the one
   * measurement available, aimed at a problem that has largely gone: a study
   * of 500 health questions found disclaimer frequency falling from 26% of
   * outputs in 2022 to around 1% in 2025. What is left is not too much safety
   * information, it is safety information standing *instead of* the answer.
   * So the push is "answer first, keep the caution to one sentence". */
  moralizePhrases: [
    'ich möchte dich ermutigen', 'ich würde dir raten',
    'bitte wende dich an', 'wende dich am besten an', 'sprich am besten mit',
    'einen fachmann', 'eine fachperson', 'professionelle hilfe',
    'ärztlichen rat', 'ärztliche beratung', 'rechtlichen rat',
    'es ist wichtig zu bedenken', 'es ist wichtig zu betonen',
    'es ist wichtig zu wissen', 'bitte sei vorsichtig', 'sei bitte vorsichtig',
    'ich möchte dich behutsam', 'bedenke bitte',
    "i'd encourage you to", 'i would encourage you to',
    'i want to encourage you', 'please consult', 'consult a professional',
    'consult a qualified', 'speak to a professional', 'seek professional',
    'seek the advice of', 'talk to a doctor', 'talk to a lawyer',
    "it's important to remember", 'it is important to remember',
    "it's important to note that", 'it is important to note that',
    "i'd caution", 'i would caution', 'please be careful',
    'i want to gently', "i'd gently", 'have you considered talking to'
  ],

  /* Throat-clearing before the content starts. OpenAI names several of these
   * in its own 2026 release notes as things it has been reducing — "fewer
   * overly long or bullet-heavy responses" (28 May 2026), reduced
   * "teaser-style phrasing" (16 March 2026), fewer "dead ends, caveats, and
   * overly declarative phrasing" (3 March 2026) — which is as close to a
   * vendor confirmation as this kind of tic ever gets.
   *
   * Matched in the opening window only, same as the flattery list, and for the
   * same reason: "let me explain" in the middle of an answer is an answer. */
  preamblePhrases: [
    'lass uns das aufschlüsseln', 'lass uns das durchgehen',
    'ich erkläre dir das', 'ich gehe das mit dir durch',
    'schauen wir uns das', 'sehr gerne', 'gerne!', 'natürlich!', 'klar!',
    'absolut!', 'gute idee!', 'ich helfe dir gerne',
    'hier ist, was', 'hier ist eine', 'im folgenden',
    'das ist eine spannende', 'und genau da wird es interessant',
    'aber es gibt einen haken', 'das entscheidende dabei ist',
    'let me break this down', "let's break this down", 'let me walk you through',
    "i'll walk you through", 'let me explain', 'let me start by',
    "let's start by", "here's the thing", "here's what", "here's how",
    'sure!', 'certainly!', 'of course!', 'absolutely!', 'happy to help',
    "i'd be happy to", 'i would be happy to', 'great, let',
    "here's the part most people miss", 'and that changes everything',
    "but here's the catch", "there's a catch",
    'and that is where it gets interesting', "where it gets interesting"
  ],

  /* A cut-off answer never ends on one of these. Used to decide whether a
   * missing full stop means "truncated" or just "a list item".
   *
   * Gemini is the reason this exists at all. Users report on Google's own
   * developer forum that answers come back cut off mid-sentence while the API
   * still reports a normal completion, and the thread has no vendor reply —
   * so on Gemini the SHAPE OF THE TEXT is the only signal there is. */
  danglingWords: [
    'a', 'an', 'the', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'for',
    'with', 'that', 'which', 'is', 'are', 'was', 'were', 'be', 'as', 'at',
    'by', 'from', 'it', 'this', 'these', 'than', 'then', 'so', 'if', 'when',
    'der', 'die', 'das', 'ein', 'eine', 'einen', 'einem', 'und', 'oder',
    'aber', 'zu', 'von', 'mit', 'für', 'dass', 'ist', 'sind', 'war', 'waren',
    'auf', 'im', 'in', 'am', 'als', 'wenn', 'weil', 'nicht', 'auch', 'noch'
  ],

  /* -------------------------------------------------------------------------
   * FOLLOW-UPS — for after ChatGPT has answered.
   *
   * The most common beginner failure is not a bad first prompt, it is accepting
   * the first answer. Experienced users push back reflexively; beginners do not
   * know that pushing back is allowed, let alone how. These are the pushes,
   * one click each.
   * --------------------------------------------------------------------- */
  followUps: [
    /* Provider-scoped, because the three fail differently and the right push
     * back depends on which failure you are looking at. `only` restricts a
     * card; everything without it is universal. */
    {
      id: 'noSycophancy',
      label: { de: 'Nicht einknicken', en: 'Do not just agree' },
      does: { de: 'Prüft die Antwort, ohne dass {ai} nur einknickt.',
              en: 'Gets the answer checked without {ai} simply folding.' },
      /* THE WORDING OF THIS CARD IS THE FEATURE, and the old wording was the
       * documented worst case.
       *
       * It used to open "I disagree." — a first-person statement of conviction.
       * The UK AI Safety Institute published a study on 28 April 2026 testing
       * exactly this across GPT-4o, GPT-5 and Claude Sonnet 4.5, and found:
       * questions produced near-zero sycophancy while non-questions produced a
       * 24-percentage-point gap; convictions triggered the most of all, ahead
       * of beliefs and plain statements; first-person framing produced more
       * than the third-person equivalent; and reframing the input as a question
       * substantially outperformed telling the model not to be sycophantic.
       *
       * So the old card opened with the single most sycophancy-inducing move
       * available — a first-person conviction — and then asked the model not to
       * be sycophantic, which is the weaker of the two interventions. It was
       * causing the failure it existed to prevent.
       *
       * Rewritten as questions in the third person. Nothing here tells the
       * model what the user thinks, because the moment it knows that, it has
       * something to agree with.
       *
       * A second finding shapes it too: a September 2026 study running a
       * mistaken user over up to 25 turns found emotional appeals the single
       * tactic most associated with inducing sycophancy. There is deliberately
       * no feeling anywhere in this text.
       *
       * `hedging` used to be on this list, back when it was the closest
       * available proxy for flattery. Now that agreement is detected directly
       * it is off again: an answer that hedges has not agreed with anything,
       * and offering "do not just agree" against it is a card that does not
       * fit the answer in front of the user. Hedging that will not commit is
       * what `commitAnyway` is for. */
      signals: ['sycophancy'],
      goals: ['answer', 'guidance', 'feedback', 'ideas'],
      text: {
        de: 'Was spricht gegen diese Antwort? Nenne die stärksten Gegenargumente und prüfe sie an den Fakten. Falls die Antwort danach stehen bleibt, sag das und begründe es. Falls nicht, sag, welcher Punkt sie kippt.',
        en: 'What argues against this answer? Name the strongest counter-arguments and check them against the facts. If the answer survives that, say so and say why. If it does not, say which point overturns it.'
      }
    },
    {
      id: 'commitAnyway',
      /* Not scoped to Claude, although that is where it was measured.
       * "It depends entirely on" is not one vendor's sentence; the weights
       * carry which assistant does it most, which is the difference that is
       * actually evidenced. */
      label: { de: 'Festlegen, bitte', en: 'Commit to one answer' },
      does: { de: 'Gegen „das kann man nicht sagen“, wenn man es sagen kann.',
              en: 'Against “that cannot be determined” when it can.' },
      /* Anthropic's own Claude Sonnet 5 system card: accuracy on *disambiguated*
       * questions — ones where the context states the answer — fell to 72.4%
       * from 88.1%, and the card attributes the difference almost entirely to
       * the model picking "cannot be determined" anyway. Refusing to commit
       * where the evidence does decide is not caution; it hands the work back.
       *
       * Phrased as a question, per the same AISI finding as above, and it asks
       * for a confidence level rather than certainty, so the honest answer
       * "barely better than a coin flip" is still an available answer. */
      signals: ['abstained', 'hedging'],
      goals: ['answer', 'guidance', 'decide'],
      text: {
        de: 'Welche einzelne Antwort wird von dem, was du hast, am besten gestützt? Nenne sie zuerst, dann wie sicher du dir bist und was daran etwas ändern würde. Wenn die Angaben es wirklich nicht entscheiden, sag, welche eine fehlende Angabe es entscheiden würde.',
        en: 'Which single answer is best supported by what you already have? Give that one first, then how confident you are and what would change it. If the evidence genuinely does not decide it, say which one missing piece of information would.'
      }
    },
    {
      id: 'keepCaution',
      /* Claude-only for one version, on the strength of the vendor evidence
       * being Anthropic's. Made universal after a store screenshot caught a
       * ChatGPT answer closing with "it may be advisable to seek legal advice
       * first" and no way to ask for the answer instead. */
      label: { de: 'Erst antworten, dann warnen', en: 'Answer first, warn after' },
      does: { de: 'Holt die Antwort zurück, die unter der Ermahnung liegt.',
              en: 'Gets back the answer buried under the warning.' },
      /* "Wet blanket" is Anthropic's own term, defined in the Sonnet 5 system
       * card as an "excessively discouraging, dismissive, or moralizing tone
       * toward the user" and reported there as slightly increased in that
       * model.
       *
       * This card does NOT ask for the caution to be dropped. Two reasons: the
       * caution is often right, and the one measurement available says the
       * blanket-disclaimer problem has mostly gone anyway — a study of 500
       * health questions found disclaimer frequency falling from 26% of
       * outputs in 2022 to about 1% in 2025. The complaint worth making is not
       * that the warning is there, it is that the warning arrived instead of
       * the answer. */
      signals: ['moralizing'],
      goals: ['answer', 'guidance', 'decide'],
      text: {
        de: 'Beantworte bitte zuerst die Frage selbst, so direkt wie möglich. Wenn es ein echtes Risiko gibt, das ich kennen sollte, schreib es danach in genau einem Satz ans Ende – nicht an den Anfang und nicht mehrfach.',
        en: 'Please answer the actual question first, as directly as you can. If there is a real risk I should know about, put it in exactly one sentence at the end — not at the front, and not more than once.'
      }
    },
    {
      id: 'continueFrom',
      label: { de: 'Weiterschreiben', en: 'Carry on' },
      does: { de: 'Wenn die Antwort mitten im Satz aufhört.',
              en: 'For when the answer stops mid-sentence.' },
      /* The wording is Anthropic's own documented continuation turn, verbatim:
       * "Please continue from where you left off." The second sentence is
       * added because without it the usual result is the whole answer again.
       *
       * Universal, because the assistant most likely to need it is the one
       * that gives no sign it happened: Gemini users report answers ending
       * mid-sentence while the API still reports a normal completion. */
      signals: ['truncated'],
      goals: [],
      text: {
        de: 'Bitte mach genau da weiter, wo du aufgehört hast. Fang beim letzten unvollständigen Satz an und wiederhole nichts, was schon dasteht.',
        en: 'Please continue from where you left off. Start at the last incomplete sentence and do not repeat anything you have already written.'
      }
    },
    {
      id: 'getToThePoint',
      label: { de: 'Ohne Anlauf', en: 'Skip the run-up' },
      does: { de: 'Der erste Satz soll die Antwort sein, nicht die Ankündigung.',
              en: 'Makes the first sentence the answer, not the announcement.' },
      /* OpenAI's own prompting guide tells developers to suppress this —
       * "avoid stock acknowledgments like 'Got it' or 'Thanks for checking
       * in'" — and its 2026 release notes list reducing "teaser-style
       * phrasing" as a shipped change, which is a vendor confirming the tic
       * exists. */
      signals: ['preamble', 'sycophancy'],
      goals: ['answer', 'guidance', 'artifact'],
      text: {
        de: 'Fang bitte direkt mit der Antwort an. Lass die Einleitung weg: keine Bestätigung, keine Wiederholung meiner Frage, keine Ankündigung, was du gleich tust. Der erste Satz soll schon das sein, wonach ich gefragt habe.',
        en: 'Please start with the answer itself. Drop the opening: no acknowledgment, no restatement of my question, no announcement of what you are about to do. The first sentence should already be the thing I asked for.'
      }
    },
    {
      id: 'prose',
      label: { de: 'Fließtext statt Stichpunkte', en: 'As prose, not bullets' },
      does: { de: 'Aufzählungen verstecken, dass die Punkte nicht zusammenhängen.',
              en: 'Bullet lists hide that the points do not connect.' },
      /* Anthropic publishes a verbatim block for this — the only ready-made
       * anti-verbosity prompt any of the three vendors ships — and its
       * condition is the useful part: prose unless the items are "truly
       * discrete" or the user asked for a list. That condition is what this
       * text carries, because "no bullets ever" would be worse than the
       * problem. OpenAI's release notes name "bullet-heavy responses" as
       * something it has been reducing, so the tic is not one vendor's. */
      signals: ['bulletHeavy'],
      goals: ['answer', 'guidance', 'artifact', 'summarize'],
      text: {
        de: 'Schreib das noch einmal als zusammenhängenden Text: ganze Sätze und Absätze. Aufzählungspunkte nur da, wo die Punkte wirklich einzelne, gleichrangige Dinge sind. Gleicher Inhalt, aber die Verbindungen zwischen den Punkten sollen dastehen statt weggelassen zu sein.',
        en: 'Write that again as connected prose: complete sentences and paragraphs. Keep bullet points only where the items really are discrete and equal. Same content, but with the connections between the points written out instead of left off.'
      }
    },
    {
      id: 'expand',
      only: ['gemini'],
      label: { de: 'Mehr zeigen', en: 'Show more of it' },
      does: { de: 'Gemini antwortet von Haus aus knapp – das hier holt den Weg dahin heraus.',
              en: 'Gemini answers tersely by default — this asks for the working.' },
      /* Google documents this rather than it being observed: "By default,
       * Gemini 3 is less verbose and prefers providing direct, efficient
       * answers", and "If your use case requires a more conversational or
       * 'chatty' persona, you must explicitly steer the model in the prompt."
       *
       * This is the exact opposite of Anthropic, which documents its flagship
       * as running longer than its predecessor and tells you to prompt for
       * conciseness. Which is why "half as long" is weighted for Claude and
       * this card exists only here — the same complaint on the wrong assistant
       * makes the answer worse. */
      signals: ['short'],
      goals: ['answer', 'guidance', 'learn'],
      text: {
        de: 'Das ist mir zu knapp. Gib dieselbe Antwort noch einmal mit dem Weg dahin: welche Schritte, was du ausgeschlossen hast und warum, und ein durchgerechnetes Beispiel. Die Antwort selbst soll gleich bleiben.',
        en: 'That is shorter than I need. Give the same answer again with the working shown: what the steps were, what you ruled out and why, and one worked example. The answer itself should stay the same.'
      }
    },
    {
      id: 'plainer',
      only: ['claude'],
      label: { de: 'Schnörkel raus', en: 'Cut the flourishes' },
      /* Anthropic names this failure in its own prompting guidance — "mannered
       * prose substitutes metaphor and flourish for direct statement" — and
       * suggests almost this wording as the fix. */
      does: { de: 'Gegen ausgeschmückte Sätze, die mehr klingen, als sie sagen.',
              en: 'Against decorated sentences that say less than they sound like.' },
      signals: ['long'],
      goals: ['artifact', 'answer', 'guidance'],
      text: {
        de: 'Nimm alle Schnörkel heraus. Schreib es noch einmal so direkt wie möglich: gleiche Aussagen, keine Metaphern, keine Superlative, keine einleitenden Höflichkeiten. Wenn ein Satz nichts Neues sagt, streich ihn.',
        en: 'Remove all mannered prose. Write it again as directly as possible: the same claims, no metaphors, no flourishes, no polite run-ups. If a sentence adds nothing, cut it.'
      }
    },
    {
      id: 'admitUnsure',
      label: { de: 'Unsicheres markieren', en: 'Mark what is uncertain' },
      /* This card used to be Gemini-only, on the strength of a reading that
       * Gemini guessed where its peers abstained. Then it looked like ChatGPT
       * was the one that needed it most. Then, ten months later, the published
       * ordering inverted again.
       *
       * Which settles the question: asking for uncertainty to be marked is
       * never the wrong thing to ask, and no assistant is reliably the one that
       * needs it. The card is universal and its weight is flat — see the note
       * above `chatgpt` in `answerRules`. Restricting it meant a Claude user
       * was simply never offered a push that costs nothing and can only help.
       *
       * All three invent answers at rates above half on hard factual questions,
       * and which one is safest has changed twice in a year. The honest thing a
       * button can do is ask for the uncertainty to be marked, whoever wrote
       * the answer. */
      does: { de: 'Trennt, was {ai} weiß, von dem, was gut geraten ist.',
              en: 'Separates what {ai} knows from what it guessed well.' },
      signals: ['certain'],
      goals: ['answer', 'guidance', 'artifact'],
      text: {
        de: 'Geh deine Antwort noch einmal durch und markiere jede Aussage, bei der du dir nicht sicher bist, ausdrücklich als unsicher. Wo du etwas nicht weißt, schreib das hin, statt eine plausible Antwort zu formulieren. Für die restlichen Aussagen nenne mir, woher du sie hast.',
        en: 'Go through your answer again and explicitly mark every statement you are not sure about as uncertain. Where you do not know something, say so instead of producing a plausible-sounding answer. For the rest, tell me where each one comes from.'
      }
    },
    {
      id: 'concrete',
      label: { de: 'Konkreter werden', en: 'Get concrete' },
      does: { de: 'Verlangt Zahlen, Namen und Beispiele statt allgemeiner Sätze.', en: 'Demands figures, names and examples instead of general statements.' },
      signals: ['hedging'],
      goals: ['answer', 'guidance', 'artifact'],
      text: {
        de: 'Das ist mir zu allgemein. Ersetze jede allgemeine Aussage durch etwas Konkretes: Zahlen, Namen, Beispiele, konkrete Schritte. Wenn dir dafür Angaben fehlen, frag mich danach, statt vage zu bleiben.',
        en: 'That is too general. Replace every generic statement with something concrete: figures, names, examples, specific steps. If you lack the detail to do that, ask me for it instead of staying vague.'
      }
    },
    {
      id: 'assumptions',
      label: { de: 'Annahmen offenlegen', en: 'Surface assumptions' },
      does: { de: 'Zeigt, was {ai} sich selbst dazugedacht hat.', en: 'Reveals what {ai} filled in on its own.' },
      signals: [],
      goals: ['artifact', 'answer', 'guidance', 'ideas', 'feedback'],
      text: {
        de: 'Welche Annahmen hast du getroffen, die ich dir nicht gesagt habe? Liste sie auf und sag mir, welche davon das Ergebnis am stärksten verändern würde, wenn sie falsch wäre.',
        en: 'Which assumptions did you make that I did not give you? List them, and tell me which one would change the result most if it turned out to be wrong.'
      }
    },
    {
      id: 'alternatives',
      label: { de: 'Andere Ansätze', en: 'Other approaches' },
      does: { de: 'Holt drei echte Alternativen statt Varianten derselben Idee.', en: 'Gets three real alternatives instead of variations of one idea.' },
      signals: [],
      goals: ['ideas', 'artifact'],
      text: {
        de: 'Gib mir drei deutlich andere Ansätze für dasselbe Ziel – keine Varianten dieser Fassung. Sag zu jedem in einem Satz, wann er die bessere Wahl wäre.',
        en: 'Give me three clearly different approaches to the same goal — not variations of this one. Say in one sentence when each would be the better choice.'
      }
    },
    {
      id: 'missing',
      label: { de: 'Was fehlt noch?', en: 'What is missing?' },
      does: { de: 'Fragt nach dem, was die Antwort ausgelassen hat.', en: 'Asks for what the answer left out.' },
      signals: [],
      goals: ['answer', 'guidance', 'feedback'],
      text: {
        de: 'Was fehlt in deiner Antwort, das ich für diese Aufgabe wissen müsste? Nenne nur Punkte, die das Ergebnis wirklich verändern würden, keine Vollständigkeitsfloskeln.',
        en: 'What is missing from your answer that I would need for this task? Only name points that would actually change the outcome, not boilerplate caveats.'
      }
    },
    {
      id: 'shorter',
      label: { de: 'Halb so lang', en: 'Half as long' },
      does: { de: 'Streicht Füllwörter und Wiederholungen, behält die Fakten.', en: 'Cuts filler and repetition, keeps the facts.' },
      signals: ['long'],
      goals: ['artifact', 'answer'],
      text: {
        de: 'Kürze das auf die Hälfte. Behalte alle konkreten Angaben, streiche Erklärungen, Wiederholungen und Einleitungen.',
        en: 'Cut that in half. Keep every concrete detail; remove explanation, repetition and preamble.'
      }
    },
    {
      id: 'simpler',
      label: { de: 'Einfacher erklären', en: 'Explain it simpler' },
      does: { de: 'Nochmal ohne Fachbegriffe, mit Alltagsbeispiel.', en: 'Again without jargon, with an everyday example.' },
      signals: ['hasCode', 'long'],
      goals: ['answer', 'guidance'],
      text: {
        de: 'Erkläre das noch einmal so, dass es jemand ohne Vorkenntnisse versteht: keine Fachbegriffe, ein Beispiel aus dem Alltag, und sag am Ende in einem Satz, worauf es wirklich ankommt.',
        en: 'Explain that again so someone with no background understands it: no jargon, one everyday example, and one closing sentence on what actually matters.'
      }
    },
    {
      id: 'sources',
      label: { de: 'Woher weißt du das?', en: 'How do you know?' },
      does: { de: 'Trennt Belegtes von Vermutung – gegen erfundene Fakten.', en: 'Separates documented from guessed — against invented facts.' },
      signals: ['noSources'],
      goals: ['answer'],
      text: {
        de: 'Worauf stützt sich das? Trenne klar, was belegt ist, was verbreitete Auffassung ist und was deine eigene Einschätzung ist. Markiere alles, bei dem du dir unsicher bist.',
        en: 'What is this based on? Separate clearly what is documented, what is common opinion, and what is your own judgement. Mark anything you are unsure about.'
      }
    },
    {
      id: 'handover',
      label: { de: 'Übergabe in neuen Chat', en: 'Hand over to a new chat' },
      does: { de: 'Fasst den Stand zusammen, damit du in einem frischen Chat weitermachen kannst.', en: 'Sums up where things stand so you can carry on in a fresh chat.' },
      signals: ['long'],
      goals: [],
      text: {
        de: 'Dieser Chat wird lang. Schreibe mir eine Übergabe für einen neuen Chat: (1) was das Ziel ist, (2) alle Fakten und Zahlen, die du von mir bekommen hast, (3) was wir schon entschieden oder verworfen haben und warum, (4) was als Nächstes zu tun ist. Schreibe sie so, dass eine KI ohne diesen Chatverlauf damit sofort weiterarbeiten kann, und gib sie in einem Codeblock aus.',
        en: 'This chat is getting long. Write me a handover for a new chat: (1) what the goal is, (2) every fact and figure I gave you, (3) what we have already decided or ruled out and why, (4) what to do next. Write it so an AI without this chat history can carry straight on, and put it in a code block.'
      }
    },
    {
      id: 'memoryProbe',
      label: { de: 'Woher kommt das?', en: 'Where is that from?' },
      does: { de: 'Fragt, was {ai} aus dem Gedächtnis dazugetan hat.', en: 'Asks what {ai} added out of memory.' },
      signals: ['memory'],
      goals: [],
      text: {
        de: 'Nenne alles, was in deine Antwort eingeflossen ist und was ich dir in DIESEM Chat nicht gesagt habe – einschließlich allem, was du über mich gespeichert hast. Liste die Punkte einzeln auf, sag zu jedem, woher du ihn hast, und ob deine Antwort ohne ihn anders ausgefallen wäre.',
        en: 'List everything that went into your answer that I did not tell you in THIS chat — including anything you have saved about me. List each item separately, say where it came from, and whether your answer would have been different without it.'
      }
    },
    {
      id: 'memoryIgnore',
      label: { de: 'Gedächtnis ignorieren', en: 'Ignore your memory' },
      does: { de: 'Lässt {ai} nur mit dem arbeiten, was hier im Chat steht.', en: 'Makes {ai} work only from what is in this chat.' },
      signals: ['memory'],
      goals: [],
      text: {
        de: 'Ignoriere für diese Aufgabe alles, was du über mich gespeichert hast, und arbeite ausschließlich mit dem, was in diesem Chat steht. Wenn dir dadurch etwas fehlt, frag mich danach, statt es selbst zu ergänzen. Beantworte meine Frage danach noch einmal von vorne.',
        en: 'For this task, ignore everything you have saved about me and work only from what is in this chat. If that leaves a gap, ask me rather than filling it in yourself. Then answer my question again from scratch.'
      }
    },
    {
      id: 'restart',
      label: { de: 'Neu ansetzen', en: 'Start fresh' },
      does: { de: 'Wirft den bisherigen Ansatz weg und versucht einen anderen.', en: 'Throws the current approach away and tries another.' },
      signals: [],
      goals: [],
      text: {
        de: 'Lass den bisherigen Ansatz fallen. Fang noch einmal von vorne an und wähle bewusst einen anderen Weg als bisher – erkläre kurz, warum dieser besser passen könnte.',
        en: 'Drop the current approach. Start again from scratch and deliberately take a different route — briefly say why it might fit better.'
      }
    }
  ],

  /* How much a matched answer-signal is worth when ranking follow-ups.
   * A suspected memory leak outranks everything, because if the answer is
   * contaminated then every other complaint about it is downstream of that.
   *
   * This is the fallback layer. `answerRules` below overrides it per
   * assistant, and anything neither of them names is worth `answerRules.base`. */
  signalWeights: { memory: 5 },

  /* -------------------------------------------------------------------------
   * ANSWER RULES — the thresholds, and which failure matters on which
   * assistant.
   *
   * Two separate things live here and they are separate on purpose:
   *
   *   `shared`  — how a signal is DETECTED. The same everywhere, because the
   *               shape of a truncated sentence does not depend on who wrote
   *               it, and because three sets of thresholds would be three
   *               things to get wrong instead of one.
   *
   *   per id    — how much a detected signal is WORTH when choosing which
   *               follow-up to put first. This is where the assistants differ,
   *               and it is the only place they differ.
   *
   * That split is the whole design. The earlier version scoped the *cards* to
   * providers, which meant a Claude user was simply never offered "mark what
   * is uncertain" — a push that is never wrong to make. Weighting instead of
   * excluding means a decayed judgement costs a worse ordering, not a missing
   * button. Given that the published picture is moving fast in both directions
   * at once — Anthropic's newest cards report *less* abstention and less
   * honesty under pressure than the model before, while OpenAI's newest
   * reports roughly half the hallucination rate of the one before it — an
   * ordering that ages badly is the most this file should be able to do.
   *
   * A weight of 0 means "detected, but do not let it choose the follow-up".
   * That is not the same as not detecting it, and the code distinguishes them.
   * --------------------------------------------------------------------- */
  answerRules: {
    base: 2,

    /* Signals whose cards sort to the front rather than competing on points.
     * See rankFollowUps for why this is a list rather than a big number. */
    dominant: ['memory', 'truncated'],

    shared: {
      longWords: 350,
      shortWords: 90,
      /* Characters from the start counted as "the opening" for the flattery
       * and throat-clearing lists. Roughly two sentences. */
      openWindow: 240,
      /* Hedge phrases needed before an answer counts as hedging. */
      hedgeMin: 2,
      /* And words needed before *no* hedge phrase at all means anything —
       * a two-line answer without hedges is just a two-line answer. */
      certainMin: 60,
      /* Not committing: two phrases anywhere, or one in a short answer. A long
       * answer that says "without more information" once in passing still
       * answered the question. */
      abstainMin: 2,
      abstainShortWords: 250,
      /* Same shape for the lecture, with a tighter short-answer window,
       * because "it's important to note that" is common enough to be noise on
       * its own and only becomes a complaint when it is most of the reply. */
      moralizeMin: 2,
      moralizeShortWords: 150,
      /* A list is a list; a wall of bullets is a failure to write. Both
       * conditions have to hold. */
      bulletMin: 6,
      bulletRatio: 0.5,
      /* Below this there is not enough text for "it stops mid-sentence" to
       * mean anything. */
      truncateMinWords: 25,
      /* And a final line this long, ending without punctuation, is prose that
       * was cut — not a bullet that never needed a full stop. */
      danglingLineWords: 8
    },

    /* ---------------------------------------------------------------------
     * A NOTE ABOUT `certain`, AND WHY IT IS THE SAME EVERYWHERE.
     *
     * It used to be 5 on ChatGPT and 2 on Claude, on what looked like the
     * best-evidenced difference in the file: on the public benchmark that
     * rewards abstaining rather than guessing, OpenAI's flagship measured
     * around 92% hallucination against Anthropic models reported among the
     * lowest. That was November 2025.
     *
     * By September 2026 the ordering had inverted — Anthropic's own system
     * card concedes its newest flagship "hallucinates factual claims slightly
     * more" than the model before it, and the same benchmark now puts the
     * OpenAI and Google flagships *below* the Anthropic ones. Ten months.
     *
     * So the weights for this one signal are flat, deliberately. Not because
     * the difference does not exist, but because it moves faster than a file
     * shipped in a zip can follow, and a stale ordering is worse than none:
     * it puts the wrong card first with the confidence of a measurement. The
     * other signals stay differentiated because they rest on vendor-documented
     * design choices — how long a model answers by default, whether it opens
     * with an acknowledgment — which change on a product's timescale rather
     * than a release's.
     *
     * The general lesson is written down in claude/working-notes.md. It is the
     * clearest evidence this project has produced that behavioural knowledge
     * belongs in the file the update channel can overlay.
     * ------------------------------------------------------------------- */

    /* OpenAI. `bulletHeavy` and `preamble` are weighted up because OpenAI's own
     * release notes name both as things it has been reducing — which is a
     * vendor saying the tic exists. */
    chatgpt: {
      weights: { certain: 4, bulletHeavy: 4, preamble: 3, sycophancy: 3,
                 noSources: 3, abstained: 1, moralizing: 1 }
    },

    /* Anthropic. Flattery ranks first: it is the one failure with a named,
     * canonical, vendor-tracked textual signature, and the newest system card
     * says in as many words that the model is "less honest under pressure than
     * recent Claude models". `abstained` and `moralizing` are next, both from
     * Anthropic's own measurements of its own regressions.
     *
     * `long` is weighted up because Anthropic documents that Opus 5 runs
     * longer than its predecessors *and* that the effort setting will not fix
     * it — the only remedy the vendor offers is asking in the prompt. */
    claude: {
      weights: { sycophancy: 5, abstained: 4, moralizing: 4, long: 3,
                 bulletHeavy: 3, certain: 4 }
    },

    /* Google. Truncation ranks first and nowhere else does, because Gemini is
     * the one assistant where a cut-off answer may carry no marker at all —
     * users report answers ending mid-sentence while the API reports normal
     * completion, on Google's own forum, with no vendor reply.
     *
     * `short` is deliberately ZERO. Google documents Gemini as terse by
     * default and says you have to steer it to be chatty. A brief answer here
     * is the model working as designed, so offering "what is missing?" on
     * length alone would be a button that fires constantly and means nothing.
     * The Gemini-only `expand` card covers the case where brevity is actually
     * a problem, and it says what to add rather than complaining. */
    gemini: {
      weights: { truncated: 5, certain: 4, noSources: 4, short: 0,
                 sycophancy: 2, moralizing: 1 }
    }
  },

  /* Short forms for the in-page bar, where there is no room for a clause. */
  signalShort: {
    de: { long: 'lang', short: 'knapp', hedging: 'weicht aus', noNumbers: 'keine Zahlen',
          hasList: 'Liste', hasCode: 'Code', noSources: 'keine Quellen',
          memory: 'Gedächtnis?', sycophancy: 'stimmt zu', certain: 'sehr sicher',
          abstained: 'legt sich nicht fest', truncated: 'abgeschnitten',
          moralizing: 'belehrt', preamble: 'Anlauf', bulletHeavy: 'nur Stichpunkte' },
    en: { long: 'long', short: 'brief', hedging: 'hedges', noNumbers: 'no figures',
          hasList: 'a list', hasCode: 'code', noSources: 'no sources',
          memory: 'memory?', sycophancy: 'agrees', certain: 'very sure',
          abstained: 'will not commit', truncated: 'cut off',
          moralizing: 'lectures', preamble: 'run-up', bulletHeavy: 'all bullets' }
  },

  /* Why a follow-up was surfaced, in the user's words. */
  signalLabels: {
    // Subordinate clauses after "weil" — the verb belongs at the end.
    de: {
      long: 'die Antwort lang ist', short: 'die Antwort knapp ist',
      hedging: 'die Antwort ausweicht', noNumbers: 'keine konkreten Zahlen drin stehen',
      hasList: 'die Antwort eine Liste ist', hasCode: 'die Antwort Code enthält',
      noSources: 'keine Quellen genannt sind', memory: 'die Antwort auf Dinge verweist, die du nie gesagt hast',
      sycophancy: 'die Antwort damit anfängt, dir zuzustimmen',
      certain: 'die Antwort sehr sicher klingt, ohne Belege zu nennen',
      abstained: 'die Antwort sich nicht festlegt',
      truncated: 'die Antwort mitten im Satz aufhört',
      moralizing: 'die Antwort mehr ermahnt als beantwortet',
      preamble: 'die Antwort erst nach einem Anlauf anfängt',
      bulletHeavy: 'die Antwort fast nur aus Stichpunkten besteht',
      goal: 'es zu deinem Ziel passt'
    },
    en: {
      long: 'the answer is long', short: 'the answer is brief',
      hedging: 'the answer hedges', noNumbers: 'no concrete figures',
      hasList: 'the answer is a list', hasCode: 'the answer contains code',
      noSources: 'no sources given', memory: 'the answer refers to things you never said',
      sycophancy: 'the answer opens by agreeing with you',
      certain: 'the answer sounds very sure and names nothing to back it up',
      abstained: 'the answer will not commit to anything',
      truncated: 'the answer stops mid-sentence',
      moralizing: 'the answer warns you more than it answers you',
      preamble: 'the answer takes a run-up before it starts',
      bulletHeavy: 'the answer is almost all bullet points',
      goal: 'fits what you asked for'
    }
  },

  /* -------------------------------------------------------------------------
   * DRIFT — why a long chat is a worse chat, said once, at the right moment.
   *
   * There is no cliff and this file must not pretend there is one. What is
   * published is a direction: a study released on 8 September 2026, running a
   * mistaken user against four production models over as many as 25 turns,
   * found that the rate at which models abandon a correct answer rises with
   * conversation length for every model tested, that short-horizon tests
   * therefore understate it, and — the part worth telling a beginner — that
   * the models keep the correct answer in their own reasoning while conceding
   * it. It is not forgetting. It is giving in.
   *
   * `messages` is deliberately the same 14 the handover tab already used to
   * call a chat long. Inventing a second, different number would imply a
   * precision nobody has published, and the text says in as many words that
   * nothing breaks at a particular length.
   *
   * `pushes` counts how many follow-ups the user has fired in this chat,
   * because that is the specific thing the measurement is about: rounds of
   * pushing back, not minutes elapsed. Three is the point at which "the answer
   * moved towards me again" is a pattern rather than a coincidence.
   * --------------------------------------------------------------------- */
  drift: {
    messages: 14,
    pushes: 3,
    /* The second way into the strong notice, and it was missing.
     *
     * `pushes` counts how many follow-up buttons the person has pressed in
     * this tab. That is the good signal — rounds of pushing back is what the
     * measurement is actually about — but it is not the ONLY way to get deep
     * into a conversation. Somebody who types their own follow-ups by hand,
     * which is most people, never moved that counter at all, so a sixty-message
     * chat sat on the soft notice forever and the move-chat nudge never
     * appeared. Reported as "not sure if the feature about it recommending
     * when to reopen a chat works perfectly", which it did not.
     *
     * 40 rather than a computed number: it is roughly three times the soft
     * threshold, it is past the point where every vendor's own guidance starts
     * talking about starting fresh, and being early here costs a line of text
     * while being late costs the thing the feature is for. */
    longMessages: 40,

    note: {
      de: 'Lange Chats gehen nicht ab einer bestimmten Länge kaputt. Gemessen wurde etwas anderes: Je länger ein Gespräch läuft, desto häufiger gibt ein Modell eine richtige Antwort auf, wenn man widerspricht – in den Aufzeichnungen behält es die richtige Antwort intern und gibt sie trotzdem auf. Ein Umzug, bei dem nur die Fakten mitkommen, nimmt diesen Druck heraus.',
      en: 'Long chats do not break at a particular length. What has been measured is something else: the longer a conversation runs, the more often a model gives up a correct answer when you push back — in the transcripts it keeps the right answer internally and concedes anyway. Moving the task across with only the facts takes that pressure off.'
    },

    pressure: {
      de: 'Du hast in diesem Chat schon {n}-mal nachgehakt. Genau darum geht es in den Messungen: Jede Runde macht Einknicken wahrscheinlicher, nicht unwahrscheinlicher. Wenn die Antwort jedes Mal ein Stück in deine Richtung gewandert ist, zieh lieber um, statt noch einmal zu fragen.',
      en: 'You have pushed back {n} times in this chat. That is exactly what the measurements are about: each round makes folding more likely, not less. If the answer has drifted a little towards you each time, move the task rather than asking again.'
    },

    /* One assistant names this itself, so there it is not a general caution. */
    byProvider: {
      gemini: {
        de: 'Bei Gemini steht das so in Googles eigener Modellkarte: „mögliche Verschlechterung über mehrere Gesprächsrunden hinweg“ ist dort sinngemäß eines von zwei genannten Hauptrisiken.',
        en: "On Gemini this is Google's own wording: \u201cpossible degradation in multi-turn conversations\u201d is named there as one of two main risks."
      }
    }
  },

  /* -------------------------------------------------------------------------
   * HANDOVER — moving a task into a fresh chat without losing the thread.
   *
   * Long chats get slow and confused, so people start a new one and silently
   * lose every fact, decision and dead end they had established. Experienced
   * users write themselves a handover; beginners do not know that is a thing
   * you can ask for.
   *
   * Two prompts. The first makes the current chat write the handover. The
   * second is what Lantern puts around it in the new chat — and that framing
   * is the part that does the work: it tells the new chat the handover
  * outranks its own memory, prevents it from restating the same context, and
  * asks a question only when the next step cannot safely begin.
   * --------------------------------------------------------------------- */
  handover: {
    // The parts the user can choose to carry over. `always` ones are not
    // optional: a handover without facts or a next step is not a handover.
    parts: [
      { id: 'goal', always: true,
        de: 'Ziel: gewünschtes Ergebnis und nicht verhandelbare Rahmenbedingungen, knapp',
        en: 'Goal: desired result and non-negotiable boundaries, briefly' },
      { id: 'facts', always: true,
        de: 'Fakten: nur verbindliche Zahlen, Namen, Termine, Zitate und Angaben aus diesem Chat – exakt',
        en: 'Facts: only binding figures, names, dates, quotes, and details from this chat — exactly' },
      { id: 'decisions', label: { de: 'Entscheidungen & verworfene Wege', en: 'Decisions & dead ends' },
        de: 'Entscheidungen & verworfene Wege: nur was für den nächsten Schritt noch wichtig ist, jeweils mit Grund',
        en: 'Decisions & dead ends: only what still matters for the next step, with the reason' },
      { id: 'style', label: { de: 'Stil & Format', en: 'Style & format' },
        de: 'Stil & Format: nur feste Vorgaben, die nicht schon bei Ziel oder Fakten stehen',
        en: 'Style & format: only fixed requirements not already stated under goal or facts' },
      { id: 'next', always: true,
        de: 'Nächster Schritt & offen: was als Nächstes getan wird und was dafür noch geklärt werden muss',
        en: 'Next step & open: what happens next and what still needs deciding for it' }
    ],

    request: {
      de: {
        head: 'Wir wechseln in einen neuen Chat. Schreibe mir eine Übergabe, mit der jemand ohne diesen Chatverlauf sofort weiterarbeiten kann.',
        listHead: 'Nimm auf:',
        rules: [
          'Jede Information nur einmal unter der ersten passenden Überschrift. Wiederhole nichts in einem zweiten Abschnitt.',
          'Erfinde nichts dazu. Was du nicht weißt, schreibe ausdrücklich als „unbekannt“.',
          'Fasse Zahlen, Namen und Zitate nicht zusammen — übernimm sie exakt.',
          'Keine Einleitung, keine Höflichkeitsfloskeln.',
          'Gib die Übergabe als EINEN Codeblock aus, damit ich sie am Stück kopieren kann.'
        ],
        rulesHead: 'Regeln:'
      },
      en: {
        head: 'We are moving to a new chat. Write me a handover that lets someone without this chat history carry straight on.',
        listHead: 'Include:',
        rules: [
          'Put each piece of information under the first matching heading only. Do not repeat it in another section.',
          'Add nothing. Anything you do not know, write explicitly as "unknown".',
          'Do not summarise figures, names or quotes — reproduce them exactly.',
          'No preamble, no pleasantries.',
          'Output the handover as ONE code block so I can copy it in one piece.'
        ],
        rulesHead: 'Rules:'
      }
    },

    /* What Lantern adds around the handover in the new chat. */
    launch: {
      de: {
        head: 'Das ist die Fortsetzung einer Arbeit aus einem anderen Chat. Die Übergabe steht unten.',
        rulesHead: 'So gehst du damit um:',
        rules: [
          'Die Übergabe ist maßgeblich. Wenn etwas in deinem gespeicherten Gedächtnis dazu im Widerspruch steht, gilt die Übergabe.',
          'Wiederhole, fasse oder bestätige die Übergabe nicht noch einmal.',
          'Fehlt für den nächsten Schritt eine wesentliche Angabe oder ist sie widersprüchlich oder unklar, stelle genau eine kurze Rückfrage. Sonst beginne sofort mit dem nächsten Schritt.',
          'Erfinde nichts, was nicht in der Übergabe steht. Fehlendes fragst du nach.'
        ],
        handoverHead: 'ÜBERGABE',
        nextHead: 'NÄCHSTER SCHRITT',
        nextDefault: 'Steht in der Übergabe unter „Nächster Schritt“.'
      },
      en: {
        head: 'This continues work from another chat. The handover is below.',
        rulesHead: 'How to use it:',
        rules: [
          'The handover is authoritative. Where anything in your saved memory contradicts it, the handover wins.',
          'Do not repeat, summarise, or reconfirm the handover.',
          'If an essential detail for the next step is missing, contradictory, or unclear, ask one short question. Otherwise begin the next step immediately.',
          'Invent nothing that is not in the handover. Ask me for what is missing.'
        ],
        handoverHead: 'HANDOVER',
        nextHead: 'NEXT STEP',
        nextDefault: 'See "Next step" in the handover.'
      }
    }
  },

  /* -------------------------------------------------------------------------
   * ROUTER — decides, without any model call, whether the local engine is
   * enough or whether the request is worth spending one ChatGPT message on.
   *
   * The logic: the local engine composes a template. That is enough when the
   * request is one clean task of a recognised kind. It is NOT enough when the
   * request has to be taken apart first — several tasks at once, embedded
   * material, conditional branches, or a subject the templates know nothing
   * about. Those are exactly the cases where a live model earns its message.
   *
   * The verdict is advisory: both buttons always work, and the reason is shown
   * so the user learns where the line is.
   * --------------------------------------------------------------------- */
  router: {
    threshold: 4,
    weights: {
      manyParts: 3, twoParts: 1,
      veryLong: 3, long: 2, mediumLength: 1,
      material: 3, conditional: 2,
      unclearKind: 2, ambiguousKind: 2, weakKind: 1,
      jargonHigh: 3, jargonSome: 1, alreadyPrompt: 3,
      perFilledSlot: -1, maxSlotCredit: -3,
      simple: -2
    },
    reasons: {
      de: {
        manyParts: 'mehrere Aufgaben in einer Anfrage',
        twoParts: 'zwei Aufgaben in einer Anfrage',
        veryLong: 'sehr lange Anfrage',
        long: 'lange Anfrage',
        mediumLength: 'mittellange Anfrage',
        material: 'eigenes Material zum Verarbeiten dabei',
        conditional: 'Bedingungen und Sonderfälle',
        unclearKind: 'Art der Aufgabe nicht erkennbar',
        ambiguousKind: 'Art der Aufgabe nicht eindeutig',
        weakKind: 'Art der Aufgabe nur schwach erkennbar',
        jargonHigh: 'viele Fachbegriffe',
        jargonSome: 'Fachbegriffe',
        alreadyPrompt: 'du hast schon einen Prompt geschrieben',
        slots: 'du hast schon Details angegeben',
        simple: 'klare, einfache Anfrage'
      },
      en: {
        manyParts: 'several tasks in one request',
        twoParts: 'two tasks in one request',
        veryLong: 'very long request',
        long: 'long request',
        mediumLength: 'medium-length request',
        material: 'your own material to work on',
        conditional: 'conditions and special cases',
        unclearKind: 'kind of task not recognisable',
        ambiguousKind: 'kind of task not clear-cut',
        weakKind: 'kind of task only weakly recognisable',
        jargonHigh: 'a lot of specialist terms',
        jargonSome: 'specialist terms',
        alreadyPrompt: 'you already wrote a prompt',
        slots: 'you already supplied details',
        simple: 'clear, simple request'
      }
    },
    verdict: {
      de: {
        local: 'Der lokale Prompt reicht hier.',
        model: 'Hier lohnt sich „Von {ai} schärfen“.'
      },
      en: {
        local: 'The local prompt is enough here.',
        model: '"Sharpen with {ai}" is worth it here.'
      }
    }
  },

  /* ---------------------------------------------------------------------
   * Task archetypes. Order matters only for display; detection is by score.
   * `general` is the fallback and carries no keywords.
   * ------------------------------------------------------------------- */
  archetypes: [
    {
      id: 'write',
      label: { de: 'Text schreiben', en: 'Write text' },
      /* 'rechnung' is safe as a bare word: kwHit wants a boundary before it, so
       * "Berechnung" does not hit. 'serienbrief' has to be listed separately
       * for the same reason — 'brief' never matches inside it. Both came out
       * of a batch of real office messages that fell through to `general`. */
      keywords: ['schreib', 'verfass', 'formulier', 'entwirf', 'entwerfe', 'aufsetzen', 'email', 'e-mail', 'mail', 'brief', 'serienbrief', 'rundschreiben', 'text', 'beitrag', 'artikel', 'bewerbung', 'anschreiben', 'nachricht', 'antwort', 'antworte auf', 'rede', 'einladung', 'kündigung', 'werbung', 'slogan',
                 'absage', 'zusage', 'stellenanzeige', 'ausschreibung', 'angebot', 'mahnung', 'erinnerung', 'pressemitteilung', 'memo', 'notiz', 'aktenvermerk', 'vermerk', 'rechnung', 'quittung', 'vollmacht', 'entschuldigung', 'danksagung', 'übergabe', 'faq',
                 'write', 'draft', 'letter', 'article', 'copy', 'message', 'reply', 'reply to', 'respond to', 'essay', 'caption', 'speech', 'newsletter',
                 'follow up', 'follow-up', 'reminder', 'rejection', 'apology', 'confirmation', 'invitation', 'job ad', 'job posting', 'press release', 'handover', 'announcement'],
      role: {
        de: 'Du bist ein erfahrener Autor. Du schreibst klar, konkret und ohne Floskeln.',
        en: 'You are an experienced writer. You write clearly and concretely, without filler.'
      },
      requirements: {
        de: ['Ton und Wortwahl an die Zielgruppe anpassen.'],
        en: ['Match tone and word choice to the audience.']
      },
      format: {
        de: 'Zuerst eine Betreffzeile oder Überschrift, danach der fertige Text. Setze [eckige Klammern] überall dort, wo ich noch eigene Angaben einsetzen muss.',
        en: 'First a subject line or headline, then the finished text. Use [square brackets] wherever I still need to fill something in.'
      },
      guards: {
        de: ['Liefere den Text fertig zum Verwenden.', 'Keine Werbefloskeln, keine aufgeblähten Formulierungen.'],
        en: ['Deliver the text ready to use.', 'No marketing filler, no inflated phrasing.']
      },
      asks: { de: 'an wen der Text geht, wie lang er sein soll, welcher Ton passt', en: 'who it is for, how long it should be, what tone fits' }
    },

    {
      /* Presentations are one of the five big office categories and had no
       * archetype at all. The guard that matters most: models invent plausible
       * business figures, and a deck full of invented numbers goes in front of
       * a board before anyone checks it. */
      id: 'present',
      label: { de: 'Präsentation / Folien', en: 'Presentation / slides' },
      strong: ['präsentation', 'praesentation', 'folien', 'foliensatz', 'powerpoint',
               'presentation', 'slide deck', 'slides', 'keynote', 'pitch deck'],
      keywords: ['vortrag', 'pitch', 'agenda für', 'workshop', 'schulung',
                 'talk for', 'agenda for', 'briefing deck', 'board meeting'],
      role: {
        de: 'Du baust Präsentationen, die eine Aussage transportieren – nicht Folien voller Text.',
        en: 'You build presentations that carry an argument — not slides full of text.'
      },
      requirements: {
        de: ['Eine Kernaussage pro Folie, als vollständiger Satz formuliert, nicht als Stichwort.', 'Nenne zu jeder Aussage, worauf sie sich stützt.'],
        en: ['One core message per slide, written as a full sentence, not a label.', 'For each message, say what it rests on.']
      },
      format: {
        de: 'Pro Folie: Titel als Aussagesatz, drei bis fünf Stichpunkte und in Klammern, was ich dazu sagen würde. Am Ende eine Folie mit der Empfehlung.',
        en: 'Per slide: title as a statement, three to five bullets, and in brackets what I would say out loud. A final slide with the recommendation.'
      },
      guards: {
        de: ['Erfinde keine Zahlen. Wo mir eine fehlt, schreibe [Zahl einsetzen] statt einer plausiblen Erfindung.', 'Keine Folie ohne Aussage — wenn eine Folie nur aufzählt, streiche sie.'],
        en: ['Invent no figures. Where one is missing, write [insert figure] rather than something plausible.', 'No slide without a point — if a slide only lists things, cut it.']
      },
      asks: { de: 'wie lange der Vortrag dauert, wer im Raum sitzt, was danach passieren soll', en: 'how long the talk is, who is in the room, what should happen afterwards' }
    },

    {
      /* OpenAI's usage research: two thirds of all writing tasks are modifying
       * text the user already has, and editing/critique (10.6%) outweighs
       * writing from scratch (8.0%). Lantern had `analyze`, whose directive
       * says "assess my material rather than rewriting it" — exactly wrong for
       * "fix my email", which is what most of that traffic actually is. */
      id: 'edit',
      label: { de: 'Meinen Text überarbeiten', en: 'Rework my text' },
      /* 'formulier das' and friends are `strong` while bare 'formulier' is a
       * WRITE keyword, and that is the whole point: "formuliere eine Absage"
       * writes something new, "formulier das höflicher" reworks something that
       * exists. The demonstrative is the only thing in the sentence that says
       * which, so it is what carries the weight. */
      strong: ['überarbeite', 'umschreib', 'korrigier', 'lektorier', 'rewrite', 'reword', 'proofread', 'polish',
               'formulier das', 'formulier es', 'formulier den', 'formuliere das', 'formuliere es', 'formuliere den'],
      /* 'nach fehlern' rather than a longer list of misspellings of
       * "korrigiere". A real message read "durchsuche diese mail nach fehlern
       * und korriegiere diesen vertrag" — the verb was typed wrong, and no
       * amount of keyword-chasing catches every way of doing that. What the
       * person wants is stated twice over in words that were spelled right. */
      keywords: ['kürze', 'kürzer machen', 'glätte', 'verbessere den', 'verbessere meinen', 'schreib um', 'formuliere um', 'entschärfe', 'straffe', 'auf hochdeutsch', 'klingt zu', 'nach fehlern', 'auf fehler', 'fehler such', 'höflicher', 'freundlicher', 'sachlicher', 'knapper', 'freundlicher machen', 'höflicher machen', 'professioneller machen', 'verständlicher machen',
                 'fix my', 'fix this', 'clean up', 'tidy up', 'tighten', 'make this shorter', 'make it shorter', 'improve this', 'improve my', 'rephrase', 'edit my', 'edit this',
                 'make it clearer', 'make this clearer', 'sounds too', 'polite but firm', 'soften', 'more professional', 'less harsh', 'tone down'],
      role: {
        de: 'Du überarbeitest fremde Texte, ohne sie zu deinen zu machen. Die Stimme des Autors bleibt.',
        en: 'You rework other people\'s text without making it yours. The author\'s voice stays.'
      },
      requirements: {
        de: ['Behalte meine Stimme, meinen Ton und meine Wortwahl, wo sie funktionieren.', 'Ändere nichts an den Fakten, Zahlen und Namen.'],
        en: ['Keep my voice, tone and word choice wherever they work.', 'Do not change any facts, figures or names.']
      },
      format: {
        de: 'Erst die überarbeitete Fassung, fertig zum Verwenden. Danach höchstens fünf Stichpunkte, was du geändert hast und warum.',
        en: 'The reworked version first, ready to use. Then at most five bullets on what you changed and why.'
      },
      guards: {
        de: ['Schreibe nicht alles neu. Ändere nur, was wirklich besser wird.', 'Wenn eine Stelle unklar ist, frag nach, statt dir etwas auszudenken.'],
        en: ['Do not rewrite everything. Change only what genuinely improves.', 'Where a passage is unclear, ask me rather than inventing something.']
      },
      asks: { de: 'was dich an der jetzigen Fassung stört, wofür der Text gedacht ist', en: 'what bothers you about the current version, what the text is for' }
    },

    {
      id: 'analyze',
      label: { de: 'Prüfen & bewerten', en: 'Analyse & review' },
      keywords: ['analysier', 'bewerte', 'prüf', 'überprüf', 'ueberpruef', 'vergleich', 'kritik', 'feedback', 'gegenlesen', 'schau dir', 'sieh dir', 'was hältst du', 'was fällt dir auf', 'schwachstellen', 'fehler in', 'geschrieben hat', 'geschrieben habe',
                 'swot', 'auswertung', 'ursache', 'woran liegt', 'was lief schief', 'warum ist', 'warum sind',
                 'analyse', 'analyze', 'review', 'evaluate', 'compare', 'critique', 'assess', 'audit', 'look at my', 'check my', 'what is wrong with', 'he wrote', 'she wrote', 'they wrote', 'i wrote', 'poke holes', 'issues with', 'what issues',
                 'root cause', 'figure out why', 'why did', 'why are', 'dropped', 'went wrong'],
      role: {
        de: 'Du bist ein kritischer Fachgutachter. Du benennst Schwächen direkt und begründest jede Einschätzung.',
        en: 'You are a critical expert reviewer. You name weaknesses directly and justify every judgement.'
      },
      requirements: {
        de: ['Trenne klar zwischen Beobachtung, Bewertung und Empfehlung.', 'Nenne auch, was gut funktioniert, aber halte dich damit kurz.'],
        en: ['Separate observation, judgement and recommendation clearly.', 'Note what works well too, but keep that brief.']
      },
      format: {
        de: 'Gegliederte Punkte, nach Wichtigkeit sortiert. Zu jedem Punkt: was, warum es zählt und was zu tun ist.',
        en: 'Structured points, ordered by importance. For each: what, why it matters, what to do about it.'
      },
      guards: {
        de: ['Sei ehrlich statt höflich. Beschönige nichts.', 'Keine allgemeinen Ratschläge — beziehe dich auf das konkrete Material.'],
        en: ['Be honest rather than polite. Do not soften findings.', 'No generic advice — refer to the specific material.']
      },
      asks: { de: 'woran du das messen sollst, wofür das Ergebnis gebraucht wird', en: 'what to measure it against, what the result is used for' }
    },

    {
      id: 'code',
      label: { de: 'Programmieren', en: 'Code' },
      // NB: no bare 'funktion' — it fires inside 'funktioniert' and steals
      // explain-requests from the 'learn' archetype.
      //
      // `strong` names the deliverable rather than describing it. "einen java
      // code der briefe scannt und eine nachricht schreibt" is a request for
      // CODE: briefe, nachricht and schreibt describe what the program does,
      // and on ordinary weighting they outvote the two words that say what is
      // actually being asked for. Nobody says "java" by accident.
      strong: ['code', 'quellcode', 'programm', 'skript', 'script', 'python', 'java',
               'javascript', 'typescript', 'html', 'css', 'sql', 'php', 'ruby',
               'swift', 'kotlin', 'bash', 'powershell', 'vba', 'regex', 'api'],
      keywords: ['bug', 'fehlermeldung', 'makro', 'macro', 'excel formel', 'formel', 'debug', 'function', 'library', 'refactor', 'terminal', 'compiler', 'klasse', 'methode'],
      role: {
        de: 'Du bist ein erfahrener Entwickler. Du lieferst lauffähigen Code und erklärst nur das Nötige.',
        en: 'You are an experienced developer. You deliver working code and explain only what is necessary.'
      },
      requirements: {
        de: ['Nenne Sprache, Version und benötigte Pakete.', 'Behandle Fehlerfälle, statt den Idealfall anzunehmen.'],
        en: ['State the language, version and required packages.', 'Handle error cases rather than assuming the happy path.']
      },
      format: {
        de: 'Vollständiger Code in einem Codeblock, danach maximal fünf Zeilen Erklärung und eine kurze Anleitung zum Ausführen.',
        en: 'Complete code in one code block, then at most five lines of explanation and a short note on how to run it.'
      },
      guards: {
        de: ['Keine Platzhalter wie „hier deine Logik“ — schreibe den Code fertig aus.', 'Wenn du eine Bibliothek verwendest, sag warum.'],
        en: ['No placeholders like "your logic here" — write the code out fully.', 'If you use a library, say why.']
      },
      asks: { de: 'welche Sprache und Umgebung, was genau das Programm können soll', en: 'which language and environment, what exactly it must do' }
    },

    {
      id: 'learn',
      label: { de: 'Erklären lassen', en: 'Explain' },
      keywords: ['erklär', 'erklar', 'was ist', 'was sind', 'funktioniert', 'verstehen', 'verständlich', 'beibringen', 'lernen', 'unterschied zwischen', 'warum', 'wieso', 'weshalb', 'wie kann ich', 'wie mache ich', 'wie funktioniert', 'wie groß', 'wie gross', 'wie lang', 'wie viele', 'wie oft', 'kann das', 'kann man', 'stimmt es', 'was passiert', 'im verhältnis',
                 'woher stammt', 'woher kommt', 'ursprung', 'welche arten', 'arten von', 'was bedeutet',
                 'explain', 'what is', 'what are', 'what does', 'how does', 'how do', 'how can i', 'how large', 'how big', 'how long', 'how many', 'how often', 'how far', 'can that', 'can it', 'is it true', 'what happens', 'in proportion', 'understand', 'teach', 'difference between', 'why does', 'why is', 'beginner', 'simple terms',
                 'darf ich', 'ist es erlaubt', 'muss ich', 'welche regel', 'regelung', 'richtlinie', 'vorschrift',
                 'welche unterlagen', 'was brauche ich', 'brauche ich für', 'was muss in', 'wie hoch', 'wie teuer', 'was kostet', 'was kosten',
                 'where does', 'hail from', 'origin of', 'kinds of', 'types of', 'different kinds',
                 'am i allowed', 'do i have to', 'what is the rule', 'usual rule', 'policy on', 'is it ok to'],
      role: {
        de: 'Du erklärst komplizierte Dinge verständlich, ohne sie zu verfälschen.',
        en: 'You explain complicated things understandably without distorting them.'
      },
      requirements: {
        de: ['Beginne mit der Kernidee in zwei Sätzen, dann die Details.', 'Nutze ein konkretes Beispiel aus dem Alltag.'],
        en: ['Start with the core idea in two sentences, then the detail.', 'Use one concrete everyday example.']
      },
      format: {
        de: 'Kurzantwort zuerst, dann Erklärung in Abschnitten, am Ende drei Sätze Zusammenfassung.',
        en: 'Short answer first, then the explanation in sections, then a three-sentence summary.'
      },
      guards: {
        de: ['Erkläre Fachbegriffe beim ersten Auftauchen in Klammern.', 'Vereinfache nicht so weit, dass es falsch wird — sag lieber, wo es komplizierter ist.'],
        en: ['Explain jargon in brackets on first use.', 'Do not simplify to the point of being wrong — say where it gets more complicated.']
      },
      asks: { de: 'welches Vorwissen du mitbringst, wofür du es brauchst', en: 'what you already know, what you need it for' }
    },

    {
      id: 'plan',
      label: { de: 'Planen', en: 'Plan' },
      keywords: ['plan', 'strategie', 'taktik', 'konzept', 'schritte', 'vorgehen', 'projekt', 'ablauf', 'organisier', 'zeitplan', 'checkliste', 'roadmap', 'wie sollten wir', 'bester weg', 'am besten vorgehen', 'management', 'priorisier', 'to-do', 'todo liste', 'aufgabenliste', 'sprint', 'meilenstein',
                 'prioriti', 'to-do list', 'todo list', 'task list', 'backlog', 'milestone', 'sprint',
                 'strategy', 'tactics', 'steps', 'process', 'project', 'organize', 'schedule', 'checklist', 'timeline', 'how should we', 'how should i approach', 'best approach', 'best way to'],
      role: {
        de: 'Du bist ein erfahrener Projektplaner. Du denkst in konkreten Schritten, nicht in Schlagworten.',
        en: 'You are an experienced planner. You think in concrete steps, not in buzzwords.'
      },
      requirements: {
        de: ['Jeder Schritt braucht ein Ergebnis, das man abhaken kann.', 'Nenne Aufwand und Reihenfolge, und was von was abhängt.', 'Weise auf die zwei wahrscheinlichsten Stolpersteine hin.'],
        en: ['Every step needs a checkable outcome.', 'State effort, order, and what depends on what.', 'Point out the two most likely obstacles.']
      },
      format: {
        de: 'Nummerierte Schritte. Pro Schritt: was zu tun ist, woran man merkt, dass es fertig ist, geschätzter Aufwand.',
        en: 'Numbered steps. Per step: what to do, how you know it is done, estimated effort.'
      },
      guards: {
        de: ['Keine Allgemeinplätze wie „Ziele definieren“ ohne konkreten Inhalt.'],
        en: ['No platitudes like "define your goals" without concrete content.']
      },
      asks: { de: 'welches Zeitfenster, welches Budget, wer beteiligt ist', en: 'what timeframe, what budget, who is involved' }
    },

    {
      id: 'decide',
      label: { de: 'Entscheiden', en: 'Decide' },
      // NB: no bare 'oder' / 'or' — they appear in a large share of all German
      // and English sentences and would swamp every other archetype.
      keywords: ['entscheid', 'welche soll', 'welches soll', 'weiß nicht welche', 'weiss nicht welche', 'nehmen soll', 'lohnt sich', 'empfehl', 'besser als', 'vor- und nachteile', 'vor und nachteile', 'kaufen', 'auswählen', 'decide', 'which should', 'should i', 'worth it', 'recommend', 'pros and cons', 'better than', 'choose between', 'cannot choose', 'can\u2019t choose'],
      role: {
        de: 'Du bist ein nüchterner Berater. Du gibst am Ende eine klare Empfehlung ab.',
        en: 'You are a level-headed advisor. You give a clear recommendation at the end.'
      },
      requirements: {
        de: ['Nenne zuerst die Kriterien, nach denen du urteilst.', 'Gewichte die Kriterien danach, was für mich zählt.', 'Nenne die Bedingung, unter der deine Empfehlung kippen würde.'],
        en: ['State the criteria you judge by first.', 'Weight the criteria by what matters to me.', 'Name the condition under which your recommendation would flip.']
      },
      format: {
        de: 'Vergleichstabelle, darunter eine klare Empfehlung mit zwei Sätzen Begründung.',
        en: 'Comparison table, then a clear recommendation with two sentences of reasoning.'
      },
      guards: {
        de: ['Weiche nicht auf „das kommt darauf an“ aus — nenne, worauf es ankommt, und entscheide dann.'],
        en: ['Do not retreat to "it depends" — say what it depends on, then decide.']
      },
      asks: { de: 'was dir dabei am wichtigsten ist, welches Budget, welche Optionen schon feststehen', en: 'what matters most to you, what budget, which options are already on the table' }
    },

    {
      id: 'summarize',
      label: { de: 'Zusammenfassen', en: 'Summarise' },
      // "fass die wichtigsten Punkte … zusammen" is one verb split across the
      // sentence, so 'zusammenfass' never matches. Bare 'zusammen' would fire
      // inside "Zusammenarbeit"; the short bigrams are the safe middle.
      /* 'fasse es'/'fass es' are safe despite looking dangerous: kwHit needs a
       * word boundary before the match, so "verfasse es kurz" (a write request)
       * does not hit them. Added because the very first message a real user
       * offered as typical was "lese dir das alles durch unf fasse es kurz." —
       * which fell through to `general`, i.e. to no prompt worth building. */
      keywords: ['zusammenfass', 'fass mir', 'fass die', 'fass das', 'fass den', 'fass es', 'fasse mir', 'fasse die', 'fasse das', 'fasse den', 'fasse es', 'kurz zusammen', 'kurz fassen', 'kürzer fassen', 'in kurzform', 'kürzen', 'auf den punkt', 'kernaussage', 'protokoll', 'besprechungsnotiz', 'to-dos', 'todos',
                 'summar', 'condense', 'shorten', 'key points', 'key takeaways', 'tldr', 'gist', 'minutes', 'meeting notes', 'action items', 'action points'],
      role: {
        de: 'Du fasst präzise zusammen, ohne eigene Wertung hinzuzufügen.',
        en: 'You summarize precisely, without adding judgement of your own.'
      },
      requirements: {
        de: ['Behalte Zahlen, Namen und Fristen exakt bei.', 'Trenne, was im Text steht, von dem, was daraus folgt.'],
        en: ['Keep numbers, names and deadlines exact.', 'Separate what the text says from what follows from it.']
      },
      format: {
        de: 'Erst drei Sätze Kernaussage, dann Stichpunkte nach Themen, am Ende offene Punkte oder Aufgaben.',
        en: 'First a three-sentence core message, then bullets grouped by topic, then open points or action items.'
      },
      guards: {
        de: ['Erfinde nichts hinzu, was nicht im Ausgangsmaterial steht.'],
        en: ['Do not add anything that is not in the source material.']
      },
      asks: { de: 'wie lang die Zusammenfassung sein soll, für wen sie ist', en: 'how long the summary should be, who it is for' }
    },

    {
      id: 'data',
      label: { de: 'Daten & Tabellen', en: 'Data & tables' },
      keywords: ['tabelle', 'liste', 'daten', 'excel', 'csv', 'sortier', 'auswerten', 'statistik', 'extrahier', 'kennzahl', 'pivot', 'diagramm', 'übersicht', 'uebersicht', 'aufstellung', 'gegenüberstellung',
                 'table', 'list', 'data', 'spreadsheet', 'extract', 'sort', 'chart', 'statistics', 'kpi', 'kpis', 'dashboard', 'monthly report'],
      role: {
        de: 'Du strukturierst Informationen sauber und nachvollziehbar.',
        en: 'You structure information cleanly and traceably.'
      },
      requirements: {
        de: ['Definiere jede Spalte, bevor du die Tabelle füllst.', 'Markiere fehlende Werte ausdrücklich als „unbekannt“, statt sie zu schätzen.'],
        en: ['Define every column before filling the table.', 'Mark missing values explicitly as "unknown" rather than estimating them.']
      },
      format: {
        de: 'Markdown-Tabelle mit Kopfzeile. Darunter kurz die Auffälligkeiten in Stichpunkten.',
        en: 'Markdown table with a header row. Below it, the notable findings as short bullets.'
      },
      guards: {
        de: ['Rechne Summen und Prozentwerte nach und zeige den Rechenweg, wenn er nicht offensichtlich ist.'],
        en: ['Recheck sums and percentages, and show the calculation when it is not obvious.']
      },
      asks: { de: 'welche Spalten du brauchst, woher die Daten kommen', en: 'which columns you need, where the data comes from' }
    },

    {
      id: 'image',
      label: { de: 'Bild erzeugen', en: 'Generate an image' },
      keywords: ['bild', 'grafik', 'logo', 'illustration', 'zeichne', 'foto', 'poster', 'image', 'picture', 'draw', 'illustration', 'graphic', 'render', 'artwork'],
      role: {
        de: 'Du erzeugst ein Bild nach einer präzisen Bildbeschreibung.',
        en: 'You generate an image from a precise visual description.'
      },
      requirements: {
        de: ['Motiv, Bildausschnitt, Perspektive, Licht, Farbstimmung und Stil müssen eindeutig sein.', 'Format und Seitenverhältnis festlegen.'],
        en: ['Subject, framing, perspective, lighting, colour mood and style must be unambiguous.', 'Fix the format and aspect ratio.']
      },
      format: {
        de: 'Erzeuge das Bild. Nenne darunter in einer Zeile, welche Details du selbst ergänzt hast.',
        en: 'Generate the image. Below it, note in one line which details you filled in yourself.'
      },
      guards: {
        de: ['Kein Text im Bild, außer ich verlange ihn ausdrücklich.'],
        en: ['No text in the image unless I explicitly ask for it.']
      },
      asks: { de: 'welcher Stil, welches Seitenverhältnis, wofür das Bild verwendet wird', en: 'what style, what aspect ratio, what the image is used for' }
    },

    {
      /* "What's the word for…" — a whole question shape with a specific
       * failure mode: models invent a plausible-sounding word rather than
       * admit the described thing has no name they know. Two of seven real
       * user messages were exactly this. */
      id: 'recall',
      label: { de: 'Wort / Begriff suchen', en: 'Find a word or term' },
      keywords: ['wie heißt', 'wie heisst', 'wie nennt man', 'wie nennt sich', 'komme nicht drauf', 'liegt mir auf der zunge', 'das wort für', 'begriff für', 'hatte einen namen', 'gab es einen namen', 'ich suche das wort', 'wort dafür', 'wie sagt man dazu',
                 'welches buch', 'welcher film', 'aus welchem', 'woher stammt das zitat', 'wer hat das gesagt',
                 'what was the word', 'what is the word', 'what\'s the word', 'word for when', 'word to call', 'term for when', 'term for a', 'what is it called', 'what\'s it called', 'called again', 'tip of my tongue', 'i forgot the word', 'something like',
                 'what book', 'which book', 'what film', 'which movie', 'what was that from', 'where is that from', 'who said that', 'what is that quote'],
      role: {
        de: 'Du bist gut darin, Begriffe wiederzufinden, die einem nur halb einfallen – aus einer ungenauen Beschreibung und einem Klang, den man falsch im Ohr hat.',
        en: 'You are good at recovering half-remembered terms from a vague description and a misremembered sound.'
      },
      requirements: {
        de: ['Nimm meine Beschreibung ernst, auch wenn meine Schreibweise falsch ist.', 'Berücksichtige, dass ich den Klang des Wortes falsch erinnere.'],
        en: ['Take my description seriously even where my spelling is wrong.', 'Assume I am misremembering how the word sounds.']
      },
      format: {
        de: 'Drei bis fünf Kandidaten, der wahrscheinlichste zuerst. Zu jedem: das Wort, eine Zeile Bedeutung, und warum es passt oder nicht. Danach ein Satz, welches es deiner Meinung nach ist.',
        en: 'Three to five candidates, most likely first. For each: the word, one line of meaning, and why it fits or does not. Then one sentence on which you think it is.'
      },
      guards: {
        de: ['Erfinde kein Wort. Wenn nichts wirklich passt, sag das ausdrücklich und beschreibe stattdessen, wie man die Sache umschreibt.', 'Wenn ein Kandidat nur ungefähr passt, sag dazu, was nicht stimmt.'],
        en: ['Do not invent a word. If nothing really fits, say so plainly and describe how the thing is usually paraphrased instead.', 'Where a candidate only roughly fits, say what is off about it.']
      },
      asks: { de: 'in welchem Zusammenhang du das Wort gehört hast', en: 'where you came across the word' }
    },

    {
      /* Numbers are where a confident wrong answer is most expensive and
       * hardest to spot. */
      id: 'calculate',
      label: { de: 'Rechnen', en: 'Work it out' },
      strong: ['wahrscheinlichkeit', 'umrechnen', 'umgerechnet', 'arbeitstage', 'werktage', 'probability', 'convert'],
      keywords: ['berechne', 'rechne', 'wie viel ist', 'wieviel ist', 'wie viele tage', 'wie viele arbeitstage', 'wie viele wochen', 'chance dass', 'prozent', 'durchschnitt', 'summe', 'wie viel kostet', 'zinsen', 'mehrwertsteuer',
                 'what are the odds', 'odds of', 'how likely', 'calculate', 'work out', 'average of', 'percentage', 'how much is', 'how many days', 'how many working days', 'how many weeks', 'how many mbit', 'in mbit', 'in kg', 'in miles'],
      role: {
        de: 'Du rechnest sorgfältig und zeigst deinen Rechenweg, damit ich ihn nachprüfen kann.',
        en: 'You calculate carefully and show your working so I can check it.'
      },
      requirements: {
        de: ['Nenne zuerst deine Annahmen — besonders was als unabhängig, gleichverteilt oder geordnet gilt.', 'Rechne exakt und runde erst im letzten Schritt.'],
        en: ['State your assumptions first — especially what counts as independent, uniform or ordered.', 'Work exactly and round only at the final step.']
      },
      format: {
        de: 'Erst die Annahmen, dann der Rechenweg Schritt für Schritt, dann das Ergebnis als exakter Wert und als Dezimalzahl bzw. Prozent.',
        en: 'Assumptions first, then the working step by step, then the result as an exact value and as a decimal or percentage.'
      },
      guards: {
        de: ['Prüfe das Ergebnis am Ende mit einem zweiten, unabhängigen Weg nach und sag, ob beide übereinstimmen.', 'Wenn die Frage mehrdeutig ist, rechne die wahrscheinlichste Lesart und benenne die andere.'],
        en: ['Check the result at the end by a second, independent route and say whether the two agree.', 'If the question is ambiguous, compute the most likely reading and name the other one.']
      },
      asks: { de: 'welche Annahmen gelten sollen', en: 'which assumptions should hold' }
    },

    {
      /* "link the book … amazon". Models are confidently wrong about URLs,
       * prices and availability, and a beginner has no way to tell. The whole
       * value of this archetype is its guard. */
      id: 'find',
      label: { de: 'Etwas finden', en: 'Find something' },
      strong: ['link mir', 'verlinke', 'wo kaufe', 'wo bekomme', 'bezugsquelle', 'link me', 'link the', 'where can i buy', 'where to buy', 'find me a'],
      keywords: ['finde mir', 'such mir', 'welche ausgabe', 'welche version', 'empfehlung für ein produkt', 'amazon', 'shop',
                 'find a', 'look up', 'which edition', 'which version', 'recommend a product', 'buy'],
      role: {
        de: 'Du hilfst, konkrete Dinge zu finden, und sagst offen, was du nicht überprüfen kannst.',
        en: 'You help find specific things and are honest about what you cannot verify.'
      },
      requirements: {
        de: ['Nenne zu jedem Vorschlag, woran ich ihn eindeutig erkenne (Titel, Auflage, ISBN, Hersteller, Modellnummer).'],
        en: ['For each suggestion, give me what identifies it unambiguously (title, edition, ISBN, maker, model number).']
      },
      format: {
        de: 'Kurze Liste mit je einer Zeile Begründung. Danach die genauen Suchbegriffe, mit denen ich es selbst finde.',
        en: 'A short list with one line of reasoning each. Then the exact search terms I can use to find it myself.'
      },
      guards: {
        de: ['Erfinde keine Links, Preise, ISBNs oder Verfügbarkeiten. Wenn du eine Seite nicht wirklich abrufen kannst, sag das ausdrücklich und gib mir stattdessen die Suchbegriffe.', 'Sag dazu, wenn sich Preise oder Verfügbarkeit seit deinem Wissensstand geändert haben können.'],
        en: ['Do not invent links, prices, ISBNs or availability. If you cannot actually retrieve a page, say so plainly and give me the search terms instead.', 'Say where prices or availability may have changed since your knowledge cutoff.']
      },
      asks: { de: 'in welchem Land du kaufst, welches Budget, welche Sprache oder Ausgabe', en: 'which country you buy in, what budget, which language or edition' }
    },

    {
      id: 'translate',
      label: { de: 'Übersetzen', en: 'Translate' },
      keywords: ['übersetz', 'ubersetz', 'auf englisch', 'auf deutsch', 'ins englische', 'ins deutsche', 'translate', 'into english', 'into german'],
      role: {
        de: 'Du bist ein erfahrener Übersetzer. Du überträgst Sinn und Ton, nicht Wort für Wort.',
        en: 'You are an experienced translator. You carry over meaning and tone, not word for word.'
      },
      requirements: {
        de: ['Halte das Register (förmlich oder locker) der Vorlage.', 'Übertrage Redewendungen sinngemäß, nicht wörtlich.'],
        en: ['Keep the register (formal or casual) of the original.', 'Carry idioms across by sense, not literally.']
      },
      format: {
        de: 'Nur die Übersetzung. Darunter höchstens drei Anmerkungen zu Stellen, die mehrdeutig waren, und nur, wenn es sie gibt.',
        en: 'The translation only. Below it, at most three notes on genuinely ambiguous passages — and only if there are any.'
      },
      guards: {
        de: ['Füge nichts hinzu und lasse nichts weg.', 'Übersetze auch Eigennamen nicht, außer es gibt eine etablierte Entsprechung.'],
        en: ['Add nothing and leave nothing out.', 'Do not translate proper names unless an established equivalent exists.']
      },
      asks: { de: 'in welche Sprache, förmlich oder locker, wofür der Text gedacht ist', en: 'into which language, formal or casual, what the text is for' }
    },

    {
      id: 'general',
      label: { de: 'Allgemein', en: 'General' },
      keywords: [],
      role: {
        de: 'Du bist ein sachkundiger Assistent, der präzise und ohne Umschweife antwortet.',
        en: 'You are a knowledgeable assistant who answers precisely and without detours.'
      },
      requirements: { de: [], en: [] },
      format: {
        de: 'Antworte strukturiert: kurze Kernantwort zuerst, dann die Begründung oder die Details.',
        en: 'Answer with structure: a short core answer first, then the reasoning or the detail.'
      },
      guards: { de: [], en: [] },
      asks: { de: 'wofür du das Ergebnis brauchst', en: 'what you need the result for' }
    }
  ],

  /* The volatile part: advice that depends on the current model generation.
   * Keep this short and revisit it when models change. Everything above is
   * structural and ages far more slowly. */

  /* Google asks for an explicit anchor sentence after long context, so the
   * model is pointed back at the material rather than at its own memory. */
  closingAnchor: {
    de: 'Beziehe dich für alles oben Genannte ausschließlich auf das Material in dieser Nachricht.',
    en: 'For everything above, use only the material in this message.'
  },

  /* Per-model lines, and they contradict each other on purpose — this is
   * Anthropic's own published guidance, model by model, and following it for
   * the wrong model makes the answer worse rather than merely different. */
  familyLines: {
    de: {
      opusConcise: 'Fass dich kurz. Antworte auf das, was ich gefragt habe, ohne Vorrede und ohne Zusammenfassung am Ende.',
      sonnetScope: 'Wende diese Vorgaben auf den gesamten Text an, nicht nur auf den ersten Abschnitt.',
      fableProgress: 'Sag mir kurz, was du tust, bevor du längere Abschnitte schreibst.'
    },
    en: {
      opusConcise: 'Keep it short. Answer what I asked, with no preamble and no closing summary.',
      sonnetScope: 'Apply these requirements to the whole text, not only to the first section.',
      fableProgress: 'Briefly say what you are doing before writing longer stretches.'
    }
  },

  /* ------------------------------------------------------------------ help
   *
   * The brief for this was: someone who reads it should be able to do this
   * without the tool afterwards. That is a real constraint, and it rules out
   * the usual thing — a feature tour. "Click Build prompt to build a prompt"
   * teaches nobody anything.
   *
   * So every card is a question a beginner actually asks, answered by the
   * *reason*, and then closes with `self`: the technique in one line, phrased
   * so they can type it themselves next time. The tool is trying to make itself
   * unnecessary, which is the only honest goal for something like this.
   *
   * `only` restricts a card to one provider where the fact is provider-specific.
   * Knowledge, not interface, so it lives here and the update channel can
   * improve it without shipping a new build.
   */
  /* -------------------------------------------------------------------------
   * WHICH ASSISTANT FOR WHAT.
   *
   * The hardest thing in this file to write honestly, because it is the part
   * that cannot be kept current. There is no free, key-less, CORS-open source
   * that ranks assistants by capability — the good benchmark data sits behind
   * an API key its own terms say not to put in a browser, and the open
   * alternatives carry specifications, not judgements. So this is written by
   * hand, and it says so at the top.
   *
   * Which forces a discipline: **only claims that will still be roughly true
   * in a year.** Three kinds qualify.
   *
   *   1. Things a vendor states about its own product's design — "cannot
   *      generate images", "terse by default", "prompt explicitly for
   *      conciseness". These change when the product changes, not when a model
   *      ships.
   *   2. Which ecosystem each one reaches into. Office, Google, everything
   *      else. Slow-moving and highly consequential for the person choosing.
   *   3. What each one flatly cannot do. The most useful line in a comparison
   *      is the one that saves someone an hour of trying.
   *
   * What is deliberately NOT here: any ranking of factual reliability. That
   * ordering inverted inside ten months — see the note in `answerRules` — so a
   * hand-written file naming a winner would be wrong faster than it could be
   * read. The closing line says the true thing instead.
   *
   * Also not here: "best at creative writing", "best at translation". No
   * evaluation worth citing exists for either; everything on offer is
   * affiliate copy. A gap is better than a made-up ranking.
   *
   * No model names, no version numbers, no prices, no message counts. Every
   * one of those was wrong within months of being written down.
   * --------------------------------------------------------------------- */
  compare: {
    note: {
      de: 'Von Hand geschrieben, Stand September 2026 – das hier aktualisiert sich nicht von selbst. Nimm es als Startpunkt, nicht als aktuelle Rangliste. Bei Alltagskram nehmen sich die drei nicht viel; interessant wird es an den Rändern.',
      en: 'Written by hand, September 2026 — this does not update itself. Treat it as a starting point, not a current ranking. On everyday work there is little between the three; it gets interesting at the edges.'
    },

    /* The part somebody can actually act on, first. */
    choose: [
      { when: { de: 'Ein Bild, ein Diagramm mit lesbarer Schrift, oder ein Video',
                en: 'A picture, a diagram with legible text in it, or a video' },
        pick: 'gemini',
        why: { de: 'Claude kann überhaupt keine Bilder erzeugen, ChatGPT kein Video mehr.',
               en: 'Claude cannot generate images at all, and ChatGPT no longer does video.' } },

      { when: { de: 'Deine Arbeit liegt in Word, Excel, PowerPoint oder Outlook',
                en: 'Your work lives in Word, Excel, PowerPoint or Outlook' },
        pick: 'claude',
        why: { de: 'Die Microsoft-365-Anbindung ist dort selbst im kostenlosen Tarif dabei. Bei den anderen beiden hängt Vergleichbares hinter einem Abo.',
               en: 'Its Microsoft 365 connector is included even on the free plan. The other two put the equivalent behind a subscription.' } },

      { when: { de: 'Deine Arbeit liegt in Gmail, Google Docs, Drive oder Fotos',
                en: 'Your work lives in Gmail, Google Docs, Drive or Photos' },
        pick: 'gemini',
        why: { de: 'Aber genau hinsehen: Die App selbst kommt an deine Google-Sachen, die Leiste direkt in Docs und Gmail kostet extra.',
               en: 'But check the tier: the app itself can reach your Google things; the sidebar inside Docs and Gmail costs extra.' } },

      { when: { de: 'Du willst einfach viel schreiben, ohne zu zahlen',
                en: 'You just want to write a lot without paying' },
        pick: 'chatgpt',
        why: { de: 'Reine Textchats sind dort unbegrenzt. Dafür läuft im Gratis-Tarif Werbung mit.',
               en: 'Plain text chats there are unlimited. The free tier carries ads in exchange.' } },

      { when: { de: 'Ein langes Dokument, das wirklich gelesen werden soll, oder eine Aufgabe über mehrere Schritte',
                en: 'A long document that genuinely has to be read — or a job that runs over several steps' },
        pick: 'claude',
        why: { de: 'Und sag ausdrücklich dazu, dass es kurz sein soll, sonst wird es lang.',
               en: 'And say explicitly that it should be brief, or it will not be.' } },

      { when: { de: 'Kurze, direkte Antworten',
                en: 'Short, direct answers' },
        pick: 'gemini',
        why: { de: 'Gemini ist von Haus aus knapp, Claude von Haus aus ausführlich, ChatGPT liegt dazwischen. Das ist der stabilste Unterschied zwischen den dreien.',
               en: 'Gemini is terse by design, Claude expansive by design, ChatGPT sits between them. That is the most stable difference of the three.' } }
    ],

    vendors: [
      { id: 'chatgpt', name: 'ChatGPT', by: 'OpenAI', url: 'https://chatgpt.com',
        best: { de: 'Am großzügigsten, wenn du nichts zahlen willst: reine Textchats ohne Limit. Und die breiteste Ausstattung – Bilder, Sprache, Datenauswertung, mit Abstand die meisten Anbindungen an andere Dienste.',
                en: 'The most generous if you are not paying: plain text chats without a limit. And the broadest kit — images, voice, data analysis, and by some way the most connections to other services.' },
        weak: { de: 'Im Gratis- und im günstigsten Tarif läuft Werbung mit. Video kann es nicht mehr. Und die Produkte wechseln schnell: Was heute dabei ist, kann in einem halben Jahr abgeschaltet sein – das ist zweimal in einem Jahr passiert.',
                en: 'The free and cheapest tiers carry ads. It no longer does video. And the products churn: what is included today can be switched off in six months, which has happened twice in a year.' } },

      { id: 'claude', name: 'Claude', by: 'Anthropic', url: 'https://claude.ai',
        best: { de: 'Die beste Wahl, wenn deine Arbeit in Office liegt – Word, Excel, PowerPoint und Outlook hängen direkt dran, ohne Abo. Stark bei langen Dokumenten, bei Aufgaben über mehrere Schritte und bei Code.',
                en: 'The best choice if your work lives in Office — Word, Excel, PowerPoint and Outlook connect directly, with no subscription. Strong on long documents, multi-step jobs and code.' },
        weak: { de: 'Es kann keine Bilder erzeugen. Gar keine – nur Diagramme, die es als Code zeichnet. Es redet zu viel, und das ist kein Eindruck: Der Hersteller schreibt selbst, dass die Aufwandsstufe daran nichts ändert und man ausdrücklich um Kürze bitten muss. Das knappste Gratis-Kontingent der drei.',
                en: 'It cannot generate images. Not any — only diagrams it draws as code. It talks too much, and that is not an impression: the vendor states that the effort setting will not fix it and that you have to ask for brevity explicitly. The tightest free allowance of the three.' } },

      { id: 'gemini', name: 'Gemini', by: 'Google', url: 'https://gemini.google.com',
        best: { de: 'Bilder, mit Abstand – besonders wenn im Bild Schrift stehen soll, die man auch lesen kann. Als einziges der drei macht es Video. Und es kommt an deine Google-Sachen: Gmail, Kalender, Drive, Fotos.',
                en: 'Images, by a distance — especially when the picture has to contain text you can actually read. The only one of the three that does video. And it reaches your Google things: Gmail, Calendar, Drive, Photos.' },
        weak: { de: 'In langen Gesprächen verliert es den Faden; das steht so in Googles eigener Modellkarte. Und die kleinen Modelle, die man gratis bekommt, erfinden ziemlich dreist, wenn sie etwas nicht wissen – gerade dort lohnt es sich, nach Quellen zu fragen.',
                en: 'It loses the thread in long conversations — that is in Google’s own model card. And the small models you get for free bluff quite freely when they do not know something, which is exactly where asking for sources pays.' } }
    ],

    /* The line that matters more than any of the above. */
    footer: {
      de: 'Für alle drei gilt: Bei schwierigen Faktenfragen erfinden sie in mehr als der Hälfte der Fälle etwas dazu. Wer davon gerade am wenigsten erfindet, hat in einem Jahr zweimal gewechselt – deshalb steht hier auch keine Rangliste. Worauf du dich wirklich verlassen musst, prüfst du nach. Egal, wer es geschrieben hat.',
      en: 'True of all three: on hard factual questions they invent things more than half the time. Which one invents least has changed twice within a year, which is why there is no ranking here. Anything you cannot afford to have wrong, you check — whoever wrote it.'
    }
  },

  /* -------------------------------------------------------------------------
   * SOME OF THE SAME ANSWERS, IN TENNIS.
   *
   * A good part of the people this is being handed to are professional players
   * and coaches, in both languages, and for them shot selection, video work
   * and the shape of a practice block are not metaphors. They are the terms
   * they already think in. Where a thing about language models happens to work
   * the same way as a thing about coaching, saying it in those terms is not
   * decoration; it is the shortest honest route to the idea.
   *
   * FOUR RULES, and the third one is the one that was got wrong first.
   *
   * 1. USE THE VOCABULARY, DO NOT TEACH IT. Nobody here needs slice,
   *    Splitstep, longline or unerzwungener Fehler defined for them. Stopping
   *    to explain a term a coach uses forty times a day is the fastest way to
   *    sound like someone who has never been on a court.
   *
   * 2. ELABORATE, DO NOT RESTATE. The first version of these cards said the
   *    same sentence as the plain card with tennis nouns in it: "you do not
   *    tell a player to play better, you call the pattern — four pieces of
   *    information and he knows what to do." Which is true, and teaches
   *    nothing, because it never says WHY the four pieces of information
   *    change anything. The answer is that a player told to play better still
   *    has to choose, while the ball is in the air, out of everything he can
   *    do; so he reaches for his habit. Called in advance, the choice is
   *    already made and his attention goes to the execution instead. THAT is
   *    the thing worth writing down, and it is also exactly what a role line
   *    does to a model. Each card below has to earn its place by explaining a
   *    mechanism, not by renaming one.
   *
   * 3. DO NOT FORCE IT. A chisel is for the places that need a chisel. Four of
   *    the twelve cards have no honest court mapping at all — which button to
   *    press, why a long paste becomes a file, what leaves your browser,
   *    whether Lantern ever sends anything — and every attempt to give them
   *    one produced either decoration ("nothing you shout over the fence stays
   *    on the court") or, in the case of the attachment card, advice that
   *    contradicted the plain card it was supposed to be a second telling of.
   *    Those four are not here. Tennis mode falls back to the plain card for
   *    any id this array does not carry, so leaving them out is the feature,
   *    not a gap.
   *
   * 4. NEITHER LANGUAGE IS A TRANSLATION OF THE OTHER. The German is written
   *    as German, with the loanwords German tennis actually uses, and several
   *    cards make the point with a different image where that reads better.
   *
   * Ids match `explainer`. `more` entries carry ids too, so that a reader who
   * has one open and flips to the other telling lands on the same question
   * rather than on whatever happens to sit at that index.
   * --------------------------------------------------------------------- */
  modelTips: {
    de: [],
    en: []
  }
};
