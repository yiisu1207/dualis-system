const { getAuth } = require('./_firebaseAdmin.cjs');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || '';
    if (!token) {
      return res.status(401).json({ error: 'Missing token' });
    }
    const auth = getAuth();
    const decoded = await auth.verifyIdToken(token);
    await auth.revokeRefreshTokens(decoded.uid);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to revoke sessions' });
  }
};
