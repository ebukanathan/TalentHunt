param(
  [ValidateSet('all', 'api', 'integration', 'browser', 'checks')][string]$Phase = 'all',
  [string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin'
)
$ErrorActionPreference = 'Stop'
$qaRoot = Join-Path $env:TEMP ('talenthunt-qa-' + [guid]::NewGuid().ToString('N'))
$qaData = Join-Path $qaRoot 'data'
New-Item -ItemType Directory -Path $qaRoot | Out-Null
$qaProbe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$qaProbe.Start()
$qaPort = $qaProbe.LocalEndpoint.Port
$qaProbe.Stop()
& "$PostgresBin/initdb.exe" -D $qaData -U postgres --auth=trust --encoding=UTF8 --locale=C --no-instructions
if ($LASTEXITCODE -ne 0) { throw 'Disposable PostgreSQL initialization failed.' }
$qaStarted = $false
try {
  & "$PostgresBin/pg_ctl.exe" -D $qaData -l (Join-Path $qaRoot 'postgres.log') -o "-h 127.0.0.1 -p $qaPort" -w start
  if ($LASTEXITCODE -ne 0) { throw 'Disposable PostgreSQL startup failed.' }
  $qaStarted = $true
  & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $qaPort -U postgres talenthunt_qa_admin
  if ($LASTEXITCODE -ne 0) { throw 'QA control database creation failed.' }
  $env:NODE_ENV = 'test'
  $env:QA_DISPOSABLE_DATABASES = '1'
  $env:QA_TEST_DATABASE_URL = "postgresql://postgres@127.0.0.1:$qaPort/talenthunt_qa_admin"
  npm run qa:nonpayment -- $Phase
  if ($LASTEXITCODE -ne 0) { throw 'Non-payment QA failed.' }
} finally {
  if ($qaStarted) { & "$PostgresBin/pg_ctl.exe" -D $qaData -m fast -w stop }
  Write-Output "Disposable QA files retained at $qaRoot"
}
