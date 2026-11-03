import Link from "next/link";
export default function MissingContestant() { return <div className="container state-section"><h1>Contestant unavailable</h1><p>This contestant is not available in the current lineup.</p><Link href="/contestants">Explore contestants</Link></div>; }
