"""Local source-to-ledger corroboration, never an execution or bank-time override.

The optional graph is an owner-scoped read from an independently restored copy.
It stays outside Git. Output omits raw text, account references and row amounts.
"""
from pathlib import Path
from decimal import Decimal
from collections import Counter, defaultdict
import argparse, json, re
from bank_pipeline import parse, local_password, validate, KST
from analyze_local import instant, text


def resolve(accounts, candidate):
    hint = candidate.get('sourceAccountHint' if candidate.get('direction') == 'OUT' else 'destinationAccountHint')
    if not hint:
        return None
    digits = re.sub(r'\D', '', hint)
    if len(digits) < 3:
        return None
    matches = []
    for a in accounts:
        if a['provider'] != candidate.get('provider'):
            continue
        ref = re.sub(r'\D', '', a.get('masked_reference') or a.get('suffix') or '')
        if len(ref) >= 3 and (ref == digits or len(digits) == 4 and ref.endswith(digits)):
            matches.append(a['id'])
    return matches[0] if len(matches) == 1 else None


def corroborates(row, candidate, account_id, accounts):
    if resolve(accounts, candidate) != account_id or candidate.get('amount') is None:
        return False
    signed = Decimal(str(candidate['amount'])) * (-1 if candidate.get('direction') == 'OUT' else 1)
    if signed != row.signed or signed == 0:
        return False
    at = candidate.get('providerOccurredAt') or candidate.get('occurredAt')
    if not at:
        return False
    when = instant(at).astimezone(KST)
    balance = candidate.get('postBalance')
    residual = re.search(r'잔액\s+(-?[\d,]+)원', candidate.get('counterpartyText') or '')
    if balance is None and residual:
        balance = residual[1].replace(',', '')
    has_balance = balance is not None and Decimal(str(balance)) == row.balance
    if balance is not None and not has_balance:
        return False
    if row.precision == 'DAY':
        temporal = when.date().isoformat() == row.at
    else:
        temporal = abs((when - instant(row.at)).total_seconds()) <= (600 if has_balance else 90)
    a, b = text(row.description), text(candidate.get('counterpartyText'))
    semantic = bool(len(a) >= 2 and len(b) >= 2 and (a.startswith(b) or b.startswith(a)))
    return temporal and (has_balance or semantic)


def near(row, at):
    when = instant(at).astimezone(KST)
    return when.date().isoformat() == row.at if row.precision == 'DAY' else abs((when - instant(row.at)).total_seconds()) <= 90


