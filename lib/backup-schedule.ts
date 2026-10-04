export type BackupSchedule = { enabled:boolean; frequency:'once'|'daily'|'weekly'|'monthly'; startDate:string; time:string; retentionDays:number };
export const backupTimeZone='Asia/Dubai';
export function parseBackupSchedule(value:unknown):BackupSchedule {
  const v=value as BackupSchedule;
  if(!v||typeof v.enabled!=='boolean'||!['once','daily','weekly','monthly'].includes(v.frequency)||!/^\d{4}-\d{2}-\d{2}$/.test(v.startDate)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time)||![7,30,90,365].includes(v.retentionDays))throw new Error('Choose a valid start date, time, frequency and retention period.');
  const date=new Date(`${v.startDate}T00:00:00Z`);
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==v.startDate)throw new Error('Choose a valid start date.');
  return {enabled:v.enabled,frequency:v.frequency,startDate:v.startDate,time:v.time,retentionDays:v.retentionDays};
}
/** UAE has a fixed UTC+04 offset. Missed repetitions collapse to one current snapshot. */
export function nextBackupAt(schedule:BackupSchedule,after=new Date(),inclusive=false):string|null {
  const start=new Date(`${schedule.startDate}T${schedule.time}:00+04:00`);
  const threshold=after.getTime()+(inclusive?0:1);
  if(start.getTime()>=threshold)return start.toISOString();
  if(schedule.frequency==='once')return null;
  if(schedule.frequency!=='monthly'){
    const interval=(schedule.frequency==='weekly'?7:1)*86400000;
    return new Date(start.getTime()+Math.ceil((threshold-start.getTime())/interval)*interval).toISOString();
  }
  const [year,month,day]=schedule.startDate.split('-').map(Number);
  const [hour,minute]=schedule.time.split(':').map(Number);
  const local=new Date(threshold+4*3600000);
  let offset=Math.max(0,(local.getUTCFullYear()-year)*12+local.getUTCMonth()-(month-1));
  for(let i=0;i<3;i++,offset++){
    const days=new Date(Date.UTC(year,month+offset,0)).getUTCDate();
    const candidate=new Date(Date.UTC(year,month-1+offset,Math.min(day,days),hour-4,minute));
    if(candidate.getTime()>=threshold)return candidate.toISOString();
  }
  throw new Error('Could not calculate the next backup time.');
}
