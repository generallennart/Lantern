# Lantern — prompt helper for ChatGPT, Claude and Gemini

A Chrome extension that sits on chatgpt.com, claude.ai and gemini.google.com. The user writes what they want in
plain words; Lantern reads what they wrote, turns it into a structured prompt,
shows what is still missing, and helps them push back on the answer.

**v1.0.1.** For installation see `INSTALL.txt` — written for someone who has
never installed an unpacked extension. This file is the developer's view.

**Licence: MIT** (`LICENSE`). Anyone may use it — at work, commercially,
indefinitely — copy it, change it and pass it on, keeping the copyright notice.
No warranty. `LICENSE` is shipped inside the package, not only in the
repository, because a zip handed over by email has no listing to read it from.

Lantern is an independent tool. It is not part of OpenAI, Anthropic or Google
and is neither run nor endorsed by them. ChatGPT, Claude and Gemini are their
trademarks, named here only to say what Lantern works with. The extension says
the same at the bottom of its own "How this works" panel, which is the version a
user will actually read.

*It was called Klartext until September 2026. The rename reached the storage
keys too, and `store.js` adopts anything left under the old names on first load —
see* Storage *below.*

## The loop it supports

1. **Write** what you want, however you like.
2. Lantern **reads your sentence** — length, audience, tone, dates, figures,
   whether you pasted material, whether you already wrote a prompt — and says
   what it found. What it found, it stops asking for.
3. **Build prompt** (free, local) or **Sharpen with ChatGPT** (one message).
  Sharpen puts its request into the current chat, ready for the user to send;
  it does not open a new tab or send anything itself.
4. If sharpening: after the user sends that request, Lantern **hands the
  code-block prompt back into its panel**. No hunting through the answer.
4.5. **Clear all** starts a genuinely new request: it removes the current text,
  Details, toggles, chosen model, collected parts, and result while leaving
  language, appearance, and history alone.
5. If ChatGPT asks clarifying questions, the **question helper** gives you a
   field per question and turns your answers into one numbered message.
6. When the answer arrives, choose a matching **Follow up**, or use **Go to
  chat input** to type a custom correction directly in the assistant's real
  composer. Lantern does not relay custom text through a second input; repeating
  task context remains a separate, explicit action.
7. If the answer refers to things you never said, Lantern **warns that saved
   memory is probably talking** and offers to probe or override it.
8. When the chat gets long, **move it** into a fresh one without losing the
   thread.

While the panel is open, all of this also reaches into the page itself: room is
made instead of content covered, the composer is lit up and labelled, and a bar
under the last answer shows what Lantern reads in it plus the follow-ups that
fit. See *In-page layer*.

## When Lantern Does Less

Lantern does not assume every request needs a prompt. Before building, it can
say that a clear request should stay as written, that a provider capability such
as web search is the useful part, or that a summary/review/code fix needs the
missing source text first. It also leaves strict output contracts such as
"valid JSON only" intact rather than add a competing default format. A user can
still expand an ordinary judgement call, but Lantern does not pretend to perform
real-world actions or to work from material it has not received. `TESTING.md`
is the practical tester guide; maintainer release steps are in
`VEROEFFENTLICHEN.txt` in the repository root.

There is also a narrow middle path: for a long source-processing request whose
short task comes before its source, Lantern can move the source first and the
unchanged task after it. It adds no role, format, quality bar, or other
instruction. This runs only for Claude and Gemini, where their published prompt
order supports it; ChatGPT keeps its existing order until equivalent evidence is
available.

## The handle

The panel is opened by a tab on the right edge of the window, not a button
floating over the page. The first version was a pill at `right: 20px; bottom:
116px`, which on a chat site is a permanent object sitting on top of the
composer and the last answer — the single most common complaint about it.

Three states, one element:

- **At rest** it is 18 pixels of window edge: the mark, a hairline of accent,
  and nothing else. Wide enough to be recognisable, narrow enough to read as
  part of the window frame.
- **On hover** it slides out to 46 and shows the name vertically, so what it is
  becomes obvious before anyone commits to clicking it.
- **Open**, it leaves the edge and attaches to the panel's left side like the
  tab on a folder, still clickable — pressing it again puts everything back.
  The chevron turns to face the edge, because that is now where clicking sends
  it.

It is positioned by its **right** edge, not its left. The obvious version —
`left = panel.left - fab.offsetWidth` — reads the handle's own width at exactly
the moment that width is animating from 18 to 26, so it landed eight pixels
under the panel with the name clipped. Anchoring the right edge to the panel's
left edge needs no width at all and is correct before, during and after the
transition. `placeFab()` runs from `applyBox`, so dragging or resizing the panel
takes the handle with it; five checks cover that, two of which fail if
`placeFab` is stubbed out.

The badge follows the same logic. It used to hang off the corner of a floating
pill; the tab clips its own overflow, so it lives inside — a dot at rest,
growing into the count once there is room for a number. A dot still answers the
only question that matters while the panel is shut: is there something here.

**Resizing is from any of the four corners.** It was one — bottom-left, on the
reasoning that bottom-right would sit off-screen at the default right-anchored
position. That reasoning was about the *default* position and stopped being true
the moment anyone moved the panel, which is the first thing people do. The two
corners that grow upward matter more than they look: with only a bottom grip, a
panel sitting near the bottom of the screen could be made shorter but never
taller, because its bottom edge was already against the clamp. Each corner
leaves the two edges it does not touch exactly where they were, which is what
the tests check — a grip that resizes *and* shunts the panel sideways is not a
corner grip. The top two sit above the header and are siblings of it rather than
children, so a pointerdown on one never reaches the header's move handler.

## A new-chat handoff arrives open, holding the prompt

Pressing "start in a new chat" or launching a handover opens a tab, and that tab
is the second half of one deliberate action. It used to arrive with Lantern
folded away to the edge, so finishing the thing you had already started meant
finding and clicking the handle again.

New-chat handoffs use `#ln=open`, and the new tab opens the panel itself. It
also **carries the text**, in `lnCarry`, under a five-minute freshness window.
That is not a nicety: Lantern deliberately never puts a prompt in a provider
URL, because an undocumented prefill parameter must not be able to send a
message without the person pressing Send. Sharpen stays in the current chat and
inserts its request into the composer for the user to send.

The same round fixed a plain multi-provider bug that had been sitting in
`openChat` since there was only one provider: the URL was hardcoded to
chatgpt.com, so "start in a new chat" on claude.ai threw the user out of Claude
and into ChatGPT. Each provider now builds its own new-chat URL. Lantern never
puts prompt text in that URL: provider prefill parameters are undocumented, so
the carried copy stays in Lantern until the person explicitly inserts it.

## Explaining it in tennis

The explainer has a third switch beside DE/EN: **“Explain it to me using
tennis” / „Erklär es mir mit Tennis“**. It is a register switch, not a language
one — it works in both — and it swaps eleven of the thirteen cards for a second
telling set on a tennis court.

This is not decoration. A good share of the people this was handed to coach or
play professionally, and for them that vocabulary is not a metaphor, it is how
they already reason. Four rules govern the writing, and the third is the one
that was got wrong first.

1. **The court is the worked example, not a badge.** This rule replaced its own
   first version at 1.0, and the correction is the useful part. The original
   read *"use the vocabulary, do not teach it"* — do not stop to define slice
   or Splitstep for people who use those words forty times a day. True, and it
   quietly licensed insider shorthand that carried no meaning: a card that
   said *"30-40: drop shot, why not"* was signalling familiarity, not
   explaining anything. As the reader put it: *"'30:40 warum nicht' serves no
   purpose."*

   What the mode is actually for is one long analogy that puts an abstract
   claim in a place people can picture. So the test is now whether **somebody
   who has never played gains from it.** A scene where a coach shows a player a
   video and gives the note afterwards explains recency to anyone alive. A
   scoreline explains nothing to anyone who does not already know. The
   vocabulary rule survives inside this one — no stopping to define a
   backhand — but it is no longer the point.
2. **Elaborate, do not restate.** The first version said the plain card's
   sentence with tennis nouns in it: *you do not tell a player to play better,
   you call the pattern — four pieces of information and he knows what to do.*
   True, and it teaches nothing, because it never says why the four pieces of
   information change anything. The answer is that a player told to play better
   still has to choose, while the ball is in the air, out of everything he can
   do, so he reaches for his habit; called in advance, the choice is already
   made and his attention goes into the execution instead. That is the thing
   worth writing down, and it is also exactly what a role line does to a model.
   Enforced as far as it can be mechanically: a tennis card must run at least
   1.35× the length of the plain one and carry more than one paragraph, because
   a restatement comes out the same length and an explanation costs paragraphs.
   The current set runs 1.44× to 2.61×.
