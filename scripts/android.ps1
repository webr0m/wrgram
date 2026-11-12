param(
    [ValidateSet('check', 'debug', 'release', 'version')][string]$Task = 'check',
    [switch]$CreateUploadKey,
    [string]$Name,
    [string]$Code
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$android = Join-Path $root 'apps\mobile\android'
$versionFile = Join-Path $android 'version.properties'
$uiContract = Join-Path $root 'apps\mobile-ui\src\contract.ts'
$uiTests = Join-Path $root 'apps\mobile-ui\src\beta.test.ts'
$nativeTests = Join-Path $root 'apps\mobile\android-contract.test.ts'
$tools = Join-Path $env:LOCALAPPDATA 'Temp\opencode\wrgram-android-tools'

function Count-Of([string]$text, [string]$needle) {
    $count = 0; $index = -1
    while (($index = $text.IndexOf($needle, $index + 1, [StringComparison]::Ordinal)) -ge 0) { $count++ }
    return $count
}

# Windows PowerShell decodifica en la página de códigos del sistema: leería mal las tildes y
# WriteAllText las guardaría corruptas. Se fuerza UTF-8 sin BOM y se conservan los fin de línea.
function Read-Source([string]$path) { return [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8) }
function Write-Source([string]$path, [string]$text) { [IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding $false)) }

# npm, Vite y Gradle escriben progreso por stderr. Con ErrorActionPreference='Stop' PowerShell
# convertiría esas líneas en errores fatales, así que cada herramienta corre en un alcance que
# ignora stderr y decide solo por su código de salida.
function Invoke-Tool([string]$failure, [scriptblock]$action) {
    $ErrorActionPreference = 'Continue'
    & $action
    if ($LASTEXITCODE -ne 0) { throw "$failure (código de salida $LASTEXITCODE)." }
}

function Read-VersionProperties {
    if (-not (Test-Path $versionFile)) { throw "Falta $versionFile." }
    $values = @{}
    foreach ($line in (Read-Source $versionFile) -split "`r?`n") {
        if ($line -match '^\s*(versionCode|versionName)\s*=\s*(.+?)\s*$') { $values[$matches[1]] = $matches[2] }
    }
    if (-not $values.ContainsKey('versionCode') -or -not $values.ContainsKey('versionName')) { throw 'version.properties debe definir versionCode y versionName.' }
    if ($values.versionCode -notmatch '^[1-9][0-9]*$') { throw 'versionCode debe ser un entero positivo.' }
    if ($values.versionName -notmatch '^[0-9A-Za-z.-]+$') { throw 'Nombre de versión no válido.' }
    return $values
}

function Get-VersionNeedles($version) {
    $name = $version.versionName
    $code = $version.versionCode
    return @(
        [pscustomobject]@{ Path = $uiContract; Needles = @("version: '$name'", "currentVersionCode:$code") }
        [pscustomobject]@{ Path = $uiTests; Needles = @("version: '$name'", "currentVersionCode:$code") }
        [pscustomobject]@{ Path = $nativeTests; Needles = @("versionCode=$code", "versionName=$name") }
    )
}

function New-VersionPair([string]$needle, [string]$oldName, [string]$newName, [string]$oldCode, [string]$newCode) {
    # Cada aguja lleva o bien el nombre o bien el código, así que solo se sustituye una de las dos.
    if ($needle.Contains($oldName)) { return @($needle, $needle.Replace($oldName, $newName)) }
    return @($needle, $needle.Replace($oldCode, $newCode))
}

function Assert-VersionSync {
    $version = Read-VersionProperties
    $drift = @()
    foreach ($entry in Get-VersionNeedles $version) {
        if (-not (Test-Path $entry.Path)) { $drift += "$($entry.Path) no existe"; continue }
        $text = Read-Source $entry.Path
        foreach ($needle in $entry.Needles) { if ((Count-Of $text $needle) -lt 1) { $drift += "$(Split-Path $entry.Path -Leaf) :: $needle" } }
    }
    if ($drift.Count -gt 0) {
        throw ('La versión real vive en version.properties y estas copias están desincronizadas. Corre -Task version -Name ... -Code ...:' +
            [Environment]::NewLine + ($drift -join [Environment]::NewLine))
    }
    return $version
}

