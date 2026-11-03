"use client";
import { useId, useState } from "react";
import type { ManagedCompetition, ManagedPackage } from "@/lib/admin/settings-schemas";
import { savedVotingDate, koboToNgn, saveSettings, SettingsMutationError, toLagos } from "@/lib/admin/settings-mutations";
const transitions = { DRAFT:["DRAFT","SCHEDULED","OPEN"], SCHEDULED:["SCHEDULED","DRAFT","OPEN"], OPEN:["OPEN","CLOSED"], CLOSED:["CLOSED","OPEN","COMPLETED"], COMPLETED:["COMPLETED"] };
function useSave() {
  const [busy,setBusy] = useState(false), [error,setError] = useState(""), [fields,setFields] = useState<Record<string,string>>({});
  const summaryId = useId();
  return { busy,error,fields,summaryId, start() { setBusy(true);setError("");setFields({}); }, fail(caught: unknown) { setBusy(false);setError(caught instanceof SettingsMutationError ? caught.message : "Unable to save. Check the inputs and try again.");setFields(caught instanceof SettingsMutationError ? caught.fields : {});requestAnimationFrame(()=>document.getElementById(summaryId)?.focus()); } };
}
function Errors({ state }: { state: ReturnType<typeof useSave> }) { return state.error ? <div id={state.summaryId} role="alert" tabIndex={-1} className="admin-error-summary"><p>{state.error}</p>{Object.entries(state.fields).map(([field,message])=><p key={field}>{message}</p>)}</div> : null; }
export function CompetitionForm({ competition }: { competition: ManagedCompetition }) {
  const state=useSave();
  const [values,setValues]=useState({name:competition.name,description:competition.description||"",status:competition.status,votingOpens:toLagos(competition.votingOpens),votingCloses:toLagos(competition.votingCloses)});
  return <form className="admin-contestant-form" aria-busy={state.busy} onSubmit={async event=>{event.preventDefault();if(state.busy)return;state.start();try{
    await saveSettings("competition",{...values,description:values.description||null,votingOpens:savedVotingDate(values.votingOpens,competition.votingOpens),votingCloses:savedVotingDate(values.votingCloses,competition.votingCloses),expectedUpdatedAt:competition.updatedAt});
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/admin/competition?saved=1");
  }catch(error){state.fail(error);}}}>
    <p>Current status: <strong>{competition.status}</strong></p><p className="admin-field-help">Voting opens only after you select OPEN and save. Dates use Africa/Lagos (UTC+01:00).</p>
    <Errors state={state}/><fieldset disabled={state.busy}><legend className="admin-sr-only">Competition settings</legend>
    <div className="admin-field"><label htmlFor="competition-name">Competition name</label><input id="competition-name" required maxLength={120} value={values.name} aria-invalid={Boolean(state.fields.name)} onChange={e=>setValues({...values,name:e.target.value})}/></div>
    <div className="admin-field"><label htmlFor="competition-description">Description</label><textarea id="competition-description" maxLength={5000} rows={5} value={values.description} aria-invalid={Boolean(state.fields.description)} onChange={e=>setValues({...values,description:e.target.value})}/></div>
    <div className="admin-field"><label htmlFor="competition-status">Status</label><select id="competition-status" value={values.status} onChange={e=>setValues({...values,status:e.target.value as typeof values.status})}>{["DRAFT","SCHEDULED","OPEN","CLOSED","COMPLETED"].map(status=><option key={status} disabled={!transitions[competition.status].includes(status)}>{status}</option>)}</select></div>
    <div className="admin-form-grid">{(["votingOpens","votingCloses"] as const).map(field=><div className="admin-field" key={field}><label htmlFor={field}>{field==="votingOpens"?"Voting opens":"Voting closes"} (Africa/Lagos)</label><input id={field} type="datetime-local" disabled={competition.status==="COMPLETED"} value={values[field]} aria-invalid={Boolean(state.fields[field])} onChange={e=>setValues({...values,[field]:e.target.value})}/></div>)}</div>
    <button className="admin-button" type="submit">{state.busy?"Saving…":"Save competition"}</button></fieldset>
  </form>;
}
export function PackageForm({ item }: { item?: ManagedPackage }) {
  const prefix=useId(),state=useSave();
  const [values,setValues]=useState({name:item?.name||"",voteCount:item?String(item.voteCount):"",priceNgn:item?koboToNgn(item.priceKobo):"",isActive:item?.isActive??true});
  return <form className="admin-contestant-form" aria-busy={state.busy} onSubmit={async event=>{event.preventDefault();if(state.busy)return;state.start();try{
    if(!/^[1-9][0-9]{0,9}$/.test(values.voteCount))throw new SettingsMutationError("Enter a positive whole number of votes.",{voteCount:"Enter a positive whole number of votes."});
    await saveSettings("vote-packages",{...values,voteCount:Number(values.voteCount),...(item?{expectedUpdatedAt:item.updatedAt}:{})},item?.id);
    const url=new URL(window.location.href);url.searchParams.set("saved",item?"updated":"created");window.location.assign(url.pathname+url.search);
  }catch(error){state.fail(error);}}}>
    {item&&<p>Status: <strong>{item.isActive?"Active":"Inactive"}</strong></p>}<Errors state={state}/><fieldset disabled={state.busy}><legend className="admin-sr-only">{item?"Edit":"Create"} vote package</legend>
    <div className="admin-field"><label htmlFor={`${prefix}-name`}>Package name</label><input id={`${prefix}-name`} required maxLength={120} value={values.name} aria-invalid={Boolean(state.fields.name)} onChange={e=>setValues({...values,name:e.target.value})}/></div>
    <div className="admin-form-grid"><div className="admin-field"><label htmlFor={`${prefix}-votes`}>Number of votes</label><input id={`${prefix}-votes`} inputMode="numeric" pattern="[1-9][0-9]*" required maxLength={10} value={values.voteCount} aria-invalid={Boolean(state.fields.voteCount)} onChange={e=>setValues({...values,voteCount:e.target.value})}/></div>
    <div className="admin-field"><label htmlFor={`${prefix}-price`}>Price (NGN)</label><input id={`${prefix}-price`} inputMode="decimal" required maxLength={11} value={values.priceNgn} aria-invalid={Boolean(state.fields.priceNgn)} aria-describedby={`${prefix}-price-help`} onChange={e=>setValues({...values,priceNgn:e.target.value})}/><p id={`${prefix}-price-help`} className="admin-field-help">₦50.00 minimum. Use up to two decimal places.</p></div></div>
    <div className="admin-field"><label className="admin-checkbox" htmlFor={`${prefix}-active`}><input id={`${prefix}-active`} type="checkbox" checked={values.isActive} onChange={e=>setValues({...values,isActive:e.target.checked})}/>Active package</label><p className="admin-field-help">Deactivating prevents new purchases. Existing payment amounts and votes are preserved.</p></div>
    <button className="admin-button" type="submit">{state.busy?"Saving…":item?"Save package":"Create package"}</button></fieldset>
  </form>;
}
