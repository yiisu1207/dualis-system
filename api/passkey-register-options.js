const { getAuth, getDb } = require('./_firebaseAdmin');
const {
  generateRegistrationOptions,
} = require('@simplewebauthn/server');

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
    const token = req.headers.authorization?.replace('Bearer ', '') || '';
    if (!token) return res.status(401).json({ error: 'Missing token' });
    const auth = getAuth();
    const db = getDb();
    const decoded = await auth.verifyIdToken(token);

    const passkeySnap = await db
      .collection('passkeys')
      .where('userId', '==', decoded.uid)
      .get();

    const excludeCredentials = passkeySnap.docs.map((doc) => ({
      id: doc.id,
      type: 'public-key',
    }));

    const options = await generateRegistrationOptions({
      rpName: 'Erp System',
      rpID: getRpId(req),
      userID: decoded.uid,
      userName: decoded.email || decoded.uid,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      excludeCredentials,
    });

    await db.collection('passkeyChallenges').doc(`${decoded.uid}_reg`).set({
      challenge: options.challenge,
      type: 'registration',
      createdAt: new Date().toISOString(),
    });

    return res.json({ options });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to create registration options' });
  }
};
