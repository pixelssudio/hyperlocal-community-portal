import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function getFiles(dir, ext) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    try {
        const list = fs.readdirSync(dir);
        for (const file of list) {
            const full = path.join(dir, file);
            const stat = fs.statSync(full);
            if (stat && stat.isDirectory()) {
                results = results.concat(getFiles(full, ext));
            } else if (file.endsWith(ext)) {
                results.push(full);
            }
        }
    } catch (e) {}
    return results;
}

const gradleCache = 'C:/Users/the.musafir/.gradle/caches/modules-2/files-2.1';
const libsDir = 'X:/android/capacitor-android/libs';

const jars = [
    ...getFiles(gradleCache, '.jar'),
    ...getFiles(libsDir, '.jar')
];

const androidJar = 'S:/platforms/android-34/android.jar';
const cp = [androidJar, ...jars].map(j => j.replace(/\\/g, '/')).join(';');

const javaFiles = getFiles('X:/android/capacitor-android/src/main/java', '.java');
const outDir = 'X:/android/capacitor-android/build/intermediates/javac/debug/compileDebugJavaWithJavac/classes';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

console.log(`Compiling ${javaFiles.length} java files with ${jars.length} total jars...`);

const optionsContent = [
    '-cp', cp,
    '-d', outDir.replace(/\\/g, '/'),
    ...javaFiles.map(f => f.replace(/\\/g, '/'))
].join('\n');

fs.writeFileSync('X:/android/capacitor-android/options.txt', optionsContent);

try {
    const cmd = `J:/bin/javac.exe @X:/android/capacitor-android/options.txt`;
    const res = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
    console.log('SUCCESSFUL JAVAC COMPILATION!');
} catch (err) {
    console.error('STDERR:', err.stderr ? err.stderr.substring(0, 3000) : err.message);
}
