const { getAuth, getDb } = require('./_firebaseAdmin');
const { verifyRegistrationResponse } = require('@simplewebauthn/server');

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
    const token = req.headers.authorization?.replace('Bearer ', '') || '';
    if (!token) return res.status(401).json({ error: 'Missing token' });
    const auth = getAuth();
    const db = getDb();
    const decoded = await auth.verifyIdToken(token);
    const { attestationResponse, deviceName } = req.body || {};
    if (!attestationResponse) {
      return res.status(400).json({ error: 'Missing attestationResponse' });
    }

    const challengeDoc = await db.collection('passkeyChallenges').doc(`${decoded.uid}_reg`).get();
    if (!challengeDoc.exists) {
      return res.status(400).json({ error: 'Challenge not found' });
    }

    const expectedChallenge = challengeDoc.data().challenge;

    const verification = await verifyRegistrationResponse({
      response: attestationResponse,
      expectedChallenge,
      expectedOrigin: getOrigin(req),
      expectedRPID: getRpId(req),
      requireUserVerification: false,
    });

    if (!verification.verified) {
      return res.status(400).json({ error: 'Verification failed' });
    }

    const { registrationInfo } = verification;
    const credentialId = registrationInfo.credentialID;
    const credentialPublicKey = registrationInfo.credentialPublicKey;
    const counter = registrationInfo.counter;

    const credentialIdBase64 = Buffer.from(credentialId).toString('base64url');
    const publicKeyBase64 = Buffer.from(credentialPublicKey).toString('base64url');

    await db.collection('passkeys').doc(credentialIdBase64).set({
      userId: decoded.uid,
      publicKey: publicKeyBase64,
      counter,
      transports: attestationResponse.transports || [],
      deviceName: deviceName || 'Llave de acceso',
      createdAt: new Date().toISOString(),
    });

    await db.collection('passkeyChallenges').doc(`${decoded.uid}_reg`).delete();

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to verify registration' });
  }
};
