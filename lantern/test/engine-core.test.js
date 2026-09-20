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
  return sandbox.window;
}

function buildState(provider, extra) {
  return Object.assign({
    text: 'Write a clear update for the client about the project timeline.',
    lang: 'en',
    archetype: 'write',
    goal: 'artifact',
    force: true,
    provider,
    tier: 'balanced',
    audience: 'UNIQUE_AUDIENCE',
    format: 'UNIQUE_FORMAT',
    include: 'UNIQUE_INCLUDE',
    avoid: 'UNIQUE_AVOID',
    context: 'UNIQUE_CONTEXT',
    example: 'UNIQUE_EXAMPLE',
    parts: ['UNIQUE_PART'],
    caps: [],
    scope: false,
    improve: false,
    sources: false,
    ignoreMemory: false,
    ask: false,
    lean: false
  }, extra);
}

function automaticState(engine, text, extra) {
  const lang = engine.detectLanguage(text, 'en');
  const archetype = engine.detectArchetype(text);
  return Object.assign({
    text,
    lang,
    archetype,
    goal: engine.detectGoal(text, archetype),
    provider: 'chatgpt',
    tier: 'balanced',
    audience: '', format: '', include: '', avoid: '', context: '', example: '',
    parts: [], caps: [], scope: false, improve: false, improveExplicit: false,
    sources: false, ignoreMemory: false, force: false, lean: false, ask: false
  }, extra);
}

test('language detection handles the documented German and English examples', () => {
  const engine = loadEngine().LN_ENGINE;

  assert.equal(engine.detectLanguage('was muss in eine grundschuldbestellung rein', 'en'), 'de');
  assert.equal(engine.detectLanguage('How do I write a clear update for my client?', 'de'), 'en');
  assert.equal(engine.detectLanguage('Translate "Bitte ändere den Termin" into English.', 'de'), 'en');
  assert.equal(engine.detectLanguage('Übersetze "Please change the appointment" ins Deutsche.', 'en'), 'de');
  assert.equal(engine.detectLanguage('Summarize "Bitte ändere den Termin".', 'de'), 'en');
  assert.equal(engine.detectLanguage('Fasse "Please change the appointment" zusammen.', 'en'), 'de');
});

test('German review, call, and short requests keep their language and hard limits', () => {
  const engine = loadEngine().LN_ENGINE;
  const review = engine.buildPrompt(automaticState(engine, 'überprüfe meinen Lebenslauf'));
  const call = engine.buildPrompt(automaticState(engine, 'ruf bei der Versicherung an'));
  const repair = engine.buildPrompt(automaticState(engine, 'repariere meinen code'));

  assert.equal(review.extracted ? review.extracted : null, review.extracted);
  assert.equal(review.archetype, 'analyze');
  assert.equal(review.goal, 'feedback');
  assert.equal(review.helps, 'material');
  assert.equal(review.why, 'sourceMissing');
  assert.equal(call.helps, 'capability');
  assert.equal(call.why, 'externalAction');
  assert.equal(repair.prompt.includes('Before writing'), false);
  assert.equal(engine.detectLanguage('hilfe', 'en'), 'de');
  assert.equal(engine.detectLanguage('danke', 'en'), 'de');
});

test('long direct questions and detailed prose briefs stay raw unless explicitly expanded', () => {
  const engine = loadEngine().LN_ENGINE;
  const healthText = 'My three-year-old has had a 39.5C fever for two days, is unusually sleepy and now has a rash. Should I take her to A&E tonight or wait until morning?';
  const briefText = 'Please write a 600-word briefing for new managers about introducing weekly one-to-one meetings. Use a calm, practical tone, include a three-step rollout plan, explain how to handle resistance, avoid jargon, and finish with a short checklist.';
  const health = engine.buildPrompt(automaticState(engine, healthText));
  const brief = engine.buildPrompt(automaticState(engine, briefText));

  [health, brief].forEach((built, index) => {
    const text = index === 0 ? healthText : briefText;
    assert.equal(built.frame, 'none');
    assert.equal(built.asIs, true);
    assert.equal(built.prompt, text);
    assert.equal(built.why, 'clearRequest');
  });
});

test('quote masking does not mistake ordinary contractions for quoted source text', () => {
  const engine = loadEngine().LN_ENGINE;
  const contraction = "Don't write a reply to my manager if it's too harsh.";
  const translation = "Translate 'Please don't send it today' into German.";

  assert.equal(engine.detectLanguage(contraction, 'de'), 'en');
  assert.equal(engine.detectArchetype(contraction), 'write');
  assert.equal(engine.detectArchetype(translation), 'translate');
});

test('prompt assembly retains every explicit user detail for every provider', () => {
  const engine = loadEngine().LN_ENGINE;
  const tokens = [
    'UNIQUE_AUDIENCE', 'UNIQUE_FORMAT', 'UNIQUE_INCLUDE', 'UNIQUE_AVOID',
    'UNIQUE_CONTEXT', 'UNIQUE_EXAMPLE', 'UNIQUE_PART'
  ];

  ['chatgpt', 'claude', 'gemini'].forEach(provider => {
    const built = engine.buildPrompt(buildState(provider));
    assert.equal(built.frame, 'full', provider);
    tokens.forEach(token => assert.ok(built.prompt.includes(token), provider + ' lost ' + token));
  });
});

