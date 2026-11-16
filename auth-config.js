/**
 * Firebase Auth config for Capacitor / web.
 * Fill firebase.* from Firebase Console → Project settings.
 * Enable Authentication providers: Google, Apple.
 * iOS: add GoogleService-Info.plist to ios/App/App/; Android: google-services.json.
 * Bundle / applicationId must match Capacitor appId: com.notessprite.musicapp
 *
 * enabled: true → native iOS/Android gate with Google (Apple kept for App Store 4.8).
 * requireOnNativeOnly: true → native keeps Firebase/Apple; the website uses Google Identity Services below.
 *
 * Web (https://musiceducation.github.io/noteschallenge/):
 *   googleClientId  Web OAuth client id from Google Cloud Console.
 *                   Authorized JavaScript origin: https://musiceducation.github.io
 *   authApiBase     Cloudflare Worker origin, no trailing path (e.g. https://noteschallenge-auth.<account>.workers.dev)
 * Placeholder values keep the sign-in screen up until a teacher fills them in.
 */
window.MUSIC_APP_AUTH = {
  enabled: true,
  requireOnNativeOnly: true,
  appleSignInEnabled: true,
  firestoreCollection: 'players',
  googleClientId: 'YOUR_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com',
  authApiBase: 'https://noteschallenge-auth.example.workers.dev',
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  }
};
