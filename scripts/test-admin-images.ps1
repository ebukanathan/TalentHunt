$ErrorActionPreference = 'Stop'
# Run from repository root. No existing database is used or reset.
$postgresBin = 'C:/Program Files/PostgreSQL/18/bin'
$imageTestRoot = Join-Path $env:TEMP ('talenthunt-images-' + [guid]::NewGuid().ToString('N'))
$imageTestData = Join-Path $imageTestRoot 'data'
New-Item -ItemType Directory -Path $imageTestRoot | Out-Null
$probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$probe.Start()
$imageTestPort = $probe.LocalEndpoint.Port
$probe.Stop()
& "$postgresBin/initdb.exe" -D $imageTestData -U postgres --auth=trust --encoding=UTF8 --locale=C --no-instructions
if ($LASTEXITCODE -ne 0) { throw 'Isolated initdb failed.' }
$started = $false
try {
  & "$postgresBin/pg_ctl.exe" -D $imageTestData -l (Join-Path $imageTestRoot 'postgres.log') -o "-h 127.0.0.1 -p $imageTestPort" -w start
  if ($LASTEXITCODE -ne 0) { throw 'Isolated PostgreSQL startup failed.' }
  $started = $true
  $env:NODE_ENV = 'test'
  $targets = @{
    API_TEST_DATABASE_URL = 'talenthunt_api_test_images'
    PAYMENTS_TEST_DATABASE_URL = 'talenthunt_payments_test_images'
    ADMIN_TEST_DATABASE_URL = 'talenthunt_admin_test_images'
    ADMIN_WEB_TEST_DATABASE_URL = 'talenthunt_admin_test_web_images'
    ADMIN_CONTESTANTS_TEST_DATABASE_URL = 'talenthunt_admin_contestants_test_images'
    ADMIN_IMAGES_TEST_DATABASE_URL = 'talenthunt_images_test_images'
  }
  foreach ($key in $targets.Keys) {
    $database = $targets[$key]
    & "$postgresBin/createdb.exe" -h 127.0.0.1 -p $imageTestPort -U postgres $database
    if ($LASTEXITCODE -ne 0) { throw 'Fresh test database creation failed.' }
    $env:DATABASE_URL = "postgresql://postgres@127.0.0.1:$imageTestPort/$database"
    [Environment]::SetEnvironmentVariable($key, $env:DATABASE_URL, 'Process')
    node node_modules/prisma/build/index.js migrate deploy
    if ($LASTEXITCODE -ne 0) { throw 'Isolated migrations failed.' }
  }
  $env:DATABASE_URL = $env:ADMIN_IMAGES_TEST_DATABASE_URL
  npm run build --workspace=apps/api
  if ($LASTEXITCODE -ne 0) { throw 'API build failed.' }
  npm run typecheck:test --workspace=apps/api
  if ($LASTEXITCODE -ne 0) { throw 'API test typecheck failed.' }
  npm test --workspace=apps/api
  if ($LASTEXITCODE -ne 0) { throw 'API regression and image checks failed.' }
  npm run test:admin:integration --workspace=apps/web
  if ($LASTEXITCODE -ne 0) { throw 'Next/Express/PostgreSQL checks failed.' }
  node node_modules/prisma/build/index.js migrate diff --from-url $env:DATABASE_URL --to-schema-datamodel prisma/schema.prisma --exit-code
  if ($LASTEXITCODE -ne 0) { throw 'Schema drift detected.' }
  Write-Output 'ADMIN03_CHECKS_PASSED'
} finally {
  if ($started) { & "$postgresBin/pg_ctl.exe" -D $imageTestData -m fast -w stop }
  Write-Output "Disposable test files retained at $imageTestRoot"
}