test('short multi-clause requests preserve the request verb instead of stripping it', () => {
  const engine = loadEngine().LN_ENGINE;
  const task = engine.cleanTask('ich möchte ein ärztliches Attest aber es ist zu spät und die haben zu');

  assert.match(task, /^Ich möchte ein ärztliches Attest/i);
});

test('URLs do not look like code and are never punctuated into a different link', () => {
  const engine = loadEngine().LN_ENGINE;
  const text = 'fasse mir das zusammen https://www.spiegel.de/a.html';
  const built = engine.buildPrompt(automaticState(engine, text));

  assert.equal(built.archetype, 'summarize');
  assert.equal(built.helps, 'material');
  assert.equal(built.why, 'sourceMissing');
  assert.equal(engine.cleanTask('https://example.com/a/b?c=d&e=f'), 'https://example.com/a/b?c=d&e=f');
});

test('long opaque lines do not trigger superlinear code detection', () => {
  const engine = loadEngine().LN_ENGINE;
  const text = 'data:text/plain,' + 'a'.repeat(32000);
  const started = performance.now();
  engine.buildPrompt(automaticState(engine, text));
  const elapsed = performance.now() - started;
  const code = engine.buildPrompt(automaticState(engine, 'Fix this: console.log(value);', {
    archetype: 'code',
    goal: 'artifact'
  }));

  assert.ok(elapsed < 500, 'long opaque input took ' + elapsed.toFixed(1) + 'ms');
  assert.notEqual(code.why, 'codeMissing');
});

test('explicit improvement tips take effect without restoring an old implicit default', () => {
  const window = loadEngine();
  const engine = window.LN_ENGINE;
  const base = {
    text: 'What is the capital of France?',
    lang: 'en',
    archetype: 'general',
    goal: 'answer',
    provider: 'chatgpt',
    tier: 'balanced',
    audience: '', format: '', include: '', avoid: '', context: '', example: '',
    parts: [], caps: [], scope: false, sources: false, ignoreMemory: false,
    force: false, lean: false, ask: false
  };
  const stale = engine.buildPrompt({ ...base, improve: true, improveExplicit: false });
  const chosen = engine.buildPrompt({ ...base, improve: true, improveExplicit: true });
  const shortArtifact = engine.buildPrompt({
    ...base,
    text: 'Write an email to my landlord.',
    archetype: 'write',
    goal: 'artifact',
    improve: true,
    improveExplicit: true
  });

  assert.equal(stale.asIs, true);
  assert.equal(stale.prompt, base.text);
  assert.equal(chosen.helps, 'build');
  assert.equal(chosen.why, 'supplied');
  assert.equal(chosen.asIs, false);
  assert.ok(chosen.prompt.includes(window.LN_RULES.toggles.improve.en));
  assert.ok(shortArtifact.prompt.includes(window.LN_RULES.toggles.improve.en));
});

test('answer analysis identifies a truncated response and avoids treating complete lists as truncated', () => {
  const engine = loadEngine().LN_ENGINE;
  const unfinished = Array.from({ length: 30 }, () => 'word').join(' ') + ' and';
  const list = Array.from({ length: 8 }, (_, index) => '- complete item ' + index).join('\n');

  assert.equal(engine.analyzeAnswer(unfinished).truncated, true);
  assert.equal(engine.analyzeAnswer(list).truncated, false);
});

test('follow-up cards need evidence from the answer and never offer self-critique', () => {
  const engine = loadEngine().LN_ENGINE;
  const none = engine.rankFollowUps({ signals: [] }, { goal: 'artifact', provider: 'chatgpt' });
  const longList = engine.rankFollowUps({ signals: ['long', 'hasList'] }, { goal: 'artifact', provider: 'chatgpt' });

  assert.equal(none.some(item => item.score > 0), false);
  assert.equal(longList.some(item => item.id === 'critique'), false);
});

test('ordinary prose does not trigger generic figure, source, or short-answer follow-ups', () => {
  const engine = loadEngine().LN_ENGINE;
  const answer = engine.analyzeAnswer('The playlist should feel playful and electronic without leaning too hard into one genre.');
  const ranked = engine.rankFollowUps(answer, { goal: 'ideas', provider: 'chatgpt' });

  assert.equal(answer.signals.includes('noNumbers'), false);
  assert.equal(answer.signals.includes('noSources'), false);
  assert.equal(ranked.some(item => item.score > 0), false);
});

test('paste risk remains provider-specific rather than inventing a Gemini threshold', () => {
  const window = loadEngine();
  const engine = window.LN_ENGINE;
  const providers = window.LN_PROVIDERS;

  assert.equal(engine.pasteRisk('x'.repeat(5000), providers.byId('chatgpt')).likely, true);
  assert.equal(engine.pasteRisk(Array(13).fill('line').join('\n'), providers.byId('claude')).likely, true);
  assert.equal(engine.pasteRisk('x'.repeat(100000), providers.byId('gemini')), null);
});