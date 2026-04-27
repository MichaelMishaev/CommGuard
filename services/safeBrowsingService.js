const https = require('https');
const config = require('../config');

const THREAT_TYPES = [
    'MALWARE',
    'SOCIAL_ENGINEERING',
    'UNWANTED_SOFTWARE',
    'POTENTIALLY_HARMFUL_APPLICATION',
];

async function checkUrl(url) {
    const apiKey = config.GOOGLE_SAFE_BROWSING_API_KEY;
    if (!apiKey) return { safe: null, label: '❓ Unknown (no API key configured)' };

    const body = JSON.stringify({
        client: { clientId: 'commguard', clientVersion: '1.0' },
        threatInfo: {
            threatTypes: THREAT_TYPES,
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url }],
        },
    });

    return new Promise((resolve) => {
        const req = https.request(
            {
                hostname: 'safebrowsing.googleapis.com',
                path: `/v4/threatMatches:find?key=${apiKey}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                },
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.matches && json.matches.length > 0) {
                            const types = [...new Set(json.matches.map((m) => m.threatType))].join(', ');
                            resolve({ safe: false, label: `⚠️ DANGEROUS — ${types}` });
                        } else {
                            resolve({ safe: true, label: '✅ Safe (Google Safe Browsing)' });
                        }
                    } catch {
                        resolve({ safe: null, label: '❓ Unknown (parse error)' });
                    }
                });
            }
        );
        req.on('error', () => resolve({ safe: null, label: '❓ Unknown (API unavailable)' }));
        req.setTimeout(4000, () => {
            req.destroy();
            resolve({ safe: null, label: '❓ Unknown (timeout)' });
        });
        req.write(body);
        req.end();
    });
}

module.exports = { checkUrl };
