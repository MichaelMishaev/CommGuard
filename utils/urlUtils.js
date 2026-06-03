'use strict';

const URL_REGEX = /https?:\/\/[^\s<>"]+/gi;

/**
 * extractPreviewUrls(rawMsg)
 *
 * Reads rawMsg?.message?.extendedTextMessage?.matchedText and
 * rawMsg?.message?.extendedTextMessage?.canonicalUrl, extracts all
 * https?://... URLs from each field, and returns a deduplicated array.
 *
 * Never throws — returns [] on any null/undefined/missing path.
 * Pure function: no side effects, no I/O.
 *
 * @param {object|null|undefined} rawMsg - the raw Baileys message object
 * @returns {string[]} deduplicated array of URLs found in preview fields
 */
function extractPreviewUrls(rawMsg) {
    try {
        const ext = rawMsg?.message?.extendedTextMessage;
        if (!ext) return [];

        const seen = new Set();
        const urls = [];

        for (const field of [ext.matchedText, ext.canonicalUrl]) {
            if (typeof field !== 'string') continue;
            const matches = field.match(URL_REGEX) || [];
            for (const url of matches) {
                if (!seen.has(url)) {
                    seen.add(url);
                    urls.push(url);
                }
            }
        }

        return urls;
    } catch {
        return [];
    }
}

module.exports = { extractPreviewUrls };
