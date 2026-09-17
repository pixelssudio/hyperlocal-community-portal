import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const classesDir = 'X:/android/capacitor-android/build/intermediates/javac/debug/compileDebugJavaWithJavac/classes';
const appLibsDir = 'X:/android/app/libs';
if (!fs.existsSync(appLibsDir)) fs.mkdirSync(appLibsDir, { recursive: true });

const capacitorJar = path.join(appLibsDir, 'capacitor-core.jar');
console.log('Creating capacitor-core.jar...');
execSync(`J:/bin/jar.exe cf "${capacitorJar}" -C "${classesDir}" .`, { stdio: 'pipe' });
console.log('capacitor-core.jar created at:', capacitorJar);

const capLibs = 'X:/android/capacitor-android/libs';
if (fs.existsSync(capLibs)) {
    const jars = fs.readdirSync(capLibs).filter(f => f.endsWith('.jar'));
    for (const j of jars) {
        fs.copyFileSync(path.join(capLibs, j), path.join(appLibsDir, j));
    }
    console.log(`Copied ${jars.length} support jars into ${appLibsDir}`);
}
