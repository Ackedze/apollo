import React, {useEffect,useId,useRef,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {Button} from '../../design-check/v3/ui-app/components/Button';
import {SkillDownloadMenu} from '../shared/SkillDownloadMenu';
import {SkillStage} from '../shared/SkillStage';
import '../../v3-audit/text-review-table.css';
import './ui.css';

const icons = require('../layer-names/assets');
const {BRIEF_HINTS, MAX_BRIEF, PLACEHOLDER, itemSource} = require('./protocol');
const progress: Record<string,string> = {
  reading:'Читаем выделение в Figma…',
  awaiting_approval:'Подтвердите отправку данных флоу в Apollo Proxy.',
  analyzing:'Собираем паспорт задачи…',
  saving:'Сохраняем паспорт в Figma…',
};
const tabs = [
  {id:'main', label:'Основное', section:null},
  {id:'flow', label:'Флоу', section:'Флоу'},
  {id:'editor', label:'Для редактора', section:'Для редактора'},
  {id:'assessment', label:'Для оценки', section:'Для оценки задачи'},
  {id:'questions', label:'Вопросы дизайнеру', section:'Вопросы дизайнеру'},
] as const;
const briefHint = 'С брифом паспорт будет точнее.';
const draftPrefix = 'Черновик: ';

type Tab = typeof tabs[number];
type Item = {value:string; source:string; screen:string|null; quote:string|null};
type Section = {title:string; rows:{label:string;items:Item[]}[]};
type PassportState = {
  phase:string; scope:string; brief:string; validSelection:boolean; available:boolean; error:string;
  briefInvalid:boolean; stale:boolean; saved:boolean;
  result:{status:'draft';sections:Section[]}|{status:'brief_insufficient';questions:string[]}|null;
};
type PassportClient = {
  subscribe:(listener:()=>void)=>()=>void; getState:()=>PassportState;
  cancel:()=>void; start:()=>Promise<void>; save:()=>Promise<void>; download:()=>void;
  edit:(value:string)=>void; editBrief:()=>void;
};

function passportView(state:PassportState,briefOpen:boolean) {
  if (state.phase !== 'saving' && progress[state.phase]) return 'progress';
  if (state.result?.status === 'draft') return 'result';
  if (briefOpen || state.briefInvalid || state.result?.status === 'brief_insufficient') return 'brief';
  return 'intro';
}

function itemKey({value,source,screen,quote}:Item) {
  return JSON.stringify([value,source,screen,quote]);
}

function PassportTabs({active,id,onSelect}:{active:Tab;id:string;onSelect:(tab:Tab)=>void}) {
  return <div className="apollo-text-tabs" role="tablist" aria-label="Разделы паспорта">
    {tabs.map((tab,index) => <button key={tab.id} type="button" role="tab" id={id+'-'+tab.id}
      aria-controls={id+'-preview'} aria-selected={tab === active} tabIndex={tab === active ? 0 : -1}
      onClick={() => onSelect(tab)}
      onKeyDown={event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const offset = event.key === 'ArrowLeft' ? -1 : 1;
        const next = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + offset + tabs.length) % tabs.length];
        onSelect(next);
        document.getElementById(id+'-'+next.id)?.focus();
      }}>{tab.label}</button>)}
  </div>;
}

function PassportValue({item,label}:{item:Item;label:string}) {
  if (label === 'Статус' && item.source === 'none' && item.value.startsWith(draftPrefix)) return <>
    <span className="apollo-passport-draft">Черновик</span>
    <small>{item.value.slice(draftPrefix.length)}</small>
  </>;
  const source = itemSource(item);
  return <>
    <span>{item.value}</span>
    {source && <small>{source}</small>}
    {item.quote && item.quote !== item.value && <details><summary>Цитата из источника</summary><blockquote>{item.quote}</blockquote></details>}
  </>;
}

