/**
 * SignalChainDiagram — SVG block flow diagram showing the signal chain.
 *
 * Horizontal flow: Radio -> Accessories -> Feedline -> Antenna
 * Responsive via viewBox, max height ~80px, full width.
 * Shows loss/gain annotations on connectors between boxes.
 */

interface SignalChainDiagramProps {
  radioName?: string;
  accessoryNames?: string[];
  feedlineName?: string;
  antennaName?: string;
  feedlineLossDb?: number;
  accessoryGainDb?: number;
}

// ─── Layout constants ────────────────────────────────────────────────────────

const VB_W = 800;
const VB_H = 80;
const BOX_H = 44;
const BOX_Y = (VB_H - BOX_H) / 2;
const BOX_RX = 8;
const ARROW_LEN = 60;

// Colors (Tailwind equivalents as raw hex)
const VOID_BLACK = "#0a0a14";
const BORDER_DEFAULT = "rgba(255,255,255,0.1)";
const BORDER_DASHED = "rgba(255,255,255,0.15)";
const TEXT_FILL = "#e5e7eb"; // gray-200
const TEXT_MUTED = "#9ca3af"; // gray-400
const ARROW_COLOR = "#6b7280"; // gray-500
const LOSS_COLOR = "#ff4455"; // alert-red
const GAIN_COLOR = "#00ff88"; // signal-green

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface StageBox {
  label: string;
  sublabel?: string;
  isEmpty: boolean;
}

function buildStages(props: SignalChainDiagramProps): StageBox[] {
  const stages: StageBox[] = [];

  // Radio
  stages.push({
    label: props.radioName || "Radio",
    isEmpty: !props.radioName,
  });

  // Accessories (collapsed to single box)
  if (props.accessoryNames && props.accessoryNames.length > 0) {
    const count = props.accessoryNames.length;
    stages.push({
      label: count === 1 ? props.accessoryNames[0] : `${count} Accessories`,
      sublabel:
        count > 1 ? props.accessoryNames.slice(0, 2).join(", ") : undefined,
      isEmpty: false,
    });
  } else {
    stages.push({
      label: "Accessories",
      sublabel: "None",
      isEmpty: true,
    });
  }

  // Feedline
  stages.push({
    label: props.feedlineName || "Feedline",
    sublabel: !props.feedlineName ? "None" : undefined,
    isEmpty: !props.feedlineName,
  });

  // Antenna
  stages.push({
    label: props.antennaName || "Antenna",
    sublabel: !props.antennaName ? "None" : undefined,
    isEmpty: !props.antennaName,
  });

  return stages;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SignalChainDiagram(props: SignalChainDiagramProps) {
  const stages = buildStages(props);
  const stageCount = stages.length;
  const totalArrows = stageCount - 1;
  const totalArrowSpace = totalArrows * ARROW_LEN;
  const boxWidth = (VB_W - totalArrowSpace - 20) / stageCount; // 20 = side padding

  // Compute x positions
  const positions: number[] = [];
  let x = 10;
  for (let i = 0; i < stageCount; i++) {
    positions.push(x);
    x += boxWidth + ARROW_LEN;
  }

  // Annotation data for connectors
  // Index 0 = connector between stage 0 and 1 (Radio->Accessories)
  // Index 1 = connector between stage 1 and 2 (Accessories->Feedline)
  // Index 2 = connector between stage 2 and 3 (Feedline->Antenna)
  const annotations: Array<{ text: string; color: string } | null> = [
    null,
    props.accessoryGainDb != null && props.accessoryGainDb !== 0
      ? {
          text:
            props.accessoryGainDb > 0
              ? `+${props.accessoryGainDb.toFixed(1)} dB`
              : `${props.accessoryGainDb.toFixed(1)} dB`,
          color: props.accessoryGainDb > 0 ? GAIN_COLOR : LOSS_COLOR,
        }
      : null,
    props.feedlineLossDb != null && props.feedlineLossDb !== 0
      ? {
          text: `-${Math.abs(props.feedlineLossDb).toFixed(1)} dB`,
          color: LOSS_COLOR,
        }
      : null,
  ];

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full"
      style={{ maxHeight: 80 }}
      role="img"
      aria-label="Signal chain diagram"
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill={ARROW_COLOR} />
        </marker>
      </defs>

      {stages.map((stage, i) => {
        const bx = positions[i];
        const centerX = bx + boxWidth / 2;
        const centerY = BOX_Y + BOX_H / 2;

        return (
          <g key={i}>
            {/* Box */}
            <rect
              x={bx}
              y={BOX_Y}
              width={boxWidth}
              height={BOX_H}
              rx={BOX_RX}
              ry={BOX_RX}
              fill={VOID_BLACK}
              stroke={stage.isEmpty ? BORDER_DASHED : BORDER_DEFAULT}
              strokeWidth={1.5}
              strokeDasharray={stage.isEmpty ? "4 3" : "none"}
            />

            {/* Label */}
            <text
              x={centerX}
              y={stage.sublabel ? centerY - 5 : centerY + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={stage.isEmpty ? TEXT_MUTED : TEXT_FILL}
              fontSize={11}
              fontFamily="system-ui, sans-serif"
              fontWeight={500}
            >
              {stage.label.length > 18
                ? stage.label.slice(0, 16) + "..."
                : stage.label}
            </text>

            {/* Sublabel */}
            {stage.sublabel && (
              <text
                x={centerX}
                y={centerY + 11}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={TEXT_MUTED}
                fontSize={9}
                fontFamily="system-ui, sans-serif"
              >
                {stage.sublabel.length > 22
                  ? stage.sublabel.slice(0, 20) + "..."
                  : stage.sublabel}
              </text>
            )}

            {/* Arrow to next stage */}
            {i < stageCount - 1 && (
              <>
                <line
                  x1={bx + boxWidth + 4}
                  y1={VB_H / 2}
                  x2={positions[i + 1] - 4}
                  y2={VB_H / 2}
                  stroke={ARROW_COLOR}
                  strokeWidth={1.5}
                  markerEnd="url(#arrowhead)"
                />

                {/* Annotation */}
                {annotations[i] && (
                  <text
                    x={(bx + boxWidth + 4 + positions[i + 1] - 4) / 2}
                    y={VB_H / 2 - 8}
                    textAnchor="middle"
                    dominantBaseline="auto"
                    fill={annotations[i]!.color}
                    fontSize={9}
                    fontFamily="system-ui, sans-serif"
                    fontWeight={600}
                  >
                    {annotations[i]!.text}
                  </text>
                )}
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
