# Lantern — what to check when you can test

Written to be run in one sitting, in order, on a real login. **You do not need
to understand any of it** — every step is "do this, write down what you see".
The answers close gaps I cannot close from here, and each one is currently
blocking something.

Nothing here asks you to judge whether an answer is good. That is the slow,
subjective kind of testing. This is the fast kind: does Lantern see what it
thinks it sees.

---

## Before you start

This tester archive intentionally contains only the loadable extension, not the
maintainer's `npm` test harness. The maintainer runs the account-free regression
suite before packaging it. The checks below are still needed because only a real
logged-in provider page can prove that its current selectors and model labels
still match Lantern.

Load the extension per `INSTALL.txt`. Have this file open next to you. A phone
camera pointed at the screen is a perfectly good way to record answers — a
screenshot of the model picker is worth more than a description of it.

---

## Part 1 — The five-minute version

If you only have five minutes, do this part. It closes the single blocking gap.

### 1.1 Does it run at all?

On **chatgpt.com**, press the Lantern icon in the Chrome toolbar, then
**"Self-test on this page"**.

Write down all five lines exactly as shown:

```
Panel loaded            ✓ / ✗
Input box found         ✓ / ✗
Messages readable:      ✓ / ✗   count: ____
Model recognised:       ✓ / ✗   name:  ____
In-chat display active  ✓ / ✗
```

A cross on any line names the selector that has gone stale. That is the whole
point of the self-test: it turns "it doesn't work" into a specific broken thing.

### 1.2 Does the prompt actually land?

Type into Lantern: `ich brauche eine email an meinen vermieter wegen der
heizung` → **Prompt bauen** → **In den Chat einfügen**.

- Did the text appear in ChatGPT's input box? **yes / no**
- If no: is it on your clipboard (press Ctrl+V in the box)? **yes / no**

"No, and not on the clipboard" is the worst answer and the most useful one.

### 1.3 Does sharpening stay in the current chat?

Press **"Von ChatGPT schärfen"**.

- Did the current chat's input box receive a sharpening request? **yes / no**
- Did a new tab open? **yes / no** — it should be **no**.
- Did it send **by itself**, or wait for you? **sent / waited** — it must wait.
- With no Details fields or result-type choice selected, did that request avoid
  invented lines such as `Kind of task: General`, `What I want back`, and
  `What would make this better`? **yes / no**
- Send the request yourself. When the answer contains a code block, did Lantern
  bring the sharpened prompt back to its panel? **yes / no**

⚠️ **If it sent by itself, tell me immediately and stop using that button.**
Lantern must never cause a message to be sent without you pressing send. That
is the rule the whole design rests on.

### 1.4 Does it preserve a request that is already clear?

In Lantern, build each of these without changing the text:

1. `Return only valid JSON listing the five largest cities in Germany.`
  - Did the prompt stay exactly the same? **yes / no**
  - Did Lantern say that it preserved the strict output format? **yes / no**
  - Was there no "Build it out anyway" control? **yes / no**
2. `Explain why the sky is blue.` then a blank line, then `Use plain language.`
  - Did Lantern avoid calling that second line source material? **yes / no**
3. Build any prompt, then switch between the answer and finished-result types.
  - Did the prompt update immediately? **yes / no**
  - Did the result label say it was updated automatically for the selected
    result type? **yes / no**
4. Fill in a Detail, turn on a checkbox, choose a model, then press **Clear all**.
  - Did the request, Details, checkboxes, selected model, collected parts, and
    visible result all reset? **yes / no**
  - Did text size, colour, language, and history remain? **yes / no**

### 1.5 Does Follow up keep custom corrections in the real chat box?

After a normal answer, open **Follow up** and press **Go to chat input**.

- Did ChatGPT's actual input box receive focus? **yes / no**
- Was there no second text box inside Lantern for custom feedback? **yes / no**
- Type a concrete correction directly in ChatGPT, such as `Less breakcore and
  dubstep bass; keep the chaotic electronic direction.` Did it stay there until
  you chose Send? **yes / no**
- Did a ready-made Lantern follow-up still insert only its own text and wait
  for you to send? **yes / no**
- After you inserted the original full prompt once, did **Repeat task context**
  appear as a separate action? **yes / no**
