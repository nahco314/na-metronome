class MetronomeProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.phase = 0
    this.isPlaying = false
    this.bpm = 120
    this.nextBeatTime = 0
    this.beatNumber = 0
    this.beatsPerMeasure = 4
    this.currentBeatForSound = -1
    
    this.port.onmessage = (e) => {
      if (e.data.command === 'start') {
        this.isPlaying = true
        this.nextBeatTime = currentTime + 0.1
        this.beatNumber = 0
        this.currentBeatForSound = -1
        this.phase = 1000 // Start with a high phase to prevent immediate sound
      } else if (e.data.command === 'stop') {
        this.isPlaying = false
        this.beatNumber = 0
      } else if (e.data.command === 'setBpm') {
        this.bpm = e.data.bpm
      } else if (e.data.command === 'setTimeSignature') {
        this.beatsPerMeasure = e.data.beatsPerMeasure
      }
    }
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0]
    const sampleRate = 44100
    const secondsPerBeat = 60.0 / this.bpm
    
    if (!this.isPlaying) {
      return true
    }

    for (let channel = 0; channel < output.length; channel++) {
      const outputChannel = output[channel]
      
      for (let i = 0; i < outputChannel.length; i++) {
        const currentSampleTime = currentTime + i / sampleRate
        
        if (currentSampleTime >= this.nextBeatTime) {
          this.currentBeatForSound = this.beatNumber
          
          this.port.postMessage({
            beatNumber: this.beatNumber,
            time: this.nextBeatTime
          })
          
          this.phase = 0
          this.nextBeatTime += secondsPerBeat
          this.beatNumber = (this.beatNumber + 1) % this.beatsPerMeasure
        }
        
        // Based on cwilso's metronome: accent beat at 880Hz, regular at 440Hz
        const frequency = this.currentBeatForSound === 0 ? 880 : 440
        
        // Simple envelope with exponential decay
        let envelope = 0
        if (this.phase < 0.03) {
          // Exponential decay over 30ms
          envelope = 0.3 * Math.exp(-this.phase * 50)
        }
        
        outputChannel[i] = Math.sin(2 * Math.PI * frequency * this.phase) * envelope
        
        this.phase += 1 / sampleRate
      }
    }

    return true
  }
}

registerProcessor('metronome-processor', MetronomeProcessor)