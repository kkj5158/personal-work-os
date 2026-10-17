#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$EvidencePath)
$ErrorActionPreference='Stop'
# This harness cannot target hosted DEV or PROD. It owns the dedicated local cluster created for this task.
$base='https://127.0.0.1:8443/api/money'
$owner='a43932ea-b5fb-4b46-9f45-0414ef0b2e53'
$psql='C:\Program Files\PostgreSQL\18\bin\psql.exe'
$run=[guid]::NewGuid().ToString('N')
$checks=[Collections.Generic.List[object]]::new()
$manifest=[ordered]@{run=$run;environment='ISOLATED_LOCAL_DEV';base=$base;owner=$owner;startedUtc=[DateTime]::UtcNow.ToString('o');checks=$checks;financialRecords='SYNTHETIC_ONLY';paidAi=$false}
function Sql([string]$Statement) {
    $out=& $psql -X -h 127.0.0.1 -p 55467 -U moneyqa -d money_review_http -v ON_ERROR_STOP=1 -At -c $Statement
    if($LASTEXITCODE -ne 0){throw 'ISOLATED_SQL_FAILED'}
    return ($out -join "`n")
}
function Api([string]$Path,[string]$Method='GET',$Body=$null) {
    $parameters=@{Uri=$base+$Path;Method=$Method;SkipCertificateCheck=$true;TimeoutSec=30}
    if($null -ne $Body){$parameters.ContentType='application/json; charset=utf-8';$parameters.Body=$Body|ConvertTo-Json -Depth 20 -Compress}
    $response=Invoke-RestMethod @parameters
    return $response
}
function Check([bool]$Condition,[string]$Name) {
    $checks.Add([ordered]@{name=$Name;pass=$Condition})
    if(-not $Condition){throw "ASSERTION_FAILED: $Name"}
}
function Raw([string]$Name) {
    $result=Api '/notifications' 'POST' @{text="QA mobile review $run $Name";postedAt='2026-10-16T03:00:00Z';deviceId="isolated-http-$run"}
    $id=[guid]::Parse($result.notification.id).ToString()
    $null=Sql "update money_raw_notifications set state='FAILED',processing_reason='UNSUPPORTED',processing_version=processing_version+1 where id='$id' and user_id='$owner'"
    return $id
}
function Command([string]$Raw,[string]$Type,[decimal]$Amount,[string]$Currency='KRW') {
    $context=Api "/review/manual/v2/$Raw"
    return @{requestId=[guid]::NewGuid().ToString();sources=@(@{id=$Raw;version=$context.version;fingerprint=$context.fingerprint});action='REGISTER_SEPARATE';type=$Type;accountId=$script:account.id;accountVersion=$script:account.version;amount=$Amount;currency=$Currency;occurredAt='2026-10-16T03:00:00Z';timeSource='OWNER_ENTERED';counterparty="QA transaction $run";note='격리 HTTP 합성 검증';impactAccepted=$true}
}
function Confirm([string]$Raw,$Command) {
    $result=Api "/review/manual/v2/$Raw" 'POST' $Command
    Check ($result.status -eq 'APPLIED') "manual $($Command.type) APPLIED"
    return $result
}
try {
    Check ((Sql "select shobj_description(oid,'pg_database') from pg_database where datname=current_database()") -eq 'owned-money-review-http-20261017') 'dedicated HTTP fixture database guard'
    Check ((Sql "select count(*) from auth.users") -eq '1' -and (Sql "select id from auth.users") -eq $owner) 'isolated fixture owner guard'
    Check ((Sql "select version from flyway_schema_history where success order by installed_rank desc limit 1") -eq '88') 'complete Flyway V88 schema'
    $script:account=Api '/accounts' 'POST' @{provider='IBK';displayName="QA mobile $run source";role='SPENDING'}
    $destination=Api '/accounts' 'POST' @{provider='IBK';displayName="QA mobile $run destination";role='SPENDING'}
    $tracking=Api '/tracking'
    $null=Api '/tracking' 'PUT' @{expense=@($account.id,$destination.id);income=@($account.id,$destination.id);expectedVersion=$tracking.version}
    $manifest.accountIds=@($account.id,$destination.id)

    $ordinary=Raw 'ordinary';$command=Command $ordinary 'EXPENSE' 100
    $saved=Confirm $ordinary $command;$fact=$saved.result.transactionId
    $replay=Api "/review/manual/v2/$ordinary" 'POST' $command
    Check ($replay.result.transactionId -eq $fact) 'exact replay retains one financial identity'
    $outcome=Api "/mobile/commands/$($command.requestId)"
    Check ($outcome.status -eq 'APPLIED' -and $outcome.result.transactionId -eq $fact) 'independent outcome GET confirms committed write'

    $duplicate=Raw 'duplicate';$duplicateCommand=Command $duplicate 'EXPENSE' 100
    $duplicateCommand.action='LINK_DUPLICATE';$duplicateCommand.existingTransactionId=$fact;$duplicateCommand.existingTransactionVersion=(Api "/transactions/$fact").version
    $linked=Confirm $duplicate $duplicateCommand
    Check ($linked.result.transactionId -eq $fact -and (Api "/transactions/$fact").sources.Count -eq 2) 'duplicate links both raw sources without another fact'
    $separate=Raw 'separate';$separateResult=Confirm $separate (Command $separate 'EXPENSE' 100)
    Check ($separateResult.result.transactionId -ne $fact) 'equal amount and time may be a legitimate separate transaction'

    foreach($unit in @(@{currency='USD';amount=[decimal]'12.34'},@{currency='KWD';amount=[decimal]'12.345'})) {
        $foreign=Raw $unit.currency;$foreignResult=Confirm $foreign (Command $foreign 'EXPENSE' $unit.amount $unit.currency)
        $read=Api "/transactions/$($foreignResult.result.transactionId)"
        Check ($read.currency -eq $unit.currency -and [decimal]$read.amount -eq $unit.amount) "exact $($unit.currency) amount and currency"
        $projection=Api "/bookkeeping?from=2026-10-01&to=2026-10-31&kind=EXPENSE&currency=$($unit.currency)&limit=1"
        Check ([decimal]$projection.summary.total -ge $unit.amount -and $projection.trend.Count -gt 0) "$($unit.currency) canonical bookkeeping and dated projection"
    }
    $mixed=Api '/bookkeeping?from=2026-10-01&to=2026-10-31&kind=EXPENSE&limit=1'
    Check ($null -eq $mixed.summary.total -and $mixed.analyticsUnavailable) 'mixed currency is never a won total'

    $debit=Raw 'transfer-out';$credit=Raw 'transfer-in';$transfer=Command $debit 'TRANSFER' 50
    $creditContext=Api "/review/manual/v2/$credit"
    $transfer.sources[0].direction='OUT';$transfer.sources+=@{id=$credit;version=$creditContext.version;fingerprint=$creditContext.fingerprint;direction='IN'}
    $transfer.otherAccountId=$destination.id;$transfer.otherAccountVersion=$destination.version
    $transferResult=Confirm $debit $transfer;$transferFact=Api "/transactions/$($transferResult.result.transactionId)"
    Check ($transferFact.type -eq 'TRANSFER' -and $transferFact.sources.Count -eq 2 -and $transferFact.fromAccountId -eq $account.id -and $transferFact.toAccountId -eq $destination.id) 'paired raw evidence creates one canonical transfer with both legs'

    $refundRaw=Raw 'refund';$refund=Command $refundRaw 'REFUND' 30
    $refund.refundOf=$fact;$refund.refundVersion=(Api "/transactions/$fact").version
    $refundResult=Confirm $refundRaw $refund
    Check ((Api "/transactions/$($refundResult.result.transactionId)").refundOf -eq $fact) 'refund links the real original expense'
    $tooMuch=Raw 'refund-overflow';$overflow=Command $tooMuch 'REFUND' 71;$overflow.refundOf=$fact;$overflow.refundVersion=(Api "/transactions/$fact").version
    $rejected=Api "/review/manual/v2/$tooMuch" 'POST' $overflow
    Check ($rejected.status -eq 'NOT_APPLIED' -and (Api "/review/manual/v2/$tooMuch").raw.state -eq 'FAILED') 'over-refund is known not applied and raw stays unresolved'

    $loan=Api '/loans' 'POST' @{name="QA loan $run";lender='QA';type='OTHER';originalPrincipal=1000;remainingPrincipal=0;status='ACTIVE';paymentAccountId=$account.id;startDate='2026-10-01'}
    $receiptRaw=Raw 'loan-receipt';$receipt=Command $receiptRaw 'LOAN_RECEIPT' 200;$receipt.loanId=$loan.id;$receipt.loanVersion=$loan.version
    $receiptResult=Confirm $receiptRaw $receipt
    $loanId=$loan.id
    $loan=Api '/loans' | Where-Object { $_.id -eq $loanId }
    Check ([decimal]$loan.remainingPrincipal -eq 200) 'loan receipt increases real outstanding principal'
    $receiptId=$receiptResult.result.transactionId
    $cancelContext=Api "/registration/$receiptId/context"
    $cancelled=Api "/registration/$receiptId/cancel" 'POST' @{requestId=[guid]::NewGuid().ToString();expectedVersion=$cancelContext.version;expectedLoanVersion=$cancelContext.loanVersion}
    $loan=Api '/loans' | Where-Object { $_.id -eq $loanId }
    Check ($cancelled.status -eq 'APPLIED' -and [decimal]$loan.remainingPrincipal -eq 0) 'receipt cancellation reverses the real principal once'
    $restoreContext=Api "/registration/$receiptId/context"
    $restored=Api "/registration/$receiptId/restore" 'POST' @{requestId=[guid]::NewGuid().ToString();expectedVersion=$restoreContext.version;expectedLoanVersion=$restoreContext.loanVersion;cancellationId=$cancelled.result.cancellationId}
    $loan=Api '/loans' | Where-Object { $_.id -eq $loanId }
    Check ($restored.status -eq 'APPLIED' -and [decimal]$loan.remainingPrincipal -eq 200) 'receipt restoration restores the original principal and identity'
    $paymentRaw=Raw 'loan-payment';$payment=Command $paymentRaw 'LOAN_PAYMENT' 100;$payment.loanId=$loan.id;$payment.loanVersion=$loan.version;$payment.principal=80;$payment.interest=15;$payment.fee=5
    $paymentResult=Confirm $paymentRaw $payment
    $loan=Api '/loans' | Where-Object { $_.id -eq $loanId }
    Check ([decimal]$loan.remainingPrincipal -eq 120 -and [decimal](Api "/bookkeeping/$($paymentResult.result.transactionId)").amount -eq 20) 'repayment principal and interest/fee projection are canonical'

    $conflictRaw=Raw 'stale-evidence';$stale=Command $conflictRaw 'EXPENSE' 10
    $null=Sql "update money_raw_notifications set processing_version=processing_version+1 where id='$conflictRaw' and user_id='$owner'"
    $staleResult=Api "/review/manual/v2/$conflictRaw" 'POST' $stale
    Check ($staleResult.status -eq 'NOT_APPLIED' -and $staleResult.result.reason -eq 'VERSION_CONFLICT') 'changed evidence rejects the old exact command'
    $null=Confirm $conflictRaw (Command $conflictRaw 'EXPENSE' 10)

    $batchA=Raw 'batch-a';$batchB=Raw 'batch-b'
    $excluded=Api '/review/batches/preview' 'POST' @{scope='SELECTED';items=@(@{id=$batchA;kind='RAW'},@{id=$batchB;kind='RAW'});action='MOVE_TO_BOOKKEEPING'}
    Check ($excluded.excludedCount -eq 2 -and $excluded.eligibleCount -eq 0) 'incomplete evidence is explicitly excluded from automatic batch admission'
    $preview=Api '/review/batches/preview' 'POST' @{scope='SELECTED';items=@(@{id=$batchA;kind='RAW'},@{id=$batchB;kind='RAW'});action='DEFER'}
    $null=Sql "update money_raw_notifications set processing_version=processing_version+1 where id='$batchB' and user_id='$owner'"
    $batchCommand=@{previewId=$preview.previewId;requestId=[guid]::NewGuid().ToString()}
    $batch=Api '/review/batches/execute' 'POST' $batchCommand
    Check ($batch.completed -and @($batch.items|Where-Object status -eq 'SAVED').Count -eq 1 -and @($batch.items|Where-Object status -eq 'CONFLICT').Count -eq 1) 'mixed batch retains its success and exact conflict target'
    $batchOutcome=Api "/review/batches/outcomes/$($batchCommand.requestId)"
    Check ($batchOutcome.completed -and $batchOutcome.items.Count -eq 2) 'durable batch outcome is independently readable'

    $pending=Api '/ai/workbench?state=PENDING&limit=100&offset=0'
    Check (-not @($pending.items|Where-Object {$_.id -eq $ordinary -or $_.reason -eq 'CATEGORY_UNCONFIRMED'}).Count) 'confirmed raw and category-only reasons are absent from financial queue'
    $completed=Api '/ai/workbench?state=COMPLETED&limit=100&offset=0'
    Check (@($completed.items|Where-Object {$_.id -eq $ordinary -and $_.kind -eq 'RAW'}).Count -eq 1) 'manual completion remains a RAW review history item'
    $scope=Api '/bookkeeping?from=2026-10-17&to=2026-10-17&kind=EXPENSE&categoryIds=uncategorized&allPeriod=true&limit=1&offset=0'
    Check ($scope.total -gt 1 -and $scope.items.Count -eq 1) 'all-period unclassified count and paged destination agree'
    $movements=Api "/mobile/accounts/$($account.id)/currency-movements"
    Check (@($movements|Where-Object currency -eq 'KWD').Count -eq 1 -and @($movements|Where-Object currency -eq 'USD').Count -eq 1) 'foreign account movements stay separated by currency'
    Check ((Sql "select count(*) from money_classification_jobs j join money_transactions t on t.user_id=j.user_id and t.id=j.transaction_id where t.user_id='$owner' and t.counterparty_text='QA transaction $run' and j.status='QUEUED' and not j.requested") -eq '0') 'review admission leaves no automatic classification job queued'
    $manifest.status='PASS'
} catch {
    $manifest.status='FAIL';$manifest.failure=$_.Exception.Message
    throw
} finally {
    $manifest.finishedUtc=[DateTime]::UtcNow.ToString('o')
    $manifest|ConvertTo-Json -Depth 20|Set-Content -LiteralPath $EvidencePath -Encoding utf8
    Write-Host "Isolated HTTP review checks: $($checks.Count); status: $($manifest.status)"
}
