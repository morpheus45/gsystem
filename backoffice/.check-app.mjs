import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('./web/app.js', import.meta.url), 'utf8');
console.log(JSON.stringify(src.slice(0, 120)));
console.log('---');
console.log(JSON.stringify(src.slice(-120)));
