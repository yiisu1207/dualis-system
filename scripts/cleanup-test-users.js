import admin from 'firebase-admin';
import fs from 'fs';
const serviceAccount = JSON.parse(fs.readFileSync(new URL('../serviceAccount.json', import.meta.url)));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const PROTECTED_EMAIL = 'yisus_xd77@hotmail.com';

async function deleteUserAndDoc(user) {
  await admin.auth().deleteUser(user.uid);
  await db.collection('users').doc(user.uid).delete();
}

async function main() {
  let nextPageToken = undefined;
  let deletedCount = 0;
  let protectedFound = false;

  do {
    const result = await admin.auth().listUsers(1000, nextPageToken);
    for (const user of result.users) {
      if (user.email && user.email.toLowerCase() === PROTECTED_EMAIL.toLowerCase()) {
        protectedFound = true;
        continue;
      }
      await deleteUserAndDoc(user);
      deletedCount += 1;
    }
    nextPageToken = result.pageToken;
  } while (nextPageToken);

  console.log(`Usuarios eliminados: ${deletedCount}`);
  console.log(`Cuenta protegida intacta: ${protectedFound ? 'SI' : 'NO'}`);
}

main().catch((error) => {
  console.error('Error en limpieza de usuarios:', error);
  process.exit(1);
});
