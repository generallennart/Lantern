const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadEngine() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  ['rules.js', 'providers.js', 'engine.js'].forEach(file => {
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'),
      sandbox,
      { filename: file }
    );
  });
  return sandbox.window.LN_ENGINE;
}

function automaticFor(engine, text, provider) {
  const lang = engine.detectLanguage(text, 'en');
  const archetype = engine.detectArchetype(text);
  return engine.buildPrompt({
    text,
    lang,
    archetype,
    goal: engine.detectGoal(text, archetype),
    provider,
    tier: 'balanced',
    audience: '',
    format: '',
    include: '',
    avoid: '',
    context: '',
    example: '',
    parts: [],
    caps: [],
    scope: false,
    improve: false,
    improveExplicit: false,
    sources: false,
    ignoreMemory: false,
    force: false,
    lean: false,
    ask: false
  });
}

function automatic(engine, text) {
  return automaticFor(engine, text, 'chatgpt');
}

function assertUntouched(engine, name, text) {
  const built = automatic(engine, text);
  assert.equal(built.frame, 'none', name + ' should have no generated frame');
  assert.equal(built.asIs, true, name + ' should not add instructions');
  assert.equal(built.prompt, text, name + ' should preserve the original request');
  return built;
}

test('self-contained questions and requests stay unchanged unless Lantern adds real value', () => {
  const engine = loadEngine();

  const local = assertUntouched(engine, 'current local question', 'Is the post office near me open today?');
  assert.equal(local.archetype, 'general');
  assert.equal(local.helps, 'capability');
  assert.deepEqual(Array.from(local.suggest), ['web']);

  assertUntouched(engine, 'clear email',
    'Write a calm email to my landlord about a broken heater and ask for a repair date.');
  assertUntouched(engine, 'clear apology',
    'Write a sincere apology to my colleague for missing yesterday’s deadline.');
  assertUntouched(engine, 'German clear email',
    'Schreibe eine kurze E-Mail an meine Vermieterin wegen der Heizung.');
  assertUntouched(engine, 'translation with source and target',
    "Translate 'Please send the invoice today' into German.");
  const translation = automatic(engine, "Translate 'Please send the invoice today' into German.");
  assert.deepEqual(Array.from(translation.suggest), []);
  assertUntouched(engine, 'small creative request', 'Write a haiku about rain.');
  assertUntouched(engine, 'bounded brainstorm', 'Give me five ideas for a team offsite.');
  assertUntouched(engine, 'code how-to', 'How do I reverse an array in JavaScript?');
  const ownPrompt = assertUntouched(engine, 'existing prompt',
    'You are a careful editor. Rewrite the following email in a calm professional tone, keeping all facts and the length under 150 words.');
  assert.equal(ownPrompt.why, 'ownPrompt');

  const comparison = assertUntouched(engine, 'clear comparison', 'Compare renting and buying a flat in Berlin.');
  assert.equal(comparison.archetype, 'decide');
  assert.equal(comparison.goal, 'answer');
});

test('self-contained tier-list requests are not treated as source material or a spreadsheet', () => {
  const engine = loadEngine();
  const text = 'mythology rivers of hell greek. name them and sort them based on heat. make a tierlist of how good of a spott hey would be for making hotdogs';
  const built = assertUntouched(engine, 'factual tier list', text);

  assert.notEqual(built.archetype, 'summarize');
  assert.notEqual(built.why, 'sourceMissing');
});

test('long source transformations can be reordered without adding a prompt frame', () => {
  const engine = loadEngine();
  const task = 'Summarize this report for the project team.';
  const material = Array.from({ length: 12 }, (_, index) =>
    'Section ' + (index + 1) + ' records the delivery delay, review findings, and next planned action.'
  ).join(' ');
  const text = task + '\n\n' + material;
  const claude = automaticFor(engine, text, 'claude');
  const chatgpt = automatic(engine, text);

  assert.equal(claude.helps, 'reorder');
  assert.equal(claude.why, 'reordered');
  assert.equal(claude.frame, 'reorder');
  assert.equal(claude.instructions, 0);
  assert.equal(claude.prompt, material + '\n\n' + task);
  assert.equal(claude.prompt.includes('TASK'), false);
  assert.notEqual(chatgpt.frame, 'reorder');
});

test('formatting, output contracts, and compact forms are left intact when a template would conflict', () => {
  const engine = loadEngine();
  const formattedQuestion = assertUntouched(engine, 'formatted direct question',
    'Explain why the sky is blue.\n\nUse plain language.');
  const json = assertUntouched(engine, 'strict JSON output',
    'Return only valid JSON listing the five largest cities in Germany.');
  const flashcards = assertUntouched(engine, 'self-contained flashcards',
    'Make ten flashcards for the Greek gods, with the answer on the back.');
  const shortPrompt = assertUntouched(engine, 'short labelled prompt',
    'Role: travel guide. Task: plan a three-day Berlin itinerary.');
  const separatedSource = automatic(engine,
    'Summarize this:\n\nThe project is delayed by two days because testing found a defect.');

  assert.equal(formattedQuestion.extracted.material, false);
  assert.equal(json.why, 'outputContract');
  assert.equal(flashcards.why, 'clearRequest');
  assert.equal(shortPrompt.why, 'ownPrompt');
  assert.equal(separatedSource.extracted.material, true);
});

