import type { IncomingMessage, ServerResponse } from 'node:http';
import { EdunextClient } from '../src/core/client.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const userId = process.env.EDUNEXT_USER_ID;
  const password = process.env.EDUNEXT_PASSWORD;
  const schoolDomain = process.env.EDUNEXT_SCHOOL_DOMAIN || 'dpsharni.edunext2.com';

  if (!userId || !password) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      error: 'EDUNEXT_USER_ID and EDUNEXT_PASSWORD environment variables are not configured in Vercel settings.',
    }));
    return;
  }

  try {
    const client = new EdunextClient(schoolDomain);
    await client.login(userId, password);
    const decoded = client.getDecodedToken();

    const [circulars, mailbox] = await Promise.all([
      client.getCirculars().catch(() => []),
      client.getMailbox().catch(() => []),
    ]);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.end(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      student: {
        userId,
        studentId: decoded?.studentid,
        classId: decoded?.classid,
        sectionId: decoded?.sectionid,
        academicYearId: decoded?.academicyearid,
        schoolDomain,
      },
      circulars,
      mailbox,
    }));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      error: err.message || 'Failed to fetch data from Edunext.',
    }));
  }
}
