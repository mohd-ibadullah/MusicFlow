import http from 'http';
import fs from 'fs';

const TEST_URL = 'http://localhost:4000/api';

async function fetchAPI(endpoint, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve) => {
    const defaultHeaders = { 'Content-Type': 'application/json', ...headers };
    
    const req = http.request(TEST_URL + endpoint, {
      method,
      headers: defaultHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: data.toString() }));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  const issues = [];
  console.log("Starting Automated API Edge-Case Tests...");

  // 1. Missing Content-Type for POST
  let res = await fetchAPI('/auth/register', 'POST', { email: 'test@invalid.com' }, { 'Content-Type': '' });
  if (res.status === 500) issues.push({ title: "Uncaught Exception on Missing Content-Type", file: "authRouter.js", severity: "Medium", desc: "Server crashes or throws 500 when Content-Type is empty for post data", fix: "Add body-parser error handling" });

  // 2. JWT Bypass
  res = await fetchAPI('/song/like', 'POST', { songId: 'fakeid' }, { 'Authorization': 'Bearer null' });
  if (res.status !== 401 && res.status !== 403) issues.push({ title: "JWT Bypass Vulnerability", file: "authMiddleware.js", severity: "Critical", desc: "Allows invalid Bearer tokens", fix: "Check jwt.verify strictly" });

  // 3. NoSQL Injection test
  res = await fetchAPI('/auth/login', 'POST', { email: { "$gt": "" }, password: "password" });
  if (res.status === 200 || res.status === 500) issues.push({ title: "NoSQL Injection Vulnerability", file: "authController.js", severity: "Critical", desc: "Accepts objects as email strings", fix: "Validate input types strictly as strings" });

  // 4. Broken Object ID
  res = await fetchAPI('/song/album/invalid-id');
  if (res.status === 500) issues.push({ title: "Unhandled CastError in Album Lookup", file: "songRouter.js", severity: "Low", desc: "Passing a non-Mongo-ObjectID crashes route with 500", fix: "Add mongoose.Types.ObjectId.isValid() check" });

  // 5. Huge Payload
  res = await fetchAPI('/auth/register', 'POST', { email: 'a'.repeat(50000) + '@test.com', password: 'pass', name: 'A' });
  if (res.status === 500) issues.push({ title: "No Payload Size Limit", file: "express config", severity: "Medium", desc: "Large inputs throw 500s", fix: "Use express.json({ limit: '10kb' })" });

  // Report
  console.log("TESTS FINISHED.");
  console.log(JSON.stringify(issues, null, 2));
}

runTests();
