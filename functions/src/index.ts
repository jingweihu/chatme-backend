import * as functions from "firebase-functions";
import * as firestore from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import {threadutils} from "./utils/utils";

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
    threadId: string,
    createAt: firestore.Timestamp,
    members: { [key: string]: boolean}
    lastMessage: Message | null
}

interface Message {
    messageId: string,
    createAt: firestore.Timestamp,
    message: string,
    senderId: string,
    type: string
}

interface User {
   email: string | null,
   displayName: string | null,
   photoURL: string | null,
   uid: string
}

const threadConverter = {
  toFirestore: (data: Thread) => data,
  fromFirestore: (snap: FirebaseFirestore.QueryDocumentSnapshot) =>
      snap.data() as Thread,
};

export const createThread = functions.https.onCall(async (data, context) => {
  const uid = (context.auth?.uid ?? data.uid) as string;
  if (!(typeof uid === "string") || uid.length === 0 ) {
    throw new functions.https.HttpsError("failed-precondition",
        "The user needs login again");
  }
  const friendEmail = data.email;
  if (!(typeof friendEmail === "string") || friendEmail.length === 0 ) {
    throw new functions.https.HttpsError("invalid-argument",
        "email is not valid");
  }
  let friendUid: string;
  try {
    friendUid = (await admin.auth().getUserByEmail(friendEmail)).uid;
  } catch (errr) {
    throw new functions.https.HttpsError("not-found", "email does not exist");
  }
  const result = await db.collection("threads")
      .where(`members.${uid}`, "==", true)
      .where(`members.${friendUid}`, "==", true)
      .withConverter(threadConverter)
      .get();
  if (!result.empty) {
    throw new functions.https.HttpsError("already-exists",
        `You already has a thread with ${friendEmail}`);
  }
  const ref = db.collection("threads").doc();
  const memberGroup = threadutils.createMemberGroup(uid, friendUid);
  const newData = <Thread>{
    createAt: firestore.FieldValue.serverTimestamp(),
    members: memberGroup,
    threadId: ref.id,
    lastMessage: null,
  };
  await db.collection("threads").doc(ref.id).set(newData);

  return JSON.stringify({
    threadId: ref.id,
  });
});

export const getThreadInfo = functions.https.onCall(async (data, context) => {
  const threadId = data.threadId as string;
  const threadRef = db.collection("threads").doc(threadId);
  const thread = (await threadRef.get()).data() as Thread;

  const members: User[] = [];
  for (const uid in thread.members) {
    if (uid != null) {
      const record = (await db.collection("users").doc(uid).get()).data() as User;
      members.push(record);
    }
  }

  return {
    threadId: threadRef.id,
    createAt: thread.createAt,
    members: members,
    lastMessage: thread.lastMessage,
  };
});


export const messageSent = functions.firestore
    .document("/threads/{threadId}/messages/{messageId}")
    .onCreate((change, context) => {
      const lastMessage = change.data();
      db.collection("threads").doc(context.params.threadId).update({
        lastMessage: lastMessage,
      });
    });

export const onUserCreate = functions.auth.user().onCreate((user) => {
  const data: User = {
    uid: user.uid,
    displayName: user.displayName !== undefined ? user.displayName : "",
    email: user.email !== undefined ? user.email : "",
    photoURL: user.photoURL !== undefined ? user.photoURL : "",
  };

  db.collection("users")
      .doc(user.uid).set(data);
});
