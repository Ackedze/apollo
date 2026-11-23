'use strict';
function patternGroups(checks=[]){
 const result={errors:[],warnings:[],unchecked:[]};
 for(const check of checks){
  if(check.status==='FAIL')result[/^(warning|recommendation|info)$/i.test(check.severity||'')?'warnings':'errors'].push(check);
  else if(['UNKNOWN','NOT_CHECKED'].includes(check.status))result.unchecked.push(check);
 }
 return result;
}
module.exports={patternGroups};
