import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CompetitionForm, PackageForm } from "../src/components/admin/settings-forms";
import { SettingsLoading, SettingsUnavailable } from "../src/components/admin/settings-states";
import { fromLagos, koboToNgn, savedVotingDate, saveSettings, SettingsMutationError, toLagos } from "../src/lib/admin/settings-mutations";
import type { ManagedCompetition, ManagedPackage } from "../src/lib/admin/settings-schemas";
import { patchCompetition } from "../../api/src/validation/admin-settings";
const competition:ManagedCompetition={id:"show",name:"<script>Show</script>",description:"Description",slug:"show",status:"OPEN",currency:"NGN",votingOpens:"2030-01-01T10:00:00.000Z",votingCloses:"2030-01-02T10:00:00.000Z",createdAt:"2026-11-03T00:00:00.000Z",updatedAt:"2026-11-03T00:00:00.000Z",leaderboardVisibility:"HIDDEN",resultsPublishedAt:null};
const item:ManagedPackage={id:"package",competitionId:"show",name:"Starter",voteCount:7,priceKobo:5001,currency:"NGN",isActive:false,createdAt:competition.createdAt,updatedAt:competition.updatedAt};
test("forms label editable settings, current state and NGN pricing without editable attribution or raw kobo",()=>{
  const html=renderToStaticMarkup(<CompetitionForm competition={competition}/>);
  for(const text of ["Competition name","Description","Status","Africa/Lagos","Voting opens","Voting closes","Save competition"])assert.ok(html.includes(text));
  assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
  const packages=renderToStaticMarkup(<PackageForm item={item}/>);assert.match(packages,/Inactive/);assert.match(packages,/50.01/);assert.match(packages,/Number of votes/);assert.match(packages,/Price \(NGN\)/);assert.doesNotMatch(packages,/name="competitionId"|name="priceKobo"/);
  assert.match(renderToStaticMarkup(<PackageForm/>),/Create package/);assert.match(renderToStaticMarkup(<SettingsLoading/>),/role="status"/);assert.match(renderToStaticMarkup(<SettingsUnavailable status={404}/>),/No competition is configured/);
});
test("money display and Lagos inputs preserve exact values, UTC offsets and invalid calendar dates",()=>{
  assert.equal(koboToNgn(2147483647),"21474836.47");assert.equal(koboToNgn(5001),"50.01");
  assert.equal(toLagos(competition.votingOpens),"2030-01-01T11:00");assert.equal(fromLagos("2030-01-01T11:00"),competition.votingOpens);assert.equal(fromLagos(""),null);
  assert.throws(()=>fromLagos("2030-02-30T10:00"));assert.throws(()=>fromLagos("invalid"));
  const precise="2030-01-01T10:00:12.345Z";assert.equal(savedVotingDate(toLagos(precise),precise),precise);
});
test("voting times accept browser seconds and preserve Lagos dates across midnight",()=>{
  assert.equal(fromLagos("2030-01-01T11:00:00"),"2030-01-01T10:00:00.000Z");
  assert.equal(fromLagos("2030-01-01T11:00:12.345"),"2030-01-01T10:00:12.345Z");
  assert.equal(fromLagos("2030-01-01T11:00:12.3"),"2030-01-01T10:00:12.300Z");
  assert.equal(fromLagos("2030-01-01T00:00"),"2029-12-31T23:00:00.000Z");
  assert.equal(fromLagos("2028-02-29T23:59"),"2028-02-29T22:59:00.000Z");
  for (const value of ["2030-02-29T12:00", "2030-01-01T24:00", "2030-01-01T12:60", "2030-01-01T12:00:60", "2030-01-01T12:", "2030-01-01T:30"]) {
    assert.throws(()=>fromLagos(value),SettingsMutationError);
  }
});
test("settings mutations send CSRF and decimal price strings and redact provider failures",async()=>{
  const original=globalThis.fetch;const calls:{url:string;options?:RequestInit}[]=[];let mode="success";
  try{
    globalThis.fetch=(async(url,options)=>{calls.push({url:String(url),options});if(String(url).endsWith("/csrf"))return Response.json({data:{csrfToken:"fixture"}});if(mode==="stale")return Response.json({code:"SETTINGS_CHANGED",message:"private details"},{status:409});if(mode==="failure")return Response.json({message:"private details"},{status:500});return Response.json({status:"success",data:String(url).includes("competition")?competition:item});}) as typeof fetch;
    await saveSettings("vote-packages",{name:"Starter",priceNgn:"50.01",voteCount:7});assert.equal(calls[1].options?.method,"POST");assert.match(String(calls[1].options?.body),/"priceNgn":"50.01"/);assert.equal(new Headers(calls[1].options?.headers).get("X-CSRF-Token"),"fixture");
    await saveSettings("competition",{name:"Show",votingOpens:savedVotingDate("2030-01-01T11:00:00",null),votingCloses:savedVotingDate("2030-01-02T11:00",null),expectedUpdatedAt:competition.updatedAt});assert.equal(calls[3].options?.method,"PATCH");
    const submitted=JSON.parse(String(calls[3].options?.body));
    assert.equal(submitted.votingOpens,"2030-01-01T10:00:00.000Z");assert.equal(submitted.votingCloses,"2030-01-02T10:00:00.000Z");
    assert.equal(patchCompetition.safeParse(submitted).success,true,"Both voting times must pass the API's date validation.");
    mode="stale";await assert.rejects(saveSettings("vote-packages",{},item.id),e=>e instanceof SettingsMutationError&&e.message.includes("Reload")&&!e.message.includes("private"));
    mode="failure";await assert.rejects(saveSettings("competition",{}),e=>e instanceof SettingsMutationError&&!e.message.includes("private"));
  }finally{globalThis.fetch=original;}
});
