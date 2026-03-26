#!/usr/bin/env python3
"""
Script per generare il PDF di Diffida per lo Studio Legale Screpis.
Legge i dati dallo stdin in formato JSON e genera il PDF.
"""

import json
import sys
import os
from datetime import datetime, timedelta
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# Register fonts
pdfmetrics.registerFont(TTFont('Times New Roman', '/usr/share/fonts/truetype/english/Times-New-Roman.ttf'))
registerFontFamily('Times New Roman', normal='Times New Roman', bold='Times New Roman')

def calculate_interest(principal: float, invoice_date: str) -> tuple[float, int]:
    """Calculate interest from 30 days after invoice date."""
    LEGAL_INTEREST_RATE = 0.05  # 5% annual rate
    
    if not invoice_date or principal <= 0:
        return 0.0, 0
    
    try:
        invoice = datetime.strptime(invoice_date, '%Y-%m-%d')
    except ValueError:
        return 0.0, 0
    
    due_date = invoice + timedelta(days=30)
    today = datetime.now()
    
    if today <= due_date:
        return 0.0, 0
    
    diff_days = (today - due_date).days
    interest = principal * (LEGAL_INTEREST_RATE / 365) * diff_days
    return round(interest, 2), diff_days

def format_currency(amount: float) -> str:
    """Format currency in Italian format."""
    return f"€ {amount:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')

def format_date(date_str: str) -> str:
    """Format date in Italian format."""
    if not date_str:
        return ''
    try:
        dt = datetime.strptime(date_str, '%Y-%m-%d')
        return dt.strftime('%d/%m/%Y')
    except ValueError:
        return date_str

