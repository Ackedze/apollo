const METHODS=Object.freeze(['mcp','built-in']);
const DEFAULT_METHOD='mcp';
function validMethod(value){return METHODS.includes(value);}
function methodFor(target,value=DEFAULT_METHOD){
 if(target==='frontend'||target==='figma')return null;
 if(target!=='figma-owned')throw Error('AGENT_METHOD_TARGET_INVALID');
 if(!validMethod(value))throw Error('AGENT_METHOD_INVALID');
 return value;
}
module.exports={METHODS,DEFAULT_METHOD,validMethod,methodFor};
