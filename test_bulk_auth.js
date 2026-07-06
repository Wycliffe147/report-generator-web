const http = require('http');
const jwt = require('jsonwebtoken');

const token = jwt.sign({ username: 'admin', role: 'admin' }, 'super-secret-excel-academy-key-change-me', { expiresIn: '1h' });

const options = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/generate-pdf-bulk',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  let data = [];
  res.on('data', (chunk) => {
    data.push(chunk);
  });
  res.on('end', () => {
    const buffer = Buffer.concat(data);
    console.log('Response length:', buffer.length);
    if (res.statusCode !== 200) {
      console.log('Error Body:', buffer.toString());
    }
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
  process.exit(1);
});

req.write(JSON.stringify({ studentIds: ["S1781845187740"] })); // Using the single student we know might exist
req.end();
