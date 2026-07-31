import {
  Stethoscope,
  Pill,
  Syringe,
  HeartPulse,
  Bandage,
  Thermometer,
  Cross,
  Microscope,
  FlaskConical,
  TestTube,
  ClipboardPlus,
  Tablets,
} from "lucide-react"

const ICONS = [
  Stethoscope,
  Pill,
  Syringe,
  HeartPulse,
  Bandage,
  Thermometer,
  Cross,
  Microscope,
  FlaskConical,
  TestTube,
  ClipboardPlus,
  Tablets,
]

// ponytail: fixed cell count, generous for viewports up to ~1440p (covers
// roughly a 2560x1440 screen with margin). A much larger display (4K+) will
// show blank space at the bottom of the page instead of icons. Upgrade path
// if that's ever visible in practice: compute the count from
// window.innerWidth/innerHeight in a resize-aware effect, or switch to a
// native CSS `<pattern>`-tiled SVG background, which repeats infinitely
// regardless of viewport size.
const CELL_COUNT = 480
// Rotation must be a pure function of index, not Math.random() -- this renders
// on the server first, and a client-only random value would mismatch the
// server-rendered markup and throw a React hydration error.
const ROTATIONS = [0, 7, -7, 14, -14]

export function MedicalIconField() {
  return (
    <div
      className="fixed inset-0 -z-10 flex flex-wrap content-start overflow-hidden"
      aria-hidden="true"
    >
      {Array.from({ length: CELL_COUNT }).map((_, i) => {
        const Icon = ICONS[i % ICONS.length]
        const rotation = ROTATIONS[i % ROTATIONS.length]
        return (
          <div key={i} className="flex size-24 shrink-0 items-center justify-center">
            <Icon
              size={40}
              color="var(--primary)"
              style={{ opacity: 0.05, transform: `rotate(${rotation}deg)` }}
            />
          </div>
        )
      })}
    </div>
  )
}
