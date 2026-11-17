import unittest
from decimal import Decimal
from bank_pipeline import Movement
from source_alignment import align, resolve


class SourceAlignmentTest(unittest.TestCase):
    def setUp(self):
        self.accounts = [{'id': 'own', 'provider': 'IBK', 'masked_reference': '975-******-01-014'},
                         {'id': 'peer', 'provider': 'KAKAO', 'suffix': '1234'}]
        self.row = Movement('a' * 64, 0, 1, '2026-11-17T12:31:19+09:00', 'SECOND', Decimal('-50000'), Decimal('11645'), 'Synthetic merchant', '')
        self.fact = {'id': 'fact', 'amount': 50000, 'currency': 'KRW', 'type': 'EXPENSE', 'meaning_state': 'CONFIRMED', 'version': 0, 'excluded': False, 'merged_into': None, 'from_account_id': 'own', 'to_account_id': None, 'occurred_at': '2026-11-17T03:31:19Z', 'counterparty_text': None, 'title': None}
        self.candidate = {'provider': 'IBK', 'sourceAccountHint': '975-******-01-014', 'direction': 'OUT', 'amount': 50000, 'occurredAt': '2026-11-17T03:31:20Z', 'postBalance': 11645}

    def graph(self, sources=None):
        return {'accounts': self.accounts, 'facts': [self.fact], 'sources': sources or [], 'unlinked': [], 'statementEffects': []}

    def source(self):
        return {'transaction_id': 'fact', 'raw_event_id': 'raw', 'candidate': self.candidate}

    def test_amount_account_sign_and_time_without_independent_proof_do_not_match(self):
        self.assertEqual('NO_CORROBORATED_FACT', align([self.row], 'own', self.graph())[0]['status'])

    def test_exact_balance_and_provider_identity_corroborate_source_and_keep_execution_disabled(self):
        result = align([self.row], 'own', self.graph([self.source()]))[0]
        self.assertEqual('CORROBORATED_CANDIDATE', result['status'])
        self.assertFalse(result['financialExecutionAllowed'])
        self.candidate['provider'] = 'KAKAO'
        self.assertEqual('NO_CORROBORATED_FACT', align([self.row], 'own', self.graph([self.source()]))[0]['status'])

    def test_duplicate_bank_candidates_cannot_consume_one_cash_effect_twice(self):
        other = Movement('a' * 64, 0, 2, self.row.at, 'SECOND', self.row.signed, self.row.balance, self.row.description, '')
        result = align([self.row, other], 'own', self.graph([self.source()]))
        self.assertEqual(['AMBIGUOUS_REUSED_EFFECT'] * 2, [r['status'] for r in result])

    def test_ambiguous_masked_identity_does_not_choose_an_account(self):
        self.accounts.append({'id': 'duplicate', 'provider': 'IBK', 'masked_reference': '975-******-01-014'})
        self.assertIsNone(resolve(self.accounts, self.candidate))

    def test_wrong_balance_and_excluded_fact_remain_unmatched(self):
        self.candidate['postBalance'] = 11644
        self.assertEqual('NO_CORROBORATED_FACT', align([self.row], 'own', self.graph([self.source()]))[0]['status'])
        self.candidate['postBalance'] = 11645
        self.fact['excluded'] = True
        self.assertEqual('NO_CORROBORATED_FACT', align([self.row], 'own', self.graph([self.source()]))[0]['status'])


if __name__ == '__main__':
    unittest.main()
