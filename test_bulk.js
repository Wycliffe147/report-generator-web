const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/generate-pdf-bulk',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('BODY:', data.toString().substring(0, 500));
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
  process.exit(1);
});

req.write(JSON.stringify({ studentIds: ["S1781845187740"] }));
req.end();
