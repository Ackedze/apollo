import type {ScreenSpec} from './planning/types';
/** Additive envelope: closed ScreenSpec v2 stays unchanged. */
export type ScreenVersion={schemaVersion:'apollo.screen-version.v1-experimental';id:string;revision:number;parentHash:string|null;inputHash:string;page:{background:string};spec:ScreenSpec;specHash:string;versionHash:string};
export type AgentIdentity={runId:string;revision:number;specHash:string;contextHash:string;target:'frontend'|'figma'};
export type AgentCapability='workspace.files'|'workspace.build'|'workspace.browser'|'read_document_context'|'read_owned_scope';
export type AgentCheck={id:string;status:'passed'|'failed'|'unknown'|'not-applicable';origin:'tool-observation'|'agent-report'|'synthetic';message:string;evidenceHash:string|null};
export type AgentArtifact={id:string;entryPath:'dist/index.html';files:Array<{path:string;sha256:string;bytes:number}>};
export type AgentRunSnapshot={schemaVersion:'apollo.agent-run-snapshot.v1';identity:AgentIdentity;sequence:number;status:'queued'|'running'|'awaiting-operation'|'question'|'completed'|'blocked'|'failed'|'cancelled';capabilities:AgentCapability[];progress:Array<{sequence:number;kind:'context'|'agent'|'tool'|'check'|'repair';message:string}>;pendingOperation:null|{callId:string;sequence:number;nonce:string;operation:'read_document_context'|'read_owned_scope';arguments:{nodeIds:string[]}};result:null|{message:string;artifact:AgentArtifact|null;checks:AgentCheck[];writesPerformed:boolean;acceptedWriteOperations:never[];Ready:false};gaps:Array<{code:string;message:string}>;snapshotHash:string};

export type AgentNativeFact={id:string;type:string;x:number|null;y:number|null;width:number|null;height:number|null};
export type AgentObservation={schemaVersion:'apollo.agent-observation.v1';identity:AgentIdentity;callId:string;sequence:number;nonce:string;status:'passed'|'failed'|'unknown';document:{fileKey:string|null;pageId:string|null};epoch:number|null;beforeHash:string|null;afterHash:string|null;facts:AgentNativeFact[];gaps:Array<{code:string;message:string}>;writesPerformed:false;evidenceHash:string};
