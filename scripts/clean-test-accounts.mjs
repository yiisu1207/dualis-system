// Elimina TODOS los usuarios de Firebase Auth + sus docs en Firestore
// Conserva la cuenta del super admin
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const env   = readFileSync(resolve(__dir, '../.env.local'), 'utf8');
const match = env.match(/FIREBASE_SERVICE_ACCOUNT='(.+?)'/s);
if (!match) { console.error('No se encontró FIREBASE_SERVICE_ACCOUNT en .env.local'); process.exit(1); }

const serviceAccount = JSON.parse(match[1]);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const auth = admin.auth();
const db   = admin.firestore();

const KEEP = ['yisus_xd77@hotmail.com']; // super admin — NO se elimina

async function run() {
  // 1. Listar todos los usuarios
  let allUsers = [];
  let pageToken;
  do {
    const result = await auth.listUsers(1000, pageToken);
    allUsers.push(...result.users);
    pageToken = result.pageToken;
  } while (pageToken);

  const toDelete = allUsers.filter(u => !KEEP.includes(u.email ?? ''));
  console.log(`Total usuarios: ${allUsers.length}`);
  console.log(`Conservando: ${KEEP.join(', ')}`);
  console.log(`Eliminando: ${toDelete.length} cuentas\n`);

  if (toDelete.length === 0) { console.log('Nada que eliminar.'); process.exit(0); }

  // 2. Mostrar lista antes de borrar
  for (const u of toDelete) {
    console.log(`  - ${u.email ?? '(sin email)'} | uid: ${u.uid}`);
  }

  // 3. Eliminar de Firebase Auth (en lotes de 100)
  const uids = toDelete.map(u => u.uid);
  for (let i = 0; i < uids.length; i += 100) {
    const batch = uids.slice(i, i + 100);
    const res = await auth.deleteUsers(batch);
    console.log(`\nAuth: eliminados ${res.successCount}, errores ${res.failureCount}`);
    if (res.errors.length) res.errors.forEach(e => console.error('  Error:', e.error.message));
  }

  // 4. Eliminar docs de Firestore: users/{uid} y businesses/{businessId}
  const fsWriter = db.batch();
  let batchCount = 0;

  for (const u of toDelete) {
    // users/{uid}
    const userRef = db.collection('users').doc(u.uid);
    const userSnap = await userRef.get();
    if (userSnap.exists) {
      const bid = userSnap.data().businessId || userSnap.data().empresa_id;
      fsWriter.delete(userRef);
      batchCount++;

      // businesses/{bid}
      if (bid) {
        fsWriter.delete(db.collection('businesses').doc(bid));
        batchCount++;
      }
    }

    // Commit cada 400 ops para no exceder el límite de 500
    if (batchCount >= 400) {
      await fsWriter.commit();
      batchCount = 0;
    }
  }
  if (batchCount > 0) await fsWriter.commit();

  console.log('\nFirestore: documentos eliminados.');
  console.log('\nListo. Todas las cuentas de prueba han sido eliminadas.');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
