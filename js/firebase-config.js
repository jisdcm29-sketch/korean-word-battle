// Firebase configuration for korean-word-battle
// Realtime Database: Singapore (asia-southeast1)
export const firebaseConfig = {
  apiKey: "AIzaSyB4yd3ADpBjpUYxNEAzGJCCLfXj_2sGYqY",
  authDomain: "korean-word-battle.firebaseapp.com",
  databaseURL: "https://korean-word-battle-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "korean-word-battle",
  storageBucket: "korean-word-battle.firebasestorage.app",
  messagingSenderId: "454572227296",
  appId: "1:454572227296:web:34c86b0f594e80182e2e85"
};

export function isFirebaseConfigured() {
  const required = ["apiKey", "authDomain", "databaseURL", "projectId", "appId"];
  return required.every((key) => {
    const value = String(firebaseConfig[key] || "").trim();
    return value && !value.includes("PASTE_");
  });
}
