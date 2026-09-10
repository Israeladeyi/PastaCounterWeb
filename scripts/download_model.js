import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://storage.googleapis.com/tfjs-models/savedmodel/ssd_mobilenet_v2';
const DEST_DIR = path.join(__dirname, '../public/model');

if (!fs.existsSync(DEST_DIR)) {
  fs.mkdirSync(DEST_DIR, { recursive: true });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}...`);
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  try {
    // 1. Download model.json
    await downloadFile(`${BASE_URL}/model.json`, path.join(DEST_DIR, 'model.json'));
    
    // 2. Read model.json to find weight files
    const modelJson = JSON.parse(fs.readFileSync(path.join(DEST_DIR, 'model.json'), 'utf-8'));
    const weightsManifest = modelJson.weightsManifest;
    
    if (!weightsManifest) {
      console.log('No weightsManifest found. Done.');
      return;
    }
    
    // 3. Download all weight files
    for (const manifest of weightsManifest) {
      for (const p of manifest.paths) {
        await downloadFile(`${BASE_URL}/${p}`, path.join(DEST_DIR, p));
      }
    }
    
    console.log('Successfully downloaded all model files to public/model/');
  } catch (e) {
    console.error('Error downloading model:', e);
  }
}

main();
