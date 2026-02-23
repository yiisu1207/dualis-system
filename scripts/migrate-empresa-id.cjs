const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccount.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function migrateCollection(collectionName, empresaId) {
  const snap = await db.collection(collectionName).get();
  let batch = db.batch();
  let count = 0;

  snap.forEach((doc) => {
    const data = doc.data();
    if (!data.empresa_id) {
      batch.set(doc.ref, { empresa_id: empresaId }, { merge: true });
      count += 1;
    }
    if (count > 0 && count % 400 === 0) {
      batch.commit();
      batch = db.batch();
    }
  });

  if (count % 400 !== 0) {
    await batch.commit();
  }

  console.log(`[${collectionName}] actualizado: ${count}`);
}

async function main() {
  const empresaId = 'generica';
  await migrateCollection('productos', empresaId);
  await migrateCollection('clientes', empresaId);
  await migrateCollection('ventas', empresaId);
  console.log('Migracion completada.');
}

main().catch((error) => {
  console.error('Error en migracion:', error);
  process.exit(1);
});
