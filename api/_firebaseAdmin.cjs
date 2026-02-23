const admin = require('firebase-admin');

let app;

function initAdmin() {
  if (app) return app;
  if (admin.apps && admin.apps.length > 0) {
    app = admin.app();
    return app;
  }

  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountRaw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT not configured');
  }

  const serviceAccount = JSON.parse(serviceAccountRaw);
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  return app;
}

function getAuth() {
  initAdmin();
  return admin.auth();
}

function getDb() {
  initAdmin();
  return admin.firestore();
}

module.exports = {
  getAuth,
  getDb,
};
