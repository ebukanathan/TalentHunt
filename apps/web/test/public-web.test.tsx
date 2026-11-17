import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createApiClient, ApiError } from "../src/lib/api/client";
import type { Competition, Contestant } from "../src/lib/api/schemas";
import { formatKobo, formatVotes } from "../src/lib/format";
import { getVotingState } from "../src/lib/voting";
import { ContestantCard, ContestantPortrait } from "../src/components/contestant-card";
import { CompetitionStatus } from "../src/components/competition-status";
import { NoCompetition, PageSkeleton, UnavailableState } from "../src/components/page-states";
import { NavigationLinks } from "../src/components/site-navigation";
import { managedPortraitOrigin, portraitSource } from "../src/lib/portraits";
import { ContestantProfile } from "../src/components/contestant-profile";

const competition: Competition = {
  id: "show-1",
  name: "Test show",
  slug: "test-show",
  description: null,
  status: "DRAFT",
  votingOpens: null,
  votingCloses: null,
  currency: "NGN",
};
const contestant: Contestant = {
  id: "person-1",
  competitionId: competition.id,
  number: "001",
  name: "Test Performer",
  slug: "test-performer",
  bio: null,
  imageUrl: null,
  totalVotes: "9007199254740993",
  videos: [],
};
function respond(data: unknown, status = 200) {
  return (async () =>
    Response.json(
      status === 200
        ? { status: "success", data }
        : { message: "private database/provider error" },
      { status },
    )) as typeof fetch;
}
function code(expected: string) {
  return (error: unknown) =>
    error instanceof ApiError && error.code === expected;
}

test("typed client reads competition, contestants, detail and packages without losing vote precision", async () => {
  const seen: string[] = [];
  const fetcher = (async (input, init) => {
    const url = String(input);
    seen.push(url);
    assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal);
    const data = url.endsWith("/competition")
      ? competition
      : url.endsWith("/contestants")
        ? [contestant]
        : url.includes("/contestants/")
          ? contestant
          : [
              {
                id: "package-1",
                competitionId: competition.id,
                name: "Support",
                voteCount: 10,
                priceKobo: 100001,
                currency: "NGN",
              },
            ];
    return Response.json({ status: "success", data });
  }) as typeof fetch;
  const api = createApiClient("http://localhost:4000/api/v1/", { fetcher });
  assert.equal((await api.competition())?.id, competition.id);
  assert.equal((await api.contestants())[0].totalVotes, "9007199254740993");
  assert.equal((await api.contestant(contestant.id)).number, "001");
  assert.equal((await api.votePackages())[0].priceKobo, 100001);
  assert.equal(seen.length, 4);
  assert.ok(seen.every((url) => !url.includes("v1//")));
});

test("empty lists and absent competition are valid, while missing profile is not-found", async () => {
  assert.deepEqual(
    await createApiClient("http://api.test", {
      fetcher: respond([]),
    }).contestants(),
    [],
  );
  assert.deepEqual(
    await createApiClient("http://api.test", {
      fetcher: respond([]),
    }).votePackages(),
    [],
  );
  const api = createApiClient("http://api.test", {
    fetcher: respond(null, 404),
  });
  assert.equal(await api.competition(), null);
  await assert.rejects(api.contestant("missing"), code("NOT_FOUND"));
});

test("invalid IDs are rejected before a network request", async () => {
  let calls = 0;
  const api = createApiClient("http://api.test", {
    fetcher: (async () => {
      calls++;
      return Response.json({});
    }) as typeof fetch,
  });
  for (const id of ["", "../private", "has space", "x".repeat(129)])
    await assert.rejects(api.contestant(id), code("BAD_REQUEST"));
  assert.equal(calls, 0);
});

test("non-success HTTP, network and timeout errors are sanitized", async () => {
  for (const status of [400, 500, 503]) {
    const api = createApiClient("http://api.test", {
      fetcher: respond(null, status),
    });
    await assert.rejects(
      api.contestants(),
      (error) =>
        code(status === 400 ? "BAD_REQUEST" : "UNAVAILABLE")(error) &&
        !(error as Error).message.includes("private"),
    );
  }
  const api = createApiClient("http://api.test", {
    fetcher: (async () => {
      throw new Error("secret host");
    }) as typeof fetch,
  });
  await assert.rejects(api.contestants(), code("UNAVAILABLE"));
  const slow = createApiClient("http://api.test", {
    timeoutMs: 1,
    fetcher: (async (_input, init) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.equal(init?.signal?.aborted, true);
      throw new Error("request aborted");
    }) as typeof fetch,
  });
  await assert.rejects(slow.contestants(), code("UNAVAILABLE"));
});

