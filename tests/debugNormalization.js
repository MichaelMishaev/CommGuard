// Debug normalization to see what's happening
const lexiconService = require('../services/bullywatch/lexiconService');

const tests = [
    'אתה מת',
    'אונס מהנה',
    'אני מתאבד'
];

console.log('Normalization Debug:\n');
tests.forEach(text => {
    const normalized = lexiconService.normalizeHebrew(text);
    console.log(`Original:    "${text}"`);
    console.log(`Normalized:  "${normalized}"`);
    console.log('');
});
