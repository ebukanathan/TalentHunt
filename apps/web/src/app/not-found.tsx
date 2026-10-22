import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <section className="container state-section">
      <p className="eyebrow">404 · OUT OF THE SPOTLIGHT</p>
      <h1>This page has left the stage.</h1>
      <p>Return to the homepage to find the competition and its contestants.</p>
      <ButtonLink href="/">Back to TalentHunt</ButtonLink>
    </section>
  );
}
