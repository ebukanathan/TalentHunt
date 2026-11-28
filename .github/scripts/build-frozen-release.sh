#!/usr/bin/env bash
set -euo pipefail
source_dir="$1"
output_dir="$2"
packager="$3"
readonly approved=26f6f5119f3424f484f962c98d10af0de8be9773
test "$(git -C "$source_dir" rev-parse HEAD)" = "$approved"
test "$(node --version)" = v24.22.3
test "$(uname -m)" = x86_64
mkdir -p "$output_dir"
# Match setup-node's executable to the reviewed official archive.
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 https://nodejs.org/dist/v24.22.3/node-v24.22.3-linux-x64.tar.xz -o "$RUNNER_TEMP/node-pinned.tar.xz"
echo "4f2b175a6d53a5c617a80dba2676238a0688cef28c6da4eba35c7d844e66fcfb  $RUNNER_TEMP/node-pinned.tar.xz" | sha256sum --check
tar -xJOf "$RUNNER_TEMP/node-pinned.tar.xz" node-v24.22.3-linux-x64/bin/node > "$RUNNER_TEMP/node-expected"
cmp "$(command -v node)" "$RUNNER_TEMP/node-expected"
cd "$source_dir"
export DATABASE_URL=postgresql://unused:unused@127.0.0.1:5432/unused
unset QA_TEST_DATABASE_URL QA_DISPOSABLE_DATABASES
export NODE_ENV=production DEPLOYMENT_ENV=production API_BIND_HOST=127.0.0.1 PORT=4000
export API_BASE_URL=http://127.0.0.1:4000/api/v1
export SITE_URL=https://talent.apearlschools.com ADMIN_APP_ORIGIN=https://talent.apearlschools.com CHECKOUT_APP_ORIGIN=https://talent.apearlschools.com
export NEXT_PUBLIC_CONTESTANT_IMAGE_ORIGIN=https://zuzslpwyhjqgpsxhbxis.supabase.co
export CHECKOUT_ENABLED=false CHECKOUT_TEST_ENABLED=false CHECKOUT_LIVE_ACTIVATION_APPROVED=false
export PAYSTACK_MODE= PAYSTACK_SECRET_KEY= PAYSTACK_CALLBACK_URL= PAYSTACK_WEBHOOK_SIGNING_KEYS=
export PAYSTACK_LIVE_ACTIVATION_APPROVED=false PAYSTACK_FINALIZATION_ENABLED=false PAYSTACK_WEBHOOKS_ENABLED=false
export EMAIL_ENABLED=false EMAIL_FROM= RESEND_API_KEY= RESEND_WEBHOOK_SECRET= SUPABASE_URL= SUPABASE_SECRET_KEY=
export NEXT_TELEMETRY_DISABLED=1
npm ci --include=dev --no-audit --no-fund
npx --no-install prisma validate
npx --no-install prisma generate
npm run build --workspace apps/api
npm run build --workspace apps/web
npm run typecheck --workspace apps/web
test -z "$(git status --porcelain --untracked-files=no)"
node <<'JS'
const fs=require('node:fs'),crypto=require('node:crypto'),cp=require('node:child_process');
const {Prisma,PrismaClient}=require('@prisma/client'),sharp=require('sharp');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function native(){
 // Load the native Prisma engine; only a deliberately closed localhost port is used.
 const db=new PrismaClient({datasources:{db:{url:'postgresql://unused:unused@127.0.0.1:1/unused?connect_timeout=2'}}});
 let code;try{await db.$connect();}catch(e){code=e.errorCode;}finally{await db.$disconnect();}
 if(code!=='P1001')throw Error('PRISMA_NATIVE_ENGINE_NOT_VERIFIED');
 const image=await sharp({create:{width:2,height:2,channels:3,background:'#808080'}}).webp().toBuffer();
 if((await sharp(image).metadata()).format!=='webp')throw Error('SHARP_WEBP_ROUND_TRIP_FAILED');
 const metadata={sourceCommit:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),toolingCommit:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,runUrl:process.env.GITHUB_SERVER_URL+'/'+process.env.GITHUB_REPOSITORY+'/actions/runs/'+process.env.GITHUB_RUN_ID,node:process.version,nodeExecutableSha256:hash(process.execPath),npm:cp.execFileSync('npm',['--version'],{encoding:'utf8'}).trim(),platform:process.platform,architecture:process.arch,openssl:process.versions.openssl,glibc:process.report.getReport().header.glibcVersionRuntime,lockfileSha256:hash('package-lock.json'),schemaSha256:hash('prisma/schema.prisma'),prisma:Prisma.prismaVersion,prismaNativeEngineLoaded:true,sharp:sharp.versions,sharpWebpRoundTripPassed:true,next:require('next/package.json').version,react:require('react/package.json').version,buildId:fs.readFileSync('apps/web/.next/BUILD_ID','utf8').trim(),publicImageOrigin:process.env.NEXT_PUBLIC_CONTESTANT_IMAGE_ORIGIN,siteUrl:process.env.SITE_URL,productionSecretsUsed:false,validation:'Complete qa:nonpayment plus paystack/finalization gates passed before this fresh release build',builtAt:new Date().toISOString()};
 fs.writeFileSync('RELEASE_SHA',metadata.sourceCommit+'\n');fs.writeFileSync('BUILD_METADATA.json',JSON.stringify(metadata,null,2)+'\n');
}
native().catch(()=>{console.error('Release native dependency verification failed.');process.exitCode=1;});
JS
python3 "$packager" "$source_dir" "$output_dir"
