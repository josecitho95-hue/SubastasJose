import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyD3zQOMhfiyJES3ASraklxqY8aGcyLAwYc",
  authDomain: "subastasgeek.firebaseapp.com",
  projectId: "subastasgeek",
  storageBucket: "subastasgeek.firebasestorage.app",
  messagingSenderId: "360011789521",
  appId: "1:360011789521:web:a88beee1a03266309281f0",
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
export const firebaseAuth = getAuth(app)
