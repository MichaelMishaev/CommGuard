/**
 * utils/languageUtils.js
 * Pure language-detection utilities — zero API calls, zero dependencies.
 */

'use strict';

/**
 * Returns true if text contains any Cyrillic character in the range Ѐ–ӿ (U+0400–U+04FF).
 * Uses RegExp.test() — exits on first match.
 * @param {string} text
 * @returns {boolean}
 */
function isRussian(text) {
    if (!text || typeof text !== 'string') return false;
    return /[Ѐ-ӿ]/.test(text);
}

module.exports = { isRussian };