3. **Do not force it.** A chisel is for the places that need a chisel. Four
   cards have no honest court mapping — which button to press, why a long paste
   becomes a file, what leaves your browser, whether Lantern ever sends
   anything — and forcing one produced either decoration (*nothing you shout
   over the fence stays on the court*) or, on the attachment card, advice that
   **contradicted the plain card it was a second telling of**: cut the passage
   out and send that, where the plain card says one attachment beats five
   messages. Those four are gone. Tennis mode falls back to the plain card for
   any missing id, so leaving them out is the feature.
4. **Neither language is a translation of the other**, and the German uses the
   loanwords German tennis actually uses rather than invented native
   equivalents.

`explainerTennis` is a parallel array keyed by the same ids, including ids on
the folded sub-questions — the panel keeps open cards open across the switch,
keyed by id, so without them a reader with one open would be silently moved to
whatever sat at that index. The card's own question is identical in both
tellings for the same reason; only the answer changes. Sixteen checks cover
it, including the coverage set (so neither adding nor dropping a card happens
quietly), the elaboration floor, one that asserts each card is *actually*
written in tennis, and one that asserts none of it names a model, a version or
a year — because nothing here is going to be updated.

## Two things the panel had decided about somebody's eyes

The first person outside this project to use it asked for two things, and they
are the same shape of complaint: *"the text is to small and i want to be able to
adjust it"* and *"i would like to be able to change the colorscheme from green
to other colors."*

**Text size** is five steps, 14 to 22px, in the panel's **Settings** tab and
the popup. **Normal** is the 16px default, so a smaller setting is available
without making the default the smallest option. Every type size in `panel.css`
is a multiple of a single variable — `font-size: calc(var(--ln-fs) * 0.82)` and
so on — so one number moves the whole panel. Boxes and padding deliberately do
**not** scale: the panel has a fixed width and growing the padding with the text
would eat the line length it is there to protect.

**Colour** is five accents, and each one is a full light/dark *pair*, because a
colour that reads on white is usually unreadable on `#202123`. Every one was
measured before it was offered, and the UI suite walks the entire shadow root
against WCAG AA for **all five in both themes** — ten combinations, every
visible text node. The user picks this one, so there is no review step between
the choice and somebody who cannot read their own panel. `slate` exists because
not everybody wants a coloured tool sitting on top of their work.

The bug this surfaced: the **in-page layer** lives in the host page, not the
shadow root, so it cannot inherit any of it. It read `--ln-accent` off the
document — and nothing had ever set that, so it was permanently green whatever
the panel wore. The values are now copied *off* the panel rather than kept in a
second table, because a second table is a second place to be wrong and the
failure is silent.

## "Not sure if it actually adjusts anything"

The other half of the same feedback, and the harder half: *"not sure if it
actually correctly adjusts prompts from the different claude or chatgpt
models"* and *"not sure if the feature about it recommending when to reopen a
chat works perfectly."*

Both doubts were reasonable and **neither was answerable**, which is the real
defect. The provider adaptations are the whole argument for `providers.js` and
every one of them was invisible. A feature nobody can see is a feature nobody
can trust — or debug.

`buildPrompt` now returns `adapted`: a list of what it decided and why. The
panel prints it under the two buttons, and on Claude it reads *"dein Material
nach oben, die Aufgabe darunter · Abschnitte in spitzen Klammern statt
Überschriften · höchstens 5 Qualitätsvorgaben"* — with the `<role>` tags
visible in the prompt directly below it, so the claim is checkable against the
output on the same screen. The self-check carries the list too.

Writing it down found the second bug. The **drift notice** — the one that
recommends starting a fresh chat — escalated to its strong form only after
three of *Lantern's own* follow-up buttons had been pressed. Anybody who types
their own follow-ups, which is most people, never moved that counter, so a
sixty-message chat sat on the soft notice forever and the move-chat nudge never
appeared. There is a second way in now: length alone, at 40 messages.

## The card that was missing

Every card in the explainer answered a question about getting a better answer
out of the thing. Nobody had answered what the thing is. For a reader who has
never been told, the rest is a set of tricks with no reason underneath, and
tricks with no reason are the ones that get forgotten.

So the explainer now opens with **“What even is this thing?”**, written for
somebody in their fifties who works with contracts and has never been walked
through any of it. It is one idea: *it continues text, it does not look things
up.* Everything else in the panel follows from that sentence — why a role line
works, why the tone tells you nothing, why numbers are the part that is wrong.

**Folded three levels deep**, because that is how the questions actually
arrive. "Is it not just a better search engine?" opens onto "but it shows me
links sometimes?" — and each of those is only asked once the one before it has
been answered. Six second-level questions and five third-level ones hang off
that card alone; nineteen and six across the panel. Rendering them as separate
cards would put all of them in front of somebody who has asked none of them
yet, which is how an explainer becomes a wall. `renderMore` is recursive, keyed
by the whole path so a reader three deep stays three deep across a language or
register switch, and capped at three levels — with a test, because the cap is
silent and a fourth level would simply not appear.

## The explainer can leave the code and come back

The explainer is the only part of Lantern that is pure writing. It is the part
somebody who does not program can improve, and it lives inside a 250 KB
JavaScript file behind escaped newlines and typographic quotes. Nobody is going
to edit it there, and nobody should have to.

The explainer source is in `src/rules.js` in this package. No separate export
or import tool is shipped here, so changes should be reviewed directly alongside
the matching English, German, plain, and tennis entries.

Three checks cover it, and the load-bearing one is that **an export followed by
an import must change nothing**. It did not, the first time: the block
terminator did not recognise a five-hash heading, so seven answers silently
absorbed the heading of the level below them.

## Which assistant for what

A view inside the help panel, reachable from one link and closed by default: it
is a thing you look up once, not a thing you need in front of you while you
write. A fifth tab for it would cost every user attention every session to
answer a question most of them ask once.

The hardest part of the project to write honestly, because it is the part that
cannot be kept current. There is no free, key-less, CORS-open source that ranks
assistants by capability — the good benchmark data sits behind an API key whose
own terms say not to put it in a browser, and the open alternatives carry
specifications rather than judgements. So it is written by hand, and it says so
in its first line.

Which forces a discipline: only claims that will still be roughly true in a
year. Things a vendor states about its own product's design; which ecosystem
each one reaches into; and what each one flatly cannot do — the most useful line
in any comparison is the one that saves somebody an hour of trying. Each
assistant is a link to its own front door, `target="_blank"` with `noopener`;
they are the only outbound links anywhere in the extension.

Deliberately absent: any ranking of factual reliability. That ordering inverted
inside ten months (see *Reading the failure*), so a hand-written file naming a
winner would be wrong faster than it could be read. The closing line says the
true thing instead — all three invent answers on hard questions, which one
invents least has changed twice in a year, and anything you cannot afford to
have wrong you check regardless.

## In-page layer

`src/inpage.js`, active only while the panel is open, off entirely via the
popup. Two rules govern it, because it writes into ChatGPT's own DOM:

1. **Additive only.** Nothing existing is moved, restyled or removed except a
   padding that is recorded and put back.
2. **Every change is undone by `disable()`.** If ChatGPT redesigns and a
   selector misses, the feature quietly does nothing — it never breaks the page
   it failed to find.

What it does: while the panel is against the right edge, pads `document.body`
and every pinned ancestor of the composer or the last answer that actually
reaches under the panel, so it makes room rather than covering things; rings the composer and labels
it, so where prompts land is obvious; marks the last answer and attaches a bar
carrying what Lantern reads in it ("lang · weicht aus · keine Quellen") and the
two or three follow-ups that fit. If ChatGPT asked clarifying questions, that bar
carries one button instead — answering them outranks everything else on offer.

## Moving a chat

Long chats get slow and lose the thread, so people start a new one and silently
lose every fact, decision and dead end they had established. Three steps in the
**Umziehen / Move chat** tab:

1. **Ask for a handover** — inserts a prompt into the current chat requesting
  a goal, exact binding facts, optional decisions and dead ends, optional style,
  and one combined next-step/open-questions section as one code block. Each
  detail belongs under one heading only. It forbids inventing and requires
  "unknown" for gaps.
2. **Collect it** — lifts the code block into the panel, where it can still be
   edited.
