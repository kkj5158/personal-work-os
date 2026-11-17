"""Local-only, read-only native statement adapters. Never uploads or prints source rows.

Dependencies: openpyxl, xlrd, lxml, msoffcrypto-tool. Passwords come from a local
file; decrypted workbooks live only in memory. Outputs intentionally omit text,
account references and raw records. A statement is evidence, never permission to post.
"""
from __future__ import annotations
import argparse
from dataclasses import dataclass, asdict
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
import hashlib, io, json, re, sys, warnings, zipfile

KST = timezone(timedelta(hours=9))
MAX_BYTES = 2_000_000
MAX_ROWS = 2000
MAX_EXPANDED = 8_000_000

class StatementError(ValueError):
    """Codes contain no source data or secrets."""

def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()

def canonical(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()

def money(value, *, blank_zero=False) -> Decimal:
    if value is None or str(value).strip() == '':
        if blank_zero: return Decimal(0)
        raise StatementError('MISSING_BALANCE_OR_AMOUNT')
    text = str(value).strip().replace(',', '')
    if not re.fullmatch(r'[+-]?\d+(?:\.\d+)?', text): raise StatementError('INVALID_MONEY')
    number = Decimal(text)
    if number != number.to_integral_value(): raise StatementError('NONINTEGER_KRW')
    if abs(number) >= Decimal('100000000000000000'): raise StatementError('MONEY_RANGE')
    return number

def timestamp(value, clock=None):
    text = str(value).strip().replace('.', '-')
    if isinstance(value, datetime):
        result = value
    elif clock is not None:
        result = datetime.strptime(text + ' ' + str(clock).strip(), '%Y-%m-%d %H:%M:%S')
    elif re.fullmatch(r'\d{4}-\d{2}-\d{2}', text):
        return text, 'DAY'
    else:
        try: result = datetime.strptime(text, '%Y-%m-%d %H:%M:%S')
        except ValueError: raise StatementError('INVALID_BANK_TIME') from None
    if result.tzinfo is None: result = result.replace(tzinfo=KST)
    return result.astimezone(KST).isoformat(), 'SECOND'

@dataclass(frozen=True)
class Movement:
    source_hash: str
    source_sheet: int
    source_row: int
    at: str
    precision: str
    signed: Decimal
    balance: Decimal
    description: str
    operation: str
    @property
    def row_id(self):
        return digest(canonical([self.source_hash, self.source_sheet, self.source_row,
            self.at, self.precision, str(self.signed), str(self.balance), self.description, self.operation]))
    def public(self):
        return {'rowId': self.row_id, 'sourceHash': self.source_hash,
                'sourceSheet': self.source_sheet, 'sourceRow': self.source_row,
                'timePrecision': self.precision, 'status': 'POS_MAPPING_REQUIRED',
                'canonicalIds': [], 'reason': 'BANK_CHAIN_VALIDATION_DOES_NOT_PROVE_LEDGER_MATCH'}

def row(source_hash, sheet, number, at, out, inc, balance, desc, operation='', clock=None):
    out, inc = money(out, blank_zero=True), money(inc, blank_zero=True)
    if min(out, inc) < 0 or (out > 0 and inc > 0): raise StatementError('INVALID_FLOW')
    when, precision = timestamp(at, clock)
    return Movement(source_hash, sheet, number, when, precision, inc-out, money(balance), str(desc or ''), str(operation or ''))

def validate(rows):
    if not rows or len(rows) > MAX_ROWS: raise StatementError('ROW_LIMIT')
    if len({r.row_id for r in rows}) != len(rows): raise StatementError('DUPLICATE_SOURCE_ID')
    # Infer only the whole-file direction. Preserve physical same-second order;
    # never find a convenient order by sorting the amounts or post-balances.
    ordered = list(rows) if rows[0].at < rows[-1].at else list(reversed(rows))
    for previous, current in zip(ordered, ordered[1:]):
        if current.at < previous.at: raise StatementError('BANK_SOURCE_ORDER')
        if previous.balance + current.signed != current.balance:
            raise StatementError('BALANCE_CHAIN_FAILURE')
    return ordered

def _html_tables(data):
    from lxml import html
    candidates = []
    for encoding in ('utf-8-sig', 'cp949'):
        try: candidates.append(data.decode(encoding))
        except UnicodeDecodeError: pass
    if not candidates: raise StatementError('UNSUPPORTED_TEXT_ENCODING')
    text = candidates[0]
    if re.search(r'<!DOCTYPE[^>]+\[|<!ENTITY', text, re.I): raise StatementError('EXTERNAL_ENTITY_REJECTED')
    tree = html.fromstring(text, parser=html.HTMLParser(no_network=True))
    if tree.xpath('//script|//object|//embed'): raise StatementError('ACTIVE_CONTENT_REJECTED')
    return [[c.text_content().strip() for c in r.xpath('./th|./td')] for r in tree.xpath('//tr')]

def _biff_tables(data):
    import xlrd
    book = xlrd.open_workbook(file_contents=data, on_demand=True)
    try:
        if book.nsheets > 20: raise StatementError('SHEET_LIMIT')
        tables = []
        for sheet in book.sheets():
            if sheet.nrows > MAX_ROWS + 100 or sheet.ncols > 40: raise StatementError('SHEET_SIZE')
            tables.append([sheet.row_values(i) for i in range(sheet.nrows)])
        return tables
    finally: book.release_resources()

def _ooxml_table(data, password):
    import msoffcrypto, openpyxl
    verifier = 'NOT_ENCRYPTED'
    if data[:8] == bytes.fromhex('d0cf11e0a1b11ae1'):
        if password is None: raise StatementError('LOCAL_PASSWORD_REQUIRED')
        office = msoffcrypto.OfficeFile(io.BytesIO(data))
        try:
            office.load_key(password=password, verify_password=True)
            verifier = 'STANDARD_VERIFIER'
        except msoffcrypto.exceptions.InvalidKeyError:
            # Kakao exports may have a nonstandard password verifier. No password
            # guessing: try exactly the owner input, then validate all ZIP CRCs,
            # strict schema, original digest and the complete bank balance chain.
            office.load_key(password=password, verify_password=False)
            verifier = 'NONSTANDARD_VERIFIER_ZIP_CRC_SCHEMA_CHAIN_REQUIRED'
        plain = io.BytesIO()
        try: office.decrypt(plain)
        except Exception: raise StatementError('DECRYPTION_FAILED') from None
        data = plain.getvalue()
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zipped:
            entries = zipped.infolist()
            if len(entries) > 100 or sum(e.file_size for e in entries) > MAX_EXPANDED:
                raise StatementError('ZIP_EXPANSION_LIMIT')
            if any('vbaproject' in e.filename.lower() or 'externalLinks/' in e.filename for e in entries):
                raise StatementError('MACRO_OR_EXTERNAL_LINK_REJECTED')
            if zipped.testzip() is not None: raise StatementError('ZIP_CRC_FAILURE')
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)
            book = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=False, keep_links=False)
        try:
            if len(book.worksheets) != 1: raise StatementError('UNSUPPORTED_KAKAO_SHEETS')
            result = []
            for cells in book.active.iter_rows():
                if len(result) > MAX_ROWS + 100: raise StatementError('ROW_LIMIT')
                if any(c.data_type == 'f' for c in cells): raise StatementError('FORMULA_REJECTED')
                result.append([c.value for c in cells])
            return result, verifier
        finally: book.close()
    except (zipfile.BadZipFile, KeyError, ValueError) as error:
        if isinstance(error, StatementError): raise
        raise StatementError('INVALID_DECRYPTED_XLSX') from None

