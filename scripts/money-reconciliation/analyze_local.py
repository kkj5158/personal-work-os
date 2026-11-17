"""Independent local evidence join. Produces diagnostics, never financial commands."""
from pathlib import Path
from decimal import Decimal
from datetime import datetime, timedelta
from collections import Counter
import json, re, argparse
from bank_pipeline import parse, local_password, digest, canonical, KST

def instant(value):
    return datetime.fromisoformat(str(value).replace('Z','+00:00'))

def text(value):
    return re.sub(r'[^\w가-힣]','',str(value or '')).lower()

def main():
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);args=p.parse_args();root=args.root
    def read(file): return json.loads((root/file).read_text(encoding='utf-8'))
    accounts=read('baseline-accounts.private.json')['data']
    baseline={x['accountId']:x for x in read('baseline-summary.private.json')['data']}
    definitions={x['id']:x for x in accounts}
    config=read('bindings.private.json');bindings={key:value['accountId'] for key,value in config.items()}
    sources=[(key,value['file'],value['provider']) for key,value in config.items()]
    password=local_password(root/'secrets/bank_export_password.env')
    movements={}; summaries={}
    for key,file,provider in sources:
        movements[key],summaries[key]=parse(root/'bank_exports'/file,provider,password,expected_suffix=config[key]['suffix'])
        assert definitions[bindings[key]]['provider']==provider
    # Read every audit sheet, but corroborate its proposed matches against native
    # bank rows. Prior analyst decisions never authorize a financial command.
    import openpyxl
    audit=openpyxl.load_workbook(root/'audit/money_reconciliation_audit_20261117.xlsx',read_only=True,data_only=True)
    try: audit_sheets={s.title:list(s.values) for s in audit}
    finally: audit.close()
    def signature(at,amount,balance):
        when=str(at).strip().replace(' ','T',1)
        when=when[:10].replace('.','-')+when[10:]
        if len(when)>10 and not re.search(r'(Z|[+-]\d\d:\d\d)$',when):when+='+09:00'
        return when,Decimal(str(amount)),Decimal(str(balance))
    bank_signatures={}
    for key,rows in movements.items():
        for r in rows:bank_signatures.setdefault(signature(r.at,r.signed,r.balance),[]).append((key,r))
    audit_diagnostics=[];audited_row_ids=set()
    for n,values in enumerate(audit_sheets['Bank_Transactions'][1:],2):
        if not any(v is not None for v in values):continue
        matched=bank_signatures.get(signature(values[2],values[4],values[5]),[])
        audit_diagnostics.append({'auditRow':n,'matchedNativeRowIds':[r.row_id for _,r in matched]})
        audited_row_ids.update(r.row_id for _,r in matched)
    audit_reviews={str(r[0]):r for r in audit_sheets['Review_Matches'][1:] if r and r[0]}
    pages=read('ledger-pages.private.json');ledger={t['id']:t for page in pages for t in page['data']}
    reviews=read('baseline-pending.private.json')['data']['items']+read('baseline-deferred.private.json')['data']['items']
    details={r['id']:r for r in read('review-details.private.json')}
    public_rows=[]; report=[]
    for key,rows in movements.items():
        account=bindings[key];base=baseline[account];counts=Counter()
        for r in rows:
            candidates=[]
            for fact in ledger.values():
                if fact['type'] in ('INITIAL_BALANCE','BALANCE_ADJUSTMENT') or fact['currency']!='KRW': continue
                signed=(Decimal(str(fact['amount'])) if fact.get('toAccountId')==account else Decimal(0))-(Decimal(str(fact['amount'])) if fact.get('fromAccountId')==account else Decimal(0))
                if signed!=r.signed or signed==0: continue
                at=instant(fact['occurredAt']).astimezone(KST)
                in_window=at.date().isoformat()==r.at if r.precision=='DAY' else abs((at-instant(r.at)).total_seconds())<=90
                if in_window:
                    title=text(fact.get('title'));description=text(r.description)
                    semantic=bool(title and description and (title in description or description in title))
                    candidates.append({'transactionId':fact['id'],'version':fact['version'],
                        'semanticCorroboration':semantic,'sourceCount':fact['sourceCount'],
                        'type':fact['type'],'meaningState':fact['meaningState']})
            anchor=instant(base['basisAt']).astimezone(KST) if base.get('basisAt') else None
            same_anchor_second=bool(anchor and r.precision=='SECOND' and abs((instant(r.at)-anchor).total_seconds())<=90)
            before=bool(anchor and (r.at < anchor.date().isoformat() if r.precision=='DAY' else instant(r.at)<anchor.replace(microsecond=0)))
            status='BALANCE_ONLY_ZERO' if r.signed==0 else 'ANCHOR_WINDOW_REQUIRES_SOURCE_ALIGNMENT' if same_anchor_second else 'PRE_POS_ANCHOR' if before else 'MULTIPLE_CANDIDATES' if len(candidates)>1 else 'CANDIDATE_MATCH' if candidates else 'MISSING_OR_TIME_ALIGNMENT_REQUIRED'
            counts[status]+=1
            public_rows.append({**r.public(),'accountId':account,'account':key,'status':status,
                'canonicalCandidates':candidates,'reason':'CANDIDATE_REQUIRES_SOURCE_POST_BALANCE_AND_APPROVED_SEMANTICS' if candidates else status})
        summary=summaries[key]
        report.append({'account':key,'accountId':account,'bank':summary,
            'observedPosLedger':base['ledgerBalance'],'observedPosDifference':base['difference'],
            'notificationObservedAt':base['observedAt'],'posBasisAt':base['basisAt'],'posBasisAmount':base['basisAmount'],
            'bankClosingMinusObservedLedger':str(Decimal(summary['closing'])-Decimal(str(base['ledgerBalance']))),
            'asOfAlignment':'DAY_ONLY_SOURCE' if summary['cutoffPrecision']=='DAY' else 'REQUIRES_BANK_VS_ANDROID_POSTING_ALIGNMENT',
            'rowsByStatus':dict(counts),'status':'PARTIALLY_RECONCILED','financialWrites':0})
    review_output=[]
    for review in reviews:
        c=review.get('candidate') or {}; provider=c.get('provider');amount=c.get('amount')
        account_id=review.get('accountId')
        if review['kind']=='TRANSACTION':
            fact=ledger.get(review['id'])
            if fact and fact['currency']=='KRW':
                account_id=account_id or fact.get('fromAccountId') or fact.get('toAccountId')
                provider=definitions.get(account_id,{}).get('provider');amount=fact['amount']
                c={**c,'direction':'OUT' if fact.get('fromAccountId')==account_id else 'IN'}
        signed=Decimal(str(amount))*(-1 if c.get('direction')=='OUT' else 1) if amount is not None and c.get('direction') else None
        at=c.get('occurredAt') or review['occurredAt'];when=instant(at)
        balance=c.get('postBalance')
        balance_origin='CANONICAL_PARSED_BALANCE' if balance is not None else None
        if balance is None:
            # Some older Kakao parser versions left the balance inside the
            # counterparty field. This corroborates timing only, never rewrites
            # the immutable source or pretends a new parser attempt occurred.
            residual=re.search(r'잔액\s+(-?[\d,]+)원',c.get('counterpartyText') or '')
            if residual:balance=Decimal(residual[1].replace(',',''));balance_origin='LEGACY_PARSED_FIELD_BALANCE'
        matches=[]
        for key,rows in movements.items():
            if definitions[bindings[key]]['provider']!=provider: continue
            if account_id and account_id!=bindings[key]: continue
            for r in rows:
                if r.precision!='SECOND':continue
                delay=abs((instant(r.at)-when).total_seconds())
                if delay>90 and not (delay<=600 and balance is not None and account_id==bindings[key] and r.balance==Decimal(str(balance))):continue
                if signed is not None and r.signed!=signed: continue
                if balance is not None and r.balance!=Decimal(str(balance)): continue
                # Malformed source still has a title, but never becomes executable
                # just by obtaining one plausible amount/time match.
                if signed is None:
                    title=re.search(r'(입금|출금)\s*([\d,]+)원',review.get('title',''))
                    if not title or r.signed!=Decimal(title[2].replace(',',''))*(-1 if title[1]=='출금' else 1): continue
                matches.append({'rowId':r.row_id,'sourceHash':r.source_hash,'sourceRow':r.source_row,'accountId':bindings[key],
                    'notificationDelaySeconds':(when-instant(r.at)).total_seconds(),'balanceCorroboration':balance_origin,'amountSignAccountTimeVerified':signed is not None and account_id==bindings[key]})
        detail=details.get(review['id'],{})
        audit_matches=[]
        prior=audit_reviews.get(review['id'])
        if prior and prior[8] is not None and prior[9] is not None and prior[10] is not None:
            audit_matches=[{'rowId':r.row_id,'sourceHash':r.source_hash,'sourceRow':r.source_row,'accountId':bindings[key]}
                for key,r in bank_signatures.get(signature(prior[8],prior[9],prior[10]),[])]
        blocker='BOUNDED_REPROCESS_NOT_SUPPORTED' if amount is None else 'EXACT_OWNER_PREVIEW_APPROVAL_REQUIRED' if review.get('moveToBookkeepingEligible') else 'CANONICAL_FINANCIAL_PREVIEW_NOT_GENERATED'
        if len(matches)!=1: blocker='AMBIGUOUS_SOURCE' if matches else 'TIME_OR_OTHER_ACCOUNT_INSPECTION_REQUIRED'
        if detail.get('status')!='READ': blocker='DETAIL_READ_FAILED'
        review_output.append({'id':review['id'],'kind':review['kind'],'state':review['state'],
            'processingVersion':review['version'],'originalReason':review['reason'],'bankMatches':matches,
            'priorAuditNativeMatches':audit_matches,
            'status':'BLOCKED_TECH' if blocker in ('BOUNDED_REPROCESS_NOT_SUPPORTED','DETAIL_READ_FAILED') else 'BLOCKED_APPROVAL' if blocker=='EXACT_OWNER_PREVIEW_APPROVAL_REQUIRED' else 'NOT_TESTED' if len(matches)==1 else 'BLOCKED_MISSING_SOURCE',
            'blocker':blocker,'protectedPriorHold':review['state']=='DEFERRED','actionExecuted':False})
    out=root/'safe-output';out.mkdir(exist_ok=True)
    for name,data in [('account-reconciliation',report),('statement-row-decisions',public_rows),('review-decisions',review_output)]:
        (out/(name+'.json')).write_text(json.dumps(data,indent=2),encoding='utf-8')
    coverage=[{'accountId':a['id'],'archived':a['archived'],'status':'PARTIALLY_RECONCILED' if a['id'] in bindings.values() else 'BLOCKED_MISSING_SOURCE','sourceCoverage':a['id'] in bindings.values()} for a in accounts]
    (out/'account-coverage.json').write_text(json.dumps(coverage,indent=2),encoding='utf-8')
    native_only=[{'account':key,'rowId':r.row_id,'zeroCash':r.signed==0} for key,rows in movements.items() for r in rows if r.row_id not in audited_row_ids]
    audit_result={'sheetsRead':{k:len(v) for k,v in audit_sheets.items()},'bankRows':len(audit_diagnostics),
        'bankRowsWithoutUniqueNativeEvidence':sum(len(r['matchedNativeRowIds'])!=1 for r in audit_diagnostics),
        'nativeRowsOmittedFromPriorAudit':native_only,'rows':audit_diagnostics}
    (out/'prior-audit-corroboration.json').write_text(json.dumps(audit_result,indent=2),encoding='utf-8')
    print(json.dumps({'ledgerFacts':len(ledger),'reviewCount':len(reviews),'reviewMatches':dict(Counter(len(r['bankMatches']) for r in review_output)),
        'reviewBlockers':dict(Counter(r['blocker'] for r in review_output)),'auditBankRows':len(audit_diagnostics),'auditUnmatched':audit_result['bankRowsWithoutUniqueNativeEvidence'],'nativeOnlyCount':len(native_only),'nativeOnlyZeroCount':sum(x['zeroCash'] for x in native_only),'accounts':[{'account':r['account'],'bankRows':r['bank']['rowCount'],'zeroRows':r['rowsByStatus'].get('BALANCE_ONLY_ZERO',0),'rowsByStatus':r['rowsByStatus']} for r in report]}))

if __name__=='__main__': main()
