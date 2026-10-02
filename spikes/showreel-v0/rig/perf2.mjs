import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';
const b = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p = await b.newPage(); await p.setViewport({width:1920,height:1080});
p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto(pathToFileURL('D:/Projects/EnNam/ennam-agents-scaffold/promo-video/index.html').href+'?t=0');
await p.waitForFunction('window.READY===true');
for (const t of [3.2,4.9,5.3,5.6,5.8]) { const ms = await p.evaluate((t)=>{const s=performance.now(); for(let i=0;i<5;i++) window.renderAt(t+i*0.001,"s2",1); return (performance.now()-s)/5;},t); console.log(t, ms.toFixed(1),'ms (s3 only incl. core post)'); }
await b.close();
