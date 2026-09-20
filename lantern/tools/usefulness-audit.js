const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sandbox = { window: {}, console };
vm.createContext(sandbox);
['rules.js', 'providers.js', 'engine.js'].forEach(file => {
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'),
    sandbox,
    { filename: file }
  );
});

const E = sandbox.window.LN_ENGINE;
const cases = [
  ['factual', 'What is the capital of France?'],
  ['timezone', 'What time is it in Tokyo?'],
  ['simple-howto', 'How do I boil an egg?'],
  ['definition', 'What does amortization mean?'],
  ['technical-definition', 'What does HTTP 404 mean?'],
  ['explanation', 'Explain recursion with a simple example.'],
  ['calculation', 'How many working days are there between 3 March and 19 June 2026?'],
  ['current-local', 'Is the post office near me open today?'],
  ['current-news', 'Who is the current president of Mexico?'],
  ['medical', 'Is it safe to take ibuprofen with coffee?'],
  ['legal', 'Can my landlord enter my apartment without notice?'],
  ['life-advice', 'Should I quit my job?'],
  ['doctor-note', 'I need a doctor note but it is too late and they are closed.'],
  ['clear-email', 'Write a calm email to my landlord about a broken heater and ask for a repair date.'],
  ['short-email', 'Write an email to my landlord.'],
  ['translate', "Translate 'Please send the invoice today' into German."],
  ['haiku', 'Write a haiku about rain.'],
  ['code-fix', 'Fix this JavaScript error: Cannot read properties of undefined.'],
  ['code-howto', 'How do I reverse an array in JavaScript?'],
  ['brainstorm', 'Give me five ideas for a team offsite.'],
  ['decision', 'Compare renting and buying a flat in Berlin.'],
  ['summarize-missing', 'Summarize the report.'],
  ['already-prompt', 'You are a careful editor. Rewrite the following email in a calm professional tone, keeping all facts and the length under 150 words.'],
  ['impossible-action', 'Book me a table for two at 7pm tonight.'],
  ['german-factual', 'Wie lange muss ich Kartoffeln kochen?'],
  ['german-office', 'Schreibe eine kurze E-Mail an meine Vermieterin wegen der Heizung.'],
  ['clear-apology', 'Write a sincere apology to my colleague for missing yesterday\'s deadline.'],
  ['job-application', 'Write a 500-word job application for a project manager role.'],
  ['clear-title', 'Write three headline options for a bakery opening.'],
  ['meal-plan', 'Make a weekly vegetarian meal plan under 50 euros.'],
  ['review-missing', 'Review my CV and tell me what is weak.'],
  ['review-with-text', 'Review this sentence: "The project were completed yesterday."'],
  ['summary-with-text', 'Summarize this: "The project is delayed by two days because testing found a defect."'],
  ['code-with-snippet', 'Fix this JavaScript code: const title = user.name.toUpperCase();'],
  ['code-create', 'Create a Python script that renames all PDF files by date.'],
  ['web-price', 'What is the current price of a first-class stamp in Germany?'],
  ['web-quoted-word', 'Explain the phrase "open today" in this customer message.'],
  ['send-email', 'Send an email to my landlord asking for a repair.'],
  ['make-reservation', 'Make a restaurant reservation for tonight.'],
  ['german-external', 'Vereinbare einen Termin beim Zahnarzt für morgen.'],
  ['german-translation', 'Übersetze "Bitte sende die Rechnung heute" ins Englische.'],
  ['german-code-howto', 'Wie drehe ich ein Array in JavaScript um?'],
  ['german-summary-missing', 'Fasse den Bericht zusammen.'],
  ['long-clear-question', 'Can you explain in plain language why my electricity bill rose this month even though I used less power than last month?']
];

function words(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

const summary = { helps: {}, frames: {}, expandedQuestions: [], unchanged: [] };
cases.forEach(([name, text]) => {
  const lang = E.detectLanguage(text, 'en');
  const archetype = E.detectArchetype(text);
  const goal = E.detectGoal(text, archetype);
  const built = E.buildPrompt({
    text,
    lang,
    archetype,
    goal,
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
    improve: false,
    improveExplicit: false,
    sources: false,
    ignoreMemory: false,
    force: false,
    lean: false,
    ask: false
  });
  const inputWords = words(text);
  const outputWords = words(built.prompt);
  const ratio = inputWords ? outputWords / inputWords : 0;
  summary.helps[built.helps] = (summary.helps[built.helps] || 0) + 1;
  summary.frames[built.frame] = (summary.frames[built.frame] || 0) + 1;
  if ((goal === 'answer' || goal === 'guidance') && ratio > 2) {
    summary.expandedQuestions.push(name);
  }
  if (built.asIs) summary.unchanged.push(name);
  console.log(JSON.stringify({
    name,
    lang,
    archetype,
    goal,
    helps: built.helps,
    why: built.why,
    frame: built.frame,
    asIs: built.asIs,
    inputWords,
    outputWords,
    ratio: Number(ratio.toFixed(1)),
    preview: built.prompt.slice(0, 90)
  }));
});
console.log(JSON.stringify(summary));