const http = require('http');

async function testBundles() {
  const res = await new Promise((resolve) => http.get('http://localhost:3000', resolve));
  let html = '';
  res.on('data', (c) => (html += c));
  res.on('end', async () => {
    const regex = /src="(\/_next\/static\/[^"]+)"/g;
    const scripts = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      scripts.push(match[1]);
    }
    console.log(`Discovered ${scripts.length} Next.js client script bundles.`);
    for (const s of scripts) {
      const sRes = await new Promise((resolve) => http.get('http://localhost:3000' + s, resolve));
      console.log(`Bundle: ${s} -> Status: ${sRes.statusCode}`);
      if (sRes.statusCode !== 200) {
        console.error(`Failed to load bundle: ${s}`);
        process.exit(1);
      }
    }
    console.log('✅ All client bundles compiled and served cleanly with HTTP 200!');
  });
}

testBundles();
