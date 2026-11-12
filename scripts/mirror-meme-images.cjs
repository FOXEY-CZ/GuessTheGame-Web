'use strict';
// Rehost only the individually audited, explicitly allowlisted Commons assets.
// This script runs on GitHub Actions and creates a versioned rights manifest.
// No GitHub secrets are used to download media.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const list=require('../quizoria/media/commons/source-manifest.json').entries;
const output=path.join(__dirname,'..','quizoria/media/commons');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const types={'.jpg':['image/jpeg','image/jpg'],'.png':['image/png']};
const mkurl=name=>'https://commons.wikimedia.org/wiki/Special:FilePath/'+
  encodeURIComponent(name)+'?width=800';
async function getImage(record){
 if(!/^meme-[a-z0-9-]+\.(jpg|png)$/.test(record.local_file)||
    !/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(record.source_url))
  throw Error('Bad audited image manifest entry: '+record.asset_key);
 let finalError;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const url=mkurl(record.commons_name);
   const response=await fetch(url,{
     headers:{'User-Agent':'FOXEYArcade-MediaMirror/1.0 (educational media archive; GitHub Pages)','Accept':'image/*'}
   });
   if(!response.ok)throw Error('HTTP '+response.status+' for '+record.asset_key);
   const mime=(response.headers.get('content-type')||'').split(';')[0];
   if(!types[path.extname(record.local_file)].includes(mime))throw Error('Not an allowed image: '+mime);
   if(!/^https:\/\/upload\.wikimedia\.org\//.test(response.url))
    throw Error('Unexpected redirect host: '+response.url);
   const data=Buffer.from(await response.arrayBuffer());
   if(data.length<800||data.length>5_000_000)throw Error('Unexpected image size '+data.length);
   if(path.extname(record.local_file)==='.jpg'&&(data[0]!==255||data[1]!==216))throw Error('Invalid JPEG header');
   if(path.extname(record.local_file)==='.png'&&data.subarray(1,4).toString()!=='PNG')throw Error('Invalid PNG header');
   return {record,data,mime,download_url:response.url,sha256:crypto.createHash('sha256').update(data).digest('hex')};
  }catch(e){finalError=e;await sleep(1000*(attempt+1));}
 }
 throw finalError;
}
(async()=>{
 const results=[];
 for(const record of list){
  results.push(await getImage(record));
  process.stdout.write(record.asset_key+': '+results.at(-1).data.length+' bytes\n');
 }
 // Nothing is written until every image download succeeds.
 fs.mkdirSync(output,{recursive:true});
 for(const item of results)fs.writeFileSync(path.join(output,item.record.local_file),item.data);
 fs.writeFileSync(path.join(output,'local-credits.json'),JSON.stringify({
  version:'2.0',downloaded_at:new Date().toISOString(),
  entries:results.map(x=>({...x.record,mime:x.mime,bytes:x.data.length,
   sha256:x.sha256,download_url:x.download_url,
   use_notice:'Commercial reuse under the identified source license; preserve exact author credit, license link, modification history and ShareAlike terms where applicable.'}))
 },null,2)+'\n');
})().catch(e=>{console.error(e);process.exitCode=1;});
