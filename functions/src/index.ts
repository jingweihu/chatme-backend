import * as functions from "firebase-functions";
import * as firestore from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import {threadutils} from "./utils/utils";
import {UserRecord} from "firebase-functions/v1/auth";
import {auth} from "firebase-admin";

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
    create_at: firestore.Timestamp,
    new_create: boolean,
    members: { [key: string]: boolean}
}

interface Message {
    create_at: firestore.Timestamp,
    message: string,
    sender_id: string,
    type: string
}

const threadConverter = {
  toFirestore: (data: Thread) => data,
  fromFirestore: (snap: FirebaseFirestore.QueryDocumentSnapshot) =>
      snap.data() as Thread,
};

const messageConverter = {
  toFirestore: (data: Message) => data,
  fromFirestore: (snap: FirebaseFirestore.QueryDocumentSnapshot) =>
        snap.data() as Message,
};

export const createThread = functions.https.onCall(async (data, context) => {
  const uid = context.auth?.uid as string;
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
      .withConverter(threadConverter)
      .get();
  if (!result.empty) {
    const ref = result.docs[0];
    const existingThread = ref.data();

    return {
      id: ref.id,
      create_at: existingThread.create_at,
      new_create: false,
      members: existingThread.members,
    };
  }
  try {
    const memberGroup = threadutils.createMemberGroup(uid, friendUid);
    const newData = <Thread>{
      create_at: firestore.FieldValue.serverTimestamp(),
      members: memberGroup,
    };
    const ref = await db.collection("threads").add(newData);
    const doc = await ref.get();
    const newThread = doc.data() as Thread;
    return {
      id: ref.id,
      create_at: newThread.create_at,
      new_create: true,
      members: newThread.members,
    };
  } catch (errr) {
    throw new functions.https.HttpsError("not-found", "email does not exist");
  }
});


export const getThreadInfo = functions.https.onCall(async (data, context) => {
  const threadId = data.thread_id as string;
  const threadRef = await db.collection("threads").doc(threadId);
  const thread = (await threadRef.get()).data() as Thread;

  const members: UserRecord[] = [];
  for (const uid in thread.members) {
    if (uid != null) {
      const record = await auth().getUser(uid);
      members.push(record);
    }
  }
  const query = await db.collection("threads")
      .doc(threadRef.id)
      .collection("messages")
      .orderBy("create_at", "desc")
      .limitToLast(1)
      .withConverter(messageConverter)
      .get();

  let message : Message | null;
  if (!query.empty) {
    const ref = query.docs[0];
    message = ref.data();
  } else {
    message = null;
  }
  return {
    id: threadRef.id,
    create_at: thread.create_at,
    members: members,
    last_message: message,
  };
});


