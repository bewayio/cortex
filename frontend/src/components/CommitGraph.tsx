import React from 'react'
import { LaneRow } from '../utils/graphLayout'

const LANE_W = 14   // px por lane
const ROW_H  = 28   // px por linha
const CR     = 4    // raio do círculo
const SW     = 1.5  // stroke width

interface Props {
  row: LaneRow
  onClick: () => void
}

function GraphSvg({ row }: { row: LaneRow }) {
  const width = Math.max((row.laneCount + 0.5) * LANE_W, LANE_W * 2)
  const cx = (row.lane + 0.5) * LANE_W
  const cy = ROW_H / 2

  return (
    <svg width={width} height={ROW_H} style={{ flexShrink: 0, display: 'block' }}>
      {/* Linhas verticais das lanes que passam */}
      {row.passingLanes.map(({ lane, color }) => (
        <line key={`p${lane}`}
          x1={(lane + 0.5) * LANE_W} y1={0}
          x2={(lane + 0.5) * LANE_W} y2={ROW_H}
          stroke={color} strokeWidth={SW}
        />
      ))}

      {/* Linha topo → círculo */}
      {row.hasTop && (
        <line
          x1={cx} y1={0} x2={cx} y2={cy - CR - 1}
          stroke={row.color} strokeWidth={SW}
        />
      )}

      {/* Linha círculo → fundo */}
      {row.hasBottom && (
        <line
          x1={cx} y1={cy + CR + 1} x2={cx} y2={ROW_H}
          stroke={row.color} strokeWidth={SW}
        />
      )}

      {/* Linhas de merge (diagonal para pais adicionais) */}
      {row.mergeLines.map(({ targetLane, color }, i) => (
        <line key={`m${i}`}
          x1={cx} y1={cy + CR + 1}
          x2={(targetLane + 0.5) * LANE_W} y2={ROW_H}
          stroke={color} strokeWidth={SW}
        />
      ))}

      {/* Círculo do commit */}
      <circle cx={cx} cy={cy} r={CR} fill={row.color} />
    </svg>
  )
}

export default function CommitGraphRow({ row, onClick }: Props) {
  const refs = row.commit.refs ?? []
  const msg = row.commit.message

  return (
    <div className="cg-row" onClick={onClick} title={`${row.commit.hash}\n${msg}\n${row.commit.author} · ${row.commit.relativeDate}`}>
      <GraphSvg row={row} />
      <div className="cg-info">
        <div className="cg-top">
          {refs.map(ref => (
            <span key={ref} className={`cg-ref ${ref.startsWith('origin/') ? 'remote' : ref.startsWith('tag:') ? 'tag' : 'local'}`}>
              {ref.replace('tag: ', '')}
            </span>
          ))}
          <span className="cg-msg">{msg}</span>
        </div>
        <div className="cg-bottom">
          <span className="cg-hash">{row.commit.hash.slice(0, 7)}</span>
          <span className="cg-date">{row.commit.relativeDate}</span>
        </div>
      </div>
    </div>
  )
}
