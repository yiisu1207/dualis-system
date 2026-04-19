const { getDb } = require('./_firebaseAdmin');
const { generateAuthenticationOptions } = require('@simplewebauthn/server');
const crypto = require('crypto');

function getRpId(req) {
  const envRpId = process.env.PASSKEY_RP_ID;
  if (envRpId) return envRpId;
  const host = req.headers.host || '';
  return host.split(':')[0];
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const db = getDb();
    const options = await generateAuthenticationOptions({
      rpID: getRpId(req),
      userVerification: 'preferred',
    });

    const challengeId = crypto.randomUUID();
    const now = Date.now();
    await db.collection('passkeyChallenges').doc(challengeId).set({
      challenge: options.challenge,
      type: 'authentication',
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
    });

    return res.json({ options, challengeId });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to create authentication options' });
  }
};