function PassportPreview({sections,tab,id}:{sections:Section[];tab:Tab;id:string}) {
  const shown = sections.filter(section => tab.section
    ? section.title === tab.section
    : !tabs.some(option => option.section === section.title));
  const questions = tab.id === 'questions' ? shown.flatMap(section => section.rows.flatMap(row => row.items)) : [];
  const noQuestions = questions.length === 1 && questions[0].value === 'Не указано' && questions[0].source === 'none';
  return <div className="apollo-passport-preview" id={id+'-preview'} role="tabpanel" aria-labelledby={id+'-'+tab.id} tabIndex={0}>
    {(shown.length === 0 || noQuestions) && <p className="apollo-passport-panel">Не указано</p>}
    {questions.length > 0 && !noQuestions && <ol className="apollo-passport-panel apollo-passport-questions" role="list">
      {questions.map((item,index) => <li key={itemKey(item)} data-source={item.source}>
        <span aria-hidden="true">{index+1}.</span>
        <div><PassportValue item={item} label="" /></div>
      </li>)}
    </ol>}
    {tab.id !== 'questions' && shown.map(section => <section className="apollo-passport-panel" key={section.title}>
      {tab.id === 'main' && <h3>{section.title}</h3>}
      <dl>{section.rows.map(row => <div key={row.label}>
        <dt>{row.label}</dt>
        {row.items.map(item => <dd key={itemKey(item)} data-source={item.source}><PassportValue item={item} label={row.label} /></dd>)}
      </div>)}</dl>
    </section>)}
  </div>;
}

function BriefForm({client,state,id}:{client:PassportClient;state:PassportState;id:string}) {
  const form = useRef<HTMLTextAreaElement>(null);
  const questions = state.result?.status === 'brief_insufficient' ? state.result.questions : [];
  useEffect(() => {
    form.current?.focus();
  },[state.briefInvalid]);
  return <>
    {questions.length > 0 && <section aria-labelledby={id+'-questions'}>
      <h3 id={id+'-questions'}>Дополните бриф</h3>
      <ul>{questions.map(question => <li key={question}>{question}</li>)}</ul>
    </section>}
    <label htmlFor={id+'-brief'}>Бриф дизайнера (необязательно)</label>
    <p className="apollo-passport-hint" id={id+'-brief-note'}>{briefHint}</p>
    <ol id={id+'-hint'}>{BRIEF_HINTS.map((hint:string) => <li key={hint}>{hint}</li>)}</ol>
    <textarea ref={form} id={id+'-brief'} aria-invalid={state.briefInvalid}
      aria-describedby={id+'-brief-note '+id+'-hint'+(state.briefInvalid ? ' '+id+'-error' : '')}
      maxLength={MAX_BRIEF} value={state.brief} onChange={event => client.edit(event.currentTarget.value)}
      placeholder={PLACEHOLDER} rows={8} />
  </>;
}

function Actions({client,state,stage,showForm,toggleBrief,newPassport}:{
  client:PassportClient;state:PassportState;stage?:string;showForm:boolean;toggleBrief:()=>void;newPassport:()=>void;
}) {
  if (state.phase === 'saving') return <Button label="Сохраняем в Figma" loading disabled onPress={() => {}} />;
  if (stage) return <Button label="Остановить" type="secondary" loading onPress={client.cancel} />;
  if (state.result?.status === 'draft') return <Button label="Создать новый паспорт" onPress={newPassport} />;
  return <>
    <Button label={showForm ? 'Готово' : state.brief.trim() ? 'Изменить бриф' : 'Заполнить бриф'} type="secondary" onPress={toggleBrief} />
    <Button label="Собрать паспорт" disabled={!state.validSelection} onPress={() => void client.start()} />
  </>;
}

function Content({client,state,id,stage,showForm,tab}:{
  client:PassportClient;state:PassportState;id:string;stage?:string;showForm:boolean;tab:Tab;
}) {
  if (stage) return <SkillStage idle message={stage} announce={false}
    description={<p className="apollo-skill-scope-name" title={state.scope}>{state.scope}</p>} />;
  if (!showForm && state.result?.status !== 'draft') return <>
    <SkillStage idle message={<>Посмотрю макеты, сформирую описание<br />и паспорт задачи</>} announce={false} description={<>
      <p className="apollo-skill-scope-name" title={state.scope} role="status">{state.scope || 'Выбери область и запусти проверку'}</p>
      {!state.brief.trim() && <p className="apollo-passport-stage-hint">{briefHint}</p>}
    </>} />
    {state.error && <p className="apollo-passport-error apollo-passport-stage-error" role="alert">{state.error}</p>}
  </>;
  return <>
    {state.error && <p className="apollo-passport-error" id={id+'-error'} role="alert">{state.error}</p>}
    {state.stale && <p role="status">Выделение изменилось. Соберите паспорт заново перед сохранением.</p>}
    {state.saved && <p role="status">Паспорт сохранён рядом с флоу.</p>}
    {state.result?.status === 'draft' ? <>
      {!state.available && !state.saved && <p role="status">Сохранить паспорт в Figma можно после завершения другой операции Apollo.</p>}
      <PassportPreview sections={state.result.sections} tab={tab} id={id} />
    </> : <>
      <p className="apollo-passport-scope" role="status">{state.scope || 'Выделите секцию, группу или экраны в Figma.'}</p>
      <BriefForm client={client} state={state} id={id} />
    </>}
  </>;
}