3. **Start the new chat** — opens a real (not temporary) chat and puts the
  handover *plus Lantern's own framing* into its composer. It never sends it;
  the user checks it and presses send. The handover outranks saved memory, the
  new chat does not repeat it, and it asks one short question only when an
  essential detail is incomplete or contradictory. If a provider has not made
  its composer available within three seconds, Lantern falls back to its visible
  manual Insert control.

The panel also says how many messages the chat has and flags when it is time.

## Reading the failure, not the shape

Until 0.17.0 the answer analysis produced *properties of the text* — long,
short, hedging, has a list, no sources — and the follow-ups were scoped to
providers by hand. Both halves were wrong in the same way: the properties are
not the failures, and hiding a card from a provider is a worse instrument than
ranking it lower.

**What is detected now.** Each of these is a named failure mode taken from
something a vendor published about its own model, or a measurement someone
published about all of them. The sources sit beside the phrase lists in
`rules.js`, where they can be checked and, when they stop being true, replaced.

| Signal | What it is | Where it comes from |
|---|---|---|
| `sycophancy` | The reply opens by agreeing with you rather than answering | The canonical example is on Anthropic's own issue tracker; OpenAI's prompting guide tells developers to suppress "stock acknowledgments" |
| `abstained` | It will not land on an answer | Anthropic's Sonnet 5 card: accuracy on *disambiguated* questions fell to 72.4% from 88.1%, almost entirely from picking "cannot be determined" anyway |
| `moralizing` | It warns instead of answering | "Wet blanket" is Anthropic's own term, and its card reports the behaviour increased |
| `certain` | Factual claims, no hedge anywhere, nothing cited | The best-evidenced difference between vendors: on the one benchmark that rewards abstention, hallucination rates differ by tens of points |
| `truncated` | It stopped mid-sentence | Gemini users report answers cut off while the API reports normal completion — so the shape of the text is the only signal there is |
| `bulletHeavy` | A wall of bullets instead of prose | Anthropic publishes a verbatim block against it; OpenAI's release notes name "bullet-heavy responses" as something it reduced |
| `preamble` | A run-up before the content starts | OpenAI's 2026 release notes name reducing "teaser-style phrasing" |

**Detection is the same everywhere; only the weight differs.** One set of
thresholds to get right instead of three, and a signal does not vanish when a
vendor's reputation changes. `answerRules` in `rules.js` holds the per-assistant
weights with the reason for each number written beside it. A weight of `0` is a
real answer — Gemini scores `short` at zero, because Google documents the model
as terse by design and telling it to expand is the opposite advice from the one
Anthropic gives — and the lookup distinguishes zero from absent, which
`weights[x] || 2` did not.

**Two signals outrank the scoreboard.** A suspected memory leak and a truncated
answer sort to the front rather than competing on points, because every other
complaint about the answer is downstream of them. Adding a big number would not
do: scores are sums of matched signals and therefore unbounded, so any number
chosen could be outvoted by a card matching three ordinary things at once. That
is exactly how a memory warning ended up second.

### The wording of the pushback is the feature

The "do not just agree" card used to open **"I disagree."** That is a
first-person statement of conviction, and the UK AI Safety Institute published a
study in April 2026, across three models from two vendors, finding that:
questions produced near-zero sycophancy while non-questions produced a
24-percentage-point gap; convictions were the worst framing of all; first-person
produced more than third-person; and reframing the input as a question beat
telling the model not to be sycophantic.

So the card opened with the single most sycophancy-inducing move available and
then asked the model not to be sycophantic. It was causing the failure it
existed to prevent. Every follow-up that takes a position on the substance is
now interrogative and third-person, and none of them contains a feeling — a
second study, from September 2026, found emotional appeals the tactic most
associated with inducing the collapse.

The same finding is in the explainer, because it is the most useful thing a
beginner can be told and nobody arrives at it alone: *ask, do not assert; talk
about the answer, not about yourself; leave feelings out.*

## Memory drift

Half the feature, and the half that needs no fragile markup. `rules.memoryEchoes`
lists phrases where the assistant claims knowledge of the user — "wie du
erwähnt", "as you mentioned", "since you're a". On their own these are innocent:
"given your budget of 900 euro" is fine when the user said 900 euro. What makes
them suspicious is **when** they appear, so the phrase list is only half the
test and the turn count is the other half: a claim of prior knowledge in a chat
where the user has said at most two things is not context, it is memory.

The panel says so in as many words, quotes the phrases it found as evidence, and
lets the ranked follow-ups carry the actions — `signalWeights` gives the memory
signal 5 against a default of 2, because if the answer is contaminated then every
other complaint about it is downstream. A `Gedächtnis ignorieren` toggle adds the
same override to any built prompt, and the handover launch prompt already tells a
fresh chat that the handover outranks its memory.

It is framed to the user as a suspicion, never a finding.

Not yet built: reading the memory list itself out of Settings → Personalization →
Manage memories. That is the fragile half and it is deliberately last.

## Three assistants, and where they disagree

`src/providers.js` holds what is true about each one. The reason it exists is
that advice which is correct on one is **actively wrong** on another, so a
model-blind prompt improver makes output worse on two of the three:

| | ChatGPT | Claude | Gemini |
|---|---|---|
| long material | instruction first | **before** the task | **before** the task |
| wrapping | headings | XML tags | headings (never mixed) |
| a role line | fine | one sentence | **left out** |
| "be concise" | fine | **Opus yes, Fable no** | redundant |
| "show your work" | fine | **never** | fine |
| negatives | in requirements | in requirements | **last line** |

Sources for each: Anthropic measured queries-at-the-end as worth *"up to 30
percent"* on multi-document inputs and recommends XML by name; Google says the
same about placement in its own words, says to pick XML *or* Markdown and never
mix, and warns that Gemini *"will sometimes ignore instructions in order to
maintain adherence to the described persona"* — so a persona there can eat the
user's own formatting instructions. Anthropic's per-model pages say Opus 5 runs
long and should be asked for brevity while Fable 5.1 already formats sparsely
and gets worse when asked, and that Sonnet 5 *"does not silently generalize an
instruction from one item to another"*.

The expensive one: on Claude Fable 5, asking the model to show its reasoning
trips a documented `reasoning_extraction` refusal and causes a **silent fallback
to a weaker model**. The user gets a worse answer and is never told why. Nothing
in Lantern generates such a line, and a filter keeps it that way if a hosted
rules file ever adds one.

Section order and wrapping are data, not code: `buildPrompt` collects named
blocks and `assemble()` lays them out in the provider's order. ChatGPT's output
is byte-identical to what it was, because no equivalent measurement exists for
it and changing it on someone else's evidence would be guessing.

**Model detection is structural, not string-based.** Learned the hard way from
three self-check reports off real accounts: ChatGPT's switcher is labelled with
the *verb* "Switch model" and does not contain the model name at all; the
tester's interface was in German, where Gemini's picker says "Modusauswahl"; and
an early version detected `"Pro"` off a subscription button, which mapped to the
deep tier and quietly degraded every prompt. So: named picker first, then the
text *beside* a verb-labelled picker, then a chip whose label starts with a model
name — never a free sweep of the page. **An unrecognised model costs nothing
(balanced is the right default when you know nothing); a confidently wrong one
costs every prompt.**

## Adapting to the model in use

ChatGPT's picker may show Astra, Sol, Terra, or Luna. Lantern displays the
detected name, but uses neutral prompt framing for all ChatGPT models until a
reproducible, tester-verified prompt difference is known. These names are not a
speed, price, or quality ranking.

| profile | ChatGPT names | automatic prompt change |
|---|---|---|---|
| neutral | Astra, Sol, Terra, Luna | balanced framing |

Two pieces of evidence drive this. OpenAI's GPT-5.6 prompting guidance measured
**leaner prompts scoring 10–15% better on 41–66% fewer tokens**, and warns that
verbose scaffolding and blanket absolutes now create noise. And independent
write-ups report that explicit chain-of-thought prompting **reduced
instruction-following accuracy across 15 models**, and that personas help a
model adopt a *voice* but constrain its *reasoning*.

So: the persona survives for writing, editing and translating, where voice is
the point, and is dropped for calculation, analysis and planning on a model that
does its own thinking. Detection is defensive — an unrecognised model just means
the balanced prompt, which is the right default anyway — and the user can
overrule it in Details.

The model name is therefore informative rather than prescriptive. Lantern does
not claim that one of these ChatGPT models is the cheap, fast, weak, or best
choice.

## What else the assistant can do, and who presses the button

