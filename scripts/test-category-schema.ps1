param(
  [string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin',
  [switch]$IncludeWebRegression
)

$ErrorActionPreference = 'Stop'
# Run from the CAT-01 checkout. Only a new loopback-only cluster is ever used.
$categoryTestRoot = Join-Path $env:TEMP ('talenthunt-category-' + [guid]::NewGuid().ToString('N'))
$categoryData = Join-Path $categoryTestRoot 'data'
New-Item -ItemType Directory -Path $categoryTestRoot | Out-Null
$probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$probe.Start()
$categoryPort = $probe.LocalEndpoint.Port
$probe.Stop()
$savedEnvironment = @{}
foreach ($key in @('NODE_ENV', 'DATABASE_URL', 'CATEGORY_SCHEMA_TEST_DATABASE_URL', 'CATEGORY_UPGRADE_TEST_DATABASE_URL', 'SEED_TEST_DATABASE_URL', 'ADMIN_WEB_TEST_DATABASE_URL', 'SITE_URL')) {
  $savedEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
}
$started = $false
try {
  & "$PostgresBin/initdb.exe" -D $categoryData -U postgres --auth=trust --encoding=UTF8 --locale=C --no-instructions
  if ($LASTEXITCODE -ne 0) { throw 'Isolated category initdb failed.' }
  & "$PostgresBin/pg_ctl.exe" -D $categoryData -l (Join-Path $categoryTestRoot 'postgres.log') -o "-h 127.0.0.1 -p $categoryPort" -w start
  if ($LASTEXITCODE -ne 0) { throw 'Isolated category PostgreSQL startup failed.' }
  $started = $true
  $env:NODE_ENV = 'test'
  foreach ($kind in @('fresh', 'upgrade')) {
    $database = "talenthunt_category_test_$kind"
    & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $categoryPort -U postgres $database
    if ($LASTEXITCODE -ne 0) { throw 'Fresh category database creation failed.' }
    $url = "postgresql://postgres@127.0.0.1:$categoryPort/$database"
    if ($kind -eq 'fresh') { $env:CATEGORY_SCHEMA_TEST_DATABASE_URL = $url }
    else { $env:CATEGORY_UPGRADE_TEST_DATABASE_URL = $url }
  }
  $env:DATABASE_URL = $env:CATEGORY_SCHEMA_TEST_DATABASE_URL
  node node_modules/prisma/build/index.js validate
  if ($LASTEXITCODE -ne 0) { throw 'Category schema validation failed.' }
  node node_modules/prisma/build/index.js generate
  if ($LASTEXITCODE -ne 0) { throw 'Category client generation failed.' }
  node node_modules/prisma/build/index.js migrate deploy
  if ($LASTEXITCODE -ne 0) { throw 'Fresh category migration failed.' }
  npm run typecheck:seed
  if ($LASTEXITCODE -ne 0) { throw 'Seed/category test typecheck failed.' }
  npm run test:categories:integration
  if ($LASTEXITCODE -ne 0) { throw 'Category constraints/legacy upgrade failed.' }
  foreach ($url in @($env:CATEGORY_SCHEMA_TEST_DATABASE_URL, $env:CATEGORY_UPGRADE_TEST_DATABASE_URL)) {
    node node_modules/prisma/build/index.js migrate diff --from-url $url --to-schema-datamodel prisma/schema.prisma --exit-code
    if ($LASTEXITCODE -ne 0) { throw 'Category schema drift detected.' }
  }
  & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $categoryPort -U postgres talenthunt_seed_test_categories
  if ($LASTEXITCODE -ne 0) { throw 'Fresh seed regression database creation failed.' }
  $env:SEED_TEST_DATABASE_URL = "postgresql://postgres@127.0.0.1:$categoryPort/talenthunt_seed_test_categories"
  $env:DATABASE_URL = $env:SEED_TEST_DATABASE_URL
  node node_modules/prisma/build/index.js migrate deploy
  if ($LASTEXITCODE -ne 0) { throw 'Seed regression migrations failed.' }
  npm run test:seed:integration
  if ($LASTEXITCODE -ne 0) { throw 'Seed integration regression failed.' }
  if ($IncludeWebRegression) {
    & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $categoryPort -U postgres talenthunt_admin_test_web_categories
    if ($LASTEXITCODE -ne 0) { throw 'Fresh web regression database creation failed.' }
    $env:ADMIN_WEB_TEST_DATABASE_URL = "postgresql://postgres@127.0.0.1:$categoryPort/talenthunt_admin_test_web_categories"
    $env:DATABASE_URL = $env:ADMIN_WEB_TEST_DATABASE_URL
    # Discovery deliberately returns an empty sitemap without a trusted origin.
    # This identity-only fixture is never contacted; Next/API bind to loopback.
    $env:SITE_URL = 'https://talenthunt-category.example.test'
    node node_modules/prisma/build/index.js migrate deploy
    if ($LASTEXITCODE -ne 0) { throw 'Web regression migrations failed.' }
    npm run test:admin:integration --workspace=apps/web
    if ($LASTEXITCODE -ne 0) { throw 'Next/Express/PostgreSQL regression failed.' }
    node node_modules/prisma/build/index.js migrate diff --from-url $env:DATABASE_URL --to-schema-datamodel prisma/schema.prisma --exit-code
    if ($LASTEXITCODE -ne 0) { throw 'Web regression schema drift detected.' }
  }
  Write-Output 'CATEGORY_SCHEMA_AND_LEGACY_UPGRADE_PASSED'
} finally {
  if ($started) { & "$PostgresBin/pg_ctl.exe" -D $categoryData -m fast -w stop }
  foreach ($key in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($key, $savedEnvironment[$key], 'Process') }
  Write-Output "Disposable category test files retained at $categoryTestRoot"
}
