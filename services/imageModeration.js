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
            model: 'gpt-5-mini',
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: 'You are a content moderation system for a children\'s WhatsApp group. Analyze this image strictly. Respond ONLY with valid JSON, no other text:\n{"verdict":"SAFE","confidence":<1-10>,"reason":"<max 8 words>"}\nverdict must be one of: SAFE, NSFW_SEXUAL, NSFW_VIOLENT, OFFENSIVE'
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
