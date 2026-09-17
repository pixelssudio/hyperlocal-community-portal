import fs from 'fs';
import { execSync } from 'child_process';

const validEmptyZip = Buffer.from([
    0x50, 0x4B, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);

const dirs = ['34.0.0', '35.0.0', '36.0.0'];
for (const d of dirs) {
    const p1 = `C:/Users/the.musafir/AppData/Local/Android/Sdk/build-tools/${d}/core-lambda-stubs.jar`;
    const p2 = `S:/build-tools/${d}/core-lambda-stubs.jar`;
    try {
        if (fs.existsSync(`C:/Users/the.musafir/AppData/Local/Android/Sdk/build-tools/${d}`)) {
            fs.writeFileSync(p1, validEmptyZip);
            console.log('Fixed:', p1);
        }
    } catch(e) {}
    try {
        if (fs.existsSync(`S:/build-tools/${d}`)) {
            fs.writeFileSync(p2, validEmptyZip);
            console.log('Fixed:', p2);
        }
    } catch(e) {}
}
