export interface GraphCommit {
  hash: string
  parents: string[]
  message: string
  author: string
  relativeDate: string
  refs: string[]
}

export interface LaneRow {
  commit: GraphCommit
  lane: number
  color: string
  laneCount: number
  // Lanes que passam verticalmente por esta linha (exceto a do commit)
  passingLanes: Array<{ lane: number; color: string }>
  hasTop: boolean      // linha do topo até o círculo
  hasBottom: boolean   // linha do círculo até o fundo
  // Linhas diagonais para pais adicionais (merges)
  mergeLines: Array<{ targetLane: number; color: string }>
}

export const LANE_COLORS = [
  '#61afef', // azul
  '#98c379', // verde
  '#e5c07b', // amarelo
  '#c678dd', // roxo
  '#e06c75', // vermelho
  '#4ec9b0', // teal
  '#d19a66', // laranja
  '#56b6c2', // ciano
  '#ff9f43', // laranja claro
  '#a29bfe', // lilás
]

export function computeGraph(commits: GraphCommit[]): LaneRow[] {
  if (!commits.length) return []

  let lanes: (string | null)[] = []  // lane[i] = hash esperado ali, null = vazio
  const laneColors: string[] = []
  let colorIdx = 0

  return commits.map(commit => {
    // ── Encontra ou aloca lane para este commit ──────────────────────────
    let lane = lanes.indexOf(commit.hash)
    let color: string

    if (lane === -1) {
      const free = lanes.indexOf(null)
      lane = free !== -1 ? free : lanes.length
      color = LANE_COLORS[colorIdx++ % LANE_COLORS.length]
      if (lane >= lanes.length) lanes.push(commit.hash)
      else lanes[lane] = commit.hash
      laneColors[lane] = color
    } else {
      color = laneColors[lane] || LANE_COLORS[0]
    }

    // Snapshot das lanes ANTES de atualizar (para saber quais passam pelo topo)
    const incomingActive = new Set(
      lanes.map((h, i) => (h !== null ? i : -1)).filter(i => i >= 0)
    )

    const hasTop = incomingActive.has(lane)

    // ── Atualiza lanes para a próxima linha ──────────────────────────────
    lanes[lane] = commit.parents[0] ?? null  // 1º pai continua na mesma lane

    // Pais adicionais (merge) ganham lanes
    const mergeLines: LaneRow['mergeLines'] = []
    for (let i = 1; i < commit.parents.length; i++) {
      const ph = commit.parents[i]
      const existing = lanes.indexOf(ph)
      if (existing !== -1) {
        mergeLines.push({ targetLane: existing, color: laneColors[existing] || color })
      } else {
        const free = lanes.indexOf(null)
        const newLane = free !== -1 ? free : lanes.length
        if (newLane >= lanes.length) lanes.push(ph)
        else lanes[newLane] = ph
        const nc = LANE_COLORS[colorIdx++ % LANE_COLORS.length]
        laneColors[newLane] = nc
        mergeLines.push({ targetLane: newLane, color: nc })
      }
    }

    const hasBottom = lanes[lane] !== null

    // Snapshot DEPOIS (lanes de saída)
    const outgoingActive = new Set(
      lanes.map((h, i) => (h !== null ? i : -1)).filter(i => i >= 0)
    )

    // Lanes que passam por aqui (exceto a do commit)
    const passingSet = new Set([...incomingActive, ...outgoingActive])
    passingSet.delete(lane)
    const passingLanes = [...passingSet].map(i => ({
      lane: i,
      color: laneColors[i] || '#858585',
    }))

    // Limpa nulls do fim
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop()
      laneColors.pop()
    }

    const laneCount = Math.max(lanes.length, lane + 1, ...[...incomingActive].map(i => i + 1))

    return {
      commit, lane, color, laneCount,
      passingLanes, hasTop, hasBottom, mergeLines,
    }
  })
}
