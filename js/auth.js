// SHA-256 hex digest of the access code.
// To change: open your browser console and run:
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourpassword'))
//     .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
// Replace the string below, commit, and redeploy.
const ACCESS_CODE_HASH = 'addb0f5e7826c857d7376d1bd9bc33c0c544790a2eac96144a8af22b1298c940';

const SESSION_KEY = 'speech2recipe:auth';

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function isAuthenticated() {
  return sessionStorage.getItem(SESSION_KEY) === ACCESS_CODE_HASH;
}

export async function authenticate(code) {
  const hash = await sha256hex(code);
  if (hash === ACCESS_CODE_HASH) {
    sessionStorage.setItem(SESSION_KEY, ACCESS_CODE_HASH);
    return true;
  }
  return false;
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY);
}
