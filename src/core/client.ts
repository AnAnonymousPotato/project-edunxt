import {
  AuthResponse,
  CircularItem,
  MailboxItem,
  DecodedToken,
  HomeworkAssignment,
  SubjectMeta,
  SchoolNewsItem,
  AttachmentImage,
  StudentBundle,
} from './types.js';

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

    const firstPage = await this.request<MailboxResponse>('/rest/v4/student/Studentinboxnew?limit=1', 'GET');
    let list = firstPage.data?.list || [];
    const total = firstPage.data?.__total__ || list.length;
    const totalPages = Math.ceil(total / 20);

    if (totalPages > 1) {
      const promises: Promise<MailboxResponse>[] = [];
      for (let p = 2; p <= totalPages; p++) {
        promises.push(this.request<MailboxResponse>(`/rest/v4/student/Studentinboxnew?limit=${p}`, 'GET'));
      }
      const pages = await Promise.all(promises);
      for (const page of pages) {
        if (page.data?.list) {
          list = list.concat(page.data.list);
        }
      }
    }

    return list;
  }

  public async getHomework(): Promise<{ assignments: HomeworkAssignment[]; subjects: SubjectMeta[] }> {
    interface RawHomeworkResponse {
      success: boolean;
      data?: {
        assgmentData?: Array<{
          assignmentid: number;
          assignmentname: string;
          subjectname?: string;
          description?: string;
          assignBy?: string;
          cretedon?: string;
          deadlineDate?: string;
          deadlinetime?: string;
          submission_required?: boolean;
          assignmenttypesName?: string;
          attachment?: string;
        }>;
        subjectList?: Array<{
          id: number;
          name: string;
          code: string;
          classid: number;
          includeincgpa?: boolean;
          excludeinattendance?: boolean;
          isnegative_marking?: boolean;
          isoptional?: boolean;
        }>;
      };
    }

    const res = await this.request<RawHomeworkResponse>('/rest/v4/student/studentHomework', 'GET');
    const rawList = res.data?.assgmentData || [];
    const rawSubjects = res.data?.subjectList || [];

    const assignments: HomeworkAssignment[] = rawList.map((item) => {
      let atts: AttachmentImage[] = [];
      if (item.attachment) {
        try {
          const obj = typeof item.attachment === 'string' ? JSON.parse(item.attachment) : item.attachment;
          let imgArr = obj?.image_array;
          if (typeof imgArr === 'string') imgArr = JSON.parse(imgArr);
          if (Array.isArray(imgArr)) atts = imgArr as AttachmentImage[];
        } catch {}
      }

      return {
        id: item.assignmentid,
        title: item.assignmentname || 'Untitled Assignment',
        subject: item.subjectname || 'General',
        description: item.description || '',
        assignedBy: item.assignBy || 'Teacher',
        createdOn: item.cretedon || '',
        deadlineDate: item.deadlineDate || '',
        deadlineTime: item.deadlinetime || '',
        submissionRequired: Boolean(item.submission_required),
        type: item.assignmenttypesName || 'Homework',
        attachments: atts,
      };
    });

    const subjects: SubjectMeta[] = rawSubjects.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      classId: s.classid,
      includeInCgpa: Boolean(s.includeincgpa),
      excludeInAttendance: Boolean(s.excludeinattendance),
      isNegativeMarking: Boolean(s.isnegative_marking),
      isOptional: Boolean(s.isoptional),
    }));

    return { assignments, subjects };
  }

  public async getSchoolNews(): Promise<SchoolNewsItem[]> {
    interface RawNewsResponse {
      success: boolean;
      data?: {
        schoolnewslist?: Array<{
          id: string;
          newssubject: string;
          newssdescription?: string;
          newsdate: string;
          creationdatetime?: string;
          employeename?: string;
          employeeimage?: string;
          filepath?: string;
          filename?: string;
        }>;
      };
    }

    const res = await this.request<RawNewsResponse>('/rest/v4/student/getstudentnews', 'GET');
    const list = res.data?.schoolnewslist || [];

    return list.map((item) => {
      let mediaUrl: string | undefined;
      if (item.filepath) {
        try {
          const parsed = typeof item.filepath === 'string' ? JSON.parse(item.filepath) : item.filepath;
          mediaUrl = parsed?.cloud_front_serving_url || parsed?.servingUrl;
        } catch {}
      }

      return {
        id: String(item.id),
        subject: item.newssubject || 'Notice',
        description: item.newssdescription || '',
        date: item.newsdate || '',
        createdDateTime: item.creationdatetime,
        author: item.employeename || 'Administration',
        mediaFile: item.filename,
        mediaUrl,
      };
    });
  }

  public async getCompleteStudentBundle(): Promise<StudentBundle> {
    const [circResult, mailResult, hwResult, newsResult] = await Promise.allSettled([
      this.getCirculars(),
      this.getMailbox(),
      this.getHomework(),
      this.getSchoolNews(),
    ]);

    return {
      student: this.getDecodedToken(),
      circulars: circResult.status === 'fulfilled' ? circResult.value : [],
      mailbox: mailResult.status === 'fulfilled' ? mailResult.value : [],
      homework: hwResult.status === 'fulfilled' ? hwResult.value : { assignments: [], subjects: [] },
      news: newsResult.status === 'fulfilled' ? newsResult.value : [],
      timestamp: new Date().toISOString(),
    };
  }
}
