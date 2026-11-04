// Imported from OpenSynth1 (MIT) Source/PluginProcessor.h: class Synth1ExponentialADSR. See NOTICE-OpenSynth1.md. Do not edit: run import_os1.py.
class Synth1ExponentialADSR {
public:
  Synth1ExponentialADSR() = default;

  void setSampleRate(double sr) { sampleRate = sr; }

  void setParameters(float attackSec, float decaySec, float sustainLevel,
                     float releaseSec) {
    // Attacco lineare: passo per campione
    attackRate =
        (attackSec > 0.001f) ? (1.0f / (attackSec * sampleRate)) : 1.0f;

    // Decadimenti esponenziali
    decayCoeff = calculateCoef(decaySec);
    releaseCoeff = calculateCoef(releaseSec);

    targetSustain = os1m::jlimit(0.0f, 1.0f, sustainLevel);
  }

  void noteOn() {
    state = Attack;
    attackStartLevel = currentOutput;
    attackPhase = 0.0f;
  }

  void noteOff() {
    if (state != Idle)
      state = Release;
  }

  void reset() {
    state = Idle;
    currentOutput = 0.0f;
    attackStartLevel = 0.0f;
    attackPhase = 0.0f;
  }

  bool isActive() const { return state != Idle; }

  float getNextSample() {
    switch (state) {
    case Idle:
      currentOutput = 0.0f;
      break;

    case Attack:
      attackPhase += attackRate;
      if (attackPhase >= 1.0f) {
        attackPhase = 1.0f;
        currentOutput = 1.0f;
        state = Decay;
      } else {
        currentOutput = attackStartLevel + (1.0f - attackStartLevel) * (attackPhase * attackPhase);
      }
      break;

    case Decay:
      currentOutput += (targetSustain - currentOutput) * decayCoeff;
      if (os1m::abs(currentOutput - targetSustain) < 0.0001f) {
        currentOutput = targetSustain;
        state = Sustain;
      }
      break;

    case Sustain:
      currentOutput = targetSustain;
      break;

    case Release:
      currentOutput += (0.0f - currentOutput) * releaseCoeff;
      if (currentOutput < 0.0001f) {
        currentOutput = 0.0f;
        state = Idle;
      }
      break;
    }
    return os1m::jlimit(0.0f, 1.0f, currentOutput);
  }

private:
  enum State { Idle, Attack, Decay, Sustain, Release };
  State state = Idle;

  double sampleRate = 44100.0;
  float currentOutput = 0.0f;
  float attackStartLevel = 0.0f;
  float attackPhase = 0.0f;
  float targetSustain = 0.0f;

  float attackRate = 1.0f;
  float decayCoeff = 0.1f;
  float releaseCoeff = 0.1f;

  float calculateCoef(float timeSec) const {
    if (timeSec < 0.001f)
      return 0.99f;
    // Costante di tempo per curva RC: 4.605 garantisce il raggiungimento del
    // 99% nel tempo target. Rimaniamo lontani da 1.0f per evitare un reset
    // istantaneo dell'envelope quando attack/release diventano estremi.
    return 1.0f - os1m::exp(-4.605 / (timeSec * sampleRate));
  }
};
