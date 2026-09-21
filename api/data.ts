import type { IncomingMessage, ServerResponse } from 'node:http';

function decodeToken(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function parseHomeworkAttachments(attachment: any) {
  if (!attachment) return [];
  try {
    const obj = typeof attachment === 'string' ? JSON.parse(attachment) : attachment;
    let imgArr = obj?.image_array;
    if (typeof imgArr === 'string') imgArr = JSON.parse(imgArr);
    return Array.isArray(imgArr) ? imgArr : [];
  } catch {
    return [];
  }
}

function parseNewsMedia(filepath: any) {
  if (!filepath) return undefined;
  try {
    const parsed = typeof filepath === 'string' ? JSON.parse(filepath) : filepath;
    return parsed?.cloud_front_serving_url || parsed?.servingUrl;
  } catch {
    return undefined;
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-school-domain');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  // Extract Bearer token from Authorization header
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const schoolDomain = (req.headers['x-school-domain'] as string) || 'dpsharni.edunext2.com';

  if (!token) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      error: 'Please log in to view your dashboard.',
    }));
    return;
  }

  const studentInfo = decodeToken(token);

  try {
    const headers = {
      'Content-Type': 'application/json',
      'mvcdomainurl': schoolDomain,
      'Connection-type': '_read',
      'Authorization': `Bearer ${token}`,
    };

    // Concurrently fetch all 4 active modules used by the school
    const [circRes, mailRes, hwRes, newsRes] = await Promise.all([
      fetch('https://m1.edubac.com/rest/v4/student/getcirculardata', {
        headers,
        signal: AbortSignal.timeout(12000),
      }),
      fetch('https://m1.edubac.com/rest/v4/student/Studentinboxnew?limit=1', {
        headers,
        signal: AbortSignal.timeout(12000),
      }),
      fetch('https://m1.edubac.com/rest/v4/student/studentHomework', {
        headers,
        signal: AbortSignal.timeout(12000),
      }),
      fetch('https://m1.edubac.com/rest/v4/student/getstudentnews', {
        headers,
        signal: AbortSignal.timeout(12000),
      }),
    ]);

    if (
      circRes.status === 401 ||
      mailRes.status === 401 ||
      hwRes.status === 401 ||
      newsRes.status === 401 ||
      circRes.status === 498
    ) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Your session has expired. Please log in again.' }));
      return;
    }

    const circData = (await circRes.json().catch(() => ({}))) as any;
    const mailData = (await mailRes.json().catch(() => ({}))) as any;
    const hwData = (await hwRes.json().catch(() => ({}))) as any;
    const newsData = (await newsRes.json().catch(() => ({}))) as any;

    let mailboxList: any[] = mailData.data?.list || [];
    const totalMailCount: number = mailData.data?.__total__ || mailboxList.length;
    const totalPages = Math.ceil(totalMailCount / 20);

    // If there are additional pages in mailbox, fetch in parallel
    if (totalPages > 1) {
      const pagePromises: Promise<any[]>[] = [];
      for (let p = 2; p <= totalPages; p++) {
        pagePromises.push(
          fetch(`https://m1.edubac.com/rest/v4/student/Studentinboxnew?limit=${p}`, {
            headers,
            signal: AbortSignal.timeout(12000),
          })
            .then((r) => r.json())
            .then((d) => (d.data?.list as any[]) || [])
            .catch(() => [])
        );
      }
      const remainingPages = await Promise.all(pagePromises);
      for (const pageItems of remainingPages) {
        mailboxList = mailboxList.concat(pageItems);
      }
    }

    // Process homework assignments and subject metadata
    const rawAssignments = hwData.data?.assgmentData || [];
    const rawSubjects = hwData.data?.subjectList || [];

    const assignments = rawAssignments.map((item: any) => ({
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
      attachments: parseHomeworkAttachments(item.attachment),
    }));

    const subjects = rawSubjects.map((s: any) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      classId: s.classid,
      includeInCgpa: Boolean(s.includeincgpa),
      excludeInAttendance: Boolean(s.excludeinattendance),
      isNegativeMarking: Boolean(s.isnegative_marking),
      isOptional: Boolean(s.isoptional),
    }));

    // Process school news
    const rawNews = newsData.data?.schoolnewslist || [];
    const news = rawNews.map((item: any) => ({
      id: String(item.id),
      subject: item.newssubject || 'Notice',
      description: item.newssdescription || '',
      date: item.newsdate || '',
      createdDateTime: item.creationdatetime,
      author: item.employeename || 'Administration',
      mediaFile: item.filename,
      mediaUrl: parseNewsMedia(item.filepath),
    }));

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      student: studentInfo ? {
        studentId: studentInfo.studentid,
        userId: studentInfo.sub,
        classId: studentInfo.classid,
        sectionId: studentInfo.sectionid,
        academicYearId: studentInfo.academicyearid,
        dbName: studentInfo.dbname,
        dbname: studentInfo.dbname,
      } : null,
      circulars: circData.data?.circularlist || [],
      mailbox: mailboxList,
      totalMailCount,
      homework: {
        assignments,
        subjects,
      },
      news,
    }));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      error: err.message || 'Failed to fetch student data.',
    }));
  }
}
