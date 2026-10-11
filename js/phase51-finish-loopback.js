/* KGA51 localhost-only preview transport. NO production API, NO Google writes. */
import { phase41BuildPreview } from './phase41-finish-preview.js';
const ENDPOINT='http://127.0.0.1:8765/preview';
export function phase51BuildTransport(room,ctx){
  const preview=phase41BuildPreview(room,ctx);
  if(preview.status!=='PREVIEW_ONLY')return {ok:false,code:preview.reason||preview.status};
  return {ok:true,payload:{status:'PREVIEW_ONLY',gameSessionId:preview.gameSessionId,playerCount:preview.players.length,players:preview.players.map(p=>({uid:p.uid,enteredName:p.enteredName,rawScore:p.rawScore,dailyRank:p.dailyRank}))}};
}
export async function phase51AfterFinish(room,ctx,options={}){
  if(options.hostname!=='localhost'&&options.hostname!=='127.0.0.1')return {ok:false,code:'LOCALHOST_ONLY'};
  const prepared=phase51BuildTransport(room,ctx);
  if(!prepared.ok)return prepared;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),3500);
  try{
    const fetcher=options.fetcher||fetch;
    const response=await fetcher(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(prepared.payload),signal:controller.signal});
    return await response.json();
  }catch(_){return {ok:false,code:'LOCAL_RECEIVER_UNAVAILABLE'};}
  finally{clearTimeout(timeout)}
}