def align(rows, account_id, graph, bank_rows_by_account=None):
    facts = {f['id']: f for f in graph['facts']}
    sources = [s for s in graph['sources'] if s.get('candidate')]
    source_by_fact = defaultdict(list)
    for source in sources:
        source_by_fact[source['transaction_id']].append(source)
    result = []
    for row in rows:
        matches = defaultdict(list)
        kinds = defaultdict(set)
        for source in sources:
            fact = facts[source['transaction_id']]
            if fact['excluded'] or fact['merged_into'] or fact['currency'] != 'KRW':
                continue
            side = fact.get('from_account_id') if row.signed < 0 else fact.get('to_account_id')
            if side != account_id or Decimal(str(fact['amount'])) != abs(row.signed):
                continue
            if corroborates(row, source['candidate'], account_id, graph['accounts']):
                matches[fact['id']].append(source['raw_event_id'])
                kinds[fact['id']].add('DIRECT_RAW_POSTBALANCE_OR_SEMANTIC')
        for e in graph.get('statementEffects') or []:
            fact = facts[e['transaction_id']]
            if not fact['excluded'] and not fact['merged_into'] and fact['currency'] == 'KRW' and e['account_id'] == account_id and Decimal(str(e['amount'])) == abs(row.signed) and Decimal(str(e['balance_after'])) == row.balance and (e['direction'] == 'OUT') == (row.signed < 0) and near(row, e['occurred_at']):
                matches.setdefault(fact['id'], [])
                kinds[fact['id']].add('EXISTING_STATEMENT_EFFECT')
        for fact in facts.values():
            side = fact.get('from_account_id') if row.signed < 0 else fact.get('to_account_id')
            if row.signed == 0 or fact['excluded'] or fact['merged_into'] or fact['currency'] != 'KRW' or side != account_id or Decimal(str(fact['amount'])) != abs(row.signed) or not near(row, fact['occurred_at']):
                continue
            a = text(row.description)
            semantic = any(len(a) >= 2 and len(b) >= 2 and (a.startswith(b) or b.startswith(a)) for b in [text(fact.get('counterparty_text')), text(fact.get('title'))])
            if semantic:
                matches.setdefault(fact['id'], [])
                kinds[fact['id']].add('CANONICAL_ACCOUNT_SIGN_TIME_AND_TEXT')
            elif fact['type'] == 'TRANSFER' and fact['meaning_state'] == 'CONFIRMED' and bank_rows_by_account:
                peer = fact.get('to_account_id') if row.signed < 0 else fact.get('from_account_id')
                for source in source_by_fact[fact['id']]:
                    if peer and peer != account_id and any(corroborates(other, source['candidate'], peer, graph['accounts']) for other in bank_rows_by_account.get(peer, [])):
                        matches[fact['id']].append(source['raw_event_id'])
                        kinds[fact['id']].add('CONFIRMED_TRANSFER_PEER_BANK_PROOF')
        unmatched = [s['id'] for s in graph['unlinked'] or [] if s.get('candidate') and corroborates(row, s['candidate'], account_id, graph['accounts'])]
        result.append({**row.public(), 'accountId': account_id,
            'status': 'SOURCE_NOISE_ZERO_CASH' if row.signed == 0 else 'CORROBORATED_CANDIDATE' if len(matches) == 1 else 'AMBIGUOUS_EFFECT' if matches else 'NO_CORROBORATED_FACT',
            'facts': [{'transactionId': key, 'version': facts[key]['version'], 'type': facts[key]['type'],
                'meaningState': facts[key]['meaning_state'], 'rawIds': sorted(set(value)), 'evidenceKinds': sorted(kinds[key])} for key, value in sorted(matches.items())],
            'unlinkedRawIds': sorted(set(unmatched)), 'financialExecutionAllowed': False})
    # One fact can represent two different account legs, but two rows of the
    # same account must not silently consume the same canonical effect.
    used = Counter(f['transactionId'] for r in result for f in r['facts'])
    for r in result:
        if any(used[f['transactionId']] > 1 for f in r['facts']):
            r['status'] = 'AMBIGUOUS_REUSED_EFFECT'
    return result


