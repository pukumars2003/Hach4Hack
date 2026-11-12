const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const filePath = path.resolve(__dirname, '../TeamForge UI Screens.html');
const content = fs.readFileSync(filePath, 'utf8');
const match = content.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/);

if (!match) {
  console.log('No manifest found');
  process.exit(1);
}

const manifest = JSON.parse(match[1]);
let idx = 1;
for (const [key, val] of Object.entries(manifest)) {
  console.log('Key:', key, 'mime:', val.mime, 'compressed:', val.compressed);
  let buf = Buffer.from(val.data, 'base64');
  if (val.compressed) {
    try {
      buf = zlib.gunzipSync(buf);
    } catch (e) {
      console.log('Gunzip failed, trying inflate');
      buf = zlib.inflateSync(buf);
    }
  }
  const ext = val.mime.includes('html') ? '.html' : val.mime.includes('javascript') ? '.js' : val.mime.includes('css') ? '.css' : '.txt';
  const outPath = path.resolve(__dirname, `../unpacked_ui_${idx}${ext}`);
  fs.writeFileSync(outPath, buf);
  console.log('Wrote to:', outPath, 'size:', buf.length);
  idx++;
}
