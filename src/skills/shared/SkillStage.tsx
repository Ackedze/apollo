import React from 'react';
import assets from './assets.json';
import './skill-stage.css';

export function SkillStage({message,description,announce=true,idle=false}:{message:React.ReactNode;description?:React.ReactNode;announce?:boolean;idle?:boolean}) {
 return <div className={"apollo-shared-stage"+(idle?" is-idle":"")}>
  <img src={assets['mascot-neutral']} width={162} height={166} alt="" />
  <div className="apollo-shared-stage-copy"><p role={announce?'status':undefined}>{message}</p>
   {description&&<div className="apollo-shared-stage-description">{description}</div>}
  </div>
 </div>;
}