def generate_diffida_pdf(data: dict, output_path: str):
    """Generate the Diffida PDF document."""
    
    # Extract data
    debtor_name = data.get('debtor_name', '')
    pec_email = data.get('pec_email', '')
    invoice_number = data.get('invoice_number', '')
    invoice_date = data.get('invoice_date', '')
    principal_amount = float(data.get('principal_amount', 0))
    interest_amount = float(data.get('interest_amount', 0))
    legal_fees = float(data.get('legal_fees', 40.0))
    total_amount = float(data.get('total_amount', 0))
    
    # Calculate days for interest
    _, days_late = calculate_interest(principal_amount, invoice_date)
    
    # Create document
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm,
        title=f'Diffida_{debtor_name.replace(" ", "_")}',
        author='Z.ai',
        creator='Z.ai',
        subject='Atto di diffida e messa in mora'
    )
    
    # Styles
    styles = getSampleStyleSheet()
    
    header_style = ParagraphStyle(
        'Header',
        fontName='Times New Roman',
        fontSize=14,
        leading=18,
        alignment=TA_CENTER,
        spaceAfter=6
    )
    
    subheader_style = ParagraphStyle(
        'SubHeader',
        fontName='Times New Roman',
        fontSize=11,
        leading=14,
        alignment=TA_CENTER,
        spaceAfter=20
    )
    
    title_style = ParagraphStyle(
        'Title',
        fontName='Times New Roman',
        fontSize=12,
        leading=16,
        alignment=TA_CENTER,
        spaceBefore=20,
        spaceAfter=20
    )
    
    body_style = ParagraphStyle(
        'Body',
        fontName='Times New Roman',
        fontSize=11,
        leading=16,
        alignment=TA_JUSTIFY,
        spaceAfter=12
    )
    
    right_style = ParagraphStyle(
        'Right',
        fontName='Times New Roman',
        fontSize=11,
        leading=14,
        alignment=TA_RIGHT
    )
    
    footer_style = ParagraphStyle(
        'Footer',
        fontName='Times New Roman',
        fontSize=9,
        leading=12,
        alignment=TA_CENTER,
        textColor=colors.grey
    )
    
    # Build content
    story = []
    
    # Header - Law Firm
    story.append(Paragraph('<b>STUDIO LEGALE AVV. TIZIANA SCREPIS</b>', header_style))
    story.append(Paragraph('Via Pasubio 45 - 95129 Catania', subheader_style))
    story.append(Paragraph('Tel. 3494450691 - tizianascrepis@gmail.com', subheader_style))
    
    story.append(Spacer(1, 20))
    
    # Date and place
    today = datetime.now()
    story.append(Paragraph(f'Catania, {today.strftime("%d/%m/%Y")}', right_style))
    
    story.append(Spacer(1, 30))
    
    # Title
    story.append(Paragraph('<b>ATTO DI DIFFIDA E MESSA IN MORA</b>', title_style))
    
    story.append(Spacer(1, 20))
    
    # Recipient
    story.append(Paragraph(f'<b>Spett.le</b>', body_style))
    story.append(Paragraph(f'<b>{debtor_name}</b>', body_style))
    if pec_email:
        story.append(Paragraph(f'PEC: {pec_email}', body_style))
    
    story.append(Spacer(1, 20))
    
    # Subject
    story.append(Paragraph('<b>OGGETTO: Diffida e messa in mora per conto di IRSAP Sicilia</b>', body_style))
    
    story.append(Spacer(1, 15))
    
    # Body text
    body_text = f"""Il sottoscritto Avv. Tiziana Screpis, in qualità di legale rappresentante di IRSAP Sicilia, 
    con la presente Vi diffida formalmente e Vi mette in mora per il pagamento delle somme dovute in relazione 
    alla fattura n. {invoice_number} del {format_date(invoice_date)}, i cui estremi sono riportati di seguito:"""
    story.append(Paragraph(body_text, body_style))
    
    story.append(Spacer(1, 15))
    
    # Table with amounts
    table_data = [
        [Paragraph('<b>Descrizione</b>', body_style), Paragraph('<b>Importo</b>', body_style)],
        [Paragraph('Sorte Capitale', body_style), Paragraph(format_currency(principal_amount), body_style)],
    ]
    
    if interest_amount > 0:
        table_data.append([
            Paragraph(f'Interessi di Mora ({days_late} giorni)', body_style),
            Paragraph(format_currency(interest_amount), body_style)
        ])
    
    table_data.append([
        Paragraph('Spese Legali', body_style),
        Paragraph(format_currency(legal_fees), body_style)
    ])
    
    table_data.append([
        Paragraph('<b>TOTALE</b>', body_style),
        Paragraph(f'<b>{format_currency(total_amount)}</b>', body_style)
    ])
    
    table = Table(table_data, colWidths=[10*cm, 5*cm])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E79')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (-1, -1), 'Times New Roman'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#F0F0F0')),
    ]))
    
    story.append(table)
    
    story.append(Spacer(1, 20))
    
    # Payment request
    payment_text = f"""Si richiede il pagamento della suddetta somma entro e non oltre <b>5 (cinque) giorni</b> 
    dalla ricezione della presente diffida, tramite bonifico bancario sul seguente conto corrente:"""
    story.append(Paragraph(payment_text, body_style))
    
    story.append(Spacer(1, 10))
    
    # Bank details
    bank_style = ParagraphStyle(
        'Bank',
        fontName='Times New Roman',
        fontSize=11,
        leading=14,
        alignment=TA_CENTER,
        spaceBefore=10,
        spaceAfter=10
    )
    story.append(Paragraph('<b>IBAN: IT78Z0306916702100000046159</b>', bank_style))
    
    story.append(Spacer(1, 15))
    
    # Legal warning
    warning_text = """Si avverte che, in difetto di pagamento nel termine sopra indicato, verranno intraprese 
    le opportune azioni legali per il recupero del credito, con conseguente aggravio di spese e oneri 
    a Vostro carico."""
    story.append(Paragraph(warning_text, body_style))
    
    story.append(Spacer(1, 30))
    
    # Signature
    story.append(Paragraph('In fede,', body_style))
    story.append(Spacer(1, 40))
    story.append(Paragraph('Avv. Tiziana Screpis', body_style))
    
    story.append(Spacer(1, 50))
    
    # Footer
    story.append(Paragraph('_' * 60, footer_style))
    story.append(Paragraph('Studio Legale Avv. Tiziana Screpis', footer_style))
    story.append(Paragraph('Via Pasubio 45 - 95129 Catania', footer_style))
    story.append(Paragraph('Tel. 3494450691 | tizianascrepis@gmail.com', footer_style))
    
    # Build PDF
    doc.build(story)
    
    return output_path

def main():
    try:
        # Read JSON data from stdin
        input_data = sys.stdin.read()
        data = json.loads(input_data)
        
        # Generate PDF to stdout (as base64 would be complex, write to temp and read)
        output_path = '/tmp/diffida_temp.pdf'
        generate_diffida_pdf(data, output_path)
        
        # Read and output the PDF
        with open(output_path, 'rb') as f:
            pdf_content = f.read()
        
        # Write to stdout
        sys.stdout.buffer.write(pdf_content)
        
        # Cleanup
        os.remove(output_path)
        
    except json.JSONDecodeError as e:
        print(f"Errore nel parsing JSON: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Errore durante la generazione del PDF: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