def parse(path: Path, provider: str, password=None, *, expected_suffix=None):
    data = path.read_bytes()
    if not 0 < len(data) <= MAX_BYTES: raise StatementError('FILE_SIZE')
    source_hash, rows, verifier = digest(data), [], None
    if provider == 'KAKAO':
        table, verifier = _ooxml_table(data, password)
        identity_header=' '.join(str(v or '') for cells in table[:10] for v in cells)
        expected = ['거래일시', '구분', '거래금액', '거래 후 잔액', '거래구분', '내용', '메모']
        headers = [i for i, cells in enumerate(table) if cells[1:8] == expected]
        if len(headers) != 1: raise StatementError('KAKAO_SCHEMA')
        for i, cells in enumerate(table[headers[0]+1:], headers[0]+2):
            if all(c is None or str(c).strip()=='' for c in cells): continue
            if len(cells)<8 or cells[2] not in ('입금', '출금'): raise StatementError('KAKAO_ROW')
            value = abs(money(cells[3]))
            rows.append(row(source_hash, 0, i, cells[1], value if cells[2]=='출금' else 0,
                value if cells[2]=='입금' else 0, cells[4], cells[6], cells[5]))
        detected = 'ENCRYPTED_OOXML' if data[:2]!=b'PK' else 'OOXML'
    elif provider == 'IBK':
        table = _html_tables(data)
        identity_header=' '.join(str(v or '') for cells in table[:2] for v in cells)
        headers = [i for i,c in enumerate(table) if c[:6]==['No','거래일시','출금','입금','거래후 잔액','거래내용']]
        if len(headers)!=1: raise StatementError('IBK_SCHEMA')
        totals=None
        for i,c in enumerate(table[headers[0]+1:],headers[0]+2):
            if all(not str(v).strip() for v in c): continue
            if len(c)>1 and c[0]=='' and c[1]=='합계':
                if totals is not None: raise StatementError('DUPLICATE_TOTALS')
                totals=(money(c[2]),money(c[3]));continue
            if totals is not None or len(c)!=13 or c[0]!=str(len(rows)+1): raise StatementError('IBK_ROW')
            rows.append(row(source_hash,0,i,c[1],c[2],c[3],c[4],c[5],c[9]))
        if totals!=(sum((-r.signed for r in rows if r.signed<0),Decimal(0)),sum((r.signed for r in rows if r.signed>0),Decimal(0))):
            raise StatementError('BANK_TOTALS_MISMATCH')
        detected = 'HTML_XLS'
    elif provider == 'SHINHAN':
        tables = _biff_tables(data)
        identity_header=' '.join(str(v or '') for cells in tables[0][:6] for v in cells)
        for s,table in enumerate(tables):
            headers = [(i,[str(v).strip() for v in c]) for i,c in enumerate(table)
                if any(str(v).strip()=='거래일자' for v in c)]
            if len(headers)!=1: raise StatementError('SHINHAN_SCHEMA')
            index, names=headers[0]
            payroll = '거래시간' in names
            keys=['거래일자','출금','입금','잔액','내용','적요'] if payroll else ['거래일자','출금(원)','입금(원)','잔액(원)','내용','적요']
            try: di,oi,ii,bi,ti,ki = [names.index(k) for k in keys]
            except ValueError: raise StatementError('SHINHAN_COLUMNS') from None
            for i,c in enumerate(table[index+1:],index+2):
                if di>=len(c) or not re.fullmatch(r'\d{4}[-.]\d{2}[-.]\d{2}',str(c[di]).strip()):
                    # Bank footer only; never skip a damaged row with a cash amount.
                    if any(re.fullmatch(r'\d{4}[-.]\d{2}[-.]\d{2}',str(v).strip()) for v in c):
                        raise StatementError('MISALIGNED_SHINHAN_ROW')
                    continue
                rows.append(row(source_hash,s,i,c[di],c[oi],c[ii],c[bi],c[ti],c[ki],c[names.index('거래시간')] if payroll else None))
        detected = 'BIFF_XLS'
    else: raise StatementError('UNSUPPORTED_PROVIDER')
    if expected_suffix is not None:
        if not re.fullmatch(r'\d{4}',str(expected_suffix)):raise StatementError('EXPECTED_MASKED_SUFFIX_REQUIRED')
        references=re.findall(r'(?<![\d])(?:[\d*]+[- ]?){8,}(?![\d])',identity_header)
        if not any(re.sub(r'[^0-9*]','',v).endswith(expected_suffix) for v in references):
            raise StatementError('STATEMENT_ACCOUNT_IDENTITY_MISMATCH')
    ordered = validate(rows)
    return ordered, {'sha256':source_hash,'format':detected,'passwordVerification':verifier,
        'rowCount':len(rows),'chain':'PASS','opening':str(ordered[0].balance-ordered[0].signed),
        'closing':str(ordered[-1].balance),'firstMovement':ordered[0].at,'lastMovement':ordered[-1].at,
        'cutoffPrecision':ordered[-1].precision,'headerIdentityVerified':expected_suffix is not None,'normalizedHash':digest(canonical([r.row_id for r in ordered]))}

