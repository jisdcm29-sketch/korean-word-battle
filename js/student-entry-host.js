// Only the join name is resolved. All other messages pass through unchanged.
import { getClassContext } from './class-manager.js?v=1.0';
import { listStudents } from './student-registry.js?v=1.1';
import { normalizePhone, resolvePlayerEntry } from './phone-name-resolver.js?v=entry-20261012';

export function withRegisteredStudentNames(handle, {getRoom, enabled=()=>true, onError=()=>{}}) {
  const context=getClassContext();
  let rosterPromise=null;
  const pending=new Map();
  async function receiveJoin(message) {
    const room=getRoom();
    if (!room || !enabled() || context?.mode!=='CLASS' || !context.classId) return handle(message);
    const entered=String(message.payload?.name??'').trim();
    if (!normalizePhone(entered)) return handle(message);
    const uid=message.payload?.uid||message.uid;
    if (room.players?.[uid]) return handle({...message,payload:{...message.payload,name:room.players[uid].name}});
    if (pending.has(uid)) return pending.get(uid);
    const task=(async()=>{
      try {
        rosterPromise ||= listStudents(context.classId).then(result=>{
          if (!result?.ok || !Array.isArray(result.students)) throw new Error('ROSTER_UNAVAILABLE');
          if (result.students.length && !result.students.some(s=>Object.hasOwn(s,'phoneNumber'))) throw new Error('PHONE_FIELD_UNAVAILABLE');
          return result.students;
        }).catch(error=>{rosterPromise=null;throw error;});
        const students=await rosterPromise;
        if (getRoom()!==room) return;
        const result=resolvePlayerEntry({mode:'CLASS',classId:context.classId,entered,students});
        if (!result.ok) {onError('등록 전화번호가 중복되거나 이름을 확인할 수 없습니다. 학생 정보를 확인해 주세요.');return;}
        return handle({...message,payload:{...message.payload,name:result.name}});
      } catch {
        if (getRoom()===room) onError('등록 전화번호 조회를 확인할 수 없습니다. 학생 조회 API를 확인한 뒤 다시 입장해 주세요.');
      } finally {pending.delete(uid);}
    })();
    pending.set(uid,task);
    return task;
  }
  return message=>message?.type==='join'?receiveJoin(message):handle(message);
}