- Did task context stay out of ordinary feedback unless you chose that separate
  action? **yes / no**
- Was there no automatic **Self-critique** follow-up? **yes / no**

### 1.6 Does Lantern reorder without adding a prompt frame?

On **claude.ai** or **gemini.google.com**, enter a short source-processing task
followed by at least 80 words of source text, for example:

```text
Summarize this report for the project team.

[Paste at least 80 words of ordinary report text here.]
```

- Before building, did Lantern say it would only change the order? **yes / no**
- Did the result place the supplied report text first and the unchanged task at
  the end? **yes / no**
- Did it avoid adding headings such as `TASK`, a role, a quality bar, or a new
  output format? **yes / no**
- On ChatGPT, did it avoid this automatic reorder path? **yes / no**

### 1.7 Do Settings and a moved chat stay concise?

Open the **Settings** tab in Lantern.

- Is **Normal** visibly larger than **Small**, with both choices available?
  **yes / no**
- Change the text size and colour, close Lantern, then open it again. Did both
  choices remain? **yes / no**
- Turn off **Show inside the chat**. Did the panel stop moving the page aside
  and stop adding chat highlights? **yes / no**
- Press **Show the short tour again**. Did it name all five tabs and return you
  to the prompt tab? **yes / no**

On a longer chat, use **Move chat** to request and collect a handover, then
start the fresh chat.

- Did the handover contain only an ordered task list, with one concrete
  verb-led action per point? **yes / no**
- Did it avoid separate goal, facts, decisions, style, and summary sections?
  **yes / no**
- Did the fresh chat open with the handover already in its real input box,
  without sending it? **yes / no**
- Did it avoid restating the handover and either begin the next step or ask one
  short question for a genuinely missing detail? **yes / no**
- Drag the panel, resize it from a corner, and switch language once. After each
  mouse or touch release, did the panel stop moving or resizing immediately?
  **yes / no**

### 1.8 Does voice typing stay outside Lantern?

Click Lantern's main request field, press **Win+H**, and dictate a short
sentence. Repeat in one Detail field and the collected handover box.

- Did Windows write into exactly the focused field? **yes / no**
- Did Lantern avoid showing a browser microphone permission prompt? **yes / no**
- Did no Lantern control start listening until you explicitly pressed Win+H?
  **yes / no**

---

## Part 2 — Claude (claude.ai)

Everything here is currently a guess. These answers are what turn Lantern's
Claude support from "written from documentation" into "known to work".

### 2.1 The model picker

Open claude.ai. **Photograph or copy the exact text on the model button**, next
to the send button.

- Exact text: `________________`
- Does it show two things (a model *and* an effort level like High or Max)?
- Open the menu. **List every model name you can see**, including under
  "More models": `________________`
- Is **Haiku** in the list at all? **yes / no** ← nobody has been able to tell me

### 2.2 The paste threshold — the one measurement I need most

Anthropic publishes nothing about when a long paste becomes an attachment. The
best figure anyone has is ~4,000 characters, reverse-engineered by someone else's
extension. I would rather know than guess.

Take any long text. Paste progressively larger amounts into Claude's box **but
do not send**, and find the point where it turns into a "pasted content"
attachment instead of staying as text.