All three can do things a plain chat message does not get you, and almost nobody
this tool is for knows those things exist — let alone where the control is. So
there is a row of chips under the box: search the web, an editable document,
research it properly, make a picture, work it out with code.

They do not work the same way, and the differences are the whole reason there is
a table in `rules.js` rather than one sentence. **Claude's artifacts appear by
themselves**, and the only thing that stops them is a setting in Capabilities
the user has probably never opened. **Gemini's Canvas cannot be asked for at
all** — it is a button under the text box, and nothing written in the message
will summon it, so Lantern does not write a line that cannot be obeyed.
**ChatGPT's deep research is metered by the month** and Gemini's by the day.

That last one settles what Lantern is allowed to do here, and the answer is:
word the request, say where the control is, ring it in the page if it can be
found by what it says — and then the person presses it. Not Lantern. Switching
on a metered capability for somebody spends something of theirs without their
seeing it happen; a wrong match would be clicking an unknown control in a
stranger's account; and the person who pressed the button once knows where it is
next time, which is the entire point of the tool.

The ring is found by text, not by selector: a class name is the first thing a
redesign changes and the label is the last. Finding nothing is a normal outcome,
because the panel says where to look in words either way.

A capability the assistant does not have stays visible and struck through.
"Claude erzeugt keine Bilder" is one of the more useful things a beginner can
learn here, and it can only be learned from something they can see.

## One thing at a time

The first outside verdict on the panel itself was *„Es war sehr
unverständlich"*, and the panel deserved it: it opened with a text box, a row of
goal chips, two equally weighted buttons and a fold — and asked a beginner to
classify their own question before they had typed it.

Now it opens with a box and one button. What Lantern understood appears *after*
there is something to understand, under a heading that asks to be corrected
rather than configured, and correcting it rebuilds the prompt instead of
silently changing a setting. The second path — having the assistant write the
prompt — is a link rather than half of a fork, because a beginner cannot choose
between two things they have not seen the output of, and being asked to was the
first thing that made the panel incomprehensible.

## Knowing when not to help

The first time Lantern was measured against the thing it replaces, on a real
request, it lost.

> ich möchte ein ärtzliches artest aber es ist zu spät und die haben zu

Raw, ChatGPT named the 116117 Bereitschaftsdienst, the Bereitschaftspraxis, a
video consultation and a word with the school. Through Lantern it said it
depends, mentioned the Bereitschaftsdienst once inside a hedge, and asked what
the certificate was for. Every line Lantern had added made it worse: the
lead-in stripper had eaten the sentence's only verb, "die Antwort zuerst in ein
bis zwei Sätzen" was read as a length limit and suppressed the list, "bleib bei
dem, worum ich gebeten habe" forbade volunteering the other routes, and "was das
Ergebnis noch besser machen würde" restated the question the model had just
asked.

All four are fixed. But the lesson is not those four lines — it is that the
archetype had come out as `general`. That is the fallback: Lantern had not
recognised what kind of request this was, and then said how the answer should
look anyway. **A guess about shape, on somebody's real problem, costs them the
answer.**

So the rule the rest of this project runs on now applies to the project itself:
*an unrecognised request costs nothing, a confidently wrong one costs
everything.* When Lantern cannot say what kind of request it is looking at, it
does not get to say how the answer should look. It hands the message back
**byte-identical**, says which kind of request this is and why it would make it
worse, and names the one capability that would actually help — here a web
search, because the useful answer depends on what is open right now, and offers
it as one click rather than as advice.

Two escapes, because a classifier is not a person: a long request (25 words or
more) is not a throwaway even when unrecognised, and anything the extractor read
out of the user's own sentence — a register, figures, numbered questions, a
link, "mehr kommt noch" — means Lantern is carrying rather than guessing. The
override under the result is still there either way.

The local engine regressions cover representative beginner requests and the
edge cases described here. They can prove that the deterministic engine keeps
the user's explicit details and does not crash; whether a prompt is *better*
than a raw request still needs the A/B test in `OFFENE-FRAGEN.txt`.

## What the prompt rules actually rest on

A tester said *„LLM's funktionieren am besten ohne fluff, mit direkter
anweisung"*. That is not a matter of taste, and the honest response to it was
not to argue but to go and look. The inventory is in
`claude/what-we-actually-know.md`: every rule Lantern applies, sorted into
measured, vendor-claimed, reasoned and guessed. Some of it does not survive
contact with the evidence, and the version that ships after it is smaller.

Two findings changed the code rather than the documentation.

**Instructions are not free, and the bill is measurable.** Follow rates fall
from about 96% with a single instruction to 60% on Claude Sonnet, 43% on Gemini
and 20% on GPT-5-mini once twenty are stacked, and the curve is sigmoid — it
gives way suddenly (arXiv:2608.02639). Lantern's old full frame carried
eighteen. So there is now an instruction budget, the generic lines are what gets
spent when it binds, nothing the user typed or switched on is ever cut, and the
panel prints the number so the cost is visible instead of asserted.

The same work found that about 12% of instruction pairs that are satisfiable on
paper conflict in practice. Lantern shipped one for its whole life: the artifact
goal says deliver the finished thing with **no closing remarks**, and the
`improve` toggle — on by default — then asked for a closing section. Both lines
were in every prompt the testers saw. There is now a conflict lint that sweeps
every archetype × goal × language × toggle combination.

**A persona costs accuracy on knowledge work.** MMLU drops from 71.6% with no
persona to 68.0% with a minimal one and 66.3% with a long one; across 1,140
questions and 38 expert roles the aggregate score with a general expert persona
came out slightly *below* baseline, buying depth and losing clarity
(arXiv:2605.29420). It helps on writing, style and extraction. Lantern used to
drop the role only on a reasoning *model* doing reasoning-shaped work — half
right, because the cost tracks the task rather than the model. The role now
survives only where the voice is the product.

None of that answers the question that matters: does a Lantern prompt beat the
raw request on a real task? That needs an experiment, and the protocol for one
that costs nothing and touches nobody's terms of service is written down in the
same file and in the testers' own question sheet.

## What the 2026 guidance changed in the prompts themselves

- **The "show your approach first" toggle is gone.** It was chain-of-thought
  prompting in a checkbox, and the measurement says it hurts.
- **"Do not restate my request, no long preamble" is gone.** That is a
  behavioural prohibition aimed at a weakness these models no longer have.
- **A scope boundary took its place**, because the 2026 failure mode is the
  opposite of the 2024 one: over-eagerness and scope creep, not laziness. Every
  prompt now ends the quality bar with *stay within what I asked for; if further
  work seems worthwhile, suggest it rather than doing it unasked.*
- **The quality bar is de-duplicated and capped**, so a cap never drops a real
  constraint to keep a repeat of one.
- Hard constraints, required evidence, and examples showing *output shape* all
  stay — the guidance is explicit that those still work.

## Two paths, and the algorithm that chooses

**Build prompt** — free, instant, offline. Detects language, kind of task and
goal; extracts what the sentence already contains; judges how under-specified
the request is; assembles role, task, goal directive, context, worked example,
requirements, output format and quality bar. If still vague it makes ChatGPT ask
up to four questions first; if specific it tells ChatGPT to assume and declare.

**Sharpen with ChatGPT** — costs one message only when the user sends it.
Wraps the request in a preservation-focused meta-prompt and places it in the
current chat's composer. It never opens a tab or sends a message itself; after
the user sends it, Lantern captures the returned code-block prompt into the
panel.

**The router** (`engine.js` → `route()`) — no model call, no randomness. A
template can compose but cannot *take a request apart*, so the score rises with
everything that needs taking apart and falls when the user already did the work.

| signal | points |
|---|---|
| three or more tasks in one request / two | +3 / +1 |
| over 80 / 40 / 25 words | +3 / +2 / +1 |
| pasted material to work on | +3 |
| many specialist terms (≥3) / some | +3 / +1 |
| the text is already a prompt | +3 |
| conditionals ("falls", "otherwise") | +2 |
| kind of task unrecognisable / ambiguous / weak | +2 / +2 / +1 |
| each detail supplied — typed in a field *or written in the sentence* | −1 each, max −3 |
| short, single, clearly-typed request | −2 |

Threshold 4. **Advisory** — both buttons always work, and the two strongest
reasons are shown in plain language so the user learns where the line is.

## Three axes

- **Archetype** (kind of task): write, **edit**, analyse, code, learn, plan,
  decide, summarize, data, image, translate, recall, calculate, **find**,
  general → role,
  requirements, guards. Archetypes may also carry `strong` keywords, worth
  double: words that *name* the deliverable rather than describing it.
