import ky, { HTTPError } from 'ky';

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
  } catch (err) {
    if (err instanceof HTTPError && err.response.status === 401) {
      // Refresh token is invalid or expired — genuine logout
      clearTokens();
      window.location.href = '/login';
    }
    // For network errors, 5xx, 429, etc. — rethrow without clearing tokens.
    // The triggering request will fail but the session stays intact.
    throw err;
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
          try {
            await refreshPromise;
          } catch {
            // Transient error (network, 5xx, rate limit) — return the 401 to the
            // caller rather than propagating. Session is still valid; next request
            // will retry the refresh.
            return response;
          }

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
