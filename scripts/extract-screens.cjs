const fs = require('fs');
const path = require('path');

for (let i = 1; i <= 3; i++) {
  const filePath = path.resolve(__dirname, `../unpacked_ui_${i}.html`);
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf8');
  const title = content.match(/<title>([^<]+)<\/title>/);
  console.log(`UI ${i} title:`, title ? title[1] : 'none');
  const tplMatch = content.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
  if (tplMatch) {
    const tpl = JSON.parse(tplMatch[1]);
    console.log(`UI ${i} template length:`, tpl.length);
    const outPath = path.resolve(__dirname, `../screen_${i}.html`);
    fs.writeFileSync(outPath, tpl);
    console.log(`Wrote screen_${i}.html`);
  }
}

