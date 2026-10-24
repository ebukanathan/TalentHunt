import { Suspense } from "react";
import { getPublicShow } from "@/lib/api/public-data";
import { CompetitionStatus } from "@/components/competition-status";
import {
  ContestantCard,
  ContestantPortrait,
} from "@/components/contestant-card";
import {
  NoCompetition,
  PageSkeleton,
  UnavailableState,
} from "@/components/page-states";
import { Arrow, ButtonLink, EmptyState, SectionHeading } from "@/components/ui";

export default function HomePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}
async function HomeContent() {
  const show = await getPublicShow();
  if (show.kind === "empty") return <NoCompetition />;
  if (show.kind === "unavailable") return <UnavailableState />;
  const { competition, contestants } = show;
  const featured = contestants[0];
  return (
    <>
      <section className="hero container" aria-labelledby="hero-heading">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="small-star" aria-hidden="true">
              ✦
            </span>{" "}
            THIS IS THEIR MOMENT. BE PART OF IT.
          </p>
          <h1 id="hero-heading">
            A stage for the <em>remarkable.</em>
          </h1>
          <p className="hero-intro">
            Discover extraordinary talent. Find your favourites. Be part of the
            story from the very beginning.
          </p>
          <ButtonLink href="/contestants">
            Meet the contestants <Arrow />
          </ButtonLink>
          <div className="hero-competition">
            <span className="eyebrow">NOW IN THE SPOTLIGHT</span>
            <p>{competition.name}</p>
            <CompetitionStatus competition={competition} />
          </div>
        </div>
        <div className="hero-art">
          <div className="stage-ring" aria-hidden="true" />
          <div className="stage-star" aria-hidden="true">
            ✦
          </div>
          {featured ? (
            <div className="featured-talent">
              <ContestantPortrait contestant={featured} />
              <div className="featured-caption">
                <span className="eyebrow">DISCOVER THE LINEUP</span>
                <span>{featured.name}</span>
                <span className="featured-caption-note">
                  One stage. Endless possibility.
                </span>
              </div>
            </div>
          ) : (
            <div className="stage-placeholder" aria-hidden="true">
              <span>TH</span>
              <p>
                THE NEXT BIG MOMENT
                <br />
                STARTS HERE
              </p>
            </div>
          )}
          <span className="stage-side-note" aria-hidden="true">
            TALENT DESERVES TO BE SEEN
          </span>
        </div>
      </section>
      <div className="stage-band">
        <div className="container">
          <span>Extraordinary people.</span>
          <span aria-hidden="true">✦</span>
          <span>Unforgettable moments.</span>
          <span aria-hidden="true">✦</span>
          <span>A shared spotlight.</span>
        </div>
      </div>
      <section
        className="container section"
        aria-labelledby="competition-heading"
      >
        <div className="competition-overview">
          <p className="eyebrow">THE COMPETITION</p>
          <div>
            <h2 id="competition-heading">{competition.name}</h2>
            <p>
              {competition.description ||
                "A platform for remarkable talent to step into the spotlight. Explore this competition and get to know its contestants."}
            </p>
          </div>
          <span className="overview-star" aria-hidden="true">
            ✳
          </span>
        </div>
      </section>
      <section
        className="container section lineup-section"
        aria-label="Contestant preview"
      >
        <SectionHeading
          eyebrow="THE PEOPLE BEHIND THE MOMENT"
          title="Meet the talent."
        >
          <ButtonLink href="/contestants" secondary>
            Explore the lineup <Arrow />
          </ButtonLink>
        </SectionHeading>
        {contestants.length ? (
          <div className="contestant-grid">
            {contestants.slice(0, 3).map((contestant) => (
              <ContestantCard key={contestant.id} contestant={contestant} />
            ))}
          </div>
        ) : (
          <EmptyState title="The lineup is on its way">
            Contestants will appear here when they are announced. Watch this
            space.
          </EmptyState>
        )}
      </section>
      <section className="container closing-section">
        <span className="eyebrow">DISCOVERY STARTS WITH YOU</span>
        <h2>
          Your next favourite
          <br />
          is waiting in the <em>spotlight.</em>
        </h2>
        <ButtonLink href="/contestants">
          Find your favourite <Arrow />
        </ButtonLink>
      </section>
    </>
  );
}
