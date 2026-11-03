import assert from "node:assert/strict";
import test from "node:test";
import { createPackage, ngnToKobo, patchCompetition, patchPackage } from "../src/validation/admin-settings";
import { validateCompetitionChange, votingOpen } from "../src/services/competition-policy";

test("decimal NGN conversion preserves exact kobo and enforces checkout/database bounds",()=>{
  for(const [price,kobo] of [["50",5000],["50.01",5001],["99.9",9990],["21474836.47",2147483647]] as const)assert.equal(ngnToKobo(price),kobo);
  for(const price of ["49.99","0","-50","NaN","Infinity","1e3","50.001","5,000","01.00","21474836.48","999999999999999999999"] )assert.equal(ngnToKobo(price),null);
  assert.deepEqual(createPackage.parse({name:" Starter ",priceNgn:"50.01",voteCount:7}),{name:"Starter",priceKobo:5001,voteCount:7,isActive:true});
});
test("strict settings validation rejects attribution, currency, raw amounts and invalid quantities",()=>{
  const valid={name:"Starter",priceNgn:"50.00",voteCount:1};
  for(const extra of [{competitionId:"other"},{priceKobo:1},{currency:"USD"},{id:"chosen"},{totalVotes:999},{voteCount:0},{voteCount:-1},{voteCount:1.5},{voteCount:2147483648},{priceNgn:50}])assert.equal(createPackage.safeParse({...valid,...extra}).success,false);
  const version="2026-11-03T00:00:00.000Z";
  assert.equal(patchPackage.safeParse({expectedUpdatedAt:version}).success,false);
  for(const extra of [{slug:"new"},{currency:"USD"},{id:"other"},{name:"\u0000"},{votingOpens:"2026-02-30T00:00:00Z"}])assert.equal(patchCompetition.safeParse({expectedUpdatedAt:version,...extra}).success,false);
  assert.equal(patchCompetition.parse({name:"Show",expectedUpdatedAt:"2026-11-03T01:00:00+01:00"}).expectedUpdatedAt,version);
});
test("lifecycle rules include manual scheduling, cancellation, current-window reopening and final completion",()=>{
  const now=new Date("2030-01-01T12:00:00Z"),start=new Date("2030-01-01T11:00:00Z"),end=new Date("2030-01-01T13:00:00Z");
  const draft={status:"DRAFT" as const,votingOpens:null,votingCloses:null};
  const open={status:"OPEN" as const,votingOpens:start,votingCloses:end};
  validateCompetitionChange(draft,open,now);
  validateCompetitionChange({...open,status:"CLOSED"},open,now);
  validateCompetitionChange({...open,status:"SCHEDULED"},draft,now);
  assert.throws(()=>validateCompetitionChange(open,draft,now));
  assert.throws(()=>validateCompetitionChange({...open,status:"COMPLETED"},open,now));
  assert.throws(()=>validateCompetitionChange(draft,{...open,status:"SCHEDULED"},now));
  assert.throws(()=>validateCompetitionChange(draft,{...open,votingCloses:start},now));
  assert.throws(()=>validateCompetitionChange(draft,{...open,votingOpens:null},now));
  assert.throws(()=>validateCompetitionChange({...open,status:"COMPLETED"},{...open,status:"COMPLETED",votingCloses:new Date("2030-01-02T00:00:00Z")},now));
  assert.equal(votingOpen(open,start),true);assert.equal(votingOpen(open,end),false);assert.equal(votingOpen({...open,status:"SCHEDULED"},now),false);
});