def main():
    p = argparse.ArgumentParser(); p.add_argument('--root', type=Path, required=True)
    args = p.parse_args(); root = args.root
    read = lambda name: json.loads((root / name).read_text(encoding='utf-8'))
    graph = read('restored-canonical-graph.private.json')
    assert graph['source'] == 'INDEPENDENT_VERIFIED_LOCAL_BACKUP_COPY'
    receipt = read('prod-financial-restore-receipt.json')
    assert receipt['status'] == 'FINANCIAL_RESTORE_VERIFIED' and graph['backupSha256'] == receipt['archiveSha256']
    config = read('bindings.private.json'); password = local_password(root / 'secrets/bank_export_password.env')
    base = {x['accountId']: x for x in read('baseline-summary.private.json')['data']}
    output, accounts = [], []
    parsed = {key: parse(root / 'bank_exports' / b['file'], b['provider'], password, expected_suffix=b['suffix']) for key, b in config.items()}
    bank_rows_by_account = {config[key]['accountId']: values[0] for key, values in parsed.items()}
    for key, binding in config.items():
        rows, summary = parsed[key]
        aligned = align(rows, binding['accountId'], graph, bank_rows_by_account); output.extend(aligned)
        anchor = base[binding['accountId']]
        basis = instant(anchor['basisAt'])
        exact_cutoff = summary['cutoffPrecision'] == 'SECOND'
        cutoff = instant(summary['lastMovement']) if exact_cutoff else None
        effects = [e for e in graph['accountEffects'] if e['account_id'] == binding['accountId'] and not e['excluded'] and not e['merged_into'] and e['currency'] == 'KRW' and e['type'] not in ('INITIAL_BALANCE', 'BALANCE_ADJUSTMENT')]
        delta = sum((Decimal(str(e['signed_amount'])) for e in effects if exact_cutoff and basis < instant(e['effective_at']) <= cutoff), Decimal(0))
        projection = Decimal(str(anchor['basisAmount'])) + delta if exact_cutoff else None
        observed = instant(anchor['observedAt'])
        original = Decimal(str(anchor['basisAmount'])) + sum((Decimal(str(e['signed_amount'])) for e in effects if basis < instant(e['effective_at']) <= observed), Decimal(0))
        if original != Decimal(str(anchor['ledgerBalance'])):
            raise ValueError('LOCAL_GRAPH_DOES_NOT_REPRODUCE_AUTHENTICATED_BASELINE')
        anchors = [r for r in rows if r.precision == 'SECOND' and r.balance == Decimal(str(anchor['basisAmount'])) and abs((instant(r.at) - basis).total_seconds()) <= 90]
        anchor_ids = {r.row_id for r in anchors}
        proof = [r for r in aligned if r['rowId'] in anchor_ids and r['status'] == 'CORROBORATED_CANDIDATE']
        ordered = validate(rows)
        positions = {r.row_id: i for i, r in enumerate(ordered)}
        selected_anchor = positions[proof[0]['rowId']] if len(proof) == 1 else None
        after = [r for r in aligned if selected_anchor is not None and positions[r['rowId']] > selected_anchor]
        used = {f['transactionId'] for r in aligned for f in r['facts'] if r['status'] == 'CORROBORATED_CANDIDATE'}
        unmapped = [e['id'] for e in effects if e['id'] not in used and instant(e['effective_at']) > basis and (cutoff is None or instant(e['effective_at']) <= cutoff)]
        accounts.append({'account': key, 'accountId': binding['accountId'], 'bankCutoff': summary['lastMovement'],
            'cutoffPrecision': summary['cutoffPrecision'], 'bankClosing': summary['closing'],
            'canonicalClockBalanceAtBankCutoff': str(projection) if projection is not None else None,
            'canonicalClockDifference': str(Decimal(summary['closing']) - projection) if projection is not None else None,
            'canonicalClock': 'CANONICAL_EFFECTIVE_POSTING_TIME', 'bankClockVerified': False,
            'authenticatedBaselineLedgerReproduced': True,
            'anchorRowCandidates': sorted(anchor_ids), 'sourceCorroboratedAnchorRows': [r['rowId'] for r in proof],
            'bankRowsAfterAnchorWithoutCorroboratedFact': [r['rowId'] for r in after if r['status'] not in ('CORROBORATED_CANDIDATE', 'SOURCE_NOISE_ZERO_CASH')],
            'canonicalEffectsAfterAnchorWithoutSourceMatch': sorted(unmapped),
            'rowsByStatus': dict(Counter(r['status'] for r in aligned)), 'status': 'PARTIALLY_RECONCILED'})
    out = root / 'safe-output'
    (out / 'source-corroborated-rows.json').write_text(json.dumps(output, indent=2), encoding='utf-8')
    (out / 'source-clock-diagnostics.json').write_text(json.dumps({'basis': graph['source'], 'backupSha256': graph['backupSha256'], 'financialWrites': 0, 'accounts': accounts}, indent=2), encoding='utf-8')
    print(json.dumps({'rows': len(output), 'statuses': dict(Counter(r['status'] for r in output)), 'accounts': [{k: a[k] for k in ('account', 'canonicalClockBalanceAtBankCutoff', 'canonicalClockDifference', 'authenticatedBaselineLedgerReproduced', 'rowsByStatus')} for a in accounts]}))


if __name__ == '__main__':
    main()
