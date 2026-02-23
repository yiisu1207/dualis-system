const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccount.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function printOneDoc(collectionName) {
  const snap = await db.collection(collectionName).limit(1).get();
  if (snap.empty) {
    console.log(`[${collectionName}] no documents found.`);
    return null;
  }
  const docSnap = snap.docs[0];
  console.log(`\n[${collectionName}] sample doc id: ${docSnap.id}`);
  console.log(docSnap.data());
  return docSnap;
}

async function main() {
  const customerDoc = await printOneDoc('customers');
  const businessDoc = await printOneDoc('businesses');

  if (!businessDoc) {
    console.log('\n[businesses] no document to inspect subcollections.');
    return;
  }

  const subcollections = await businessDoc.ref.listCollections();
  if (subcollections.length === 0) {
    console.log('\n[businesses] no subcollections found on sample doc.');
    return;
  }

  console.log('\n[businesses] subcollections:');
  subcollections.forEach((col) => console.log(`- ${col.id}`));

  const firstSub = subcollections[0];
  const subSnap = await firstSub.limit(1).get();
  if (subSnap.empty) {
    console.log(`\n[${firstSub.id}] no documents found.`);
    return;
  }
  const subDoc = subSnap.docs[0];
  console.log(`\n[${firstSub.id}] sample doc id: ${subDoc.id}`);
  console.log(subDoc.data());
}

main().catch((error) => {
  console.error('Error exploring legacy data:', error);
  process.exit(1);
});
