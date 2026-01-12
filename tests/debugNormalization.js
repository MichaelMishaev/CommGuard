const lexiconService = require('../services/bullywatch/lexiconService');

// Test normalization
const testWords = [
  'זין',
  'חתיכת זין',
  'כוסאמק',
  'שמע ראיתי בסרט חתיכת זין כמוך מטייל שם'
];

console.log('Testing Hebrew normalization:\n');

for (const word of testWords) {
  const normalized = lexiconService.normalizeHebrew(word);
  console.log(`Original:    "${word}"`);
  console.log(`Normalized:  "${normalized}"`);
  console.log('');
}
