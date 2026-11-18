import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Leaderboard } from "../src/components/leaderboard";
import { ContestantCard } from "../src/components/contestant-card";
import { ContestantProfile } from "../src/components/contestant-profile";
import { CompetitionForm } from "../src/components/admin/settings-forms";
import { PublishResults } from "../src/components/admin/publish-results";
import { publicLeaderboardSchema, adminLeaderboardSchema, type PublicLeaderboard } from "../src/lib/api/leaderboard-schemas";
import { saveSettings, SettingsMutationError } from "../src/lib/admin/settings-mutations";
import type { ManagedCompetition } from "../src/lib/admin/settings-schemas";

const competition:ManagedCompetition={id:"show",name:"Show <script>",slug:"show",description:null,status:"COMPLETED",currency:"NGN",votingOpens:null,votingCloses:null,leaderboardVisibility:"HIDDEN",resultsPublishedAt:null,createdAt:"2026-11-16T00:00:00.000Z",updatedAt:"2026-11-16T00:00:00.000Z"};
const person={id:"person",competitionId:"show",name:"Ada <script>",number:"001",slug:"ada",imageUrl:null,videos:[]};
const page={page:1,pageSize:25,total:1,pages:1};
const hidden:PublicLeaderboard={competition,visibility:"HIDDEN",publishedAt:null,state:"HIDDEN",items:[],pagination:null};

test("hidden, rank-only and live public rendering expose exactly the allowed fields",()=>{
  const empty=renderToStaticMarkup(<Leaderboard data={hidden}/>);assert.match(empty,/Results have not been published/);assert.doesNotMatch(empty,/<table|Ada|9007199254740993/);
  const ranked:PublicLeaderboard={...hidden,visibility:"RANK_ONLY",state:"PROVISIONAL",items:[{...person,rank:1}],pagination:page};
  const rankHtml=renderToStaticMarkup(<Leaderboard data={ranked}/>);assert.match(rankHtml,/<td>1<\/td>/);assert.match(rankHtml,/Ada &lt;script&gt;/);assert.doesNotMatch(rankHtml,/>Votes<|9007199254740993|<script>/);
  const live=renderToStaticMarkup(<Leaderboard data={{...ranked,visibility:"LIVE",items:[{...person,rank:1,totalVotes:"9007199254740993"}]}}/>);assert.match(live,/9,007,199,254,740,993/);assert.match(live,/Provisional standings/);
  for(const html of [renderToStaticMarkup(<ContestantCard contestant={{...person,bio:null}}/>),renderToStaticMarkup(<ContestantProfile competition={competition} contestant={{...person,bio:null}}/>)])assert.doesNotMatch(html,/vote-total|>votes</);
});
test("all-zero results have an honest message and published results have a final label",()=>{
  const zero=renderToStaticMarkup(<Leaderboard data={{...hidden,visibility:"LIVE",state:"NO_VOTES"}}/>);assert.match(zero,/No votes have been recorded yet/);assert.doesNotMatch(zero,/<table|<td>1/);
  const final=renderToStaticMarkup(<Leaderboard data={{...hidden,visibility:"LIVE",state:"FINAL",publishedAt:competition.updatedAt,items:[{...person,rank:1,totalVotes:"7"}],pagination:page}}/>);assert.match(final,/Final results/);assert.match(final,/Published final results/);
});
test("public schemas reject hidden leaks, rank-only totals and inconsistent publication; private schema requires totals",()=>{
  for(const invalid of [{...hidden,items:[{...person,rank:1,totalVotes:"7"}]},{...hidden,state:"PROVISIONAL",visibility:"RANK_ONLY",items:[{...person,rank:1,totalVotes:"7"}],pagination:page},{...hidden,state:"FINAL",visibility:"LIVE",items:[],pagination:page}])assert.equal(publicLeaderboardSchema.safeParse(invalid).success,false);
  assert.equal(adminLeaderboardSchema.safeParse({...hidden,state:"PROVISIONAL",items:[{...person,rank:1,isActive:true}],pagination:page}).success,false);
  const data=adminLeaderboardSchema.parse({...hidden,state:"PROVISIONAL",items:[{...person,rank:1,isActive:true,totalVotes:"9007199254740993"}],pagination:page});
  assert.match(renderToStaticMarkup(<Leaderboard data={data} admin/>),/9,007,199,254,740,993/);
});
test("settings expose three modes and publication requires a closed confirmation dialog with typed name",()=>{
  const form=renderToStaticMarkup(<CompetitionForm competition={competition}/>);for(const value of ["HIDDEN","RANK_ONLY","LIVE"])assert.ok(form.includes(`value="${value}"`));assert.match(form,/Completing the competition does not publish/);
  const confirmation=renderToStaticMarkup(<PublishResults competition={competition}/>);assert.match(confirmation,/<dialog/);assert.doesNotMatch(confirmation,/<dialog[^>]* open/);assert.match(confirmation,/publication-confirmation/);assert.match(confirmation,/disabled="">Confirm publication/);assert.match(confirmation,/permanently/);
  const published={...competition,leaderboardVisibility:"LIVE" as const,resultsPublishedAt:competition.updatedAt};assert.match(renderToStaticMarkup(<PublishResults competition={published}/>),/Final results published/);assert.doesNotMatch(renderToStaticMarkup(<PublishResults competition={published}/>),/<dialog/);
});
test("publication uses a separate CSRF-protected POST and preserves server confirmation failures",async()=>{
  const original=globalThis.fetch;let sent:RequestInit|undefined;let mode="ok";
  globalThis.fetch=(async(url,options)=>{if(String(url).endsWith("/csrf"))return Response.json({data:{csrfToken:"fixture"}});assert.equal(String(url),"/api/admin/competition/publish-results");sent=options;return mode==="ok"?Response.json({status:"success",data:{...competition,leaderboardVisibility:"LIVE",resultsPublishedAt:competition.updatedAt}}):Response.json({code:"PUBLICATION_CONFIRMATION_REQUIRED",message:"private error"},{status:400});}) as typeof fetch;
  try{await saveSettings("competition",{competitionId:competition.id,confirmationName:competition.name,expectedUpdatedAt:competition.updatedAt},"publish-results");assert.equal(sent?.method,"POST");assert.equal(new Headers(sent?.headers).get("X-CSRF-Token"),"fixture");assert.equal(JSON.parse(String(sent?.body)).confirmationName,competition.name);mode="error";await assert.rejects(saveSettings("competition",{},"publish-results"),e=>e instanceof SettingsMutationError&&e.message.includes("exactly")&&!e.message.includes("private"));}finally{globalThis.fetch=original;}
});