def verify_manifest(root):
    results=[]
    for line in (root/'SOURCE_MANIFEST.sha256').read_text().splitlines():
        expected,relative=line.split(None,1)
        target=(root/relative).resolve()
        if not target.is_relative_to(root.resolve()): raise StatementError('UNSAFE_MANIFEST_PATH')
        if digest(target.read_bytes())!=expected: raise StatementError('SOURCE_DIGEST_MISMATCH')
        results.append({'file':relative,'sha256':expected,'verified':True})
    return results

def local_password(path):
    fields=[s.split('=',1)[1].strip() for s in path.read_text(encoding='utf-8-sig').splitlines()
            if s.startswith('KAKAO_EXPORT_PASSWORD=')]
    if len(fields)!=1 or not fields[0]: raise StatementError('LOCAL_PASSWORD_CONFIGURATION')
    value=fields[0]
    return value[1:-1] if len(value)>1 and value[0] in ('"',"'") and value[-1]==value[0] else value

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',required=True,type=Path)
    parser.add_argument('--output',required=True,type=Path)
    parser.add_argument('--config',required=True,type=Path)
    args=parser.parse_args()
    manifest=verify_manifest(args.root)
    password=local_password(args.root/'secrets/bank_export_password.env')
    imports=[]; public=[]
    config=json.loads(args.config.read_text(encoding='utf-8'))
    for key,binding in config.items():
        filename,provider=binding['file'],binding['provider']
        target=(args.root/'bank_exports'/filename).resolve()
        if not target.is_relative_to((args.root/'bank_exports').resolve()):raise StatementError('UNSAFE_SOURCE_PATH')
        rows,summary=parse(target,provider,password,expected_suffix=binding['suffix'])
        imports.append({'account':key,**summary})
        public.extend({'account':key,**r.public()} for r in rows)
    args.output.mkdir(parents=True,exist_ok=True)
    result={'schema':'money-local-evidence-v1','sourcePolicy':'LOCAL_ONLY_NO_FINANCIAL_WRITES',
        'manifest':manifest,'imports':imports,'totalRows':len(public),'ledgerMappingComplete':False}
    (args.output/'bank-validation.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    (args.output/'statement-row-evidence.json').write_text(json.dumps(public,indent=2),encoding='utf-8')
    print(json.dumps(result))

if __name__=='__main__':
    try: main()
    except StatementError as error:
        print(json.dumps({'status':'FAILED_CLOSED','reason':str(error)}));sys.exit(1)