function PassportFiles({client,state,hasResult,saving}:{client:PassportClient;state:PassportState;hasResult:boolean;saving:boolean}) {
  return <SkillDownloadMenu canReport={hasResult && !saving} canInput={hasResult && !state.stale && !state.saved && state.available}
    inputLoading={saving} onReport={client.download} onInput={() => void client.save()} filesLabel="Действия с файлом паспорта"
    triggerLabel="Открыть действия с паспортом" reportLabel="Скачать CSV" inputLabel="Сохранить в Figma" />;
}

export function TaskPassportSkill({client}:{client:PassportClient}) {
  const state = useSyncExternalStore(client.subscribe,client.getState);
  const [open,setOpen] = useState(false);
  const [briefOpen,setBriefOpen] = useState(false);
  const [tab,setTab] = useState<Tab>(tabs[0]);
  const id = useId(), card = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLElement>(null);
  const saving = state.phase === 'saving';
  const view = passportView(state,briefOpen);
  const stage = view === 'progress' ? progress[state.phase] : undefined;
  const hasResult = view === 'result';
  const showForm = view === 'brief';
  useEffect(() => {
    if (!open) return;
    const node = dialog.current, opener = card.current;
    node?.showModal();
    return () => { node?.close(); opener?.focus({preventScroll:true}); };
  },[open]);
  useEffect(() => {
    if (open && !dialog.current?.contains(document.activeElement)) content.current?.focus();
  },[open,view,saving]);
  const close = () => { if (!saving) setOpen(false); };
  function selectTab(next:Tab) {
    setTab(next);
    if (content.current) content.current.scrollTop = 0;
  }
  function toggleBrief() {
    if (state.result?.status === 'brief_insufficient') client.editBrief();
    setBriefOpen(!showForm);
  }
  function newPassport() {
    client.editBrief();
    client.edit('');
    setBriefOpen(false);
    selectTab(tabs[0]);
  }

  return <>
    <button ref={card} className="apollo-skill-card apollo-passport-card" type="button" aria-haspopup="dialog"
      aria-labelledby={id+'-card'} aria-describedby={id+'-agent '+id+'-description'} onClick={() => setOpen(true)}>
      <span className="apollo-skill-copy">
        <span className="apollo-skill-title"><strong id={id+'-card'}>Паспорт задачи</strong>
          <span className="apollo-skill-agent-label" id={id+'-agent'}>Агент</span></span>
        <span id={id+'-description'}>{stage || 'Соберёт для редактора описание задачи, сценарий по экранам и вопросы к брифу'}</span>
      </span>
      <img className="apollo-skill-chevron" src={icons['chevron-right']} alt="" />
    </button>
    {open && createPortal(<dialog ref={dialog} className="apollo-skill-dialog apollo-passport-dialog apollo-new" aria-labelledby={id+'-title'}
      onCancel={event => {event.preventDefault(); close();}}>
      <header className={'apollo-skill-header'+(hasResult ? ' apollo-passport-header-tabs' : '')}>
        <h2 id={id+'-title'}>Паспорт задачи</h2>
        <button className="apollo-skill-close" type="button" aria-label="Закрыть паспорт задачи"
          disabled={saving} onClick={close}><img src={icons.close} alt="" /></button>
        {hasResult && <PassportTabs active={tab} id={id} onSelect={selectTab} />}
      </header>
      {(stage || saving) && <p className="design-check-sr-only" role="status">{stage || progress.saving}</p>}
      <main ref={content} className="apollo-skill-content apollo-passport-content" data-view={view} tabIndex={-1} aria-busy={!!stage || saving}>
        <Content client={client} state={state} id={id} stage={stage} showForm={showForm} tab={tab} />
      </main>
      <footer className="apollo-skill-footer" aria-label="Действия паспорта задачи"><div className="apollo-skills-actions">
        <Actions client={client} state={state} stage={stage} showForm={showForm} toggleBrief={toggleBrief} newPassport={newPassport} />
      </div></footer>
      <PassportFiles client={client} state={state} hasResult={hasResult} saving={saving} />
    </dialog>,document.body)}
  </>;
}