- **Goal** (what you want back): answer, artifact, guidance, feedback, ideas →
  directive, output format, *and which missing information counts as a gap*.
- **Extraction** (what the sentence already says): length, audience, tone,
  **register**, **ranking or explicitly-not-a-list**, **URLs**, **"more to
  come"**, figures, multiple questions, embedded material, already-a-prompt or
  a role the user set, retry.

"Write me a script" and "show me how to write a script" are the same archetype
and opposite goals. The goal also settles a contested archetype: only
`feedback → analyse` and `answer → learn`, because wanting instructions does
*not* imply a planning task — most "how do I…" questions are small how-tos and
the planner's machinery makes them worse.

## Why it is built this way

**Ban risk.** Only the page the user already has open, only on a click. No
OpenAI endpoint calls, no session token, no messages sent unprompted. Sharpen
is a user-initiated composer insertion, and the user still presses Send. Reading
the last reply is reading the page the user is looking at. The line not to cross
is automated hits on internal endpoints.

**Cost.** Local path free. Sharpen costs one message from the user's own quota,
only on that button. No API key.

**Staying current.** The weakness of a local engine, so:

- `src/engine.js` — *structure and arithmetic*. Detection, extraction, scoring,
  routing, answer analysis, assembly. Ages slowly.
- `src/rules.js` — *knowledge*. Templates, keywords, goals, extraction patterns,
  follow-ups, router weights, `modelTips`. This is what ages.
- `src/background.js` — the update channel. Point the **Rules file address**
  setting at a hosted `rules.json` and it is fetched on install, on browser
  start, and on demand. The hosted file must contain the rule records it wants
  to change; this package does not include a rules-file generator.

  A hosted file **overlays** the bundled rules; it does not replace them. That
  is not a nicety — ten fields in `rules.js` are functions (`clarify`, and four
  `extractLines` builders per language) and JSON cannot carry a function. Under
  the original wholesale-replacement semantics, the first realistic hosted file
  would have arrived missing them and the next prompt built would have thrown.
  The channel was a loaded gun pointed at the panel for six versions. The
  extension suite now fetches the *actual exported file* through the *actual
  channel* and then builds a prompt, because fetching it was never the test.
- The **sharpen** path never goes stale: a live model writes the prompt.

## Layout

```
manifest.json        MV3, scoped to ChatGPT, Claude, and Gemini
INSTALL.txt          end-user install guide (German + English)
src/store.js         storage schema, migration, validation, reset
src/rules.js         templates, keywords, goals, extraction, follow-ups, weights
src/i18n.js          interface strings (DE/EN), panel and popup
src/engine.js        detection, extraction, scoring, routing, answer analysis
src/content.js       the in-page panel (shadow DOM)
src/inpage.js        affordances inside the host page, fully reversible
src/panel.css        panel styles, light + dark
src/background.js    opens tabs, rules refresh, and public release checks
popup/               settings, self-test, activity view, rules URL, reset
test/manifest.test.js         manifest resources, permissions, and no auto-send
test/engine-core.test.js       deterministic engine behavior across providers
test/engine-matrix.test.js     exhaustive bundled provider/task/mode matrix
test/engine-rules-override.test.js  remote-rule and prompt-boundary safety
test/store.test.js             validation, migration, write and reset failures
test/content-*.test.js         panel state, handoffs, insertion, and live updates
test/explainer.test.js          deferred explainer data and initial-payload budget
test/browser.test.js            optional Playwright browser gate for fixture flows
test/i18n.test.js              English/German interface-string parity
test/inpage-ownership.test.js  reversible, additive host-page integration
test/popup-reset.test.js       popup settings and reset behavior
test/panel-preview.html        browser preview fixture for visual smoke checks
tools/usefulness-audit.js       non-asserting decision-distribution report
build.js                        explicit release staging list and hosted-rules export
```

Run `npm run audit:usefulness` to print the representative request corpus and
its abstention/build distribution. It is a diagnostic report, not part of the
assertion-only test suite.

## Storage: one schema, one migration, one reset, one rename

The rename is worth a paragraph of its own, because it is the kind of change
that loses data without breaking anything. Every storage key began `kt`; they
all begin `ln` now. A build that simply stopped asking for the old names would
come up perfectly and **empty** — the worst shape this loss could take, since
nothing looks wrong and the user has no way to tell it happened.

So `load()` asks for both sets of names. Anything found under an old one is
copied to the new one, the old one is deleted, and `info.adopted` says which. It
runs once, because after the copy there is nothing left to find. `reset()` clears
both sets too — a "reset everything" that leaves `kt` keys behind has not reset
everything, and they would be adopted straight back in on the next load.

It is deliberately **not** one of the numbered migrations: those run on a version
bump, and this has to run for anybody whose stamp already reads 1. Nine tests
cover it, including the case where both names exist (the current one wins) and
the case where there is nothing to adopt (it must not claim it adopted anything).

## Storage: one schema, one migration, one reset

Everything Lantern keeps is in `chrome.storage.local`, and until 0.10.0 that
was eight keys that accreted one per feature, each read with an ad-hoc guard at
the point of use. That works until a stored shape and the code reading it
disagree — and then the panel breaks for someone whose only recovery is
devtools, which for this audience means it is broken forever.

`src/store.js` now owns it, with two deliberately separate jobs:

- **`migrate()`** handles *known* changes between versions. Runs once, when the
  stamp is behind.
- **`validate()`** handles *corruption* — a wrong type, a truncated write, a
  hand-edited record, data from a newer build. Runs on every load, forever.

Validation strips what it cannot read rather than rejecting the record, so one
bad field costs that field and not the whole draft, and the repair is written
back — otherwise the same bad record is re-read and re-cleaned every load, and
still sits there waiting for a later build that reads it less carefully. A
**Reset everything** button in the popup clears exactly the keys Lantern owns
and nothing else.

Writing the schema down immediately found two live bugs. `save()` was writing
the *derived* tier while `restore()` read `modelChoice`, which nothing wrote —
so overruling the model by hand silently did not survive a reload. And
rebuilding the model dropdown on a language switch re-applied the old DOM value,
which on the pass that runs during `restore()` is the default, overwriting the
stored choice with the placeholder that preceded it.

## Accessibility

The audit came back better than expected: roles, labels and contrast were
already right in both themes, focus moves into the panel on open, Escape closes.
What was missing:

- The close button and the DE/EN buttons had **no accessible name** — an SVG and
  two letters that mean nothing read aloud.
- **No headings at all**, so there was no way to move through the panel.
- The prompt appearing — the moment the whole tool exists for — was **silent**.
  The obvious fix is wrong: `aria-live` on the result box would read four
  hundred words of generated prompt aloud every time. A short sentence is
  announced instead ("Prompt ready, 412 words…") and the prompt stays a
  labelled field to navigate to and read at your own pace.
- On a narrow window the in-page layer's hardcoded **436px push was wider than
  the space available**, so the page gained a horizontal scrollbar. The inset is
  measured rather than assumed, and is skipped entirely when it would leave no
  readable column — Lantern making the page worse is the one thing that layer
  must never do. Since 1.2.0 it is also **directional**: room is made only while
  the panel occupies the right edge, and the amount is its footprint from that
  edge, not its width. Drag the panel inward and the page goes back to its full
  width, because padding one side of a page helps nobody when the thing being
  made room for is in the middle of it. The comparison uses
  `document.documentElement.clientWidth`, not `window.innerWidth`, which counts
  a scrollbar that `getBoundingClientRect` does not.
- `prefers-reduced-motion` is honoured, in CSS and in the `scrollIntoView` calls
  that a media query cannot reach.

Thirteen checks in `ui.test.js` hold it, including contrast measured on the text
actually painted, in both themes, at 200% zoom and at 380px.

## Collecting parts instead of splitting the message

"I'll explain more in the next message" was detected, and the built prompt told
ChatGPT to wait. That was half a feature — and arguably the wrong half.

Splitting is a workaround for a small text box, and it makes the answer worse:
the model starts reasoning about half a problem and commits to a reading before
the rest arrives. So Lantern offers to **collect** instead. Write a piece, save
it as a part, write the next; the built prompt carries them all as one numbered
`MY MATERIAL (IN PARTS)` section with a note saying nothing more is coming. It is
what an experienced user does by hand, which is the entire point of the tool.

Three details that matter:

- The collector is **sticky once offered**. The signal is in the first sentence,
  and the moment you start typing part one that sentence is gone — keyed to the
  current text, the collector would vanish exactly when it is needed.
