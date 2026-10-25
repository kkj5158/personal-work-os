import test from 'node:test';
import assert from 'node:assert/strict';
import { withoutDietDashboard } from './dietJournal.ts';
test('derived dashboard revisions do not turn independent body typing into a conflict', () => {
  assert.equal(withoutDietDashboard(':::diet {"noteVersion":1}\n:::\n\n글'), '글');
  assert.equal(withoutDietDashboard(':::diet {"noteVersion":2}\n:::\n\n글'), '글');
  assert.notEqual(withoutDietDashboard(':::diet {}\n:::\n\n첫 글'), withoutDietDashboard(':::diet {}\n:::\n\n새 글'));
});
test('fenced dashboard examples remain meaningful user content', () => {
  for (const fence of ['```', '~~~~']) {
    const example=`${fence}\n:::diet {"example":1}\n:::\n${fence}`;
    assert.equal(withoutDietDashboard(example), example);
    assert.notEqual(withoutDietDashboard(example), withoutDietDashboard(example.replace('1', '2')));
  }
});
test('code indentation and hard linebreak whitespace are preserved', () => {
  assert.equal(withoutDietDashboard(':::diet {}\n:::\n\n    code\nline  \nnext'), '    code\nline  \nnext');
});