test('requests for actions outside a chat stay unchanged without an adjacent capability suggestion', () => {
  const engine = loadEngine();
  const booking = assertUntouched(engine, 'external booking request', 'Book me a table for two at 7pm tonight.');
  const email = assertUntouched(engine, 'external email request', 'Send an email to my landlord asking for a repair.');

  [booking, email].forEach(built => {
    assert.equal(built.why, 'externalAction');
    assert.equal(built.helps, 'capability');
    assert.deepEqual(Array.from(built.suggest), []);
  });
});

test('missing source material is identified instead of wrapped in a generic prompt', () => {
  const engine = loadEngine();
  const missingSummary = automatic(engine, 'Summarize the report.');
  const codeFix = automatic(engine, 'Fix this JavaScript error: Cannot read properties of undefined.');
  const codeTerm = automatic(engine, 'Fix this JavaScript class error: TypeError: Cannot read properties of undefined.');

  assert.equal(missingSummary.helps, 'material');
  assert.equal(missingSummary.why, 'sourceMissing');
  assert.equal(missingSummary.asIs, true);
  assert.equal(missingSummary.prompt, 'Summarize the report.');
  assert.equal(codeFix.helps, 'material');
  assert.equal(codeFix.why, 'codeMissing');
  assert.equal(codeFix.asIs, true);
  assert.equal(codeFix.prompt, 'Fix this JavaScript error: Cannot read properties of undefined.');
  assert.equal(codeTerm.helps, 'material');
  assert.equal(codeTerm.why, 'codeMissing');
  assert.equal(codeTerm.asIs, true);
});

test('conservative abstention keeps only focused help for genuinely underspecified requests', () => {
  const engine = loadEngine();
  const shortEmail = automatic(engine, 'Write an email to my landlord.');
  const calculation = automatic(engine, 'How many working days are there between 3 March and 19 June 2026?');

  assert.equal(shortEmail.helps, 'build');
  assert.equal(shortEmail.asked, true);
  assert.ok(shortEmail.prompt.split(/\s+/).length <= 28);
  assert.equal(calculation.helps, 'build');
  assert.equal(calculation.frame, 'light');
  assert.ok(calculation.prompt.split(/\s+/).length <= 35);
  assert.match(calculation.prompt, /weekends|Wochenenden/i);
});

test('quoted source text does not distort task detection or trigger generic expansion', () => {
  const engine = loadEngine();
  const review = assertUntouched(engine, 'short review with source',
    'Review this sentence: "The project were completed yesterday."');
  const summary = assertUntouched(engine, 'short summary with source',
    'Summarize this: "The project is delayed by two days because testing found a defect."');
  const code = assertUntouched(engine, 'short code fix with source',
    'Fix this JavaScript code: const title = user.name.toUpperCase();');

  assert.equal(review.archetype, 'analyze');
  assert.equal(review.goal, 'feedback');
  assert.equal(summary.archetype, 'summarize');
  assert.equal(code.archetype, 'code');

  const quotedPrompt = automatic(engine,
    'Explain what the phrase "You are a careful editor" means in a job advertisement.');
  assert.equal(quotedPrompt.why, 'clearRequest');
  assert.equal(quotedPrompt.asIs, true);
});

test('ambiguous location words and German how-to questions do not become unrelated artifacts', () => {
  const engine = loadEngine();
  const price = assertUntouched(engine, 'current price question',
    'What is the current price of a first-class stamp in Germany?');
  const codeHowTo = assertUntouched(engine, 'German code how-to',
    'Wie drehe ich ein Array in JavaScript um?');

  assert.notEqual(price.archetype, 'translate');
  assert.equal(price.goal, 'answer');
  assert.deepEqual(Array.from(price.suggest), ['web']);
  assert.equal(codeHowTo.goal, 'answer');
});

test('short unclear artifacts use a concise clarification instead of a generic frame', () => {
  const engine = loadEngine();
  [
    'Write a 500-word job application for a project manager role.',
    'Make a weekly vegetarian meal plan under 50 euros.',
    'Create a Python script that renames all PDF files by date.'
  ].forEach(text => {
    const built = automatic(engine, text);
    assert.equal(built.helps, 'build', text);
    assert.equal(built.asked, true, text);
    assert.ok(built.prompt.split(/\s+/).length <= 30, text);
    assert.equal(built.prompt.includes('TASK'), false, text);
  });
});

test('clear actions outside a chat remain unchanged across English and German phrasing', () => {
  const engine = loadEngine();
  [
    'Send an email to my landlord asking for a repair.',
    'Make a restaurant reservation for tonight.',
    'Vereinbare einen Termin beim Zahnarzt für morgen.',
    'Could you book me a table for two at 7pm tonight?',
    'Please send an email to my landlord asking for a repair.',
    'Kannst du einen Termin beim Zahnarzt für morgen vereinbaren?'
  ].forEach(text => {
    const built = assertUntouched(engine, 'external action', text);
    assert.equal(built.why, 'externalAction');
    assert.equal(built.helps, 'capability');
  });

  const guidance = automatic(engine, 'How do I book a table for two at 7pm tonight?');
  assert.equal(guidance.why, 'clearRequest');
  assert.equal(guidance.helps, 'no');
});

