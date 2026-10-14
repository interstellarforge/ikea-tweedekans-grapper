import Link from "next/link";

export default function NotFound() {
  return (
    <main>
      <h1>Pagina niet gevonden</h1>
      <p className="lead">
        Deze pagina bestaat niet. <Link href="/">Naar de startpagina</Link>
      </p>
    </main>
  );
}
