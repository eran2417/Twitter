import { useState } from 'react'
import { X, Sparkles, RefreshCw, Check, Zap } from 'lucide-react'
import toast from 'react-hot-toast'

const TONES = [
  { id: 'professional', label: 'Professional', emoji: '💼' },
  { id: 'casual', label: 'Casual', emoji: '😊' },
  { id: 'funny', label: 'Funny', emoji: '😄' },
  { id: 'inspirational', label: 'Inspire', emoji: '🚀' },
]

const LOADING_MESSAGES = [
  'Crafting your chirp...',
  'Analyzing tone...',
  'Optimizing for engagement...',
  'Adding the final touches...',
]

// Placeholder responses until backend AI service is wired up
const MOCK_CHIRPS = {
  professional: [
    "The intersection of AI and innovation isn't just about automation—it's about augmenting human judgment at scale. Organizations embracing this shift aren't replacing talent—they're giving them superpowers. The data doesn't lie. #Innovation #AI",
    "In 2026, the competitive edge isn't just speed—it's the quality of decisions made under pressure. Technology amplifies human potential when applied thoughtfully. Building with that principle in mind. #Leadership #Tech",
  ],
  casual: [
    "okay but this is genuinely wild 🤯 the way technology keeps evolving faster than we can keep up. the future is already here, it's just unevenly distributed fr",
    "hot take: the people who figure out how to work *with* new tools instead of against them are going to absolutely clean up. been saying this for years 👀",
  ],
  funny: [
    "Me in 2020: I'll never use AI for anything\nMe now: asking AI to help me decide what to eat for lunch 💀 the pipeline was shorter than expected",
    "the audacity of my brain to be like 'just wing it' when there are literally tools designed to help 😭 growth is unlearning bad habits one day at a time",
  ],
  inspirational: [
    "Every expert was once a beginner. Every breakthrough was once impossible. The only thing standing between where you are and where you want to be is the decision to start. Take it. 🌍",
    "What if the idea that changes everything is already in your head, waiting for you to believe it's worth pursuing? Stop waiting for permission. Build it. 🚀",
  ],
}

