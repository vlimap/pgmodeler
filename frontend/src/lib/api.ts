const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error('VITE_API_BASE_URL não definido. Configure a URL da API no arquivo .env');
}

type FetchOptions = RequestInit & { parse?: boolean };

async function request<T = any>(path: string, options: FetchOptions = {}): Promise<T> {
  const { parse = true, headers, ...rest } = options;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
    ...rest,
  });

  if (!parse) {
    return undefined as unknown as T;
  }

  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    const message = data?.error || 'Erro ao comunicar com o servidor.';
    throw new Error(message);
  }
  return data as T;
}

export type ApiProject = {
  id: string;
  name: string;
  modelJson: unknown;
  createdAt: string;
  updatedAt: string;
};

export type ApiUser = {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  githubId: string;
  marketingOptIn: boolean;
  marketingConsentAt: string | null;
};

export const api = {
  baseUrl: API_BASE_URL,
  loginUrl: `${API_BASE_URL}/api/auth/github`,
  async fetchCurrentUser(): Promise<ApiUser | null> {
    const data = await request<{ user: ApiUser | null }>('/api/me');
    return data.user;
  },
  async logout(): Promise<void> {
    await request('/api/auth/logout', { method: 'POST', parse: false });
  },
  async listProjects(): Promise<ApiProject[]> {
    const data = await request<ApiProject[] | { projects?: ApiProject[] }>('/api/projects');
    if (Array.isArray(data)) {
      return data;
    }
    if (data && Array.isArray(data.projects)) {
      return data.projects;
    }
    return [];
  },
  async createProject(payload: { name: string; modelJson: unknown }): Promise<ApiProject> {
    return await request<ApiProject>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  async updateProject(id: string, payload: { name?: string; modelJson?: unknown }): Promise<ApiProject> {
    return await request<ApiProject>(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  async deleteProject(id: string): Promise<void> {
    await request(`/api/projects/${id}`, { method: 'DELETE', parse: false });
  },
  async updateMarketingConsent(marketingOptIn: boolean): Promise<{ marketingOptIn: boolean; marketingConsentAt: string }>{
    return await request('/api/me/marketing-consent', {
      method: 'POST',
      body: JSON.stringify({ marketingOptIn }),
    });
  },
  async submitFeedback(payload: { rating: number; comment?: string | null; usageCount?: number }): Promise<void> {
    await request('/api/feedback', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
