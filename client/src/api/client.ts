import ky from 'ky';

const ACCESS_TOKEN_KEY = 'accessToken';

let accessToken: string | null = null;
let refreshPromise: Promise<void> | null = null;

// Restore from localStorage on module load
try { accessToken = localStorage.getItem(ACCESS_TOKEN_KEY); } catch {}

export function setTokens(access: string) {
  accessToken = access;
  try { localStorage.setItem(ACCESS_TOKEN_KEY, access); } catch {}
}

export function clearTokens() {
  accessToken = null;
  try { localStorage.removeItem(ACCESS_TOKEN_KEY); } catch {}
}

export function getAccessToken(): string | null {
  return accessToken;
}

// Sync access token across tabs via storage event
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === ACCESS_TOKEN_KEY) {
      accessToken = e.newValue;
    }
  });
}

async function refreshAccessToken(): Promise<void> {
  try {
    const response = await ky.post('/api/auth/refresh', { credentials: 'include' }).json<{ accessToken: string }>();
    setTokens(response.accessToken);
  } catch {
    clearTokens();
    window.location.href = '/login';
  }
}

export const api = ky.create({
  prefixUrl: '/',
  credentials: 'include',
  hooks: {
    beforeRequest: [
      (request) => {
        if (accessToken) {
          request.headers.set('Authorization', `Bearer ${accessToken}`);
        }
      },
    ],
    afterResponse: [
      async (request, _options, response) => {
        if (response.status === 401 && !request.url.includes('/api/auth/')) {
          if (!refreshPromise) {
            refreshPromise = refreshAccessToken().finally(() => {
              refreshPromise = null;
            });
          }
          await refreshPromise;

          if (accessToken) {
            request.headers.set('Authorization', `Bearer ${accessToken}`);
            return ky(request);
          }
        }
        return response;
      },
    ],
  },
});
