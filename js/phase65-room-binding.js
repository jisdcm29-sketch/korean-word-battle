/* Phase65 staging: teacher-authenticated room/class PIN registration ONLY.
 * No anonymous students, phone numbers, or StudentIDs here.
 * Host's Firebase ownership is not independently verified by Apps Script.
 */
import { getClassContext, bindGameRoom } from './class-manager.js?v=1.1';
export async function phase65BindRoom({pin, roomCreatedAt, ownerUid}){
  if(!['localhost','127.0.0.1'].includes(location.hostname) || new URLSearchParams(location.search).get('phase64')!=='1')return {ok:false,code:'NOT_STAGING'};
  const ctx=getClassContext();
  if(!ctx?.classId)return {ok:false,code:'NO_CLASS'};
  if(!/^\d{6}$/.test(String(pin)) || !ownerUid || !Number.isFinite(Number(roomCreatedAt)))return {ok:false,code:'BAD_ROOM'};
  try {
    const response=await bindGameRoom({pin:String(pin),classId:ctx.classId,roomCreatedAt:Number(roomCreatedAt),ownerUid:String(ownerUid)});
    return response?.ok?response:{ok:false,code:response?.code||'SERVER_NOT_READY'};
  }catch(_){return {ok:false,code:'SERVER_NOT_READY'};}
}
