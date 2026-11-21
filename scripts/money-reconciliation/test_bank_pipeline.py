import unittest, io, tempfile, os
from pathlib import Path
from decimal import Decimal
from unittest.mock import MagicMock, patch
from bank_pipeline import *
from bank_pipeline import _html_tables, _ooxml_table

class BankPipelineTest(unittest.TestCase):
    def movement(self,n,time,signed,balance):
        return Movement('a'*64,0,n,time,'SECOND',Decimal(str(signed)),Decimal(str(balance)),'synthetic','TEST')
    def test_overdraft_paired_lifecycle_preserves_both_legs(self):
        at='2026-10-07T12:33:05+09:00'
        credit=self.movement(1,at,2994755,0);debit=self.movement(2,at,-2994755,-2994755)
        ordered=validate([debit,credit]);self.assertEqual(ordered,[credit,debit]);self.assertEqual(sum(r.signed for r in ordered),0)
        self.assertNotEqual(credit.row_id,debit.row_id)
    def test_independent_transfer_legs_and_subsequent_savings_are_not_collapsed(self):
        a=self.movement(1,'2026-11-17T12:31:19+09:00',50000,52778)
        b=self.movement(2,'2026-11-17T12:31:21+09:00',-50000,2778)
        self.assertEqual(validate([a,b]),[a,b]);self.assertEqual(len({a.row_id,b.row_id}),2)
    def test_unknown_balance_is_not_zero(self):
        for value in (None,'','NaN','1e3'):
            with self.assertRaises(StatementError):money(value)
        self.assertEqual(money('0'),0)
    def test_decimal_krw_and_negative_amount_validation(self):
        self.assertEqual(money('-2,988,827'),Decimal('-2988827'))
        with self.assertRaises(StatementError):money('0.01')
        with self.assertRaises(StatementError):row('a'*64,0,1,'2026-11-17 12:00:00',1,1,0,'test')
    def test_day_precision_never_becomes_an_invented_bank_second(self):
        self.assertEqual(timestamp('2026.11.03'),('2026-11-03','DAY'))
        self.assertEqual(timestamp('2026.11.17 12:31:19'),('2026-11-17T12:31:19+09:00','SECOND'))
    def test_zero_balance_row_preserved_with_no_cash_effect(self):
        zero=self.movement(2,'2026-11-17T12:01:00+09:00',0,0)
        older=self.movement(1,'2026-11-17T12:00:00+09:00',-1,0)
        self.assertEqual(len(validate([zero,older])),2);self.assertEqual(zero.signed,0)
    def test_corrupt_chain_fails_closed(self):
        with self.assertRaisesRegex(StatementError,'BALANCE_CHAIN'):
            validate([self.movement(2,'2026-11-17T12:01:00+09:00',1,9),self.movement(1,'2026-11-17T12:00:00+09:00',1,2)])
    def test_repeated_row_duplicate_rejected_and_reimport_ids_stable(self):
        r=self.movement(1,'2026-11-17T12:00:00+09:00',1,2)
        self.assertEqual(validate([r])[0].row_id,validate([r])[0].row_id)
        with self.assertRaisesRegex(StatementError,'DUPLICATE_SOURCE'):validate([r,r])
    def test_output_contains_no_source_text_or_bank_reference(self):
        r=self.movement(1,'2026-11-17T12:00:00+09:00',1,2)
        data=json.dumps(r.public());self.assertNotIn('synthetic',data);self.assertNotIn('description',data)
        self.assertNotIn('signed',data);self.assertNotIn('balance',data)
    def test_active_html_and_entities_rejected_without_network(self):
        for data in (b'<script>alert(1)</script>',b'<!DOCTYPE x [<!ENTITY x SYSTEM "file:///private">]><table/>'):
            with self.assertRaises(StatementError):_html_tables(data)
    def test_formula_and_macro_rejected(self):
        import openpyxl
        book=openpyxl.Workbook();book.active['A1']='=1+1';out=io.BytesIO();book.save(out)
        with self.assertRaisesRegex(StatementError,'FORMULA_REJECTED'):_ooxml_table(out.getvalue(),None)
    def test_ibk_pdf_checks_page_lineage_totals_and_owner_suffix(self):
        columns = ['No', '선\n거래일시\n택', '출금', '입금', '거래후 잔\n액', '거래내용'] + [''] * 7
        payment = ['1', '2026-03-02\n13:04:05', '50', '0', '450', 'fixture shop'] + [''] * 7
        receipt = ['2', '2026-03-01\n09:00:01', '0', '100', '500', 'fixture receipt'] + [''] * 7
        totals = ['', '합계', '50', '100'] + [''] * 9
        header = ('IBK기업은행 거래내역조회\n계좌번호 : 000-000000-00-1234\n'
                  '현재잔액 : 450원\n조회시작일자 : 2026-03-01\n조회종료일자 : 2026-03-02')
        first, second = MagicMock(), MagicMock()
        first.extract_text.return_value = header
        first.extract_tables.return_value = [[columns, payment]]
        second.extract_tables.return_value = [[columns, receipt, totals]]
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'synthetic.pdf'
            source.write_bytes(b'%PDF-synthetic')
            with patch('pdfplumber.open') as open_pdf:
                open_pdf.return_value.__enter__.return_value.pages = [first, second]
                rows, observed = parse(source, 'IBK', expected_suffix='1234')
                self.assertEqual([(r.source_sheet, r.source_row) for r in rows], [(1, 2), (0, 1)])
                self.assertEqual(observed['closing'], '450')
                self.assertEqual(observed['format'], 'IBK_PDF_TABLE_LOCAL')
                self.assertTrue(observed['headerIdentityVerified'])
                with self.assertRaisesRegex(StatementError, 'STATEMENT_ACCOUNT_IDENTITY_MISMATCH'):
                    parse(source, 'IBK', expected_suffix='1235')
                receipt[0] = '1'
                with self.assertRaisesRegex(StatementError, 'IBK_PDF_ROW_NUMBER'):
                    parse(source, 'IBK', expected_suffix='1234')
                receipt[0] = '2'
                totals[3] = '101'
                with self.assertRaisesRegex(StatementError, 'BANK_TOTALS_MISMATCH'):
                    parse(source, 'IBK', expected_suffix='1234')
                totals[3] = '100'
                receipt[4] = '501'
                with self.assertRaisesRegex(StatementError, 'BALANCE_CHAIN_FAILURE'):
                    parse(source, 'IBK', expected_suffix='1234')

    def test_wrong_password_never_accepts_garbage_as_statement(self):
        import msoffcrypto
        original=io.BytesIO();import openpyxl
        book=openpyxl.Workbook();book.save(original);original.seek(0);encrypted=io.BytesIO()
        msoffcrypto.OfficeFile(original).encrypt('synthetic-test-key',encrypted)
        with self.assertRaisesRegex(StatementError,'INVALID_DECRYPTED_XLSX|DECRYPTION_FAILED'):
            _ooxml_table(encrypted.getvalue(),'wrong-test-key')
    @unittest.skipUnless(os.environ.get('MONEY_BANK_PRIVATE_ROOT'),'Private golden inputs stay outside Git')
    def test_real_audit_and_individual_review_diagnostics(self):
        import analyze_local
        root=Path(os.environ['MONEY_BANK_PRIVATE_ROOT'])
        if not (root/'ledger-pages.private.json').exists():self.skipTest('Private authenticated ledger snapshots unavailable')
        manifest_before=digest((root/'SOURCE_MANIFEST.sha256').read_bytes())
        with patch('sys.argv',['analyze_local.py','--root',str(root)]),patch('sys.stdout',io.StringIO()):analyze_local.main()
        report=json.loads((root/'safe-output/prior-audit-corroboration.json').read_text(encoding='utf-8'))
        cases=json.loads((root/'safe-output/review-decisions.json').read_text(encoding='utf-8'))
        self.assertEqual(report['bankRows'],943);self.assertEqual(report['bankRowsWithoutUniqueNativeEvidence'],0)
        self.assertEqual(len(cases),40)
        expected_unique = 39 if (root/'restored-canonical-graph.private.json').exists() else 38
        self.assertEqual(sum(len(r['bankMatches'])==1 for r in cases),expected_unique)
        self.assertTrue(all(r['actionExecuted'] is False for r in cases))
        self.assertEqual(digest((root/'SOURCE_MANIFEST.sha256').read_bytes()),manifest_before)
        self.assertTrue(all('merchant' not in r and 'title' not in r for r in cases))
    @unittest.skipUnless(os.environ.get('MONEY_BANK_PRIVATE_ROOT'),'Private golden inputs stay outside Git')
    def test_all_native_golden_sources_and_reimport(self):
        root=Path(os.environ['MONEY_BANK_PRIVATE_ROOT']);verify_manifest(root)
        password=local_password(root/'secrets/bank_export_password.env')
        expected=[('kakao_overdraft_20261117.xlsx','KAKAO',35,-2988827),('kakao_gateway_20261117.xlsx','KAKAO',126,7449),
            ('ibk_living_20261117.xls','IBK',621,11645),('shinhan_future_installment_20261117.xls','SHINHAN',11,848000),('shinhan_payroll_20261117.xls','SHINHAN',151,0)]
        count=0
        for name,provider,size,balance in expected:
            rows,summary=parse(root/'bank_exports'/name,provider,password);again,_=parse(root/'bank_exports'/name,provider,password)
            self.assertEqual(len(rows),size);self.assertEqual(rows[-1].balance,balance)
            self.assertEqual([r.row_id for r in rows],[r.row_id for r in again]);count+=len(rows)
        self.assertEqual(count,944)

if __name__=='__main__':unittest.main()
