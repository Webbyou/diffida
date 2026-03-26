'use client'

import { useState, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { AlertCircle, Upload, FileText, Download, Mail, LogOut, Scale, Loader2 } from 'lucide-react'

// Demo credentials
const DEMO_CREDENTIALS = {
  username: 'demo',
  password: 'demo123'
}

// Types
interface ExtractedData {
  debtor_name: string
  pec_email: string
  invoice_number: string
  invoice_date: string
  principal_amount: number
}

interface FormState extends ExtractedData {
  interest_amount: number
  legal_fees: number
  total_amount: number
}

// Interest rate for late payment (legal interest rate in Italy - 2024)
const LEGAL_INTEREST_RATE = 0.05 // 5%

// Calculate interest from 30 days after invoice date
function calculateInterest(principal: number, invoiceDate: string): number {
  if (!invoiceDate || principal <= 0) return 0

  const invoice = new Date(invoiceDate)
  const dueDate = new Date(invoice)
  dueDate.setDate(dueDate.getDate() + 30) // 30 days after invoice

  const today = new Date()

  if (today <= dueDate) return 0

  const diffTime = Math.abs(today.getTime() - dueDate.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  // Simple interest calculation
  const interest = principal * (LEGAL_INTEREST_RATE / 365) * diffDays
  return Math.round(interest * 100) / 100
}

// Format currency in Italian format
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount)
}

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [fileName, setFileName] = useState<string | null>(null)
  const [extractionError, setExtractionError] = useState<string | null>(null)

  const [formData, setFormData] = useState<FormState>({
    debtor_name: '',
    pec_email: '',
    invoice_number: '',
    invoice_date: '',
    principal_amount: 0,
    interest_amount: 0,
    legal_fees: 40.0,
    total_amount: 40.0
  })

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Handle login
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')

    if (username === DEMO_CREDENTIALS.username && password === DEMO_CREDENTIALS.password) {
      setIsLoggedIn(true)
    } else {
      setLoginError('Credenziali non valide. Riprova.')
    }
  }

  // Handle logout
  const handleLogout = () => {
    setIsLoggedIn(false)
    setUsername('')
    setPassword('')
    resetForm()
  }

  // Reset form
  const resetForm = () => {
    setFormData({
      debtor_name: '',
      pec_email: '',
      invoice_number: '',
      invoice_date: '',
      principal_amount: 0,
      interest_amount: 0,
      legal_fees: 40.0,
      total_amount: 40.0
    })
    setFileName(null)
    setExtractionError(null)
    setUploadProgress(0)
  }

  // Handle file upload
  const handleFileUpload = useCallback(async (file: File) => {
    if (!file || file.type !== 'application/pdf') {
      setExtractionError('Per favore carica un file PDF valido.')
      return
    }

    setIsProcessing(true)
    setUploadProgress(0)
    setExtractionError(null)
    setFileName(file.name)

    // Simulate upload progress
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval)
          return prev
        }
        return prev + 10
      })
    }, 200)

    try {
      const formDataToSend = new FormData()
      formDataToSend.append('file', file)

      const response = await fetch('/api/extract-invoice', {
        method: 'POST',
        body: formDataToSend
      })

      clearInterval(progressInterval)
      setUploadProgress(100)

      if (!response.ok) {
        throw new Error('Errore durante l\'elaborazione del file')
      }

      const result = await response.json()

      if (result.success && result.data) {
        const extractedData: ExtractedData = result.data
        const interest = calculateInterest(extractedData.principal_amount, extractedData.invoice_date)
        const total = extractedData.principal_amount + interest + 40.0

        setFormData({
          ...extractedData,
          interest_amount: interest,
          legal_fees: 40.0,
          total_amount: total
        })
      } else {
        throw new Error(result.error || 'Errore durante l\'estrazione dei dati')
      }
    } catch (error) {
      clearInterval(progressInterval)
      setExtractionError(error instanceof Error ? error.message : 'Si è verificato un errore imprevisto')
      setFileName(null)
    } finally {
      setIsProcessing(false)
      setTimeout(() => setUploadProgress(0), 500)
    }
  }, [])

  // Handle drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileUpload(file)
    }
  }, [handleFileUpload])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  // Handle form field changes
  const handleFieldChange = (field: keyof FormState, value: string | number) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value }

      // Recalculate interest and total when relevant fields change
      if (field === 'principal_amount' || field === 'invoice_date') {
        updated.interest_amount = calculateInterest(
          field === 'principal_amount' ? Number(value) : prev.principal_amount,
          field === 'invoice_date' ? String(value) : prev.invoice_date
        )
        updated.total_amount = updated.principal_amount + updated.interest_amount + updated.legal_fees
      }

      return updated
    })
  }

  // Generate and download PDF
  const handleDownloadPDF = async () => {
    try {
      const response = await fetch('/api/generate-diffida', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })

      if (!response.ok) {
        throw new Error('Errore durante la generazione del PDF')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      a.download = `Diffida_${formData.debtor_name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
      window.document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      a.remove()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Errore durante il download')
    }
  }

  // Handle PEC send (placeholder)
  const handleSendPEC = () => {
    if (!formData.pec_email) {
      alert('Inserisci un indirizzo PEC valido prima di inviare.')
      return
    }
    alert(`Funzionalità PEC in fase di implementazione.\nLa diffida verrà inviata a: ${formData.pec_email}`)
  }

  // Login Page
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md shadow-lg">
            <CardHeader className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center">
                <Scale className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-2xl">Studio Legale Screpis</CardTitle>
              <CardDescription>Gestione Diffide - Accesso Riservato</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Nome Utente</Label>
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Inserisci nome utente"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Inserisci password"
                    required
                  />
                </div>

                {loginError && (
                  <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-md">
                    <AlertCircle className="w-4 h-4" />
                    <span>{loginError}</span>
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Accesso in corso...
                    </>
                  ) : (
                    'Accedi'
                  )}
                </Button>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-slate-500">oppure</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => alert('Integrazione Google in fase di sviluppo')}
                  >
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Entra con Google
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => alert('Integrazione SPID in fase di sviluppo')}
                  >
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                      <path
                        d="M12 6v6l4 2"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    Entra con SPID
                  </Button>
                </div>

                <p className="text-xs text-center text-slate-500 mt-4">
                  Credenziali demo: <strong>demo</strong> / <strong>demo123</strong>
                </p>
              </form>
            </CardContent>
          </Card>
        </main>
        <footer className="py-4 text-center text-sm text-slate-500 border-t bg-white">
          Studio Legale Avv. Tiziana Screpis - Via Pasubio 45, 95129 Catania
        </footer>
      </div>
    )
  }

  // Dashboard
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center">
              <Scale className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">Studio Legale Screpis</h1>
              <p className="text-sm text-slate-500">Gestione Diffide</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Esci
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full p-4 space-y-6">
        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Carica Fattura PDF
            </CardTitle>
            <CardDescription>
              Trascina un file PDF della fattura o clicca per selezionarlo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isProcessing ? 'border-slate-300 bg-slate-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => !isProcessing && fileInputRef.current?.click()}
              style={{ cursor: isProcessing ? 'wait' : 'pointer' }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileUpload(file)
                }}
              />

              {isProcessing ? (
                <div className="space-y-4">
                  <Loader2 className="w-12 h-12 mx-auto text-slate-400 animate-spin" />
                  <p className="text-slate-600 font-medium">Elaborazione in corso...</p>
                  {uploadProgress > 0 && (
                    <div className="max-w-xs mx-auto">
                      <Progress value={uploadProgress} className="h-2" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <FileText className="w-12 h-12 mx-auto text-slate-400" />
                  <p className="text-slate-600">
                    Trascina qui il file PDF o <span className="text-slate-800 font-medium">clicca per sfogliare</span>
                  </p>
                  <p className="text-xs text-slate-400">Solo file PDF, max 10MB</p>
                </div>
              )}
            </div>

            {fileName && !isProcessing && (
              <div className="mt-4 flex items-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded-md">
                <FileText className="w-4 h-4" />
                <span>File caricato: <strong>{fileName}</strong></span>
              </div>
            )}

            {extractionError && (
              <div className="mt-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-md">
                <AlertCircle className="w-4 h-4" />
                <span>{extractionError}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Review Form */}
        {formData.debtor_name && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Rivedi e Conferma Dati
              </CardTitle>
              <CardDescription>
                Verifica i dati estratti e modifica se necessario
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                {/* Debitore */}
                <div className="space-y-2">
                  <Label htmlFor="debtor_name">Debitore</Label>
                  <Input
                    id="debtor_name"
                    value={formData.debtor_name}
                    onChange={(e) => handleFieldChange('debtor_name', e.target.value)}
                  />
                </div>

                {/* Indirizzo PEC */}
                <div className="space-y-2">
                  <Label htmlFor="pec_email" className="flex items-center gap-2">
                    Indirizzo PEC
                    {!formData.pec_email && (
                      <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                        Obbligatorio
                      </span>
                    )}
                  </Label>
                  <Input
                    id="pec_email"
                    type="email"
                    value={formData.pec_email}
                    onChange={(e) => handleFieldChange('pec_email', e.target.value)}
                    className={!formData.pec_email ? 'border-amber-400 focus-visible:ring-amber-400' : ''}
                    placeholder="esempio@pec.it"
                  />
                </div>

                {/* Numero Fattura */}
                <div className="space-y-2">
                  <Label htmlFor="invoice_number">Numero Fattura</Label>
                  <Input
                    id="invoice_number"
                    value={formData.invoice_number}
                    onChange={(e) => handleFieldChange('invoice_number', e.target.value)}
                  />
                </div>

                {/* Data Fattura */}
                <div className="space-y-2">
                  <Label htmlFor="invoice_date">Data Fattura</Label>
                  <Input
                    id="invoice_date"
                    type="date"
                    value={formData.invoice_date}
                    onChange={(e) => handleFieldChange('invoice_date', e.target.value)}
                  />
                </div>

                {/* Sorte Capitale */}
                <div className="space-y-2">
                  <Label htmlFor="principal_amount">Sorte Capitale (€)</Label>
                  <Input
                    id="principal_amount"
                    type="number"
                    step="0.01"
                    value={formData.principal_amount || ''}
                    onChange={(e) => handleFieldChange('principal_amount', parseFloat(e.target.value) || 0)}
                  />
                </div>

                {/* Interessi di Mora */}
                <div className="space-y-2">
                  <Label htmlFor="interest_amount">Interessi di Mora (€)</Label>
                  <Input
                    id="interest_amount"
                    type="text"
                    value={formatCurrency(formData.interest_amount)}
                    disabled
                    className="bg-slate-50"
                  />
                  <p className="text-xs text-slate-500">
                    Calcolati dal 30° giorno dopo la data fattura (tasso legale: {(LEGAL_INTEREST_RATE * 100).toFixed(1)}%)
                  </p>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                <h4 className="font-medium text-sm text-slate-700">Riepilogo Importi</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Sorte Capitale:</span>
                    <span className="font-medium">{formatCurrency(formData.principal_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Interessi di Mora:</span>
                    <span className="font-medium">{formatCurrency(formData.interest_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Spese Legali:</span>
                    <span className="font-medium">{formatCurrency(formData.legal_fees)}</span>
                  </div>
                  <div className="border-t pt-2 mt-2 flex justify-between text-base font-semibold">
                    <span>Totale:</span>
                    <span>{formatCurrency(formData.total_amount)}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={handleDownloadPDF} className="flex-1">
                  <Download className="w-4 h-4 mr-2" />
                  Scarica Diffida PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSendPEC}
                  className="flex-1"
                  disabled={!formData.pec_email}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Invia via PEC
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t py-6 mt-auto">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-sm text-slate-600">
            <strong>Studio Legale Avv. Tiziana Screpis</strong>
          </p>
          <p className="text-sm text-slate-500 mt-1">
            Tel. 3494450691 | tizianascrepis@gmail.com | Via Pasubio 45, 95129 Catania
          </p>
          <p className="text-xs text-slate-400 mt-2">
            IBAN: IT78Z0306916702100000046159
          </p>
        </div>
      </footer>
    </div>
  )
}
