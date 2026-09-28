import { ACCESS_API_URL } from './access-config.js?v=1.3';
import { getStoredAccess, getDeviceId } from './access-control.js?v=1.6';

let requestSeq=0;
function clean(v){return String(v??'').trim();}
function apiReady(){return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/i.test(clean(ACCESS_API_URL));}
function authPayload(){const access=getStoredAccess();if(!access?.sessionToken||!access?.licenseId)throw new Error('NO_TEACHER_SESSION');return{sessionToken:access.sessionToken,deviceId:getDeviceId()};}

function callApi(action,payload={}){
  if(!apiReady())return Promise.reject(new Error('ACCESS_API_NOT_CONFIGURED'));
  const id=`kwb-student-${Date.now()}-${++requestSeq}-${Math.random().toString(36).slice(2)}`;
  const frame=document.createElement('iframe');
  const frameName=`kwbStudentFrame_${id.replace(/[^A-Za-z0-9_]/g,'_')}`;
  frame.name=frameName;frame.title='KWB student response';frame.setAttribute('aria-hidden','true');
  Object.assign(frame.style,{position:'fixed',width:'1px',height:'1px',opacity:'0',pointerEvents:'none',border:'0',left:'-9999px',top:'-9999px'});
  const form=document.createElement('form');form.method='POST';form.action=ACCESS_API_URL;form.target=frameName;form.acceptCharset='UTF-8';form.style.display='none';
  const add=(name,value)=>{const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);};
  add('requestId',id);add('parentOrigin',location.origin);add('payload',JSON.stringify({action,...payload,clientTime:new Date().toISOString()}));
  return new Promise((resolve,reject)=>{
    let settled=false;
    const cleanup=()=>{window.removeEventListener('message',onMessage);try{form.remove();}catch{}try{frame.remove();}catch{}};
    const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);cleanup();fn(value);};
    const onMessage=(ev)=>{
      const origin=String(ev.origin||'');
      const trusted=origin==='https://script.google.com'||origin==='https://script.googleusercontent.com'||/^https:\/\/[A-Za-z0-9.-]+\.googleusercontent\.com$/i.test(origin);
      if(!trusted||!ev.data||typeof ev.data!=='object'||ev.data.type!=='KWB_ACCESS_RESPONSE'||ev.data.id!==id)return;
      finish(resolve,ev.data.result||{ok:false,code:'INVALID_RESPONSE'});
    };
    window.addEventListener('message',onMessage);
    const timer=setTimeout(()=>finish(reject,new Error('STUDENT_API_TIMEOUT')),20000);
    document.body.appendChild(frame);document.body.appendChild(form);
    try{form.submit();form.remove();}catch(err){finish(reject,err);}
  });
}

export function listStudents(classId){return callApi('listStudents',{...authPayload(),classId:clean(classId)});}
export function saveStudent(classId,{studentId='',displayName='',aliases='',possibleNames=''}={}){
  return callApi('saveStudent',{...authPayload(),classId:clean(classId),studentId:clean(studentId),displayName:clean(displayName),aliases,possibleNames});
}
export function deleteStudent(classId,studentId){
  return callApi('deleteStudent',{...authPayload(),classId:clean(classId),studentId:clean(studentId)});
}
export function resolveStudentName(classId,enteredName){return callApi('resolveStudentName',{...authPayload(),classId:clean(classId),enteredName:clean(enteredName)});}
export function resolveNameCandidate(classId,{candidateId,decision,studentId=''}={}){
  return callApi('resolveNameCandidate',{...authPayload(),classId:clean(classId),candidateId:clean(candidateId),decision:clean(decision),studentId:clean(studentId)});
}
export function saveDailyResults(classId,{gameSessionId='',gameId='',players=[],dailyLuckyName='',overwrite=false}={}){
  return callApi('saveDailyResults',{...authPayload(),classId:clean(classId),gameSessionId:clean(gameSessionId),gameId:clean(gameId),players:Array.isArray(players)?players:[],dailyLuckyName:clean(dailyLuckyName),overwrite:!!overwrite});
}
export function getWeeklyRanking(classId,weekId=''){
  return callApi('getWeeklyRanking',{...authPayload(),classId:clean(classId),weekId:clean(weekId)});
}
export function getWeeklyAwardState(classId,weekId=''){
  return callApi('getWeeklyAwardState',{...authPayload(),classId:clean(classId),weekId:clean(weekId)});
}
export function finalizeWeeklyAwards(classId,weekId=''){
  return callApi('finalizeWeeklyAwards',{...authPayload(),classId:clean(classId),weekId:clean(weekId)});
}
export function drawWeeklyLucky(classId,weekId=''){
  return callApi('drawWeeklyLucky',{...authPayload(),classId:clean(classId),weekId:clean(weekId)});
}
export function drawWeeklyConsolation(classId,weekId=''){
  return callApi('drawWeeklyConsolation',{...authPayload(),classId:clean(classId),weekId:clean(weekId)});
}
export function createWeeklyTestData(classId){
  return callApi('createWeeklyTestData',{...authPayload(),classId:clean(classId)});
}
export function clearWeeklyTestData(classId,weekId=''){
  return callApi('clearWeeklyTestData',{...authPayload(),classId:clean(classId),weekId:clean(weekId)});
}
