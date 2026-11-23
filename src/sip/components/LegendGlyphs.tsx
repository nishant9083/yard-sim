import type { ReactNode } from 'react'

/** Small SVG pictures of the symbols the canvas draws, for the legend. */
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 72 28" className="h-7 w-18 shrink-0 text-on-surface" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden>
      {children}
    </svg>
  )
}

const Lamp = ({ x, style }: { x: number; style: 'slash' | 'vbar' | 'hbar' | 'solid' }) => (
  <g>
    <circle cx={x} cy={14} r={7} fill={style === 'solid' ? 'currentColor' : 'none'} />
    {style === 'slash' && <path d={`M${x - 5} ${19} L${x + 5} ${9}`} />}
    {style === 'vbar' && <path d={`M${x} 7 V21`} />}
    {style === 'hbar' && <path d={`M${x - 7} 14 H${x + 7}`} />}
  </g>
)

export const GLYPHS: Record<string, ReactNode> = {
  lamps: (
    <Svg>
      <Lamp x={9} style="slash" />
      <Lamp x={27} style="vbar" />
      <Lamp x={45} style="hbar" />
      <Lamp x={63} style="solid" />
    </Svg>
  ),
  markers: (
    <Svg>
      {['P', 'C', 'B'].map((t, i) => (
        <g key={t}>
          <circle cx={14 + i * 22} cy={14} r={7} />
          <text x={14 + i * 22} y={17.5} fontSize="9" textAnchor="middle" fill="currentColor" stroke="none">
            {t}
          </text>
        </g>
      ))}
    </Svg>
  ),
  callingOn: (
    <Svg>
      <rect x={18} y={7} width={36} height={14} rx={7} />
      <path d="M31 19 L41 9" />
    </Svg>
  ),
  routeIndicator: (
    <Svg>
      {/* Head facing east with all four arms: | left, < upper left / upper right, | right. */}
      <Lamp x={22} style="vbar" />
      <path d="M33 14 L48 6 M33 14 L48 22 M33 14 V2 M33 14 V26" />
    </Svg>
  ),
  shunt: (
    <Svg>
      <path d="M24 21 V3 A18 18 0 0 1 42 21 Z" />
      <circle cx={30} cy={13} r={1.4} fill="currentColor" />
      <circle cx={36} cy={16} r={1.4} fill="currentColor" />
      <circle cx={29} cy={18} r={1.4} fill="currentColor" />
    </Svg>
  ),
  post: (
    <Svg>
      <path d="M12 26 V10 H24" />
      <path d="M8 22 L12 27 L16 22 Z" fill="currentColor" />
      <Lamp x={34} style="vbar" />
      <Lamp x={52} style="slash" />
    </Svg>
  ),
  slBoard: (
    <Svg>
      <rect x={22} y={5} width={28} height={18} />
      <text x={36} y={18} fontSize="10" textAnchor="middle" fill="currentColor" stroke="none">
        SL
      </text>
    </Svg>
  ),
  dlBoard: (
    <Svg>
      <rect x={22} y={5} width={28} height={18} />
      <text x={36} y={18} fontSize="10" textAnchor="middle" fill="currentColor" stroke="none">
        DL
      </text>
    </Svg>
  ),
  locoPilot: (
    <Svg>
      <rect x={20} y={5} width={32} height={18} />
      <text x={36} y={19} fontSize="12" textAnchor="middle" fill="currentColor" stroke="none">
        {'※'}
      </text>
    </Svg>
  ),
  detector: (
    <Svg>
      <rect x={20} y={5} width={32} height={18} />
      <circle cx={36} cy={14} r={5.5} />
    </Svg>
  ),
  goomty: (
    <Svg>
      <rect x={20} y={5} width={32} height={18} />
      <text x={36} y={18} fontSize="9" textAnchor="middle" fill="currentColor" stroke="none">
        G
      </text>
    </Svg>
  ),
  lvv: (
    <Svg>
      {[8, 20].map((y) => (
        <g key={y}>
          <path d={`M22 ${y} H50`} />
          <circle cx={26} cy={y} r={2.3} fill="currentColor" />
          <circle cx={46} cy={y} r={2.3} fill="currentColor" />
        </g>
      ))}
      <path d="M4 14 H68" strokeWidth="2.4" />
    </Svg>
  ),
  joint: (
    <Svg>
      <path d="M4 14 H68" strokeWidth="2.4" />
      <path d="M36 6 V22" stroke="#ffb454" strokeWidth="2.6" />
    </Svg>
  ),
  circuit: (
    <Svg>
      <path d="M4 14 H68" strokeWidth="2.4" />
      <path d="M6 14 H34" stroke="#4cc9f0" strokeOpacity=".5" strokeWidth="10" strokeLinecap="butt" />
      <path d="M36 14 H66" stroke="#7bd88f" strokeOpacity=".5" strokeWidth="10" strokeLinecap="butt" />
    </Svg>
  ),
  axle: (
    <Svg>
      <path d="M4 14 H68" strokeWidth="2.4" />
      <path d="M6 14 H66" stroke="#8f99a8" strokeOpacity=".5" strokeWidth="7" strokeDasharray="8 5" strokeLinecap="butt" />
    </Svg>
  ),
  point: (
    <Svg>
      <path d="M4 20 H68" strokeWidth="2.4" />
      <path d="M22 20 L48 8" />
      <circle cx={22} cy={20} r={4} fill="#0a0c10" stroke="#5aa9ff" />
    </Svg>
  ),
  platform: (
    <Svg>
      <path d="M6 6 H66 V14 H6 Z" fill="#7f8aa0" fillOpacity=".2" stroke="#7f8aa0" />
      <path d="M4 22 H68" strokeWidth="2.4" />
    </Svg>
  ),
  fob: (
    <Svg>
      <path d="M26 3 V25 H58 V18 H34 V3 Z" fill="#9aa7bd" fillOpacity=".15" stroke="#9aa7bd" />
    </Svg>
  ),
  building: (
    <Svg>
      <rect x={14} y={6} width={44} height={16} stroke="#9aa7bd" />
    </Svg>
  ),
  bridge: (
    <Svg>
      <path d="M4 14 H68" strokeWidth="2.4" />
      <path d="M30 3 V25 M42 3 V25" stroke="#c9a46b" strokeDasharray="4 3" />
    </Svg>
  ),
  levelCrossing: (
    <Svg>
      <path d="M4 14 H68" strokeWidth="2.4" />
      <path d="M33 1 V27 M39 1 V27" stroke="#c9a46b" strokeDasharray="3 2" />
      {[4, 24].map((y) => (
        <g key={y} stroke="#c9a46b">
          <path d={`M18 ${y} L25 ${y - 2.5} L52 ${y} L25 ${y + 2.5} Z`} fill="#c9a46b" />
          <rect x={22.5} y={y - 2.5} width={5} height={5} fill="var(--color-surface, #0a0c10)" strokeWidth="0.8" />
          <path d={`M22.5 ${y - 2.5} l5 5 M27.5 ${y - 2.5} l-5 5`} strokeWidth="0.8" />
        </g>
      ))}
    </Svg>
  ),
  speedBoard: (
    <Svg>
      <path d="M4 26 H68" strokeWidth="2.4" />
      <path d="M22 24 V12 H30" />
      <path d="M30 4 V20 L54 12 Z" />
      <text x={37.5} y={15} fontSize="7.5" fontWeight="600" textAnchor="middle" fill="currentColor" stroke="none">
        30
      </text>
    </Svg>
  ),
  dimension: (
    <Svg>
      <path d="M8 14 H64 M8 8 V20 M64 8 V20" stroke="#6f8aa8" />
      <path d="M8 14 L14 11 V17 Z M64 14 L58 11 V17 Z" fill="#6f8aa8" stroke="none" />
    </Svg>
  ),
  chainage: (
    <Svg>
      <path d="M36 4 V24" stroke="#8f99a8" strokeDasharray="2 3" />
      <text x={36} y={26} fontSize="8" textAnchor="middle" fill="#8f99a8" stroke="none">
        FM 404.64
      </text>
    </Svg>
  ),
  csb: (
    <Svg>
      <path d="M36 2 V26" stroke="#f2c94c" strokeDasharray="6 4" />
    </Svg>
  ),
  gradient: (
    <Svg>
      <path d="M6 20 L36 8 L66 20" stroke="#d68cff" />
      <text x={36} y={26} fontSize="8" textAnchor="middle" fill="#d68cff" stroke="none">
        1:135 ▸ 1:243
      </text>
    </Svg>
  ),
}
