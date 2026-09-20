import type { IncomingMessage, ServerResponse } from 'node:http';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-school-domain');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  // Extract Bearer token from Authorization header or URL query
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const schoolDomain = (req.headers['x-school-domain'] as string) || 'dpsharni.edunext2.com';

  if (!token) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      error: 'Please log in to view your circulars and mailbox.',
    }));
    return;
  }

  try {
    const headers = {
      'Content-Type': 'application/json',
      'mvcdomainurl': schoolDomain,
      'Connection-type': '_read',
      'Authorization': `Bearer ${token}`,
    };

    // Fetch Circulars and Mailbox in parallel
    const [circRes, mailRes] = await Promise.all([
      fetch('https://m1.edubac.com/rest/v4/student/getcirculardata', {
        headers,
        signal: AbortSignal.timeout(12000),
      }),
      fetch('https://m1.edubac.com/rest/v4/student/Studentinboxnew', {
        headers,
        signal: AbortSignal.timeout(12000),
      }),
    ]);

    if (circRes.status === 401 || mailRes.status === 401 || circRes.status === 498) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Your session has expired. Please log in again.' }));
      return;
    }

    const circData = (await circRes.json().catch(() => ({}))) as any;
    const mailData = (await mailRes.json().catch(() => ({}))) as any;

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      circulars: circData.data?.circularlist || [],
      mailbox: mailData.data?.list || [],
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