- The **wait-for-me line is dropped** once parts are assembled. Keeping both
  would be contradictory instructions, and the model would sit waiting for a
  message that never comes.
- Collected parts **count as supplied context**. Being asked three clarifying
  questions immediately after pasting four paragraphs is the most annoying
  possible response.

Building it exposed two gaps in the detection itself: `ich schicke dir gleich
noch mehr` and `in der nächsten Nachricht` both missed. The replacement requires
a verb-then-adverb shape (`ich schicke dir gleich…`) rather than a loose
proximity match, because a false positive here is expensive — the prompt would
tell ChatGPT to wait forever.

## Release updates

The extension checks the public GitHub release metadata for
`generallennart/Lantern` at most once per day, unless the user disables it in
the popup. It stores only a check timestamp and version number. A badge and
popup notice appear only when a newer stable `vX.Y.Z` release exists.

The response is treated as untrusted data: Lantern accepts neither release
notes nor download URLs from it. It derives the only link it opens from the
validated tag, pins it to this repository, omits credentials, refuses redirects,
and caps the response size. It cannot update an unpacked extension itself;
`GIT-UPDATE-ANLEITUNG.html` explains the one-click Git helper and the ZIP
fallback in German and English.

`.github/workflows/release.yml` runs verification, usefulness audit, staging,
hashing, and GitHub Release creation when a maintainer pushes a `vX.Y.Z` tag.
`VEROEFFENTLICHEN.txt` is the short maintainer checklist.

## The rules update channel

`RULES_URL = null`: an update mechanism the README promised that had never once
run. It is now a setting with a **Check now** button, and thirteen checks against
a real server cover every branch — no URL, a bad URL, 404, not-JSON, valid JSON
that is not a rules file, oversized, a host that refuses the read, a dead host, a
good file, and an older file.

Two decisions worth naming:

- **No broad host permission for rules.** The fetch is an ordinary cross-origin request, so
  the file's host must send `Access-Control-Allow-Origin`. Whoever hosts the
  rules controls that header; anyone who does not control the host has no
  business being the source of truth for what this tells people. A reviewer
  reading "may read data on all sites" would be right to ask why, and now there
  is nothing to ask about. The test proves it by reaching the server through
  `localhost` — a hostname the test build has *not* been granted — so CORS
  genuinely applies.
- **One pinned release host.** The extension has the narrow host permission
  `https://api.github.com/*` only to read the public `releases/latest` metadata
  for `generallennart/Lantern`, once a day by default. It omits credentials,
  refuses redirects, caps the response, accepts only a newer `vX.Y.Z` tag, and
  derives the official release URL itself. It never displays release notes or
  executes anything fetched from GitHub.
- **Versions compare numerically.** Lexically `"99.0.10" < "99.0.9"`, and getting
  that backwards lets a stale CDN edge or a rolled-back server pin every user to
  old advice with no signal that anything is wrong.

Every failure has a name and the name is shown in plain words, not a code. It
also caught a race in the popup: it saved the address and fired the check without
waiting, so the check used the *previous* address — green some runs, red others.

## The activity view

The router's threshold of 4 is a judgement call, and so is every keyword list
behind it. Nothing measured whether those calls were right.

The popup now shows counters: prompts built, sharpened, inserted, how often the
recommendation was taken, how often the detected kind was corrected by hand, the
three most common archetypes, and a histogram of router scores **with the
threshold drawn on it**. That histogram is the instrument: if a user's requests
cluster at 3 and they keep pressing sharpen anyway, the line is in the wrong
place, and that is now something they can see and report rather than something
only I could guess at.

Counters only — not one word of what anyone wrote. The validator in `store.js`
enforces that shape independently, so a careless change in `content.js` cannot
start storing text, and a test asserts that no word of the request appears
anywhere in the stored object. It is shown to the person it is about, because a
statistic its subject cannot read is surveillance, not measurement.

## The self-test

Every selector in this extension is a guess about someone else's markup, and by
design a miss fails silently rather than breaking the page. That is right for
the page and useless for working out why nothing happened — so the popup has a
**self-test** that asks the content script what it can actually see: panel
loaded, input box found, messages readable (with a count), model recognised
(with the name), in-chat display active. Each line is a tick or a cross.

It is the difference between "Lantern is broken" and "Lantern is not on this
page", which is otherwise indistinguishable to a user, and it turns a bug report
from "it doesn't work" into six facts. If OpenAI changes their markup, this is
what says which selector went.

Two things testing it on real accounts changed.

**It went stale and looked current.** It rendered once, on the click, and then
sat there — so the ordinary sequence (open the panel in a fresh chat, run the
check, send a message, look back) showed the state of a chat that no longer
existed, and the only way to find out was to know to press the button again.
Reported as *"you have to manually reload it by clicking again, which is
annoying and misleading"*, and misleading is the operative word: a diagnostic
showing an old reading confidently is worse than one showing nothing. It now
re-reads on the panel's own beat and on its own two-second timer while it is on
screen, tears the timer down when the help panel or the panel closes, and says
in the panel that it keeps itself up to date. A second press puts it away.

**It called an empty chat broken.** Two red crosses against "messages readable"
and "last answer read" in a chat that had no messages in it yet — which is what
a new chat is, and is the state you are in when you go looking for a self-check
in the first place. Nothing is wrong there and nothing is being reported: there
is no answer to read. That is a third state and it now has its own mark (a grey
dot), its own words, and a line saying the two rows fill themselves in when the
first answer arrives. A cross has to mean *this should have worked and did not*,
or it means nothing — and it stays a cross when there ARE answers on the page
and none could be read, which is the selector failure the row exists for.

**And the model probe now says what it was looking for.** A real ChatGPT report
came back with `model: null` and a picker whose text was "Switch model", and
there it stopped: no way to tell whether the name was elsewhere on the page or
whether this build's list of names had gone stale, which happens roughly twice a
year per vendor. The report carries `modelLookedFor` and `modelArea` alongside
the failure now — behind the same privacy gate as everything else, which the
leak test checks explicitly.

## Tuning it

Nearly all behaviour is in `src/rules.js`:

- **Prompt quality** — archetypes carry `role`/`requirements`/`format`/`guards`/
  `asks`; goals carry a `directive` and optionally their own `format`. Format
  precedence: what the user typed → the goal's → the archetype's.
- **Extraction** — `extract.*` are regex *strings* (so a hosted JSON can replace
  them) plus `audienceNouns`, the whitelist that stops "für die Heizung" from
  becoming an audience. Precision beats recall: a wrong detection costs the user
  more than a missed one, because they must notice and undo it.
- **Follow-ups** — each carries `signals` (matched against the answer) and
  `goals` (matched against the request). Score = 2×signals + 1×goal.
- **Routing** — `router.weights`, `router.threshold`.
- **Ask-first** — `engine.js` → `assess()`, score ≥ 3. Which gaps count is set
  by `GAP_SENSITIVITY`, keyed on the goal.

Two rules when editing keyword lists:

1. Keywords match at **word start**, so `funktion` fires inside `funktioniert`.
2. Never add a word common in ordinary sentences (`oder`, `or`, `und`).

## What the real examples changed (0.6.0 and 0.7.0)

### Second round: ten more messages, plus the usage research

OpenAI's *How People Use ChatGPT* study names the shape of real demand:
**writing is 28.1% of all use, and two-thirds of it is modifying text the user
already has** — editing/critique (10.6%) outweighs writing from scratch (8.0%).
Practical guidance is 28.3%, seeking information 21.3%, mathematical calculation
3.0%.

Lantern had `analyze`, whose goal directive says *"assess my material rather
than rewriting it"* — exactly wrong for "fix my email", which is what most of
that traffic actually is. So **`edit`** exists now: keeps your voice, changes
nothing factual, delivers the reworked version first and a short list of what
it changed. That single gap was probably the largest in the tool.

The ten new messages added:

- **`find`** — "link the book … amazon". Its entire value is the guard: *do not
  invent links, prices, ISBNs or availability; if you cannot retrieve a page,
  say so and give me the search terms instead.* Models are confidently wrong
  here and a beginner cannot tell.
- **`recall` extended to sources** — "what book was that?" is the same act as
  "what was the word".
- **`calculate` broadened** — working days, unit conversion.
- **Register extraction** — "academic word to call a question that…". The user
  reported typing this by hand; that is exactly the trick the tool should apply
  for people who do not know it.
- **Ranking extraction, including its negative** — "pls rank them" becomes an
  ordered-list instruction; "keine Stichpunkte, im Fließtext" becomes the
  opposite one.