function Set-Version([string]$newName, [string]$newCode) {
    if (-not $newName -or -not $newCode) { throw 'Para -Task version indica -Name (por ejemplo 1.0.0-beta05) y -Code (por ejemplo 33).' }
    if ($newName -notmatch '^[0-9]+\.[0-9]+\.[0-9]+-[0-9A-Za-z.]+$') { throw 'Nombre de versión no válido, por ejemplo 1.0.0-beta05.' }
    if ($newCode -notmatch '^[1-9][0-9]*$') { throw 'versionCode debe ser un entero positivo.' }
    $current = Read-VersionProperties
    if ([int]$newCode -le [int]$current.versionCode) { throw "El código $newCode no supera el actual $($current.versionCode); Play lo rechazaría por reused." }
    # Todo se calcula antes de escribir: o se cambian los cinco archivos o no se toca ninguno.
    $plans = @()
    $plans += [pscustomobject]@{
        Path = $versionFile
        Pairs = @(@("versionCode=$($current.versionCode)", "versionCode=$newCode"), @("versionName=$($current.versionName)", "versionName=$newName"))
    }
    foreach ($entry in Get-VersionNeedles $current) {
        $pairs = @()
        foreach ($needle in $entry.Needles) { $pairs += ,(New-VersionPair $needle $current.versionName $newName $current.versionCode $newCode) }
        $plans += [pscustomobject]@{ Path = $entry.Path; Pairs = $pairs }
    }
    $prepared = @()
    foreach ($plan in $plans) {
        if (-not (Test-Path $plan.Path)) { throw "Falta $($plan.Path) para sincronizar la versión." }
        $text = Read-Source $plan.Path
        foreach ($pair in $plan.Pairs) {
            $count = Count-Of $text $pair[0]
            if ($count -ne 1) { throw "Se esperaba '$($pair[0])' exactamente una vez en $(Split-Path $plan.Path -Leaf) (encontradas $count). Revisa ese archivo antes de subir la versión." }
            $text = $text.Replace($pair[0], $pair[1])
        }
        $prepared += [pscustomobject]@{ Path = $plan.Path; Text = $text }
    }
    foreach ($item in $prepared) { Write-Source $item.Path $item.Text }
    Assert-VersionSync | Out-Null
    Write-Output "Versión sincronizada a $newName (código $newCode) en version.properties, contract.ts y ambas pruebas."
}

if ($Task -eq 'version') {
    if ($Name -or $Code) { Set-Version $Name $Code }
    else { $checked = Assert-VersionSync; Write-Output "Sin cambios: $($checked.versionName) (código $($checked.versionCode)) coincide en version.properties, contract.ts y ambas pruebas." }
    return
}
$version = Assert-VersionSync

Invoke-Tool 'No se pudo compilar la interfaz React local.' { & npm.cmd exec --yes --package=pnpm@12.18.0 -- pnpm --filter @wrgram/mobile-ui build }
$uiAssets = Join-Path $android 'app\src\main\assets\ui'
New-Item -ItemType Directory -Path $uiAssets -Force | Out-Null
# Vite uses hashed names; delete only previously generated UI assets, never source/user storage.
Get-ChildItem $uiAssets -File -Recurse | Remove-Item -Force
Copy-Item (Join-Path $root 'apps\mobile-ui\dist\*') $uiAssets -Recurse -Force
Invoke-Tool 'No se pudieron verificar los binarios nativos de Telegram.' { & node (Join-Path $root 'scripts\prepare-tdlib.mjs') }

if ($Task -in @('check', 'release')) {
    Push-Location $root
    try { Invoke-Tool 'Fallan las pruebas de JavaScript. Nada se compilará para firmar.' { & node (Join-Path $root 'node_modules\vitest\vitest.mjs') run } } finally { Pop-Location }
}

if (-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    $jdkRoot = Join-Path $tools 'jdk17'
    if (Test-Path $jdkRoot) { $env:JAVA_HOME = Get-ChildItem $jdkRoot -Directory | Select-Object -First 1 -ExpandProperty FullName }
}
if (-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    throw 'Configura JAVA_HOME con JDK 17 o superior. No se instala nada globalmente.'
}
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path (Join-Path $env:ANDROID_HOME 'platforms\android-36'))) { throw 'Instala Android SDK Platform 36 y Build Tools 35.0.0 o superior.' }

