import puppeteer from 'puppeteer-core';
const E = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
for (const [name, o] of Object.entries({
  pipe: { pipe: true },
  udd: { userDataDir: process.cwd() + '/edgeprof2' },
  oldHeadless: { headless: 'shell' },
})) {
  try { const b = await puppeteer.launch({ executablePath: E, headless: true, args: ['--no-sandbox', '--no-first-run'], ...o, dumpio: true });
    console.log(name, 'OK', await b.version()); await b.close(); }
  catch (e) { console.log(name, 'FAIL', e.message.split('\n')[0]); }
}
