import { useState, useEffect, useRef } from 'react'
import './Metronome.css'

const Metronome = () => {
  const [bpm, setBpm] = useState(120)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentBeat, setCurrentBeat] = useState(0)
  const [timeSignatureTop, setTimeSignatureTop] = useState(4)
  const [timeSignatureBottom, setTimeSignatureBottom] = useState(4)
  
  const audioContextRef = useRef<AudioContext | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const useWorklet = useRef(false)

  useEffect(() => {
    const initAudio = async () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext()
        
        try {
          await audioContextRef.current.audioWorklet.addModule('/metronome-processor.js')
          useWorklet.current = true
          console.log('AudioWorklet initialized successfully')
        } catch (error) {
          console.warn('AudioWorklet not supported, falling back to traditional scheduling', error)
          useWorklet.current = false
        }
      }
    }
    
    initAudio()
    
    return () => {
      if (workletNodeRef.current) {
        workletNodeRef.current.disconnect()
      }
    }
  }, [])

  useEffect(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ command: 'setBpm', bpm })
    }
  }, [bpm])

  useEffect(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ 
        command: 'setTimeSignature', 
        beatsPerMeasure: timeSignatureTop 
      })
    }
  }, [timeSignatureTop])

  const startWithWorklet = async () => {
    if (!workletNodeRef.current) {
      workletNodeRef.current = new AudioWorkletNode(
        audioContextRef.current!,
        'metronome-processor'
      )
      
      workletNodeRef.current.connect(audioContextRef.current!.destination)
      
      workletNodeRef.current.port.onmessage = (e) => {
        setCurrentBeat(e.data.beatNumber)
      }
      
      workletNodeRef.current.port.postMessage({ command: 'setBpm', bpm })
      workletNodeRef.current.port.postMessage({ 
        command: 'setTimeSignature', 
        beatsPerMeasure: timeSignatureTop 
      })
    }
    
    workletNodeRef.current.port.postMessage({ command: 'start' })
  }

  const stopWithWorklet = () => {
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ command: 'stop' })
      setCurrentBeat(0)
    }
  }

  const nextNoteTimeRef = useRef(0)
  const currentNoteRef = useRef(0)
  const timerIdRef = useRef<number | null>(null)

  const scheduleNote = (beatNumber: number, time: number) => {
    const osc = audioContextRef.current!.createOscillator()
    const envelope = audioContextRef.current!.createGain()
    
    // Higher frequency for first beat (3000Hz), lower for others (2000Hz)
    osc.frequency.value = beatNumber === 0 ? 3000 : 2000
    
    // Fast attack with sharp exponential decay
    envelope.gain.setValueAtTime(0, time)
    envelope.gain.linearRampToValueAtTime(0.5, time + 0.002) // 2ms attack
    envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.05) // 50ms total duration
    
    osc.connect(envelope)
    envelope.connect(audioContextRef.current!.destination)
    
    osc.start(time)
    osc.stop(time + 0.06)
  }

  const scheduler = () => {
    const secondsPerBeat = 60.0 / bpm
    
    while (nextNoteTimeRef.current < audioContextRef.current!.currentTime + 0.1) {
      scheduleNote(currentNoteRef.current, nextNoteTimeRef.current)
      
      const beatNumber = currentNoteRef.current
      window.setTimeout(() => {
        setCurrentBeat(beatNumber)
      }, (nextNoteTimeRef.current - audioContextRef.current!.currentTime) * 1000)
      
      nextNoteTimeRef.current += secondsPerBeat
      currentNoteRef.current = (currentNoteRef.current + 1) % timeSignatureTop
    }
    
    timerIdRef.current = window.setTimeout(scheduler, 25)
  }

  const startWithoutWorklet = () => {
    currentNoteRef.current = 0
    nextNoteTimeRef.current = audioContextRef.current!.currentTime + 0.1
    scheduler()
  }

  const stopWithoutWorklet = () => {
    if (timerIdRef.current) {
      clearTimeout(timerIdRef.current)
      timerIdRef.current = null
    }
    setCurrentBeat(0)
  }

  const start = async () => {
    if (!isPlaying && audioContextRef.current) {
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }
      
      setIsPlaying(true)
      
      if (useWorklet.current) {
        await startWithWorklet()
      } else {
        startWithoutWorklet()
      }
    }
  }

  const stop = () => {
    if (isPlaying) {
      setIsPlaying(false)
      
      if (useWorklet.current) {
        stopWithWorklet()
      } else {
        stopWithoutWorklet()
      }
    }
  }

  const handleBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value)
    if (!isNaN(value) && value >= 1 && value <= 999) {
      setBpm(value)
    }
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBpm(parseInt(e.target.value))
  }

  const handleTimeSignatureTopChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value)
    if (!isNaN(value) && value >= 1 && value <= 32) {
      setTimeSignatureTop(value)
    }
  }

  const handleTimeSignatureBottomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value)
    if (!isNaN(value) && [1, 2, 4, 8, 16, 32].includes(value)) {
      setTimeSignatureBottom(value)
    }
  }

  return (
    <div className="metronome">
      <div className="beat-indicator">
        {Array.from({ length: timeSignatureTop }, (_, i) => (
          <div
            key={i}
            className={`beat-circle ${
              isPlaying && currentBeat === i ? 'active' : ''
            } ${i === 0 ? 'first-beat' : ''}`}
          />
        ))}
      </div>

      <div className="controls">
        <div className="bpm-section">
          <label>BPM</label>
          <input
            type="number"
            className="bpm-input"
            value={bpm}
            onChange={handleBpmChange}
            min="1"
            max="999"
            step="0.1"
          />
          <input
            type="range"
            className="bpm-slider"
            value={bpm}
            onChange={handleSliderChange}
            min="60"
            max="240"
            step="1"
          />
          <div className="preset-buttons">
            <button onClick={() => setBpm(80)}>80</button>
            <button onClick={() => setBpm(120)}>120</button>
            <button onClick={() => setBpm(180)}>180</button>
          </div>
        </div>

        <div className="time-signature-section">
          <label>Time Signature</label>
          <div className="time-signature">
            <input
              type="number"
              value={timeSignatureTop}
              onChange={handleTimeSignatureTopChange}
              min="1"
              max="32"
            />
            <span>/</span>
            <input
              type="number"
              value={timeSignatureBottom}
              onChange={handleTimeSignatureBottomChange}
              min="1"
              max="32"
            />
          </div>
        </div>

        <button
          className={`play-button ${isPlaying ? 'stop' : 'start'}`}
          onClick={isPlaying ? stop : start}
        >
          {isPlaying ? 'Stop' : 'Start'}
        </button>
      </div>
    </div>
  )
}

export default Metronome