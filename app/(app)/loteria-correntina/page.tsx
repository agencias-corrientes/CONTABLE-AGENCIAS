import { getOfficialLotteryFeed } from "@/lib/loteria-correntina";
import { formatAgencyDateTime } from "@/lib/agency-datetime";

function dateKey(date: string) {
  const parts = date.split("/");
  if (parts.length !== 3) return 0;
  return Number(parts[2]) * 10000 + Number(parts[1]) * 100 + Number(parts[0]);
}

export default async function LoteriaCorrentinaPage() {
  const feed = await getOfficialLotteryFeed();
  const archivesByGame = feed.games.map((game) => ({
    ...game,
    archives: feed.archives.filter((archive) => archive.game === game.name).sort((a, b) => dateKey(b.date) - dateKey(a.date)).slice(0, 6),
  }));

  return (
    <div className="page lottery-page">
      <div className="topbar">
        <div><p className="eyebrow">FUENTE OFICIAL</p><h1>Lotería Correntina</h1><p className="muted">Extractos recientes ordenados por juego. Los resultados destacados y horarios ya no aparecen mezclados con Rendiciones.</p></div>
        <a className="button ghost" href={feed.sourceUrl} target="_blank" rel="noreferrer">Abrir fuente oficial ↗</a>
      </div>
      <div className="lottery-feed-meta">
        {feed.ok ? <span className="badge success">Conectado</span> : <span className="badge warning">Fuente temporalmente no disponible</span>}
        <span>Última consulta: {formatAgencyDateTime(feed.updatedAt)}</span>
      </div>
      {feed.error && <p className="message error-message">No se pudo actualizar el listado desde Lotería Correntina. Podés abrir la fuente oficial para ver los extractos disponibles.</p>}
      <section className="lottery-recent-grid">
        {archivesByGame.map((game) => (
          <article className="lottery-recent-card" key={game.name}>
            <div className="lottery-recent-head"><h2>{game.name}</h2><a href={game.url} target="_blank" rel="noreferrer">Fuente ↗</a></div>
            {game.archives.length ? (
              <ul>{game.archives.map((archive) => <li key={archive.url}><a href={archive.url} target="_blank" rel="noreferrer"><span>Extracto reciente</span><strong>{archive.date}</strong><b>↗</b></a></li>)}</ul>
            ) : <p className="muted">No hay enlaces recientes en el listado automático. Consultá la sección oficial de este juego.</p>}
          </article>
        ))}
      </section>
      <details className="lottery-hours-compact">
        <summary>Horarios de sorteos (consulta secundaria)</summary>
        <div className="lottery-hours-list">
          {feed.schedules.map((item, index) => <div className="lottery-hours-row" key={item.game + "-" + item.drawName + "-" + index}>
            <strong>{item.game}</strong><span>{item.drawName}</span><span>{item.drawAt || "Horario no publicado"}</span>
          </div>)}
          {!feed.schedules.length && <p className="muted">No se publicaron horarios en este momento.</p>}
        </div>
      </details>
    </div>
  );
}
