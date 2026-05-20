/**
 * Image Moderation Service
 * Uses GPT-5-mini vision (low-detail) to detect sexual/violent/offensive images.
 * Fail-open: any error returns SAFE to avoid blocking legitimate images.
 */

const OpenAI = require('openai');

let openaiClient = null;

function getOpenAI() {
    if (!openaiClient) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY not set');
        openaiClient = new OpenAI({ apiKey });
    }
    return openaiClient;
}

/**
 * Analyze an image buffer for sexual, violent, or offensive content.
 * @param {Buffer} imageBuffer
 * @returns {Promise<{verdict: 'SAFE'|'NSFW_SEXUAL'|'NSFW_VIOLENT'|'OFFENSIVE', confidence: number, reason: string}>}
 */
async function analyzeImage(imageBuffer) {
    try {
        const openai = getOpenAI();
        const base64 = imageBuffer.toString('base64');

        // Detect MIME type from magic bytes (WhatsApp sends JPEG, but handle PNG/WebP too)
        let mimeType = 'image/jpeg';
        if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) mimeType = 'image/png';
        else if (imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49) mimeType = 'image/webp';
        else if (imageBuffer[0] === 0x47 && imageBuffer[1] === 0x49) mimeType = 'image/gif';

        const response = await openai.chat.completions.create({
            model: 'gpt-5.4-nano',
            messages: [
                {
                    role: 'system',
                    content: `You are a strict content safety classifier for a children's WhatsApp group (ages 10-15).

CLASSIFICATION RULES — apply these exactly:
- NSFW_SEXUAL: ANY visible genitalia, penis, vagina, breasts, bare buttocks, sexual acts, or sexual nudity — confidence 9-10. Suggestive/sexual poses or partial nudity — confidence 7-8. When in doubt about nudity → NSFW_SEXUAL, never SAFE.
- NSFW_VIOLENT: Graphic violence, gore, blood, weapons aimed at people — confidence 8-10.
- OFFENSIVE: Hate symbols, extreme offensive content — confidence 8-10.
- SAFE: Everything else (clothed people, nature, food, animals, text, screenshots).

Respond ONLY with valid JSON, no other text: {"verdict":"SAFE","confidence":<1-10>,"reason":"<max 8 words>"}`
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: 'Classify this image.'
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${mimeType};base64,${base64}`,
                                detail: 'low'
                            }
                        }
                    ]
                }
            ],
            max_completion_tokens: 100,
        }, { timeout: 5000 });

        const content = response.choices[0]?.message?.content || '';
        // Strip markdown code blocks if model wraps response
        const cleaned = content.replace(/```json?\n?|\n?```/g, '').trim();
        const result = JSON.parse(cleaned);
        return {
            verdict: result.verdict || 'SAFE',
            confidence: typeof result.confidence === 'number' ? result.confidence : 0,
            reason: result.reason || 'unknown'
        };
    } catch (error) {
        console.error('[ImageModeration] Error:', error.message);
        return { verdict: 'SAFE', confidence: 0, reason: 'analysis error' };
    }
}

module.exports = { analyzeImage };