test("invalid payloads and unsafe numeric vote totals cannot enter the UI", async () => {
  for (const totalVotes of [9007199254740992, "1.5", "-1", "01"]) {
    const api = createApiClient("http://api.test", {
      fetcher: respond([{ ...contestant, totalVotes }]),
    });
    await assert.rejects(api.contestants(), code("INVALID_RESPONSE"));
  }
  const malformed = createApiClient("http://api.test", {
    fetcher: (async () => new Response("not JSON")) as typeof fetch,
  });
  await assert.rejects(malformed.contestants(), code("INVALID_RESPONSE"));
  const wrongEnvelope = createApiClient("http://api.test", {
    fetcher: (async () =>
      Response.json({ status: "error", data: [contestant] })) as typeof fetch,
  });
  await assert.rejects(wrongEnvelope.contestants(), code("INVALID_RESPONSE"));
});

test("unknown private fields are stripped and invalid package amounts are rejected", async () => {
  const api = createApiClient("http://api.test", {
    fetcher: respond([{ ...contestant, contactEmail: "private@example.test" }]),
  });
  assert.equal("contactEmail" in (await api.contestants())[0], false);
  for (const priceKobo of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const invalid = createApiClient("http://api.test", {
      fetcher: respond([
        {
          id: "package-1",
          competitionId: competition.id,
          name: "Package",
          voteCount: 10,
          priceKobo,
          currency: "NGN",
        },
      ]),
    });
    await assert.rejects(invalid.votePackages(), code("INVALID_RESPONSE"));
  }
});

test("invalid API configuration is rejected without disclosing input", () => {
  for (const base of [
    "",
    "file:///tmp/api",
    "https://user:secret@api.test",
    "https://api.test?token=secret",
  ])
    assert.throws(() => createApiClient(base), code("CONFIGURATION"));
});

test("vote totals format exactly beyond Number.MAX_SAFE_INTEGER", () => {
  assert.equal(formatVotes("9007199254740993"), "9,007,199,254,740,993");
  assert.equal(formatVotes("0"), "0");
  for (const value of ["1.5", "-1", "01", ""])
    assert.throws(() => formatVotes(value), RangeError);
});

test("currency preserves every kobo including one kobo and the largest safe integer", () => {
  assert.equal(formatKobo(100001), "₦1,000.01");
  assert.equal(formatKobo(1), "₦0.01");
  assert.equal(formatKobo(0), "₦0.00");
  assert.equal(formatKobo(Number.MAX_SAFE_INTEGER), "₦90,071,992,547,409.91");
  for (const value of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => formatKobo(value), RangeError);
});

test("only OPEN competitions inside their optional date bounds are eligible", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  for (const status of ["DRAFT", "SCHEDULED", "CLOSED", "COMPLETED"] as const)
    assert.equal(getVotingState({ ...competition, status }, now).open, false);
  const open: Competition = {
    ...competition,
    status: "OPEN",
    votingOpens: "2026-10-22T12:00:00Z",
    votingCloses: "2026-10-22T13:00:00Z",
  };
  assert.equal(getVotingState(open, now).open, true);
  assert.equal(
    getVotingState(open, new Date("2026-10-22T11:59:59Z")).open,
    false,
  );
  assert.equal(getVotingState(open, new Date(open.votingCloses!)).open, false);
  assert.equal(
    getVotingState({ ...competition, status: "OPEN" }, now).open,
    true,
  );
  assert.equal(
    getVotingState({ ...open, votingCloses: open.votingOpens }, now).open,
    false,
  );
  assert.equal(
    getVotingState({ ...open, votingOpens: "invalid" }, now).open,
    false,
  );
  assert.equal(getVotingState(open, new Date(NaN)).open, false);
});

