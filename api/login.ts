import type { IncomingMessage, ServerResponse } from 'node:http';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      const { userId, password, schoolDomain = 'dpsharni.edunext2.com' } = JSON.parse(body || '{}');

      if (!userId || !password) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: 'User ID and password are required.' }));
        return;
      }

      const url = 'https://m1.edubac.com/rest/v4/student/openconnect';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'mvcdomainurl': schoolDomain,
          'Connection-type': '_write',
        },
        body: JSON.stringify({ userid: String(userId).trim(), password: String(password).trim() }),
        signal: AbortSignal.timeout(15000),
      });

      const json = await response.json() as any;

      if (!response.ok || !json.success || !json.data?.openIdConnect) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: false,
          error: json.message || 'Invalid User ID or Password.',
        }));
        return;
      }

      const token = json.data.openIdConnect;
      // Decode student info from token
      const parts = token.split('.');
      let studentInfo: any = {};
      if (parts.length === 3) {
        try {
          studentInfo = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        } catch {}
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        token,
        student: {
          userId: studentInfo.username || userId,
          studentId: studentInfo.studentid,
          classId: studentInfo.classid,
          sectionId: studentInfo.sectionid,
          academicYearId: studentInfo.academicyearid,
          schoolDomain,
        },
      }));
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: err.message || 'Authentication error.' }));
    }
  });
}
