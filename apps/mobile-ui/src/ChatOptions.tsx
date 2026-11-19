import { Children, Fragment, isValidElement, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useDialogNavigation } from './dialogs';
import { useLanguage } from './language';

type SectionProps={id:string;title:string;description:string;icon:ReactNode;children:ReactNode};
export function ChatOptionSection({children}:SectionProps){return <>{children}</>;}

function hasActions(children:ReactNode):boolean {
  return Children.toArray(children).some(child=>isValidElement<{children?:ReactNode}>(child)&&
    (child.type===Fragment?hasActions(child.props.children):true));
}
export function optionSections(children:ReactNode):SectionProps[] {
  return Children.toArray(children).flatMap(child=>isValidElement<SectionProps>(child)&&child.type===ChatOptionSection&&hasActions(child.props.children)?[child.props]:[]);
}

/** Only the selected section mounts its actions. Browsing never executes a chat operation. */
export function ChatOptions({quick,children}:{quick:ReactNode;children:ReactNode}){
  const {t}=useLanguage();
  const [selected,setSelected]=useState('');
  const sections=optionSections(children),section=sections.find(item=>item.id===selected);
  const heading=useRef<HTMLHeadingElement>(null),trigger=useRef('');
  const triggers=useRef(new Map<string,HTMLButtonElement>());
  const panelId=useId();
  useLayoutEffect(()=>{
    if(section)heading.current?.focus();
    else triggers.current.get(trigger.current)?.focus();
  },[selected]);
  useDialogNavigation(!!section,()=>setSelected(''));
  return <div className="chat-options">
    {section?<section className="chat-options-section" id={panelId} aria-labelledby={panelId+'-title'}>
      <button type="button" className="chat-options-back" onClick={()=>setSelected('')}><ArrowLeft size={17}/>{t('Todas las opciones')}</button>
      <div className="chat-options-heading"><span aria-hidden="true">{section.icon}</span><div><h3 ref={heading} tabIndex={-1} id={panelId+'-title'}>{t(section.title)}</h3><p>{t(section.description)}</p></div></div>
      <div className="action-list chat-options-actions">{section.children}</div>
    </section>:<>
      <div className="chat-options-quick" role="group" aria-label={t('Accesos rápidos')}>{quick}</div>
      <p className="chat-options-hint">{t('¿Qué quieres hacer en este chat?')}</p>
      <div className="chat-options-grid">{sections.map(item=><button key={item.id} ref={node=>{if(node)triggers.current.set(item.id,node);else triggers.current.delete(item.id);}} type="button" className="chat-options-category" aria-controls={panelId} aria-label={t(item.title)} onClick={()=>{trigger.current=item.id;setSelected(item.id);}}>
        <span className="chat-options-category-icon" aria-hidden="true">{item.icon}</span><strong>{t(item.title)}</strong><small>{t(item.description)}</small><ChevronRight size={16} aria-hidden="true"/>
      </button>)}</div>
    </>}
  </div>;
}
