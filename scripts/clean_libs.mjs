import fs from 'fs';
import path from 'path';

const appLibs = 'X:/android/app/libs';
const files = fs.readdirSync(appLibs);
for (const f of files) {
    if (f !== 'capacitor-core.jar') {
        fs.unlinkSync(path.join(appLibs, f));
        console.log('Removed duplicate jar:', f);
    }
}
console.log('App libs cleaned, keeping only capacitor-core.jar');
