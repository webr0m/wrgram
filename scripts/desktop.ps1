param(
    [ValidateSet('check', 'run', 'publish', 'configure', 'data')][string]$Task = 'run',
    [string]$Configuration = 'Release'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$desktop = Join-Path $root 'apps\desktop\src\WRGram.Desktop'
$appData = Join-Path $env:APPDATA 'WRGram'

function Resolve-Dotnet {
    $local = Join-Path $root '.tools\dotnet8\dotnet.exe'
    if (Test-Path $local) { return $local }
    $command = Get-Command dotnet -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    throw 'Falta .NET 8 SDK. Instálalo desde https://dotnet.microsoft.com/download/dotnet/8.0 o colócalo en .tools\dotnet8.'
}

if ($Task -eq 'data') {
    New-Item -ItemType Directory -Path $appData -Force | Out-Null
    Start-Process explorer.exe $appData
    return
}

if ($Task -eq 'configure') {
    # Las credenciales son de la aplicación (api_id/api_hash), nunca la contraseña de Telegram.
    $apiId = (Read-Host 'api_id de tu aplicación de Telegram (solo números)').Trim()
    if ($apiId -notmatch '^\d+$') { throw 'El api_id debe ser numérico.' }
    $secureHash = Read-Host 'api_hash de tu aplicación de Telegram' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureHash)
    try { $apiHash = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($apiHash -notmatch '^[0-9a-fA-F]{32}$') { throw 'El api_hash debe tener 32 caracteres hexadecimales.' }
    New-Item -ItemType Directory -Path $appData -Force | Out-Null
    $target = Join-Path $appData 'telegram.json'
    $json = [ordered]@{ apiId = [long]$apiId; apiHash = $apiHash } | ConvertTo-Json
    [IO.File]::WriteAllText($target, $json, [Text.Encoding]::UTF8)
    $apiHash = $null
    $acl = Get-Acl $target
    $acl.SetAccessRuleProtection($true, $false)
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'Allow'))
    Set-Acl -Path $target -AclObject $acl
    Write-Output "Credenciales guardadas en $target (solo tu usuario). No se muestran valores."
    return
}

& npm.cmd exec --yes --package=pnpm@12.18.0 -- pnpm --filter @wrgram/mobile-ui build
if ($LASTEXITCODE -ne 0) { throw 'No se pudo compilar la interfaz React.' }

# Si .env tiene credenciales de aplicación, se incrustan en el ejecutable de escritorio.
# El archivo se guarda en .private (ignorado por git) y nunca se imprime su contenido.
$privateCredentials = Join-Path $root '.private\desktop-telegram.json'
$envFile = Join-Path $root '.env'
if (-not (Test-Path $privateCredentials) -and (Test-Path $envFile)) {
    $values = @{}
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$') { $values[$matches[1]] = $matches[2].Trim('"', "'") }
    }
    $id = $values['TELEGRAM_API_ID']
    $hash = $values['TELEGRAM_API_HASH']
    if ($id -match '^\d+$' -and $hash -match '^[0-9a-fA-F]{32}$') {
        New-Item -ItemType Directory -Path (Split-Path $privateCredentials -Parent) -Force | Out-Null
        $json = [ordered]@{ apiId = [long]$id; apiHash = $hash } | ConvertTo-Json
        [IO.File]::WriteAllText($privateCredentials, $json, [Text.Encoding]::UTF8)
        $acl = Get-Acl $privateCredentials
        $acl.SetAccessRuleProtection($true, $false)
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.WindowsIdentity]::GetCurrent().Name, 'FullControl', 'Allow'))
        Set-Acl -Path $privateCredentials -AclObject $acl
        Write-Output 'Credenciales de aplicación incluidas en la compilación de escritorio (sin mostrarlas).'
    }
}

$dotnet = Resolve-Dotnet
& $dotnet build $desktop -c $Configuration
if ($LASTEXITCODE -ne 0) { throw 'La compilación de escritorio falló.' }
if ($Task -eq 'check') { return }

$exe = Join-Path $desktop "bin\$Configuration\net8.0-windows\WRGram.Desktop.exe"
if (-not (Test-Path $exe)) { throw "No se encontró $exe." }

if ($Task -eq 'publish') {
    $output = Join-Path $root 'artifacts\desktop\win-x64'
    New-Item -ItemType Directory -Path $output -Force | Out-Null
    & $dotnet publish $desktop -c $Configuration -r win-x64 --self-contained true `
        -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true `
        -p:EnableCompressionInSingleFile=true -p:DebugType=None -p:DebugSymbols=false `
        -p:AllowedReferenceRelatedFileExtensions=none -o $output
    if ($LASTEXITCODE -ne 0) { throw 'La publicación de escritorio falló.' }
    $published = Join-Path $output 'WRGram.Desktop.exe'
    if (-not (Test-Path $published)) { throw "No se generó $published." }
    Write-Output "Publicado: $published"
    Write-Output 'Es un único ejecutable autocontenido. Solo requiere WebView2 Runtime (incluido en Windows 11 y Edge actualizado).'
    return
}

if (-not (Test-Path (Join-Path $appData 'session.dat')) -and -not $env:WRGRAM_TELEGRAM_API_ID -and -not (Test-Path (Join-Path $appData 'telegram.json'))) {
    Write-Output 'Aviso: sin credenciales configuradas. Ejecuta este script con -Task configure o define WRGRAM_TELEGRAM_API_ID y WRGRAM_TELEGRAM_API_HASH.'
}
Start-Process $exe
