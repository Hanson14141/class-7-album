const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const app = read('.recovery/deployed-app.js');
const css = read('.recovery/deployed-editorial.css');
const html = read('.recovery/deployed-index.html');
const outputs = new Map();
const cut = (source, start, end, name) => {
  if (start < 0 || end < 0 || end <= start) throw new Error(`Cannot recover ${name}: ${start}, ${end}`);
  outputs.set(name, source.slice(start, end).trim() + '\n');
};
const after = (source, anchor, name) => {
  const index = source.indexOf(anchor);
  if (index < 0) throw new Error(`Missing start anchor for ${name}`);
  return index + anchor.length;
};
const before = (source, anchor, name, start = 0) => {
  const index = source.indexOf(anchor, start);
  if (index < 0) throw new Error(`Missing end anchor for ${name}`);
  return index;
};

const accountLinking = read('src/account-linking-ui.js');
const adminStart = after(app, accountLinking, 'admin-upload-ui.js');
const irisStart = before(app, '// One alpha surface for the entire iris; opaque metal is painted directly.', 'camera-iris-renderer.js', adminStart);
cut(app, adminStart, irisStart, 'src/admin-upload-ui.js');
const introStart = before(app, '// A real DOM portal: the page remains mounted and loading beneath this dialog.', 'camera-intro-ui.js', irisStart);
cut(app, irisStart, introStart, 'src/camera-iris-renderer.js');
const rankingStart = before(app, read('src/photo-ranking-ui.js'), 'camera-intro-ui.js', introStart);
cut(app, introStart, rankingStart, 'src/camera-intro-ui.js');

const managerStart = after(app, read('src/admin-rarity-ui.js'), 'photo-manager-ui.js');
const drawStart = before(app, '// The server owns RNG, spending, inventory and pity. Requests retain their id after ambiguous errors.', 'draw-ui.js', managerStart);
cut(app, managerStart, drawStart, 'src/photo-manager-ui.js');
const drawEnd = app.lastIndexOf('\ninit();');
cut(app, drawStart, drawEnd, 'src/draw-ui.js');

const cameraCssStart = after(css, read('src/usage-notice.css'), 'camera-intro.css');
const cameraCssEnd = before(css, read('src/wall-speed.css'), 'camera-intro.css', cameraCssStart);
cut(css, cameraCssStart, cameraCssEnd, 'src/camera-intro.css');
const drawCssStart = after(css, read('src/mall-card-hover.css'), 'draw.css');
const rarityCssEnd = before(css, read('src/admin-rarity.css'), 'photo-manager.css', drawCssStart);
const managerCssStart = before(css, '.photo-manager{', 'photo-manager.css', drawCssStart);
cut(css, drawCssStart, managerCssStart, 'src/draw.css');
cut(css, managerCssStart, rarityCssEnd, 'src/photo-manager.css');

const element = (selector, name) => {
  const start = html.indexOf(selector);
  const end = html.indexOf(selector.startsWith('<section') ? '</section>' : '</dialog>', start);
  if (start < 0 || end < 0) throw new Error(`Cannot recover ${name}`);
  const close = selector.startsWith('<section') ? '</section>' : '</dialog>';
  outputs.set(name, html.slice(start, end + close.length).trim() + '\n');
};
element('<dialog id="camera-intro"', 'src/camera-intro.html');
element('<section id="draw-board"', 'src/draw.html');
element('<dialog id="photo-manager"', 'src/photo-manager.html');
element('<section id="admin-rarity-tools"', 'src/admin-rarity.html');

const configMatch = html.match(/window\.class7CameraConfig=(\{[^}]+\});/);
if (!configMatch) throw new Error('Cannot recover camera config');
outputs.set('src/camera-intro-config.json', JSON.stringify(JSON.parse(configMatch[1]), null, 2) + '\n');
const bootStart = configMatch.index + configMatch[0].length;
const bootEnd = html.indexOf('</script>', bootStart);
cut(html, bootStart, bootEnd, 'src/camera-intro-boot.js');

for (const [file, content] of outputs) {
  if (fs.existsSync(path.join(root, file))) throw new Error(`Refusing to overwrite ${file}`);
  fs.writeFileSync(path.join(root, file), content);
  console.log(`${file}: ${content.length} bytes`);
}
