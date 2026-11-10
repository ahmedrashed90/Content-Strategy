import fs from 'node:fs';
import {teamHandoffText} from '../site/planner.js';
const data=new URL('../data/',import.meta.url);
const seed=JSON.parse(fs.readFileSync(new URL('MZJ-Publishing-Plan-2026-11-20-IMPORT.json',data),'utf8'));
const target=new URL('handoffs/',data);
fs.mkdirSync(target,{recursive:true});
for(const [key,name] of [['MAHMOUD','محمود'],['BILAL','بلال'],['ABDULLAH','عبدالله']]){
 const file=new URL(`MZJ-KICKOFF-2026-11-20-${key}.txt`,target);
 const text=teamHandoffText(seed,name,1);
 fs.writeFileSync(file,'\ufeff'+text,'utf8');
 console.log(file.pathname,Buffer.byteLength(text,'utf8'));
}