test("cards show real names, numbers, exact totals and accessible missing-image states", () => {
  const html = renderToStaticMarkup(<ContestantCard contestant={contestant} />);
  assert.ok(html.includes("Test Performer"));
  assert.ok(html.includes("NO. 001"));
  assert.ok(html.includes("9,007,199,254,740,993"));
  assert.ok(html.includes("Photograph unavailable for Test Performer"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes('href="/contestants/person-1"'));
  const unsafe = renderToStaticMarkup(
    <ContestantCard
      contestant={{ ...contestant, imageUrl: "javascript:alert(1)" }}
    />,
  );
  assert.ok(!unsafe.includes("<img"));
});

test("empty, upstream-error and draft voting UI have honest public messages", () => {
  assert.ok(
    renderToStaticMarkup(<NoCompetition />).includes(
      "The stage is being prepared",
    ),
  );
  assert.ok(renderToStaticMarkup(<UnavailableState />).includes("Try again"));
  const html = renderToStaticMarkup(
    <CompetitionStatus competition={competition} />,
  );
  assert.ok(html.includes("Voting not open"));
  assert.ok(!html.includes("Pay now"));
});

test("an expired scheduled window is closed and full-page states have a main heading", () => {
  assert.equal(
    getVotingState(
      {
        ...competition,
        status: "SCHEDULED",
        votingCloses: "2026-10-22T10:00:00Z",
      },
      new Date("2026-10-22T11:00:00Z"),
    ).label,
    "Voting closed",
  );
  assert.ok(renderToStaticMarkup(<NoCompetition />).includes("<h1>"));
  assert.ok(renderToStaticMarkup(<UnavailableState />).includes("<h1>"));
});

test("navigation identifies the current page without marking a profile as the listing page", () => {
  const listing = renderToStaticMarkup(<NavigationLinks pathname="/contestants" />);
  assert.equal((listing.match(/aria-current="page"/g) || []).length, 1);
  assert.match(listing, /<a(?=[^>]*href="\/contestants")(?=[^>]*aria-current="page")[^>]*>/);
  const profile = renderToStaticMarkup(<NavigationLinks pathname="/contestants/person-1" />);
  assert.ok(!profile.includes("aria-current"));
  assert.ok(profile.includes('class="is-current-section"'));
  assert.ok(profile.includes('href="/leaderboard"'));
});

test("route loading states announce the requested content and hide decorative skeletons", () => {
  for (const [kind, label] of [["profile", "contestant profile"], ["leaderboard", "leaderboard"], ["selection", "vote packages"]] as const) {
    const html = renderToStaticMarkup(<PageSkeleton kind={kind} />);
    assert.ok(html.includes(`aria-label="Loading ${label}"`));
    assert.ok(html.includes('aria-hidden="true"'));
    assert.ok(html.includes('role="status"'));
  }
});

test("only managed portrait objects on the configured exact origin are optimised", () => {
  const origin = "https://project.supabase.co";
  const image = `${origin}/storage/v1/object/public/contestant-images/contestants/show/person/12345678-1234-1234-1234-123456789abc.webp`;
  assert.equal(portraitSource(image, origin)?.optimized, true);
  for (const source of [image.replace("project.supabase.co", "project.supabase.co.evil.test"), image.replace("contestant-images/", "private/"), `${image}?token=value`, `${image}#fragment`, image.replace(".webp", ".svg"), image.replace("/show/", "/show%2fother/"), "https://legacy.test/photo.jpg"]) {
    assert.equal(portraitSource(source, origin)?.optimized, false);
  }
  assert.equal(portraitSource(image, "")?.optimized, false);
  for (const source of ["javascript:alert(1)", "http://legacy.test/photo.jpg", "https://user:secret@legacy.test/photo.jpg", "not a URL"]) assert.equal(portraitSource(source, origin), undefined);
  for (const value of ["http://project.supabase.co", `${origin}/bucket`, `${origin}?token=value`, "https://*.supabase.co", "https://127.0.0.1", "https://user:secret@project.supabase.co", "https://project.supabase.co:444"]) assert.equal(managedPortraitOrigin(value), undefined);
});

test("portrait variants keep legacy images browser-only and distinguish above-fold loading", () => {
  const person = { ...contestant, imageUrl: "https://legacy.test/photo.jpg" };
  const card = renderToStaticMarkup(<ContestantPortrait contestant={person} />);
  assert.ok(card.includes('loading="lazy"'));
  assert.ok(card.includes('src="https://legacy.test/photo.jpg"'));
  assert.ok(!card.includes("/_next/image"));
  const profile = renderToStaticMarkup(<ContestantPortrait contestant={person} variant="profile" eager />);
  assert.ok(profile.includes('loading="eager"'));
  assert.ok(profile.includes('fetchPriority="high"'));
  assert.ok(profile.includes('alt="Portrait of Test Performer"'));
  const thumbnail = renderToStaticMarkup(<ContestantPortrait contestant={person} variant="thumbnail" />);
  assert.ok(thumbnail.includes('width="48"'));
});

test("profiles link to package selection only during an eligible window and preserve hidden totals", () => {
  const open = { ...competition, status: "OPEN" as const };
  const hidden = { ...contestant };
  delete hidden.totalVotes;
  const html = renderToStaticMarkup(<ContestantProfile contestant={hidden} competition={open} />);
  assert.ok(html.includes('href="/contestants/person-1/vote"'));
  assert.ok(html.includes('href="/leaderboard"'));
  assert.ok(!html.includes("9,007,199,254,740,993"));
  assert.ok(!html.includes("Performance Videos"));
  for (const state of [competition, { ...competition, status: "COMPLETED" as const }, { ...open, votingCloses: "2000-01-01T00:00:00Z" }]) {
    const page = renderToStaticMarkup(<ContestantProfile contestant={contestant} competition={state} />);
    assert.ok(!page.includes('href="/contestants/person-1/vote"'));
    assert.ok(page.includes("This contestant’s story is coming soon."));
  }
});
