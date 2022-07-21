import * as functions from "firebase-functions";
import * as firestore from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { threadutils } from "./utils/utils"

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

admin.initializeApp();
const db = firestore.getFirestore();

interface Thread {
    create_time: firestore.Timestamp,
    new_create: boolean,
    members: { [key: string]: boolean}
}

const converter = {
  toFirestore: (data: Thread) => data,
  fromFirestore: (snap: FirebaseFirestore.QueryDocumentSnapshot) =>
      snap.data() as Thread,
};

export const createThread = functions.https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  functions.logger.log("uid is", uid);
  if (!(typeof uid === "string") || uid.length === 0 ) {
    throw new functions.https.HttpsError("failed-precondition",
        "The createThread must be called for a login user");
  }
  const friendEmail = data.email;
  if (!(typeof friendEmail === "string") || friendEmail.length === 0 ) {
    throw new functions.https.HttpsError("invalid-argument",
        "email is not valid");
  }
  const friendUid = (await admin.auth().getUserByEmail(friendEmail)).uid as string;
  const result = await db.collection("threads")
      .where(`members.${uid}`, "==", true)
      .where(`members.${friendUid}`, "==", true)
      .withConverter(converter)
      .get();
  if (!result.empty) {
    const ref = result.docs[0];
    const existingThread = ref.data();

    return {
      id: ref.id,
      create_time: existingThread.create_time,
      new_create: false,
      members: existingThread.members,
    };
  }
  try {
    const memberGroup = threadutils.createMemberGroup(uid, friendUid);
    const newData = <Thread>{
      create_time: firestore.FieldValue.serverTimestamp(),
      members: memberGroup,
    };
    const ref = await db.collection("threads").add(newData);
    const doc = await ref.get();
    const newThread = doc.data() as Thread;
    return {
      id: ref.id,
      create_time: newThread.create_time,
      new_create: true,
      members: newThread.members,
    };
  } catch (errr) {
    throw new functions.https.HttpsError("not-found", "email does not exist");
  }
});