- **URL detection** — a pasted link now tells ChatGPT to say so if it cannot
  retrieve it rather than guessing what is on the page.
- **"I will continue explaining in the next message"** — tells ChatGPT to
  confirm and wait instead of answering half a question.
- **A role the user set themselves** — "as the character bee … you know a LOT
  about this topic" — is detected, so Lantern does not stack a second identity
  on top of theirs.

And one plain bug: **"Pedant what does that mean"** — four words — was met with
four clarifying questions. A short *question* is complete; the length floor now
only applies to short non-questions.

## What the real examples changed (0.6.0)

Seven messages real people sent, run through the engine before anything was
changed. **Five of eight fell through to the `general` archetype** — meaning the
built prompt added almost nothing — and extraction found exactly one thing across
all of them, because the patterns had been written for sentences I invented.

What that produced:

- Two of the seven were the same shape — *"what was the word, something like
  compatulate"*, *"wie heißt es wenn… irgendwas mit Mauern"* — so `recall` exists
  now, and its first guard is **do not invent a word**, which is the exact way
  that question gets answered wrongly. Ask-first is off for it: the vagueness is
  what they are asking about, and `irgendwas` no longer counts against them.
- One was a probability question, so `calculate` exists, and asks for assumptions,
  working, and a second independent check.
- Plain factual questions — *"How large is a face in proportion to the body"*,
  *"Can that make the cat aggressive"* — were falling through entirely. The
  question vocabulary is now built from how people actually open a question.
- The Java request classified as **writing**, because "briefe", "nachricht" and
  "schreibt" describe what the program does and outvoted the two words saying
  what was being asked for. Hence `strong` keywords.
- A 400-word deck list swallowed its own instruction. Long pasted blocks are now
  split out into their own MY MATERIAL section.

The documented edge cases are retained as regression cases wherever they map to
deterministic engine behavior, so keyword edits are measured against real
phrasing instead of invented phrasing.

## What the German office batch changed (0.20.0)

Twenty-five German messages of the shape the first group of testers actually
types — notary and law-office work, small-business admin. The person handing
Lantern out could not supply real logs (*"i cannot give you more, i am sorry"*)
but gave five verbatim shapes, typos included; those five are the first five in
`REAL3`, and the rest are built to the same pattern.

Eight misroutes, and the pattern in them is the finding. **Every one was a
German office noun the keyword lists had never met** — `rechnung`,
`serienbrief`, `aktenvermerk`, `vollmacht`, `übersicht`, `entwirf`. Those lists
were written by somebody thinking about emails and essays. A notary's assistant
does not type *draft an article*.

Two were worse than a wrong label:

- **`was muss in eine grundschuldbestellung rein` was detected as English.**
  One German marker (`eine`) against one English one (`in`), a tie, and a tie
  falls back — so a German user got an English prompt for a German document.
  `DE_MARK` was missing most of the commonest German words. What was added is
  only words with no English homograph: `man`, `hat`, `war`, `so`, `an`, `in`
  and `die` are all English words too and are deliberately left out, because a
  marker that scores for both sides is not a marker, and on a short sentence
  that is the difference between a tie and a decision.
- **`ich hab hier drei angebote und weiß nicht welches ich nehmen soll` was
  classed as `write`**, on the strength of the noun *Angebot*. Somebody asking
  for help deciding would have been handed a drafted offer letter.

Two of the new keywords look dangerous and are not, both for the same reason —
`kwHit` requires a word boundary *before* a match:

- `rechnung` does not fire inside *Berechnung*, so a maths question does not
  come back as an invoice. Checked.
- `fasse es` does not fire inside *verfasse es*, so "verfasse es als förmlichen
  Brief" is still a write request and not a summary. Checked.

The distinction `edit` exists for got sharper in the same pass. Both
*formuliere eine Absage* and *formulier das höflicher* contain `formulier`; the
demonstrative is the only thing in either sentence that says whether the text
already exists, so `formulier das` and its variants are `strong` on `edit` while
bare `formulier` stays a `write` keyword.

And one that no amount of keyword-chasing would have fixed: *durchsuche diese
mail nach fehlern und korriegiere diesen vertrag* has its verb typed wrong.
Adding misspellings is a treadmill. `nach fehlern` is not misspelled, and the
person said what they wanted twice over.

## Making the German read as German

From the person it was written for, looking at the finished explainer: *"the
german version appears as off, clearly ai made using - and such."*

They were right about the mechanism as well as the feeling. The dash used
throughout was the **em dash, U+2014**, which is an English and American
convention. German typography uses the *Halbgeviertstrich*, the en dash U+2013,
with a space on each side; the *Geviertstrich* is not used in German running
text at all. A German paragraph full of them is an English paragraph wearing
German words, which is exactly what "clearly ai made" describes.

Both halves were fixed and both are checked. 105 em dashes across the German
strings: the ones joining two clauses were recast into ordinary German
(`— und` → `, und`, and so on down the conjunctions), and what genuinely needed
a Gedankenstrich kept one in the right glyph. Four checks now hold the line — no
em dash in any German string, the German dash used in under a fifth of them
rather than as a habit, no floating punctuation (the first pass left a space in
front of eleven of the new commas), and German quotes throughout.

The checks run over *prose only*. `rules.js` also keeps detector strings under a
`de` key — regular-expression sources for spotting a phrase in an answer — and a
` ?` inside an alternation is a quantifier, not a space before a question mark.
One of them tripped the punctuation check the first time it ran.

The English is deliberately not checked. Em dashes belong there.

## Fixed since 0.1.0

Found in 0.19.0, during a full editorial pass over every user-facing string in
both languages — 74 findings, of which these are the ones that were not taste:

- **Every closing German quote in the explainer was a straight ASCII `"`.**
  Seventy-one of them. German closes with `“`, and `i18n.js` had it right while
  `rules.js` had it wrong throughout, so the two halves of the same panel were
  typeset differently. It is the single most visible "this was machine-made"
  signal a German reader gets, and no test would ever have caught it.
- **A tennis card described three instructions as four.** In both languages, in
  the first thing a coach reads. Coaches count.
- **`pasteNoRevert` told the user to split their message into pieces** while
  `partsWhy` and the paste explainer, in the same panel, told them an
  attachment beats five messages. Contradictory advice, one screen apart.
- **A follow-up sent to the assistant said "keine Bilder"** — meant as "no
  metaphors", read by an image-capable model as "no images".
- **Two of the twelve explainer cards had an empty takeaway**, while the panel's
  own lead promises that every answer ends with one. There is now a test.
- Grammar in strings the user *sends*: `alles, was … und das ich` (must be
  `was`), `Empfehlung gefolgt` (dative verb, must be `befolgt`), a broken
  verb-first conditional, and `ruderen` for `rudern`.
- **The English `promptish` pattern required a trailing space** where the German
  twin did not, so "your task:" at the end of a message never matched. Replaced
  with a word boundary, which also keeps "you are angry" from matching.
- Calques that gave the writer away: *halb erinnerte Begriffe*, *mehr als die
  Hälfte der Zeit*, *was du dir nicht leisten kannst, falsch zu haben*, *in der
  Reihenfolge*, *Kennst du:*, *er bleibt es*.
- German tennis usage: *am Longline* (it is die Longline), *Aufschlag-Volley*
  (German coaches say Serve and Volley), *Prozentvariante* (Prozenttennis),
  *eine Einheit laufen* (fahren), *eine Korrektur sagen* (geben).

And one from the same pass that was a live bug rather than prose: **switching
language with the help panel open left every answer in the old language** —
exactly the moment somebody switches, because they could not read it. The
explainer is built from `rules.js` rather than from `data-t` attributes, so the
sweep at the top of `applyLang` never touched it.

Four found in 0.17.0, and the first two are the kind worth naming:

- **The answer was never read on Claude or Gemini.** Four places in
  `content.js` had ChatGPT's `[data-message-author-role]` written into them
  directly, while `providers.js` had carried the other two vendors' selectors
  for two versions. So on two of three sites no follow-up was ever about the
  answer, the handover tab always said the chat was empty, and the memory check
  ran with a turn count of zero — which is the branch that makes it *most*
  willing to cry memory. It survived because the test harness planted ChatGPT's
  markup whatever provider the page claimed to be, so a test labelled Claude was
  a ChatGPT test. The harness now builds each assistant's own shape, and six
  checks fail without the fix.
