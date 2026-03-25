import ky from 'ky';

let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshPromise: Promise<void> | null = null;

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  localStorage.setItem('refreshToken', refresh);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('refreshToken');
}

export function getStoredRefreshToken(): string | null {
  return refreshToken || localStorage.getItem('refreshToken');
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function refreshAccessToken(): Promise<void> {
  const rt = getStoredRefreshToken();
  if (!rt) {
    clearTokens();
    window.location.href = '/login';
    return;
  }

  try {
    const response = await ky.post('/api/auth/refresh', {
      json: { refreshToken: rt },
    }).json<{ accessToken: string; refreshToken: string }>();

    setTokens(response.accessToken, response.refreshToken);
  } catch {
    clearTokens();
    window.location.href = '/login';
  }
}

export const api = ky.create({
  prefixUrl: '/',
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
