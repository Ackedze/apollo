'use strict';
// V3 naming: Figma user, local date and time. No OS/account inference.
const slugifyUserName=value=>String(value||'Unknown-User').trim().replace(/[^a-zA-Z0-9А-Яа-яЁё._-]+/g,'-').replace(/-+/g,'-').replace(/^[-_.]+|[-_.]+$/g,'').slice(0,120)||'Unknown-User';
function timestamp(date,utc=false){
 const get=part=>date[(utc?'getUTC':'get')+part](),pad=n=>String(n).padStart(2,'0');
 return `${pad(get('Date'))}-${pad(get('Month')+1)}-${get('FullYear')}_${pad(get('Hours'))}-${pad(get('Minutes'))}-${pad(get('Seconds'))}`;
}
function createFiling(userName,origin,date){
 const name=String(userName||'Unknown-User').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,160)||'Unknown-User',slug=slugifyUserName(name);
 return {user:{name,slug},suggestedFileName:`${slug}_${timestamp(date)}_metrics-${origin}.json`};
}
function validFiling(report){
 const {user,suggestedFileName,origin}=report;
 if(!user||Object.keys(user).sort().join(',')!=='name,slug'||typeof user.name!=='string'||!user.name.trim()||user.name.length>160||/[\u0000-\u001f\u007f]/.test(user.name)||user.slug!==slugifyUserName(user.name)||typeof suggestedFileName!=='string')return false;
 const prefix=user.slug+'_',suffix=`_metrics-${origin}.json`;
 if(!suggestedFileName.startsWith(prefix)||!suggestedFileName.endsWith(suffix))return false;
 const stamp=suggestedFileName.slice(prefix.length,-suffix.length),match=/^(\d{2})-(\d{2})-(\d{4})_(\d{2})-(\d{2})-(\d{2})$/.exec(stamp);
 if(!match)return false;
 const [,day,month,year,hour,minute,second]=match.map(Number),date=new Date(Date.UTC(year,month-1,day,hour,minute,second));
 return timestamp(date,true)===stamp;
}
function reportPath(report){
 const filing=report.user?report:createFiling('Unknown-User',report.origin,new Date(report.startedAt));
 // Old reports have no author or local timezone; retain the recorded UTC time.
 const name=report.user?filing.suggestedFileName:`Unknown-User_${timestamp(new Date(report.startedAt),true)}_metrics-${report.origin}.json`;
 return `${report.excludeFromAnalytics?'apollo/tests':'apollo/stats'}/${filing.user.slug}/${name.slice(filing.user.slug.length+1,filing.user.slug.length+11)}/${name}`;
}
module.exports={slugifyUserName,timestamp,createFiling,validFiling,reportPath};
