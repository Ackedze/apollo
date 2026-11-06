import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Connection = { status: 'connected' | 'dependency' | 'not-connected' | 'unavailable' | 'stale'; reason: string };
type Contract = { componentId: string; contractId: string; name: string; library: string; platform: string; revision: number; manualSourceHash: string; updatedAt: string | null; checking: Connection; figma: Connection; frontend: Connection };
export type ContractData = { auditDataLoadedId?:string|null; auditData?:{schemaVersion:string;dataId:string;preparationVersion?:string;files:Array<{id:string;roles?:string[];channels?:string[];source?:{repo:string;path:string};sha256:string;bytes:number}>};auditDataError?:string; schemaVersion: string; rows: Contract[]; sources: { checking: Connection; figma: Connection; frontend: Connection } };
const labels = { connected: 'Подключён', dependency: 'В составе', 'not-connected': 'Не подключён', unavailable: 'Нет связи', stale: 'Данные устарели' };
const roleNames:Record<string,string>={'component-index':'Индекс компонентов','components-catalog':'Каталог компонентов','structure-catalog':'Каталог компонентов','tokens-catalog':'Токены','styles-catalog':'Стили','text-redpolicy':'Редакционные правила','reference-manifest':'Список каталогов','normalized-v3-policy':'Правила проверки V3','remediation-policy':'Правила исправлений','pattern-policy':'Паттерны','audit-policy':'Настройки проверки','v3-policy-index':'Индекс правил','v3-policy-agentContext':'Контекст компонента','v3-policy-auditMapping':'Сопоставление свойств','v3-policy-overrides':'Допустимые изменения','v3-policy-rules':'Правила компонента','v3-policy-generatedContract':'Правила V3','v3-policy-composition':'Состав компонента','v3-policy-examples':'Примеры'};
const names = { checking: 'Проверка', figma: 'Генерация Figma', frontend: 'Генерация Front' };
function Status({ value }: { value: Connection }) {
  return <span className={`apollo-data-status ${value.status}`} title={value.reason}>{labels[value.status]}<span className="design-check-sr-only">. {value.reason}</span></span>;
}
export function ContractDataModal({ readData, onClose, returnFocus }: { readData: () => Promise<ContractData>; onClose: () => void; returnFocus: React.RefObject<HTMLButtonElement | null> }) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId(), previous = useRef<ContractData | null>(null);
  const [data, setData] = useState<ContractData | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  useEffect(() => {
    const modal = dialog.current, opener = returnFocus.current;
    modal?.showModal();
    return () => { modal?.close(); if (opener?.isConnected) opener.focus(); };
  }, [returnFocus]);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setNotice('');
    void readData().then(value => {
      if (!active) return;
      if (revision) setNotice(JSON.stringify(previous.current) === JSON.stringify(value) ? 'Данные получены. Изменений нет.' : 'Список обновлён.');
      previous.current = value; setData(value);
    }).catch(() => { if (active) setError('Не удалось прочитать текущие данные плагина. Повтори загрузку.' + (previous.current ? ' Показаны последние полученные данные.' : '')); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [readData, revision]);
  return createPortal(<dialog ref={dialog} className="apollo-finding-dialog apollo-data-dialog" role="dialog" aria-labelledby={titleId} aria-modal="true"
    onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="apollo-finding-dialog-content">
      <header><h2 id={titleId}>Данные Apollo</h2><button type="button" aria-label="Закрыть данные Apollo" onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m6 6 12 12M18 6 6 18" /></svg></button></header>
      <div className="apollo-data-table-scroll" role="region" aria-label={data?.auditData||data?.auditDataError?'Данные проверки и генерации':'Таблица контрактов'} aria-busy={loading} tabIndex={0}>
      <p className="apollo-data-caption">{data?.auditData||data?.auditDataError?'Проверка использует пакет данных V3. Набор генерации показан отдельно ниже.':'Текущие версии контрактов из наборов проверки и генерации. «В составе» — зависимость другого компонента. Дата указана в самом контракте.'}</p>
      <p role="status">{loading ? (data ? 'Обновляем список…' : 'Читаем подключённые данные…') : notice}</p>
      {error && <p role="alert">{error}</p>}
      {data && <>
        {data.auditDataError&&<p className="apollo-data-notice" role="status">{data.auditDataError}</p>}
        {data.auditData&&<section aria-label="Данные проверки V3"><h3>Проверка V3</h3>
          <p>В пакете Proxy файлов: {data.auditData.files.length}.</p>
          <p role="status">{!data.auditDataLoadedId?'Набор будет проверен при запуске проверки.':data.auditDataLoadedId===data.auditData.dataId?'Этот набор использован в последней проверке.':'В Proxy новый набор данных. Закрой и заново открой Apollo перед проверкой.'}</p>
          <details><summary>Идентификатор набора данных</summary><p>{data.auditData.dataId}</p></details>
          <table><caption className="design-check-sr-only">Файлы пакета проверки V3</caption>
           <thead><tr><th scope="col">Файл</th><th scope="col">Назначение</th><th scope="col">Платформы</th></tr></thead>
           <tbody>{data.auditData.files.map(file=><tr key={file.id}><th scope="row">{file.source?.path||file.id}<small>{file.source?.repo}</small></th><td>{(file.roles||[]).map(role=>roleNames[role]||role).join(', ')||'Не указано'}</td><td>{(file.channels||[]).join(', ')||'Все'}</td></tr>)}</tbody>
          </table>
        </section>}
        {(data.auditData||data.auditDataError)&&<h3>Генерация</h3>}
        {Object.entries(data.sources).filter(([name, value]) => (!(data.auditData||data.auditDataError)||name!=='checking')&&value.status !== 'connected').map(([name, value]) => <p key={name} className="apollo-data-notice" role="status">{names[name as keyof typeof names]}: {value.reason}</p>)}
        {Object.entries(data.sources).some(([name,value]) => (!(data.auditData||data.auditDataError)||name!=='checking')&&value.status === 'stale') && <p className="apollo-data-caption">Требуется обновить подключение на Proxy. Здесь можно повторно получить список подключённых версий.</p>}
        {data.rows.length ? <table>
          <caption className="design-check-sr-only">{data.auditData||data.auditDataError?'Контракты генерации':'Контракты и подключение к проверке и генерации'}</caption>
          <thead><tr><th scope="col">Контракт</th>{!data.auditData&&!data.auditDataError&&<th scope="col">Проверка</th>}<th scope="col">Генерация Figma</th><th scope="col">Генерация Front</th><th scope="col">Дата обновления</th></tr></thead>
          <tbody>{data.rows.map(row => <tr key={row.contractId + ':' + row.manualSourceHash}>
            <th scope="row"><span>{row.name}</span><small>{row.platform === 'universal' ? 'Все платформы' : row.platform === 'mobile-web' ? 'Mobile web' : row.platform === 'desktop' ? 'Desktop' : row.platform} · r{row.revision}</small><small>{row.library}</small></th>
            {!data.auditData&&!data.auditDataError&&<td><Status value={row.checking} /></td>}<td><Status value={row.figma} /></td><td><Status value={row.frontend} /></td>
            <td>{row.updatedAt ? <time dateTime={row.updatedAt} title={row.updatedAt}>{new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Moscow' }).format(new Date(row.updatedAt))}</time> : 'Не указана'}</td>
          </tr>)}</tbody>
        </table> : <p role="status">Доступные контракты не получены.</p>}
      </>}
      </div>
      <div className="apollo-data-actions"><button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)}>{loading ? 'Загрузка…' : 'Обновить список'}</button></div>
    </div>
  </dialog>, document.body);
}
