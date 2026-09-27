// Divide um texto SQL em statements separados por ';' (top-level, sem parser
// de verdade — não entende ';' dentro de strings/comentários; limitação
// aceita, mesma linha do resto do v1 do cliente SQL). Guarda o offset de
// início/fim de cada trecho (sem trim) no texto original, para achar qual
// statement está "sob o cursor".
export interface SqlStatement {
  sql: string   // trimmed
  start: number // offset no texto original onde o trecho (não-trimado) começa
  end: number   // offset onde termina (exclusivo, sem contar o ';')
}

export function splitSqlStatements(text: string): SqlStatement[] {
  const out: SqlStatement[] = []
  let start = 0
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === ';') {
      const raw = text.slice(start, i)
      const sql = raw.trim()
      if (sql) out.push({ sql, start, end: i })
      start = i + 1
    }
  }
  return out
}

// Statement cujo range [start,end) contém o offset; se nenhum contém
// (cursor em espaço/quebra de linha entre dois statements), pega o mais
// próximo por distância até o início ou fim do trecho.
export function statementAtOffset(text: string, offset: number): SqlStatement | null {
  const statements = splitSqlStatements(text)
  if (statements.length === 0) return null

  for (const s of statements) {
    if (offset >= s.start && offset <= s.end) return s
  }

  let closest = statements[0]
  let closestDist = Infinity
  for (const s of statements) {
    const dist = offset < s.start ? s.start - offset : offset - s.end
    if (dist < closestDist) { closestDist = dist; closest = s }
  }
  return closest
}
