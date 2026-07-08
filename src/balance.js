// Balanceo de equipos:
// - Rating = base 5 + puntos ganados en partidos anteriores.
// - Reparto tipo "snake draft" por posición, con aleatoriedad controlada.
// - Optimización por intercambios para minimizar la diferencia total.
// - Penaliza formaciones muy parecidas a las de partidos anteriores (evita repetir equipos).

// Puntos: cada 10 puntos ganados suman ~1 al rating (tope +5 de bonus)
const POINTS_FACTOR = 1 / 10;
const POINTS_CAP = 5;

export function playerRating(player) {
  const base = 5;
  const bonus = Math.min((player.points || 0) * POINTS_FACTOR, POINTS_CAP);
  return +(base + bonus).toFixed(2);
}

function teamScore(team) {
  return team.reduce((s, p) => s + p.rating, 0);
}

// Similitud con equipos históricos: fracción de parejas de compañeros repetidas
function historyPenalty(teamA, teamB, history) {
  if (!history || history.length === 0) return 0;
  const pairs = team => {
    const ids = team.map(p => p.id).sort();
    const set = new Set();
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) set.add(ids[i] + '|' + ids[j]);
    return set;
  };
  const current = new Set([...pairs(teamA), ...pairs(teamB)]);
  let repeated = 0, total = current.size || 1;
  // Los partidos más recientes pesan más
  history.slice(-5).forEach((past, idx) => {
    const weight = (idx + 1) / 5;
    const pastPairs = new Set([
      ...pairs(past.A.map(id => ({ id }))),
      ...pairs(past.B.map(id => ({ id })))
    ]);
    let hits = 0;
    current.forEach(p => { if (pastPairs.has(p)) hits++; });
    repeated += weight * (hits / total);
  });
  return repeated;
}

function shuffle(arr, rnd = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Genera UNA división candidata
function generateCandidate(players) {
  const A = [], B = [];
  const byPos = {};
  players.forEach(p => {
    (byPos[p.position || 'medio'] ||= []).push(p);
  });
  // Orden: arqueros primero, luego el resto por rating desc con ruido aleatorio
  const posOrder = ['arquero', 'defensa', 'medio', 'delantero'];
  posOrder.forEach(pos => {
    const group = shuffle(byPos[pos] || [])
      .sort((a, b) => (b.rating + Math.random() * 1.2) - (a.rating + Math.random() * 1.2));
    group.forEach(p => {
      // Snake: el equipo con menor puntaje (y luego menor tamaño) elige
      const target =
        A.length !== B.length ? (A.length < B.length ? A : B)
        : teamScore(A) <= teamScore(B) ? A : B;
      target.push(p);
    });
  });
  // Corrige tamaños si quedaron desparejos en más de 1
  while (A.length - B.length > 1) B.push(A.pop());
  while (B.length - A.length > 1) A.push(B.pop());

  // Mejora local: intercambios de misma posición que reduzcan la diferencia
  const diff = () => Math.abs(teamScore(A) - teamScore(B));
  let improved = true, guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    outer:
    for (let i = 0; i < A.length; i++) {
      for (let j = 0; j < B.length; j++) {
        if (A[i].position !== B[j].position) continue;
        const before = diff();
        [A[i], B[j]] = [B[j], A[i]];
        if (diff() < before - 0.01) { improved = true; break outer; }
        [A[i], B[j]] = [B[j], A[i]]; // revertir
      }
    }
  }
  return { A, B };
}

/**
 * players: [{id, username, displayName, position, attrs, points}]
 * history: [{A:[ids], B:[ids]}] de partidos anteriores entre (algunos de) estos jugadores
 */
export function balanceTeams(players, history = []) {
  const rated = players.map(p => ({ ...p, rating: playerRating(p) }));
  let best = null, bestCost = Infinity;
  const CANDIDATES = 40;
  for (let i = 0; i < CANDIDATES; i++) {
    const { A, B } = generateCandidate(rated);
    const diff = Math.abs(teamScore(A) - teamScore(B));
    const penalty = historyPenalty(A, B, history);
    const cost = diff + penalty * 3; // 3 pts de rating equivalen a repetir toda la formación
    if (cost < bestCost) { bestCost = cost; best = { A, B, diff, penalty }; }
  }
  return {
    teamA: best.A.map(p => ({ id: p.id, name: p.displayName || p.username, position: p.position, rating: p.rating })),
    teamB: best.B.map(p => ({ id: p.id, name: p.displayName || p.username, position: p.position, rating: p.rating })),
    scoreA: +teamScore(best.A).toFixed(2),
    scoreB: +teamScore(best.B).toFixed(2),
    difference: +best.diff.toFixed(2)
  };
}
// fin

