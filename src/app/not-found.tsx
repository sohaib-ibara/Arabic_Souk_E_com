import Link from "next/link";
import { Container } from "@/components/ui/container";

export default function NotFound() {
  return (
    <Container className="flex flex-col items-center py-28 text-center">
      <p className="font-serif text-6xl text-brand">404</p>
      <h1 className="mt-4 font-serif text-3xl">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        The page you&rsquo;re looking for doesn&rsquo;t exist or may have moved.
      </p>
      <Link
        href="/"
        className="mt-7 rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand"
      >
        Back to home
      </Link>
    </Container>
  );
}
