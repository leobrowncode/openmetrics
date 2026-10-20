import type { Metadata } from "next";
import { ShareExchange } from "./ShareExchange";

export const metadata: Metadata = {
  title: "Reporting Meta Ads",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function SharePage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <ShareExchange />
    </main>
  );
}