- It stayed as text at about ____ characters
- It became an attachment at about ____ characters
- **Is there any way to turn it back into text?** (ChatGPT has a "Show in text
  field" link. Does Claude?) **yes / no**

Rough is fine — "somewhere between 3k and 5k" is a useful answer.

### 2.3 The thinking panel

Ask Claude something that makes it think, e.g. *"Wie viele Werktage liegen
zwischen dem 3. März und dem 19. Juni 2026?"*

- Is there a **Thinking** section? **yes / no**
- Is it **open or closed** by default?
- Does it show a **timer**?
- Roughly how long is what it shows — a couple of sentences, or paragraphs?

### 2.4 The limit message

Only if you happen to hit a limit. **Photograph it.** I have the string from
Anthropic's docs ("5-hour limit reached - resets [time]") but not what it
actually looks like, and Lantern wants to read the reset time off it.

### 2.5 Self-test on Claude

Run the popup self-test **on claude.ai** and write down all five lines, same as
1.1. Expect crosses — the selectors are educated guesses. Which ones fail is
exactly what I need.

### 2.6 Does Lantern stay separate from Claude's input box?

This is a blocking check after the Claude editor changed.

1. Open Lantern and type this into Lantern's large field, but do not press any
   Lantern action yet:

   ```text
   Schreibe eine Nachricht an meinen Chef: Ich brauche morgen frei, weil ich einen privaten, nicht verschiebbaren Termin habe, und ich möchte keine persönlichen Details nennen.
   ```

   - Did the sentence stay only inside Lantern until you chose an action?
     **yes / no**
   - Did Claude's own input box stay unchanged while you typed? **yes / no**

2. Press **Prompt bauen**, then **In den Chat einfügen**.

   - Did the built prompt appear in Claude's input box? **yes / no**
   - Did Claude wait for you to press Send? **yes / no**

3. Start again with the same sentence and press **Mit Claude schärfen**.

   - Did the request arrive in Claude's input box, with no new tab? **yes / no**
   - Did it contain the full original sentence inside a `user_request` block?
     **yes / no**
   - Did it say `Claude-Chat`, not `{ai}`? **yes / no**
   - Send it yourself. If Claude's returned code block drops any part of the
     original sentence, did Lantern show the original wording unchanged with a
     warning instead of accepting the lossy result? **yes / no**

If any answer is **no**, copy the popup self-test result and take a screenshot
of Claude's input box before sending another message.

---

## Part 3 — Gemini (gemini.google.com)

### 3.1 The model picker

Google's own help pages, the tech press, and the actual UI disagree about what
this says, and it appears to differ between accounts.

- **Exact text on the model button** (it sits *under* the input box): `________`
- Open it and **list everything in the menu**: `________________`
- Is there a **thinking level** control (Standard / Extended / Deep Think)?
- Which plan are you on — free, AI Plus, AI Pro, Ultra?

That last one matters: the same label means a different underlying model on
different plans.

### 3.2 Long chats

If you have a long Gemini chat, ask it about something from near the start.

- Did it remember? **yes / no**
- Roughly how many messages in is the chat?

On the free tier Gemini's memory is far shorter than the "1 million" Google
advertises — about 32k tokens. If it forgets, that is the ceiling, not a fault,
and Lantern should say so rather than let you think it is broken.

### 3.3 Self-test on Gemini

Same five lines, on gemini.google.com.

### 3.4 Anything that looks like generated UI

Gemini sometimes answers with an interactive panel rather than text ("Visual
Layout", "Dynamic View"). If you see one, photograph it — Lantern reads answers
as text and this is the shape that breaks that.

---

## Part 4 — Things worth trying if you have time

### 4.1 The explainer

Open the panel, press **?** in the top right, and read two or three cards.

The question that matters is not "is it correct" but: **would someone who does
not know any of this understand it, and could they do it themselves afterwards?**
If any card reads as describing a button rather than teaching a technique, it has
failed and I should rewrite it.

- Which card was clearest? ____
- Which one did you have to read twice? ____

### 4.2 The parts collector

Type `ich schicke dir gleich noch mehr`. A green box should offer to collect the
pieces. Add two parts, then build.

- Did the box appear? **yes / no**
- Did both parts end up in the prompt? **yes / no**

### 4.3 The memory warning

This one needs a real case, which is why it has never been properly tested. If
Claude or ChatGPT ever refers to something about you that you did not say in
that chat, open Lantern's **Nachfassen** tab and see whether it flagged it.

- Did Lantern notice? **yes / no**
- Did it flag something that was actually fine? **yes / no** ← a false alarm
  here is worse than a miss, because it sends you to change settings that were
  not the problem

---

## What I do with the answers

| Answer | What it unblocks |
|---|---|
| 1.1–1.3 | Whether 0.10.0 works at all outside my test harness. Everything else is downstream of this. |
| 2.1, 3.1 | Model detection stops being guesswork on two of three providers. |
| 2.2 | The paste warning fires at the right moment instead of a number I invented. |
| 2.3, 3.2 | Whether the "read the first line of its thinking" advice is even reachable. |
| 2.5, 3.3 | Which of ~18 selectors are wrong, by name. |
| 4.1 | Whether the explainer teaches or just narrates. |
| 4.3 | The one feature that has never seen a real case. |

If you only get through Part 1, that is still the most valuable half hour this
project has had. Everything in it is currently unknown.
