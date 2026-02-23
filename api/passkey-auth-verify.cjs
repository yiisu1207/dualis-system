const { getAuth, getDb } = require('./_firebaseAdmin.cjs');
const { verifyAuthenticationResponse } = require('@simplewebauthn/server');

function getRpId(req) {
  const envRpId = process.env.PASSKEY_RP_ID;
  if (envRpId) return envRpId;
  const host = req.headers.host || '';
  return host.split(':')[0];
}

function getOrigin(req) {
  const envOrigin = process.env.PASSKEY_ORIGIN;
  if (envOrigin) return envOrigin;
  return req.headers.origin || `http://${req.headers.host}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const db = getDb();
    const auth = getAuth();
    const { assertionResponse, challengeId } = req.body || {};
    if (!assertionResponse || !challengeId) {
      return res.status(400).json({ error: 'Missing assertionResponse or challengeId' });
    }

    const challengeDoc = await db.collection('passkeyChallenges').doc(challengeId).get();
    if (!challengeDoc.exists) {
      return res.status(400).json({ error: 'Challenge not found' });
    }

    const expectedChallenge = challengeDoc.data().challenge;
    const credentialId = assertionResponse.id;

    const credDoc = await db.collection('passkeys').doc(credentialId).get();
    if (!credDoc.exists) {
      return res.status(400).json({ error: 'Credential not registered' });
    }

    const credData = credDoc.data();
    const publicKey = Buffer.from(credData.publicKey, 'base64url');

    const verification = await verifyAuthenticationResponse({
      response: assertionResponse,
      expectedChallenge,
      expectedOrigin: getOrigin(req),
      expectedRPID: getRpId(req),
      authenticator: {
        credentialID: Buffer.from(credentialId, 'base64url'),
        credentialPublicKey: publicKey,
        counter: credData.counter || 0,
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      return res.status(400).json({ error: 'Verification failed' });
    }

    await db.collection('passkeys').doc(credentialId).update({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date().toISOString(),
    });

    await db.collection('passkeyChallenges').doc(challengeId).delete();

    const customToken = await auth.createCustomToken(credData.userId);
    return res.json({ token: customToken });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to verify authentication' });
  }
};
