"""Self-authored native-browser manual-pair fixture. No real books or user answers."""
import io, json
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from pypdf import PdfReader, PdfWriter

root = Path('.qa/study-v2/manual-native')
root.mkdir(parents=True, exist_ok=True)
book = 'study-v2-manual-qa-20261115'
source = '724c9034-0c8f-4d5d-89cf-5f218f2209ca'
def question(qid, kind, schema, order, prompt):
    return dict(id=qid, version=1, order=order, kind=kind, prompt=prompt,
                responseSchema=schema, source=dict(materialId=source, section='Self-authored manual QA'))
workbook = dict(id=book, version=1, date='2026-11-24', topic='STUDY V2 manual publication QA', policyVersion=1,
                required=[question('boolean','true_false','boolean',1,'Does uncertainty prove failure?')],
                extension=[question('diagram','diagram','attachment',1,'Draw observation before interpretation.')])
keys = [dict(binding=dict(workbookId=book, workbookVersion=1, part=part, questionId=q['id'], questionVersion=1),
             model='False: uncertainty requires further checking.' if part=='required' else 'Observation leads to interpretation.',
             explanation='Self-authored manual QA answer. No AI grading.', rubric=['Preserve actual observations.'], followUp=[])
        for part in ('required','extension') for q in workbook[part]]
(root/'manual-workbook.json').write_text(json.dumps(dict(workbook=workbook, answerKeys=keys), ensure_ascii=False), encoding='utf-8')
for kind in ('question','answer'):
    buffer=io.BytesIO(); c=canvas.Canvas(buffer, pagesize=A4)
    c.setTitle('STUDY V2 native manual QA '+kind); c.setFont('Helvetica',16)
    c.drawString(45,790,'STUDY V2 self-authored manual QA: '+kind)
    c.setFont('Helvetica',11)
    lines=['Required: Does uncertainty prove failure? True / False.', 'Extension: Draw observation before interpretation.'] if kind=='question' else [k['model'] for k in keys]
    for i,line in enumerate(lines): c.drawString(45,740-i*35,line)
    if kind=='question': c.rect(45,220,500,420)
    c.showPage(); c.save()
    reader=PdfReader(buffer); writer=PdfWriter(); writer.clone_document_from_reader(reader)
    writer.add_metadata({'/StudyWorkbookId':book,'/StudyWorkbookVersion':'1','/StudyDocumentKind':kind})
    with (root/f'manual-{kind}.pdf').open('wb') as target: writer.write(target)
print('SELF_AUTHORED_MANUAL_PAIR_READY')
