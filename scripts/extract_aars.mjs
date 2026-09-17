import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

function findAars(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    try {
        const list = fs.readdirSync(dir);
        for (const file of list) {
            const full = path.join(dir, file);
            const stat = fs.statSync(full);
            if (stat && stat.isDirectory()) {
                results = results.concat(findAars(full));
            } else if (file.endsWith('.aar')) {
                results.push(full);
            }
        }
    } catch (e) {}
    return results;
}

const gradleCache = 'C:/Users/the.musafir/.gradle/caches/modules-2/files-2.1';
const aars = findAars(gradleCache);
console.log(`Found ${aars.length} AAR files in gradle cache`);

const targetLibs = 'X:/android/capacitor-android/libs';
if (!fs.existsSync(targetLibs)) fs.mkdirSync(targetLibs, { recursive: true });

let extractedCount = 0;
for (const aar of aars) {
    const aarBase = path.basename(aar, '.aar');
    const outJar = path.join(targetLibs, `${aarBase}-classes.jar`);
    if (fs.existsSync(outJar)) continue;
    try {
        const tempDir = path.join('X:/android/capacitor-android/build/tmp_aar', aarBase);
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        execSync(`J:/bin/jar.exe xf "${aar}" classes.jar`, { cwd: tempDir, stdio: 'pipe' });
        const extractedClasses = path.join(tempDir, 'classes.jar');
        if (fs.existsSync(extractedClasses)) {
            fs.copyFileSync(extractedClasses, outJar);
            extractedCount++;
        }
    } catch (err) {
        // ignore
    }
}

console.log(`Successfully extracted ${extractedCount} classes.jar files into ${targetLibs}`);
