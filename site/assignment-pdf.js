// Local, dependency-free PDF export. Canvas uses the browser's Arabic shaping
// and font fallback; the PDF stores high-resolution page images (no upload).
const W=841.89,H=595.28,SCALE=3.5,M=25,GAP=14,BOTTOM=H-32;
const BROWN='#4A211C',CREAM='#F3E8DC',INK='#30231F',LINE='#D9C9BD',MUTED='#715C53';
const FONT='"Tajawal", "Arial", sans-serif';
const encoder=new TextEncoder();
const bytes=text=>encoder.encode(text);
const ascii=text=>bytes(text);
const points=n=>Number(n.toFixed(3));

function font(ctx,size=10,weight=500){ctx.font=`${weight} ${size}px ${FONT}`;}
function wrap(ctx,value,width){
  const out=[];
  for(const paragraph of String(value??'').split(/\r?\n/)){
    let line='';
    for(const word of paragraph.split(/\s+/).filter(Boolean)){
      if(ctx.measureText(word).width>width){
        if(line){out.push(line);line='';}
        for(const char of word){
          if(line&&ctx.measureText(line+char).width>width){out.push(line);line='';}
          line+=char;
        }
      }else if(line&&ctx.measureText(line+' '+word).width>width){out.push(line);line=word;}
      else line+=(line?' ':'')+word;
    }
    out.push(line);
  }
  return out.length?out:[''];
}
function text(ctx,lines,x,y,w,h,{size=10,weight=500,color=INK,align='center',direction='rtl',leading=size*1.28}={}){
  ctx.save();font(ctx,size,weight);ctx.fillStyle=color;ctx.textAlign=align;ctx.direction=direction;ctx.textBaseline='middle';
  const tx=align==='right'?x+w-4:align==='left'?x+4:x+w/2;
  const first=y+(h-(lines.length-1)*leading)/2;
  lines.forEach((line,i)=>ctx.fillText(line,tx,first+i*leading));ctx.restore();
}
function box(ctx,x,y,w,h,fill,stroke=LINE){ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.5;ctx.strokeRect(x,y,w,h);}}
function canvasPage(){const canvas=document.createElement('canvas');canvas.width=Math.ceil(W*SCALE);canvas.height=Math.ceil(H*SCALE);const ctx=canvas.getContext('2d');if(!ctx)throw Error('تعذر تجهيز صفحة التقرير');ctx.scale(canvas.width/W,canvas.height/H);ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,W,H);return {canvas,ctx};}
const headings=['المنفذ','المطلوب','الفكرة','تاريخ التسليم','تاريخ النشر','تاريخ التمويل'];
const weights=[.155,.12,.252,.158,.1575,.1575];
function columns(x,w){let edge=x+w;return weights.map(f=>{const width=w*f;edge-=width;return {x:edge,w:width};});}
function isDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value);}
const ltr=value=>'\u2066'+value+'\u2069';
function prepareRows(ctx,group,width){
  const cols=columns(0,width),size=9.8,leading=12.4,pad=7;
  font(ctx,size);const lines=(value,i)=>wrap(ctx,value,cols[i].w-8);
  return group.ideas.map((idea,index)=>{
    const rows=idea.rows.map(row=>{
      const values=[row.executor,row.requirement,'',row.dueOn,row.publishOn,row.fundOn];
      const cells=values.map(lines);return {values,cells,height:Math.max(22,...cells.map(l=>l.length*leading+pad))};
    });
    const title=lines(idea.title,2);const total=rows.reduce((s,r)=>s+r.height,0),needed=title.length*leading+pad;
    if(total<needed)rows.at(-1).height+=needed-total;
    return {rows,title,index};
  });
}
function panelHeader(ctx,group,x,y,w,continuation){
  box(ctx,x,y,w,25,BROWN,null);
  font(ctx,11,700);const name=`${String(group.number).padStart(2,'0')}  |  ${group.category}${continuation?' (تابع)':''}`;
  text(ctx,wrap(ctx,name,w-12),x,y,w,25,{size:11,weight:700,color:CREAM});
  y+=25;const cols=columns(x,w);
  const groups=[{label:'التنفيذ',x:cols[3].x,w:cols.slice(0,4).reduce((s,c)=>s+c.w,0)},{label:'الأجندة',...cols[4]},{label:'الحملة',...cols[5]}];
  groups.forEach(g=>{box(ctx,g.x,y,g.w,19,CREAM);text(ctx,[g.label],g.x,y,g.w,19,{size:10,weight:700,color:BROWN});});
  y+=19;
  cols.forEach((c,i)=>{box(ctx,c.x,y,c.w,25,'#FAF5EF');font(ctx,9.3,700);text(ctx,wrap(ctx,headings[i],c.w-7),c.x,y,c.w,25,{size:9.3,weight:700,color:BROWN,leading:10.7});});
  return y+25;
}
function drawIdea(ctx,entry,x,y,w,continued=false){
  const cols=columns(x,w),fill=entry.index%2===0?'#FFFFFF':'#F9F3ED';
  const total=entry.rows.reduce((s,r)=>s+r.height,0),size=9.8,leading=12.4;
  box(ctx,cols[2].x,y,cols[2].w,total,fill);
  text(ctx,entry.title,cols[2].x,y,cols[2].w,total,{size,leading});
  for(const row of entry.rows){
    row.cells.forEach((lines,i)=>{if(i===2)return;const c=cols[i];box(ctx,c.x,y,c.w,row.height,fill);text(ctx,lines,c.x,y,c.w,row.height,{size,leading,direction:isDate(row.values[i])?'ltr':'rtl'});});
    y+=row.height;
  }
  ctx.strokeStyle=LINE;ctx.lineWidth=.9;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.stroke();return y;
}
function header(ctx,report){
  box(ctx,M,22,37,27,BROWN,null);text(ctx,['MZJ'],M,22,37,27,{size:13,weight:800,color:CREAM,direction:'ltr'});
  const x=M+48,w=W-M-x;
  font(ctx,17,800);const title=wrap(ctx,report.title,w-8);
  const height=Math.max(27,title.length*21+4);text(ctx,title,x,22,w,height,{size:17,weight:800,color:BROWN,align:'right',leading:21});
  let y=22+height+3;
  const sub=[];
  if(report.season)sub.push('الموسم: '+report.season);
  if(report.seasonFrom)sub.push('من '+ltr(report.seasonFrom));
  if(report.seasonTo)sub.push('إلى '+ltr(report.seasonTo));
  if(sub.length){font(ctx,10,500);const lines=wrap(ctx,sub.join('  |  '),W-2*M-8);const h=lines.length*13+4;text(ctx,lines,M,y,W-2*M,h,{size:10,align:'right',color:MUTED,leading:13});y+=h;}
  ctx.strokeStyle=BROWN;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(M,y+3);ctx.lineTo(W-M,y+3);ctx.stroke();return y+11;
}
function footer(ctx,report,page,total){
  const y=H-24;ctx.strokeStyle=LINE;ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(M,y);ctx.lineTo(W-M,y);ctx.stroke();
  text(ctx,[`${page} / ${total}`],M,y+3,85,15,{size:9,color:MUTED,direction:'ltr',align:'left'});
  const label=report.campaignEnd?'انتهاء الحملة: '+ltr(report.campaignEnd):'خطة التكليفات | MZJ';
  text(ctx,[label],M+90,y+3,W-2*M-90,15,{size:10,color:BROWN,weight:700,align:'right'});
}
// Pair categories from right to left. When there is only one category it can
// use the full width. Keep each idea's rows together whenever a page permits.
function paginate(report){
  const result=[];
  const measure=canvasPage();
  for(let i=0;i<report.groups.length;i+=2){
    const pair=report.groups.slice(i,i+2),width=(W-2*M-(pair.length-1)*GAP)/pair.length;
    const panels=pair.map(group=>({group,entries:prepareRows(measure.ctx,group,width),pos:0,continued:false}));
    let more=true;
    while(more){
      const {canvas,ctx}=canvasPage();const start=header(ctx,report);
      for(let col=0;col<panels.length;col++){
        const panel=panels[col];if(panel.pos>=panel.entries.length)continue;
        const x=W-M-width-col*(width+GAP);let y=panelHeader(ctx,panel.group,x,start,width,panel.continued);
        const capacity=BOTTOM-y;
        if(capacity<35)throw Error('عنوان التقرير طويل جدًا؛ اختصره ثم أعد التصدير.');
        while(panel.pos<panel.entries.length){
          const entry=panel.entries[panel.pos];const height=entry.rows.reduce((s,r)=>s+r.height,0);
          if(height<=BOTTOM-y+.001){y=drawIdea(ctx,entry,x,y,width);panel.pos++;continue;}
          if(height<=capacity+.001||y>start+69+.001)break;
          // Extremely tall idea: split at executor row boundaries. Preserve
          // title on continuation sheets instead of clipping or dropping rows.
          let used=0,count=0;for(const row of entry.rows){if(used+row.height>BOTTOM-y)break;used+=row.height;count++;}
          if(!count)throw Error('نص إحدى الأفكار طويل جدًا للطباعة.');
          const titleHeight=entry.title.length*12.4+7;
          if(titleHeight>used)throw Error('عنوان إحدى الأفكار طويل جدًا للطباعة.');
          y=drawIdea(ctx,{...entry,rows:entry.rows.slice(0,count)},x,y,width);
          panel.entries[panel.pos]={...entry,rows:entry.rows.slice(count)};break;
        }
        panel.continued=true;
      }
      result.push({canvas,ctx});more=panels.some(p=>p.pos<p.entries.length);
    }
  }
  result.forEach((p,i)=>footer(p.ctx,report,i+1,result.length));return result;
}
function jpeg(canvas){return new Promise((resolve,reject)=>canvas.toBlob(async blob=>{try{if(!blob)throw Error('تعذر تصدير صورة التقرير');resolve(new Uint8Array(await blob.arrayBuffer()));}catch(e){reject(e);}},'image/jpeg',.96));}
// A minimal PDF 1.4 writer with a catalog, page tree, RGB JPEG image and page
// content stream per sheet. Offsets are measured in bytes, not JS characters.
export function encodeAssignmentPdf(images){
  const chunks=[],offsets=[0];let offset=0;
  const add=part=>{const data=typeof part==='string'?ascii(part):part;chunks.push(data);offset+=data.length;};
  const object=(id,parts)=>{offsets[id]=offset;add(`${id} 0 obj\n`);parts.forEach(add);add('\nendobj\n');};
  add('%PDF-1.4\n');add(new Uint8Array([37,226,227,207,211,10]));
  object(1,['<< /Type /Catalog /Pages 2 0 R >>']);
  object(2,[`<< /Type /Pages /Count ${images.length} /Kids [${images.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`]);
  images.forEach((image,i)=>{
    const id=3+i*3;
    object(id,[`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`]);
    object(id+1,[`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.data.length} >>\nstream\n`,image.data,'\nendstream']);
    const stream=`q\n${points(W)} 0 0 ${points(H)} 0 0 cm\n/Im0 Do\nQ\n`;
    object(id+2,[`<< /Length ${bytes(stream).length} >>\nstream\n`,stream,'endstream']);
  });
  const xref=offset;add(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for(let i=1;i<offsets.length;i++)add(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
  add(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks,{type:'application/pdf'});
}
export async function buildAssignmentPdf(report){
  if(!report?.groups?.length)throw Error('لا توجد أفكار للتصدير');
  // The site already loads Tajawal. Give the browser time to finish loading it;
  // fall back to installed Arabic fonts if the font service is unavailable.
  if(document.fonts?.load)await Promise.race([Promise.allSettled([document.fonts.load('500 10px Tajawal','تاريخ التسليم'),document.fonts.load('800 17px Tajawal','أجندة وحملة')]),new Promise(r=>setTimeout(r,2500))]);
  const pages=paginate(report),images=[];
  for(const {canvas} of pages){images.push({width:canvas.width,height:canvas.height,data:await jpeg(canvas)});canvas.width=1;canvas.height=1;}
  return encodeAssignmentPdf(images);
}
export async function downloadAssignmentPdf(report){
  const blob=await buildAssignmentPdf(report),url=URL.createObjectURL(blob),link=document.createElement('a');
  const single=report.groups?.length===1?report.groups[0].category:'';
  const filename=String(single||report.title||'تكليفات').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').trim().slice(0,110);
  link.href=url;link.download=`${filename||'تكليفات'}.pdf`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
