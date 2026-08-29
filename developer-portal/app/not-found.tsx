import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-fd-primary">404</p>
      <h1 className="mt-4 text-4xl font-bold">Documentation page not found</h1>
      <p className="mt-4 text-fd-muted-foreground">
        The page may have moved. Search the documentation or return to the developer overview.
      </p>
      <Link className="mt-8 rounded-lg bg-fd-primary px-5 py-3 font-semibold text-fd-primary-foreground" href="/">
        Return to documentation
      </Link>
    </div>
  );
}
