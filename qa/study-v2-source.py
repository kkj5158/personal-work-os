"""Owner-authored synthetic bilingual text-layer PDF. Contains no user textbook content."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.pagesizes import A4
root=Path(__file__).resolve().parent.parent
out=root/'.qa/study-v2/synthetic-source.pdf'
out.parent.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont('StudyNanum',str(root/'backend/build/study-font/NanumGothic-Regular.ttf')))
pdf=canvas.Canvas(str(out),pagesize=A4,invariant=1)
paragraphs=[
 ('작은 실험과 가설 검증','작은 실험은 가설을 검증하는 과정입니다. 관찰 결과는 가설을 지지하거나 반박할 수 있습니다.','A small experiment tests a hypothesis. Record observations before interpreting results.'),
 ('근거와 불확실성','측정한 사실과 해석은 구분해야 합니다. 자료가 불분명하면 추가 확인이 필요합니다.','Distinguish observed evidence from interpretation. Uncertainty is not proof of failure.'),
 ('프로젝트 적용','작은 기능을 시험하고 결과를 기록합니다. 다음 시도는 실제 관찰을 바탕으로 선택합니다.','Try a small project change, record its result, and choose the next step from actual evidence.'),
 ('리뷰와 보존','이전 답안은 당시 문제 버전과 함께 보존합니다. 새 정책은 이전 기록을 바꾸지 않습니다.','Preserve historical answers with their original question version. New policy affects future work.')]
for title,ko,en in paragraphs:
 pdf.setFont('StudyNanum',16);pdf.drawString(46,790,'STUDY Synthetic Source - '+title)
 pdf.setFont('StudyNanum',11)
 for index,line in enumerate([ko,en,'자체 작성한 테스트 자료이며 교재 내용이나 개인정보를 포함하지 않습니다.']):pdf.drawString(46,740-index*25,line)
 pdf.showPage()
pdf.save()
print('SYNTHETIC_TEXT_LAYER_PDF_READY')