- **"You have hit your limit" fired when the assistant said those words.** The
  limit detector read `document.body.innerText`, which includes the
  conversation. Ask "what happens when I hit my usage limit?", get an answer
  containing the phrase, and Lantern told you that you were locked out — a
  confident wrong warning, reachable by asking an ordinary question. Text nodes
  are now walked so each hit can be traced to an element and rejected if it sits
  inside a message.
- **Two follow-ups inserted in a row ran together**, with no space:
  "...sie kippt.Was spricht gegen...". Found in a screenshot, not a test.
- **A failed write looked exactly like a successful one.** `chrome.runtime.
  lastError` is a property to be read inside the callback, not an exception, and
  nothing read it. So when the extension was updated under an open page — which
  happens to every user with a tab open, on every release — the panel went on
  working, every save silently did nothing, and the draft went at the next
  reload. Now the panel says so and offers the one thing that fixes it.

Classification and prompt quality:

- `funktion` matched inside `funktioniert` (explain read as a coding request).
- `oder` was a decision keyword, so most German sentences looked like decisions.
- `halt` fired inside `Inhalt`/`behalte`, `gut` inside `Gutachten`.
- Lead-in stripping ate the verb: "schreib mir eine Mail" → "eine Mail".
- German capitalises every noun, so tidy German scored as more specific.
- Ask-first fired on plain questions ("how do I insert a table of contents").
- A review request whose review vocabulary scored zero got the explainer's role.
- The audience regex only tried its first match, so "for a formal audience, to
  my manager" never reached "my manager".
- `assess()` received the text separately from the slots and could run
  extraction against nothing.
- Missing task type: translate.

Interface and state:

- Typing then immediately clicking Build used stale detection.
- A manual override of kind or goal survived into a different request.
- The popup's language setting was overwritten by the stored draft.
- A failed stylesheet fetch left the panel unstyled (fallback added).
- A stored goal from an older rules file could leave no chip selected.
- The routing line and action buttons shared a `data-path` attribute.
- The toast lived inside the panel, so it vanished as the panel closed.
- Closing always grabbed focus, including after "insert into chat".
- Goal chips were not arrow-key navigable; every chip was a tab stop.
- Over-length sharpen URLs (encoded length is now what is measured).
- `[hidden]` lost to author `display` rules inside the shadow root.
- The worked example's separator line was dropped by the section builder.
- The panel offered **English** follow-ups in a **German** conversation: the
  language came from the empty request box, not the chat you are standing in.
- "Fits this answer" was claimed when there was no answer to fit.
- The capture tab buried the sharpened prompt under the intro card.
- German `weil` clauses had the verb in the wrong place.
- **Lantern read its own in-page bar back as part of ChatGPT's answer**, so the
  question helper offered to answer Lantern's own button labels. The bar is now
  a sibling of the message, never a child, with a guard in the reader as well.
- The answer-change key ignored the turn count, so a memory warning could linger
  after the user had said plenty.
- The goal affinity overrode strong archetype matches, not just generic ones —
  it was stealing `recall` and `calculate` requests for `learn`.
- A pasted URL at the start of a request was capitalised into `Https://`.
- The composer label sat over the conversation, then under the panel; it now
  says its piece and fades. It also stayed English on a German panel — the
  in-page layer was not following the language switch.
- **`splitQuestions` was O(n²)**: the obvious regex `/[^.?!\n]{6,}\?/g` scans to
  the end of the string from every position when there is no question mark, and
  `extract()`, `assess()` and `analyzeAnswer()` all inherited it. A 20,000-word
  paste — which the TTRPG example shows is a real thing people send — took a
  full second per keystroke. Two other regexes had the same unbounded shape.
- The model note was stale on first open — the picker said *Terra* while the
  panel said the model was not recognised, because detection ran after the first
  render and nothing re-rendered on open.
- The handover had to be collected by pressing a second button, unlike the
  sharpen flow, which collects itself. Lantern now watches for its own handover
  and lifts it in, with a ten-minute expiry so a stale one is never claimed.
- The popup's version line was a hardcoded string that had already drifted; it
  reads the manifest now.
- A test-harness bug, worth recording because it hid a real regression:
  `__setAnswer` replaced the whole conversation, so a 30-message chat became a
  1-message chat under exactly the features that count messages.
- **A manual model override never survived a reload.** `save()` wrote the
  derived tier; `restore()` read `modelChoice`; nothing wrote `modelChoice`.
  Found by writing the storage schema down.
- Rebuilding the model dropdown on a language switch re-applied the *old DOM
  value*, which during `restore()` is the default — overwriting a stored choice
  with the placeholder that preceded it.
- The in-page layer pushed the page by a hardcoded 436px, which on a narrow
  window is wider than the space there is: the whole page gained a horizontal
  scrollbar.
- The popup saved the rules address and fired the check without waiting for the
  write, so the check ran against the *previous* address. Passed some runs,
  failed others.
- Hiding the parts collector left its rows in the DOM, so discarded parts came
  back the next time it was shown.
- `continues` missed "ich schicke dir gleich noch mehr" and "in der nächsten
  Nachricht" — two of the most natural ways to say it.

## Known limits

- New chats intentionally do not prefill a provider composer. Lantern opens the
  panel with the carried prompt, and the person inserts it with one explicit
  click. This prevents URL behavior outside Lantern's control from sending a
  message automatically.
- Reading the page goes through the selectors in `providers.js`, one set per
  assistant, with ChatGPT's as the fallback. If a vendor changes its markup,
  auto-capture and the in-page bar quietly stop; the manual grab link and the
  panel keep working. The in-panel self-check reports whether the last answer
  was read, separately from the message count, because until 0.17.0 those two
  used different selectors and only one of them was right — see *Fixed since
  0.1.0*.
- Gemini's current usage-limit wording is published nowhere. Its phrase list is
  a stem plus a requirement that a reset time appear beside it; if the real
  wording diverges, the Later tab simply never notices a limit, which costs
  nothing. The self-check carries a deliberately over-inclusive `limitProbe`
  so that one report from somebody who has hit a limit settles it.
- Making room pads `body` and the composer's nearest pinned ancestor. On a
  layout Lantern cannot read, the padding is skipped and the panel simply
  overlaps as before. It is one popup toggle away from off.
- Router threshold and keyword lists are judgement, calibrated on 17 real
  messages and research on the *shape* of demand, not on data. The activity view
  now at least makes the threshold observable; it does not yet make it right.

## Roadmap

**Chat handoff** — shipped in 0.5.0.

**Memory drift detector** — the inference half shipped in 0.6.0, and the
follow-ups that act on it (`memoryProbe`, `memoryIgnore`) do the work a user
actually needs: they make the assistant list what it added and where from.

Reading the memory list out of Settings → Personalization is the remaining
piece, and it is deliberately still unbuilt. It is the most markup-fragile
thing in the plan — it means navigating a settings page and scraping a list —
and it cannot be tested without a live account, so building it now would mean
shipping something untestable to find out whether it works. The part with the
value is already there.

**A second corpus.** The router threshold, the keyword lists and the archetype
weights are calibrated on 17 real messages from essentially one person.
Everything else on this list can be built; this one can only be collected. It is
the highest-value remaining input to the project.

the tests do: a store screenshot of something that does not exist is worse than
no screenshot. The third draws the mark once and renders the three sizes, with a
separate, blunter glyph for 16px — five strokes two pixels apart grey into a
## Verification

The development checkout has no required third-party test dependency. With Node
20 or newer, run:

```
npm run verify
```

It syntax-checks every shipped JavaScript file and runs the local regression
suite. The tester ZIP deliberately excludes the developer test harness:
`package.json`, `test/`, `tools/`, and `build.js`; testers should follow
`TESTING.md` instead. The suite verifies
the manifest and every declared resource, the strict no-auto-send invariant,
storage validation and reset behavior, provider-aware composer selection,
prompt construction across providers, remote-rule safety, handoff persistence,
responsive panel geometry, and additive page-layer cleanup.

With Playwright installed, `npm run test:browser` also runs the fixture browser
gate. Without it, that optional test reports a skip and `npm run verify` remains
dependency-free.

`test/panel-preview.html` is a local mock chat for a visual smoke check. From
this directory, run `python -m http.server 4173` and open
`http://localhost:4173/test/panel-preview.html`. It uses the shipped scripts,
but no account, provider page, or user data.

The only checks that cannot be automated locally are the live DOM selectors and
model-picker labels on ChatGPT, Claude, and Gemini. Run `TESTING.md` on real
logged-in pages before a public release; its self-test reports each selector
separately when a provider redesigns its interface.