test('a direct question below the full-frame threshold remains unchanged', () => {
  const engine = loadEngine();
  assertUntouched(engine, 'long clear question',
    'Can you explain in plain language why my electricity bill rose this month even though I used less power than last month?');
});

test('explicit user settings take precedence over automatic abstention', () => {
  const engine = loadEngine();
  const question = automatic(engine, 'What is the capital of France?');
  const withSources = engine.buildPrompt({
    ...question.extracted,
    text: 'What is the capital of France?',
    lang: 'en',
    archetype: 'learn',
    goal: 'answer',
    provider: 'chatgpt',
    tier: 'balanced',
    audience: '',
    format: '',
    include: '',
    avoid: '',
    context: '',
    example: '',
    parts: [],
    caps: [],
    scope: false,
    improve: true,
    sources: true,
    ignoreMemory: false,
    force: false,
    lean: false,
    ask: false
  });

  assert.notEqual(withSources.frame, 'none');
  assert.equal(withSources.asIs, false);
  assert.match(withSources.prompt, /sources/i);

  const withWebSearch = engine.buildPrompt({
    text: 'Who is the current president of Mexico?', lang: 'en', archetype: 'general', goal: 'answer',
    provider: 'chatgpt', tier: 'balanced', audience: '', format: '', include: '', avoid: '', context: '',
    example: '', parts: [], caps: ['web'], scope: false, improve: true, sources: false, ignoreMemory: false,
    force: false, lean: false, ask: false
  });
  assert.equal(withWebSearch.helps, 'build');
  assert.equal(withWebSearch.asIs, false);
  assert.match(withWebSearch.prompt, /search the web/i);
});

test('force-expand cannot override real capability, source-material, or output-contract limits', () => {
  const engine = loadEngine();
  const external = engine.buildPrompt({
    ...automatic(engine, 'Book me a table for two at 7pm tonight.').extracted,
    text: 'Book me a table for two at 7pm tonight.', lang: 'en', archetype: 'data', goal: 'artifact',
    provider: 'chatgpt', tier: 'balanced', audience: '', format: '', include: '', avoid: '', context: '',
    example: '', parts: [], caps: [], scope: false, improve: true, sources: false, ignoreMemory: false,
    force: true, lean: false, ask: false
  });
  const missingSource = engine.buildPrompt({
    ...automatic(engine, 'Summarize the report.').extracted,
    text: 'Summarize the report.', lang: 'en', archetype: 'summarize', goal: 'artifact',
    provider: 'chatgpt', tier: 'balanced', audience: '', format: '', include: '', avoid: '', context: '',
    example: '', parts: [], caps: [], scope: false, improve: true, sources: false, ignoreMemory: false,
    force: true, lean: false, ask: false
  });
  const deliberate = engine.buildPrompt({
    ...automatic(engine, 'What is the capital of France?').extracted,
    text: 'What is the capital of France?', lang: 'en', archetype: 'learn', goal: 'answer',
    provider: 'chatgpt', tier: 'balanced', audience: '', format: '', include: '', avoid: '', context: '',
    example: '', parts: [], caps: [], scope: false, improve: true, sources: false, ignoreMemory: false,
    force: true, lean: false, ask: false
  });
  const ownPrompt = engine.buildPrompt({
    text: 'You are a concise assistant. Give me three practical time-management tips.',
    lang: 'en', archetype: 'general', goal: 'ideas', provider: 'chatgpt', tier: 'balanced',
    audience: '', format: '', include: '', avoid: '', context: '', example: '', parts: [], caps: [],
    scope: false, improve: true, sources: false, ignoreMemory: false, force: true, lean: false, ask: false
  });
  const outputContract = engine.buildPrompt({
    ...automatic(engine, 'Return only valid JSON listing the five largest cities in Germany.').extracted,
    text: 'Return only valid JSON listing the five largest cities in Germany.', lang: 'en', archetype: 'data', goal: 'artifact',
    provider: 'chatgpt', tier: 'balanced', audience: '', format: '', include: '', avoid: '', context: '',
    example: '', parts: [], caps: [], scope: false, improve: true, sources: false, ignoreMemory: false,
    force: true, lean: false, ask: false
  });

  assert.equal(external.why, 'externalAction');
  assert.equal(external.asIs, true);
  assert.equal(missingSource.why, 'sourceMissing');
  assert.equal(missingSource.asIs, true);
  assert.equal(deliberate.why, 'youAsked');
  assert.equal(deliberate.frame, 'full');
  assert.equal(ownPrompt.why, 'youAsked');
  assert.equal(ownPrompt.frame, 'full');
  assert.equal(outputContract.why, 'outputContract');
  assert.equal(outputContract.asIs, true);
});