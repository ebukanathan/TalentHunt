import { publicScopeFixture } from "./public-scope-fixture";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ContestantImage } from "../src/components/admin/contestant-image";
import { ContestantProfile } from "../src/components/contestant-profile";
import type { Competition, Contestant } from "../src/lib/api/schemas";
import { imageErrorMessage } from "../src/lib/admin/image-errors";

test("image errors distinguish missing configuration from uncertain writes without echoing provider details", () => {
  assert.match(imageErrorMessage(503, "IMAGE_STORAGE_NOT_CONFIGURED"), /not configured.*Contact support/);
  assert.match(imageErrorMessage(502, "IMAGE_STORAGE_UNAVAILABLE"), /storage service.*Reload/);
  for (const [status, code] of [[503, "DATABASE_UNAVAILABLE"], [500, "untrusted private response"], [0, undefined]] as const) {
    assert.match(imageErrorMessage(status, code), /could not be confirmed.*Reload/);
    assert.doesNotMatch(imageErrorMessage(status, code), /untrusted|DATABASE_UNAVAILABLE/);
  }
  assert.match(imageErrorMessage(408), /timed out.*Reload/);
  assert.match(imageErrorMessage(409), /changed.*Reload/);
  assert.match(imageErrorMessage(413), /5 MB/);
});

test("image controls show saved preview, accepted types, status regions and create-first instructions", () => {
  const edit = renderToStaticMarkup(<ContestantImage id="person" imageUrl="https://images.example/photo.webp" name="Ada" />);
  assert.match(edit,/src="https:\/\/images.example\/photo.webp"/); assert.match(edit,/type="file"/);
  assert.match(edit,/image\/jpeg,image\/png,image\/webp/); assert.match(edit,/Replace photograph/); assert.match(edit,/Remove photograph/);
  assert.match(edit,/role="status"/); assert.match(edit,/aria-describedby="photo-help"/);
  assert.match(edit, /<input(?=[^>]*id="image")(?=[^>]*disabled="")[^>]*>/, "early file selection waits for hydration");
  const create = renderToStaticMarkup(<ContestantImage imageUrl={null} name="Ada" />);
  assert.match(create,/Register the contestant first/); assert.doesNotMatch(create,/type="file"/);
});
test("public profile shares photo fallback, escapes biographies and preserves exact vote totals", () => {
  const competition: Competition={id:"show",name:"TalentHunt",slug:"show",status:"OPEN",currency:"NGN",description:null,votingOpens:null,votingCloses:null};
  const contestant: Contestant={...publicScopeFixture(),id:"person",competitionId:"show",number:"001",name:"Ada",slug:"ada",bio:"<script>unsafe</script>",imageUrl:"https://images.example/photo.webp",totalVotes:"9007199254740993",videos:[]};
  const html=renderToStaticMarkup(<ContestantProfile competition={competition} contestant={contestant}/>);
  assert.match(html,/Portrait of Ada/); assert.match(html,/9,007,199,254,740,993/); assert.match(html,/&lt;script&gt;/); assert.doesNotMatch(html,/<script>/);
  assert.match(renderToStaticMarkup(<ContestantProfile competition={competition} contestant={{...contestant,imageUrl:null}}/>),/Photograph unavailable for Ada/);
});
