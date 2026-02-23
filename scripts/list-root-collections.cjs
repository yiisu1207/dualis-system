const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccount.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function main() {
  const collections = await admin.firestore().listCollections();
  if (collections.length === 0) {
    console.log('No root collections found.');
    return;
  }
  console.log('Root collections:');
  collections.forEach((col) => console.log(`- ${col.id}`));
}

main().catch((error) => {
  console.error('Error listing collections:', error);
  process.exit(1);
});
