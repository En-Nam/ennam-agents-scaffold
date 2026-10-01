import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage(); await page.setViewport({width:1920,height:1080});
page.on('pageerror', e=>console.log('ERR',e.message));
await page.goto(pathToFileURL('D:/Projects/EnNam/ennam-agents-scaffold/promo-video/index.html').href+'?t=0');
await page.waitForFunction('window.READY === true'); await page.evaluate(()=>document.fonts.ready);
for (const t of [9.2,9.35,10.0,10.6,11.0,11.6,12.1]) {
  const r = await page.evaluate((t)=>{ const a=performance.now(); for(let i=0;i<8;i++){ window.renderAt(t+i*0.003,'s4',1);} return (performance.now()-a)/8; }, t);
  console.log(t, r.toFixed(1),'ms (scene s4 + core post)');
}
const r = await page.evaluate(()=>{ const a=performance.now(); for(let i=0;i<8;i++){ window.renderAt(2.0+i*0.003,'none',1);} return (performance.now()-a)/8; });
console.log('baseline core only', r.toFixed(1));
await browser.close();
