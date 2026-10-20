# Private pipe protocol only. Never write request/exception text to any stream.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$store = $null
try {
    Add-Type -Path (Join-Path $PSScriptRoot 'PrivateStore.cs') -ErrorAction Stop
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    while ($null -ne ($line = [Console]::ReadLine())) {
        try {
            $request = ConvertFrom-Json -InputObject $line
            $value = $null
            switch ($request.action) {
                'open' {
                    if ($null -ne $store) { throw 'already_open' }
                    $store = [BetweenPrivateStore]::new($request.root, $request.repository)
                }
                'check' { $store.Check() }
                'create' { $store.Create($request.name, $request.text) }
                'read' { $value = $store.ReadFile($request.name) }
                'list' { $value = @($store.List()) }
                'deleteToken' { $store.DeleteToken($request.name) }
                default { throw 'invalid_action' }
            }
            [Console]::WriteLine((ConvertTo-Json -Compress -Depth 6 -InputObject @{ok=$true; value=$value}))
        } catch {
            [Console]::WriteLine('{"ok":false,"error":"private_store_rejected"}')
        }
    }
} catch {
    [Console]::WriteLine('{"ok":false,"error":"private_store_unavailable"}')
    exit 1
} finally {
    if ($null -ne $store) { $store.Dispose() }
}
