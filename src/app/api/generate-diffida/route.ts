import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'

const execAsync = promisify(exec)

interface FormData {
  debtor_name: string
  pec_email: string
  invoice_number: string
  invoice_date: string
  principal_amount: number
  interest_amount: number
  legal_fees: number
  total_amount: number
}

export async function POST(request: NextRequest) {
  try {
    const data: FormData = await request.json()

    // Validate required fields
    if (!data.debtor_name) {
      return NextResponse.json(
        { success: false, error: 'Il nome del debitore è obbligatorio' },
        { status: 400 }
      )
    }

    if (!data.principal_amount || data.principal_amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'L\'importo principale deve essere maggiore di zero' },
        { status: 400 }
      )
    }

    // Create temp file for PDF output
    const tempDir = '/tmp'
    const timestamp = Date.now()
    const outputPath = path.join(tempDir, `diffida_${timestamp}.pdf`)

    // Prepare data for Python script
    const pythonData = JSON.stringify({
      debtor_name: data.debtor_name,
      pec_email: data.pec_email || '',
      invoice_number: data.invoice_number || '',
      invoice_date: data.invoice_date || '',
      principal_amount: data.principal_amount,
      interest_amount: data.interest_amount || 0,
      legal_fees: data.legal_fees || 40.0,
      total_amount: data.total_amount || data.principal_amount + (data.interest_amount || 0) + 40.0
    })

    // Execute Python script
    const scriptPath = path.join(process.cwd(), 'scripts', 'generate_diffida.py')
    
    try {
      // Write data to temp file and pass to Python
      const inputDataPath = path.join(tempDir, `input_${timestamp}.json`)
      await fs.writeFile(inputDataPath, pythonData)

      // Execute Python script
      await execAsync(`python3 "${scriptPath}" < "${inputDataPath}" > "${outputPath}"`)

      // Clean up input file
      await fs.unlink(inputDataPath)

      // Read the generated PDF
      const pdfBuffer = await fs.readFile(outputPath)

      // Clean up output file
      await fs.unlink(outputPath)

      // Return PDF as response
      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="Diffida_${data.debtor_name.replace(/\s+/g, '_')}.pdf"`,
          'Content-Length': pdfBuffer.length.toString()
        }
      })

    } catch (execError) {
      console.error('PDF generation error:', execError)
      
      // Try alternative approach - use simpler Python inline
      try {
        const { stdout, stderr } = await execAsync(
          `python3 -c "
import json
import sys
sys.path.insert(0, '${path.join(process.cwd(), 'scripts')}')
from generate_diffida import generate_diffida_pdf

data = json.loads('''${pythonData.replace(/'/g, "\\'")}''')
output = '${outputPath}'
generate_diffida_pdf(data, output)
print('OK')
"`
        )

        if (stderr && !stderr.includes('OK')) {
          throw new Error(stderr)
        }

        // Read the generated PDF
        const pdfBuffer = await fs.readFile(outputPath)

        // Clean up
        await fs.unlink(outputPath).catch(() => {})

        return new NextResponse(pdfBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="Diffida_${data.debtor_name.replace(/\s+/g, '_')}.pdf"`,
            'Content-Length': pdfBuffer.length.toString()
          }
        })

      } catch (fallbackError) {
        console.error('Fallback PDF generation error:', fallbackError)
        return NextResponse.json(
          { success: false, error: 'Errore durante la generazione del PDF. Verificare che reportlab sia installato.' },
          { status: 500 }
        )
      }
    }

  } catch (error) {
    console.error('PDF generation error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Errore durante la generazione del PDF' 
      },
      { status: 500 }
    )
  }
}