export default function ComposeWithAI({ isOpen, onClose, onUseChirp }) {
  const [step, setStep] = useState('form') // form | loading | result
  const [selectedTone, setSelectedTone] = useState('')
  const [topic, setTopic] = useState('')
  const [audience, setAudience] = useState('')
  const [keywords, setKeywords] = useState('')
  const [generatedText, setGeneratedText] = useState('')
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0])

  const charCount = generatedText.length
  const remaining = 280 - charCount

  function reset() {
    setStep('form')
    setSelectedTone('')
    setTopic('')
    setAudience('')
    setKeywords('')
    setGeneratedText('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function generate() {
    if (!topic.trim()) {
      toast.error('Please enter a topic')
      return
    }
    if (!selectedTone) {
      toast.error('Please select a tone')
      return
    }

    setStep('loading')

    // Cycle loading messages
    let i = 0
    const interval = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length
      setLoadingMsg(LOADING_MESSAGES[i])
    }, 600)

    try {
      // TODO: replace with real API call when ai-service is ready
      // const res = await aiAPI.compose({ topic, tone: selectedTone, audience, keywords })
      // setGeneratedText(res.data.content)
      await new Promise(r => setTimeout(r, 2200))
      const chirps = MOCK_CHIRPS[selectedTone]
      setGeneratedText(chirps[Math.floor(Math.random() * chirps.length)])
      setStep('result')
    } catch {
      toast.error('Failed to generate chirp. Try again.')
      setStep('form')
    } finally {
      clearInterval(interval)
    }
  }

  function handleUse() {
    if (remaining < 0) {
      toast.error('Chirp exceeds 280 characters')
      return
    }
    onUseChirp(generatedText)
    handleClose()
    toast.success('✨ AI chirp loaded — edit and post!')
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-400 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-white">Compose with AI</h2>
              <p className="text-xs text-gray-500">Powered by Claude</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step: Form */}
        {step === 'form' && (
          <div className="p-5 space-y-4">
            {/* Topic */}
            <div>
              <label className="text-sm font-medium text-gray-400 mb-1.5 block">
                Topic <span className="text-sky-400">*</span>
              </label>
              <input
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g. The future of AI in healthcare"
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 outline-none focus:border-sky-500 transition-colors text-sm"
              />
            </div>

            {/* Tone */}
            <div>
              <label className="text-sm font-medium text-gray-400 mb-1.5 block">
                Tone <span className="text-sky-400">*</span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {TONES.map(({ id, label, emoji }) => (
                  <button
                    key={id}
                    onClick={() => setSelectedTone(id)}
                    className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                      selectedTone === id
                        ? 'border-sky-500 text-sky-400 bg-sky-500/10'
                        : 'border-gray-700 text-gray-400 hover:border-sky-500 hover:text-sky-400'
                    }`}
                  >
                    {emoji} {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Audience */}
            <div>
              <label className="text-sm font-medium text-gray-400 mb-1.5 block">Target Audience</label>
              <input
                type="text"
                value={audience}
                onChange={e => setAudience(e.target.value)}
                placeholder="e.g. software engineers, startup founders"
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 outline-none focus:border-sky-500 transition-colors text-sm"
              />
            </div>

            {/* Keywords */}
            <div>
              <label className="text-sm font-medium text-gray-400 mb-1.5 block">
                Keywords <span className="text-gray-600 text-xs">(optional)</span>
              </label>
              <input
                type="text"
                value={keywords}
                onChange={e => setKeywords(e.target.value)}
                placeholder="e.g. innovation, disruption, 2026"
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 outline-none focus:border-sky-500 transition-colors text-sm"
              />
            </div>

            {/* Generate Button */}
            <button
              onClick={generate}
              className="w-full py-3 bg-gradient-to-r from-sky-500 to-purple-600 hover:from-sky-400 hover:to-purple-500 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4" />
              Generate Chirp
            </button>
          </div>
        )}

        {/* Step: Loading */}
        {step === 'loading' && (
          <div className="p-5">
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-gray-800" />
                <div className="absolute inset-0 rounded-full border-4 border-t-sky-400 border-r-purple-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-sky-400" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-white font-medium">{loadingMsg}</p>
                <p className="text-gray-500 text-sm mt-1">Claude is thinking</p>
              </div>
              <div className="flex gap-1">
                {[0, 150, 300].map(delay => (
                  <div
                    key={delay}
                    className="w-2 h-2 rounded-full bg-sky-400 animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step: Result */}
        {step === 'result' && (
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-400">Generated Chirp</label>
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <Check className="w-3 h-3" /> Generated
              </span>
            </div>

            {/* Editable result */}
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mb-4">
              <textarea
                value={generatedText}
                onChange={e => setGeneratedText(e.target.value)}
                className="w-full bg-transparent text-white resize-none outline-none text-sm leading-relaxed min-h-[100px]"
              />
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-800">
                <span className="text-xs text-gray-600">Click to edit</span>
                <span className={`text-xs ${remaining < 0 ? 'text-red-400' : remaining < 20 ? 'text-amber-400' : 'text-gray-500'}`}>
                  {remaining} characters remaining
                </span>
              </div>
            </div>

            {/* Tags */}
            <div className="flex gap-2 mb-4">
              <span className="px-3 py-1 rounded-full bg-sky-500/20 text-sky-400 text-xs font-medium">
                {TONES.find(t => t.id === selectedTone)?.emoji} {TONES.find(t => t.id === selectedTone)?.label}
              </span>
              <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-400 text-xs font-medium">
                ✨ AI Generated
              </span>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => { setStep('form') }}
                className="flex-1 py-2.5 border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-white rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Regenerate
              </button>
              <button
                onClick={handleUse}
                className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" /> Use this Chirp
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