$signingDir = Join-Path $root '.private\android-signing'
$properties = Join-Path $signingDir 'upload.properties'
$keyPath = Join-Path $signingDir 'wrgram-upload.jks'
if ($CreateUploadKey) {
    if ((Test-Path $properties) -or (Test-Path $keyPath)) { throw 'Ya existe material de firma. No se sobrescribe ni se cambia la identidad de subida.' }
    New-Item -ItemType Directory -Path $signingDir -Force | Out-Null
    $acl = Get-Acl $signingDir
    $acl.SetAccessRuleProtection($true, $false)
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
    $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new('NT AUTHORITY\SYSTEM', 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
    Set-Acl -Path $signingDir -AclObject $acl
    $random = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($random)
    $rng.Dispose()
    $password = ([BitConverter]::ToString($random)).Replace('-', '').ToLowerInvariant()
    try {
        $env:WRGRAM_UPLOAD_PASSWORD = $password
        Invoke-Tool 'No se pudo crear la clave de subida.' { & (Join-Path $env:JAVA_HOME 'bin\keytool.exe') -genkeypair -keystore $keyPath -storetype JKS -alias wrgram-upload -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=WRGram Upload, OU=Mobile, O=Webrom' -storepass:env WRGRAM_UPLOAD_PASSWORD -keypass:env WRGRAM_UPLOAD_PASSWORD }
        $relative = '../../../.private/android-signing/wrgram-upload.jks'
        [IO.File]::WriteAllText($properties, "storeFile=$relative`nstorePassword=$password`nkeyAlias=wrgram-upload`nkeyPassword=$password`n", [Text.Encoding]::ASCII)
    } finally {
        Remove-Item Env:\WRGRAM_UPLOAD_PASSWORD -ErrorAction SilentlyContinue
        $password = $null
        [Array]::Clear($random, 0, $random.Length)
    }
    Write-Output 'Clave de subida creada solo en .private/android-signing/. Haz una copia de seguridad cifrada fuera del repositorio.'
}
if ($Task -eq 'release' -and -not (Test-Path $properties)) { throw 'Falta la firma local. Usa -CreateUploadKey solo si esta aplicación aún no tiene clave de subida, o configura una existente.' }

$tasks = @(switch ($Task) {
    'check' { @(':app:testDebugUnitTest', ':app:lintDebug', ':app:assembleDebug') }
    'debug' { @(':app:assembleDebug') }
    'release' { @(':app:testDebugUnitTest', ':app:lintRelease', ':app:bundleRelease', ':app:assembleRelease') }
})

# El wrapper fija la distribución con su SHA-256; una Gradle de un directorio temporal no puede sustituirlo en silencio.
function Resolve-Gradle {
    $wrapperProperties = Join-Path $android 'gradle\wrapper\gradle-wrapper.properties'
    $pinned = $null
    if (Test-Path $wrapperProperties) {
        $line = (Get-Content $wrapperProperties | Where-Object { $_ -match '^distributionUrl=' } | Select-Object -First 1)
        if ($line -match 'gradle-([0-9.]+)-(bin|all)\.zip') { $pinned = $matches[1] }
    }
    if (-not $pinned) { throw 'No se pudo leer la versión de Gradle fijada en gradle-wrapper.properties.' }
    $wrapper = Join-Path $android 'gradlew.bat'
    if (Test-Path $wrapper) { return @{ Command = $wrapper; Label = "wrapper Gradle $pinned" } }
    $local = Join-Path $tools "gradle-$pinned\bin\gradle.bat"
    if (Test-Path $local) { return @{ Command = $local; Label = "Gradle $pinned local" } }
    throw "Falta Gradle $pinned, la versión fijada por el wrapper. Descompila el wrapper con .\gradlew.bat o instala esa distribución; no se usará otra versión."
}
$gradle = Resolve-Gradle
Write-Output "Compilando con $($gradle.Label)."
Push-Location $android
try {
    Invoke-Tool 'La compilación o validación de Android ha fallado.' { & $gradle.Command --no-daemon @tasks }
} finally { Pop-Location }

function Resolve-BuildTool([string]$name) {
    $dir = Get-ChildItem (Join-Path $env:ANDROID_HOME 'build-tools') -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path (Join-Path $_.FullName $name) } |
        Sort-Object { [Version]$_.Name } -Descending | Select-Object -First 1
    if (-not $dir) { throw "Falta $name en Android SDK build-tools. Instala Build Tools 35.0.0 o superior." }
    return (Join-Path $dir.FullName $name)
}

function Read-ApkVersion([string]$apk, [string]$aapt2) {
    $ErrorActionPreference = 'Continue'
    $badging = & $aapt2 dump badging $apk 2>$null | Out-String
    if ($LASTEXITCODE -ne 0) { throw "No se pudo leer el manifiesto de $(Split-Path $apk -Leaf)." }
    if ($badging -notmatch "versionCode='(\d+)'") { throw "No se pudo leer versionCode de $(Split-Path $apk -Leaf)." }
    $code = [int]$matches[1]
    if ($badging -notmatch "versionName='([^']*)'") { throw "No se pudo leer versionName de $(Split-Path $apk -Leaf)." }
    return @{ Code = $code; Name = $matches[1] }
}

if ($Task -eq 'release') {
    $output = Join-Path $root 'artifacts\android'
    $bundle = Join-Path $android 'app\build\outputs\bundle\release\app-release.aab'
    $apk = Join-Path $android 'app\build\outputs\apk\release\app-release.apk'
    $mapping = Join-Path $android 'app\build\outputs\mapping\release\mapping.txt'
    foreach ($required in @($bundle, $apk, $mapping)) { if (-not (Test-Path $required)) { throw "Falta el artefacto recién compilado: $required" } }

    $aapt2 = Resolve-BuildTool 'aapt2.exe'
    $zipalign = Resolve-BuildTool 'zipalign.exe'
    $apksigner = Resolve-BuildTool 'apksigner.bat'

    $built = Read-ApkVersion $apk $aapt2
    if ($built.Code -ne [int]$version.versionCode -or $built.Name -ne $version.versionName) {
        throw "El APK salió como $($built.Name) (código $($built.Code)) pero version.properties dice $($version.versionName) (código $($version.versionCode))."
    }

    # bundletool valida el AAB antes de decir que está listo; sin él la compilación se detiene.
    $bundletool = $env:WRGRAM_BUNDLETOOL
    if (-not $bundletool -or -not (Test-Path $bundletool)) {
        $bundletool = Get-ChildItem $tools -Filter 'bundletool-all-*.jar' -File -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty FullName
    }
    if (-not $bundletool -or -not (Test-Path $bundletool)) { throw 'Falta bundletool. Descarga bundletool-all-*.jar a .\Temp\opencode\wrgram-android-tools\ o define WRGRAM_BUNDLETOOL con su ruta.' }
    Invoke-Tool 'bundletool rechazó el AAB.' { & (Join-Path $env:JAVA_HOME 'bin\java.exe') -jar $bundletool validate --bundle $bundle }

    Invoke-Tool 'El APK no está alineado a 16 KB.' { & $zipalign -c -P 16 4 $apk }
    Invoke-Tool 'apksigner no validó la firma del APK.' { & $apksigner verify --print-certs $apk }

    # El NDK no está instalado en esta máquina, así que AGP no despoja nada por sí solo:
    # sin esta compuerta los 30 MB de DWARF y símbolos de vendor/jni irían en cada instalación.
    Invoke-Tool 'Las bibliotecas nativas empaquetadas conservan símbolos de depuración.' { & node (Join-Path $root 'scripts\check-native-symbols.mjs') $apk $bundle }

    # Play rechaza un versionCode ya usado: se compara con los APKs locales antes de copiar nada.
    New-Item -ItemType Directory -Path $output -Force | Out-Null
    foreach ($existing in @(Get-ChildItem $output -Filter 'WRGram-*.apk' -File -ErrorAction SilentlyContinue)) {
        $previous = Read-ApkVersion $existing.FullName $aapt2
        if ($previous.Code -eq $built.Code -and $previous.Name -ne $built.Name) {
            throw "El código $($built.Code) ya se usó en $($existing.Name) ($($previous.Name)). Sube el versionCode: Play rechazaría este AAB."
        }
    }
    $bundleOut = Join-Path $output ("WRGram-$($built.Name).aab")
    $apkOut = Join-Path $output ("WRGram-$($built.Name).apk")
    $candidateHash = (Get-FileHash $bundle -Algorithm SHA256).Hash
    if ((Test-Path $bundleOut) -and (Get-FileHash $bundleOut -Algorithm SHA256).Hash -ne $candidateHash) {
        throw "$bundleOut ya existe con otros bytes. No se sobrescribe: el AAB ya cargado en Play dejaría de coincidir con el local."
    }

    # La identidad de subida se compara con el último AAB previo; sin previo, se verifica la firma del propio.
    $prior = @(Get-ChildItem $output -Filter 'WRGram-*.aab' -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -ne $bundleOut } | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName)
    $verifier = Join-Path $root 'scripts\VerifyAndroidBundle.java'
    if (-not (Test-Path $verifier)) { throw "Falta $verifier, necesario para comparar el certificado de subida." }
    $priorBundle = if ($prior.Count -gt 0) { $prior[0] } else { $bundle }
    Invoke-Tool 'No se pudo verificar el certificado de subida del AAB.' { & (Join-Path $env:JAVA_HOME 'bin\java.exe') $verifier $priorBundle $bundle }

    Copy-Item $bundle $bundleOut
    Copy-Item $apk $apkOut
    Copy-Item $mapping (Join-Path $output ("mapping-$($built.Name).txt"))
    Get-ChildItem $output -File | Where-Object { $_.Name -match '^WRGram-.*\.(aab|apk)$' } | Sort-Object Name |
        Get-FileHash -Algorithm SHA256 |
        ForEach-Object { $_.Hash.ToLowerInvariant() + '  ' + (Split-Path $_.Path -Leaf) } |
        Set-Content (Join-Path $output 'SHA256SUMS.txt') -Encoding ascii
    Copy-Item (Join-Path $root 'docs\android-play.md') (Join-Path $output 'LEEME.md')
    Copy-Item (Join-Path $android 'tdlib\native-lock.json') (Join-Path $output 'native-lock.json')
    Write-Output "Artefactos locales validados en $output. No se han subido a Play Console."
}
