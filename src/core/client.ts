import { AuthResponse, CircularItem, MailboxItem, DecodedToken } from './types.js';

export class EdunextClient {
  private baseUrl = 'https://m1.edubac.com';
  private schoolDomain: string;
  private token: string | null = null;
  private userId: string | null = null;
  private password: string | null = null;

  constructor(schoolDomain = 'dpsharni.edunext2.com', token?: string) {
    this.schoolDomain = schoolDomain;
    if (token) {
      this.token = token;
    }
  }

  public setCredentials(userId: string, password?: string) {
    this.userId = userId;
    if (password) this.password = password;
  }

  public setToken(token: string) {
    this.token = token;
  }

  public getToken(): string | null {
    return this.token;
  }

  public getDecodedToken(): DecodedToken | null {
    if (!this.token) return null;
    try {
      const parts = this.token.split('.');
      if (parts.length !== 3) return null;
      const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
      return JSON.parse(payload) as DecodedToken;
    } catch {
      return null;
    }
  }

  public isTokenExpired(): boolean {
    const decoded = this.getDecodedToken();
    if (!decoded || !decoded.exp) return true;
    const now = Math.floor(Date.now() / 1000);
    // Refresh 5 minutes before actual expiry
    return decoded.exp - 300 < now;
  }

  public async login(userId?: string, password?: string): Promise<string> {
    const uId = userId || this.userId;
    const pass = password || this.password;

    if (!uId || !pass) {
      throw new Error('User ID and Password are required to log in.');
    }

    this.userId = uId;
    this.password = pass;

    const url = `${this.baseUrl}/rest/v4/student/openconnect`;
    const headers = {
      'Content-Type': 'application/json',
      'mvcdomainurl': this.schoolDomain,
      'Connection-type': '_write',
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userid: uId, password: pass }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Login failed (HTTP ${res.status}): ${errText}`);
    }

    const data = (await res.json()) as AuthResponse;
    if (!data.success || !data.data?.openIdConnect) {
      throw new Error(`Login was unsuccessful: ${data.message || 'Unknown response'}`);
    }

    this.token = data.data.openIdConnect;
    return this.token;
  }

  private async ensureAuthenticated(): Promise<string> {
    if (!this.token || this.isTokenExpired()) {
      if (this.userId && this.password) {
        await this.login();
      } else {
        throw new Error('Active token is missing or expired, and no credentials were provided for auto-login.');
      }
    }
    return this.token!;
  }

  private async request<T>(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<T> {
    const token = await this.ensureAuthenticated();

    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'mvcdomainurl': this.schoolDomain,
      'Connection-type': method === 'GET' ? '_read' : '_write',
      'Authorization': `Bearer ${token}`,
    };

    const options: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(15000),
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);

    // If unauthorized or token expired, retry once with fresh login
    if ((res.status === 401 || res.status === 498) && this.userId && this.password) {
      this.token = null;
      await this.login();
      return this.request<T>(endpoint, method, body);
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API error (${endpoint}, HTTP ${res.status}): ${errText}`);
    }

    const json = await res.json();
    return json as T;
  }

  public async getCirculars(): Promise<CircularItem[]> {
    interface CircularResponse {
      success: boolean;
      data?: {
        circularlist?: CircularItem[];
      };
    }

    const res = await this.request<CircularResponse>('/rest/v4/student/getcirculardata', 'GET');
    return res.data?.circularlist || [];
  }

  public async getMailbox(): Promise<MailboxItem[]> {
    interface MailboxResponse {
      success: boolean;
      data?: {
        list?: MailboxItem[];
        __total__?: number;
      };
    }

    const res = await this.request<MailboxResponse>('/rest/v4/student/Studentinboxnew', 'GET');
    return res.data?.list || [];
  }

  public async getAttendance(): Promise<unknown> {
    return this.request('/rest/v4/student/getStudentAttendanceCalander', 'GET');
  }

  public async getHomework(): Promise<unknown> {
    return this.request('/rest/v4/student/studentHomework', 'GET');
  }

  public async getSchoolNews(): Promise<unknown> {
    return this.request('/rest/v4/student/getstudentnews', 'GET');
  }

  public async getTimetable(): Promise<unknown> {
    return this.request('/rest/v4/student/getstudentTimeTable', 'GET');
  }
}
