import { notFound } from "next/navigation";

import StairWalkConfirmationFixture from "./StairWalkConfirmationFixture";

export default function StairWalkConfirmationFixturePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <StairWalkConfirmationFixture />;
}
